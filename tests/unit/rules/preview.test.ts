/**
 * Collapsed-card preview lead — `leadMd` is the VERBATIM markdown the card
 * renders through Obsidian; `summary` is only the plain-text search form.
 */
import { describe, expect, it } from "vitest";
import { parseNote } from "../../../src/rules/parse";

describe("parseNote — preview lead markdown", () => {
  it("carries the opening prose run verbatim (marks, links, highlights intact)", () => {
    const p = parseNote("A **bold** lead with a [[Wiki|link]] and ==mark==.\n\nSecond paragraph.\n\n- a bullet");
    expect(p.leadMd).toBe("A **bold** lead with a [[Wiki|link]] and ==mark==.\n\nSecond paragraph.");
    expect(p.summary).toContain("bold");
    expect(p.summaryKind).toBeUndefined();
  });

  it("skips a leading heading and a lone image before the prose", () => {
    const p = parseNote("## Title\n\n![[pic.png|right]]\n\nThe prose.");
    expect(p.leadMd).toBe("The prose.");
  });

  it("renders a structural lead (callout) from its verbatim source", () => {
    const p = parseNote("> [!note|left]\n> Boxed text\n\n| a | b |\n|---|---|\n| 1 | 2 |");
    expect(p.leadMd).toBe("> [!note|left]\n> Boxed text");
    expect(p.summaryKind).toBeUndefined();
  });

  it("badges a leading plugin fence and previews only the prose below it", () => {
    const p = parseNote("```meta-bind\nINPUT[toggle:done]\n```\n\nSome prose after.");
    expect(p.summaryKind).toBe("code");
    expect(p.summaryNote).toBe("meta-bind");
    expect(p.leadMd).toBe("Some prose after.");
  });

  it("`carrel-preview: render` opts the opaque lead into native rendering, untyped", () => {
    const p = parseNote("```meta-bind\nINPUT[toggle:done]\n```\n\nSome prose after.", { "carrel-preview": "render" });
    expect(p.summaryKind).toBeUndefined();
    expect(p.leadMd).toBe("```meta-bind\nINPUT[toggle:done]\n```\n\nSome prose after.");
    // the search text is still the badge-path prose, never the fence body
    expect(p.summary).toBe("Some prose after.");
  });

  it("an author summary wins over both derivation and the render override", () => {
    const p = parseNote("```js\nx\n```", { summary: "Hand *written*", "carrel-preview": "render" });
    expect(p.leadMd).toBe("Hand *written*");
    expect(p.summaryKind).toBeUndefined();
  });

  it("a bare note embed lead badges as embed with the target as its text", () => {
    const p = parseNote("![[Other Note]]");
    expect(p.summaryKind).toBe("embed");
    expect(p.leadMd).toBe("Other Note");
  });
});
