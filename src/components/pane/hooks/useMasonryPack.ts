/* The column-balancing masonry engine, extracted from PaneBoard.

   Every card is absolutely positioned via transform and placed into the
   shortest-fit column window. Opened cards span 1–N columns by content weight.
   Because each card's exact height is measured at its target span width BEFORE
   placement, a heavy card can never under-reserve and bleed under the next row.

   The hook owns the column count (from a ResizeObserver on the scroll
   container), the pack/reflow layout effect, and the re-pack triggers (async
   prose growth, font load, window resize). The genuinely shared refs (appRef,
   scrollRef, cells, lastToggled) are owned by the board and passed in, since the
   keyboard navigator reads them too. */
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import type { RuleDoc } from "../../../rules/model";
import { RENDERED_EVENT } from "../blocks";

export interface Section {
  label: string;
  docs: RuleDoc[];
  results: boolean;
  /** Section key for cardOrder (set for grouped sections; absent for search). */
  key?: string;
}

const DEFAULT_GAP = 14;
const COL_STEP = 330; // ~one column per 330px of width
const SPRING = "cubic-bezier(.33,1.32,.5,1)";

interface MasonryRefs {
  appRef: { current: HTMLDivElement | null };
  scrollRef: { current: HTMLDivElement | null };
  cells: { current: Map<string, HTMLElement> };
  lastToggled: { current: string | null };
}

/** Drives the column-balancing pack. Returns a section ref-registrar; the board
 *  attaches it to each masonry container. Re-packs after every render (so async
 *  growth and open/close both settle); only an open/close animates the slide. */
export function useMasonryPack(
  refs: MasonryRefs,
  open: Set<string>,
  query: string,
  spanOf: Map<string, number>,
  sections: Section[],
): { regSection: (name: string) => (el: HTMLElement | null) => void } {
  const { appRef, scrollRef, cells, lastToggled } = refs;
  const sectionEls = useRef(new Map<string, HTMLElement>());
  const renderedSections = useRef<Section[]>(sections);
  renderedSections.current = sections;
  const lastKey = useRef("");
  const lastQuery = useRef(query);
  const firstLayout = useRef(true);
  const [autoCols, setAutoCols] = useState(3);
  const [, force] = useState(0);

  const regSection = (name: string) => (el: HTMLElement | null): void => {
    if (el) sectionEls.current.set(name, el);
    else sectionEls.current.delete(name);
  };

  // auto column count from the scroll container width. Crucially, re-pack on
  // EVERY container resize (force), not only when the column count changes — in
  // Obsidian a leaf resizes without firing a window 'resize', and a re-pack at
  // the correct width is what corrects an early measurement taken too narrow.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const calc = (): void => {
      const w = el.clientWidth - 2 * 36;
      setAutoCols(Math.max(2, Math.min(5, Math.floor(w / COL_STEP))));
      force((x) => x + 1);
    };
    calc();
    // Defer the re-pack out of the observer's delivery cycle so mutating cell
    // sizes in the layout effect can't retrigger the observer in the same frame
    // ("ResizeObserver loop completed with undelivered notifications").
    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(calc);
    });
    ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [scrollRef]);

  // The column-balancing pack + reflow. Runs after every render so async prose
  // growth (cr-rendered → force) and open/close both re-pack; only an open/close
  // (key change with unchanged query) animates the slide.
  useLayoutEffect(() => {
    const app = appRef.current;
    if (!app) return;
    const gap = parseFloat(getComputedStyle(app).getPropertyValue("--gap")) || DEFAULT_GAP;
    const cols = autoCols;
    // Fold the doc order into the key so a reorder (drag, sort change) animates
    // the slide, not just open/close. During a card drag the dragged cell stays
    // in flow as a highlighted placeholder slot; a floating clone is the ghost.
    const orderSig = renderedSections.current
      .map((s) => s.docs.map((d) => d.path).join(","))
      .join("|");
    const key = [...open].sort().join(",") + "|" + cols + "|" + orderSig;
    const animate =
      !firstLayout.current &&
      lastKey.current !== key &&
      lastQuery.current === query &&
      !app.classList.contains("anim-off");

    const positions: { cell: HTMLElement; id: string; x: number; y: number }[] = [];
    for (const sec of renderedSections.current) {
      const container = sectionEls.current.get(sec.label);
      if (!container) continue;
      const cw = container.clientWidth;
      if (cw <= 0) continue;
      const colW = (cw - (cols - 1) * gap) / cols;
      const heights = new Array<number>(cols).fill(0);
      for (const d of sec.docs) {
        const cell = cells.current.get(d.path);
        if (!cell) continue;
        const span = Math.min(open.has(d.path) ? spanOf.get(d.path) ?? 1 : 1, cols);
        cell.setCssStyles({ transition: "none" });
        cell.style.width = span * colW + (span - 1) * gap + "px";
        cell.dataset.span = String(span);
        const h = cell.offsetHeight;
        let best = 0;
        let bestY = Infinity;
        for (let c = 0; c <= cols - span; c++) {
          let y = 0;
          for (let k = 0; k < span; k++) y = Math.max(y, heights[c + k]);
          if (y < bestY - 0.5) {
            bestY = y;
            best = c;
          }
        }
        positions.push({ cell, id: d.path, x: best * (colW + gap), y: bestY });
        for (let k = 0; k < span; k++) heights[best + k] = bestY + h + gap;
      }
      container.style.height = Math.max(0, Math.max(0, ...heights) - gap) + "px";
    }

    const tg = positions.find((p) => p.id === lastToggled.current);
    const ty = tg ? tg.y : 0;
    for (const { cell, x, y } of positions) {
      if (animate) {
        const delay = Math.min(220, Math.abs(y - ty) * 0.05);
        cell.style.transition = `transform .6s ${SPRING} ${delay}ms`;
      } else {
        cell.setCssStyles({ transition: "none" });
      }
      cell.style.transform = `translate(${x}px, ${y}px)`;
    }

    lastKey.current = key;
    lastQuery.current = query;
    firstLayout.current = false;
  });

  // re-pack when async prose finishes rendering, on font load, and on resize
  useEffect(() => {
    const f = (): void => force((x) => x + 1);
    let alive = true;
    const onRendered = (): void => f();
    document.addEventListener(RENDERED_EVENT, onRendered);
    void document.fonts?.ready.then(() => alive && f());
    window.addEventListener("resize", f);
    return () => {
      alive = false;
      document.removeEventListener(RENDERED_EVENT, onRendered);
      window.removeEventListener("resize", f);
    };
  }, []);

  return { regSection };
}
