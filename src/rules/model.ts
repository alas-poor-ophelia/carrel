/* =====================================================================
   Reference-tab data model (pure — no obsidian import, unit-testable).

   A "rule doc" is one markdown note a character has assigned. The note's
   body is parsed into a `type` (content category for badge/filter/accent)
   and a list of typed `blocks` that each render bespoke. Declaration is
   optional: structure is inferred from plain markdown, and an author may
   override with a leading `<!-- ref: ... -->` comment (or frontmatter) and
   per-block `<!-- block: ... -->` comments. See `parse.ts`.
   ===================================================================== */

export type ContentType =
  | "ability"
  | "deed"
  | "trait"
  | "flowchart"
  | "table"
  | "formula"
  | "process"
  | "lore"
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

/** A typed content block. Prose (`p`) keeps raw markdown for hybrid render
 *  through Obsidian's MarkdownRenderer; everything else is bespoke. */
export type RuleBlock =
  | { t: "p"; term?: string; text: string }
  | { t: "table"; caption?: string; cols: string[]; rows: string[][] }
  | { t: "flow"; nodes: FlowNode[] }
  | { t: "dice"; expr: string; mod?: number; label?: string }
  | { t: "checklist"; items: { text: string }[] }
  | { t: "steps"; items: { text: string }[] }
  | { t: "bullets"; items: { term?: string; text: string }[] }
  | { t: "callout"; text: string; cite?: string };

/** The parser's output for one note body (the per-note fields beyond the
 *  index-level path/title/category/headings). */
export interface ParsedNote {
  type: ContentType;
  icon: string;
  summary: string;
  meta: RuleMeta[];
  blocks: RuleBlock[];
}

export interface RuleDoc {
  path: string;
  title: string;
  category: string;
  headings: string[];
  body: string;
  type: ContentType;
  icon: string;
  summary: string;
  meta: RuleMeta[];
  blocks: RuleBlock[];
}
