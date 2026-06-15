import { render } from "preact";
import type CarrelPlugin from "./main";
import { CARREL_API_VERSION, type CarrelApi, type ReferenceHandle, type ReferenceMountOptions } from "./types/api";
import { getWayfinder } from "./util/plugins";
import { PF1E_CATEGORIES } from "./data/pf1e-categories";
import { PaneBoard } from "./components/pane/PaneBoard";

/** Minimal shape of the MiniSheet plugin Carrel reads through (untyped seam). */
interface MiniSheetLike {
  store?: {
    data?: { value?: { settings?: { rulesFolder?: string } } };
    getCharacter?: (id: string) => { name?: string } | null;
  };
}

/**
 * Concrete CarrelApi — the real integration surface another plugin consumes via
 * (app.plugins.getPlugin("carrel") as CarrelPlugin).api. mountReferences embeds
 * a brand-themed board for a character's nook; the nook (and the PF1e category
 * baseline) is seeded on first link.
 */
export class CarrelApiImpl implements CarrelApi {
  readonly apiVersion = CARREL_API_VERSION;

  constructor(private readonly plugin: CarrelPlugin) {}

  mountReferences(el: HTMLElement, opts: ReferenceMountOptions): ReferenceHandle {
    const root = document.createElement("div");
    root.className = "carrel-embed-root";
    el.appendChild(root);

    const draw = (characterId: string) => {
      const nookId = this.ensureCharacterNook(characterId);
      // Point the shared index at this character's nook so the embed populates.
      this.plugin.store.setActiveNook(nookId);
      render(<PaneBoard plugin={this.plugin} embed embedNookId={nookId} />, root);
    };
    draw(opts.characterId);

    return {
      unmount: () => {
        render(null, root);
        root.remove();
      },
      setCharacter: (id: string) => draw(id),
    };
  }

  getNookForCharacter(characterId: string): string | null {
    return this.plugin.store.nooks().find((n) => n.characterId === characterId)?.id ?? null;
  }

  linkCharacterNook(characterId: string): string {
    const existing = this.getNookForCharacter(characterId);
    if (existing) return existing;
    this.seedPf1eCategories();
    const ms = getWayfinder(this.plugin.app) as unknown as MiniSheetLike | null;
    const folder = ms?.store?.data?.value?.settings?.rulesFolder || "Rules";
    const charName = ms?.store?.getCharacter?.(characterId)?.name;
    const name = charName ? `${charName} — Rules` : "Character rules";
    return this.plugin.store.createNook({ name, folders: [folder], theme: "brand", characterId }).id;
  }

  private ensureCharacterNook(characterId: string): string {
    return this.getNookForCharacter(characterId) ?? this.linkCharacterNook(characterId);
  }

  private seedPf1eCategories(): void {
    if (this.plugin.store.categories().length) return;
    this.plugin.store.setCategories(
      PF1E_CATEGORIES.map((c, i) => ({
        id: "pf-" + i,
        name: c.name,
        color: c.color,
        iconSet: "lucide" as const,
        icon: c.icon,
        order: i,
      }))
    );
  }
}
