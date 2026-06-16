import { signal, type Signal } from "@preact/signals";
import type CarrelPlugin from "../main";
import {
  CARREL_SCHEMA_VERSION,
  DEFAULT_CATEGORY_PROP,
  DEFAULT_DATA,
  DEFAULT_TWEAKS,
  DEFAULT_TYPE_PROP,
  type CarrelData,
  type Category,
  type CustomType,
  type GroupBy,
  type Nook,
  type SortMode,
} from "../types/data";
import { genId } from "../util/id";

/**
 * The persisted Carrel state: nooks + global categories, held in a signal and
 * saved (debounced) to the plugin's data.json. Components read store.data.value
 * to subscribe; mutations replace the value immutably and schedule a save.
 */
export class CarrelStore {
  readonly data: Signal<CarrelData> = signal(structuredClone(DEFAULT_DATA));
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly plugin: CarrelPlugin) {}

  async load(): Promise<void> {
    const raw = (await this.plugin.loadData()) as Partial<CarrelData> | null;
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
    this.data.value = merged;
  }

  private commit(next: CarrelData): void {
    this.data.value = next;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.plugin.saveData(this.data.value);
    }, 400);
  }

  async flush(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    await this.plugin.saveData(this.data.value);
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
}
