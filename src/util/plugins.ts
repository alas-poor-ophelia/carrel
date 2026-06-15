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
  return !!(app as unknown as { plugins?: PluginsApi }).plugins?.enabledPlugins?.has(id);
}

/** The partner character-sheet plugin. It was renamed MiniSheet → Wayfinder
 *  (new manifest id "wayfinder"); detect either id, preferring the new one, so
 *  Carrel's RPG-icon source and character-linked seam work across the rename
 *  transition regardless of which build the user still has enabled. */
export function getWayfinder(app: App): Plugin | null {
  return getPlugin(app, "wayfinder") ?? getPlugin(app, "minisheet");
}
