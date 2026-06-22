import type { RefObject } from "preact";
import { useEffect, useRef } from "preact/hooks";

/**
 * Make a horizontally-overflowing strip (the pinned rail, the filter chips)
 * scroll by mouse wheel and by mouse/pen drag, with a momentum fling on release.
 * Vertical wheel deltas are mapped to horizontal scroll; a drag past a small
 * threshold pans the strip and its trailing click is swallowed so cards/chips
 * aren't accidentally activated.
 *
 * Touch is left ENTIRELY to the browser: pair with `touch-action: pan-x` so the
 * platform's native horizontal momentum scrolling (and proper tap-vs-scroll
 * disambiguation) runs on iPad/touchscreens, while a vertical gesture still
 * falls through to page scroll. Hijacking touch in JS killed that momentum and
 * made drags halt the instant a finger lifted.
 *
 * `scrollTargetRef` (optional) decouples the LISTENER element from the element
 * actually scrolled: the kanban attaches the gesture to its sticky header row
 * but pans the both-axis scroll viewport. When omitted, the element scrolls
 * itself (the rail / filter-chip behaviour).
 */
export function useDragScroll<T extends HTMLElement = HTMLDivElement>(
  deps: unknown[] = [],
  scrollTargetRef?: RefObject<HTMLElement>
): RefObject<T> {
  const ref = useRef<T>(null);
  useEffect(() => {
    const listenEl = ref.current;
    if (!listenEl) return;
    const el = scrollTargetRef?.current ?? listenEl;
    const overflows = (): boolean => el.scrollWidth > el.clientWidth + 1;
    const maxLeft = (): number => el.scrollWidth - el.clientWidth;

    // ---- wheel: glide toward a target instead of snapping per notch ----
    let wheelTarget = 0;
    let wheelRaf = 0;
    const stopWheel = (): void => {
      if (wheelRaf) {
        cancelAnimationFrame(wheelRaf);
        wheelRaf = 0;
      }
    };
    const easeWheel = (): void => {
      const diff = wheelTarget - el.scrollLeft;
      if (Math.abs(diff) < 0.5) {
        el.scrollLeft = wheelTarget;
        wheelRaf = 0;
        return;
      }
      el.scrollLeft += diff * 0.22; // glide ~22% of the gap each frame
      wheelRaf = window.requestAnimationFrame(easeWheel);
    };
    const onWheel = (e: WheelEvent): void => {
      if (!overflows()) return;
      // horizontal-dominant gestures (trackpad swipe, horizontal wheel) scroll
      // natively — smoother than anything we'd reproduce in JS
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      if (!e.deltaY) return;
      // a vertical wheel/swipe over the strip pans it horizontally, eased
      if (!wheelRaf) wheelTarget = el.scrollLeft; // re-sync on a fresh gesture
      wheelTarget = Math.max(0, Math.min(wheelTarget + e.deltaY, maxLeft()));
      e.preventDefault();
      if (!wheelRaf) wheelRaf = window.requestAnimationFrame(easeWheel);
    };

    let down = false;
    let moved = false;
    let startX = 0;
    let startLeft = 0;
    let pid = -1;
    // velocity tracking (px/ms of pointer travel) for the release fling
    let lastX = 0;
    let lastT = 0;
    let vx = 0;
    let raf = 0;

    const stopFling = (): void => {
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    };

    const onDown = (e: PointerEvent): void => {
      // touch scrolls natively (touch-action: pan-x) — don't intercept it
      if (e.pointerType === "touch") return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (!overflows()) return;
      stopFling();
      stopWheel();
      down = true;
      moved = false;
      startX = e.clientX;
      startLeft = el.scrollLeft;
      pid = e.pointerId;
      lastX = e.clientX;
      lastT = e.timeStamp;
      vx = 0;
    };
    const onMove = (e: PointerEvent): void => {
      if (!down) return;
      const dx = e.clientX - startX;
      if (!moved && Math.abs(dx) < 5) return;
      if (!moved) {
        moved = true;
        listenEl.classList.add("is-dragging");
        try {
          listenEl.setPointerCapture(pid);
        } catch {
          /* capture is best-effort */
        }
      }
      const dt = e.timeStamp - lastT;
      if (dt > 0) {
        // exponential smoothing so a brief pause before release damps the fling
        vx = vx * 0.4 + ((e.clientX - lastX) / dt) * 0.6;
        lastX = e.clientX;
        lastT = e.timeStamp;
      }
      el.scrollLeft = startLeft - dx;
      e.preventDefault();
    };
    const onUp = (): void => {
      if (!down) return;
      down = false;
      if (!moved) return;
      listenEl.classList.remove("is-dragging");
      try {
        listenEl.releasePointerCapture(pid);
      } catch {
        /* nothing captured */
      }
      // swallow the click synthesized after a drag so a pan doesn't open a card
      const swallow = (ev: Event): void => {
        ev.stopPropagation();
        ev.preventDefault();
        listenEl.removeEventListener("click", swallow, true);
      };
      listenEl.addEventListener("click", swallow, true);
      window.setTimeout(() => listenEl.removeEventListener("click", swallow, true), 60);

      // carry the release velocity and decelerate (scrollLeft moves opposite the pointer)
      let vel = -vx;
      if (Math.abs(vel) < 0.05) return;
      let prevT = 0;
      const step = (t: number): void => {
        if (!prevT) {
          prevT = t;
          raf = window.requestAnimationFrame(step);
          return;
        }
        const dt = t - prevT;
        prevT = t;
        el.scrollLeft += vel * dt;
        vel *= Math.pow(0.94, dt / 16.67); // ~frame-rate-independent friction
        raf = Math.abs(vel) > 0.02 ? window.requestAnimationFrame(step) : 0;
      };
      raf = window.requestAnimationFrame(step);
    };

    listenEl.addEventListener("wheel", onWheel, { passive: false });
    listenEl.addEventListener("pointerdown", onDown);
    listenEl.addEventListener("pointermove", onMove);
    listenEl.addEventListener("pointerup", onUp);
    listenEl.addEventListener("pointercancel", onUp);
    return () => {
      stopFling();
      stopWheel();
      listenEl.removeEventListener("wheel", onWheel);
      listenEl.removeEventListener("pointerdown", onDown);
      listenEl.removeEventListener("pointermove", onMove);
      listenEl.removeEventListener("pointerup", onUp);
      listenEl.removeEventListener("pointercancel", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps is the caller-supplied stable dependency list; the listener set is rebuilt only when it changes
  }, deps);
  return ref;
}
