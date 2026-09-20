/* Carrel as a custom Bases view. A `.base` file can switch to the "Carrel" view
   and render its filtered notes as the column-balancing typed-card board. We
   hand the bare CarrelIndex the FILES from the Bases query and let it parse each
   note exactly like the main pane (real types, flowcharts, colors, rules). It is
   driven by a hidden, persisted "bases" nook so grouping/sort/pins/theme survive
   across sessions (the nook id is stored in the view's own config).

   Gated behind a feature-detect on registerBasesView, so older Obsidian builds
   (no Bases) simply never register the view — no hard dependency. */
import { BasesView, type QueryController } from "obsidian";
import { render } from "preact";
import type CarrelPlugin from "../main";
import { CarrelIndex } from "../rules/index";
import type { BasesDocMeta } from "../rules/model";
import { PaneBoard } from "../components/pane/PaneBoard";
import { genId } from "../util/id";

const NOOK_ID_KEY = "carrelNookId";

/** View options (the base's own "Carrel" settings group): which Bases property
 *  — a note property, a formula, a file property — supplies each of Carrel's
 *  per-note inputs. Unset options leave the note's front matter in charge. */
const PROP_OPTIONS = [
  { key: "carrelImage", displayName: "Image property", store: "imageProp" },
  { key: "carrelIconImage", displayName: "Icon image property", store: "iconImageProp" },
  { key: "carrelType", displayName: "Type property", store: "typeProp" },
  { key: "carrelCategory", displayName: "Category property", store: "categoryProp" },
] as const;

class CarrelBasesView extends BasesView {
  readonly type = "carrel";
  private readonly index: CarrelIndex;
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
        <PaneBoard plugin={this.plugin} boardNookId={this.nookId} index={this.index} />,
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
    options: () => [
      {
        type: "group",
        displayName: "Carrel",
        items: PROP_OPTIONS.map((o) => ({
          type: "property" as const,
          key: o.key,
          displayName: o.displayName,
          placeholder: "Note front matter",
        })),
      },
    ],
  });
}
