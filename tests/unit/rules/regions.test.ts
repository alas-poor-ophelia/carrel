/**
 * regions — typed blocks + their verbatim sources -> render items.
 * Native blocks merge into one MarkdownRenderer region; widgets stand alone;
 * footnote definitions replicate so refs resolve across a widget boundary.
 */
import { describe, expect, it } from "vitest";
import { buildRenderItems, collectFootnoteDefs } from "../../../src/rules/regions";
import type { RuleBlock } from "../../../src/rules/model";

const p = (text: string): RuleBlock => ({ t: "p", text });
const dice = (): RuleBlock => ({ t: "dice", expr: "1d20" });

describe("buildRenderItems", () => {
  it("merges a run of native blocks into one region", () => {
    const items = buildRenderItems([p("a"), p("b")], ["a", "b"]);
    expect(items).toEqual([{ kind: "native", md: "a\n\nb" }]);
  });

  it("splits native runs around a widget, keeping the widget's block index", () => {
    const blocks = [p("a"), dice(), p("b")];
    const items = buildRenderItems(blocks, ["a", "<!-- block: dice -->", "b"]);
    expect(items).toEqual([
      { kind: "native", md: "a" },
      { kind: "widget", block: blocks[1], index: 1 },
      { kind: "native", md: "b" },
    ]);
  });

  it("replicates footnote defs into every region so refs resolve across a widget", () => {
    const blocks = [p("see[^1]"), dice(), p("[^1]: the note")];
    const items = buildRenderItems(blocks, ["see[^1]", "x", "[^1]: the note"]);
    const native = items.filter((i): i is { kind: "native"; md: string } => i.kind === "native");
    expect(native).toHaveLength(2);
    expect(native[0].md).toContain("[^1]: the note");
    expect(native[1].md).toContain("[^1]: the note");
  });

  it("returns nothing for an empty block list", () => {
    expect(buildRenderItems([], [])).toEqual([]);
  });

  it("renders verbatim source (bullets keep their `-` so Obsidian draws a list)", () => {
    const items = buildRenderItems([{ t: "bullets", items: [{ text: "x" }] }], ["- **x** has a [link](u)"]);
    expect(items).toEqual([{ kind: "native", md: "- **x** has a [link](u)" }]);
  });
});

describe("collectFootnoteDefs", () => {
  it("gathers unique footnote definition lines", () => {
    expect(collectFootnoteDefs(["a[^1]", "[^1]: one\n[^2]: two", "[^1]: one"])).toBe(
      "[^1]: one\n[^2]: two"
    );
  });

  it("ignores non-footnote lines", () => {
    expect(collectFootnoteDefs(["just prose", "- bullet", "[link]: not-a-footnote"])).toBe("");
  });
});
