/* The kanban layout engine — a sibling of useMasonryPack for the swimlane
   render path. Cards live in a single shared, absolutely-positioned layer and
   are placed by `transform: translate(colX, y)` exactly like the masonry pack,
   which is what lets an OPENED card span sideways across column boundaries.

   Unlike masonry (which fits 2–5 columns to the container width), kanban columns
   are FIXED width (COL_W) and the strip scrolls horizontally; the column count is
   the number of visible categories, not a function of width. Each card has a
   HOME column (its category). Opening a card widens it to span N columns and
   pushes the overlapped neighbour columns' lower cards down — the "swimlanes flow
   out of the way" behaviour — then collapse restores them.

   Heights are measured at the card's target span width BEFORE placement (same
   trick as masonry) so a heavy open card never under-reserves. */
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import type { RuleDoc } from "../../../rules/model";
import { RENDERED_EVENT } from "../blocks";

/** DEFAULT kanban column width in px — the fallback when the `--kbn-col` CSS
 *  variable (settable via Style Settings) can't be read. The live width is read
 *  from `--kbn-col` at pack time so the column width is user-adjustable; headers
 *  read the same var so they line up with the card layer. */
export const KANBAN_COL_W = 240;

const DEFAULT_GAP = 14;
const SPRING = "cubic-bezier(.33,1.32,.5,1)";

/** One swimlane: a category key plus the docs that belong to it, already ordered. */
export interface KanbanColumnDocs {
  key: string;
  docs: RuleDoc[];
}

interface KanbanRefs {
  appRef: { current: HTMLDivElement | null };
  scrollRef: { current: HTMLDivElement | null };
  /** The relative-positioned card layer; its height is set from the tallest column. */
  layerRef: { current: HTMLDivElement | null };
  /** The strip wrapping headers + layer; its width is set to the full column run. */
  stripRef: { current: HTMLDivElement | null };
  cells: { current: Map<string, HTMLElement> };
  lastToggled: { current: string | null };
}

interface Placed {
  cell: HTMLElement;
  path: string;
  homeCol: number;
  startCol: number;
  span: number;
  h: number;
  yTop: number;
}

/** Drives the kanban pack. Re-packs after every render (async prose growth, open
 *  /close, reorder); only an open/close/reorder animates the slide. Returns the
 *  total height so the caller can keep the scroll region honest if it needs to. */
export function useKanbanPack(
  refs: KanbanRefs,
  open: Set<string>,
  query: string,
  spanOf: Map<string, number>,
  columns: KanbanColumnDocs[],
): void {
  const { appRef, scrollRef, layerRef, stripRef, cells, lastToggled } = refs;
  const renderedCols = useRef<KanbanColumnDocs[]>(columns);
  renderedCols.current = columns;
  const lastKey = useRef("");
  const lastQuery = useRef(query);
  const firstLayout = useRef(true);
  const [, force] = useState(0);

  useLayoutEffect(() => {
    const app = appRef.current;
    const layer = layerRef.current;
    const strip = stripRef.current;
    if (!app || !layer || !strip) return;
    const cs = getComputedStyle(app);
    const gap = parseFloat(cs.getPropertyValue("--gap")) || DEFAULT_GAP;
    const colW = parseFloat(cs.getPropertyValue("--kbn-col")) || KANBAN_COL_W;
    const cols = renderedCols.current;
    const nCols = cols.length;
    const stride = colW + gap;

    // animation key: open-set + column count + per-column doc order. A change with
    // an unchanged query (kanban never renders during search) animates the slide.
    const orderSig = cols.map((c) => c.key + ":" + c.docs.map((d) => d.path).join(",")).join("|");
    const key = [...open].sort().join(",") + "|" + nCols + "|" + orderSig;
    const animate =
      !firstLayout.current &&
      lastKey.current !== key &&
      lastQuery.current === query &&
      !app.classList.contains("anim-off");

    strip.style.width = nCols > 0 ? nCols * colW + (nCols - 1) * gap + "px" : "0px";

    // Pass A — span / start column / width per card; measure height at that width.
    const placed: Placed[] = [];
    for (let i = 0; i < nCols; i++) {
      for (const d of cols[i].docs) {
        const cell = cells.current.get(d.path);
        if (!cell) continue;
        const isOpen = open.has(d.path);
        const span = isOpen ? Math.min(Math.max(1, spanOf.get(d.path) ?? 1), nCols) : 1;
        // extend right by default; at the right edge, extend leftward instead
        let startCol = i;
        if (startCol + span > nCols) startCol = nCols - span;
        if (startCol < 0) startCol = 0;
        cell.setCssStyles({ transition: "none" });
        cell.style.width = span * colW + (span - 1) * gap + "px";
        cell.dataset.span = String(span);
        placed.push({ cell, path: d.path, homeCol: i, startCol, span, h: cell.offsetHeight, yTop: 0 });
      }
    }

    // Pass B — base-stack each card top-down within its HOME column.
    const yCursor = new Array<number>(nCols).fill(0);
    for (const p of placed) {
      p.yTop = yCursor[p.homeCol];
      yCursor[p.homeCol] = p.yTop + p.h + gap;
    }

    // Pass C — sideways displacement for open (spanning) cards. Process top-to-
    // bottom so accumulated pushes stay stable. An open card reserves the band
    // [yTop, yTop+h] across the neighbour columns it overlaps; in each neighbour
    // we find the FIRST card whose BOTTOM crosses the open card's top (so a card
    // that merely straddles the top still counts — that was the overlap bug) and
    // shift it plus everything below it clear of the open card's bottom.
    const opens = placed
      .filter((p) => p.span > 1)
      .sort((a, b) => a.yTop - b.yTop || a.startCol - b.startCol);
    for (const oc of opens) {
      const ocBottom = oc.yTop + oc.h;
      for (let c = oc.startCol; c < oc.startCol + oc.span; c++) {
        if (c === oc.homeCol) continue;
        const colCards = placed
          .filter((p) => p.homeCol === c && p !== oc)
          .sort((a, b) => a.yTop - b.yTop);
        const anchor = colCards.find((p) => p.yTop + p.h > oc.yTop - 0.5);
        if (!anchor) continue;
        // snapshot the anchor's top BEFORE shifting — the anchor is itself one of
        // the cards we shift, so reading anchor.yTop inside the loop would move the
        // threshold out from under the cards below it (they'd be skipped).
        const anchorTop = anchor.yTop;
        const delta = ocBottom + gap - anchorTop;
        if (delta <= 0) continue;
        for (const p of colCards) {
          if (p.yTop >= anchorTop - 0.5) p.yTop += delta;
        }
      }
    }

    // Apply transforms (animate the slide on open/close/reorder, like masonry).
    const tg = placed.find((p) => p.path === lastToggled.current);
    const ty = tg ? tg.yTop : 0;
    let maxBottom = 0;
    for (const p of placed) {
      const x = p.startCol * stride;
      if (animate) {
        const delay = Math.min(220, Math.abs(p.yTop - ty) * 0.05);
        p.cell.style.transition = `transform .6s ${SPRING} ${delay}ms`;
      } else {
        p.cell.setCssStyles({ transition: "none" });
      }
      p.cell.style.transform = `translate(${x}px, ${p.yTop}px)`;
      maxBottom = Math.max(maxBottom, p.yTop + p.h);
    }
    layer.style.height = maxBottom + "px";

    lastKey.current = key;
    lastQuery.current = query;
    firstLayout.current = false;
  });

  // re-pack when async prose finishes rendering, on font load, and on resize.
  useEffect(() => {
    const f = (): void => force((x) => x + 1);
    let alive = true;
    const onRendered = (): void => f();
    activeDocument.addEventListener(RENDERED_EVENT, onRendered);
    void activeDocument.fonts?.ready.then(() => alive && f());
    window.addEventListener("resize", f);
    return () => {
      alive = false;
      activeDocument.removeEventListener(RENDERED_EVENT, onRendered);
      window.removeEventListener("resize", f);
    };
  }, []);

  // a horizontal-scroll resize can change how much is visible but not card
  // heights (fixed col width), so only a force re-pack is needed for safety.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = window.requestAnimationFrame(() => force((x) => x + 1));
    });
    ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [scrollRef]);
}
