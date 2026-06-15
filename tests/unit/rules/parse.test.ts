/**
 * parseNote — markdown note body -> typed blocks + content type.
 * Inference from plain markdown, with optional `<!-- ref -->` / `<!-- block -->`
 * overrides and frontmatter. Mirrors the handoff sample notes.
 */
import { describe, expect, it } from "vitest";
import { parseNote } from "../../../src/rules/parse";
import type { RuleBlock } from "../../../src/rules/model";
import type { CustomType } from "../../../src/types/data";

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
    const p = parseNote(`# Grapple\n\n<!-- ref: flowchart -->\n\nbody prose`);
    expect(p.type).toBe("flowchart");
    expect(p.blocks).toEqual([{ t: "p", text: "body prose" }]);
  });

  it("strips a leading heading when the ref comment precedes it", () => {
    const p = parseNote(`<!-- ref: ability -->\n# Smite\n\nbody`, {}, CUSTOM);
    expect(p.type).toBe("ability");
    expect(p.blocks).toEqual([{ t: "p", text: "body" }]);
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

describe("parseNote — summary & icon", () => {
  it("derives a summary from the first prose block, stripping markdown", () => {
    const p = parseNote("**Detect Evil** — at will, a paladin can use [[detect evil]] as the spell.");
    expect(p.summary).toBe("Detect Evil — at will, a paladin can use detect evil as the spell.");
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
