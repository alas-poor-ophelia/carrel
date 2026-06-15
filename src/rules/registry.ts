/* =====================================================================
   Content-type registry (pure). Each type carries a display label, an
   accent color (fed to cards via the `--bc` custom property, matching the
   design prototype) and a glyph key. Glyph keys are resolved to the
   plugin's icon system at render time (see src/components/rules/Icon).
   ===================================================================== */

import type { ContentType } from "./model";

export interface TypeInfo {
  label: string;
  color: string;
  glyph: string;
}

export const CONTENT_TYPES: Record<ContentType, TypeInfo> = {
  ability: { label: "Ability", color: "#cf9b54", glyph: "spark" },
  deed: { label: "Deed", color: "#c66b8e", glyph: "mask" },
  trait: { label: "Trait", color: "#7aa86a", glyph: "clover" },
  flowchart: { label: "Flowchart", color: "#8a7bd8", glyph: "grab" },
  table: { label: "Table", color: "#5aa6b0", glyph: "scale" },
  formula: { label: "Formula", color: "#d8893f", glyph: "dice" },
  process: { label: "Process", color: "#5fa98c", glyph: "list" },
  lore: { label: "Lore", color: "#b07cc6", glyph: "scroll" },
  // neutral fallback for undeclared notes that don't infer to a richer type
  reference: { label: "Reference", color: "#9aa0a6", glyph: "book" },
};

/** Types offered as filter chips (the neutral `reference` is implicit, not a
 *  chip — it just catches everything else). Order matches the prototype. */
export const FILTERABLE_TYPES: ContentType[] = [
  "ability",
  "deed",
  "trait",
  "flowchart",
  "table",
  "formula",
  "process",
  "lore",
];

export function isContentType(s: string | undefined): s is ContentType {
  return !!s && Object.prototype.hasOwnProperty.call(CONTENT_TYPES, s);
}
