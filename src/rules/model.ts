/* =====================================================================
   Reference-tab data model (pure — no obsidian import, unit-testable).

   A "rule doc" is one markdown note a character has assigned. The note's
   body is parsed into a `type` (content category for badge/filter/accent)
   and a list of typed `blocks` that each render bespoke. Declaration is
   optional: structure is inferred from plain markdown, and an author may
   override with a leading `<!-- ref: ... -->` comment (or frontmatter) and
   per-block `<!-- block: ... -->` comments. See `parse.ts`.
   ===================================================================== */

/** The built-in, parser-backed content types. User-declared custom types are
 *  plain strings matched at runtime (see registry.resolveType); a doc's `type`
 *  is therefore widened to `string` below. */
export type ContentType =
  | "flowchart"
  | "table"
  | "formula"
  | "lookup"
  | "process"
  | "quote"
  | "image"
  | "reference";

/** A small uppercase chip (action cost / range / uses). */
export interface RuleMeta {
  k: string;
}

export type FlowNode =
  | { kind: "start" | "note" | "check"; text: string }
  | {
      kind: "branch";
      branches: { label: string; tone: "success" | "fail"; text: string }[];
    }
  | { kind: "options"; items: string[] };

/** How a card image is fitted into its box. `auto` (the default) picks per
 *  orientation — portrait → `contain` (no top/bottom crop), landscape → `cover`.
 *  `fit` = contain, `fill` = cover, `stretch` = fill (distorts). Set note-wide
 *  via the `imageScaleType` front-matter property. */
export type ImageScaleType = "auto" | "fit" | "fill" | "stretch";

/** A typed content block. Prose (`p`) keeps raw markdown for hybrid render
 *  through Obsidian's MarkdownRenderer; everything else is bespoke. */
export type RuleBlock =
  | { t: "p"; term?: string; text: string }
  | { t: "table"; caption?: string; cols: string[]; rows: string[][] }
  | { t: "flow"; nodes: FlowNode[] }
  | { t: "dice"; expr: string; mod?: number; label?: string }
  | { t: "rolltable"; ref: string; label?: string }
  | { t: "lookuptable"; formula: string; cols: string[]; rows: string[][]; caption?: string }
  | { t: "checklist"; items: { text: string }[] }
  | { t: "steps"; items: { text: string }[] }
  | { t: "bullets"; items: { term?: string; text: string }[] }
  | { t: "callout"; text: string; cite?: string }
  | { t: "obsidian-callout"; calloutType: string; content: string }
  /** A standalone image embed (`![[pic.png]]` / `![alt](pic.png)`) or one
   *  supplied via the configurable image front-matter property. `src` is the
   *  raw linktext/path as written; resolution to a vault resource URL happens at
   *  render time (needs the owning note's path). `isEmbed` distinguishes a
   *  `[[wikilink]]` embed from a markdown/external path. `scale` is the note's
   *  resolved `imageScaleType` (absent → treated as `auto` at render).
   *  `cover` marks the block injected from the configurable image front-matter
   *  property: it has no body source, so it renders as the CardImage widget.
   *  Body image embeds are NOT covers — they stay in the native region so
   *  Obsidian draws them (theme alt-args, size hints and anchors all apply). */
  | { t: "image"; src: string; alt?: string; isEmbed: boolean; scale?: ImageScaleType; cover?: boolean }
  /** An Excalidraw drawing — a `.excalidraw.md` note (detected by its
   *  `excalidraw-plugin` frontmatter) whose markdown body is only the plugin's
   *  banner + hidden JSON. Rendered as the exported SVG via the Excalidraw
   *  plugin's automate API. `src` is the linkpath when a drawing is embedded
   *  from another note; undefined when the card note itself IS the drawing. */
  | { t: "excalidraw"; src?: string };

/** Block types Carrel renders as bespoke interactive widgets (own UI, roll
 *  engine, per-nook persisted state, or custom layout) — everything ELSE is
 *  ordinary prose handed verbatim to Obsidian's MarkdownRenderer. The render
 *  layer groups runs of non-widget blocks into one native-markdown region so
 *  links, highlights, embeds and footnotes resolve exactly as Obsidian renders
 *  them (no hand-rolled inline parsing). */
export const WIDGET_BLOCK_TYPES = ["dice", "rolltable", "lookuptable", "flow", "checklist", "excalidraw"] as const;

/** Widgets, plus the front-matter cover image (a body image embed is ordinary
 *  markdown and renders natively; see the `image` block doc). */
export function isWidgetBlock(b: RuleBlock): boolean {
  if (b.t === "image") return b.cover === true;
  return (WIDGET_BLOCK_TYPES as readonly string[]).includes(b.t);
}

/** When a card's collapsed preview is derived from an opaque or structural lead
 *  block rather than prose, this kind drives a small labeled badge on the card
 *  ("Code"/plugin name, "Table", "Embed"). Undefined for an ordinary prose
 *  summary or an author-provided frontmatter/ref summary. */
export type SummaryKind = "code" | "table" | "embed" | "roll";

/** The parser's output for one note body (the per-note fields beyond the
 *  index-level path/title/category/headings). */
export interface ParsedNote {
  /** A built-in ContentType or a user-declared custom-type id. */
  type: string;
  icon: string;
  iconSet: "lucide" | "rpg";
  /** Per-note icon-image override (normalized src: vault path or external URL).
   *  When it resolves to a real image at render time it replaces the glyph in
   *  the card's icon box; unresolvable refs fall back to icon/iconSet. */
  iconImage?: string;
  /** Plain-text form of the preview lead. Used ONLY as search-index text —
   *  the collapsed card itself renders `leadMd` through Obsidian. */
  summary: string;
  /** Badge kind for a non-prose preview lead (see SummaryKind). */
  summaryKind?: SummaryKind;
  /** Kind-specific badge detail: the code language/plugin id, or table dims. */
  summaryNote?: string;
  /** Verbatim markdown of the note's lead block(s): what the collapsed card
   *  renders natively through Obsidian's MarkdownRenderer (clamped by CSS).
   *  Empty when there is nothing to show beyond the badge. */
  leadMd: string;
  meta: RuleMeta[];
  blocks: RuleBlock[];
  /** The verbatim source markdown each block was parsed from, aligned 1:1 with
   *  `blocks`. The render layer feeds runs of non-widget blocks' source straight
   *  to Obsidian's MarkdownRenderer. */
  blockSources: string[];
}

/** What the Bases engine already decided about a doc (Bases-backed nooks
 *  only): its position in the view's presorted result and the group it landed
 *  in. Carrel renders these as delivered — it never re-sorts or re-groups. */
export interface BasesDocMeta {
  /** Index in `BasesQueryResult.data` (user-configured sort + limit applied). */
  order: number;
  /** The group's key as text ("" for the keyless group). */
  group: string;
  /** Index of the group in `BasesQueryResult.groupedData`. */
  groupIndex: number;
  /** Values the Bases engine evaluated for this entry (a note property, a
   *  formula, a file property — whatever the view's Carrel options point at),
   *  keyed by Carrel's configured front-matter property names. Merged over the
   *  note's own front matter before parsing, so the existing image / icon /
   *  type / category readers see them with no second code path. */
  props?: Record<string, string>;
}

export interface RuleDoc {
  path: string;
  title: string;
  category: string;
  headings: string[];
  body: string;
  /** A built-in ContentType or a user-declared custom-type id. */
  type: string;
  icon: string;
  iconSet: "lucide" | "rpg";
  /** Per-note icon-image override (see ParsedNote.iconImage). */
  iconImage?: string;
  /** Plain-text preview lead — search-index text only (see ParsedNote.summary). */
  summary: string;
  /** Badge kind for a non-prose preview lead (see SummaryKind). */
  summaryKind?: SummaryKind;
  /** Kind-specific badge detail: the code language/plugin id, or table dims. */
  summaryNote?: string;
  /** Verbatim lead markdown the collapsed card renders natively (see ParsedNote.leadMd). */
  leadMd: string;
  meta: RuleMeta[];
  blocks: RuleBlock[];
  blockSources: string[];
  /** Present only when the doc came from a Bases query (see BasesDocMeta). */
  bases?: BasesDocMeta;
}
