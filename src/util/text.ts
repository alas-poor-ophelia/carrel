/* Shared prose helpers. */

/**
 * Truncate a one-line prose summary to at most `max` characters, cutting on a
 * word boundary when a reasonable one exists and appending an ellipsis.
 *
 * `max` defaults to 180 — the shared summary budget used by both the note
 * parser (parse.ts) and the AoN scraper (scrape.ts). When the text already
 * fits it is returned unchanged. When it must be cut, we prefer the last space
 * inside the budget so we never slice a word in half; if no usable space sits
 * far enough in (more than 60% of the budget), we hard-cut at `max`.
 */
export function truncateSummary(text: string, max = 180): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const sp = cut.lastIndexOf(" ");
  const end = sp > max * 0.6 ? sp : max;
  return `${cut.slice(0, end).trimEnd()}…`;
}

/* ---------- inline markdown ---------- */

/** One run of tokenized inline text: a plain `text` run or one carrying a single
 *  inline mark. Flat (no nesting) — enough for card-preview prose. */
export type InlineRun = { tag: "text" | "strong" | "em" | "code" | "s"; text: string };

/** Inline marks recognized inside the bespoke (non-MarkdownRenderer) blocks —
 *  bullets, steps, tables, callouts. Tried in order at each scan position, so the
 *  double-char marks (`**`, `__`, `~~`) must precede their single-char emphasis
 *  siblings. `raw` marks (code) keep their inner text verbatim; `word` marks
 *  (underscore) are rejected when flanked by a word char so `snake_case`
 *  identifiers survive untouched. The inner capture must open and close on a
 *  non-space char (CommonMark-ish), which keeps `2 * 3` from italicizing. */
const INLINE_MARKS: { re: RegExp; tag: InlineRun["tag"]; word?: boolean }[] = [
  { re: /^`([^`]+)`/, tag: "code" },
  { re: /^\*\*(\S(?:[\s\S]*?\S)??)\*\*/, tag: "strong" },
  { re: /^__(\S(?:[\s\S]*?\S)??)__/, tag: "strong", word: true },
  { re: /^~~(\S(?:[\s\S]*?\S)??)~~/, tag: "s" },
  { re: /^\*([^\s*_~`](?:[\s\S]*?\S)??)\*/, tag: "em" },
  { re: /^_([^\s*_~`](?:[\s\S]*?\S)??)_/, tag: "em", word: true },
];

function wordChar(c: string | undefined): boolean {
  return c != null && /\w/.test(c);
}

/** Split prose into inline-markdown runs. Plain text with no marks returns a
 *  single `text` run; the renderer (`inlineMd`) maps each run to an element. The
 *  marks `**bold**`, `*italic*` / `_italic_`, `` `code` `` and `~~strike~~` are
 *  resolved so they render in bullets/steps/tables the way they already do in
 *  prose (which goes through Obsidian's MarkdownRenderer). */
export function tokenizeInline(src: string): InlineRun[] {
  const runs: InlineRun[] = [];
  let buf = "";
  let i = 0;
  const flush = (): void => {
    if (buf) {
      runs.push({ tag: "text", text: buf });
      buf = "";
    }
  };
  while (i < src.length) {
    let matched = false;
    for (const m of INLINE_MARKS) {
      if (m.word === true && wordChar(src[i - 1])) continue;
      const mm = m.re.exec(src.slice(i));
      if (!mm) continue;
      if (m.word === true && wordChar(src[i + mm[0].length])) continue;
      flush();
      runs.push({ tag: m.tag, text: mm[1] });
      i += mm[0].length;
      matched = true;
      break;
    }
    if (!matched) {
      buf += src[i];
      i++;
    }
  }
  flush();
  return runs;
}

/** Re-emit one inline run as markdown source, re-balancing its delimiters.
 *  Used by `truncateInline` so a cut inside a marked run still closes cleanly. */
function serializeRun(r: InlineRun): string {
  switch (r.tag) {
    case "strong":
      return `**${r.text}**`;
    case "em":
      return `*${r.text}*`;
    case "code":
      return `\`${r.text}\``;
    case "s":
      return `~~${r.text}~~`;
    default:
      return r.text;
  }
}

/** Plain-text form of inline-marked prose — the same marks `tokenizeInline`
 *  renders, removed so search/indexing matches words without delimiters in the
 *  way (e.g. a summary stored as `**Grapple** costs` still matches "grapple"). */
export function stripInlineMarks(text: string): string {
  return tokenizeInline(text)
    .map((r) => r.text)
    .join("");
}

/**
 * Truncate a summary that may carry inline marks (`**bold**`, `*italic*`,
 * `` `code` ``, `~~strike~~`) to at most `max` VISIBLE characters (delimiters
 * don't count). Unlike `truncateSummary`, a cut never slices through a mark: the
 * run is closed cleanly so the card's `inlineMd` never sees a dangling `**`.
 * Prefers a word boundary past 60% of the remaining budget, then appends `…`.
 */
export function truncateInline(text: string, max = 180): string {
  const runs = tokenizeInline(text);
  const visibleTotal = runs.reduce((n, r) => n + r.text.length, 0);
  if (visibleTotal <= max) return text; // fits — keep the original verbatim
  let visible = 0;
  let out = "";
  for (const r of runs) {
    if (visible + r.text.length <= max) {
      out += serializeRun(r);
      visible += r.text.length;
      continue;
    }
    const remain = max - visible;
    let slice = r.text.slice(0, remain);
    const sp = slice.lastIndexOf(" ");
    if (sp > remain * 0.6) slice = slice.slice(0, sp);
    const cut = slice.trimEnd();
    if (cut) out += serializeRun({ tag: r.tag, text: cut });
    break;
  }
  return `${out}…`;
}
