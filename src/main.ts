import { Plugin, WorkspaceLeaf } from "obsidian";
import { effect } from "@preact/signals";
import { installBridge, removeBridge } from "./bridge/mcp-bridge";
import { VIEW_TYPE_CARREL_PANE } from "./constants";
import { CarrelApiImpl } from "./api";
import type { CarrelApi } from "./types/api";
import { CarrelIndex } from "./rules/index";
import { CarrelStore } from "./state/store";
import { CreateNookModal, InsertNookBlockModal } from "./modals";
import { CarrelSettingTab } from "./settings";
import { PaneView } from "./views/PaneView";
import { registerInlineEmbed } from "./views/InlineEmbed";

export default class CarrelPlugin extends Plugin {
  /** Persisted nooks + global categories. */
  store!: CarrelStore;
  /** Public, typed API another plugin consumes (see src/types/api.ts). */
  api!: CarrelApi;
  /** Multi-folder note index, kept pointed at the active nook's folders. */
  index!: CarrelIndex;

  async onload(): Promise<void> {
    this.store = new CarrelStore(this);
    await this.store.load();
    this.api = new CarrelApiImpl(this);

    this.index = new CarrelIndex(this);
    this.index.init();
    // The index always reflects the active nook's folders. setFolders no-ops
    // when the folder set is unchanged, so pin/checklist edits don't rebuild.
    this.register(
      effect(() => {
        const nook = this.store.activeNook();
        this.index.setFolders(nook ? nook.folders : []);
      })
    );
    // Custom-type declarations change how notes resolve their `type:` and icon,
    // so re-index when the set changes. Guarded by array identity (other commits
    // keep the same reference) so routine pin/checklist edits don't rebuild.
    {
      let prevTypes = this.store.customTypes();
      this.register(
        effect(() => {
          const ct = this.store.customTypes();
          if (ct !== prevTypes) {
            prevTypes = ct;
            void this.index.rebuild();
          }
        })
      );
    }

    this.registerView(VIEW_TYPE_CARREL_PANE, (leaf) => new PaneView(leaf, this));

    this.addRibbonIcon("book-open", "Open Carrel", () => {
      void this.activatePaneView();
    });

    this.addCommand({
      id: "open-pane",
      name: "Open Carrel pane",
      callback: () => void this.activatePaneView(),
    });

    this.addCommand({
      id: "create-nook",
      name: "Create nook from folders",
      callback: () => new CreateNookModal(this).open(),
    });

    this.addCommand({
      id: "insert-carrel-block",
      name: "Insert Carrel block",
      editorCallback: (editor) => {
        new InsertNookBlockModal(this, (nook) => {
          editor.replaceSelection("```carrel\nnook: " + nook.id + "\n```\n");
        }).open();
      },
    });

    // The inline `carrel` codeblock renders one nook's cards + pins in a note.
    registerInlineEmbed(this);

    this.addSettingTab(new CarrelSettingTab(this));

    // Let the Style Settings plugin (if installed) scan our styles.css for the
    // `/* @settings */` block once our CSS is in the DOM.
    this.app.workspace.onLayoutReady(() => {
      this.app.workspace.trigger("parse-style-settings");
    });

    installBridge(this);
  }

  onunload(): void {
    removeBridge();
    void this.store.flush();
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
