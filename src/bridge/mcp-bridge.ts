import type CarrelPlugin from "../main";

/**
 * window.__carrel — the surface the Carrel MCP server drives via `ob eval`.
 * This is DEV TOOLING ONLY; it is NOT the inter-plugin integration path (that
 * is the typed plugin-instance API at plugin.api, see src/types/api.ts).
 * `buildStamp` changes every build so the reload tool can prove the running
 * code actually changed (reload-success-but-stale-code is a known failure).
 */
export interface CarrelBridge {
  version: string;
  buildStamp: string;
  getState(): unknown;
  listNooks(): { id: string; name: string }[];
  openPane(): Promise<void>;
  /** Index health: folders watched, doc count, and the indexed titles. */
  indexStats(): { folders: string[]; count: number; titles: string[] };
  /** Parsed RuleDoc for a path (for verifying the parser end-to-end). */
  getDoc(path: string): unknown;
}

declare global {
  interface Window {
    __carrel?: CarrelBridge;
  }
}

export function installBridge(plugin: CarrelPlugin): void {
  window.__carrel = {
    version: plugin.manifest.version,
    buildStamp: __BUILD_STAMP__,
    getState: () => JSON.parse(JSON.stringify(plugin.data)),
    listNooks: () => [], // Phase 5
    openPane: () => plugin.activatePaneView(),
    indexStats: () => {
      const docs = plugin.index.docs.value;
      return {
        folders: plugin.index.getFolders(),
        count: docs.length,
        titles: docs.map((d) => d.title),
      };
    },
    getDoc: (path) => {
      const doc = plugin.index.byPath(path);
      return doc ? JSON.parse(JSON.stringify(doc)) : null;
    },
  };
}

export function removeBridge(): void {
  delete window.__carrel;
}
