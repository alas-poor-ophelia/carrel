/* The pinned-rail drag-to-reorder subsystem, extracted from PaneBoard.

   A FLIP layout effect plays a slide on any rail card that moved (except the one
   being dragged), and pointer handlers carry the dragged ghost and rewrite the
   persisted pin order live. The window pointer listeners are torn down on
   pointerup/cancel AND on unmount (a drag in progress when the pane closes would
   otherwise leak them). */
import { useCallback, useEffect, useLayoutEffect, useRef } from "preact/hooks";
import type { CarrelStore } from "../../../state/store";
import type { Nook } from "../../../types/data";

interface RailDragOptions {
  store: CarrelStore;
  nookRef: { current: Nook | null };
  pinOrder: string[];
  dragId: string | null;
  setDragId: (id: string | null) => void;
}

export function useRailDrag(opts: RailDragOptions): {
  regRail: (id: string) => (el: HTMLElement | null) => void;
  onPinDown: (e: PointerEvent, id: string) => void;
} {
  const { store, nookRef, pinOrder, dragId, setDragId } = opts;
  const railCells = useRef(new Map<string, HTMLElement>());
  const railPrev = useRef(new Map<string, DOMRect>());
  const dragRef = useRef<{ id: string; el: HTMLElement; dx: number; dy: number; w: number; h: number } | null>(null);
  const pinOrderRef = useRef(pinOrder);
  pinOrderRef.current = pinOrder;

  const regRail = (id: string) => (el: HTMLElement | null): void => {
    if (el) railCells.current.set(id, el);
    else railCells.current.delete(id);
  };

  // rail FLIP: any rail card that moved (not the dragged one) inverts then plays
  useLayoutEffect(() => {
    const map = railCells.current;
    map.forEach((el, id) => {
      const nr = el.getBoundingClientRect();
      const old = railPrev.current.get(id);
      if (old && id !== dragId) {
        const dx = old.left - nr.left;
        const dy = old.top - nr.top;
        if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
          el.setCssStyles({ transition: "none" });
          el.style.transform = `translate(${dx}px, ${dy}px)`;
          window.requestAnimationFrame(() => {
            el.setCssStyles({ transition: "transform .24s var(--ease-back)", transform: "" });
          });
        }
      }
    });
    const m = new Map<string, DOMRect>();
    map.forEach((el, id) => m.set(id, el.getBoundingClientRect()));
    railPrev.current = m;
  });

  const onPinMove = useCallback((e: PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    Object.assign(d.el.style, {
      position: "fixed",
      left: e.clientX - d.dx + "px",
      top: e.clientY - d.dy + "px",
      width: d.w + "px",
      zIndex: "60",
      pointerEvents: "none",
    });
    let nearest: { id: string; cx: number } | null = null;
    let nd = Infinity;
    railCells.current.forEach((el, id) => {
      if (id === d.id) return;
      const rr = el.getBoundingClientRect();
      const cx = rr.left + rr.width / 2;
      const cy = rr.top + rr.height / 2;
      const dist = (cx - e.clientX) ** 2 + (cy - e.clientY) ** 2;
      if (dist < nd) {
        nd = dist;
        nearest = { id, cx };
      }
    });
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions -- nearest is assigned inside forEach; TS narrows it back to null but it can be set at runtime
    if (nearest) {
      const near: { id: string; cx: number } = nearest;
      const order = pinOrderRef.current.filter((x) => x !== d.id);
      const ni = order.indexOf(near.id);
      order.splice(e.clientX > near.cx ? ni + 1 : ni, 0, d.id);
      const cur = nookRef.current;
      if (cur && order.join() !== pinOrderRef.current.join()) store.setNookPins(cur.id, cur.pins, order);
    }
  }, [store, nookRef]);

  const onPinUp = useCallback(() => {
    const d = dragRef.current;
    if (d) {
      Object.assign(d.el.style, { position: "", left: "", top: "", width: "", zIndex: "", pointerEvents: "", transform: "", transition: "" });
    }
    dragRef.current = null;
    setDragId(null);
    window.removeEventListener("pointermove", onPinMove);
    window.removeEventListener("pointerup", onPinUp);
    window.removeEventListener("pointercancel", onPinUp);
  }, [onPinMove, setDragId]);

  const onPinDown = (e: PointerEvent, id: string): void => {
    if (e.button !== 0) return;
    e.preventDefault();
    // keep this on the grip: don't let it bubble to the rail's drag-to-scroll.
    e.stopPropagation();
    const grip = e.currentTarget as HTMLElement;
    const el = grip.closest<HTMLElement>(".cr-railcard");
    if (!el) return;
    const rect = el.getBoundingClientRect();
    dragRef.current = { id, el, dx: e.clientX - rect.left, dy: e.clientY - rect.top, w: rect.width, h: rect.height };
    setDragId(id);
    window.addEventListener("pointermove", onPinMove);
    window.addEventListener("pointerup", onPinUp);
    // a cancelled gesture (Alt+Tab, OS dialog, palm rejection) never fires
    // pointerup; without this the ghost card stays stuck until reload.
    window.addEventListener("pointercancel", onPinUp);
  };

  // tear down a drag-in-progress if the pane unmounts mid-gesture, otherwise the
  // window pointer listeners (and the fixed-position ghost) leak.
  useEffect(() => () => onPinUp(), [onPinUp]);

  return { regRail, onPinDown };
}
