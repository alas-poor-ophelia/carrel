/* Bases → Carrel adapter. Maps a Base query's entries (a note + its property
   values) into the RuleDoc shape the board already renders, reading metadata
   only — no note-body parsing (the "properties as the body", B4a, model). The
   card type comes from a user-chosen property (resolved like any Carrel type),
   the visible Base properties become a Property/Value table + meta chips. */
import type { BasesEntry, BasesPropertyId, BasesViewConfig } from "obsidian";
import type { CustomType } from "../types/data";
import type { RuleBlock, RuleDoc } from "../rules/model";
import { resolveType } from "../rules/registry";
import { truncateSummary } from "../util/text";

/** Config keys for the view's toolbar options (see CarrelBasesView). */
export const TYPE_PROPERTY_KEY = "typeProperty";
export const TITLE_PROPERTY_KEY = "titleProperty";

/** A property's display string, or "" when the value is absent. Bases returns a
 *  NullValue (which renders as the literal "null"), not JS null, for a missing
 *  property — treat both as empty so null values auto-hide. */
function valueStr(entry: BasesEntry, propId: BasesPropertyId): string {
  const v = entry.getValue(propId);
  if (v == null) return "";
  const s = v.toString();
  return s === "null" ? "" : s;
}

export function basesToRuleDocs(
  entries: BasesEntry[],
  config: BasesViewConfig,
  customTypes: CustomType[]
): RuleDoc[] {
  const typeProp = config.getAsPropertyId(TYPE_PROPERTY_KEY);
  const titleProp = config.getAsPropertyId(TITLE_PROPERTY_KEY);
  const order = config.getOrder();
  return entries.map((entry) => {
    const file = entry.file;
    const title = (titleProp != null ? valueStr(entry, titleProp) : "") || file.basename;
    const typeToken = (typeProp != null ? valueStr(entry, typeProp) : "").toLowerCase();
    const type = typeToken || "reference";
    const resolved = resolveType(type, customTypes);

    // Non-empty displayed properties (minus the ones surfaced as type/title)
    // become the card's Property/Value table. A `summary`/`description` property
    // doubles as the card's summary line. Chips are NOT used — they are sized for
    // short tags, and key/value pairs belong in the table.
    const rows: string[][] = [];
    let summary = "";
    for (const pid of order) {
      if (pid === typeProp || pid === titleProp) continue;
      const val = valueStr(entry, pid);
      if (val === "") continue;
      const name = config.getDisplayName(pid);
      rows.push([name, val]);
      if (summary === "" && /summary|description/i.test(name)) summary = val;
    }
    const blocks: RuleBlock[] = rows.length
      ? [{ t: "table", cols: ["Property", "Value"], rows }]
      : [];

    return {
      path: file.path,
      title,
      category: "",
      headings: [],
      body: "",
      type,
      icon: resolved.icon,
      iconSet: resolved.iconSet,
      summary: truncateSummary(summary),
      meta: [],
      blocks,
    };
  });
}
