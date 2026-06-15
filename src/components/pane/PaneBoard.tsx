/* Carrel full-pane board — toolbar (brand + search + filter chips + collapse),
   category sections, and a JS column-balancing masonry of typed cards.

   The masonry (ported from the design handoff's PaneWall): every card is
   absolutely positioned via transform and placed into the shortest-fit column
   window. Opened cards span 1–N columns by content weight and their body flows
   into reading-width text columns; siblings reflow with a staggered FLIP slide.
   Because each card's exact height is measured at its target span width BEFORE
   placement, a heavy card (e.g. a Grapple flowchart) can never under-reserve
   and bleed under the next row (bug #2).

   Phase 4 adds the pinned rail + keyboard nav; Phase 5 persists pins/checklist
   per nook. */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import type CarrelPlugin from "../../main";
import type { RuleDoc } from "../../rules/model";
import { searchRules } from "../../rules/search";
import { CONTENT_TYPES, FILTERABLE_TYPES } from "../../rules/registry";
import { refIconId } from "../../rules/icons";
import { Icon } from "../common/Icon";
import { useDragScroll } from "../common/useDragScroll";
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

function BookGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
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
  isOpen: boolean;
  q: string;
  titlePos: number[] | undefined;
  pinned: boolean;
  onToggle: () => void;
  onPin: () => void;
  checklistState: Record<string, boolean>;
  onToggleCheck: (key: string, value: boolean) => void;
}

function Card({ plugin, doc, isOpen, q, titlePos, pinned, onToggle, onPin, checklistState, onToggleCheck }: CardProps) {
  const bc = CONTENT_TYPES[doc.type].color;
  return (
    <div class={"cr-card" + (isOpen ? " is-open" : "")} style={{ "--bc": bc }} onClick={isOpen ? undefined : onToggle}>
      {isOpen && <span class="cr-card__accent" />}
      <div class="cr-card__head" onClick={isOpen ? onToggle : undefined}>
        <span class="cr-card__ic">
          <Icon id={refIconId(doc.icon)} />
        </span>
        <div class="cr-card__headmain">
          <div class="cr-card__title">{titlePos && titlePos.length ? hlFuzzy(doc.title, titlePos) : doc.title}</div>
          {isOpen ? (
            <div class="cr-card__metarow">
              <TypeBadge type={doc.type} mini />
            </div>
          ) : (
            <span class="cr-card__type">{CONTENT_TYPES[doc.type].label}</span>
          )}
        </div>
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

export function PaneBoard({ plugin }: { plugin: CarrelPlugin }) {
  const [query, setQuery] = useState("");
  const [cats, setCats] = useState<Set<string>>(() => new Set());
  const [types, setTypes] = useState<Set<string>>(() => new Set());
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const [open, setOpen] = useState<Set<string>>(() => new Set()); // multi-open
  const [autoCols, setAutoCols] = useState(3);
  // Phase 2 transient state; Phase 5 persists these per nook.
  const [pins, setPins] = useState<Set<string>>(() => new Set());
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
  const filtersRef = useDragScroll<HTMLDivElement>();

  const docs = plugin.index.docs.value;
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
  const presentTypes = useMemo(() => FILTERABLE_TYPES.filter((t) => docs.some((d) => d.type === t)), [docs]);

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
        // measure at the exact target width (no transition) so height is exact
        cell.style.transition = "none";
        cell.style.width = span * colW + (span - 1) * gap + "px";
        cell.dataset.span = String(span);
        const h = cell.offsetHeight;
        // shortest-fit window
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

  const toggle = (path: string) => {
    lastToggled.current = path;
    setOpen((o) => {
      const n = new Set(o);
      n.has(path) ? n.delete(path) : n.add(path);
      return n;
    });
  };
  const togglePin = (path: string) => {
    const next = new Set(pins);
    next.has(path) ? next.delete(path) : next.add(path);
    setPins(next);
  };
  const onToggleCheck = (key: string, value: boolean) => {
    const next = { ...checklist };
    if (value) next[key] = true;
    else delete next[key];
    setChecklist(next);
  };
  const toggleSet = (set: Set<string>, setter: (s: Set<string>) => void, val: string) => {
    const n = new Set(set);
    n.has(val) ? n.delete(val) : n.add(val);
    setter(n);
  };

  return (
    <div class="cr-app" ref={appRef}>
      <div class="cr-top">
        <div class="cr-topbar">
          <div class="cr-brand">
            <span class="cr-brand__mark">
              <BookGlyph />
            </span>
            <div>
              <div class="cr-brand__name">Carrel</div>
              <div class="cr-brand__sub">References</div>
            </div>
          </div>
          <SearchBar value={query} onChange={setQuery} count={filtered.length} />
          <div class="cr-toolbtns">
            <button class="cr-tbtn" disabled={!open.size} onClick={() => setOpen(new Set())}>
              Collapse{open.size ? " " + open.size : ""}
            </button>
          </div>
        </div>
        <div class="cr-filters" ref={filtersRef}>
          <button class={"cr-chip cr-chip--pin" + (pinnedOnly ? " is-on" : "")} onClick={() => setPinnedOnly((v) => !v)}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill={pinnedOnly ? "currentColor" : "none"} stroke="currentColor" stroke-width="1.8" stroke-linejoin="round">
              <path d="M12 3.5l2.6 5.3 5.9.86-4.25 4.14 1 5.86L12 17.9l-5.25 2.76 1-5.86L3.5 9.66l5.9-.86z" />
            </svg>
            {pins.size}
          </button>
          {presentCats.length > 0 && <span class="cr-filters__div" />}
          {presentCats.map((c) => (
            <button key={c} class={"cr-chip" + (cats.has(c) ? " is-on" : "")} onClick={() => toggleSet(cats, setCats, c)}>
              {c}
            </button>
          ))}
          {presentTypes.length > 0 && <span class="cr-filters__div" />}
          {presentTypes.map((t) => (
            <button
              key={t}
              class={"cr-chip cr-chip--type" + (types.has(t) ? " is-on" : "")}
              style={{ "--bc": CONTENT_TYPES[t].color }}
              onClick={() => toggleSet(types, setTypes, t)}
            >
              <Icon id={refIconId(CONTENT_TYPES[t].glyph)} class="cr-chip__ic" />
              {CONTENT_TYPES[t].label}
            </button>
          ))}
        </div>
      </div>

      <div class="cr-scroll" ref={scrollRef}>
        <div class="cr-inner">
          {docs.length === 0 ? (
            <div class="r-empty">
              <Icon id="ra-book" class="r-empty__ic" />
              <div>No notes indexed</div>
              <div class="r-empty__sub">Point a nook at one or more folders to populate the board.</div>
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
                      <path d="M12 3.5l2.6 5.3 5.9.86-4.25 4.14 1 5.86L12 17.9l-5.25 2.76 1-5.86L3.5 9.66l5.9-.86z" />
                    </svg>
                  )}
                  {sec.label}
                  <span class="cr-cat__count">{sec.docs.length}</span>
                </div>
                <div class="cr-masonry" ref={regSection(sec.label)}>
                  {sec.docs.map((d) => (
                    <div class={"cr-cell" + (open.has(d.path) ? " is-open" : "")} key={d.path} ref={regCell(d.path)}>
                      <Card
                        plugin={plugin}
                        doc={d}
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
        </div>
      </div>
    </div>
  );
}
