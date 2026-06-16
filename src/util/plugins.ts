import type { App, Plugin } from "obsidian";

/** app.plugins is an internal (untyped) Obsidian API; this is the one place we
 *  reach into it, for cross-plugin detection (MiniSheet ↔ Carrel). */
interface PluginsApi {
  getPlugin(id: string): Plugin | null;
  enabledPlugins: Set<string>;
}

export function getPlugin(app: App, id: string): Plugin | null {
  return (app as unknown as { plugins?: PluginsApi }).plugins?.getPlugin(id) ?? null;
}

export function isPluginEnabled(app: App, id: string): boolean {
  return (app as unknown as { plugins?: PluginsApi }).plugins?.enabledPlugins?.has(id) ?? false;
}

/** The partner character-sheet plugin. It was renamed MiniSheet → Wayfinder
 *  (new manifest id "wayfinder"); detect either id, preferring the new one, so
 *  Carrel's RPG-icon source and character-linked seam work across the rename
 *  transition regardless of which build the user still has enabled. */
export function getWayfinder(app: App): Plugin | null {
  return getPlugin(app, "wayfinder") ?? getPlugin(app, "minisheet");
}

/* ---------- Dice Roller integration (plan Part A) ----------
   The community Dice Roller plugin's usable API lives on the WINDOW GLOBAL
   `window.DiceRoller` — the plugin-object getRoller() was deprecated/broken in
   v11.x (issue #357). Structural types only; no build-time dependency.
   Surface confirmed by spike S-A1 against v11.4.2. */

export interface RollerLike {
  roll(): Promise<unknown>;
  /** Synchronous total (preferred; present in v11.4.2). */
  rollSync?(): unknown;
  getResultText?(): string;
  getTooltip?(): string;
  /** A mountable <span> with Dice Roller's own interactive widget. */
  containerEl: HTMLElement;
}

export interface DiceRollerLike {
  getRoller(input: string, source?: string): Promise<RollerLike>;
  getArrayRoller(options: unknown[], rolls?: number): Promise<RollerLike>;
}

/** The live Dice Roller API, or null when the plugin is absent/unusable.
 *  Gated on the plugin being present, then resolved via the window global. */
export function getDiceRoller(app: App): DiceRollerLike | null {
  if (!getPlugin(app, "obsidian-dice-roller")) return null;
  const g = (window as unknown as { DiceRoller?: DiceRollerLike }).DiceRoller;
  return g && typeof g.getRoller === "function" ? g : null;
}
