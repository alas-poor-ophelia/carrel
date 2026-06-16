/* On-board card drag-to-reorder (Phase 2), a masonry-aware sibling of
   useRailDrag. Dragging a card's grip clones it into a fixed-position ghost
   that follows the cursor, while the ORIGINAL cell stays in flow as a
   highlighted placeholder slot (styled via the cell's .is-drag class). The
   nook's custom card order is rewritten LIVE within the dragged card's own
   section, so the masonry slides the placeholder to its landing position —
   that's the drop preview. Cross-section moves are intentionally unsupported:
   the nearest-card search is restricted to the dragged card's section.

   The clone is appended inside the board root (which carries the theme/density
   classes) so it inherits the card styling; `--bc` is inline on the card, so it
   survives the clone. Window listeners and the ghost node are torn down on
   pointerup/cancel and on unmount, so a drag interrupted by the pane closing
   can't leak them. */
import { useCallback, useEffect, useRef } from "preact/hooks";
import type { CarrelStore } from "../../../state/store";
import type { Nook } from "../../../types/data";
import type { Section } from "./useMasonryPack";

interface CardDragOptions {
  store: CarrelStore;
  nookRef: { current: Nook | null };
  sectionsRef: { current: Section[] };
  cells: { current: Map<string, HTMLElement> };
  appRef: { current: HTMLElement | null };
  setDragId: (id: string | null) => void;
}

export function useCardDrag(opts: CardDragOptions): {
  onCardDown: (e: PointerEvent, id: string) => void;
} {
  const { store, nookRef, sectionsRef, cells, appRef, setDragId } = opts;
  const dragRef = useRef<{
    id: string;
    ghost: HTMLElement;
    dx: number;
    dy: number;
    sectionKey: string;
    order: string[];
    members: Set<string>;
  } | null>(null);

  const onMove = useCallback(
    (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      // carry the ghost under the cursor
      d.ghost.style.left = e.clientX - d.dx + "px";
      d.ghost.style.top = e.clientY - d.dy + "px";
      // Hit-test the card directly under the cursor (the ghost is pointer-events:
      // none, so it's transparent to this). Using what's UNDER the pointer rather
      // than the nearest center is what stops reorder oscillation: after a swap
      // the placeholder slot lands under the cursor, so the hit-test returns the
      // dragged card itself and nothing moves until the cursor leaves its slot.
      const hit = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      const cellUnder = hit?.closest<HTMLElement>(".cr-cell") ?? null;
      if (!cellUnder) return;
      const targetPath = cellUnder.dataset.path ?? null;
      // over the placeholder, a gap, or a card in ANOTHER section → no move
      // (members is this section only, so cross-section drags are ignored)
      if (targetPath == null || targetPath === d.id || !d.members.has(targetPath)) return;
      const r = cellUnder.getBoundingClientRect();
      const after = e.clientY > r.top + r.height / 2;
      const order = d.order.filter((p) => p !== d.id);
      const ti = order.indexOf(targetPath);
      order.splice(after ? ti + 1 : ti, 0, d.id);
      if (order.join() !== d.order.join()) {
        d.order = order;
        const cur = nookRef.current;
        if (cur) store.setNookCardOrder(cur.id, d.sectionKey, order);
      }
    },
    [store, nookRef]
  );

  const onUp = useCallback(() => {
    const d = dragRef.current;
    if (d) d.ghost.remove();
    dragRef.current = null;
    setDragId(null);
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
  }, [onMove, setDragId]);

  const onCardDown = (e: PointerEvent, id: string): void => {
    if (e.button !== 0) return;
    const cur = nookRef.current;
    if (!cur) return;
    // the grouped section that contains this card (search "Results" has no key)
    const sec = sectionsRef.current.find(
      (s) => !s.results && s.key != null && s.docs.some((x) => x.path === id)
    );
    if (!sec || sec.key == null) return;
    const el = cells.current.get(id);
    const host = appRef.current;
    if (!el || !host) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = el.getBoundingClientRect();
    const order = sec.docs.map((x) => x.path);
    // clone the card as a floating ghost; the original becomes the placeholder
    const ghost = el.cloneNode(true) as HTMLElement;
    ghost.classList.add("cr-ghost");
    ghost.classList.remove("is-focused", "is-open");
    Object.assign(ghost.style, {
      position: "fixed",
      left: rect.left + "px",
      top: rect.top + "px",
      width: rect.width + "px",
      margin: "0",
      transform: "none",
      transition: "none",
      pointerEvents: "none",
    });
    host.appendChild(ghost);
    dragRef.current = {
      id,
      ghost,
      dx: e.clientX - rect.left,
      dy: e.clientY - rect.top,
      sectionKey: sec.key,
      order,
      members: new Set(order),
    };
    // pin the current order as the custom baseline and switch to custom so the
    // arrangement doesn't jump as the drag begins
    store.setNookCardOrder(cur.id, sec.key, dragRef.current.order);
    if (cur.tweaks.sort !== "custom") store.setNookSort(cur.id, "custom");
    setDragId(id);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  // tear down a drag-in-progress if the pane unmounts mid-gesture
  useEffect(() => () => onUp(), [onUp]);

  return { onCardDown };
}
