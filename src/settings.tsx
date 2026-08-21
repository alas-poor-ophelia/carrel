/* The Carrel settings tab, on Obsidian's declarative Settings API (1.13.0+).
   Simple values (front-matter property names, the beta toggle, storage mode)
   are native setting controls, routed into the CarrelStore via the
   getControlValue/setControlValue overrides; the rich widgets (category/type
   managers, type rules, nooks) mount Preact sections through `render`
   definitions. Native definitions make every setting reachable from
   Obsidian's settings search. */
import { PluginSettingTab, type Setting, type SettingDefinitionItem } from "obsidian";
import { render, type ComponentChild } from "preact";
import type CarrelPlugin from "./main";
import {
  DEFAULT_CATEGORY_PROP,
  DEFAULT_ICON_IMAGE_PROP,
  DEFAULT_IMAGE_PROP,
  DEFAULT_TYPE_PROP,
  defaultStoragePath,
  type StorageMode,
} from "./types/data";
import { getWayfinder } from "./util/plugins";
import { lucideIds } from "./components/settings/CategoryIcon";
import { CategoriesSection, TypesSection } from "./components/settings/sections";
import { NooksSection } from "./components/settings/NooksSection";
import { TypeRulesSection } from "./components/settings/TypeRulesSection";

/** Text keys whose edits are expensive to commit — the four prop names each
 *  trigger a full vault reindex, and the storage path writes a real vault file
 *  — so they commit debounced (typing settles first), not per keystroke. */
type DebouncedKey = "categoryProp" | "typeProp" | "imageProp" | "iconImageProp" | "storagePath";
const DEBOUNCED_KEYS: readonly DebouncedKey[] = [
  "categoryProp",
  "typeProp",
  "imageProp",
  "iconImageProp",
  "storagePath",
];
const COMMIT_MS = 700;

export class CarrelSettingTab extends PluginSettingTab {
  /** Unmounters for the Preact sections currently rendered into the tab. */
  private readonly cleanups = new Set<() => void>();
  private readonly commitTimers = new Map<DebouncedKey, number>();
  private readonly pendingCommits = new Map<DebouncedKey, string>();

  constructor(private readonly plugin: CarrelPlugin) {
    super(plugin.app, plugin);
    // If the plugin unloads inside the debounce window, flush pending edits
    // immediately rather than letting timers fire into a disabled plugin.
    this.plugin.register(() => this.flushPendingCommits());
  }

  getSettingDefinitions(): SettingDefinitionItem[] {
    this.seedFromNotesIfEmpty();
    const rpgAvailable = !!getWayfinder(this.plugin.app);
    return [
      {
        type: "group",
        heading: "Categories",
        items: [
          {
            name: "Manage categories",
            desc:
              "Categories are the colored tags that classify each note — every note declares one " +
              "with a front-matter field, e.g. category: Deed. Give each a color and an icon; they " +
              "drive the tinting, badges and filter chips throughout the references pane.",
            render: (setting) => this.mountSection(setting, <CategoriesSection plugin={this.plugin} />),
          },
        ],
      },
      {
        type: "group",
        heading: "Types",
        items: [
          {
            name: "Manage types",
            desc:
              "A note's type sets its badge, accent and filter chip — declared with a front-matter " +
              "field, e.g. type: Bookmark. The built-ins back Carrel's structured parsers (tables, " +
              "flowcharts, quotes…). Add your own for a custom label, color and icon; custom types " +
              "don't add new parsing — the body still renders by its markdown structure.",
            render: (setting) => this.mountSection(setting, <TypesSection plugin={this.plugin} />),
          },
          {
            name: "Type detection rules",
            desc:
              "Auto-assign a type to notes that match a metadata rule. Rules are checked in order — " +
              "the first enabled match wins — and an explicit type: front-matter always takes " +
              "precedence. Rules read metadata only (frontmatter + tags), never the note body.",
            render: (setting) => this.mountSection(setting, <TypeRulesSection plugin={this.plugin} />),
          },
        ],
      },
      {
        type: "group",
        heading: "Front-matter mapping",
        items: [
          {
            name: "Category property",
            desc: "Front-matter property a note's category is read from. If it holds a list, the first value is used.",
            control: { type: "text", key: "categoryProp", placeholder: DEFAULT_CATEGORY_PROP },
          },
          {
            name: "Type property",
            desc: "Front-matter property a note's type is read from.",
            control: { type: "text", key: "typeProp", placeholder: DEFAULT_TYPE_PROP },
          },
          {
            name: "Image property",
            desc:
              "Front-matter property for a note's cover image (e.g. a Base's image column). A note " +
              "with this property set renders as a thumbnail.",
            control: { type: "text", key: "imageProp", placeholder: DEFAULT_IMAGE_PROP },
          },
          {
            name: "Icon image property",
            desc:
              "Front-matter property for a per-note icon image — it replaces the card's corner glyph " +
              "with that picture. Embeds, wikilinks, bare paths and URLs all work; anything that " +
              "doesn't resolve to an image is ignored.",
            control: { type: "text", key: "iconImageProp", placeholder: DEFAULT_ICON_IMAGE_PROP },
          },
        ],
      },
      {
        type: "group",
        heading: "Nooks",
        items: [
          {
            name: "Manage nooks",
            desc:
              "A nook is a named board that reads notes from one or more vault folders. Create, " +
              "rename or delete nooks here, switch which one is active, and open a nook to edit its " +
              "source folders, theme and density.",
            render: (setting) => this.mountSection(setting, <NooksSection plugin={this.plugin} />),
          },
        ],
      },
      {
        type: "group",
        heading: "Beta features",
        items: [
          {
            name: "Render Excalidraw drawings",
            desc:
              "Show an Excalidraw note as its drawing (the exported SVG) inside the card, instead of " +
              "the raw “Switch to Excalidraw view” banner. Requires the Excalidraw plugin. Off by " +
              "default while the export path is proven across setups.",
            control: { type: "toggle", key: "excalidrawRendering", defaultValue: false },
          },
        ],
      },
      {
        type: "group",
        heading: "Data storage",
        items: [
          {
            name: "Save to",
            desc:
              "Where Carrel saves your nooks, categories and settings. The plugin data file keeps " +
              "everything inside the plugin (the default). The vault options write a single file " +
              "into your vault — handy for syncing or hand-editing. Switching moves your current " +
              "data automatically; the old file is left behind as a backup.",
            control: {
              type: "dropdown",
              key: "storageMode",
              options: {
                plugin: "Plugin data file (data.json)",
                "vault-json": "Vault file — JSON",
                "vault-yaml": "Vault file — YAML",
              },
            },
          },
          {
            name: "Vault file path",
            desc: "Vault-relative path of the data file.",
            visible: () => this.plugin.store.storage.value.mode !== "plugin",
            control: {
              type: "text",
              key: "storagePath",
              placeholder: defaultStoragePath(this.plugin.store.storage.value.mode),
            },
          },
        ],
      },
      {
        name: "Icon sets",
        desc:
          (rpgAvailable
            ? "The RPG Awesome glyph set is unlocked because the Wayfinder character-sheet plugin is installed. "
            : "Install the Wayfinder character-sheet plugin to unlock the RPG Awesome glyph set in the icon picker. ") +
          `${lucideIds().length} Lucide icons available.`,
      },
    ];
  }

  getControlValue(key: string): unknown {
    const store = this.plugin.store;
    switch (key) {
      case "categoryProp":
        return store.categoryProp();
      case "typeProp":
        return store.typeProp();
      case "imageProp":
        return store.imageProp();
      case "iconImageProp":
        return store.iconImageProp();
      case "excalidrawRendering":
        return store.excalidrawRendering();
      case "storageMode":
        return store.storage.value.mode;
      case "storagePath":
        return store.storage.value.path;
      default:
        return undefined;
    }
  }

  setControlValue(key: string, value: unknown): void {
    const store = this.plugin.store;
    if ((DEBOUNCED_KEYS as readonly string[]).includes(key)) {
      this.commitDebounced(key as DebouncedKey, typeof value === "string" ? value : "");
      return;
    }
    switch (key) {
      case "excalidrawRendering":
        store.setExcalidrawRendering(value === true);
        break;
      case "storageMode": {
        const mode = value as StorageMode;
        // A path edit still in its debounce window belongs to the OLD mode's
        // config — flush it first so the mode switch starts from settled state.
        this.flushPendingCommits();
        const storage = store.storage.value;
        // Keep a user-customized path; if the path is still a default, swap it
        // to the new mode's default so the extension matches.
        const keepPath = storage.path.trim() !== "" && storage.path !== defaultStoragePath(storage.mode);
        const path = keepPath ? storage.path : defaultStoragePath(mode);
        void store.setStorageConfig({ mode, path });
        // Structural change: the path row's visibility and value both depend on
        // the mode, so re-render the tab rather than just refreshing DOM state.
        // Unmount our Preact sections first — the re-render discards their DOM,
        // and the framework is not guaranteed to run stale render cleanups.
        this.runCleanups();
        this.update();
        break;
      }
    }
  }

  /** Commit a text edit after a typing pause: prop-name commits each trigger a
   *  full vault reindex, and a storage-path commit writes a real vault file, so
   *  per-keystroke writes would thrash the vault (and litter it with files at
   *  partial paths). The store setters map a blank value back to a default. */
  private commitDebounced(key: DebouncedKey, value: string): void {
    this.pendingCommits.set(key, value);
    const prev = this.commitTimers.get(key);
    if (prev != null) window.clearTimeout(prev);
    this.commitTimers.set(
      key,
      window.setTimeout(() => {
        this.commitTimers.delete(key);
        this.commitNow(key);
      }, COMMIT_MS)
    );
  }

  private commitNow(key: DebouncedKey): void {
    const value = this.pendingCommits.get(key);
    if (value == null) return;
    this.pendingCommits.delete(key);
    const store = this.plugin.store;
    if (key === "categoryProp") store.setCategoryProp(value);
    else if (key === "typeProp") store.setTypeProp(value);
    else if (key === "imageProp") store.setImageProp(value);
    else if (key === "iconImageProp") store.setIconImageProp(value);
    else {
      const storage = store.storage.value;
      const typed = value.trim();
      const path = typed !== "" ? typed : defaultStoragePath(storage.mode);
      if (path !== storage.path) void store.setStorageConfig({ ...storage, path });
    }
  }

  /** Cancel all debounce timers and commit their pending values immediately. */
  private flushPendingCommits(): void {
    for (const t of this.commitTimers.values()) window.clearTimeout(t);
    this.commitTimers.clear();
    for (const key of [...this.pendingCommits.keys()]) this.commitNow(key);
  }

  /** Mount a Preact section below a definition's name/desc row. Returns the
   *  unmounter (the framework runs it on row teardown; hide() is the belt-and-
   *  braces fallback for windows torn down without cleanup). */
  private mountSection(setting: Setting, node: ComponentChild): () => void {
    setting.settingEl.addClass("cr-set-embed");
    const root = setting.settingEl.createDiv({ cls: "carrel-settings" });
    const inner = root.createDiv({ cls: "ob" });
    render(node, inner);
    const cleanup = (): void => {
      render(null, inner);
      // The framework reuses a row's DOM across update() and re-invokes render
      // on the same settingEl — remove our mount div too, or empty husks
      // accumulate one per re-render.
      root.remove();
      this.cleanups.delete(cleanup);
    };
    this.cleanups.add(cleanup);
    return cleanup;
  }

  /** Unmount every currently-mounted Preact section. Cleanups are idempotent
   *  (each removes itself from the set), so overlap with the framework's own
   *  render-cleanup invocation is harmless. */
  private runCleanups(): void {
    for (const cleanup of [...this.cleanups]) cleanup();
  }

  /** First-run baseline: seed a category per distinct category found in the
   *  indexed notes (palette colors, Lucide book icon) so the manager opens with
   *  relevant content rather than empty.
   *
   *  Called from getSettingDefinitions(), which runs both when the tab is
   *  displayed AND once at addSettingTab() time (search indexing, during plugin
   *  load) — at that first call the index is typically still empty and this
   *  no-ops. Don't assume docs.value is populated here. */
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
    // Closing the tab commits any in-flight debounced edit immediately, like
    // the old blur-committed fields did.
    this.flushPendingCommits();
    this.runCleanups();
    super.hide();
  }
}
