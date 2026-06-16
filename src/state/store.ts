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
  type Nook,
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
    this.data.value = {
      ...structuredClone(DEFAULT_DATA),
      ...(raw ?? {}),
      schemaVersion: CARREL_SCHEMA_VERSION,
    };
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
