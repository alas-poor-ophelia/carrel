# Changelog

All notable changes to Carrel are documented here. The release workflow publishes
the section matching each pushed tag as that GitHub release's notes, so keep the
headings as `## <version>` (matching the tag exactly, no `v` prefix).

## 1.1.0

Two new ways to see your notes — **kanban swimlanes** and **image cards** — plus a choice of where your nook data lives.

### New

- **Kanban layout.** Switch any nook from the masonry board to a **Kanban** layout (a toolbar dropdown, saved per nook): your categories become columns and each card sits under its category. Curate the columns with the **＋ Add column** button — pick any existing or defined category, or create a brand-new swimlane on the spot — and remove one with the **×** on its header. **Drag a card between columns** to recategorize it: the new category is written into the note's front matter, so the move sticks to the note. Open a card and it **expands sideways**, spanning columns and flowing the neighbouring swimlanes out of the way. A wide board scrolls horizontally (wheel over the headers, drag the header row, or just drag a card toward the edge to auto-scroll); column width is adjustable in Style Settings. In a Bases view, cards can be reordered but not moved between columns.
- **Image cards.** A note that's mostly a picture renders as an **image card** — a cover-cropped thumbnail when collapsed, the full image when expanded. You can also give any note a **cover image** via a front-matter property (default `image`, configurable), which forces an image card and supplies the thumbnail even when the note has other content. It doubles as the cover mapping for Bases views.
- **Pluggable storage backends.** Choose where Carrel keeps its nook data: the plugin's own `data.json` (default), or a single **JSON** or **YAML** file inside your vault. Switching migrates your current data to the new location and leaves the old file as a backup.

### Fixed

- **Escape no longer swaps away the Carrel tab.** Pressing Escape in the full pane closes the focused card and clears focus, instead of letting Obsidian's global keymap steal it to switch panes.
- **The drag ghost follows the cursor in multi-pane layouts.** When Carrel wasn't the leftmost pane, the floating copy of a dragged card appeared offset from the pointer; it now tracks correctly (on both the board and the kanban layout).

## 1.0.1

### Fixed

- The drag-to-reorder handle no longer reserves space on collapsed cards, so each card's type icon sits flush at the left edge instead of being indented by the width of the handle. The handle still fades in on hover and the card stays draggable.

## 1.0.0

The first stable release. **Requires Obsidian 1.10+.**

### New

- **Obsidian callouts & infoboxes render natively.** A card whose note uses a `> [!type]` callout — including the worldbuilding "infobox" pattern — now renders through Obsidian's own renderer, so embedded images, headings and tables inside the callout resolve correctly.
- **Type detection rules.** Disable any built-in type you don't use, and auto-assign a type to notes that match a metadata rule — a frontmatter key, a frontmatter key/value pair, or a tag (Settings → Types).
- **Bases view.** With Obsidian Bases, a `.base` file can switch to a new "Carrel" view and render its filtered notes as the full Carrel board — real types, flowcharts, colors and all. Each Bases view keeps its own grouping, sort and pins.

### Changed

- **Card titles now come from the note's filename**, not its first heading — an early `##` can no longer hijack a card's title.
- **The "Quote" type matches real markdown blockquotes only**, and no longer mistakes a styled `> [!callout]` for a quote.
- **Minimum Obsidian version raised to 1.10.0** (required by the Bases integration; the rest of the plugin is unaffected).

### Fixed

- The default `build` script now produces the production (minified) bundle, so the community store's build-verification rebuild matches the released `main.js`.

## 0.10.8

### Build reproducibility

- The production build now embeds a stable build stamp instead of a per-build timestamp, so the released `main.js` is byte-for-byte reproducible from source. Development builds keep the volatile stamp the local reload tooling relies on. No functional changes to the plugin.

## 0.10.7

### Repository hygiene

- Removed the local development `carrel-test-vault/` fixture from version control (it remains on disk for the dev/MCP loop). It is a test-only Obsidian vault that never belonged in the published plugin repo. No functional changes to the plugin.

## 0.10.6

### Build configuration aligned with the sister plugin

- `esbuild.config.mjs` no longer reads `manifest.json` at build time; the build stamp is now a per-build value, mirroring the sister plugin (Wayfinder) exactly — whose build passes the store's "Build verified against source" check. This removes the only build-config difference between the two plugins. No functional changes to the plugin.

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
