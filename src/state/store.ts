import { Notice, parseYaml, stringifyYaml } from "obsidian";
import { signal, type Signal } from "@preact/signals";
import type CarrelPlugin from "../main";
import {
  CARREL_SCHEMA_VERSION,
  DEFAULT_CATEGORY_PROP,
  DEFAULT_DATA,
  DEFAULT_IMAGE_PROP,
  DEFAULT_STORAGE,
  DEFAULT_TWEAKS,
  DEFAULT_TYPE_PROP,
  defaultStoragePath,
  type CarrelData,
  type Category,
  type CustomType,
  type GroupBy,
  type Nook,
  type SortMode,
  type StorageConfig,
  type TypeRule,
} from "../types/data";
import type { ContentType } from "../rules/model";
import { isContentType, isKnownType } from "../rules/registry";
import { genId } from "../util/id";

/** The shape written to the plugin's data.json. In `plugin` mode `data` holds
 *  the nook blob; in vault modes `data` is null and the blob lives in a vault
 *  file (data.json then carries only the storage config). A legacy data.json is
 *  a bare CarrelData with no `storage` key — detected and treated as plugin mode. */
interface PersistedRoot {
  storage: StorageConfig;
  data: CarrelData | null;
}

function isPersistedRoot(raw: unknown): raw is PersistedRoot {
  if (raw == null || typeof raw !== "object" || !("storage" in raw)) return false;
  const s: unknown = raw.storage;
  return s != null && typeof s === "object" && "mode" in s && typeof s.mode === "string";
}

/**
 * The persisted Carrel state: nooks + global categories, held in a signal and
 * saved (debounced) to the configured backend (plugin data.json by default, or
 * a single JSON/YAML file in the vault — see StorageConfig). Components read
 * store.data.value to subscribe; mutations replace the value immutably and
 * schedule a save.
 */
export class CarrelStore {
  readonly data: Signal<CarrelData> = signal(structuredClone(DEFAULT_DATA));
  /** Where the nook blob is persisted. Always read from / written to data.json;
   *  held in a signal so the settings UI re-renders when the mode changes. */
  readonly storage: Signal<StorageConfig> = signal({ ...DEFAULT_STORAGE });
  private saveTimer: number | null = null;
  /** Set when on-disk data is from a NEWER schema than this build understands,
   *  OR a vault data file failed to read/parse. While locked, in-memory edits
   *  work but are never persisted, so we never clobber recoverable on-disk data. */
  private locked = false;

  constructor(private readonly plugin: CarrelPlugin) {}

  async load(): Promise<void> {
    const root: unknown = await this.plugin.loadData();
    // Resolve the storage config + raw nook blob, tolerating a legacy data.json
    // that is a bare CarrelData (written before storage modes existed).
    let cfg: StorageConfig;
    let raw: Partial<CarrelData> | null;
    if (isPersistedRoot(root)) {
      cfg = { ...DEFAULT_STORAGE, ...root.storage };
      raw = cfg.mode === "plugin" ? root.data : await this.loadVaultBlob(cfg, root.data);
    } else {
      cfg = { ...DEFAULT_STORAGE };
      raw = root ?? null;
    }
    this.storage.value = cfg;

    const storedVersion = typeof raw?.schemaVersion === "number" ? raw.schemaVersion : 0;
    if (storedVersion > CARREL_SCHEMA_VERSION) {
      // Data saved by a NEWER Carrel. Load it so the UI still works, but LOCK
      // persistence: re-stamping the version here would silently drop fields
      // this build doesn't understand (data loss). Stays read-only until the
      // plugin is updated.
      this.locked = true;
      this.data.value = { ...structuredClone(DEFAULT_DATA), ...(raw ?? {}) };
      new Notice(
        "Carrel: this vault's data was saved by a newer version of the plugin — " +
          "changes won't be saved until you update Carrel.",
        0
      );
      return;
    }
    this.data.value = this.migrate(raw);
  }

  /** Read + parse the nook blob from the configured vault file. Returns the
   *  data.json `inline` snapshot as a fallback when the file is missing (e.g. a
   *  mode just switched but no save has flushed yet). On a read/parse error it
   *  LOCKS persistence and returns the fallback, so a corrupt file is never
   *  silently overwritten with an empty board. */
  private async loadVaultBlob(
    cfg: StorageConfig,
    inline: CarrelData | null
  ): Promise<Partial<CarrelData> | null> {
    const adapter = this.plugin.app.vault.adapter;
    let text: string;
    try {
      if (!(await adapter.exists(cfg.path))) return inline;
      text = await adapter.read(cfg.path);
    } catch {
      this.locked = true;
      new Notice(
        `Carrel: couldn't read the data file “${cfg.path}”. Using last known data; ` +
          "changes won't be saved until it's reachable.",
        0
      );
      return inline;
    }
    try {
      const parsed: unknown = cfg.mode === "vault-yaml" ? parseYaml(text) : JSON.parse(text);
      return parsed as Partial<CarrelData>;
    } catch {
      this.locked = true;
      new Notice(
        `Carrel: the data file “${cfg.path}” is corrupt and couldn't be parsed. ` +
          "Changes won't be saved until it's fixed.",
        0
      );
      return inline;
    }
  }

  /** Apply schema defaults + pruning to a raw blob (shared by every load path). */
  private migrate(raw: Partial<CarrelData> | null): CarrelData {
    const merged: CarrelData = {
      ...structuredClone(DEFAULT_DATA),
      ...(raw ?? {}),
      schemaVersion: CARREL_SCHEMA_VERSION,
    };
    // Per-nook objects don't get the top-level spread-merge, so backfill any
    // fields added in a later schema (tweaks.groupBy/sort, cardOrder).
    merged.nooks = (merged.nooks ?? []).map((n) => ({
      ...n,
      cardOrder: n.cardOrder ?? {},
      tweaks: { ...DEFAULT_TWEAKS, ...(n.tweaks ?? {}) },
    }));
    // Prune type config that references types no longer present or invalid: a
    // since-removed custom type (orphan rule), `reference`, or a stray token.
    merged.disabledBuiltinTypes = (merged.disabledBuiltinTypes ?? []).filter(
      (t) => isContentType(t) && t !== "reference"
    );
    merged.typeRules = (merged.typeRules ?? []).filter((r) =>
      isKnownType(r.targetType, merged.customTypes)
    );
    return merged;
  }

  private commit(next: CarrelData): void {
    this.data.value = next;
    if (this.locked) return;
    if (this.saveTimer != null) window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => {
      this.saveTimer = null;
      void this.persist(this.data.value);
    }, 400);
  }

  async flush(): Promise<void> {
    if (this.saveTimer != null) {
      window.clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    if (this.locked) return;
    await this.persist(this.data.value);
  }

  /** Write data to whichever backend the storage config selects. The config
   *  itself always goes to data.json; in vault modes the nook blob is written to
   *  the vault file and data.json carries data:null. */
  private async persist(data: CarrelData): Promise<void> {
    const cfg = this.storage.value;
    const root: PersistedRoot = { storage: cfg, data: cfg.mode === "plugin" ? data : null };
    await this.plugin.saveData(root);
    if (cfg.mode === "plugin") return;
    const text = cfg.mode === "vault-yaml" ? stringifyYaml(data) : JSON.stringify(data, null, 2);
    await this.writeVaultFile(cfg.path, text);
  }

  private async writeVaultFile(path: string, text: string): Promise<void> {
    const adapter = this.plugin.app.vault.adapter;
    const slash = path.lastIndexOf("/");
    if (slash > 0) {
      const dir = path.slice(0, slash);
      if (!(await adapter.exists(dir))) await adapter.mkdir(dir);
    }
    await adapter.write(path, text);
  }

  /** Switch where data is stored, AUTO-MIGRATING the current in-memory data to
   *  the new target immediately (the old file is left in place as a backup). A
   *  blank path falls back to the mode's default name. No-op while locked — we
   *  won't risk writing over data we couldn't fully load. */
  async setStorageConfig(next: StorageConfig): Promise<void> {
    if (this.locked) {
      new Notice(
        "Carrel: data couldn't be fully loaded, so the save location is locked right now."
      );
      return;
    }
    const path = next.path.trim() || defaultStoragePath(next.mode);
    this.storage.value = { mode: next.mode, path };
    await this.persist(this.data.value);
  }

  /* ---------- nooks ---------- */

  nooks(): Nook[] {
    return this.data.value.nooks;
  }

  activeNook(): Nook | null {
    const d = this.data.value;
    return d.nooks.find((n) => n.id === d.activeNookId) ?? d.nooks[0] ?? null;
  }

  setActiveNook(id: string): void {
    this.commit({ ...this.data.value, activeNookId: id });
  }

  createNook(input: {
    name: string;
    folders: string[];
    theme?: Nook["theme"];
    characterId?: string | null;
  }): Nook {
    const nook: Nook = {
      id: genId(),
      name: input.name.trim() || "Untitled nook",
      folders: input.folders.map((f) => f.replace(/\/$/, "")).filter(Boolean),
      theme: input.theme ?? "brand",
      characterId: input.characterId ?? null,
      pins: [],
      pinOrder: [],
      checklist: {},
      tweaks: { ...DEFAULT_TWEAKS },
      cardOrder: {},
    };
    const d = this.data.value;
    this.commit({ ...d, nooks: [...d.nooks, nook], activeNookId: nook.id });
    return nook;
  }

  /** Ensure a hidden Bases-backed nook exists for a `.base` Carrel view, keyed
   *  by the id persisted in that view's config. Created once; its grouping,
   *  sort, pins and card order then persist across sessions like any nook. */
  ensureBasesNook(id: string, name: string): void {
    const d = this.data.value;
    if (d.nooks.some((n) => n.id === id)) return;
    const nook: Nook = {
      id,
      name: name || "Bases",
      folders: [],
      kind: "bases",
      theme: "brand",
      characterId: null,
      pins: [],
      pinOrder: [],
      checklist: {},
      tweaks: { ...DEFAULT_TWEAKS, groupBy: "type" },
      cardOrder: {},
    };
    this.commit({ ...d, nooks: [...d.nooks, nook] });
  }

  updateNook(id: string, patch: Partial<Omit<Nook, "id">>): void {
    const d = this.data.value;
    this.commit({
      ...d,
      nooks: d.nooks.map((n) => (n.id === id ? { ...n, ...patch } : n)),
    });
  }

  deleteNook(id: string): void {
    const d = this.data.value;
    const nooks = d.nooks.filter((n) => n.id !== id);
    const activeNookId = d.activeNookId === id ? (nooks[0]?.id ?? null) : d.activeNookId;
    this.commit({ ...d, nooks, activeNookId });
  }

  /* ---------- per-nook reading state ---------- */

  setNookPins(id: string, pins: string[], pinOrder: string[]): void {
    this.updateNook(id, { pins, pinOrder });
  }

  setNookChecklist(id: string, checklist: Record<string, boolean>): void {
    this.updateNook(id, { checklist });
  }

  /* ---------- per-nook grouping / sorting ---------- */

  setNookGroupBy(id: string, groupBy: GroupBy): void {
    const n = this.data.value.nooks.find((x) => x.id === id);
    if (!n) return;
    this.updateNook(id, { tweaks: { ...n.tweaks, groupBy } });
  }

  setNookSort(id: string, sort: SortMode): void {
    const n = this.data.value.nooks.find((x) => x.id === id);
    if (!n) return;
    this.updateNook(id, { tweaks: { ...n.tweaks, sort } });
  }

  /** Replace the custom card order for one section key (Phase 2 drag writes this). */
  setNookCardOrder(id: string, sectionKey: string, paths: string[]): void {
    const n = this.data.value.nooks.find((x) => x.id === id);
    if (!n) return;
    this.updateNook(id, { cardOrder: { ...n.cardOrder, [sectionKey]: paths } });
  }

  /* ---------- categories (Phase 6) ---------- */

  categories(): Category[] {
    return this.data.value.categories;
  }

  setCategories(categories: Category[]): void {
    this.commit({ ...this.data.value, categories });
  }

  /* ---------- custom types ---------- */

  customTypes(): CustomType[] {
    return this.data.value.customTypes;
  }

  setCustomTypes(customTypes: CustomType[]): void {
    this.commit({ ...this.data.value, customTypes });
  }

  /* ---------- type detection rules + disabled built-ins (Phase 4) ---------- */

  /** Returns the stable underlying array (not a copy) so the re-index effect's
   *  identity comparison fires only on real change — see main.ts. */
  typeRules(): TypeRule[] {
    return this.data.value.typeRules;
  }

  setTypeRules(typeRules: TypeRule[]): void {
    this.commit({ ...this.data.value, typeRules });
  }

  disabledBuiltinTypes(): ContentType[] {
    return this.data.value.disabledBuiltinTypes;
  }

  setDisabledBuiltinTypes(disabledBuiltinTypes: ContentType[]): void {
    this.commit({ ...this.data.value, disabledBuiltinTypes });
  }

  /* ---------- front-matter property mapping ---------- */

  categoryProp(): string {
    return this.data.value.categoryProp || DEFAULT_CATEGORY_PROP;
  }

  setCategoryProp(prop: string): void {
    const categoryProp = prop.trim() || DEFAULT_CATEGORY_PROP;
    if (categoryProp === this.data.value.categoryProp) return;
    this.commit({ ...this.data.value, categoryProp });
  }

  typeProp(): string {
    return this.data.value.typeProp || DEFAULT_TYPE_PROP;
  }

  setTypeProp(prop: string): void {
    const typeProp = prop.trim() || DEFAULT_TYPE_PROP;
    if (typeProp === this.data.value.typeProp) return;
    this.commit({ ...this.data.value, typeProp });
  }

  imageProp(): string {
    return this.data.value.imageProp || DEFAULT_IMAGE_PROP;
  }

  setImageProp(prop: string): void {
    const imageProp = prop.trim() || DEFAULT_IMAGE_PROP;
    if (imageProp === this.data.value.imageProp) return;
    this.commit({ ...this.data.value, imageProp });
  }
}
