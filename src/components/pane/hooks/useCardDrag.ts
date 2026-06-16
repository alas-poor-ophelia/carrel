/* On-board card drag-to-reorder (Phase 2), a masonry-aware sibling of
   useRailDrag. Dragging a card's grip lifts it to a fixed-position ghost and
   rewrites the nook's custom card order LIVE within its own section; the
   masonry re-packs the remaining cards around the gap (it skips the dragged
   cell — see useMasonryPack's dragId), and a doc-order change in the pack key
   makes the others slide. Cross-section moves are intentionally not supported:
   the nearest-card search is restricted to the dragged card's own section.

   Window listeners are torn down on pointerup/cancel and on unmount, so a drag
   in progress when the pane closes can't leak them. */
import { useCallback, useEffect, useRef } from "preact/hooks";
import type { CarrelStore } from "../../../state/store";
import type { Nook } from "../../../types/data";
import type { Section } from "./useMasonryPack";

interface CardDragOptions {
  store: CarrelStore;
  nookRef: { current: Nook | null };
  sectionsRef: { current: Section[] };
  cells: { current: Map<string, HTMLElement> };
  setDragId: (id: string | null) => void;
}

export function useCardDrag(opts: CardDragOptions): {
  onCardDown: (e: PointerEvent, id: string) => void;
} {
  const { store, nookRef, sectionsRef, cells, setDragId } = opts;
  const dragRef = useRef<{
    id: string;
    el: HTMLElement;
    dx: number;
    dy: number;
    w: number;
    sectionKey: string;
    order: string[];
  } | null>(null);

  const onMove = useCallback(
    (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      // float the ghost under the cursor — zero the masonry transform so the
      // fixed left/top isn't offset by the card's packed position.
      Object.assign(d.el.style, {
        position: "fixed",
        left: e.clientX - d.dx + "px",
        top: e.clientY - d.dy + "px",
        width: d.w + "px",
        zIndex: "60",
        pointerEvents: "none",
        transform: "none",
        transition: "none",
      });
      // nearest OTHER card within the SAME section (no cross-section moves)
      let near: { id: string; cx: number; cy: number } | null = null;
      let nd = Infinity;
      for (const path of d.order) {
        if (path === d.id) continue;
        const el = cells.current.get(path);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const dist = (cx - e.clientX) ** 2 + (cy - e.clientY) ** 2;
        if (dist < nd) {
          nd = dist;
          near = { id: path, cx, cy };
        }
      }
      if (!near) return;
      const target = near;
      const order = d.order.filter((p) => p !== d.id);
      const ni = order.indexOf(target.id);
      // insert after the target when the cursor is past its center
      const after =
        e.clientY > target.cy + 4 ||
        (Math.abs(e.clientY - target.cy) <= 4 && e.clientX > target.cx);
      order.splice(after ? ni + 1 : ni, 0, d.id);
      if (order.join() !== d.order.join()) {
        d.order = order;
        const cur = nookRef.current;
        if (cur) store.setNookCardOrder(cur.id, d.sectionKey, order);
      }
    },
    [store, nookRef, cells]
  );

  const onUp = useCallback(() => {
    const d = dragRef.current;
    if (d) {
      Object.assign(d.el.style, {
        position: "",
        left: "",
        top: "",
        width: "",
        zIndex: "",
        pointerEvents: "",
        transform: "",
        transition: "",
      });
    }
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
    e.preventDefault();
    e.stopPropagation();
    const el = cells.current.get(id);
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const order = sec.docs.map((x) => x.path);
    dragRef.current = {
      id,
      el,
      dx: e.clientX - rect.left,
      dy: e.clientY - rect.top,
      w: rect.width,
      sectionKey: sec.key,
      order,
    };
    // Pin the current visual order as the custom baseline and switch to custom,
    // so the arrangement doesn't jump as the drag begins.
    store.setNookCardOrder(cur.id, sec.key, order);
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
