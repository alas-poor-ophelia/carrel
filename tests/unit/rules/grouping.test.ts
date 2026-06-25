/**
 * grouping — flat RuleDoc list -> ordered board sections.
 * Group order honors category.order / type registry order / folder paths;
 * card order follows the sort preset or the nook's custom cardOrder.
 */
import { describe, expect, it } from "vitest";
import { buildSections, folderOf, groupKeyOf, sortDocs } from "../../../src/rules/grouping";
import type { GroupOpts } from "../../../src/rules/grouping";
import type { RuleDoc } from "../../../src/rules/model";
import type { Category, CustomType } from "../../../src/types/data";

function doc(p: Partial<RuleDoc> & { path: string; title: string }): RuleDoc {
  return {
    category: "General",
    headings: [],
    body: "",
    type: "reference",
    icon: "",
    iconSet: "rpg",
    summary: "",
    meta: [],
    blocks: [],
    ...p,
  };
}

const CATS: Category[] = [
  { id: "c-combat", name: "Combat", color: "#000", iconSet: "rpg", icon: "x", order: 0 },
  { id: "c-skald", name: "Skald", color: "#000", iconSet: "rpg", icon: "x", order: 1 },
  { id: "c-race", name: "Race", color: "#000", iconSet: "rpg", icon: "x", order: 2 },
];

const CUSTOM: CustomType[] = [
  { id: "ability", name: "Ability", color: "#000", iconSet: "rpg", icon: "x", order: 0 },
  { id: "deed", name: "Deed", color: "#000", iconSet: "rpg", icon: "x", order: 1 },
];

const opts = (over: Partial<GroupOpts> = {}): GroupOpts => ({
  categories: CATS,
  customTypes: CUSTOM,
  cardOrder: {},
  ...over,
});

const labels = (docs: RuleDoc[]): string[] => docs.map((d) => d.title);

describe("groupKeyOf / folderOf", () => {
  it("derives the folder from a path; root is empty string", () => {
    expect(folderOf("Rules/Combat/Grapple.md")).toBe("Rules/Combat");
    expect(folderOf("Note.md")).toBe("");
  });
  it("keys by the chosen dimension", () => {
    const d = doc({ path: "Rules/Grapple.md", title: "Grapple", category: "Combat", type: "ability" });
    expect(groupKeyOf(d, "category")).toBe("Combat");
    expect(groupKeyOf(d, "type")).toBe("ability");
    expect(groupKeyOf(d, "folder")).toBe("Rules");
    expect(groupKeyOf(d, "none")).toBe("all");
  });
});

describe("buildSections — group order", () => {
  it("orders category groups by category.order, unknown/General last A–Z", () => {
    const docs = [
      doc({ path: "a.md", title: "A", category: "Skald" }),
      doc({ path: "b.md", title: "B", category: "General" }),
      doc({ path: "c.md", title: "C", category: "Combat" }),
      doc({ path: "d.md", title: "D", category: "Zephyr" }), // unknown
    ];
    const secs = buildSections(docs, "category", "az", opts());
    expect(secs.map((s) => s.key)).toEqual(["Combat", "Skald", "General", "Zephyr"]);
  });

  it("orders type groups by registry order then custom-type order", () => {
    const docs = [
      doc({ path: "a.md", title: "A", type: "deed" }),
      doc({ path: "b.md", title: "B", type: "table" }),
      doc({ path: "c.md", title: "C", type: "ability" }),
      doc({ path: "d.md", title: "D", type: "flowchart" }),
    ];
    const secs = buildSections(docs, "type", "az", opts());
    // flowchart, table are built-in (in that registry order), then ability, deed (custom order)
    expect(secs.map((s) => s.key)).toEqual(["flowchart", "table", "ability", "deed"]);
    expect(secs.map((s) => s.label)).toEqual(["Flowchart", "Table", "Ability", "Deed"]);
  });

  it("orders folder groups alphabetically; root labeled", () => {
    const docs = [
      doc({ path: "Rules/Combat/x.md", title: "X" }),
      doc({ path: "root.md", title: "R" }),
      doc({ path: "Rules/Adv/y.md", title: "Y" }),
    ];
    const secs = buildSections(docs, "folder", "az", opts());
    expect(secs.map((s) => s.key)).toEqual(["", "Rules/Adv", "Rules/Combat"]);
    expect(secs[0].label).toBe("Vault root");
  });

  it("none -> a single 'All notes' section", () => {
    const docs = [doc({ path: "a.md", title: "A" }), doc({ path: "b.md", title: "B" })];
    const secs = buildSections(docs, "none", "az", opts());
    expect(secs).toHaveLength(1);
    expect(secs[0].label).toBe("All notes");
    expect(secs[0].docs).toHaveLength(2);
  });
});

describe("sortDocs — within a group", () => {
  const ds = [
    doc({ path: "a.md", title: "Bravo", type: "table" }),
    doc({ path: "b.md", title: "Alpha", type: "flowchart" }),
    doc({ path: "c.md", title: "Charlie", type: "ability" }),
  ];

  it("az / za by title", () => {
    expect(labels(sortDocs(ds, "az", "k", opts()))).toEqual(["Alpha", "Bravo", "Charlie"]);
    expect(labels(sortDocs(ds, "za", "k", opts()))).toEqual(["Charlie", "Bravo", "Alpha"]);
  });

  it("type sorts by registry rank then title", () => {
    // flowchart < table < ability(custom)
    expect(labels(sortDocs(ds, "type", "k", opts()))).toEqual(["Alpha", "Bravo", "Charlie"]);
  });

  it("custom pins listed paths first, appends newcomers A–Z", () => {
    const cardOrder = { k: ["c.md", "a.md"] };
    const out = sortDocs(ds, "custom", "k", opts({ cardOrder }));
    // c, a are pinned in that order; b (unlisted) appended A–Z after
    expect(labels(out)).toEqual(["Charlie", "Bravo", "Alpha"]);
  });

  it("custom with no stored order falls back to A–Z", () => {
    expect(labels(sortDocs(ds, "custom", "k", opts()))).toEqual(["Alpha", "Bravo", "Charlie"]);
  });
});
