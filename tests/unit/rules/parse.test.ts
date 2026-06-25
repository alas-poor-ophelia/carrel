/**
 * parseNote — markdown note body -> typed blocks + content type.
 * Inference from plain markdown, with optional `<!-- ref -->` / `<!-- block -->`
 * overrides and frontmatter. Mirrors the handoff sample notes.
 */
import { describe, expect, it } from "vitest";
import { parseNote, readFmProp } from "../../../src/rules/parse";
import type { RuleBlock } from "../../../src/rules/model";
import type { CustomType, TypeRule } from "../../../src/types/data";

function types(blocks: RuleBlock[]): string[] {
  return blocks.map((b) => b.t);
}

/** The TTRPG-flavored types that moved out of the defaults now live as custom
 *  types (e.g. seeded in the character-sheet vault). */
const CUSTOM: CustomType[] = [
  { id: "ability", name: "Ability", color: "#cf9b54", iconSet: "rpg", icon: "ra-sunbeams", order: 0 },
  { id: "deed", name: "Deed", color: "#c66b8e", iconSet: "rpg", icon: "ra-arcane-mask", order: 1 },
  { id: "trait", name: "Trait", color: "#7aa86a", iconSet: "lucide", icon: "lucide-clover", order: 2 },
];

describe("parseNote — content type", () => {
  it("honors a declared (custom) ref-comment type and its meta chips", () => {
    const p = parseNote(
      `<!-- ref: ability cost:"Swift action" uses:"4/day" -->\n\n**Smite Evil** — choose one target to smite.`,
      {},
      CUSTOM
    );
    expect(p.type).toBe("ability");
    expect(p.meta).toEqual([{ k: "Swift action" }, { k: "4/day" }]);
    expect(p.blocks[0]).toEqual({ t: "p", term: "Smite Evil", text: "choose one target to smite." });
  });

  it("frontmatter type wins over the ref comment", () => {
    const p = parseNote(`<!-- ref: ability -->\n\nplain text`, { type: "deed" }, CUSTOM);
    expect(p.type).toBe("deed");
  });

  it("strips a leading title heading (rendered separately) before the ref comment", () => {
    const p = parseNote(`# Grapple\n\n<!-- ref: flowchart -->\n\nbody prose`, {}, [], "type", "Grapple");
    expect(p.type).toBe("flowchart");
    expect(p.blocks).toEqual([{ t: "p", text: "body prose" }]);
  });

  it("strips a leading heading when the ref comment precedes it", () => {
    const p = parseNote(`<!-- ref: ability -->\n# Smite\n\nbody`, {}, CUSTOM, "type", "Smite");
    expect(p.type).toBe("ability");
    expect(p.blocks).toEqual([{ t: "p", text: "body" }]);
  });

  it("keeps a leading heading that is NOT the note title (a real section heading)", () => {
    const p = parseNote(`## Overview\n\nbody prose`, {}, [], "type", "Grapple");
    expect(p.blocks).toEqual([
      { t: "p", text: "## Overview" },
      { t: "p", text: "body prose" },
    ]);
  });

  it("does not let a non-title leading heading become the card summary", () => {
    const p = parseNote(`# Fireball Spell\n\nHurls a bead of fire.`, {}, [], "type", "fireball");
    expect(p.summary).toBe("Hurls a bead of fire.");
  });

  it("infers quote even when a non-title heading precedes the blockquote", () => {
    const p = parseNote(`## Note\n\n> a solemn oath`, {}, [], "type", "Something");
    expect(p.type).toBe("quote");
  });

  it("infers flowchart / formula / process / table / quote when undeclared", () => {
    expect(parseNote("```ref-flow\nstart: go\n```").type).toBe("flowchart");
    expect(parseNote("<!-- block: dice expr:\"1d20\" mod:5 -->").type).toBe("formula");
    expect(parseNote("1. first\n2. second").type).toBe("process");
    expect(parseNote("| A | B |\n| - | - |\n| 1 | 2 |").type).toBe("table");
    expect(parseNote("> a solemn oath").type).toBe("quote");
    expect(parseNote("just a sentence of prose.").type).toBe("reference");
  });

  it("ignores an unknown type and falls back to inference", () => {
    // `deed` is no longer built-in; with no custom types it can't be honored
    expect(parseNote(`<!-- ref: deed -->\n\njust prose.`).type).toBe("reference");
    expect(parseNote(`plain prose.`, { type: "made-up" }).type).toBe("reference");
  });
});

describe("parseNote — Obsidian callouts / infobox", () => {
  it("captures a `> [!type]` callout (with inner table + image) as ONE block, not a table", () => {
    const body = [
      "> [!infobox|left]",
      "> # Name",
      "> ![[Image.png|cover hsmall]]",
      "> ###### Stats",
      "> | Type | Stat |",
      "> | ---- | ---- |",
      "> | Test | Testing |",
    ].join("\n");
    const p = parseNote(body);
    expect(p.blocks).toEqual([{ t: "obsidian-callout", calloutType: "infobox", content: body }]);
    // an infobox is a styled callout, NOT a blockquote-style quote
    expect(p.type).not.toBe("quote");
  });

  it("keeps internal blank `>` separator lines inside one callout block", () => {
    const body = "> [!infobox]\n> ###### A\n> \n> ###### B";
    const p = parseNote(body);
    expect(p.blocks).toEqual([{ t: "obsidian-callout", calloutType: "infobox", content: body }]);
  });

  it("ends the callout at the first non-`>` line", () => {
    const p = parseNote("> [!note] heads up\n> inside\n\nregular paragraph");
    expect(p.blocks).toEqual([
      { t: "obsidian-callout", calloutType: "note", content: "> [!note] heads up\n> inside" },
      { t: "p", text: "regular paragraph" },
    ]);
  });

  it("still treats a bare blockquote (no `[!...]`) as a quote", () => {
    expect(parseNote("> a solemn oath").type).toBe("quote");
    const p = parseNote("> a solemn oath");
    expect(p.blocks[0].t).toBe("callout");
  });
});

describe("parseNote — type rules + disabled built-ins (Phase 4)", () => {
  const rule = (over: Partial<TypeRule>): TypeRule => ({
    id: "r",
    name: "",
    targetType: "formula",
    kind: "tag",
    key: "spell",
    enabled: true,
    ...over,
  });

  it("assigns the target type when a tag rule matches", () => {
    const r = [rule({ kind: "tag", key: "spell", targetType: "formula" })];
    expect(parseNote("plain prose.", {}, [], "type", "", ["spell"], r).type).toBe("formula");
    // no matching tag -> falls through to inference (reference)
    expect(parseNote("plain prose.", {}, [], "type", "", ["other"], r).type).toBe("reference");
  });

  it("matches a frontmatter-key rule (key present, any value)", () => {
    const r = [rule({ kind: "frontmatter-key", key: "statblock", targetType: "table" })];
    expect(parseNote("plain.", { statblock: "x" }, [], "type", "", [], r).type).toBe("table");
    expect(parseNote("plain.", {}, [], "type", "", [], r).type).toBe("reference");
  });

  it("matches frontmatter-key-value case-insensitively, incl. array values", () => {
    const r = [rule({ kind: "frontmatter-key-value", key: "system", value: "pf2e", targetType: "process" })];
    expect(parseNote("x.", { system: "PF2E" }, [], "type", "", [], r).type).toBe("process");
    expect(parseNote("x.", { system: ["dnd", "pf2e"] }, [], "type", "", [], r).type).toBe("process");
    expect(parseNote("x.", { system: "5e" }, [], "type", "", [], r).type).toBe("reference");
  });

  it("first ENABLED matching rule wins; disabled rules are skipped", () => {
    const rules = [
      rule({ id: "a", kind: "tag", key: "spell", targetType: "quote", enabled: false }),
      rule({ id: "b", kind: "tag", key: "spell", targetType: "formula", enabled: true }),
    ];
    expect(parseNote("x.", {}, [], "type", "", ["spell"], rules).type).toBe("formula");
  });

  it("a known explicit type beats a rule; an unknown token falls through to it", () => {
    const rules = [rule({ kind: "tag", key: "spell", targetType: "formula" })];
    expect(parseNote("x.", { type: "table" }, [], "type", "", ["spell"], rules).type).toBe("table");
    expect(parseNote("x.", { type: "madeup" }, [], "type", "", ["spell"], rules).type).toBe("formula");
  });

  it("a rule can target a custom type by its token", () => {
    const rules = [rule({ kind: "tag", key: "spell", targetType: "ability" })];
    expect(parseNote("x.", {}, CUSTOM, "type", "", ["spell"], rules).type).toBe("ability");
  });

  it("disabledBuiltinTypes suppresses structural inference for that type", () => {
    const table = "| A | B |\n| - | - |\n| 1 | 2 |";
    expect(parseNote(table).type).toBe("table");
    expect(parseNote(table, {}, [], "type", "", [], [], ["table"]).type).toBe("reference");
  });
});

describe("readFmProp — configurable front-matter property", () => {
  it("reads a plain string property", () => {
    expect(readFmProp({ noteType: "deed" }, "noteType")).toBe("deed");
  });

  it("uses the first element of an array value", () => {
    expect(readFmProp({ tags: ["npc", "location"] }, "tags")).toBe("npc");
  });

  it("coerces numbers/booleans and trims whitespace", () => {
    expect(readFmProp({ n: 42 }, "n")).toBe("42");
    expect(readFmProp({ pad: "  Item  " }, "pad")).toBe("Item");
  });

  it("returns undefined for missing, empty, or unparseable values", () => {
    expect(readFmProp({}, "category")).toBeUndefined();
    expect(readFmProp(undefined, "category")).toBeUndefined();
    expect(readFmProp({ x: "" }, "x")).toBeUndefined();
    expect(readFmProp({ x: [] }, "x")).toBeUndefined();
    expect(readFmProp({ x: { nested: 1 } }, "x")).toBeUndefined();
    expect(readFmProp({ x: null }, "x")).toBeUndefined();
  });
});

describe("parseNote — configurable type property", () => {
  it("reads the type from a custom property name", () => {
    const p = parseNote(`plain prose.`, { noteType: "deed" }, CUSTOM, "noteType");
    expect(p.type).toBe("deed");
  });

  it("takes the first array element for the type property", () => {
    const p = parseNote(`plain prose.`, { tags: ["ability", "misc"] }, CUSTOM, "tags");
    expect(p.type).toBe("ability");
  });

  it("falls back to structural inference when the configured property is absent", () => {
    const p = parseNote(`| A | B |\n| - | - |\n| 1 | 2 |`, { type: "ability" }, CUSTOM, "noteType");
    // `type` is ignored (we read `noteType`), so the table infers its own type
    expect(p.type).toBe("table");
  });
});

describe("parseNote — block inference", () => {
  it("splits prose paragraphs on blank lines and extracts a lead term", () => {
    const p = parseNote("**Aura of Good** — equal to her paladin level.\n\nA second paragraph.");
    expect(types(p.blocks)).toEqual(["p", "p"]);
    expect(p.blocks[0]).toEqual({ t: "p", term: "Aura of Good", text: "equal to her paladin level." });
    expect(p.blocks[1]).toEqual({ t: "p", text: "A second paragraph." });
  });

  it("parses a GFM table into caption-less cols/rows", () => {
    const p = parseNote("| Paladin Lv | Dmg |\n| --- | --- |\n| 1–4 | +lvl |\n| 5+ | ×2 |");
    expect(p.blocks[0]).toEqual({
      t: "table",
      caption: undefined,
      cols: ["Paladin Lv", "Dmg"],
      rows: [["1–4", "+lvl"], ["5+", "×2"]],
    });
  });

  it("parses a task list as a checklist", () => {
    const p = parseNote("- [ ] Prepare spells\n- [x] Refresh panache");
    expect(p.blocks[0]).toEqual({
      t: "checklist",
      items: [{ text: "Prepare spells" }, { text: "Refresh panache" }],
    });
  });

  it("parses an ordered list as steps and a bulleted list as bullets with terms", () => {
    const steps = parseNote("1. Roll a threat\n2. Confirm");
    expect(steps.blocks[0]).toEqual({ t: "steps", items: [{ text: "Roll a threat" }, { text: "Confirm" }] });

    const bullets = parseNote("- **Bull Rush** — push a foe back\n- Disarm a held item");
    expect(bullets.blocks[0]).toEqual({
      t: "bullets",
      items: [{ term: "Bull Rush", text: "push a foe back" }, { text: "Disarm a held item" }],
    });
  });

  it("parses a blockquote callout and folds a trailing attribution into cite", () => {
    const p = parseNote("> I am the edge that answers cruelty.\n> — The vigil oath");
    expect(p.blocks[0]).toEqual({
      t: "callout",
      text: "I am the edge that answers cruelty.",
      cite: "The vigil oath",
    });
  });
});

describe("parseNote — explicit overrides", () => {
  it("emits a dice block from a block directive with expr/mod/label", () => {
    const p = parseNote(`<!-- block: dice expr:"1d20" mod:5 label:"+ Dex + misc" -->`);
    expect(p.blocks[0]).toEqual({ t: "dice", expr: "1d20", mod: 5, label: "+ Dex + misc" });
  });

  it("forces a callout (with cite) on prose that wouldn't otherwise infer one", () => {
    const p = parseNote(`<!-- block: callout cite:"Old saw" -->\nfortune favors the bold`);
    expect(p.blocks[0]).toEqual({ t: "callout", text: "fortune favors the bold", cite: "Old saw" });
  });

  it("parses a ref-flow fence into start/note/check/branch/options nodes", () => {
    const p = parseNote(
      [
        "```ref-flow",
        "start: You attempt to grapple a creature",
        "note: Provokes an attack of opportunity unless you have Improved Grapple.",
        "check: Melee check: your CMB vs the target's CMD",
        "branch:",
        "  success: You both gain the grappled condition.",
        "  fail: The grapple fails.",
        "options: Move both | Deal damage | Pin | Tie up",
        "```",
      ].join("\n")
    );
    expect(p.type).toBe("flowchart");
    const flow = p.blocks[0];
    expect(flow.t).toBe("flow");
    if (flow.t !== "flow") throw new Error("expected flow");
    expect(flow.nodes[0]).toEqual({ kind: "start", text: "You attempt to grapple a creature" });
    expect(flow.nodes[2]).toEqual({ kind: "check", text: "Melee check: your CMB vs the target's CMD" });
    expect(flow.nodes[3]).toEqual({
      kind: "branch",
      branches: [
        { label: "Success", tone: "success", text: "You both gain the grappled condition." },
        { label: "Failure", tone: "fail", text: "The grapple fails." },
      ],
    });
    expect(flow.nodes[4]).toEqual({ kind: "options", items: ["Move both", "Deal damage", "Pin", "Tie up"] });
  });
});

describe("parseNote — image cards", () => {
  it("promotes a standalone wikilink image embed to an image block and infers image", () => {
    const p = parseNote("![[cover.png]]");
    expect(p.type).toBe("image");
    expect(p.blocks).toEqual([{ t: "image", src: "cover.png", isEmbed: true }]);
  });

  it("parses markdown image syntax with alt text (not an embed)", () => {
    const p = parseNote("![A red fox](photos/fox.jpg)");
    expect(p.type).toBe("image");
    expect(p.blocks).toEqual([{ t: "image", src: "photos/fox.jpg", alt: "A red fox", isEmbed: false }]);
  });

  it("emits one image block per line for stacked images", () => {
    const p = parseNote("![[a.png]]\n![[b.webp]]");
    expect(p.blocks).toEqual([
      { t: "image", src: "a.png", isEmbed: true },
      { t: "image", src: "b.webp", isEmbed: true },
    ]);
    expect(p.type).toBe("image");
  });

  it("stays image with a short caption, whether blank-separated or adjacent", () => {
    const spaced = parseNote("![[map.png]]\n\nThe old road north.");
    expect(types(spaced.blocks)).toEqual(["image", "p"]);
    expect(spaced.type).toBe("image");

    const adjacent = parseNote("![[map.png]]\ncaption");
    expect(types(adjacent.blocks)).toEqual(["image", "p"]);
    expect(adjacent.type).toBe("image");
  });

  it("is NOT image-prominent when prose exceeds the caption budget (image block kept)", () => {
    const p = parseNote(`![[diagram.png]]\n\n${"x".repeat(200)}`);
    expect(p.type).toBe("reference");
    expect(p.blocks[0]).toEqual({ t: "image", src: "diagram.png", isEmbed: true });
  });

  it("leaves an image mixed inline with prose as a prose block (Obsidian renders it inline)", () => {
    const p = parseNote("See the map ![[map.png]] for details.");
    expect(p.blocks).toEqual([{ t: "p", text: "See the map ![[map.png]] for details." }]);
    expect(p.type).toBe("reference");
  });

  it("is not image-prominent when structured content sits alongside the image", () => {
    const p = parseNote("![[chart.png]]\n\n| A | B |\n| - | - |\n| 1 | 2 |");
    expect(p.type).toBe("table");
    expect(p.blocks[0].t).toBe("image");
  });

  it("treats a bare `|alias` as alt but a `|size` hint as no alt", () => {
    expect(parseNote("![[diagram.png|schematic view]]").blocks).toEqual([
      { t: "image", src: "diagram.png", alt: "schematic view", isEmbed: true },
    ]);
    expect(parseNote("![[diagram.png|200]]").blocks).toEqual([
      { t: "image", src: "diagram.png", isEmbed: true },
    ]);
    expect(parseNote("![[diagram.png|200x100]]").blocks).toEqual([
      { t: "image", src: "diagram.png", isEmbed: true },
    ]);
  });

  it("forces image via the image front-matter property, even with long prose", () => {
    const p = parseNote("A long descriptive paragraph that easily exceeds the caption budget for prominence.", {
      image: "portrait.png",
    });
    expect(p.type).toBe("image");
    expect(p.blocks[0]).toEqual({ t: "image", src: "portrait.png", isEmbed: true });
  });

  it("dedupes an explicit image property against the same picture already in the body", () => {
    const p = parseNote("![[hero.png]]", { image: "hero.png" });
    expect(p.blocks).toEqual([{ t: "image", src: "hero.png", isEmbed: true }]);
    expect(p.type).toBe("image");
  });

  it("honors a configurable image property name and a `[[wikilink]]` value", () => {
    const p = parseNote("plain prose.", { cover: "[[banner.jpg]]" }, [], "type", "", [], [], [], "cover");
    expect(p.type).toBe("image");
    expect(p.blocks[0]).toEqual({ t: "image", src: "banner.jpg", isEmbed: true });
  });

  it("disabling the image built-in suppresses both inference and the explicit property", () => {
    const inferred = parseNote("![[cover.png]]", {}, [], "type", "", [], [], ["image"]);
    expect(inferred.type).toBe("reference"); // block still parsed, type suppressed
    expect(inferred.blocks).toEqual([{ t: "image", src: "cover.png", isEmbed: true }]);

    const explicit = parseNote("prose here.", { image: "x.png" }, [], "type", "", [], [], ["image"]);
    expect(explicit.type).toBe("reference");
    expect(explicit.blocks).toEqual([{ t: "p", text: "prose here." }]); // no synthetic block
  });

  it("an explicit known type still beats the image property", () => {
    const p = parseNote("body", { image: "cover.png", type: "table" });
    expect(p.type).toBe("table");
  });

  it("resolves the image type to the lucide image glyph", () => {
    const p = parseNote("![[cover.png]]");
    expect(p.icon).toBe("lucide-image");
    expect(p.iconSet).toBe("lucide");
  });
});

describe("parseNote — summary & icon", () => {
  it("derives a summary from the first prose block, stripping markdown", () => {
    const p = parseNote("**Detect Evil** — at will, a paladin can use [[detect evil]] as the spell.");
    expect(p.summary).toBe("Detect Evil — at will, a paladin can use detect evil as the spell.");
  });

  it("strips a markdown link to its label in the summary", () => {
    const p = parseNote("See [the docs](http://example.com/x) for the full rules.");
    expect(p.summary).toBe("See the docs for the full rules.");
  });

  it("strips highlight and strikethrough markers in the summary", () => {
    const p = parseNote("This is ==very== ~~maybe~~ important.");
    expect(p.summary).toBe("This is very maybe important.");
  });

  it("falls back to a callout's text when the note opens with a callout", () => {
    const p = parseNote("> a wise saying worth remembering");
    expect(p.summary).toBe("a wise saying worth remembering");
  });

  it("falls back to a table's first row when the note opens with a table", () => {
    const p = parseNote("| A | B |\n| --- | --- |\n| one | two |");
    expect(p.summary).toBe("one · two");
  });

  it("prefers an explicit frontmatter summary and icon", () => {
    const p = parseNote("body text", { summary: "Custom", icon: "shield" });
    expect(p.summary).toBe("Custom");
    expect(p.icon).toBe("shield");
    expect(p.iconSet).toBe("rpg");
  });

  it("treats a lucide- prefixed icon override as a lucide glyph", () => {
    const p = parseNote("body text", { icon: "lucide-star" });
    expect(p.icon).toBe("lucide-star");
    expect(p.iconSet).toBe("lucide");
  });

  it("defaults a built-in type's icon to its resolved glyph", () => {
    const p = parseNote("> a quoted line");
    expect(p.type).toBe("quote");
    expect(p.icon).toBe("ra-scroll-unfurled");
    expect(p.iconSet).toBe("rpg");
  });

  it("inherits a custom type's icon and icon set", () => {
    const p = parseNote("<!-- ref: trait -->\nyou were bullied as a child.", {}, CUSTOM);
    expect(p.type).toBe("trait");
    expect(p.icon).toBe("lucide-clover");
    expect(p.iconSet).toBe("lucide");
  });
});

describe("parseNote — code fences (lockup regression)", () => {
  // A fence whose opening line carried an info string with a space used to slip
  // past the fence matcher AND be refused by the generic grouper, hanging the
  // parser forever. These must terminate (vitest fails the test on timeout).
  it("parses a fence with a spaced info string without hanging", () => {
    const p = parseNote('```js title="example"\nconst a = 1;\n```');
    expect(p.blocks).toHaveLength(1);
    expect(p.blocks[0].t).toBe("p");
    expect(p.blocks[0]).toMatchObject({ text: expect.stringContaining("const a = 1;") });
  });

  it("parses a fence with a multi-word info string without hanging", () => {
    const p = parseNote("```python {1,3-4}\nx = 2\n```\n\nAfter the fence.");
    expect(types(p.blocks)).toEqual(["p", "p"]);
    expect(p.blocks[0]).toMatchObject({ text: expect.stringContaining("x = 2") });
  });
});
