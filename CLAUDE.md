# Carrel — Development Guide

## What Is This Project?

**Carrel** ("Carrel: a novel way to view your notes") is a **standalone Obsidian
plugin** that presents any set of vault notes as a column-balancing board of typed
reference cards — a full workspace pane plus an embeddable sidebar view. Preact +
TypeScript, bundled with esbuild (windrose/MiniSheet pattern). Plugin data (nooks,
the global category list, per-nook pins/order/checklist) lives in the plugin's
`data.json`. The notes themselves are ordinary vault markdown, indexed per-nook.

Carrel was **forked from the MiniSheet character sheet's References tab**
(`C:\Dev\minisheet`). MiniSheet remains the visual/brand reference and the
integration partner: when both plugins are installed, MiniSheet can render Carrel
*in place of* its built-in References tab via Carrel's typed plugin API.

Design source of truth: `C:\Dev\_carrel_handoff\design_handoff_reference_full_pane\`
(README.md + the two HTML mockups + `pane/*.css` for exact tokens/timings).
Active plan: `C:\Users\whipl\.claude\plans\swirling-leaping-flame.md`.

## Layout

| Path | Role |
|------|------|
| `src/main.ts` | Plugin entry: pane view, commands, settings, API, bridge |
| `src/types/api.ts` | The public `CarrelApi` contract (MiniSheet mirrors this) |
| `src/types/data.ts` | Persisted `CarrelData` (nooks + global categories) |
| `src/api.ts` | `CarrelApiImpl` — the real plugin-instance integration API |
| `src/rules/` | Pure TS reference core (model/parse/scrape/search/registry/icons) |
| `src/components/` | Preact components (pane board, cards, typed blocks, settings) |
| `src/bridge/mcp-bridge.ts` | `window.__carrel` — DEV TOOLING ONLY (not the integration path) |
| `scss/` | SCSS partials → `styles.css` (never hand-edit styles.css) |
| `mcp/` | Carrel MCP server (Obsidian CLI transport, targets the carrel-test-vault) |
| `tests/unit/` | vitest; parse characterization suite |
| `carrel-test-vault/` | Isolated clean-room Obsidian vault (Carrel alone) |

## Build / Deploy / Loop

```
bun run build        # sass + esbuild -> main.js/styles.css
bun run deploy       # build + copy to BOTH carrel-test-vault and MiniSheet Dev
bun run typecheck    # tsc --noEmit
bun run test:unit    # vitest (tests/unit)
```

`deploy` copies `main.js`/`styles.css`/`manifest.json` to two plugin dirs:
`carrel-test-vault/.obsidian/plugins/carrel` (clean-room) and the `MiniSheet Dev` vault's
`carrel` plugin dir (integration). A target whose vault is missing is skipped; the
Sync tripwire fires only on the MiniSheet Dev target.

### Before every commit (MANDATORY)

Run **`bun run check`** (typecheck + ESLint) before every commit — at an absolute
minimum **`bun run lint`** must pass. ESLint enforces the Obsidian submission rules
the community bot scans for in the compiled `main.js` (no `innerHTML`/`outerHTML`,
no `var`, no stray `console.log`, no unhandled promises), so a clean lint is what
keeps the plugin submittable. Prefer `bun run check && bun run test:unit` for any
change touching `src/rules/` or state. (This is the written rule; an opt-in git
`pre-commit` hook that enforces it lives in `.githooks/` — enable with
`git config core.hooksPath .githooks`. See `.githooks/README.md`.)

### Development cycle (MANDATORY)

```
1. CHANGE  — edit src/scss
2. DEPLOY  — bun run deploy
3. RELOAD  — reload carrel (verify buildStamp CHANGED; stale = loud failure)
4. DRIVE   — open the pane / mount the embed / drive nooks
5. VERIFY  — screenshot vs _carrel_handoff/*.html; console errors clean
```

- **Early phases ride the existing MiniSheet MCP**: deploy Carrel into the
  `MiniSheet Dev` vault, then use `minisheet_eval` (poke `window.__carrel`),
  `minisheet_screenshot`, `minisheet_errors`, and reload Carrel via an eval
  (`app.plugins.disablePlugin("carrel"); app.plugins.enablePlugin("carrel")`).
  Carrel's own MCP + the isolated carrel-test-vault give the standalone loop (Phase 9).
- **Eval gotchas** (inherited from MiniSheet): the CLI eval context truncates at
  the first newline — write payloads as one line; avoid `>`/`<`/`|`/`&` in inline
  eval text (cmd.exe quoting). The MCP helpers base64-transport payloads.

## Integration with MiniSheet

- **Detect**: `app.plugins.getPlugin("minisheet")` (Carrel) /
  `app.plugins.getPlugin("carrel")` (MiniSheet). Null when absent — feature-detect.
- **API, not a window global**: Carrel exposes `this.api: CarrelApi` (Phase 0 stub →
  real in Phase 8). MiniSheet consumes a type-only `carrel-api.d.ts` mirror and casts
  the `getPlugin` result. `window.__carrel` is strictly MCP dev tooling.
- **RPG Awesome glyphs** are owned by MiniSheet; Carrel consumes the live webfont
  when present and gates the RPG icon source on MiniSheet detection.

## Design Constraints

- Full pane is wide; the embedded sidebar view is ~321px, iPad-first (45px touch
  targets), dark theme by default.
- **Per-nook theming**: `brand` (the MiniSheet red/gold + Norwester/Taroca look) or
  `obsidian` (inherits the user's active theme via native vars).
- **Style Settings**: accents + fonts are user-customizable. The `/* @settings */`
  block (`id: carrel`) lives in `scss/_style-settings.scss`. Brand values route
  through the seam chain in `_variables.scss`:
  `var(--cr-accent-*, var(--ms-accent-*, <brand default>))` — Carrel's own settings
  win, then MiniSheet's seam (character-linked nooks), then the default. NEVER define
  a seam token on a `.carrel-*-root` class (it would beat Style Settings' body write).
  Use local `--cr-red`/`--cr-gold` aliases and read font seams inline.

## Known Hazards (carried from MiniSheet field notes)

- **Card-as-`<button>` collapse**: Obsidian pins button height + `white-space:nowrap`.
  Any card/chip button must set `height:auto; align-items:stretch; white-space:normal;
  min-width:0` explicitly. **Verify layout by GEOMETRY** (getBoundingClientRect heights
  + pairwise overlap), never by element counts.
- **Every new `<button>` needs an `.is-tablet` override** (DO THIS WHEN YOU ADD THE
  BUTTON, not later): under `.is-tablet`, Obsidian's mobile chrome forces a
  background, border, box-shadow and `min-height` on plain buttons, and there is no
  `:hover` on touch (so hover-revealed controls must be made visible another way).
  Add a rule in `scss/_tablet.scss` (scoped under `.carrel-*-root`) stripping
  `background/border/box-shadow` and setting `height:auto; min-height:0` for the new
  button — see `.cr-card__close`, `.cr-card__grip` there as the template.
- **Bare `<svg>` glyph sizing**: size icons via descendant `svg {…}`, not a class
  selector (shared stroke glyphs render a class-less `<svg>`).
- **Entrance animations never start at `opacity:0`** — off-screen panes pause CSS
  clocks, leaving content invisible. All reveal/reflow motion lives in JS transforms.
