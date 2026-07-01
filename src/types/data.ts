// Persisted Carrel data (saveData/loadData). Nooks + the global category list
// live here. Categories fill in in Phase 6.

import type { ContentType } from "../rules/model";

/** How the board groups cards into sections. */
export type GroupBy = "category" | "type" | "folder" | "none";

/** How cards are ordered within a section. `custom` reads the nook's
 *  per-section `cardOrder` (drag-arranged); the rest are computed presets. */
export type SortMode = "az" | "za" | "type" | "custom";

/** The board's render path. `board` is the column-balancing masonry (default);
 *  `kanban` lays categories out as horizontal swimlanes (see `kanbanColumns`). */
export type LayoutMode = "board" | "kanban";

/** Per-nook display tweaks (surfaced as Style Settings / UI in Phase 7). */
export interface NookTweaks {
  columns: "auto" | 2 | 3 | 4;
  density: "compact" | "regular" | "comfy";
  showRail: boolean;
  showBadges: boolean;
  animations: boolean;
  groupBy: GroupBy;
  sort: SortMode;
  /** Masonry board vs. kanban swimlanes — a parallel render path, not a
   *  replacement. Defaults to `board`; existing nooks backfill on load. */
  layout: LayoutMode;
}

/** A named set of notes (one or more source folders) with its own theme and
 *  per-nook reading state. Optionally tied to a character sheet. */
export interface Nook {
  id: string;
  name: string;
  folders: string[];
  /** A nook auto-created to back a Bases "Carrel" view (its display settings +
   *  pins/order persist here, keyed by an id stored in the `.base` file). Hidden
   *  from the main pane's nook switcher. Absent for ordinary folder nooks. */
  kind?: "bases";
  theme: "brand" | "obsidian";
  /** MiniSheet character id this nook is linked to, or null for a free nook. */
  characterId: string | null;
  pins: string[];
  pinOrder: string[];
  checklist: Record<string, boolean>;
  tweaks: NookTweaks;
  /** KANBAN mode only: the ordered category NAMES shown as columns, left→right
   *  (matched against `doc.category`). Cards whose category is absent are hidden
   *  — this list IS the per-nook column show/hide + order control. Unset until a
   *  nook first enters kanban, then seeded from the categories present in its
   *  docs (ordered by global `Category.order`). Ignored in board mode. */
  kanbanColumns?: string[];
  /** Custom card order for `sort: "custom"`, keyed by section key (see
   *  rules/grouping.groupKeyOf). Each value is an ordered list of note paths;
   *  cards not listed fall to the end in A–Z order. */
  cardOrder: Record<string, string[]>;
  /** RESERVED for a future release — per-nook type-rule overrides. Declared and
   *  persisted (merge-preserved) so per-nook scoping won't need another schema
   *  migration; the current parser IGNORES this. */
  typeRuleOverrides?: TypeRule[];
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

/** The kind of metadata a TypeRule inspects. All read the metadata cache only
 *  (frontmatter + tags) — never the note body, so there is no regex/ReDoS
 *  surface in this version. */
export type TypeRuleKind = "frontmatter-key" | "frontmatter-key-value" | "tag";

/** A user-declared rule that redirects a note to a target type by matching
 *  metadata-cache fields. Detection ONLY — it never changes how a type renders. */
export interface TypeRule {
  id: string;
  /** User-visible label for the rule row in settings. */
  name: string;
  /** A built-in ContentType or a CustomType id (validated via isKnownType). */
  targetType: string;
  kind: TypeRuleKind;
  /** A frontmatter key (frontmatter-* kinds) or the bare tag without `#` (tag). */
  key: string;
  /** Required for `frontmatter-key-value`; compared case-insensitively. */
  value?: string;
  enabled: boolean;
}

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
  /** Front-matter property a note's cover image is read from (default `image`).
   *  When present it forces the `image` type and renders as a thumbnail; also the
   *  property a Bases "image"/cover maps to. Accepts `![[x]]`, `[[x]]`, a bare
   *  path/filename, or an external URL. */
  imageProp: string;
  /** Built-in types whose structural INFERENCE is suppressed. An explicit,
   *  recognized frontmatter `type:` still classifies a note; disabling only
   *  stops auto-detection (and hides the type's filter chip / group). */
  disabledBuiltinTypes: ContentType[];
  /** Global user type-detection rules, evaluated in array order (first enabled
   *  match wins) between an explicit known `type:` and structural inference. */
  typeRules: TypeRule[];
  /** BETA — render Excalidraw drawing notes as their exported SVG in the card
   *  (instead of the plugin's raw "Switch to Excalidraw view" banner). Off by
   *  default until the export path is proven across setups. */
  excalidrawRendering: boolean;
}

/** Where and how Carrel persists its nook data. `plugin` keeps it inside the
 *  plugin's own data.json (default, JSON, current behaviour). `vault-json` and
 *  `vault-yaml` instead write a single file at `path` inside the vault, as JSON
 *  or YAML respectively. The storage CONFIG itself always lives in data.json —
 *  it's the only store guaranteed to be readable before we know the mode. */
export type StorageMode = "plugin" | "vault-json" | "vault-yaml";

export interface StorageConfig {
  mode: StorageMode;
  /** Vault-relative file path for the vault-* modes (ignored when `plugin`). */
  path: string;
}

export const DEFAULT_STORAGE: StorageConfig = {
  mode: "plugin",
  path: "carrel-data.json",
};

/** The default vault file name for a mode — extension matches the serializer. */
export function defaultStoragePath(mode: StorageMode): string {
  return mode === "vault-yaml" ? "carrel-data.yaml" : "carrel-data.json";
}

export const CARREL_SCHEMA_VERSION = 5;

/** Built-in defaults for the configurable front-matter property names. */
export const DEFAULT_CATEGORY_PROP = "category";
export const DEFAULT_TYPE_PROP = "type";
export const DEFAULT_IMAGE_PROP = "image";

export const DEFAULT_TWEAKS: NookTweaks = {
  columns: "auto",
  density: "regular",
  showRail: true,
  showBadges: true,
  animations: true,
  groupBy: "category",
  sort: "az",
  layout: "board",
};

export const DEFAULT_DATA: CarrelData = {
  schemaVersion: CARREL_SCHEMA_VERSION,
  nooks: [],
  categories: [],
  customTypes: [],
  activeNookId: null,
  categoryProp: DEFAULT_CATEGORY_PROP,
  typeProp: DEFAULT_TYPE_PROP,
  imageProp: DEFAULT_IMAGE_PROP,
  disabledBuiltinTypes: [],
  typeRules: [],
  excalidrawRendering: false,
};
