import { describe, it, expect } from "vitest";
import {
  tokenizeInline,
  codeLangLabel,
  stripInlineMarks,
  truncateInline,
  type InlineRun,
} from "../../../src/util/text";

/** Compact a run list to `tag:text` strings for readable assertions. */
const t = (s: string): string[] => tokenizeInline(s).map((r: InlineRun) => `${r.tag}:${r.text}`);

describe("tokenizeInline", () => {
  it("leaves plain text as a single run", () => {
    expect(t("just words here")).toEqual(["text:just words here"]);
  });

  it("renders bold mid-sentence (the bullet bug)", () => {
    expect(t("gains a **bold** word")).toEqual(["text:gains a ", "strong:bold", "text: word"]);
  });

  it("renders a bold lead with no term separator", () => {
    // `- **Strength** is your power` — bold first word, no em-dash/colon, so the
    // whole line was prose and used to print the asterisks literally.
    expect(t("**Strength** is your power")).toEqual(["strong:Strength", "text: is your power"]);
  });

  it("renders italic via asterisks and underscores", () => {
    expect(t("an *italic* and an _emphasis_ word")).toEqual([
      "text:an ",
      "em:italic",
      "text: and an ",
      "em:emphasis",
      "text: word",
    ]);
  });

  it("renders inline code verbatim", () => {
    expect(t("call `foo()` now")).toEqual(["text:call ", "code:foo()", "text: now"]);
  });

  it("renders strikethrough", () => {
    expect(t("~~gone~~ today")).toEqual(["s:gone", "text: today"]);
  });

  it("handles multiple bolds on one line", () => {
    expect(t("**a** then **b**")).toEqual(["strong:a", "text: then ", "strong:b"]);
  });

  it("prefers ** over * (no greedy single-asterisk capture)", () => {
    expect(t("**bold**")).toEqual(["strong:bold"]);
  });

  it("does NOT italicize arithmetic with spaced asterisks", () => {
    expect(t("2 * 3 plus 4")).toEqual(["text:2 * 3 plus 4"]);
  });

  it("does NOT emphasize intraword underscores (snake_case)", () => {
    expect(t("call set_note_category soon")).toEqual(["text:call set_note_category soon"]);
  });

  it("leaves an unclosed mark literal", () => {
    expect(t("a **dangling start")).toEqual(["text:a **dangling start"]);
  });

  it("treats whitespace-only inner as literal", () => {
    expect(t("a ** ** b")).toEqual(["text:a ** ** b"]);
  });
});

describe("codeLangLabel", () => {
  it("maps known plugin languages to friendly names", () => {
    expect(codeLangLabel("meta-bind-js-view")).toBe("Meta Bind");
    expect(codeLangLabel("js-engine")).toBe("JS Engine");
    expect(codeLangLabel("datacorejsx")).toBe("Datacore");
    expect(codeLangLabel("dataview")).toBe("Dataview");
  });

  it("is case- and whitespace-insensitive", () => {
    expect(codeLangLabel("  Meta-Bind  ")).toBe("Meta Bind");
  });

  it("falls back to 'Code' for plain languages and empty info strings", () => {
    expect(codeLangLabel("js")).toBe("Code");
    expect(codeLangLabel("python")).toBe("Code");
    expect(codeLangLabel("")).toBe("Code");
  });
});

describe("stripInlineMarks", () => {
  it("removes mark delimiters but keeps the inner text", () => {
    expect(stripInlineMarks("a **bold** and *italic* and `code`")).toBe("a bold and italic and code");
  });

  it("leaves plain text untouched", () => {
    expect(stripInlineMarks("nothing to strip here")).toBe("nothing to strip here");
  });
});

describe("truncateInline", () => {
  it("returns short marked text verbatim (fits the budget)", () => {
    expect(truncateInline("a **bold** lead", 180)).toBe("a **bold** lead");
  });

  it("never leaves a dangling delimiter when a mark spans the cut", () => {
    const out = truncateInline("aaaa **bbbbbb** cccc", 8);
    // budget counts visible chars; the strong run is re-closed cleanly, not split.
    expect(out.endsWith("…")).toBe(true);
    expect(tokenizeInline(out.replace(/…$/, "")).some((r) => r.tag === "strong")).toBe(true);
    // delimiters stay balanced (even count of **) — no dangling open mark.
    expect((out.match(/\*\*/g) ?? []).length % 2).toBe(0);
  });
});
