import type { RefObject } from "preact";
import { useEffect, useRef } from "preact/hooks";

/**
 * Make a horizontally-overflowing strip (the pinned rail, the filter chips)
 * scroll by mouse wheel and by click/touch drag. Vertical wheel deltas are
 * mapped to horizontal scroll; a drag past a small threshold pans the strip and
 * its trailing click is swallowed so cards/chips aren't accidentally activated.
 * Pair with `touch-action: pan-y` so vertical page scroll still passes through.
 */
export function useDragScroll<T extends HTMLElement = HTMLDivElement>(
  deps: unknown[] = []
): RefObject<T> {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const overflows = () => el.scrollWidth > el.clientWidth + 1;

    const onWheel = (e: WheelEvent) => {
      if (!overflows()) return;
      const d = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      if (!d) return;
      el.scrollLeft += d;
      e.preventDefault();
    };

    let down = false;
    let moved = false;
    let startX = 0;
    let startLeft = 0;
    let pid = -1;

    const onDown = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (!overflows()) return;
      down = true;
      moved = false;
      startX = e.clientX;
      startLeft = el.scrollLeft;
      pid = e.pointerId;
    };
    const onMove = (e: PointerEvent) => {
      if (!down) return;
      const dx = e.clientX - startX;
      if (!moved && Math.abs(dx) < 5) return;
      if (!moved) {
        moved = true;
        el.classList.add("is-dragging");
        try {
          el.setPointerCapture(pid);
        } catch {
          /* capture is best-effort */
        }
      }
      el.scrollLeft = startLeft - dx;
      e.preventDefault();
    };
    const onUp = () => {
      if (!down) return;
      down = false;
      if (!moved) return;
      el.classList.remove("is-dragging");
      try {
        el.releasePointerCapture(pid);
      } catch {
        /* nothing captured */
      }
      // swallow the click synthesized after a drag so a pan doesn't open a card
      const swallow = (ev: Event) => {
        ev.stopPropagation();
        ev.preventDefault();
        el.removeEventListener("click", swallow, true);
      };
      el.addEventListener("click", swallow, true);
      setTimeout(() => el.removeEventListener("click", swallow, true), 60);
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return ref;
}
