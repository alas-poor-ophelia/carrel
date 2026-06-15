import { Modal, Notice, Setting, TFolder } from "obsidian";
import type CarrelPlugin from "./main";

/** Create a nook by naming it and selecting one or more source folders to
 *  index (the mass-import flow that replaces one-by-one note linking). */
export class CreateNookModal extends Modal {
  private name = "";
  private readonly selected = new Set<string>();

  constructor(private readonly plugin: CarrelPlugin) {
    super(plugin.app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("carrel-modal");
    contentEl.createEl("h3", { text: "Create nook", cls: "cr-modal__title" });

    new Setting(contentEl).setName("Name").addText((t) => {
      t.setPlaceholder("e.g. Combat rules");
      t.onChange((v) => (this.name = v));
      window.setTimeout(() => t.inputEl.focus(), 0);
    });

    contentEl.createEl("p", { text: "Index these folders:", cls: "cr-modal__hint" });
    const list = contentEl.createDiv({ cls: "cr-folderlist" });
    const folders = this.allFolders();
    if (!folders.length) {
      list.createEl("div", { text: "No folders in this vault.", cls: "cr-modal__empty" });
    }
    for (const f of folders) {
      const row = list.createEl("label", { cls: "cr-folderrow" });
      const cb = row.createEl("input", { type: "checkbox" });
      cb.addEventListener("change", () => {
        if (cb.checked) this.selected.add(f);
        else this.selected.delete(f);
      });
      row.createSpan({ text: f });
    }

    new Setting(contentEl).addButton((b) =>
      b
        .setButtonText("Create nook")
        .setCta()
        .onClick(() => this.create())
    );
  }

  private allFolders(): string[] {
    const out: string[] = [];
    for (const f of this.plugin.app.vault.getAllLoadedFiles()) {
      if (f instanceof TFolder && f.path && f.path !== "/") out.push(f.path);
    }
    return out.sort((a, b) => a.localeCompare(b));
  }

  private create(): void {
    const folders = [...this.selected];
    if (!folders.length) {
      new Notice("Pick at least one folder for the nook.");
      return;
    }
    this.plugin.store.createNook({ name: this.name, folders });
    this.close();
    void this.plugin.activatePaneView();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
