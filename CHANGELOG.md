# Changelog

All notable changes to Carrel are documented here. The release workflow publishes
the section matching each pushed tag as that GitHub release's notes, so keep the
headings as `## <version>` (matching the tag exactly, no `v` prefix).

## 0.10.0

### Group, sort, and arrange your board

The board is no longer locked to alphabetical categories — organize it your way, per nook.

- **Group by** Category, Type, Folder, or None, from a new toolbar dropdown.
- **Sort** each group A–Z, Z–A, or by type.
- **Your category order is respected** — category groups now follow the order you set in **Settings → Categories** (drag the rows to reorder); unlisted categories like "General" fall to the end.
- **Drag cards to arrange them** — grab a card by its handle and drop it where you want within its group; a highlighted slot previews where it'll land. Your arrangement saves per nook and switches Sort to "Custom" (pick a preset anytime to leave it — your custom order is remembered).

Grouping, sort, and custom arrangement are all saved per nook, so each nook keeps its own layout.

## 0.9.1

### Map your own front-matter properties

Carrel no longer assumes your notes use `category:` and `type:`. Under **Settings → Carrel → Front-matter mapping**, you can now point each at whatever field your vault already uses.

- **Defaults unchanged** — `category` and `type`. Existing vaults keep working exactly as before; this is opt-in.
- **Read any field** — e.g. drive the category off your `tags` list, or read a `noteType` field for the type.
- **Lists use the first value** — if the property is an array like `tags: [npc, location]`, Carrel uses the first entry (`npc`).
- **Graceful fallback** — anything Carrel can't read passes through to the usual default: uncategorized notes show as **General**, and an unrecognized type still renders by its content (table, flowchart, quote…).

Changing a property re-indexes your notes immediately.

## 0.9.0

Initial public release. View, sort, and study any set of notes as a column-balancing board of typed reference cards — a full workspace pane plus an embeddable sidebar view. Integrates with the Wayfinder character sheet when both are installed.
