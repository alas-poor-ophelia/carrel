/* =====================================================================
   Board grouping & sorting (pure — no preact/obsidian, unit-testable).

   Turns the flat RuleDoc list into ordered sections for the pane board.
   The board groups by one dimension (category / type / folder / none) and
   orders cards within each section by a sort preset, or by the nook's
   per-section custom (drag-arranged) order.

   Group ORDER honors the user's intent where one exists: categories follow
   the global category.order (edited in settings), types follow the registry
   + custom-type order, folders sort by path. Card order falls back to A–Z
   for anything a preset or custom list doesn't pin down.
   ===================================================================== */

import type { Category, CustomType, GroupBy, SortMode } from "../types/data";
import type { RuleDoc } from "./model";
import { FILTERABLE_TYPES, customTypeToken } from "./registry";

export interface GroupedSection {
  /** Stable key for the section (used for cardOrder lookups). */
  key: string;
  /** Display label for the section header. */
  label: string;
  docs: RuleDoc[];
}

export interface GroupOpts {
  categories: Category[];
  customTypes: CustomType[];
  cardOrder: Record<string, string[]>;
}

const END = Number.MAX_SAFE_INTEGER;

/** The folder a note lives in (its path minus the filename); "" for vault root. */
export function folderOf(path: string): string {
  const i = path.lastIndexOf("/");
  return i < 0 ? "" : path.slice(0, i);
}

/** The section key a doc falls under for a given grouping dimension. */
export function groupKeyOf(doc: RuleDoc, groupBy: GroupBy): string {
  switch (groupBy) {
    case "category":
      return doc.category;
    case "type":
      return doc.type;
    case "folder":
      return folderOf(doc.path);
    case "none":
      return "all";
  }
}

/** A comparator over category NAMES: known categories by their configured
 *  order, then anything else (e.g. "General", an unrecognized tag) A–Z. */
export function categoryComparator(categories: Category[]): (a: string, b: string) => number {
  const order = new Map<string, number>();
  for (const c of categories) order.set(c.name, c.order);
  return (a, b) => {
    const oa = order.has(a) ? (order.get(a) as number) : END;
    const ob = order.has(b) ? (order.get(b) as number) : END;
    return oa !== ob ? oa - ob : a.localeCompare(b);
  };
}

/** Rank lookup for type tokens: built-in filterable types, then the neutral
 *  `reference`, then custom types by their configured order. */
function typeRanks(customTypes: CustomType[]): Map<string, number> {
  const ordered: string[] = [
    ...FILTERABLE_TYPES,
    "reference",
    ...[...customTypes].sort((a, b) => a.order - b.order).map(customTypeToken),
  ];
  const m = new Map<string, number>();
  ordered.forEach((t, i) => m.set(t, i));
  return m;
}

/** Human-readable header for a section key. */
function labelFor(key: string, groupBy: GroupBy, customTypes: CustomType[]): string {
  if (groupBy === "type") {
    const custom = customTypes.find((t) => customTypeToken(t) === key || t.id.toLowerCase() === key);
    if (custom) return custom.name;
    // capitalize the built-in token for display (flowchart -> Flowchart)
    return key.charAt(0).toUpperCase() + key.slice(1);
  }
  if (groupBy === "folder") return key === "" ? "Vault root" : key;
  if (groupBy === "none") return "All notes";
  return key; // category name as-is
}

/** Comparator over section KEYS for a grouping dimension. */
function keyComparator(
  groupBy: GroupBy,
  opts: GroupOpts
): (a: string, b: string) => number {
  if (groupBy === "category") return categoryComparator(opts.categories);
  if (groupBy === "type") {
    const ranks = typeRanks(opts.customTypes);
    return (a, b) => {
      const ra = ranks.has(a) ? (ranks.get(a) as number) : END;
      const rb = ranks.has(b) ? (ranks.get(b) as number) : END;
      return ra !== rb ? ra - rb : a.localeCompare(b);
    };
  }
  // folder / none — plain alphabetical (none has a single key anyway)
  return (a, b) => a.localeCompare(b);
}

/** Order docs within a section by the chosen sort preset / custom order. */
export function sortDocs(
  docs: RuleDoc[],
  sort: SortMode,
  sectionKey: string,
  opts: GroupOpts
): RuleDoc[] {
  const az = (a: RuleDoc, b: RuleDoc): number => a.title.localeCompare(b.title);
  if (sort === "az") return [...docs].sort(az);
  if (sort === "za") return [...docs].sort((a, b) => b.title.localeCompare(a.title));
  if (sort === "type") {
    const ranks = typeRanks(opts.customTypes);
    const rank = (d: RuleDoc): number => (ranks.has(d.type) ? (ranks.get(d.type) as number) : END);
    return [...docs].sort((a, b) => rank(a) - rank(b) || az(a, b));
  }
  // custom: pinned order first (as listed), then any newcomers A–Z
  const order = opts.cardOrder[sectionKey] ?? [];
  const pos = new Map<string, number>();
  order.forEach((p, i) => pos.set(p, i));
  const listed: RuleDoc[] = [];
  const rest: RuleDoc[] = [];
  for (const d of docs) (pos.has(d.path) ? listed : rest).push(d);
  listed.sort((a, b) => (pos.get(a.path) as number) - (pos.get(b.path) as number));
  rest.sort(az);
  return [...listed, ...rest];
}

/** Build ordered sections from the flat doc list. */
export function buildSections(
  docs: RuleDoc[],
  groupBy: GroupBy,
  sort: SortMode,
  opts: GroupOpts
): GroupedSection[] {
  const groups = new Map<string, RuleDoc[]>();
  for (const d of docs) {
    const key = groupKeyOf(d, groupBy);
    const arr = groups.get(key);
    if (arr) arr.push(d);
    else groups.set(key, [d]);
  }
  const cmp = keyComparator(groupBy, opts);
  return [...groups.keys()].sort(cmp).map((key) => ({
    key,
    label: labelFor(key, groupBy, opts.customTypes),
    docs: sortDocs(groups.get(key) as RuleDoc[], sort, key, opts),
  }));
}
