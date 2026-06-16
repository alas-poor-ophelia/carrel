/* Shared inline-SVG glyphs used across more than one component, to keep their
   path data in a single place. Single-use decorative SVGs stay inline at their
   call site — only genuinely duplicated glyphs live here. */
import type { JSX } from "preact";

/** Five-pointed star (the pin glyph), shared by the board chips/headers and the
 *  card star button. */
export const STAR_PATH =
  "M12 3.5l2.6 5.3 5.9.86-4.25 4.14 1 5.86L12 17.9l-5.25 2.76 1-5.86L3.5 9.66l5.9-.86z";

/** Six-dot drag handle, shared by the pinned rail and the settings reorder rows. */
export function DragGrip({ size = 14 }: { size?: number }): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" />
      <circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" />
      <circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" />
    </svg>
  );
}

/** Trash/delete glyph, shared by the settings delete buttons. */
export function TrashIcon({ size = 15 }: { size?: number }): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <path d="M5 7h14M9 7V5h6v2M10 11v6M14 11v6M6 7l1 13h10l1-13" />
    </svg>
  );
}

/** Plus/add glyph, shared by the settings add buttons. */
export function PlusIcon({ size = 15 }: { size?: number }): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
