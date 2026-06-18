/**
 * basesToRuleDocs — maps Bases query entries into RuleDocs (properties-only,
 * B4a). Bases' BasesEntry / BasesViewConfig are Obsidian runtime classes, so we
 * feed minimal structural fakes cast to the public types.
 */
import { describe, expect, it } from "vitest";
import type { BasesEntry, BasesPropertyId, BasesViewConfig } from "obsidian";
import { basesToRuleDocs } from "../../../src/adapters/basesToRuleDocs";

function fakeEntry(basename: string, vals: Record<string, string>): BasesEntry {
  return {
    file: { path: `Rules/${basename}.md`, basename },
    getValue: (pid: BasesPropertyId) =>
      vals[pid] != null ? ({ toString: () => vals[pid] } as never) : null,
  } as unknown as BasesEntry;
}

function fakeConfig(opts: {
  typeProperty?: string;
  titleProperty?: string;
  order: string[];
  names?: Record<string, string>;
}): BasesViewConfig {
  return {
    getAsPropertyId: (key: string) =>
      key === "typeProperty"
        ? (opts.typeProperty as BasesPropertyId) ?? null
        : key === "titleProperty"
          ? (opts.titleProperty as BasesPropertyId) ?? null
          : null,
    getOrder: () => opts.order as BasesPropertyId[],
    getDisplayName: (pid: BasesPropertyId) => opts.names?.[pid] ?? pid,
  } as unknown as BasesViewConfig;
}

describe("basesToRuleDocs", () => {
  it("maps an entry: filename title, configured type, property table (no chips)", () => {
    const config = fakeConfig({
      typeProperty: "note.type",
      order: ["note.type", "note.cr", "file.name"],
      names: { "note.type": "Type", "note.cr": "CR", "file.name": "Name" },
    });
    const entry = fakeEntry("Ancient Dragon", { "note.type": "Formula", "note.cr": "20", "file.name": "Ancient Dragon" });

    const [doc] = basesToRuleDocs([entry], config, []);

    expect(doc.path).toBe("Rules/Ancient Dragon.md");
    expect(doc.title).toBe("Ancient Dragon"); // no titleProperty -> filename
    expect(doc.type).toBe("formula"); // lowercased + resolved
    expect(doc.body).toBe(""); // B4a: no body parse
    // the type property is surfaced as the badge, not duplicated into the table
    expect(doc.blocks).toEqual([
      { t: "table", cols: ["Property", "Value"], rows: [["CR", "20"], ["Name", "Ancient Dragon"]] },
    ]);
    expect(doc.meta).toEqual([]); // chips are not used (sized for short tags)
  });

  it("uses a configured title property and falls back to reference for an unset type", () => {
    const config = fakeConfig({
      titleProperty: "note.label",
      order: ["note.label"],
      names: { "note.label": "Label" },
    });
    const entry = fakeEntry("note-42", { "note.label": "Friendly Name" });

    const [doc] = basesToRuleDocs([entry], config, []);

    expect(doc.title).toBe("Friendly Name");
    expect(doc.type).toBe("reference"); // no typeProperty configured
    expect(doc.blocks).toEqual([]); // title prop is skipped, nothing else -> no table
  });

  it("hides absent values (JS null AND Bases NullValue rendering as 'null')", () => {
    const config = fakeConfig({
      order: ["note.summary", "note.source"],
      names: { "note.summary": "Summary", "note.source": "Source" },
    });
    // summary -> a NullValue-like Value (toString "null"); source -> JS null
    const entry = {
      file: { path: "Rules/X.md", basename: "X" },
      getValue: (p: BasesPropertyId) =>
        p === "note.summary" ? ({ toString: () => "null" } as never) : null,
    } as unknown as BasesEntry;

    const [doc] = basesToRuleDocs([entry], config, []);

    expect(doc.blocks).toEqual([]); // both hidden -> no table
    expect(doc.summary).toBe("");
  });

  it("uses a summary/description property as the card summary", () => {
    const config = fakeConfig({ order: ["note.summary"], names: { "note.summary": "Summary" } });
    const entry = fakeEntry("X", { "note.summary": "A short blurb." });

    const [doc] = basesToRuleDocs([entry], config, []);

    expect(doc.summary).toBe("A short blurb.");
    expect(doc.blocks).toEqual([
      { t: "table", cols: ["Property", "Value"], rows: [["Summary", "A short blurb."]] },
    ]);
  });
});
