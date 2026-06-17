# Changelog

All notable changes to Carrel are documented here. The release workflow publishes
the section matching each pushed tag as that GitHub release's notes, so keep the
headings as `## <version>` (matching the tag exactly, no `v` prefix).

## 0.10.5

### Build/dependency alignment

- Aligned the dev/test dependency tree with the sister plugin's known-good configuration: `vitest` pinned to 3.2.x with `vite` 6 / `rollup` 4 via `overrides`, dropping the pre-release `rolldown` + `vite` 8 chain that `vitest` 4 pulled in. No functional changes to the plugin — the compiled `main.js` is byte-for-byte identical to 0.10.4.

## 0.10.4

### Security and build hardening

- **esbuild updated to 0.28.1**, clearing a high-severity advisory (GHSA-gv7w-rqvm-qjhr) so the dependency audit is clean. This was also the root cause of the store's build-verification mismatch — releases now build against a current, non-vulnerable bundler. No functional changes to the plugin.

## 0.10.3

### Reproducible release builds (store-verified)

- Release builds now match the Obsidian store scanner's own rebuild exactly: the project ships a committed `package-lock.json` and builds via `npm ci` + `npm run build` (Node), so the published `main.js` can be byte-verified against source. No functional changes.

## 0.10.2

### Reproducible release builds

- The build no longer embeds a per-build timestamp, so release `main.js` is now byte-for-byte reproducible and can be verified against its source provenance. No functional changes to the plugin.

## 0.10.1

### Submission polish

Housekeeping for the Obsidian community-plugin submission — no behaviour changes to your nooks, board, or notes.

- **Popout-window ready** — timers and document access now resolve against the active window, so the board behaves correctly when opened in a popped-out Obsidian window.
- **Type-safety and lint cleanups** across the codebase, now checked against the latest official Obsidian community lint rules.
- **Minimum Obsidian version is now 1.7.2.**
- **Release builds carry cryptographic provenance attestations**, so you can verify the published `main.js`/`styles.css` were built from this source.

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
