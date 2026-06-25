/* Render-item segmentation (pure — unit-tested in tests/unit/rules/regions.test.ts).

   A card body is a sequence of two kinds of items:
     - a NATIVE region: a maximal run of ordinary (non-widget) blocks, joined
       VERBATIM and handed to Obsidian's MarkdownRenderer so links, ==highlights==,
       [[wikilinks]], embeds and footnotes resolve natively (no hand-rolled inline
       parsing).
     - a WIDGET: one interactive block (dice / rolltable / lookuptable / flow /
       checklist / image) rendered bespoke, retaining its original block index so
       the per-nook checklist key (`${path}#${blockIndex}`) stays stable. */
import type { RuleBlock } from "./model";
import { isWidgetBlock } from "./model";

export type RenderItem =
  | { kind: "native"; md: string }
  | { kind: "widget"; block: RuleBlock; index: number };

const FOOTNOTE_DEF_RE = /^\s{0,3}\[\^[^\]]+\]:\s+\S/;

/** Footnote definition lines from across the whole note. A run of prose can be
 *  split by an interleaved widget into separate render regions; replicating the
 *  definitions into every region lets a `[^1]` reference resolve even when its
 *  definition sits in another region (a duplicate definition is harmless — the
 *  renderer keeps the first; an unreferenced one renders nothing). */
export function collectFootnoteDefs(sources: string[]): string {
  const defs: string[] = [];
  const seen = new Set<string>();
  for (const src of sources) {
    for (const ln of src.split("\n")) {
      if (FOOTNOTE_DEF_RE.test(ln) && !seen.has(ln)) {
        seen.add(ln);
        defs.push(ln);
      }
    }
  }
  return defs.join("\n");
}

/** Group a doc's blocks into render items: maximal runs of non-widget blocks
 *  become one native region (their verbatim source joined, with the note's
 *  footnote definitions appended); each widget block is emitted on its own. */
export function buildRenderItems(blocks: RuleBlock[], sources: string[]): RenderItem[] {
  const defs = collectFootnoteDefs(sources);
  const tail = defs !== "" ? "\n\n" + defs : "";
  const items: RenderItem[] = [];
  let run: string[] = [];
  const flush = (): void => {
    if (run.length > 0) {
      items.push({ kind: "native", md: run.join("\n\n") + tail });
      run = [];
    }
  };
  blocks.forEach((b, i) => {
    if (isWidgetBlock(b)) {
      flush();
      items.push({ kind: "widget", block: b, index: i });
    } else {
      run.push(sources[i] ?? "");
    }
  });
  flush();
  return items;
}
