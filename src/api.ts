import type CarrelPlugin from "./main";
import { CARREL_API_VERSION, type CarrelApi, type ReferenceHandle, type ReferenceMountOptions } from "./types/api";

/**
 * Concrete implementation of the public CarrelApi, constructed once in
 * onload() and held as plugin.api. Phase 0 ships a working-but-stub embed; the
 * real masonry embed + nook resolution land in Phases 5/8.
 */
export class CarrelApiImpl implements CarrelApi {
  readonly apiVersion = CARREL_API_VERSION;

  constructor(private readonly plugin: CarrelPlugin) {}

  mountReferences(el: HTMLElement, opts: ReferenceMountOptions): ReferenceHandle {
    const root = document.createElement("div");
    root.className = "carrel-embed-root";
    root.textContent = `Carrel embed for character "${opts.characterId}" — full embed arrives in Phase 8.`;
    el.appendChild(root);
    return {
      unmount: () => root.remove(),
      setCharacter: () => {},
    };
  }

  getNookForCharacter(_characterId: string): string | null {
    // Resolved against persisted nooks in Phase 5/8.
    void this.plugin;
    return null;
  }

  linkCharacterNook(_characterId: string): string {
    // Seeds the PF1e nook + categories in Phase 8.
    return "";
  }
}
