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
