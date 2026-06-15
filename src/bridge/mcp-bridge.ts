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
  };
}

export function removeBridge(): void {
  delete window.__carrel;
}
