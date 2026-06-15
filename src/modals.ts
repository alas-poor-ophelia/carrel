import { Modal, Notice, Setting, TFolder } from "obsidian";
import type CarrelPlugin from "./main";
import type { Nook, NookTweaks } from "./types/data";

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

/** Edit the active nook: name, per-nook theme + density + tweak toggles, and a
 *  delete affordance. Changes write through the store and reflect live in the
 *  open pane behind the modal. */
export class NookSettingsModal extends Modal {
  constructor(private readonly plugin: CarrelPlugin, private readonly nookId: string) {
    super(plugin.app);
  }

  private nook(): Nook | undefined {
    return this.plugin.store.nooks().find((n) => n.id === this.nookId);
  }

  private setTweak<K extends keyof NookTweaks>(key: K, value: NookTweaks[K]): void {
    const nook = this.nook();
    if (!nook) return;
    this.plugin.store.updateNook(nook.id, { tweaks: { ...nook.tweaks, [key]: value } });
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("carrel-modal");
    const nook = this.nook();
    if (!nook) {
      this.close();
      return;
    }
    contentEl.createEl("h3", { text: "Nook settings", cls: "cr-modal__title" });

    new Setting(contentEl).setName("Name").addText((t) =>
      t.setValue(nook.name).onChange((v) => this.plugin.store.updateNook(nook.id, { name: v }))
    );

    new Setting(contentEl)
      .setName("Theme")
      .setDesc("Character Sheet uses the MiniSheet brand; Obsidian inherits your active theme.")
      .addDropdown((d) =>
        d
          .addOption("brand", "Character Sheet")
          .addOption("obsidian", "Obsidian")
          .setValue(nook.theme)
          .onChange((v) => this.plugin.store.updateNook(nook.id, { theme: v as Nook["theme"] }))
      );

    new Setting(contentEl).setName("Density").addDropdown((d) =>
      d
        .addOption("compact", "Compact")
        .addOption("regular", "Regular")
        .addOption("comfy", "Comfortable")
        .setValue(nook.tweaks.density)
        .onChange((v) => this.setTweak("density", v as NookTweaks["density"]))
    );

    new Setting(contentEl).setName("Pinned rail").addToggle((t) =>
      t.setValue(nook.tweaks.showRail).onChange((v) => this.setTweak("showRail", v))
    );
    new Setting(contentEl).setName("Type badges & meta").addToggle((t) =>
      t.setValue(nook.tweaks.showBadges).onChange((v) => this.setTweak("showBadges", v))
    );
    new Setting(contentEl).setName("Reflow animation").addToggle((t) =>
      t.setValue(nook.tweaks.animations).onChange((v) => this.setTweak("animations", v))
    );

    new Setting(contentEl)
      .setName("Delete this nook")
      .setDesc("Removes the nook (notes are untouched).")
      .addButton((b) =>
        b
          .setButtonText("Delete")
          .setWarning()
          .onClick(() => {
            this.plugin.store.deleteNook(nook.id);
            this.close();
          })
      );
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
