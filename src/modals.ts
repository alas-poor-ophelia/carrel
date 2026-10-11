import { type App, FuzzySuggestModal, Modal, Notice, Setting } from "obsidian";
import type CarrelPlugin from "./main";
import {
  COLUMN_CHOICES,
  COVER_ASPECT_RANGE,
  COVER_FIT_CHOICES,
  COVER_MAX_HEIGHT_RANGE,
  DENSITY_CHOICES,
  THEME_CHOICES,
  toColumnCount,
} from "./types/data";
import type { ColumnCount, CoverFit, Nook, NookTweaks } from "./types/data";
import { listVaultFolders } from "./util/folders";

/** Create a nook by naming it and selecting one or more source folders to
 *  index (the mass-import flow that replaces one-by-one note linking). */
export class CreateNookModal extends Modal {
  private name = "";
  private readonly selected = new Set<string>();

  /** onCreated, when given, receives the new nook instead of the default
   *  behaviour (opening the pane) — used by the insert-block flow. */
  constructor(private readonly plugin: CarrelPlugin, private readonly onCreated?: (nook: Nook) => void) {
    super(plugin.app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("carrel-modal");
    contentEl.createEl("h3", { text: "Create nook", cls: "cr-modal__title" });

    new Setting(contentEl).setName("Name").addText((t) => {
      t.setPlaceholder("Combat rules");
      t.onChange((v) => (this.name = v));
      window.setTimeout(() => t.inputEl.focus(), 0);
    });

    contentEl.createEl("p", { text: "Index these folders:", cls: "cr-modal__hint" });
    const list = contentEl.createDiv({ cls: "cr-folderlist" });
    const folders = listVaultFolders(this.plugin.app);
    if (!folders.length) {
      list.createDiv({ text: "No folders in this vault.", cls: "cr-modal__empty" });
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

  private create(): void {
    const folders = [...this.selected];
    if (!folders.length) {
      new Notice("Pick at least one folder for the nook.");
      return;
    }
    const nook = this.plugin.store.createNook({ name: this.name, folders });
    this.close();
    if (this.onCreated) this.onCreated(nook);
    else void this.plugin.activatePaneView();
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
      .setDesc("Ember uses the warm brand palette; Obsidian inherits your active theme.")
      .addDropdown((d) =>
        d
          .addOptions(THEME_CHOICES)
          .setValue(nook.theme)
          .onChange((v) => this.plugin.store.updateNook(nook.id, { theme: v as Nook["theme"] }))
      );

    contentEl.createEl("p", { text: "Source folders — the notes this nook reads from:", cls: "cr-modal__hint" });
    const list = contentEl.createDiv({ cls: "cr-folderlist" });
    const selected = new Set(nook.folders);
    const folders = listVaultFolders(this.plugin.app);
    if (!folders.length) {
      list.createDiv({ text: "No folders in this vault.", cls: "cr-modal__empty" });
    }
    for (const f of folders) {
      const row = list.createEl("label", { cls: "cr-folderrow" });
      const cb = row.createEl("input", { type: "checkbox" });
      cb.checked = selected.has(f);
      cb.addEventListener("change", () => {
        if (cb.checked) selected.add(f);
        else selected.delete(f);
        this.plugin.store.updateNook(nook.id, { folders: [...selected] });
      });
      row.createSpan({ text: f });
    }

    new Setting(contentEl).setName("Density").addDropdown((d) =>
      d
        .addOptions(DENSITY_CHOICES)
        .setValue(nook.tweaks.density)
        .onChange((v) => this.setTweak("density", v as NookTweaks["density"]))
    );

    new Setting(contentEl)
      .setName("Columns")
      .setDesc("Auto fits the number of columns to the board's width.")
      .addDropdown((d) =>
        d
          .addOptions(COLUMN_CHOICES)
          .setValue(String(nook.tweaks.columns))
          .onChange((v) => this.setTweak("columns", toColumnCount(v as `${ColumnCount}`)))
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
      .setName("Image fit")
      .setDesc("How a cover image fills its box on a collapsed card. Auto crops wide images and shrinks square or tall ones to fit.")
      .addDropdown((d) =>
        d
          .addOptions(COVER_FIT_CHOICES)
          .setValue(nook.tweaks.coverFit)
          .onChange((v) => this.setTweak("coverFit", v as CoverFit))
      );
    new Setting(contentEl)
      .setName("Image aspect ratio")
      .setDesc("The shape of the cover box, as height ÷ width: 0.75 is 4:3, 1 is square.")
      .addSlider((s) =>
        s
          .setLimits(COVER_ASPECT_RANGE.min, COVER_ASPECT_RANGE.max, COVER_ASPECT_RANGE.step)
          .setValue(nook.tweaks.coverAspect)
          .onChange((v) => this.setTweak("coverAspect", v))
      );
    new Setting(contentEl)
      .setName("Image max height")
      .setDesc("The tallest a cover gets, in pixels.")
      .addSlider((s) =>
        s
          .setLimits(COVER_MAX_HEIGHT_RANGE.min, COVER_MAX_HEIGHT_RANGE.max, COVER_MAX_HEIGHT_RANGE.step)
          .setValue(nook.tweaks.coverMaxHeight)
          .onChange((v) => this.setTweak("coverMaxHeight", v))
      );
    new Setting(contentEl)
      .setName("Preview under cover")
      .setDesc("Show a note's preview beneath a cover that comes from its image property.")
      .addToggle((t) =>
        t.setValue(nook.tweaks.coverPreview).onChange((v) => this.setTweak("coverPreview", v))
      );

    new Setting(contentEl)
      .setName("Delete this nook")
      .setDesc("Removes the nook (notes are untouched).")
      .addButton((b) =>
        b
          .setButtonText("Delete")
          .setDestructive()
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

/** Minimal single-text-field prompt (e.g. naming a new kanban column). Submits
 *  on the CTA button or Enter; a blank / whitespace-only value is ignored. */
export class PromptModal extends Modal {
  private value: string;

  constructor(
    app: App,
    private readonly opts: {
      title: string;
      placeholder?: string;
      cta?: string;
      initial?: string;
      onSubmit: (value: string) => void;
    }
  ) {
    super(app);
    this.value = opts.initial ?? "";
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("carrel-modal");
    contentEl.createEl("h3", { text: this.opts.title, cls: "cr-modal__title" });
    new Setting(contentEl).addText((t) => {
      t.setPlaceholder(this.opts.placeholder ?? "");
      t.setValue(this.value);
      t.onChange((v) => (this.value = v));
      t.inputEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          this.submit();
        }
      });
      window.setTimeout(() => t.inputEl.focus(), 0);
    });
    new Setting(contentEl).addButton((b) =>
      b
        .setButtonText(this.opts.cta ?? "OK")
        .setCta()
        .onClick(() => this.submit())
    );
  }

  private submit(): void {
    const v = this.value.trim();
    this.close();
    if (v !== "") this.opts.onSubmit(v);
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

type PickItem = { kind: "nook"; nook: Nook } | { kind: "new" };

/** Fuzzy picker for the "Insert Carrel block" command: choose an existing nook
 *  to embed, or create a new one. Resolves to the chosen nook via onPick. */
export class InsertNookBlockModal extends FuzzySuggestModal<PickItem> {
  constructor(private readonly plugin: CarrelPlugin, private readonly onPick: (nook: Nook) => void) {
    super(plugin.app);
    this.setPlaceholder("Pick a nook to embed, or create a new one…");
  }

  getItems(): PickItem[] {
    // A Bases view's hidden nook has no folders of its own to embed.
    const nooks = this.plugin.store.nooks().filter((n) => n.kind !== "bases");
    return [{ kind: "new" }, ...nooks.map((nook) => ({ kind: "nook" as const, nook }))];
  }

  getItemText(item: PickItem): string {
    if (item.kind === "new") return "＋ Create new nook…";
    return `${item.nook.name}  ·  ${item.nook.folders.join(", ") || "whole vault"}`;
  }

  onChooseItem(item: PickItem): void {
    if (item.kind === "new") {
      new CreateNookModal(this.plugin, (nook) => this.onPick(nook)).open();
    } else {
      this.onPick(item.nook);
    }
  }
}
