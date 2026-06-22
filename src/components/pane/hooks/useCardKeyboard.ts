/* Spatial keyboard navigation for the card board, extracted from PaneBoard.

   Arrow keys move focus to the nearest card in that direction (by center
   distance, weighting the cross-axis), Enter/Space toggles, Escape collapses or
   clears. The keydown listener is scoped to the board root (not window) so the
   pane only steals arrow/enter keys while it actually has focus — the root is
   focusable (tabIndex=-1) and receives focus when the user clicks into it. */
import { useCallback, useEffect, useRef } from "preact/hooks";

interface KeyboardOptions {
  appRef: { current: HTMLDivElement | null };
  scrollRef: { current: HTMLDivElement | null };
  cells: { current: Map<string, HTMLElement> };
  lastToggled: { current: string | null };
  focusId: string | null;
  setFocusId: (id: string | null) => void;
  open: Set<string>;
  setOpen: (s: Set<string>) => void;
  visibleIds: string[];
  toggle: (id: string) => void;
}

export function useCardKeyboard(opts: KeyboardOptions): void {
  const { appRef, scrollRef, cells, lastToggled, focusId, setFocusId, open, setOpen, visibleIds, toggle } = opts;

  // refs mirroring state so the (subscribe-once) keydown handler reads live values
  const focusRef = useRef(focusId);
  focusRef.current = focusId;
  const openRef = useRef(open);
  openRef.current = open;
  const visibleRef = useRef(visibleIds);
  visibleRef.current = visibleIds;

  const scrollFocusIntoView = useCallback(
    (id: string): void => {
      const cell = cells.current.get(id);
      const sc = scrollRef.current;
      if (!cell || !sc) return;
      const cr = cell.getBoundingClientRect();
      const sr = sc.getBoundingClientRect();
      if (cr.top < sr.top + 70 || cr.bottom > sr.bottom - 8) {
        sc.scrollTo({ top: cr.top - sr.top + sc.scrollTop - 90, behavior: "smooth" });
      }
    },
    [cells, scrollRef],
  );

  useEffect(() => {
    const root = appRef.current;
    if (!root) return;
    const moveFocus = (dir: "left" | "right" | "up" | "down"): void => {
      const items: { id: string; r: DOMRect }[] = [];
      cells.current.forEach((el, id) => {
        if (visibleRef.current.includes(id)) items.push({ id, r: el.getBoundingClientRect() });
      });
      if (!items.length) return;
      const cur = items.find((i) => i.id === focusRef.current);
      if (!cur) {
        setFocusId(items[0].id);
        scrollFocusIntoView(items[0].id);
        return;
      }
      const cx = cur.r.left + cur.r.width / 2;
      const cy = cur.r.top + cur.r.height / 2;
      let best: string | null = null;
      let bestScore = Infinity;
      for (const it of items) {
        if (it.id === cur.id) continue;
        const ix = it.r.left + it.r.width / 2;
        const iy = it.r.top + it.r.height / 2;
        const dx = ix - cx;
        const dy = iy - cy;
        let primary: number;
        let cross: number;
        if (dir === "left") {
          if (dx > -4) continue;
          primary = -dx;
          cross = Math.abs(dy) * 2.2;
        } else if (dir === "right") {
          if (dx < 4) continue;
          primary = dx;
          cross = Math.abs(dy) * 2.2;
        } else if (dir === "up") {
          if (dy > -4) continue;
          primary = -dy;
          cross = Math.abs(dx) * 2.2;
        } else {
          if (dy < 4) continue;
          primary = dy;
          cross = Math.abs(dx) * 2.2;
        }
        const score = primary + cross;
        if (score < bestScore) {
          bestScore = score;
          best = it.id;
        }
      }
      if (best != null) {
        setFocusId(best);
        scrollFocusIntoView(best);
      }
    };
    const onKey = (e: KeyboardEvent): void => {
      const ae = activeDocument.activeElement as HTMLElement | null;
      const typing =
        ae != null &&
        (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA" || ae.tagName === "SELECT" || ae.isContentEditable);
      if (e.key === "/" && !typing) {
        e.preventDefault();
        root.querySelector<HTMLElement>(".cr-search__input")?.focus();
        return;
      }
      if (typing) {
        // Swallow Escape so it doesn't bubble to Obsidian's global keymap, which
        // reads Escape as "focus next pane" and swaps away from the Carrel tab.
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          ae?.blur();
        }
        return;
      }
      if (e.key === "ArrowLeft") { e.preventDefault(); moveFocus("left"); }
      else if (e.key === "ArrowRight") { e.preventDefault(); moveFocus("right"); }
      else if (e.key === "ArrowUp") { e.preventDefault(); moveFocus("up"); }
      else if (e.key === "ArrowDown") { e.preventDefault(); moveFocus("down"); }
      else if (e.key === "Enter" || e.key === " ") {
        if (focusRef.current != null) { e.preventDefault(); toggle(focusRef.current); }
      } else if (e.key === "Escape") {
        // Always consume Escape while the board has focus: collapse the focused
        // card, else clear all open cards, else drop focus — but never let it
        // bubble to Obsidian's global keymap (which would swap away the tab).
        e.preventDefault();
        e.stopPropagation();
        if (focusRef.current != null && openRef.current.has(focusRef.current)) toggle(focusRef.current);
        else if (openRef.current.size) setOpen(new Set());
        else setFocusId(null);
      }
    };
    root.addEventListener("keydown", onKey);
    return () => root.removeEventListener("keydown", onKey);
  }, [appRef, cells, toggle, setFocusId, setOpen, scrollFocusIntoView]);

  // keep a just-opened card visible (shares the scroll helper with arrow nav)
  useEffect(() => {
    const id = lastToggled.current;
    if (id != null && open.has(id)) scrollFocusIntoView(id);
  }, [open, lastToggled, scrollFocusIntoView]);
}
