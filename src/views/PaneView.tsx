import { ItemView, type WorkspaceLeaf } from "obsidian";
import { render } from "preact";
import { PaneBoard } from "../components/pane/PaneBoard";
import { VIEW_TYPE_CARREL_PANE } from "../constants";
import type CarrelPlugin from "../main";

export class PaneView extends ItemView {
  private plugin: CarrelPlugin;
  private root: HTMLElement | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: CarrelPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE_CARREL_PANE;
  }

  getDisplayText(): string {
    return "Carrel";
  }

  getIcon(): string {
    return "book-open";
  }

  async onOpen(): Promise<void> {
    this.root = this.contentEl.createDiv({ cls: "carrel-pane-root" });
    render(<PaneBoard plugin={this.plugin} />, this.root);
  }

  async onClose(): Promise<void> {
    if (this.root) {
      render(null, this.root);
      this.root = null;
    }
  }
}
