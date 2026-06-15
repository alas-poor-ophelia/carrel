// Persisted Carrel data (saveData/loadData). Nooks + the global category list
// live here. Categories fill in in Phase 6.

/** Per-nook display tweaks (surfaced as Style Settings / UI in Phase 7). */
export interface NookTweaks {
  columns: "auto" | 2 | 3 | 4;
  density: "compact" | "regular" | "comfy";
  showRail: boolean;
  showBadges: boolean;
  animations: boolean;
}

/** A named set of notes (one or more source folders) with its own theme and
 *  per-nook reading state. Optionally tied to a character sheet. */
export interface Nook {
  id: string;
  name: string;
  folders: string[];
  theme: "brand" | "obsidian";
  /** MiniSheet character id this nook is linked to, or null for a free nook. */
  characterId: string | null;
  pins: string[];
  pinOrder: string[];
  checklist: Record<string, boolean>;
  tweaks: NookTweaks;
}

/** A global, colored, icon'd category tag (managed in settings; Phase 6). */
export interface Category {
  id: string;
  name: string;
  color: string;
  iconSet: "lucide" | "rpg";
  icon: string;
  order: number;
}

/** A user-declared content type (managed in settings). Carries label/color/icon
 *  only — no parsing logic; the built-in parsers stay compiled in. A note opts
 *  into one via its frontmatter `type:` (matched case-insensitively against `id`).
 *  Shares the Category shape, but `id` doubles as the matchable frontmatter token. */
export interface CustomType {
  id: string;
  name: string;
  color: string;
  iconSet: "lucide" | "rpg";
  icon: string;
  order: number;
}

export interface CarrelData {
  schemaVersion: number;
  nooks: Nook[];
  categories: Category[];
  customTypes: CustomType[];
  activeNookId: string | null;
}

export const CARREL_SCHEMA_VERSION = 2;

export const DEFAULT_TWEAKS: NookTweaks = {
  columns: "auto",
  density: "regular",
  showRail: true,
  showBadges: true,
  animations: true,
};

export const DEFAULT_DATA: CarrelData = {
  schemaVersion: CARREL_SCHEMA_VERSION,
  nooks: [],
  categories: [],
  customTypes: [],
  activeNookId: null,
};
