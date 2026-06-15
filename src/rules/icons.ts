/* Maps the design prototype's friendly glyph keys (and content-type glyphs)
   to ids in the bundled RPG-Awesome icon registry. Authors may also put a
   raw `ra-*` id straight into a note's `icon:` field. Tunable in one place. */

const GLYPH_MAP: Record<string, string> = {
  // content-type glyphs (see registry.ts)
  spark: "ra-sunbeams",
  mask: "ra-arcane-mask",
  clover: "ra-clover",
  grab: "ra-hand",
  scale: "ra-scroll-unfurled",
  dice: "ra-perspective-dice-five",
  list: "ra-cog",
  scroll: "ra-scroll-unfurled",
  book: "ra-book",
  cycle: "ra-cycle",
  help: "ra-help",
  // common per-doc glyphs
  sun: "ra-sun",
  shield: "ra-shield",
  eye: "ra-eyeball",
  hand: "ra-hand",
  rapier: "ra-crossed-swords",
  swords: "ra-crossed-swords",
  bolt: "ra-lightning-bolt",
  hammer: "ra-hammer",
  skull: "ra-skull",
  weight: "ra-anvil",
};

export function refIconId(glyph: string | undefined): string {
  if (!glyph) return "ra-book";
  if (glyph.startsWith("ra-")) return glyph;
  return GLYPH_MAP[glyph] ?? "ra-book";
}
