import type { JSX } from "preact";
import { ICONS } from "../../data/icons/registry";

/**
 * Inline-SVG icon from the bundled registry (RPG Awesome / game-icons.net
 * glyphs). Fills with currentColor so CSS color/filter state styling applies.
 */

// fallback: simple question-mark-in-diamond so a bad id is visible, not blank
const FALLBACK_PATH =
  "M256 32 480 256 256 480 32 256Zm0 96a72 72 0 0 0-72 72h48a24 24 0 1 1 41 17c-14 14-41 26-41 63v16h48v-12c0-18 27-26 41-49a72 72 0 0 0-65-107zm-24 216v48h48v-48z";

export function Icon({ id, class: cls }: { id: string; class?: string }): JSX.Element {
  // ICONS is typed as a total Record, but a bad id resolves to undefined at runtime.
  const def: (typeof ICONS)[string] | undefined = ICONS[id];
  const suffix = cls != null && cls !== "" ? " " + cls : "";
  if (def == null) {
    return (
      <svg class={`cr-icon cr-icon--missing${suffix}`} viewBox="0 0 512 512" aria-hidden="true">
        <path d={FALLBACK_PATH} fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg class={`cr-icon${suffix}`} viewBox={def.viewBox} aria-hidden="true">
      <path d={def.path} fill="currentColor" transform={def.transform} />
    </svg>
  );
}
