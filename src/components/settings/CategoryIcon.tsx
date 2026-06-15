import { getIconIds, setIcon } from "obsidian";
import { useEffect, useRef } from "preact/hooks";
import { ICONS } from "../../data/icons/registry";
import { Icon } from "../common/Icon";

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

/** A Lucide glyph rendered via Obsidian's setIcon (real, themeable). */
export function LucideGlyph({ id }: { id: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.textContent = "";
    setIcon(el, id.startsWith("lucide-") ? id : "lucide-" + id);
    const svg = el.querySelector("svg");
    if (svg) {
      svg.setAttribute("width", "100%");
      svg.setAttribute("height", "100%");
    }
  }, [id]);
  return <span class="cr-lucide" ref={ref} />;
}

/** Dispatch a category icon by its source set. Size comes from CSS context. */
export function CategoryIcon({ iconSet, icon }: { iconSet: "lucide" | "rpg"; icon: string }) {
  if (iconSet === "rpg") return <Icon id={icon} />;
  return <LucideGlyph id={icon} />;
}
