/* Carrel full-pane board — toolbar (brand + search + filter chips + collapse),
   an optional drag-to-reorder pinned rail, category sections, and a JS
   column-balancing masonry of typed cards with keyboard navigation.

   The masonry (ported from the design handoff's PaneWall): every card is
   absolutely positioned via transform and placed into the shortest-fit column
   window. Opened cards span 1–N columns by content weight and their body flows
   into reading-width text columns; siblings reflow with a staggered FLIP slide.
   Because each card's exact height is measured at its target span width BEFORE
   placement, a heavy card (e.g. a Grapple flowchart) can never under-reserve
   and bleed under the next row (bug #2).

   Phase 5 persists pins/order/checklist per nook. */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import type CarrelPlugin from "../../main";
import type { CarrelIndex } from "../../rules/index";
import type { RuleDoc } from "../../rules/model";
import type { CustomType } from "../../types/data";
import { searchRules } from "../../rules/search";
import { FILTERABLE_TYPES, customTypeToken, resolveType } from "../../rules/registry";
import { Icon } from "../common/Icon";
import { GlyphIcon } from "../common/GlyphIcon";
import { useDragScroll } from "../common/useDragScroll";
import { CreateNookModal, NookSettingsModal } from "../../modals";
import { Blocks, MetaChips, RENDERED_EVENT, StarButton, TypeBadge, hl, hlFuzzy } from "./blocks";

interface Section {
  label: string;
  docs: RuleDoc[];
  results: boolean;
}

const DEFAULT_GAP = 14;
const COL_STEP = 330; // ~one column per 330px of width
const SPRING = "cubic-bezier(.33,1.32,.5,1)";

/** How wide an opened card wants to be (content weight → 1–3 base columns). */
function contentWeight(doc: RuleDoc): number {
  let w = 0;
  for (const b of doc.blocks) {
    switch (b.t) {
      case "p": w += 0.6 + (b.text ? b.text.length : 0) / 230; break;
      case "table": w += 1.5 + b.rows.length * 0.32 + b.cols.length * 0.14; break;
      case "flow": w += 2.7; break;
      case "steps": w += 0.8 + b.items.length * 0.42; break;
      case "bullets": w += 0.6 + b.items.length * 0.34; break;
      case "checklist": w += 0.6 + b.items.length * 0.32; break;
      case "dice": w += 0.7; break;
      case "callout": w += 1.4; break;
      default: w += 0.8;
    }
  }
  return w;
}
function baseSpan(doc: RuleDoc): number {
  const w = contentWeight(doc);
  return w < 1.9 ? 1 : w < 3.7 ? 2 : 3;
}

const STAR_D = "M12 3.5l2.6 5.3 5.9.86-4.25 4.14 1 5.86L12 17.9l-5.25 2.76 1-5.86L3.5 9.66l5.9-.86z";

function BookGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );
}

/** Chevrons meeting at the center — the standard "collapse all" glyph. */
function CollapseGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
      <path d="m7 4 5 5 5-5" />
      <path d="m7 20 5-5 5 5" />
    </svg>
  );
}

function SearchBar({ value, onChange, count }: { value: string; onChange: (v: string) => void; count: number }) {
  return (
    <div class="cr-search">
      <svg class="cr-search__icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round">
        <circle cx="11" cy="11" r="6.5" />
        <path d="M20 20l-3.6-3.6" />
      </svg>
      <input
        class="cr-search__input"
        type="search"
        placeholder="Search notes…"
        value={value}
        onInput={(e) => onChange((e.target as HTMLInputElement).value)}
      />
      {value ? (
        <button class="cr-search__clear" title="Clear" onClick={() => onChange("")}>
          ✕
        </button>
      ) : (
        <span class="cr-search__count">{count}</span>
      )}
    </div>
  );
}

interface CardProps {
  plugin: CarrelPlugin;
  doc: RuleDoc;
  customTypes: CustomType[];
  isOpen: boolean;
  q: string;
  titlePos: number[] | undefined;
  pinned: boolean;
  onToggle: () => void;
  onPin: () => void;
  checklistState: Record<string, boolean>;
  onToggleCheck: (key: string, value: boolean) => void;
}

function Card({ plugin, doc, customTypes, isOpen, q, titlePos, pinned, onToggle, onPin, checklistState, onToggleCheck }: CardProps) {
  const t = resolveType(doc.type, customTypes);
  return (
    <div class={"cr-card" + (isOpen ? " is-open" : "")} style={{ "--bc": t.color }} onClick={isOpen ? undefined : onToggle}>
      {isOpen && <span class="cr-card__accent" />}
      <div class="cr-card__head" onClick={isOpen ? onToggle : undefined}>
        <div class="cr-card__toprow">
          <span class="cr-card__ic">
            <GlyphIcon iconSet={doc.iconSet} icon={doc.icon} />
          </span>
          {!isOpen && <span class="cr-card__type">{t.label}</span>}
          <span class="cr-card__spacer" />
          <StarButton active={pinned} onToggle={onPin} />
          {isOpen && (
            <button
              class="cr-card__close"
              title="Collapse"
              onClick={(e) => {
                e.stopPropagation();
                onToggle();
              }}
            >
              ✕
            </button>
          )}
        </div>
        <div class="cr-card__headmain">
          <div class="cr-card__title">{titlePos && titlePos.length ? hlFuzzy(doc.title, titlePos) : doc.title}</div>
          {isOpen && (
            <div class="cr-card__metarow">
              <TypeBadge type={doc.type} customTypes={customTypes} mini />
            </div>
          )}
        </div>
      </div>
      {isOpen ? (
        <div class="cr-card__body">
          <MetaChips meta={doc.meta} />
          <Blocks plugin={plugin} doc={doc} q={q} checklistState={checklistState} onToggleCheck={onToggleCheck} />
        </div>
      ) : (
        <p class="cr-card__sum">{hl(doc.summary, q)}</p>
      )}
    </div>
  );
}

export function PaneBoard({
  plugin,
  embed = false,
  embedNookId,
  chromeless = false,
  index,
}: {
  plugin: CarrelPlugin;
  embed?: boolean;
  embedNookId?: string;
  /** Hide all chrome (toolbar, search, filters, controls) — cards + pins only.
   *  Used by the inline `carrel` codeblock embed. */
  chromeless?: boolean;
  /** Index override (the inline embed runs its own per-nook index so it can show
   *  a nook other than the active one). Defaults to the plugin's shared index. */
  index?: CarrelIndex;
}) {
  const [query, setQuery] = useState("");
  const [cats, setCats] = useState<Set<string>>(() => new Set());
  const [types, setTypes] = useState<Set<string>>(() => new Set());
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const [open, setOpen] = useState<Set<string>>(() => new Set()); // multi-open
  const [focusId, setFocusId] = useState<string | null>(null);
  const [autoCols, setAutoCols] = useState(3);
  const [dragId, setDragId] = useState<string | null>(null);
  const filtersRef = useDragScroll<HTMLDivElement>();

  // The active nook drives the indexed docs and owns the persisted pins, pin
  // order, and checklist state (saved to data.json via the store).
  const store = plugin.store;
  const data = store.data.value; // subscribe to store changes
  const customTypes = data.customTypes;
  const nook = embed
    ? data.nooks.find((n) => n.id === embedNookId) ?? null
    : data.nooks.find((n) => n.id === data.activeNookId) ?? data.nooks[0] ?? null;
  const nookRef = useRef(nook);
  nookRef.current = nook;

  const docs = (index ?? plugin.index).docs.value;
  const pins = useMemo(() => new Set(nook?.pins ?? []), [nook?.pins]);
  const pinOrder = nook?.pinOrder ?? [];
  const checklist = nook?.checklist ?? {};
  const docByPath = useMemo(() => new Map(docs.map((d) => [d.path, d])), [docs]);
  const spanOf = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of docs) m.set(d.path, baseSpan(d));
    return m;
  }, [docs]);

  const presentCats = useMemo(() => {
    const seen: string[] = [];
    for (const d of docs) if (!seen.includes(d.category)) seen.push(d.category);
    return seen.sort((a, b) => a.localeCompare(b));
  }, [docs]);
  const presentTypes = useMemo(() => {
    const builtins: string[] = FILTERABLE_TYPES.filter((t) => docs.some((d) => d.type === t));
    const custom = [...customTypes]
      .sort((a, b) => a.order - b.order)
      .map(customTypeToken)
      .filter((tok) => docs.some((d) => d.type === tok));
    return [...builtins, ...custom];
  }, [docs, customTypes]);

  const filtered = docs.filter((d) => {
    if (pinnedOnly && !pins.has(d.path)) return false;
    if (cats.size && !cats.has(d.category)) return false;
    if (types.size && !types.has(d.type)) return false;
    return true;
  });
  const ranked = searchRules(filtered, query);
  const titlePos = useMemo(() => {
    const m = new Map<string, number[]>();
    ranked.forEach((r) => m.set(r.doc.path, r.titlePos));
    return m;
  }, [ranked]);

  const isSearching = query.trim().length > 0;
  const rankedDocs = ranked.map((r) => r.doc);

  const sections: Section[] = [];
  if (isSearching) {
    sections.push({ label: "Results", docs: rankedDocs, results: true });
  } else {
    const groups = new Map<string, RuleDoc[]>();
    for (const d of rankedDocs) {
      if (!groups.has(d.category)) groups.set(d.category, []);
      groups.get(d.category)!.push(d);
    }
    for (const [label, ds] of [...groups].sort((a, b) => a[0].localeCompare(b[0]))) {
      sections.push({ label, docs: ds, results: false });
    }
  }

  /* ---------- masonry refs + packing ---------- */
  const appRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const cells = useRef(new Map<string, HTMLElement>());
  const sectionEls = useRef(new Map<string, HTMLElement>());
  const renderedSections = useRef<Section[]>([]);
  renderedSections.current = sections;
  const lastToggled = useRef<string | null>(null);
  const lastKey = useRef("");
  const lastQuery = useRef(query);
  const firstLayout = useRef(true);
  const [, force] = useState(0);

  // refs mirroring state for the (subscribe-once) keyboard handler
  const focusRef = useRef(focusId);
  focusRef.current = focusId;
  const openRef = useRef(open);
  openRef.current = open;
  const visibleIds = useMemo(() => rankedDocs.map((d) => d.path), [ranked]);
  const visibleRef = useRef(visibleIds);
  visibleRef.current = visibleIds;

  const regCell = (id: string) => (el: HTMLElement | null) => {
    if (el) cells.current.set(id, el);
    else cells.current.delete(id);
  };
  const regSection = (name: string) => (el: HTMLElement | null) => {
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
    const calc = () => {
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
  }, []);

  const colCount = autoCols;

  // The column-balancing pack + reflow. Runs after every render so async prose
  // growth (cr-rendered → force) and open/close both re-pack; only an open/close
  // (key change with unchanged query) animates the slide.
  useLayoutEffect(() => {
    const app = appRef.current;
    if (!app) return;
    const gap = parseFloat(getComputedStyle(app).getPropertyValue("--gap")) || DEFAULT_GAP;
    const cols = colCount;
    const key = [...open].sort().join(",") + "|" + cols;
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
      const heights = new Array(cols).fill(0);
      for (const d of sec.docs) {
        const cell = cells.current.get(d.path);
        if (!cell) continue;
        const span = Math.min(open.has(d.path) ? spanOf.get(d.path) ?? 1 : 1, cols);
        cell.style.transition = "none";
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
        cell.style.transition = "none";
      }
      cell.style.transform = `translate(${x}px, ${y}px)`;
    }

    lastKey.current = key;
    lastQuery.current = query;
    firstLayout.current = false;
  });

  // re-pack when async prose finishes rendering, on font load, and on resize
  useEffect(() => {
    const f = () => force((x) => x + 1);
    let alive = true;
    const onRendered = () => f();
    document.addEventListener(RENDERED_EVENT, onRendered);
    if (document.fonts) void document.fonts.ready.then(() => alive && f());
    window.addEventListener("resize", f);
    return () => {
      alive = false;
      document.removeEventListener(RENDERED_EVENT, onRendered);
      window.removeEventListener("resize", f);
    };
  }, []);

  /* ---------- pinned rail ---------- */
  const railCells = useRef(new Map<string, HTMLElement>());
  const railPrev = useRef(new Map<string, DOMRect>());
  const dragRef = useRef<{ id: string; el: HTMLElement; dx: number; dy: number; w: number; h: number } | null>(null);
  const pinOrderRef = useRef(pinOrder);
  pinOrderRef.current = pinOrder;
  const regRail = (id: string) => (el: HTMLElement | null) => {
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
          el.style.transition = "none";
          el.style.transform = `translate(${dx}px, ${dy}px)`;
          requestAnimationFrame(() => {
            el.style.transition = "transform .24s var(--ease-back)";
            el.style.transform = "";
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
    if (nearest) {
      const near = nearest as { id: string; cx: number };
      const order = pinOrderRef.current.filter((x) => x !== d.id);
      const ni = order.indexOf(near.id);
      order.splice(e.clientX > near.cx ? ni + 1 : ni, 0, d.id);
      const cur = nookRef.current;
      if (cur && order.join() !== pinOrderRef.current.join()) store.setNookPins(cur.id, cur.pins, order);
    }
  }, []);

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
  }, [onPinMove]);

  const onPinDown = (e: PointerEvent, id: string) => {
    if (e.button !== 0) return;
    e.preventDefault();
    // keep this on the grip: don't let it bubble to the rail's drag-to-scroll.
    e.stopPropagation();
    const grip = e.currentTarget as HTMLElement;
    const el = grip.closest(".cr-railcard") as HTMLElement | null;
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

  /* ---------- toggle + keyboard navigation ---------- */
  const toggle = useCallback((id: string) => {
    lastToggled.current = id;
    setOpen((o) => {
      const n = new Set(o);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
    setFocusId(id);
  }, []);

  useEffect(() => {
    const scrollFocusIntoView = (id: string) => {
      const cell = cells.current.get(id);
      const sc = scrollRef.current;
      if (!cell || !sc) return;
      const cr = cell.getBoundingClientRect();
      const sr = sc.getBoundingClientRect();
      if (cr.top < sr.top + 70 || cr.bottom > sr.bottom - 8) {
        sc.scrollTo({ top: cr.top - sr.top + sc.scrollTop - 90, behavior: "smooth" });
      }
    };
    const moveFocus = (dir: "left" | "right" | "up" | "down") => {
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
      if (best) {
        setFocusId(best);
        scrollFocusIntoView(best);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      const ae = document.activeElement as HTMLElement | null;
      const typing = !!ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA" || ae.tagName === "SELECT" || ae.isContentEditable);
      if (e.key === "/" && !typing) {
        e.preventDefault();
        (appRef.current?.querySelector(".cr-search__input") as HTMLElement | null)?.focus();
        return;
      }
      if (typing) {
        if (e.key === "Escape") ae?.blur();
        return;
      }
      if (e.key === "ArrowLeft") { e.preventDefault(); moveFocus("left"); }
      else if (e.key === "ArrowRight") { e.preventDefault(); moveFocus("right"); }
      else if (e.key === "ArrowUp") { e.preventDefault(); moveFocus("up"); }
      else if (e.key === "ArrowDown") { e.preventDefault(); moveFocus("down"); }
      else if (e.key === "Enter" || e.key === " ") {
        if (focusRef.current) { e.preventDefault(); toggle(focusRef.current); }
      } else if (e.key === "Escape") {
        if (focusRef.current && openRef.current.has(focusRef.current)) toggle(focusRef.current);
        else if (openRef.current.size) setOpen(new Set());
        else setFocusId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);

  // keep a just-opened card visible
  useEffect(() => {
    const id = lastToggled.current;
    if (id && open.has(id)) {
      const cell = cells.current.get(id);
      const sc = scrollRef.current;
      if (cell && sc) {
        const cr = cell.getBoundingClientRect();
        const sr = sc.getBoundingClientRect();
        if (cr.top < sr.top + 70 || cr.bottom > sr.bottom - 8) {
          sc.scrollTo({ top: cr.top - sr.top + sc.scrollTop - 90, behavior: "smooth" });
        }
      }
    }
  }, [open]);

  // pins + pinOrder are persisted together on the nook; toggling a pin keeps the
  // existing order (filtered) and appends a new pin to the end.
  const togglePin = (path: string) => {
    if (!nook) return;
    const set = new Set(nook.pins);
    set.has(path) ? set.delete(path) : set.add(path);
    const kept = nook.pinOrder.filter((id) => set.has(id));
    const added = [...set].filter((id) => !kept.includes(id));
    store.setNookPins(nook.id, [...set], [...kept, ...added]);
  };
  const onToggleCheck = (key: string, value: boolean) => {
    if (!nook) return;
    const next = { ...nook.checklist };
    if (value) next[key] = true;
    else delete next[key];
    store.setNookChecklist(nook.id, next);
  };
  const toggleSet = (set: Set<string>, setter: (s: Set<string>) => void, val: string) => {
    const n = new Set(set);
    n.has(val) ? n.delete(val) : n.add(val);
    setter(n);
  };

  const pinnedDocs = pinOrder.map((p) => docByPath.get(p)).filter((d): d is RuleDoc => !!d);

  // per-nook theme + density + tweak classes on the board root
  const tw = nook?.tweaks;
  const appClass =
    "cr-app" +
    (embed ? " is-embed" : "") +
    " theme-" + (nook?.theme ?? "brand") +
    " dense-" + (tw?.density ?? "regular") +
    (tw && tw.animations === false ? " anim-off" : "") +
    (tw && tw.showBadges === false ? " no-badges" : "");
  const showRail = !tw || tw.showRail !== false;
  // wheel + drag-to-pan for the pinned rail (acts only when it overflows — the
  // nowrap embed; the wrapped full-pane rail never overflows, so this no-ops).
  // Keyed on the rail's render conditions: pins load after first render, so an
  // empty-deps effect would capture a null ref and never bind the wheel handler.
  const railVisible = showRail && !isSearching && pinnedDocs.length > 0;
  const railScrollRef = useDragScroll<HTMLDivElement>([railVisible, pinnedDocs.length]);

  return (
    <div class={appClass} ref={appRef}>
      {!chromeless && (
      <div class="cr-top">
        <div class="cr-topbar">
          {!embed && (
            <div class="cr-brand">
              <span class="cr-brand__mark">
                <BookGlyph />
              </span>
              <div>
                <div class="cr-brand__name">Carrel</div>
                <div class="cr-brand__sub">{nook ? nook.name : "References"}</div>
              </div>
            </div>
          )}
          {!embed && data.nooks.length > 0 && (
            <select
              class="cr-nooksel"
              value={nook?.id ?? ""}
              onChange={(e) => store.setActiveNook((e.target as HTMLSelectElement).value)}
            >
              {data.nooks.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.name}
                </option>
              ))}
            </select>
          )}
          <SearchBar value={query} onChange={setQuery} count={filtered.length} />
          <div class="cr-toolbtns">
            <button
              class={"cr-tbtn" + (embed ? " cr-tbtn--icon" : "")}
              disabled={!open.size}
              title={"Collapse all" + (open.size ? " (" + open.size + ")" : "")}
              onClick={() => setOpen(new Set())}
            >
              {embed ? <CollapseGlyph /> : <>Collapse{open.size ? " " + open.size : ""}</>}
            </button>
            {nook && (
              <button class="cr-tbtn cr-tbtn--icon" title="Nook settings" onClick={() => new NookSettingsModal(plugin, nook.id).open()}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </button>
            )}
            {!embed && (
              <button class="cr-tbtn cr-tbtn--icon" title="New nook" onClick={() => new CreateNookModal(plugin).open()}>
                +
              </button>
            )}
          </div>
        </div>
        <div class="cr-filters" ref={filtersRef}>
          <button class={"cr-chip cr-chip--pin" + (pinnedOnly ? " is-on" : "")} onClick={() => setPinnedOnly((v) => !v)}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill={pinnedOnly ? "currentColor" : "none"} stroke="currentColor" stroke-width="1.8" stroke-linejoin="round">
              <path d={STAR_D} />
            </svg>
            {pins.size}
          </button>
          {presentCats.length > 0 && <span class="cr-filters__div" />}
          {presentCats.map((c) => {
            const cc = data.categories.find((cat) => cat.name === c)?.color;
            return (
              <button
                key={c}
                class={"cr-chip" + (cc ? " cr-chip--cat" : "") + (cats.has(c) ? " is-on" : "")}
                style={cc ? { "--cc": cc } : undefined}
                onClick={() => toggleSet(cats, setCats, c)}
              >
                {cc && <span class="cr-chip__dot" />}
                {c}
              </button>
            );
          })}
          {presentTypes.length > 0 && <span class="cr-filters__div" />}
          {presentTypes.map((t) => {
            const rt = resolveType(t, customTypes);
            return (
              <button
                key={t}
                class={"cr-chip cr-chip--type" + (types.has(t) ? " is-on" : "")}
                style={{ "--bc": rt.color }}
                onClick={() => toggleSet(types, setTypes, t)}
              >
                <GlyphIcon iconSet={rt.iconSet} icon={rt.icon} class="cr-chip__ic" />
                {rt.label}
              </button>
            );
          })}
        </div>
      </div>
      )}

      <div class="cr-scroll" ref={scrollRef}>
        <div class="cr-inner">
          {showRail && !isSearching && pinnedDocs.length > 0 && (
            <>
              <div class="cr-pinhead">
                <span class="cr-pinhead__label">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                    <path d={STAR_D} />
                  </svg>
                  Pinned
                </span>
                <span class="cr-pinhead__hint">drag to reorder</span>
                <span class="cr-pinhead__rule" />
              </div>
              <div class="cr-rail" ref={railScrollRef}>
                {pinnedDocs.map((d) => {
                  const rt = resolveType(d.type, customTypes);
                  return (
                  <button
                    key={d.path}
                    ref={regRail(d.path)}
                    class={"cr-railcard" + (dragId === d.path ? " is-drag" : "")}
                    style={{ "--bc": rt.color }}
                    onClick={() => {
                      if (dragRef.current) return;
                      setPinnedOnly(false);
                      toggle(d.path);
                    }}
                  >
                    <span
                      class="cr-railcard__grip"
                      title="Drag to reorder"
                      onPointerDown={(e) => onPinDown(e, d.path)}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                        <circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" />
                        <circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" />
                        <circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" />
                      </svg>
                    </span>
                    <span class="cr-railcard__ic">
                      <GlyphIcon iconSet={d.iconSet} icon={d.icon} />
                    </span>
                    <span class="cr-railcard__main">
                      <span class="cr-railcard__title">{d.title}</span>
                      <span class="cr-railcard__type">{rt.label}</span>
                    </span>
                  </button>
                  );
                })}
              </div>
            </>
          )}

          {!nook ? (
            <div class="r-empty">
              <Icon id="ra-book" class="r-empty__ic" />
              <div>No nooks yet</div>
              <div class="r-empty__sub">Create a nook from one or more folders to start a board.</div>
              <button class="cr-tbtn cr-empty__cta" onClick={() => new CreateNookModal(plugin).open()}>
                + Create nook
              </button>
            </div>
          ) : docs.length === 0 ? (
            <div class="r-empty">
              <Icon id="ra-book" class="r-empty__ic" />
              <div>This nook is empty</div>
              <div class="r-empty__sub">No notes found in {nook.folders.join(", ") || "its folders"}.</div>
            </div>
          ) : filtered.length === 0 ? (
            <div class="r-empty">
              <Icon id="ra-book" class="r-empty__ic" />
              <div>No references match</div>
              <div class="r-empty__sub">Try a different search or clear the filters.</div>
            </div>
          ) : (
            sections.map((sec) => (
              <section key={sec.label}>
                <div class={"cr-cat" + (sec.results ? " cr-cat--results" : "")}>
                  {sec.results && (
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                      <path d={STAR_D} />
                    </svg>
                  )}
                  {sec.label}
                  <span class="cr-cat__count">{sec.docs.length}</span>
                </div>
                <div class="cr-masonry" ref={regSection(sec.label)}>
                  {sec.docs.map((d) => (
                    <div
                      class={"cr-cell" + (open.has(d.path) ? " is-open" : "") + (focusId === d.path ? " is-focused" : "")}
                      key={d.path}
                      ref={regCell(d.path)}
                    >
                      <Card
                        plugin={plugin}
                        doc={d}
                        customTypes={customTypes}
                        isOpen={open.has(d.path)}
                        q={query}
                        titlePos={titlePos.get(d.path)}
                        pinned={pins.has(d.path)}
                        onToggle={() => toggle(d.path)}
                        onPin={() => togglePin(d.path)}
                        checklistState={checklist}
                        onToggleCheck={onToggleCheck}
                      />
                    </div>
                  ))}
                </div>
              </section>
            ))
          )}

          {!embed && (
            <div class="cr-kbd">
              <span><kbd>/</kbd> search</span>
              <span><kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd> navigate</span>
              <span><kbd>↵</kbd> expand</span>
              <span><kbd>esc</kbd> collapse</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
