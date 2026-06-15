// ─────────────────────────────────────────────────────────────────────────
// The Carrel public API — the contract another plugin (e.g. MiniSheet) uses
// to embed Carrel's references view. This is a REAL plugin-instance API, not a
// window global: a consumer obtains it via
//   (app.plugins.getPlugin("carrel") as CarrelPlugin | null)?.api
// and the reference is dropped when Carrel unloads (no leaked globals).
//
// This file is the canonical source of the contract. MiniSheet mirrors a
// type-only copy as `carrel-api.d.ts` so it depends on the shape, not on
// Carrel at runtime.
// ─────────────────────────────────────────────────────────────────────────

/** Bumped on any breaking change to the API shape. Consumers should compare. */
export const CARREL_API_VERSION = 1;

export interface ReferenceMountOptions {
  /** The character whose linked nook should be shown. */
  characterId: string;
  /** Render mode. Only the sidebar embed exists today. */
  mode: "sidebar";
}

/** Handle returned by mountReferences; the host keeps it for teardown. */
export interface ReferenceHandle {
  /** Unmount the embedded view and release its resources. */
  unmount(): void;
  /** Swap the active character (e.g. the sheet changed characters). */
  setCharacter(id: string): void;
}

export interface CarrelApi {
  /** Matches CARREL_API_VERSION at build time; check for compatibility. */
  readonly apiVersion: number;
  /**
   * Render Carrel's references view into `el` for a character. Carrel resolves
   * (or seeds) the nook linked to the character and themes it to the brand.
   */
  mountReferences(el: HTMLElement, opts: ReferenceMountOptions): ReferenceHandle;
  /** The nook id linked to a character, or null if none is linked yet. */
  getNookForCharacter(characterId: string): string | null;
  /** Seed a PF1e nook + default categories for a character; returns its id. */
  linkCharacterNook(characterId: string): string;
}
