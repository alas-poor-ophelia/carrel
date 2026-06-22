/* Cross-column card drag for the kanban layout — a sibling of useCardDrag that
   is NOT restricted to one section. Dragging a card's grip clones it into a
   fixed-position ghost; the live drop target is resolved by COLUMN GEOMETRY
   (cursor x → column index, cursor y → insertion row), which works even over an
   empty column. The arrangement is rewritten live so the shared card layer slides
   the placeholder to its landing slot — that's the drop preview.

   When a card moves to a DIFFERENT column its category override is set so it
   appears under the new swimlane immediately (optimistic move); on drop the new
   category is written to the note's frontmatter via store.setNoteCategory. The
   override is held by the board until the reindex confirms doc.category, then
   dropped — so the card never flickers back during the write+reindex window. */
import { Notice } from "obsidian";
import { useCallback, useEffect, useRef } from "preact/hooks";
import type { CarrelStore } from "../../../state/store";
import type { Nook } from "../../../types/data";
import { KANBAN_COL_W } from "./useKanbanPack";

/** One column as the drag hook needs it: its category key + current ordered paths. */
export interface KanbanDragColumn {
  key: string;
  paths: string[];
}

interface KanbanDragOptions {
  store: CarrelStore;
  nookRef: { current: Nook | null };
  /** Live snapshot of the rendered columns (keys + ordered paths). */
  columnsRef: { current: KanbanDragColumn[] };
  cells: { current: Map<string, HTMLElement> };
  appRef: { current: HTMLElement | null };
  layerRef: { current: HTMLElement | null };
  setDragId: (id: string | null) => void;
  /** Optimistic category override for the dragged card (null clears it). */
  setOverride: (path: string, category: string | null) => void;
  /** False for Bases-backed nooks — cross-column moves would write a category
   *  the Base query may filter on, dropping the card from view. Within-column
   *  reorder stays allowed; crossing a column boundary is blocked + warned. */
  canMoveCategory: boolean;
}

export function useKanbanDrag(opts: KanbanDragOptions): {
  onCardDown: (e: PointerEvent, id: string) => void;
} {
  const { store, nookRef, columnsRef, cells, appRef, layerRef, setDragId, setOverride, canMoveCategory } = opts;
  const dragRef = useRef<{
    id: string;
    ghost: HTMLElement;
    dx: number;
    dy: number;
    stride: number;
    colKeys: string[];
    origCol: string;
    curCol: string;
    work: Map<string, string[]>;
    warned: boolean;
    cbx: number;
    cby: number;
  } | null>(null);

  const onMove = useCallback(
    (e: PointerEvent) => {
      const d = dragRef.current;
      const layer = layerRef.current;
      if (!d || !layer) return;
      d.ghost.style.left = e.clientX - d.dx - d.cbx + "px";
      d.ghost.style.top = e.clientY - d.dy - d.cby + "px";

      const rect = layer.getBoundingClientRect();
      const nCols = d.colKeys.length;
      if (nCols === 0) return;
      let ti = Math.floor((e.clientX - rect.left) / d.stride);
      ti = Math.max(0, Math.min(nCols - 1, ti));
      let targetKey = d.colKeys[ti];

      // Bases nook: keep the card in its own column (a category write could drop
      // it from the Base query). Warn once, then treat every hit as the origin.
      if (!canMoveCategory && targetKey !== d.origCol) {
        if (!d.warned) {
          d.warned = true;
          new Notice("Carrel: cards here can be reordered but not moved between category columns.");
        }
        targetKey = d.origCol;
      }

      // insertion index within the target column, by vertical midpoint
      const targetPaths = (d.work.get(targetKey) ?? []).filter((p) => p !== d.id);
      let insertAt = targetPaths.length;
      for (let k = 0; k < targetPaths.length; k++) {
        const c = cells.current.get(targetPaths[k]);
        if (!c) continue;
        const r = c.getBoundingClientRect();
        if (e.clientY < r.top + r.height / 2) {
          insertAt = k;
          break;
        }
      }

      const cur = nookRef.current;
      if (!cur) return;
      if (targetKey === d.curCol) {
        const next = (d.work.get(targetKey) ?? []).filter((p) => p !== d.id);
        next.splice(insertAt, 0, d.id);
        const prev = d.work.get(targetKey) ?? [];
        if (next.join() !== prev.join()) {
          d.work.set(targetKey, next);
          store.setNookCardOrder(cur.id, targetKey, next);
        }
      } else {
        const fromArr = (d.work.get(d.curCol) ?? []).filter((p) => p !== d.id);
        const toArr = targetPaths.slice();
        toArr.splice(insertAt, 0, d.id);
        d.work.set(d.curCol, fromArr);
        d.work.set(targetKey, toArr);
        store.setNookCardOrder(cur.id, d.curCol, fromArr);
        store.setNookCardOrder(cur.id, targetKey, toArr);
        d.curCol = targetKey;
        // optimistic: show the card under the new swimlane right away
        setOverride(d.id, targetKey === d.origCol ? null : targetKey);
      }
    },
    [store, nookRef, cells, layerRef, setOverride, canMoveCategory]
  );

  const onUp = useCallback(() => {
    const d = dragRef.current;
    if (d) {
      d.ghost.remove();
      // persist the category change on drop; the board holds the override until
      // the reindex confirms doc.category, so no flicker back to the old column.
      if (d.curCol !== d.origCol) {
        void store.setNoteCategory(d.id, d.curCol);
      } else {
        setOverride(d.id, null);
      }
    }
    dragRef.current = null;
    setDragId(null);
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
  }, [onMove, setDragId, store, setOverride]);

  const onCardDown = (e: PointerEvent, id: string): void => {
    if (e.button !== 0) return;
    const cur = nookRef.current;
    const host = appRef.current;
    const layer = layerRef.current;
    const el = cells.current.get(id);
    if (!cur || !host || !layer || !el) return;
    const colsNow = columnsRef.current;
    const origCol = colsNow.find((c) => c.paths.includes(id))?.key;
    if (origCol == null) return;
    e.preventDefault();
    e.stopPropagation();

    const hcs = getComputedStyle(host);
    const gap = parseFloat(hcs.getPropertyValue("--gap")) || 14;
    const colW = parseFloat(hcs.getPropertyValue("--kbn-col")) || KANBAN_COL_W;
    const rect = el.getBoundingClientRect();
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
    // Correct for a position:fixed containing block: Obsidian sets `contain:strict`
    // on the active workspace leaf, which makes a fixed child resolve against the
    // leaf, not the viewport. Measure the rendered origin and offset all coords by it.
    const g0 = ghost.getBoundingClientRect();
    const cbx = g0.left - rect.left;
    const cby = g0.top - rect.top;
    ghost.style.left = rect.left - cbx + "px";
    ghost.style.top = rect.top - cby + "px";

    const work = new Map<string, string[]>();
    for (const c of colsNow) work.set(c.key, c.paths.slice());
    dragRef.current = {
      id,
      ghost,
      dx: e.clientX - rect.left,
      dy: e.clientY - rect.top,
      stride: colW + gap,
      colKeys: colsNow.map((c) => c.key),
      origCol,
      curCol: origCol,
      work,
      warned: false,
      cbx,
      cby,
    };
    // pin the origin column's current order as the custom baseline and switch to
    // custom sort so the arrangement doesn't jump as the drag begins
    store.setNookCardOrder(cur.id, origCol, work.get(origCol) ?? []);
    if (cur.tweaks.sort !== "custom") store.setNookSort(cur.id, "custom");
    setDragId(id);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  useEffect(() => () => onUp(), [onUp]);

  return { onCardDown };
}
