/* =====================================================================
   Note parser (pure — unit-tested in tests/unit/rules/parse.test.ts).

   parseNote(body, frontmatter) -> ParsedNote { type, icon, summary, meta, blocks }

   Declaration is optional and layered:
     1. frontmatter keys (type / category / summary / meta / icon)
     2. a leading `<!-- ref: <type> key:"val" ... -->` comment
     3. structural inference from plain markdown
   Per-block, an immediately-preceding `<!-- block: <type> key:"val" -->`
   comment overrides the inferred block type and supplies extra attributes
   (table caption, callout cite, dice expr/mod/label, flow). Notes a user
   never tags still render — they just lean on inference.
   ===================================================================== */

import type {
  ContentType,
  FlowNode,
  ParsedNote,
  RuleBlock,
  RuleMeta,
} from "./model";
import { CONTENT_TYPES, isContentType } from "./registry";

const REF_RE = /^\s*<!--\s*ref:\s*([\s\S]*?)-->\s*/i;
const BLOCK_RE = /^\s*<!--\s*block:\s*([\s\S]*?)-->\s*$/i;

interface Attrs {
  /** the leading bare word, e.g. `ability` in `ref: ability cost:"..."` */
  type?: string;
  pairs: [string, string][];
}

/** Parse `type key:"quoted value" other:token` into a type + key/value pairs. */
function parseAttrs(s: string): Attrs {
  const pairs: [string, string][] = [];
  let type: string | undefined;
  const re = /(\w+):"([^"]*)"|(\w+):(\S+)|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (m[1] !== undefined) pairs.push([m[1].toLowerCase(), m[2]]);
    else if (m[3] !== undefined) pairs.push([m[3].toLowerCase(), m[4]]);
    else if (m[5] !== undefined && type === undefined) type = m[5].toLowerCase();
  }
  return { type, pairs };
}

function attr(a: Attrs, key: string): string | undefined {
  const found = a.pairs.find(([k]) => k === key);
  return found ? found[1] : undefined;
}

/* ---------- block classification helpers ---------- */

const CHECK_RE = /^\s*[-*+]\s+\[[ xX]\]\s+/;
const BULLET_RE = /^\s*[-*+]\s+/;
const ORDERED_RE = /^\s*\d+[.)]\s+/;
const QUOTE_RE = /^\s*>\s?/;
const TERM_RE = /^\*\*(.+?)\*\*\s*(?:[—–-]{1,2}|:)\s*([\s\S]+)$/;

function isTableGroup(group: string[]): boolean {
  if (group.length < 2) return false;
  const pipey = group.filter((l) => l.includes("|")).length;
  if (pipey < 2) return false;
  // a separator row of dashes/colons/pipes confirms a GFM table
  return group.some((l) => /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/.test(l) && l.includes("-"));
}

function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

function parseTable(group: string[], caption?: string): RuleBlock {
  const rows = group.filter((l) => l.includes("|"));
  const cols = rows.length ? splitRow(rows[0]) : [];
  let bodyStart = 1;
  if (rows[1] && /^[\s:|-]+$/.test(rows[1])) bodyStart = 2; // skip separator
  const body = rows.slice(bodyStart).map(splitRow);
  return { t: "table", caption, cols, rows: body };
}

function stripBullet(line: string): string {
  return line.replace(BULLET_RE, "").trim();
}

function termItem(text: string): { term?: string; text: string } {
  const m = text.match(TERM_RE);
  return m ? { term: m[1].trim(), text: m[2].trim() } : { text };
}

function parseCallout(group: string[], cite?: string): RuleBlock {
  const lines = group.map((l) => l.replace(QUOTE_RE, ""));
  // a trailing `— attribution` line inside the quote becomes the cite
  let c = cite;
  if (!c && lines.length) {
    const last = lines[lines.length - 1].trim();
    const cm = last.match(/^[—–-]{1,2}\s*(.+)$/);
    if (cm) {
      c = cm[1].trim();
      lines.pop();
    }
  }
  return { t: "callout", text: lines.join("\n").trim(), cite: c };
}

/* ---------- flow DSL ---------- *
   Inside a ```ref-flow fence (or a `<!-- block: flow -->`-tagged list):
     start:   You attempt to grapple a creature
     note:    Provokes an attack of opportunity unless ...
     check:   Melee check: your CMB vs the target's CMD
     branch:
       success: You both gain the grappled condition.
       fail:    The grapple fails.
     note:    On later turns, make another CMB check, then choose:
     options: Move both | Deal damage | Pin | Tie up
*/
function parseFlow(lines: string[]): FlowNode[] {
  const nodes: FlowNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.trim();
    if (!line) {
      i++;
      continue;
    }
    const m = line.match(/^(start|note|check|branch|options|success|fail)\s*:\s*(.*)$/i);
    if (!m) {
      i++;
      continue;
    }
    const key = m[1].toLowerCase();
    const rest = m[2].trim();
    if (key === "start" || key === "note" || key === "check") {
      nodes.push({ kind: key as "start" | "note" | "check", text: rest });
      i++;
    } else if (key === "options") {
      nodes.push({ kind: "options", items: rest.split("|").map((s) => s.trim()).filter(Boolean) });
      i++;
    } else if (key === "branch") {
      const branches: { label: string; tone: "success" | "fail"; text: string }[] = [];
      i++;
      while (i < lines.length) {
        const bm = lines[i].trim().match(/^(success|fail)\s*:\s*(.*)$/i);
        if (!bm) break;
        const tone = bm[1].toLowerCase() as "success" | "fail";
        branches.push({
          label: tone === "success" ? "Success" : "Failure",
          tone,
          text: bm[2].trim(),
        });
        i++;
      }
      nodes.push({ kind: "branch", branches });
    } else if (key === "success" || key === "fail") {
      // a bare success/fail outside an explicit branch — fold into one
      const tone = key as "success" | "fail";
      nodes.push({
        kind: "branch",
        branches: [
          { label: tone === "success" ? "Success" : "Failure", tone, text: rest },
        ],
      });
      i++;
    } else {
      i++;
    }
  }
  return nodes;
}

function diceFromAttrs(a: Attrs): RuleBlock {
  const modStr = attr(a, "mod");
  const mod = modStr !== undefined ? Number(modStr) : undefined;
  return {
    t: "dice",
    expr: attr(a, "expr") ?? "1d20",
    mod: Number.isFinite(mod) ? mod : undefined,
    label: attr(a, "label"),
  };
}

/** Classify a contiguous block of non-blank lines, honoring an optional
 *  per-block override directive. */
function classify(group: string[], override: Attrs | null): RuleBlock {
  const forced = override?.type;
  const caption = override ? attr(override, "caption") : undefined;
  const cite = override ? attr(override, "cite") : undefined;

  if (forced === "table" || (forced === undefined && isTableGroup(group))) {
    return parseTable(group, caption);
  }
  if (forced === "checklist" || (forced === undefined && CHECK_RE.test(group[0]))) {
    return {
      t: "checklist",
      items: group
        .filter((l) => CHECK_RE.test(l))
        .map((l) => ({ text: l.replace(CHECK_RE, "").trim() })),
    };
  }
  if (forced === "steps" || (forced === undefined && ORDERED_RE.test(group[0]))) {
    return {
      t: "steps",
      items: group
        .filter((l) => ORDERED_RE.test(l))
        .map((l) => ({ text: l.replace(ORDERED_RE, "").trim() })),
    };
  }
  if (forced === "bullets" || (forced === undefined && BULLET_RE.test(group[0]))) {
    return {
      t: "bullets",
      items: group.filter((l) => BULLET_RE.test(l)).map((l) => termItem(stripBullet(l))),
    };
  }
  if (forced === "callout" || (forced === undefined && QUOTE_RE.test(group[0]))) {
    return parseCallout(group, cite);
  }
  // default: a prose paragraph (raw markdown, with an optional lead term)
  const text = group.join("\n").trim();
  const tm = text.match(TERM_RE);
  if (tm) return { t: "p", term: tm[1].trim(), text: tm[2].trim() };
  return { t: "p", text };
}

function parseBlocks(text: string): RuleBlock[] {
  const lines = text.split(/\r?\n/);
  const blocks: RuleBlock[] = [];
  let pending: Attrs | null = null;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    const bm = line.match(BLOCK_RE);
    if (bm) {
      pending = parseAttrs(bm[1]);
      // dice carries its whole payload in the directive — emit immediately
      if (pending.type === "dice") {
        blocks.push(diceFromAttrs(pending));
        pending = null;
      }
      i++;
      continue;
    }
    const fence = line.match(/^\s*```(\S*)\s*$/);
    if (fence) {
      const lang = fence[1];
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) {
        buf.push(lines[i]);
        i++;
      }
      i++; // consume closing fence
      if (lang === "ref-flow" || pending?.type === "flow") {
        blocks.push({ t: "flow", nodes: parseFlow(buf) });
      } else {
        blocks.push({ t: "p", text: "```" + lang + "\n" + buf.join("\n") + "\n```" });
      }
      pending = null;
      continue;
    }
    // a `<!-- block: flow -->` tag applied to an indented list (not a fence)
    if (pending?.type === "flow") {
      const group: string[] = [];
      while (i < lines.length && lines[i].trim() && !BLOCK_RE.test(lines[i])) {
        group.push(lines[i]);
        i++;
      }
      blocks.push({ t: "flow", nodes: parseFlow(group) });
      pending = null;
      continue;
    }
    const group: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !BLOCK_RE.test(lines[i]) &&
      !/^\s*```/.test(lines[i])
    ) {
      group.push(lines[i]);
      i++;
    }
    blocks.push(classify(group, pending));
    pending = null;
  }
  return blocks;
}

function inferType(blocks: RuleBlock[]): ContentType {
  if (blocks.some((b) => b.t === "flow")) return "flowchart";
  if (blocks.some((b) => b.t === "dice")) return "formula";
  if (blocks.length && blocks[0].t === "callout") return "lore";
  if (blocks.some((b) => b.t === "checklist" || b.t === "steps")) return "process";
  const tables = blocks.filter((b) => b.t === "table").length;
  const prose = blocks.filter((b) => b.t === "p").length;
  if (tables > 0 && tables >= prose) return "table";
  return "reference";
}

const MD_STRIP = /(\*\*|__|\*|_|`)/g;
const WIKILINK = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;

function firstProseText(blocks: RuleBlock[]): string {
  const p = blocks.find((b): b is { t: "p"; term?: string; text: string } => b.t === "p");
  if (!p) return "";
  const raw = (p.term ? p.term + " — " : "") + p.text;
  const clean = raw.replace(WIKILINK, "$1").replace(MD_STRIP, "").replace(/\s+/g, " ").trim();
  return clean.length > 180 ? clean.slice(0, 177).trimEnd() + "…" : clean;
}

const HEADING_RE = /^\s*#{1,6}\s+.*(?:\r?\n|$)/;

export function parseNote(
  body: string,
  frontmatter: Record<string, unknown> = {}
): ParsedNote {
  let text = body;

  // The card shows the note's title separately, so drop a leading heading that
  // would otherwise re-render as a duplicate H1. A leading `<!-- ref: -->`
  // comment may sit on either side of that heading.
  let refAttrs: Attrs = { pairs: [] };
  let refMatched = false;
  for (let i = 0; i < 2; i++) {
    text = text.replace(HEADING_RE, "");
    const refM = text.match(REF_RE);
    if (refM && !refMatched) {
      refAttrs = parseAttrs(refM[1]);
      text = text.slice(refM[0].length);
      refMatched = true;
    }
  }

  // meta chips: frontmatter `meta` array wins, else the ref comment's
  // key/value pairs (excluding the reserved icon/summary keys)
  const meta: RuleMeta[] = [];
  if (Array.isArray(frontmatter.meta)) {
    for (const v of frontmatter.meta) if (v != null) meta.push({ k: String(v) });
  } else {
    for (const [k, v] of refAttrs.pairs) {
      if (k !== "icon" && k !== "summary") meta.push({ k: v });
    }
  }

  const blocks = parseBlocks(text);

  const declared =
    (typeof frontmatter.type === "string" ? frontmatter.type.toLowerCase() : undefined) ??
    refAttrs.type;
  const type: ContentType = isContentType(declared) ? declared : inferType(blocks);

  const fmIcon = typeof frontmatter.icon === "string" ? frontmatter.icon : undefined;
  const icon = fmIcon || attr(refAttrs, "icon") || CONTENT_TYPES[type].glyph;

  const fmSummary = typeof frontmatter.summary === "string" ? frontmatter.summary : undefined;
  const summary = fmSummary ?? attr(refAttrs, "summary") ?? firstProseText(blocks);

  return { type, icon, summary, meta, blocks };
}
