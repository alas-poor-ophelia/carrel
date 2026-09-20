/**
 * Bases-backed nooks render the engine's own order and groups as delivered —
 * `sort: "bases"` and `groupBy: "bases"` are passthroughs, never re-derived.
 */
import { describe, expect, it } from "vitest";
import { buildSections, sortDocs } from "../../../src/rules/grouping";
import type { RuleDoc } from "../../../src/rules/model";

function doc(title: string, order?: number, group?: string, groupIndex?: number): RuleDoc {
  const d: RuleDoc = {
    path: title + ".md",
    title,
    category: "General",
    headings: [],
    body: "",
    type: "reference",
    icon: "x",
    iconSet: "lucide",
    summary: "",
    leadMd: "",
    meta: [],
    blocks: [],
    blockSources: [],
  };
  if (order !== undefined) d.bases = { order, group: group ?? "", groupIndex: groupIndex ?? 0 };
  return d;
}

const opts = { categories: [], customTypes: [], cardOrder: {} };

describe("bases passthrough", () => {
  it("sort: bases keeps the engine's presorted position, not A–Z", () => {
    const docs = [doc("Alpha", 2), doc("Zed", 0), doc("Mid", 1)];
    expect(sortDocs(docs, "bases", "", opts).map((d) => d.title)).toEqual(["Zed", "Mid", "Alpha"]);
  });

  it("docs without a bases position fall back to A–Z under sort: bases", () => {
    const docs = [doc("b"), doc("a"), doc("c", 0)];
    expect(sortDocs(docs, "bases", "", opts).map((d) => d.title)).toEqual(["c", "a", "b"]);
  });

  it("groupBy: bases sections by the engine's group, in the engine's group order", () => {
    const docs = [
      doc("n1", 0, "Late", 1),
      doc("n2", 1, "Early", 0),
      doc("n3", 2, "", 2),
      doc("n4", 3, "Late", 1),
    ];
    const sections = buildSections(docs, "bases", "bases", opts);
    expect(sections.map((s) => [s.label, s.docs.map((d) => d.title)])).toEqual([
      ["Early", ["n2"]],
      ["Late", ["n1", "n4"]],
      ["Ungrouped", ["n3"]],
    ]);
  });
});
