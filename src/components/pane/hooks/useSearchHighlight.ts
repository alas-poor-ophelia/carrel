/* Search-match highlighting for native-markdown card regions, via the CSS
   Custom Highlight API (`CSS.highlights` + `Highlight` + `Range`).

   The card body's prose is rendered by Obsidian's MarkdownRenderer (DOM we do
   not own and must not mutate). Rather than walking and wrapping matches in
   <mark> (which corrupts link/embed handlers and races Preact), we register
   paint-only Ranges over the rendered text. Highlights span element boundaries
   natively, never touch the DOM tree, and update on `q` change WITHOUT
   re-rendering any markdown — so there is no stale-range race.

   Title and collapsed-summary highlighting stay at the Preact layer (plain
   strings via hl/hlFuzzy); this controller covers only `.cr-region` bodies. */
import { useEffect } from "preact/hooks";
import { RENDERED_EVENT } from "../blocks";

/** The named highlight CSS targets via `::highlight(carrel-search)`. */
const HL_NAME = "carrel-search";

interface ElRef {
  current: HTMLElement | null;
}

export function useSearchHighlight(rootRef: ElRef, query: string, enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    const root = rootRef.current;
    if (!root) return;
    const doc = root.ownerDocument;
    // Resolve the registry from the ROOT's own window so a popped-out pane (a
    // separate document) highlights in its own context, not the main window's.
    const view = doc.defaultView;
    if (!view) return;
    // Cast to an optional shape: the API is universal in the type system but may
    // be absent at runtime on an older Obsidian/Electron, so feature-detect.
    const reg = (view.CSS as { highlights?: HighlightRegistry } | undefined)?.highlights;
    const HighlightCtor: typeof Highlight | undefined = view.Highlight;
    if (!reg || typeof HighlightCtor !== "function") return; // API unsupported -> graceful no-op

    let raf = 0;
    const recompute = (): void => {
      raf = 0;
      const q = query.trim().toLowerCase();
      if (q === "") {
        reg.delete(HL_NAME);
        return;
      }
      const ranges: Range[] = [];
      root.querySelectorAll(".cr-region, .cr-cell-md").forEach((region) => {
        const walker = doc.createTreeWalker(region, NodeFilter.SHOW_TEXT);
        let node = walker.nextNode();
        while (node) {
          const text = (node.nodeValue ?? "").toLowerCase();
          let idx = text.indexOf(q);
          while (idx !== -1) {
            const r = doc.createRange();
            r.setStart(node, idx);
            r.setEnd(node, idx + q.length);
            ranges.push(r);
            idx = text.indexOf(q, idx + q.length);
          }
          node = walker.nextNode();
        }
      });
      if (ranges.length > 0) reg.set(HL_NAME, new HighlightCtor(...ranges));
      else reg.delete(HL_NAME);
    };
    // Coalesce bursts (every region's async render fires RENDERED_EVENT) into one
    // recompute per frame.
    const schedule = (): void => {
      if (raf !== 0) return;
      raf = view.requestAnimationFrame(recompute);
    };
    schedule();
    const onRendered = (): void => schedule();
    doc.addEventListener(RENDERED_EVENT, onRendered);
    return () => {
      doc.removeEventListener(RENDERED_EVENT, onRendered);
      if (raf !== 0) view.cancelAnimationFrame(raf);
      reg.delete(HL_NAME);
    };
  }, [query, enabled, rootRef]);
}
