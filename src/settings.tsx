import { PluginSettingTab } from "obsidian";
import { render } from "preact";
import type CarrelPlugin from "./main";
import { SettingsApp } from "./components/settings/SettingsApp";

/** The Carrel settings tab. Renders the Preact category manager into the
 *  settings container (Obsidian provides the surrounding nav + chrome). */
export class CarrelSettingTab extends PluginSettingTab {
  private root: HTMLElement | null = null;

  constructor(private readonly plugin: CarrelPlugin) {
    super(plugin.app, plugin);
  }

  display(): void {
    this.seedFromNotesIfEmpty();
    this.containerEl.empty();
    this.root = this.containerEl.createDiv({ cls: "carrel-settings" });
    render(<SettingsApp plugin={this.plugin} />, this.root);
  }

  /** First-run baseline: seed a category per distinct category found in the
   *  indexed notes (palette colors, Lucide book icon) so the manager opens with
   *  relevant content rather than empty. */
  private seedFromNotesIfEmpty(): void {
    if (this.plugin.store.categories().length) return;
    const names = [...new Set(this.plugin.index.docs.value.map((d) => d.category))].sort((a, b) => a.localeCompare(b));
    if (!names.length) return;
    const palette = ["#cf9b54", "#d8893f", "#cd6a5a", "#c0594c", "#c66b8e", "#b07cc6", "#8a7bd8", "#6f86d6", "#5aa6b0", "#5fa98c", "#7aa86a", "#9a9099"];
    this.plugin.store.setCategories(
      names.map((name, i) => ({
        id: "c" + i + "-" + name.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 6),
        name,
        color: palette[i % palette.length],
        iconSet: "lucide" as const,
        icon: "lucide-book",
        order: i,
      }))
    );
  }

  hide(): void {
    if (this.root) {
      render(null, this.root);
      this.root = null;
    }
  }
}
