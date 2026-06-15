import { Plugin, WorkspaceLeaf } from "obsidian";
import { installBridge, removeBridge } from "./bridge/mcp-bridge";
import { VIEW_TYPE_CARREL_PANE } from "./constants";
import { CarrelApiImpl } from "./api";
import type { CarrelApi } from "./types/api";
import { DEFAULT_DATA, type CarrelData } from "./types/data";
import { PaneView } from "./views/PaneView";

export default class CarrelPlugin extends Plugin {
  /** Persisted nooks + global categories. */
  data!: CarrelData;
  /** Public, typed API another plugin consumes (see src/types/api.ts). */
  api!: CarrelApi;

  async onload(): Promise<void> {
    this.data = { ...DEFAULT_DATA, ...((await this.loadData()) as Partial<CarrelData> | null) };
    this.api = new CarrelApiImpl(this);

    this.registerView(VIEW_TYPE_CARREL_PANE, (leaf) => new PaneView(leaf, this));

    this.addRibbonIcon("book-open", "Open Carrel", () => {
      void this.activatePaneView();
    });

    this.addCommand({
      id: "open-pane",
      name: "Open Carrel pane",
      callback: () => void this.activatePaneView(),
    });

    // Let the Style Settings plugin (if installed) scan our styles.css for the
    // `/* @settings */` block once our CSS is in the DOM.
    this.app.workspace.onLayoutReady(() => {
      this.app.workspace.trigger("parse-style-settings");
    });

    installBridge(this);
  }

  onunload(): void {
    removeBridge();
  }

  /** Open (or reveal) the Carrel full pane in the main workspace. */
  async activatePaneView(): Promise<void> {
    const { workspace } = this.app;
    let leaf: WorkspaceLeaf | null =
      workspace.getLeavesOfType(VIEW_TYPE_CARREL_PANE)[0] ?? null;
    if (!leaf) {
      leaf = workspace.getLeaf("tab");
      await leaf.setViewState({ type: VIEW_TYPE_CARREL_PANE, active: true });
    }
    await workspace.revealLeaf(leaf);
  }
}
