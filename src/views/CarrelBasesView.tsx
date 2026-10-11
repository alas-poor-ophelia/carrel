/* Carrel as a custom Bases view. A `.base` file can switch to the "Carrel" view
   and render its filtered notes as the column-balancing typed-card board. We
   hand the bare CarrelIndex the FILES from the Bases query and let it parse each
   note exactly like the main pane (real types, flowcharts, colors, rules). It is
   driven by a hidden, persisted "bases" nook so grouping/sort/pins survive
   across sessions (the nook id is stored in the view's own config). How the
   board LOOKS is configured where Bases keeps a view's settings — the view's
   options — and stored in the `.base` file with the view.

   Gated behind a feature-detect on registerBasesView, so older Obsidian builds
   (no Bases) simply never register the view — no hard dependency. */
import {
  BasesView,
  type BasesAllOptions,
  type BasesPropertyOption,
  type BasesViewConfig,
  type QueryController,
} from "obsidian";
import { render } from "preact";
import { signal } from "@preact/signals";
import type CarrelPlugin from "../main";
import { CarrelIndex } from "../rules/index";
import type { BasesDocMeta } from "../rules/model";
import {
  COLUMN_CHOICES,
  COVER_ASPECT_RANGE,
  COVER_FIT_CHOICES,
  COVER_MAX_HEIGHT_RANGE,
  DEFAULT_TWEAKS,
  DENSITY_CHOICES,
  THEME_CHOICES,
  toColumnCount,
} from "../types/data";
import type { BoardDisplay } from "../types/data";
import { PaneBoard } from "../components/pane/PaneBoard";
import { genId } from "../util/id";

const NOOK_ID_KEY = "carrelNookId";

/** View options: which Bases property — a note property, a formula, a file
 *  property — supplies each of Carrel's per-note inputs. Unset options leave
 *  the note's front matter in charge. */
const PROP_OPTIONS = [
  { key: "carrelImage", displayName: "Image property", store: "imageProp" },
  { key: "carrelIconImage", displayName: "Icon image property", store: "iconImageProp" },
  { key: "carrelType", displayName: "Type property", store: "typeProp" },
  { key: "carrelCategory", displayName: "Category property", store: "categoryProp" },
] as const;

function propOption(key: (typeof PROP_OPTIONS)[number]["key"]): BasesPropertyOption {
  const o = PROP_OPTIONS.find((p) => p.key === key);
  return { type: "property", key, displayName: o?.displayName ?? key, placeholder: "Note front matter" };
}

/** The view's options menu. Display settings sit beside the property pickers,
 *  named as Bases' own layouts name theirs (Image fit, Image aspect ratio). */
function viewOptions(plugin: CarrelPlugin, config: BasesViewConfig): BasesAllOptions[] {
  // Until a view sets an option, its board uses the hidden nook's value (where
  // these settings lived before they moved here) — so that is the default shown.
  const nook = plugin.store.nooks().find((n) => n.id === config.get(NOOK_ID_KEY));
  const base: BoardDisplay = { ...DEFAULT_TWEAKS, theme: nook?.theme ?? "obsidian", ...nook?.tweaks };
  return [
    {
      type: "group",
      displayName: "Display",
      items: [
        { type: "dropdown", key: "carrelTheme", displayName: "Theme", default: base.theme, options: THEME_CHOICES },
        { type: "dropdown", key: "carrelDensity", displayName: "Density", default: base.density, options: DENSITY_CHOICES },
        { type: "dropdown", key: "carrelColumns", displayName: "Columns", default: String(base.columns), options: COLUMN_CHOICES },
        { type: "toggle", key: "carrelShowRail", displayName: "Pinned rail", default: base.showRail },
        { type: "toggle", key: "carrelShowBadges", displayName: "Type badges & meta", default: base.showBadges },
        { type: "toggle", key: "carrelAnimations", displayName: "Reflow animation", default: base.animations },
      ],
    },
    {
      type: "group",
      displayName: "Images",
      items: [
        propOption("carrelImage"),
        propOption("carrelIconImage"),
        { type: "dropdown", key: "carrelImageFit", displayName: "Image fit", default: base.coverFit, options: COVER_FIT_CHOICES },
        { type: "slider", key: "carrelImageAspect", displayName: "Image aspect ratio", default: base.coverAspect, ...COVER_ASPECT_RANGE },
        { type: "slider", key: "carrelImageMaxHeight", displayName: "Image max height", default: base.coverMaxHeight, ...COVER_MAX_HEIGHT_RANGE },
        { type: "toggle", key: "carrelCoverPreview", displayName: "Preview under cover", default: base.coverPreview },
      ],
    },
    {
      type: "group",
      displayName: "Properties",
      items: [propOption("carrelType"), propOption("carrelCategory")],
    },
  ];
}

/** The display settings this view has set in its options. An option the user
 *  hasn't touched (or a value that isn't one of its choices) is left out, so
 *  the nook's value shows through. */
function readDisplay(config: BasesViewConfig): Partial<BoardDisplay> {
  const choice = <T extends string>(key: string, choices: Record<T, string>): T | undefined => {
    // A numeric choice ("2" columns) can come back from the file's YAML as a number.
    const raw = config.get(key);
    const v = typeof raw === "number" ? String(raw) : raw;
    return typeof v === "string" && Object.prototype.hasOwnProperty.call(choices, v) ? (v as T) : undefined;
  };
  const num = (key: string, range: { min: number; max: number }): number | undefined => {
    const v = config.get(key);
    return typeof v === "number" && Number.isFinite(v) ? Math.min(range.max, Math.max(range.min, v)) : undefined;
  };
  const bool = (key: string): boolean | undefined => {
    const v = config.get(key);
    return typeof v === "boolean" ? v : undefined;
  };
  const columns = choice("carrelColumns", COLUMN_CHOICES);
  const all: { [K in keyof BoardDisplay]: BoardDisplay[K] | undefined } = {
    theme: choice("carrelTheme", THEME_CHOICES),
    density: choice("carrelDensity", DENSITY_CHOICES),
    columns: columns != null ? toColumnCount(columns) : undefined,
    showRail: bool("carrelShowRail"),
    showBadges: bool("carrelShowBadges"),
    animations: bool("carrelAnimations"),
    coverFit: choice("carrelImageFit", COVER_FIT_CHOICES),
    coverAspect: num("carrelImageAspect", COVER_ASPECT_RANGE),
    coverMaxHeight: num("carrelImageMaxHeight", COVER_MAX_HEIGHT_RANGE),
    coverPreview: bool("carrelCoverPreview"),
  };
  return Object.fromEntries(Object.entries(all).filter(([, v]) => v !== undefined));
}

class CarrelBasesView extends BasesView {
  readonly type = "carrel";
  private readonly index: CarrelIndex;
  private readonly display = signal<Partial<BoardDisplay>>({});
  private root: HTMLElement | null = null;
  private rendered = false;
  private nookId = "";

  constructor(
    controller: QueryController,
    containerEl: HTMLElement,
    private readonly plugin: CarrelPlugin
  ) {
    super(controller);
    this.index = new CarrelIndex(plugin);
    // Mount the (still empty) root IMMEDIATELY. Obsidian hides an embedded
    // Bases view whose container is `:empty` (`.bases-embed .bases-view:empty
    // { display: none }`), and its query loop waits for the container to be
    // shown before it processes a single file — so a view that builds no DOM
    // until its first onDataUpdated() deadlocks inside a note embed: empty →
    // hidden → never queried → never rendered. The board itself still waits
    // for the first data (config is only attached after construction).
    // MUST carry `carrel-pane-root` — ALL of Carrel's CSS (tokens, variables,
    // pane layout/columns, block + icon sizing) is scoped to that root class.
    // Without it the board renders unstyled (giant SVGs, no columns).
    containerEl.empty();
    this.root = containerEl.createDiv({ cls: "carrel-pane-root carrel-bases-root" });
  }

  onunload(): void {
    if (this.root) {
      if (this.rendered) render(null, this.root);
      this.root.remove();
      this.root = null;
      this.rendered = false;
    }
  }

  onDataUpdated(): void {
    // Lazily bind a persisted nook for this .base view — the id lives in the
    // view's own config, so the same board settings come back next session.
    if (!this.nookId) {
      const stored = this.config.get(NOOK_ID_KEY);
      const id = typeof stored === "string" && stored ? stored : genId();
      // Assign BEFORE config.set: a config write re-fires onDataUpdated, and if
      // persistence isn't visible synchronously this guard is the only thing
      // stopping an unbounded re-entrant id-regeneration loop.
      this.nookId = id;
      this.plugin.store.ensureBasesNook(id, this.config.name);
      if (id !== stored) this.config.set(NOOK_ID_KEY, id);
    }

    // A change in the view's options arrives here too; hand the board its new
    // display settings only when they differ, so plain data updates don't
    // re-render it twice.
    const display = readDisplay(this.config);
    if (JSON.stringify(display) !== JSON.stringify(this.display.value)) this.display.value = display;

    // Parse every note in the Bases result set into a real Carrel card. Async;
    // the docs signal updates when it resolves and the board re-renders.
    // The engine has already applied the view's filters, sort, limit and
    // Group by (`data.data` is presorted; `groupedData` is grouped) and
    // evaluated its formulas — Carrel carries that decision onto each doc and
    // renders it as delivered (see BasesDocMeta); it never re-sorts a base.
    const order = new Map<string, number>();
    this.data.data.forEach((e, i) => order.set(e.file.path, i));
    // Carrel's per-note inputs sourced from the base: each configured option
    // names a Bases property id (formula.x / note.x / file.x); the engine has
    // already evaluated it per entry, so we only read the value's text. A
    // `link()` prints as `[[path]]`, an `image()` as `![[path]]` — both shapes
    // the front-matter image reader accepts as-is.
    const sources = PROP_OPTIONS.flatMap((o) => {
      const pid = this.config.getAsPropertyId(o.key);
      return pid != null ? [{ pid, name: this.plugin.store[o.store]() }] : [];
    });
    const meta = new Map<string, BasesDocMeta>();
    this.data.groupedData.forEach((g, gi) => {
      const group = g.hasKey() && g.key ? g.key.toString() : "";
      for (const e of g.entries) {
        let props: Record<string, string> | undefined;
        for (const s of sources) {
          const val = e.getValue(s.pid);
          if (val && val.isTruthy()) (props ??= {})[s.name] = val.toString();
        }
        meta.set(e.file.path, { order: order.get(e.file.path) ?? order.size, group, groupIndex: gi, props });
      }
    });
    void this.index.indexFiles(this.data.data.map((e) => e.file), meta);
    // Dev tooling: let the MCP bridge reach the live view (formula probes).
    if (window.__carrel) window.__carrel.lastBasesView = this;

    if (this.root && !this.rendered) {
      this.rendered = true;
      render(
        <PaneBoard plugin={this.plugin} boardNookId={this.nookId} index={this.index} display={this.display} />,
        this.root
      );
    }
  }
}

/** Register the "carrel" Bases view, if this Obsidian build supports Bases. */
export function registerCarrelBasesView(plugin: CarrelPlugin): void {
  if (typeof plugin.registerBasesView !== "function") return;
  plugin.registerBasesView("carrel", {
    name: "Carrel",
    icon: "book-open",
    factory: (controller, containerEl) => new CarrelBasesView(controller, containerEl, plugin),
    options: (config) => viewOptions(plugin, config),
  });
}
