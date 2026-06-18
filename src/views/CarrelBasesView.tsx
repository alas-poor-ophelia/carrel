/* Carrel as a custom Bases view. A `.base` file can switch to the "Carrel" view
   and render its filtered notes as the column-balancing typed-card board. The
   board is fed by a bare CarrelIndex whose docs signal we push the adapted
   entries into (no folder watching), and it is driven by a hidden, persisted
   "bases" nook so grouping/sort/pins/theme are fully controllable and survive
   across sessions (the nook id is stored in the view's own config).

   Gated behind a feature-detect on registerBasesView, so older Obsidian builds
   (no Bases) simply never register the view — no hard dependency. */
import { BasesView, type QueryController } from "obsidian";
import { render } from "preact";
import type CarrelPlugin from "../main";
import { CarrelIndex } from "../rules/index";
import { PaneBoard } from "../components/pane/PaneBoard";
import {
  basesToRuleDocs,
  TITLE_PROPERTY_KEY,
  TYPE_PROPERTY_KEY,
} from "../adapters/basesToRuleDocs";
import { genId } from "../util/id";

const NOOK_ID_KEY = "carrelNookId";

class CarrelBasesView extends BasesView {
  readonly type = "carrel";
  private readonly index: CarrelIndex;
  private root: HTMLElement | null = null;
  private nookId = "";

  constructor(
    controller: QueryController,
    private readonly containerEl: HTMLElement,
    private readonly plugin: CarrelPlugin
  ) {
    super(controller);
    this.index = new CarrelIndex(plugin);
  }

  onunload(): void {
    if (this.root) {
      render(null, this.root);
      this.root.remove();
      this.root = null;
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

    this.index.docs.value = basesToRuleDocs(
      this.data.data,
      this.config,
      this.plugin.store.customTypes()
    );

    if (!this.root) {
      this.containerEl.empty();
      // MUST carry `carrel-pane-root` — ALL of Carrel's CSS (tokens, variables,
      // pane layout/columns, block + icon sizing) is scoped to that root class.
      // Without it the board renders unstyled (giant SVGs, no columns).
      this.root = this.containerEl.createDiv({ cls: "carrel-pane-root carrel-bases-root" });
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
        type: "property",
        key: TYPE_PROPERTY_KEY,
        displayName: "Card type property",
        placeholder: "(reference)",
      },
      {
        type: "property",
        key: TITLE_PROPERTY_KEY,
        displayName: "Card title property",
        placeholder: "(file name)",
      },
    ],
  });
}
