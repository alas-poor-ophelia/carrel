// Persisted Carrel data (saveData/loadData). Nooks + the global category list
// live here. Categories fill in in Phase 6.

/** How the board groups cards into sections. */
export type GroupBy = "category" | "type" | "folder" | "none";

/** How cards are ordered within a section. `custom` reads the nook's
 *  per-section `cardOrder` (drag-arranged); the rest are computed presets. */
export type SortMode = "az" | "za" | "type" | "custom";

/** Per-nook display tweaks (surfaced as Style Settings / UI in Phase 7). */
export interface NookTweaks {
  columns: "auto" | 2 | 3 | 4;
  density: "compact" | "regular" | "comfy";
  showRail: boolean;
  showBadges: boolean;
  animations: boolean;
  groupBy: GroupBy;
  sort: SortMode;
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
  /** Custom card order for `sort: "custom"`, keyed by section key (see
   *  rules/grouping.groupKeyOf). Each value is an ordered list of note paths;
   *  cards not listed fall to the end in A–Z order. */
  cardOrder: Record<string, string[]>;
}

/** Shared shape of a colored, icon'd, user-managed tag: a stable id, a display
 *  name, an accent color, and a glyph (lucide or rpg) with a sort order. Both
 *  Category and CustomType are this shape; they differ only in how `id`/`name`
 *  are referenced by notes (see each). */
export interface TaggedItem {
  id: string;
  name: string;
  color: string;
  iconSet: "lucide" | "rpg";
  icon: string;
  order: number;
}

/** A global, colored, icon'd category tag (managed in settings; Phase 6). */
export type Category = TaggedItem;

/** A user-declared content type (managed in settings). Carries label/color/icon
 *  only — no parsing logic; the built-in parsers stay compiled in. A note opts
 *  into one via its frontmatter `type:` (matched case-insensitively against `id`).
 *  Shares the Category shape, but `id` doubles as the matchable frontmatter token. */
export type CustomType = TaggedItem;

export interface CarrelData {
  schemaVersion: number;
  nooks: Nook[];
  categories: Category[];
  customTypes: CustomType[];
  activeNookId: string | null;
  /** Front-matter property a note's category is read from (default `category`).
   *  Array values use the first element; unparseable values fall through to "General". */
  categoryProp: string;
  /** Front-matter property a note's type is read from (default `type`).
   *  Array values use the first element; unrecognized values fall back to structural inference. */
  typeProp: string;
}

export const CARREL_SCHEMA_VERSION = 4;

/** Built-in defaults for the configurable front-matter property names. */
export const DEFAULT_CATEGORY_PROP = "category";
export const DEFAULT_TYPE_PROP = "type";

export const DEFAULT_TWEAKS: NookTweaks = {
  columns: "auto",
  density: "regular",
  showRail: true,
  showBadges: true,
  animations: true,
  groupBy: "category",
  sort: "az",
};

export const DEFAULT_DATA: CarrelData = {
  schemaVersion: CARREL_SCHEMA_VERSION,
  nooks: [],
  categories: [],
  customTypes: [],
  activeNookId: null,
  categoryProp: DEFAULT_CATEGORY_PROP,
  typeProp: DEFAULT_TYPE_PROP,
};
