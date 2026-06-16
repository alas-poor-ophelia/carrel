import { getIconIds } from "obsidian";
import type { JSX } from "preact";
import { ICONS } from "../../data/icons/registry";
import { GlyphIcon, LucideGlyph } from "../common/GlyphIcon";

export { LucideGlyph };

/** Obsidian's bundled Lucide icon ids (e.g. "lucide-book"). */
export function lucideIds(): string[] {
  return getIconIds()
    .filter((id) => id.startsWith("lucide-"))
    .sort();
}

/** The bundled RPG Awesome glyph ids (e.g. "ra-sword"). */
export function rpgIds(): string[] {
  return Object.keys(ICONS)
    .filter((id) => id.startsWith("ra-"))
    .sort();
}

/** Strip the source prefix for a friendlier display name. */
export function iconDisplayName(icon: string): string {
  return icon.replace(/^lucide-/, "").replace(/^ra-/, "");
}

/** Dispatch a category icon by its source set. Size comes from CSS context. */
export function CategoryIcon({ iconSet, icon }: { iconSet: "lucide" | "rpg"; icon: string }): JSX.Element {
  return <GlyphIcon iconSet={iconSet} icon={icon} />;
}
