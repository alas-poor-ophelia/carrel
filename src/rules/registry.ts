/* =====================================================================
   Content-type registry (pure). Each type carries a display label, an
   accent color (fed to cards via the `--bc` custom property, matching the
   design prototype) and a glyph key. Glyph keys are resolved to the
   plugin's icon system at render time (see src/components/rules/Icon).
   ===================================================================== */

import type { CustomType } from "../types/data";
import type { ContentType } from "./model";
import { refIconId } from "./icons";

export interface TypeInfo {
  label: string;
  color: string;
  glyph: string;
  /** Defaults to "rpg" (glyph resolved via refIconId). Set "lucide" to use the
   *  glyph as a literal `lucide-*` id (e.g. the image type, which has no
   *  RPG-Awesome equivalent). */
  iconSet?: "lucide" | "rpg";
}

/** The built-in, parser-backed content types. The TTRPG-flavored cosmetic types
 *  (ability/deed/trait) are intentionally gone — users re-create that capability
 *  as custom types (see CustomType). The remaining types each back a parser. */
export const CONTENT_TYPES: Record<ContentType, TypeInfo> = {
  flowchart: { label: "Flowchart", color: "#8a7bd8", glyph: "grab" },
  table: { label: "Table", color: "#5aa6b0", glyph: "scale" },
  formula: { label: "Formula", color: "#d8893f", glyph: "dice" },
  // a note that IS a Dice Roller lookup table (rollable in place)
  lookup: { label: "Roll Table", color: "#b8a23a", glyph: "clover" },
  process: { label: "Process", color: "#5fa98c", glyph: "list" },
  quote: { label: "Quote", color: "#b07cc6", glyph: "scroll" },
  // a note that IS (or prominently shows) an image — rendered as a thumbnail
  image: { label: "Image", color: "#6fb1d8", glyph: "lucide-image", iconSet: "lucide" },
  // neutral fallback for undeclared notes that don't infer to a richer type
  reference: { label: "Reference", color: "#9aa0a6", glyph: "book" },
};

/** Built-in types offered as filter chips (the neutral `reference` is implicit,
 *  not a chip — it just catches everything else). Present custom types are
 *  appended at render time. */
export const FILTERABLE_TYPES: ContentType[] = [
  "flowchart",
  "table",
  "formula",
  "lookup",
  "process",
  "quote",
  "image",
];

export function isContentType(s: string | undefined): s is ContentType {
  return s != null && s !== "" && Object.prototype.hasOwnProperty.call(CONTENT_TYPES, s);
}

/** A type resolved for rendering — built-in or custom — in a single shape the
 *  badge/chip/icon components can consume without caring about the source. */
export interface ResolvedType {
  label: string;
  color: string;
  iconSet: "lucide" | "rpg";
  /** rpg: a resolved `ra-*` id; lucide: a `lucide-*` id. */
  icon: string;
}

function findCustom(token: string, customTypes?: CustomType[]): CustomType | undefined {
  if (!customTypes || !token) return undefined;
  const lower = token.toLowerCase();
  // A note's `type:` token matches a custom type by its id (seeded types use the
  // token as id) or, like categories, by its display name (UI-created types carry
  // a random id and are referenced by name).
  return customTypes.find((t) => t.id.toLowerCase() === lower || t.name.toLowerCase() === lower);
}

/** The frontmatter token a note uses to opt into a custom type (its name,
 *  lowercased — mirrors how categories are referenced). */
export function customTypeToken(t: CustomType): string {
  return t.name.toLowerCase();
}

/** True if `id` names a built-in content type or a known custom type. */
export function isKnownType(id: string | undefined, customTypes?: CustomType[]): boolean {
  return isContentType(id) || !!findCustom(id ?? "", customTypes);
}

/** Resolve a type id (built-in or custom) to a render-ready shape. Unknown ids
 *  fall back to the neutral `reference` look so the UI never crashes on an
 *  orphaned type (e.g. a note tagged with a since-removed custom type). */
export function resolveType(id: string, customTypes?: CustomType[]): ResolvedType {
  const custom = findCustom(id, customTypes);
  if (custom) {
    return {
      label: custom.name,
      color: custom.color,
      iconSet: custom.iconSet,
      icon: custom.icon,
    };
  }
  const info = isContentType(id) ? CONTENT_TYPES[id] : CONTENT_TYPES.reference;
  const iconSet = info.iconSet ?? "rpg";
  const icon = iconSet === "lucide" ? info.glyph : refIconId(info.glyph);
  return { label: info.label, color: info.color, iconSet, icon };
}
