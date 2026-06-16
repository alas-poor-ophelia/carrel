/* The one place a glyph from either icon source is rendered. RPG Awesome ids go
   through the bundled inline-SVG registry; Lucide ids render via Obsidian's
   setIcon. Both forward an optional class so callers control sizing. Used by the
   settings category/type pickers and the pane's type badges/chips/cards. */
import { setIcon } from "obsidian";
import type { JSX } from "preact";
import { useEffect, useRef } from "preact/hooks";
import { refIconId } from "../../rules/icons";
import { Icon } from "./Icon";

/** A Lucide glyph rendered via Obsidian's setIcon (real, themeable). */
export function LucideGlyph({ id, class: cls }: { id: string; class?: string }): JSX.Element {
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
  return <span class={"cr-lucide" + (cls != null && cls !== "" ? " " + cls : "")} ref={ref} />;
}

/** Render a glyph by its source set. RPG ids are run through refIconId so bare
 *  glyph keys (e.g. an author's `icon: sun`) still resolve; already-resolved
 *  `ra-*` / `lucide-*` ids pass through unchanged. */
export function GlyphIcon({
  iconSet,
  icon,
  class: cls,
}: {
  iconSet: "lucide" | "rpg";
  icon: string;
  class?: string;
}): JSX.Element {
  if (iconSet === "lucide") return <LucideGlyph id={icon} class={cls} />;
  return <Icon id={refIconId(icon)} class={cls} />;
}
