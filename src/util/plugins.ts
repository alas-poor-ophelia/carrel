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
