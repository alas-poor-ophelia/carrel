// Persisted Carrel data (saveData/loadData). Nooks + the global category list
// live here. Categories fill in in Phase 6.

import type { ContentType } from "../rules/model";

/** How the board groups cards into sections. `bases` (Bases-backed nooks only)
 *  uses the groups the Bases engine already computed from the view's Group by. */
export type GroupBy = "category" | "type" | "folder" | "none" | "bases";

/** How cards are ordered within a section. `custom` reads the nook's
 *  per-section `cardOrder` (drag-arranged); `bases` (Bases-backed nooks only)
 *  keeps the order the Bases engine delivered — the view's own sort toolbar
 *  is the sort UI; the rest are computed presets. */
export type SortMode = "az" | "za" | "type" | "custom" | "bases";

/** The board's render path. `board` is the column-balancing masonry (default);
 *  `kanban` lays categories out as horizontal swimlanes (see `kanbanColumns`). */
export type LayoutMode = "board" | "kanban";

/** Masonry column count: `auto` fits columns to the board width; a number pins it. */
export type ColumnCount = "auto" | 1 | 2 | 3 | 4;

/** How a collapsed card's cover image fills its box when the note doesn't say
 *  (`imageScaleType`): `auto` picks by orientation, the others force a fit. */
export type CoverFit = "auto" | "contain" | "cover";

/** Per-nook display tweaks (surfaced as Style Settings / UI in Phase 7). */
export interface NookTweaks {
  columns: ColumnCount;
  density: "compact" | "regular" | "comfy";
  showRail: boolean;
  showBadges: boolean;
  animations: boolean;
  coverFit: CoverFit;
  /** Collapsed cover box shape as height ÷ width (0.75 = 4:3, 1 = square). */
  coverAspect: number;
  /** Height cap, in px, of the collapsed cover box. */
  coverMaxHeight: number;
  /** Show the note's preview under a cover that comes from the image property
   *  (a note that IS its picture has no other text, so it stays cover-only). */
  coverPreview: boolean;
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
  /** Front-matter property a note's card ICON image is read from (default
   *  `icon-image`). When it points at a resolvable image (`![[x]]`, `[[x]]`, a
   *  bare path, or an external URL), that image replaces the type/category
   *  glyph in the card's top-left icon box — for that note only. A blank or
   *  unresolvable value is ignored and the glyph is used. */
  iconImageProp: string;
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

export const CARREL_SCHEMA_VERSION = 6;

/** Built-in defaults for the configurable front-matter property names. */
export const DEFAULT_CATEGORY_PROP = "category";
export const DEFAULT_TYPE_PROP = "type";
export const DEFAULT_IMAGE_PROP = "image";
export const DEFAULT_ICON_IMAGE_PROP = "icon-image";

export const DEFAULT_TWEAKS: NookTweaks = {
  columns: "auto",
  density: "regular",
  showRail: true,
  showBadges: true,
  animations: true,
  coverFit: "auto",
  coverAspect: 0.75,
  coverMaxHeight: 220,
  coverPreview: true,
  groupBy: "category",
  sort: "az",
  layout: "board",
};

/** The choices (value → label) and slider ranges behind each display setting,
 *  shared by the two places they are edited: the nook settings modal and a
 *  Bases view's own options. */
export const THEME_CHOICES: Record<Nook["theme"], string> = { brand: "Ember", obsidian: "Obsidian" };
export const DENSITY_CHOICES: Record<NookTweaks["density"], string> = {
  compact: "Compact",
  regular: "Regular",
  comfy: "Comfortable",
};
export const COLUMN_CHOICES: Record<`${ColumnCount}`, string> = { auto: "Auto", 1: "1", 2: "2", 3: "3", 4: "4" };
export const COVER_FIT_CHOICES: Record<CoverFit, string> = { auto: "Auto", contain: "Contain", cover: "Cover" };
export const COVER_ASPECT_RANGE = { min: 0.25, max: 2, step: 0.05 };
export const COVER_MAX_HEIGHT_RANGE = { min: 60, max: 480, step: 10 };

/** A column choice as a dropdown delivers it (`"auto"`, `"1"`…) → the setting. */
export function toColumnCount(choice: `${ColumnCount}`): ColumnCount {
  return choice === "auto" ? "auto" : (Number(choice) as ColumnCount);
}

/** The display settings a board renders with. A folder nook supplies all of
 *  them (its theme + tweaks); a Bases view supplies them from its own view
 *  options, with the hidden nook's values as the fallback. */
export type BoardDisplay = Pick<Nook, "theme"> &
  Pick<
    NookTweaks,
    | "columns"
    | "density"
    | "showRail"
    | "showBadges"
    | "animations"
    | "coverFit"
    | "coverAspect"
    | "coverMaxHeight"
    | "coverPreview"
  >;

export const DEFAULT_DATA: CarrelData = {
  schemaVersion: CARREL_SCHEMA_VERSION,
  nooks: [],
  categories: [],
  customTypes: [],
  activeNookId: null,
  categoryProp: DEFAULT_CATEGORY_PROP,
  typeProp: DEFAULT_TYPE_PROP,
  imageProp: DEFAULT_IMAGE_PROP,
  iconImageProp: DEFAULT_ICON_IMAGE_PROP,
  disabledBuiltinTypes: [],
  typeRules: [],
  excalidrawRendering: false,
};
