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

import type { CustomType, TypeRule } from "../types/data";
import type {
  ContentType,
  FlowNode,
  ImageScaleType,
  ParsedNote,
  RuleBlock,
  RuleMeta,
  SummaryKind,
} from "./model";
import { isKnownType, resolveType } from "./registry";
import { truncateInline } from "../util/text";

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
/** An Obsidian callout/admonition opener: `> [!type]` with an optional
 *  `|fold`/metadata suffix. Captures the bare callout type. Distinguishes a
 *  styled callout (e.g. an `infobox`) from a plain literary blockquote. */
const OBSIDIAN_CALLOUT_RE = /^\s*>\s*\[!([^\]|]+)(?:\|[^\]]*)?\]/;
const TERM_RE = /^\*\*(.+?)\*\*\s*(?:[—–-]{1,2}|:)\s*([\s\S]+)$/;

/* ---------- image embeds ---------- */

const IMAGE_EXT = "png|jpe?g|gif|webp|svg|bmp|avif";
/** `![[path/pic.png|alias]]` (with optional `#anchor` and size/alias suffix). */
const IMG_EMBED_RE = new RegExp(
  `^!\\[\\[\\s*([^\\]|#]+?\\.(?:${IMAGE_EXT}))\\s*(?:#[^|\\]]*)?(?:\\|([^\\]]*))?\\]\\]$`,
  "i"
);
/** `![alt](path/pic.png "title")`. */
const IMG_MD_RE = new RegExp(
  `^!\\[([^\\]]*)\\]\\(\\s*(\\S+?\\.(?:${IMAGE_EXT}))(?:\\s+"[^"]*")?\\s*\\)$`,
  "i"
);
/** `[[path/pic]]` wikilink (no `!`) — only used when normalizing an explicit
 *  image front-matter value, never for body scanning. */
const WIKI_REF_RE = /^\[\[\s*([^\]|#]+?)\s*(?:#[^|\]]*)?(?:\|([^\]]*))?\]\]$/;

interface ImageRef {
  src: string;
  alt?: string;
  isEmbed: boolean;
}

/** A `|alias` on an image embed is alt text UNLESS it's purely an Obsidian size
 *  hint (`200` / `200x100`), in which case there is no real alt. */
function aliasAlt(alias: string | undefined): string | undefined {
  const a = alias?.trim();
  if (a == null || a === "" || /^\d+(?:x\d+)?$/.test(a)) return undefined;
  return a;
}

/** Match a line that is SOLELY an image embed (`![[…]]` or `![](…)`). Returns
 *  null for prose, a `>`-quoted line, or an image mixed with other text. */
function matchImageLine(line: string): ImageRef | null {
  const t = line.trim();
  const em = IMG_EMBED_RE.exec(t);
  if (em) return { src: em[1].trim(), alt: aliasAlt(em[2]), isEmbed: true };
  const md = IMG_MD_RE.exec(t);
  if (md) {
    const alt = md[1].trim();
    return { src: md[2].trim(), alt: alt !== "" ? alt : undefined, isEmbed: false };
  }
  return null;
}

/** Normalize a configurable image front-matter value (`![[x.png]]`, `[[x.png]]`,
 *  a bare `x.png`, or an external URL) into an ImageRef. */
function normalizeImageRef(raw: string): ImageRef {
  const s = raw.trim();
  const embed = matchImageLine(s);
  if (embed) return embed;
  const wiki = WIKI_REF_RE.exec(s);
  if (wiki) return { src: wiki[1].trim(), alt: aliasAlt(wiki[2]), isEmbed: true };
  // a bare filename/path (common Bases/Dataview cover form) or an external URL
  return { src: s, isEmbed: !/^[a-z]+:\/\//i.test(s) };
}

function imageBasename(src: string): string {
  const noQuery = src.split(/[?#]/)[0];
  return (noQuery.split(/[\\/]/).pop() ?? noQuery).trim().toLowerCase();
}

/** Dedupe key so an explicit `image: cover.png` and a body `![[cover.png]]` are
 *  recognized as the same picture and not rendered twice. */
function sameImageSrc(a: string, b: string): boolean {
  return imageBasename(a) === imageBasename(b);
}

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
  if (c == null && lines.length > 0) {
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
      nodes.push({ kind: key, text: rest });
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
      const tone = key;
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

function rollTableFromAttrs(a: Attrs): RuleBlock {
  return {
    t: "rolltable",
    ref: attr(a, "ref") ?? "",
    label: attr(a, "label"),
  };
}

/** Classify a contiguous block of non-blank lines, honoring an optional
 *  per-block override directive. */
function classify(group: string[], override: Attrs | null): RuleBlock {
  const forced = override?.type;
  const caption = override ? attr(override, "caption") : undefined;
  const cite = override ? attr(override, "cite") : undefined;

  if (forced === "table" || forced === "lookup" || (forced === undefined && isTableGroup(group))) {
    const tbl = parseTable(group, caption);
    // A Dice Roller lookup table: first header cell is a `dice:` formula. Promote
    // it to a rollable lookuptable block (and the note infers the `lookup` type).
    if (tbl.t === "table" && /^\s*dice\s*:/i.test(tbl.cols[0] ?? "")) {
      return {
        t: "lookuptable",
        formula: tbl.cols[0].replace(/^\s*dice\s*:/i, "").trim(),
        cols: tbl.cols,
        rows: tbl.rows,
        caption: tbl.caption,
      };
    }
    return tbl;
  }
  // A checklist (Carrel's per-nook tickable widget) only when EVERY line is a
  // `- [ ]` item; a list that mixes checkboxes and plain bullets falls through
  // to native bullets (rendered verbatim) rather than silently dropping the
  // plain lines. An explicit `<!-- block: checklist -->` still forces it.
  if (forced === "checklist" || (forced === undefined && group.every((l) => CHECK_RE.test(l)))) {
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

/** Parse the body into typed blocks AND the verbatim source markdown each block
 *  came from (aligned 1:1). The render layer hands runs of non-widget blocks'
 *  source straight to Obsidian's MarkdownRenderer; widget blocks carry a source
 *  too (kept only for alignment — widgets render bespoke). */
function parseBlocks(text: string): { blocks: RuleBlock[]; sources: string[] } {
  const lines = text.split(/\r?\n/);
  const blocks: RuleBlock[] = [];
  const sources: string[] = [];
  const push = (b: RuleBlock, src: string): void => {
    blocks.push(b);
    sources.push(src);
  };
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
      // dice/rolltable carry their whole payload in the directive — emit now
      if (pending.type === "dice") {
        push(diceFromAttrs(pending), line);
        pending = null;
      } else if (pending.type === "rolltable") {
        push(rollTableFromAttrs(pending), line);
        pending = null;
      }
      i++;
      continue;
    }
    // Accept any opening fence: the language is the first token, but an info
    // string may carry extra words (```js title="x", ```python {1,3}). Matching
    // only `lang` + end-of-line here previously let such a fence slip past — and
    // the generic grouper below refuses any ```-led line — hanging the parser.
    const fence = line.match(/^\s*```(\S*).*$/);
    if (fence) {
      const lang = fence[1];
      const open = line;
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) {
        buf.push(lines[i]);
        i++;
      }
      const close = i < lines.length ? lines[i] : "```";
      i++; // consume closing fence
      const fenceSrc = [open, ...buf, close].join("\n");
      if (lang === "ref-flow" || pending?.type === "flow") {
        push({ t: "flow", nodes: parseFlow(buf) }, fenceSrc);
      } else {
        push({ t: "p", text: "```" + lang + "\n" + buf.join("\n") + "\n```" }, fenceSrc);
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
      push({ t: "flow", nodes: parseFlow(group) }, group.join("\n"));
      pending = null;
      continue;
    }
    // An Obsidian callout/infobox (`> [!type]`): consume the whole run of
    // `>`-prefixed lines (internal blank `>` separators included) as ONE block,
    // rendered later through Obsidian's MarkdownRenderer so embeds, headings and
    // tables inside resolve. Sits ABOVE the generic grouper so it is never
    // misread as a GFM table or a plain literary blockquote.
    if (OBSIDIAN_CALLOUT_RE.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) {
        buf.push(lines[i]);
        i++;
      }
      const m = buf[0].match(OBSIDIAN_CALLOUT_RE);
      const content = buf.join("\n");
      push(
        {
          t: "obsidian-callout",
          calloutType: (m?.[1] ?? "").trim().toLowerCase(),
          content,
        },
        content
      );
      pending = null;
      continue;
    }
    // A standalone image embed (or a run of stacked ones) becomes image
    // block(s). Sits ABOVE the generic grouper so a lone `![[pic.png]]` is
    // promoted rather than swallowed into a prose paragraph; an image MIXED with
    // adjacent prose (no blank line between) is left to the grouper, where
    // Obsidian's renderer draws it inline. Only when no block type is forced.
    if (pending?.type === undefined && matchImageLine(line)) {
      while (i < lines.length) {
        const im = matchImageLine(lines[i]);
        if (!im) break;
        push({ t: "image", src: im.src, alt: im.alt, isEmbed: im.isEmbed }, lines[i]);
        i++;
      }
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
    // Safety net: if the grouper consumed nothing (a ```-led line the fence
    // matcher above declined to take), skip it so `i` always advances. A
    // non-advancing iteration here would spin forever and freeze the app.
    if (group.length === 0) {
      pending = null;
      i++;
      continue;
    }
    const blk = classify(group, pending);
    // Drop standalone block-id anchors (`^my-id`) — they're reference targets,
    // not display content (e.g. the `^id` line under a Dice Roller lookup table).
    if (!(blk.t === "p" && /^\^[\w-]+$/.test(blk.text.trim()))) push(blk, group.join("\n"));
    pending = null;
  }
  return { blocks, sources };
}

/** Maximum non-image, non-heading prose a note may carry and still count as
 *  "image-prominent" (a caption / one short line). */
const IMAGE_PROSE_BUDGET = 160;

/** The image is the only — or close to the only — content: ≥1 image block, no
 *  structured (table/list/flow/…) content, and prose under the caption budget. */
function isImageProminent(blocks: RuleBlock[]): boolean {
  if (!blocks.some((b) => b.t === "image")) return false;
  let proseChars = 0;
  for (const b of blocks) {
    if (b.t === "image" || isHeadingProse(b)) continue;
    if (b.t !== "p") return false; // structured content -> a real note, not an image
    proseChars += (b.term?.length ?? 0) + b.text.length;
  }
  return proseChars <= IMAGE_PROSE_BUDGET;
}

function inferType(blocks: RuleBlock[], disabled: ContentType[] = []): ContentType {
  const on = (t: ContentType): boolean => !disabled.includes(t);
  if (on("image") && isImageProminent(blocks)) return "image";
  if (on("flowchart") && blocks.some((b) => b.t === "flow")) return "flowchart";
  if (on("lookup") && blocks.some((b) => b.t === "lookuptable")) return "lookup";
  if (on("formula") && blocks.some((b) => b.t === "dice" || b.t === "rolltable")) return "formula";
  // A leading section heading isn't content — look past it for the quote signal.
  if (on("quote") && blocks.find((b) => !isHeadingProse(b))?.t === "callout") return "quote";
  if (on("process") && blocks.some((b) => b.t === "checklist" || b.t === "steps")) return "process";
  const tables = blocks.filter((b) => b.t === "table").length;
  const prose = blocks.filter((b) => b.t === "p" && !isHeadingProse(b)).length;
  if (on("table") && tables > 0 && tables >= prose) return "table";
  return "reference";
}

/** Stringify only primitive frontmatter values; objects/arrays/null -> "". */
function asScalarString(v: unknown): string {
  return typeof v === "string" || typeof v === "number" || typeof v === "boolean"
    ? String(v)
    : "";
}

/** Does a user TypeRule match this note's metadata (frontmatter + tags)? Reads
 *  the metadata cache only — never the note body. An unknown kind (e.g. data
 *  written by a newer build) never matches. */
function ruleMatches(
  rule: TypeRule,
  frontmatter: Record<string, unknown>,
  tags: string[]
): boolean {
  switch (rule.kind) {
    case "frontmatter-key":
      return frontmatter[rule.key] != null;
    case "frontmatter-key-value": {
      if (rule.value == null || rule.value === "") return false;
      const want = rule.value.toLowerCase();
      const v = frontmatter[rule.key];
      const match = (x: unknown): boolean => asScalarString(x).toLowerCase() === want;
      return Array.isArray(v) ? v.some(match) : match(v);
    }
    case "tag":
      return tags.includes(rule.key.toLowerCase());
    default:
      return false;
  }
}

/** The target type of the first enabled rule that matches, or undefined. */
function matchTypeRule(
  rules: TypeRule[],
  frontmatter: Record<string, unknown>,
  tags: string[]
): string | undefined {
  for (const r of rules) {
    if (r.enabled && ruleMatches(r, frontmatter, tags)) return r.targetType;
  }
  return undefined;
}

const MD_LINK = /\[([^\]]+)\]\([^)]*\)/g;
const WIKILINK = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
/** Shared summary budget (visible chars) — see truncateInline. */
const SUMMARY_MAX = 180;
/** A paragraph that is only a footnote/link reference DEFINITION (`[^1]: …`)
 *  carries no readable lead — skip it when picking a card summary. */
const DEF_PROSE_RE = /^\s*\[\^?[^\]]+\]:\s/;

/** A plain-text lead line for one block, used to derive a card summary. Returns
 *  "" for a block that carries no readable lead (an image shows as a thumbnail;
 *  a heading is structure, not content; a flow is too structural to abbreviate). */
function blockPreviewText(b: RuleBlock): string {
  switch (b.t) {
    case "p":
      return isHeadingProse(b) || DEF_PROSE_RE.test(b.text)
        ? ""
        : (b.term != null && b.term !== "" ? b.term + " — " : "") + b.text;
    case "callout":
      return b.text;
    case "obsidian-callout":
      return b.content
        .replace(/^\s*>\s*\[![^\]]*\][^\n]*\n?/, "")
        .replace(/^\s*>\s?/gm, "")
        .trim();
    case "table":
      return b.rows[0]?.join(" · ") ?? b.cols.join(" · ");
    case "lookuptable":
      return b.caption ?? b.formula;
    case "bullets": {
      const it = b.items[0];
      if (it === undefined) return "";
      return (it.term != null && it.term !== "" ? it.term + " — " : "") + it.text;
    }
    case "steps":
      // A numbered process: keep the ordinals so the preview reads as the list
      // it is ("1. … 2. … 3. …"), not a lone unnumbered first line.
      return b.items.map((it, i) => `${i + 1}. ${it.text}`).join(" ");
    case "checklist":
      return b.items[0]?.text ?? "";
    case "dice":
    case "rolltable":
      return b.label ?? "";
    case "flow":
    case "image":
      return "";
    default:
      return "";
  }
}

const FENCE_RE = /^\s*`{3,}\s*(\S*)/;
const IMG_EXT_RE = /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i;
const EMBED_ONLY_RE = /^!\[\[([^\]]+)\]\]$/;

/** A `p` block that is really a fenced code block returns its info-string
 *  language (possibly ""); a non-fence block returns null. Code fences are
 *  stored as `p` blocks (so the expanded card renders them through Obsidian's
 *  MarkdownRenderer) — this re-detects them for the PREVIEW only. */
function codeFenceLang(b: RuleBlock): string | null {
  if (b.t !== "p") return null;
  const m = FENCE_RE.exec(b.text);
  return m ? m[1] : null;
}

/** A `p` block that is solely a non-image note embed (`![[Some Note]]`) returns
 *  the target's display name (basename, alias- and extension-stripped); anything
 *  else returns null. Image embeds are `image` blocks and never reach here. */
function embedTarget(b: RuleBlock): string | null {
  if (b.t !== "p") return null;
  const m = EMBED_ONLY_RE.exec(b.text.trim());
  if (!m) return null;
  const inner = m[1];
  if (IMG_EXT_RE.test(inner)) return null;
  const noAlias = inner.split("|")[0];
  const base = noAlias.split(/[\\/]/).pop() ?? noAlias;
  return base.replace(/\.md$/i, "").trim();
}

/** Reduce a raw lead string to card-preview text: drop markdown the card can't
 *  render (comments, code fences, images, callout/quote/heading markers, table
 *  pipes) and unwrap links to their label text, but KEEP the inline marks
 *  (`**`, `*`/`_`, `` ` ``, `~~`) that inlineMd() turns into elements. Highlight
 *  `==` is dropped (inlineMd has no highlight run). Order matters: strip
 *  comments/images/markers BEFORE link unwrapping so `![alt](url)` isn't mistaken
 *  for `[text](url)`. */
function plainLead(raw: string): string {
  return raw
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/^\s*`{3,}[^\n]*$/gm, " ")
    .replace(/!\[\[[^\]]*\]\]/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/^\s*>\s*\[![^\]]*\][^\n]*/gm, " ")
    .replace(/^\s*#{1,6}\s+/gm, " ")
    .replace(/^\s*>\s?/gm, " ")
    .replace(MD_LINK, "$1")
    .replace(WIKILINK, "$1")
    .replace(/==/g, "")
    .replace(/\|/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

interface SummaryLead {
  text: string;
  kind?: SummaryKind;
  note?: string;
}

/** Derive the collapsed-card preview from a note's blocks. Prefers the opening
 *  RUN of prose paragraphs (so a short lead line like a "Source:" citation
 *  doesn't crowd out the prose after it). When there is no prose, falls back to
 *  a typed, labeled lead for the first opaque/structural block — a code/plugin
 *  fence, a note embed, or a table — so the card shows a clear badge instead of
 *  raw source or a blank. */
function firstProseText(blocks: RuleBlock[]): SummaryLead {
  // A code fence or a bare embed is a `p` block but carries no readable prose,
  // so it must not win the prose gather — it's handled as a typed fallback.
  const isProseLead = (b: RuleBlock): b is { t: "p"; term?: string; text: string } =>
    b.t === "p" &&
    !isHeadingProse(b) &&
    !DEF_PROSE_RE.test(b.text) &&
    codeFenceLang(b) === null &&
    embedTarget(b) === null;
  const proseText = (b: { t: "p"; term?: string; text: string }): string =>
    (b.term != null && b.term !== "" ? b.term + " — " : "") + b.text;
  let raw = "";
  for (const b of blocks) {
    if (!isProseLead(b)) {
      if (raw !== "") break;
      // A note that OPENS with a code/plugin fence should read as that block (a
      // typed chip), so stop here and let the fallback badge it — don't skip past
      // to steal prose from below the fence as an un-badged lead.
      if (b.t === "p" && codeFenceLang(b) !== null) break;
      continue;
    }
    raw = raw !== "" ? raw + " " + proseText(b) : proseText(b);
    if (raw.length >= SUMMARY_MAX * 2) break; // enough to fill the budget
  }
  if (raw !== "") return { text: truncateInline(plainLead(raw), SUMMARY_MAX) };

  // Prose gathered from ANYWHERE in the note (not just the lead run) — used to
  // give a typed fallback (e.g. a code fence) a real prose preview when the note
  // opens with an opaque block but has prose below it.
  const proseAnywhere = (): string => {
    let out = "";
    for (const b of blocks) {
      if (!isProseLead(b)) continue;
      out = out !== "" ? out + " " + proseText(b) : proseText(b);
      if (out.length >= SUMMARY_MAX * 2) break;
    }
    return out;
  };

  // No prose lead — derive a typed lead from the first structural/opaque block.
  for (const b of blocks) {
    if (b.t === "p") {
      const lang = codeFenceLang(b);
      if (lang !== null) {
        // Code content is opaque to a preview — NEVER echo it. Show only the type
        // badge, plus any prose the note carries below the fence.
        const prose = proseAnywhere();
        return {
          kind: "code",
          note: lang,
          text: prose !== "" ? truncateInline(plainLead(prose), SUMMARY_MAX) : "",
        };
      }
      const tgt = embedTarget(b);
      if (tgt !== null) return { kind: "embed", text: tgt };
    }
    if (b.t === "table") {
      const dims = `${b.cols.length}×${b.rows.length}`;
      return { kind: "table", note: dims, text: truncateInline(plainLead(blockPreviewText(b)), SUMMARY_MAX) };
    }
    if (b.t === "lookuptable") {
      // A dice-roller table: badge the formula ("Roll d6") and excerpt the
      // OUTCOMES (last column of each row), not the bare die that's rolled.
      const results = b.rows
        .map((r) => r[r.length - 1] ?? "")
        .filter((s) => s !== "")
        .join(" · ");
      return { kind: "roll", note: b.formula, text: truncateInline(plainLead(results), SUMMARY_MAX) };
    }
    if (b.t === "dice") {
      const expr = b.mod != null && b.mod !== 0 ? `${b.expr}${b.mod >= 0 ? "+" : ""}${b.mod}` : b.expr;
      return { kind: "roll", note: expr, text: b.label != null ? truncateInline(plainLead(b.label), SUMMARY_MAX) : "" };
    }
    if (b.t === "rolltable") {
      return { kind: "roll", note: b.label ?? b.ref, text: "" };
    }
    const lead = blockPreviewText(b);
    if (lead !== "") return { text: truncateInline(plainLead(lead), SUMMARY_MAX) };
  }
  return { text: "" };
}

const HEADING_RE = /^\s*#{1,6}\s+.*(?:\r?\n|$)/;

/** True when a leading heading line merely repeats the note title (its filename),
 *  so it should be dropped rather than re-rendered as a duplicate inside the card. */
function headingMatchesTitle(headingLine: string, title: string): boolean {
  if (!title) return false;
  return headingLine.replace(/^\s*#{1,6}\s+/, "").trim() === title.trim();
}

/** A prose block that is really a markdown heading (`## Section`). Excluded from
 *  type inference and summary selection — a heading is structure, not content. */
function isHeadingProse(b: RuleBlock): boolean {
  return b.t === "p" && /^\s*#{1,6}\s/.test(b.text);
}

/**
 * Read a configurable front-matter property as a single string. An array value
 * uses its first element (e.g. a `tags` list). The result is coerced to a
 * trimmed string; an empty, missing, or non-stringable value returns undefined
 * so callers can fall through to their default. Fails silently by design.
 */
export function readFmProp(
  frontmatter: Record<string, unknown> | undefined,
  prop: string
): string | undefined {
  const raw = frontmatter?.[prop];
  const v: unknown = Array.isArray(raw) ? (raw as unknown[])[0] : raw;
  if (v == null) return undefined;
  if (typeof v !== "string" && typeof v !== "number" && typeof v !== "boolean") return undefined;
  const s = String(v).trim();
  return s !== "" ? s : undefined;
}

const IMAGE_SCALES: readonly ImageScaleType[] = ["auto", "fit", "fill", "stretch"];

/** Read the note-wide `imageScaleType` front-matter value, validated against the
 *  known modes. An unset or unrecognized value returns `undefined` (render then
 *  treats it as `auto`), so a typo never silently distorts an image. */
function readImageScale(frontmatter: Record<string, unknown>): ImageScaleType | undefined {
  const raw = readFmProp(frontmatter, "imageScaleType")?.toLowerCase();
  return raw != null && (IMAGE_SCALES as readonly string[]).includes(raw)
    ? (raw as ImageScaleType)
    : undefined;
}

export function parseNote(
  body: string,
  frontmatter: Record<string, unknown> = {},
  customTypes: CustomType[] = [],
  typeProp = "type",
  title = "",
  tags: string[] = [],
  typeRules: TypeRule[] = [],
  disabledBuiltinTypes: ContentType[] = [],
  imageProp = "image"
): ParsedNote {
  // An Excalidraw drawing note (`.excalidraw.md`, detected by its
  // `excalidraw-plugin` frontmatter): its markdown body is just the plugin's
  // "Switch to EXCALIDRAW VIEW" banner plus the drawing JSON sealed in a hidden
  // `%%` block — rendering it as markdown shows the banner, not the drawing.
  // Short-circuit to a single excalidraw widget (rendered as the exported SVG),
  // treated as image-type content (visual, single-column body). Suppressed only
  // when the image built-in is disabled (then the raw note renders as normal).
  if (!disabledBuiltinTypes.includes("image") && frontmatter["excalidraw-plugin"] != null) {
    const resolved = resolveType("image", customTypes);
    const fmIcon = typeof frontmatter.icon === "string" ? frontmatter.icon : "";
    const icon = fmIcon !== "" ? fmIcon : resolved.icon;
    const iconSet: "lucide" | "rpg" =
      fmIcon !== "" ? (fmIcon.startsWith("lucide-") ? "lucide" : "rpg") : resolved.iconSet;
    // The basename of `Foo.excalidraw.md` is `Foo.excalidraw`; drop the trailing
    // `.excalidraw` so the collapsed preview reads cleanly.
    const name = title.trim().replace(/\.excalidraw$/i, "").trim();
    return {
      type: "image",
      icon,
      iconSet,
      summary: name !== "" ? name : "Excalidraw drawing",
      meta: [],
      blocks: [{ t: "excalidraw" }],
      blockSources: [""],
    };
  }

  let text = body;

  // The card shows the note's title (its filename) separately, so drop a leading
  // heading only when it duplicates that title; a real section heading that
  // differs from the title stays in the body. A leading `<!-- ref: -->` comment
  // may sit on either side of that heading.
  let refAttrs: Attrs = { pairs: [] };
  let refMatched = false;
  let headingStripped = false;
  for (let i = 0; i < 2; i++) {
    if (!headingStripped) {
      const hM = HEADING_RE.exec(text);
      if (hM && headingMatchesTitle(hM[0], title)) {
        text = text.slice(hM[0].length);
        headingStripped = true;
      }
    }
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

  const { blocks, sources: blockSources } = parseBlocks(text);

  // A configurable image front-matter property (the "cover" / Bases-image path):
  // attach a leading image block (unless the body already shows that picture) and
  // force the `image` type, even when the note also has prose. Suppressed when the
  // image built-in is disabled. Keep blockSources aligned 1:1 with blocks.
  const imageEnabled = !disabledBuiltinTypes.includes("image");
  const explicitImage = imageEnabled ? readFmProp(frontmatter, imageProp) : undefined;
  if (explicitImage != null) {
    const ref = normalizeImageRef(explicitImage);
    if (!blocks.some((b) => b.t === "image" && sameImageSrc(b.src, ref.src))) {
      blocks.unshift({ t: "image", src: ref.src, alt: ref.alt, isEmbed: ref.isEmbed });
      blockSources.unshift("");
    }
  }

  // `imageScaleType` is note-wide: stamp the resolved mode onto every image block
  // (front-matter cover + body embeds) so CardImage can fit each one accordingly.
  const imageScale = readImageScale(frontmatter);
  if (imageScale != null) {
    for (const b of blocks) if (b.t === "image") b.scale = imageScale;
  }

  const declared = readFmProp(frontmatter, typeProp)?.toLowerCase() ?? refAttrs.type;
  let type: string;
  if (declared != null && isKnownType(declared, customTypes)) {
    // 1. An explicit, recognized declaration always wins.
    type = declared;
  } else if (explicitImage != null) {
    // 2. An explicit image property forces the image type (over rules/inference).
    type = "image";
  } else {
    // 3. The first enabled user rule that matches, else 4. structural inference
    //    (skipping disabled built-ins); inferType falls back to "reference".
    type = matchTypeRule(typeRules, frontmatter, tags) ?? inferType(blocks, disabledBuiltinTypes);
  }

  // A frontmatter/ref `icon:` override wins; otherwise inherit the type's icon
  // (built-in glyph or the custom type's chosen lucide/rpg icon).
  const resolved = resolveType(type, customTypes);
  const fmIcon = typeof frontmatter.icon === "string" ? frontmatter.icon : undefined;
  // An empty string is treated as "no override" (fall through), hence the
  // explicit emptiness checks rather than nullish coalescing.
  const iconOverride =
    fmIcon != null && fmIcon !== "" ? fmIcon : (attr(refAttrs, "icon") ?? "");
  const icon = iconOverride !== "" ? iconOverride : resolved.icon;
  const iconSet: "lucide" | "rpg" =
    iconOverride !== ""
      ? iconOverride.startsWith("lucide-")
        ? "lucide"
        : "rpg"
      : resolved.iconSet;

  // An author-provided summary (frontmatter or `<!-- ref: summary -->`) is always
  // plain prose — no badge. Otherwise derive a (possibly typed) lead from blocks.
  const fmSummary = typeof frontmatter.summary === "string" ? frontmatter.summary : undefined;
  const explicit = fmSummary ?? attr(refAttrs, "summary");
  const lead = explicit != null ? { text: explicit } : firstProseText(blocks);

  return {
    type,
    icon,
    iconSet,
    summary: lead.text,
    summaryKind: lead.kind,
    summaryNote: lead.note,
    meta,
    blocks,
    blockSources,
  };
}
