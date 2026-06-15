/* =====================================================================
   Reference-tab search (pure — unit-tested). Ported from the design
   prototype's subsequence scorer. Tokenizes the query on whitespace (AND:
   every word must match somewhere), scoring title > category > summary >
   deep body, and returns the matched *title* character indices so the UI
   can highlight non-contiguous fuzzy hits (e.g. "aoc" -> Aura of Courage).
   ===================================================================== */

import type { RuleDoc } from "./model";

export interface RuleSearchResult {
  doc: RuleDoc;
  score: number;
  /** matched character indices in doc.title (for highlight); sorted asc. */
  titlePos: number[];
}

interface FuzzyHit {
  score: number;
  positions: number[];
}

/** Subsequence scorer: rewards consecutive runs and word-boundary matches,
 *  penalizes gaps, prefers shorter fields. Returns null if `query` is not a
 *  subsequence of `text`. */
function fuzzyScore(query: string, text: string): FuzzyHit | null {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (!q) return { score: 0, positions: [] };
  let qi = 0;
  let run = 0;
  let prev = -2;
  let score = 0;
  const positions: number[] = [];
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] !== q[qi]) continue;
    positions.push(ti);
    let s = 1;
    if (ti === prev + 1) {
      run += 4;
      s += run;
    } else {
      run = 0;
    }
    const before = ti === 0 ? " " : t[ti - 1];
    if (" -/(.,".includes(before)) s += 9; // word start
    score += s;
    prev = ti;
    qi++;
  }
  if (qi < q.length) return null;
  const span = positions[positions.length - 1] - positions[0] + 1;
  score -= Math.max(0, span - q.length) * 0.6; // gap penalty
  score += Math.max(0, 14 - t.length * 0.06); // prefer short fields
  return { score, positions };
}

function docText(d: RuleDoc): string {
  let s = `${d.title} ${d.summary} ${d.category}`;
  for (const b of d.blocks) {
    switch (b.t) {
      case "p":
        s += " " + (b.term ? b.term + " " : "") + b.text;
        break;
      case "table":
        s += ` ${b.caption ?? ""} ${b.cols.join(" ")} ${b.rows.flat().join(" ")}`;
        break;
      case "callout":
        s += ` ${b.text} ${b.cite ?? ""}`;
        break;
      case "dice":
        s += ` ${b.expr} ${b.label ?? ""}`;
        break;
      case "checklist":
      case "steps":
        s += " " + b.items.map((i) => i.text).join(" ");
        break;
      case "bullets":
        s += " " + b.items.map((i) => (i.term ? i.term + " " : "") + i.text).join(" ");
        break;
      case "flow":
        for (const n of b.nodes) {
          if (n.kind === "branch") s += " " + n.branches.map((x) => x.text).join(" ");
          else if (n.kind === "options") s += " " + n.items.join(" ");
          else s += " " + n.text;
        }
        break;
    }
  }
  return s.toLowerCase();
}

interface TokenHit {
  score: number;
  titlePos: number[];
}

/** Score one query word against a doc, weighting title > category > summary >
 *  deep body content. Returns null if the word matches nowhere. */
function tokenScore(tok: string, doc: RuleDoc): TokenHit | null {
  const title = fuzzyScore(tok, doc.title);
  if (title) return { score: title.score * 3 + 30, titlePos: title.positions };
  const cat = fuzzyScore(tok, doc.category);
  if (cat) return { score: cat.score * 1.4 + 7, titlePos: [] };
  const sum = fuzzyScore(tok, doc.summary);
  if (sum) return { score: sum.score * 1.1 + 4, titlePos: [] };
  if (docText(doc).includes(tok)) return { score: 3, titlePos: [] }; // body fallback
  return null;
}

/**
 * Rank docs for a query. Multi-word queries are AND — every word must match
 * somewhere. Empty query returns all docs in their incoming order (score 0).
 */
export function searchRules(docs: RuleDoc[], query: string): RuleSearchResult[] {
  const tokens = (query || "").trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) return docs.map((doc) => ({ doc, score: 0, titlePos: [] }));

  const out: RuleSearchResult[] = [];
  for (const doc of docs) {
    let total = 0;
    let ok = true;
    const pos = new Set<number>();
    for (const tok of tokens) {
      const r = tokenScore(tok, doc);
      if (!r) {
        ok = false;
        break;
      }
      total += r.score;
      r.titlePos.forEach((p) => pos.add(p));
    }
    if (ok) {
      out.push({ doc, score: total, titlePos: [...pos].sort((a, b) => a - b) });
    }
  }
  return out.sort((a, b) => b.score - a.score);
}
