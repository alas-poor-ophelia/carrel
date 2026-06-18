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
  it("maps an entry: filename title, configured type, property table + chips", () => {
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
    expect(doc.meta).toEqual([{ k: "CR: 20" }, { k: "Name: Ancient Dragon" }]);
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
    expect(doc.meta).toEqual([]);
  });

  it("skips empty property values", () => {
    const config = fakeConfig({ order: ["note.a", "note.b"], names: { "note.a": "A", "note.b": "B" } });
    const entry = fakeEntry("x", { "note.a": "present" }); // note.b missing

    const [doc] = basesToRuleDocs([entry], config, []);

    expect(doc.meta).toEqual([{ k: "A: present" }]);
  });
});
