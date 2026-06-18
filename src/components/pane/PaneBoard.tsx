/* Carrel full-pane board — toolbar (brand + search + filter chips + collapse),
   an optional drag-to-reorder pinned rail, category sections, and a JS
   column-balancing masonry of typed cards with keyboard navigation.

   The board is the composition root: it owns the shared refs (appRef, scrollRef,
   the card-cell map, lastToggled) and the filter/search/section derivation, and
   delegates the three self-contained subsystems to hooks:
     - useMasonryPack   — the column-balancing pack + reflow (see its header)
     - useRailDrag      — the pinned-rail FLIP + drag-to-reorder
     - useCardKeyboard  — spatial arrow navigation, scoped to the pane

   Phase 5 persists pins/order/checklist per nook. */
import { useCallback, useMemo, useRef, useState } from "preact/hooks";
import type { JSX } from "preact";
import type CarrelPlugin from "../../main";
import type { CarrelIndex } from "../../rules/index";
import type { RuleDoc } from "../../rules/model";
import type { CustomType, GroupBy, SortMode } from "../../types/data";
import { searchRules } from "../../rules/search";
import { FILTERABLE_TYPES, customTypeToken, resolveType } from "../../rules/registry";
import { buildSections, categoryComparator } from "../../rules/grouping";
import { Icon } from "../common/Icon";
import { GlyphIcon } from "../common/GlyphIcon";
import { DragGrip, STAR_PATH } from "../common/glyphs";
import { useDragScroll } from "../common/useDragScroll";
import { CreateNookModal, NookSettingsModal } from "../../modals";
import { Blocks, MetaChips, StarButton, TypeBadge, hl, hlFuzzy } from "./blocks";
import { useMasonryPack, type Section } from "./hooks/useMasonryPack";
import { useRailDrag } from "./hooks/useRailDrag";
import { useCardDrag } from "./hooks/useCardDrag";
import { useCardKeyboard } from "./hooks/useCardKeyboard";

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

function BookGlyph(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );
}

/** Chevrons meeting at the center — the standard "collapse all" glyph. */
function CollapseGlyph(): JSX.Element {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
      <path d="m7 4 5 5 5-5" />
      <path d="m7 20 5-5 5 5" />
    </svg>
  );
}

function SearchBar({ value, onChange, count }: { value: string; onChange: (v: string) => void; count: number }): JSX.Element {
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
  onGripDown?: (e: PointerEvent) => void;
}

function Card({ plugin, doc, customTypes, isOpen, q, titlePos, pinned, onToggle, onPin, checklistState, onToggleCheck, onGripDown }: CardProps): JSX.Element {
  const t = resolveType(doc.type, customTypes);
  return (
    <div class={"cr-card" + (isOpen ? " is-open" : "")} style={{ "--bc": t.color }} onClick={isOpen ? undefined : onToggle}>
      {isOpen && <span class="cr-card__accent" />}
      <div class="cr-card__head" onClick={isOpen ? onToggle : undefined}>
        <div class="cr-card__toprow">
          {onGripDown && !isOpen && (
            <button
              class="cr-card__grip"
              title="Drag to reorder"
              aria-label="Drag to reorder"
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => onGripDown(e)}
            >
              <DragGrip />
            </button>
          )}
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
  boardNookId,
  chromeless = false,
  index,
}: {
  plugin: CarrelPlugin;
  embed?: boolean;
  embedNookId?: string;
  /** Drive the board from a specific nook in FULL (non-embed) mode, hiding the
   *  global nook switcher / new-nook controls. Used by the Bases view, which
   *  owns a dedicated hidden nook. */
  boardNookId?: string;
  /** Hide all chrome (toolbar, search, filters, controls) — cards + pins only.
   *  Used by the inline `carrel` codeblock embed. */
  chromeless?: boolean;
  /** Index override (the inline embed runs its own per-nook index so it can show
   *  a nook other than the active one). Defaults to the plugin's shared index. */
  index?: CarrelIndex;
}): JSX.Element {
  const [query, setQuery] = useState("");
  const [cats, setCats] = useState<Set<string>>(() => new Set());
  const [types, setTypes] = useState<Set<string>>(() => new Set());
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const [open, setOpen] = useState<Set<string>>(() => new Set()); // multi-open
  const [focusId, setFocusId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [cardDragId, setCardDragId] = useState<string | null>(null);
  const filtersRef = useDragScroll<HTMLDivElement>();

  // The active nook drives the indexed docs and owns the persisted pins, pin
  // order, and checklist state (saved to data.json via the store).
  const store = plugin.store;
  const data = store.data.value; // subscribe to store changes
  const customTypes = data.customTypes;
  // Bases-backed nooks are hidden from the main pane's switcher / fallback.
  const switchableNooks = data.nooks.filter((n) => n.kind !== "bases");
  const nook = boardNookId != null
    ? data.nooks.find((n) => n.id === boardNookId) ?? null
    : embed
      ? data.nooks.find((n) => n.id === embedNookId) ?? null
      : data.nooks.find((n) => n.id === data.activeNookId) ?? switchableNooks[0] ?? null;
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
    return seen.sort(categoryComparator(data.categories));
  }, [docs, data.categories]);
  const disabledBuiltins = useMemo(
    () => new Set<string>(data.disabledBuiltinTypes),
    [data.disabledBuiltinTypes]
  );
  const presentTypes = useMemo(() => {
    const builtins: string[] = FILTERABLE_TYPES.filter(
      (t) => !disabledBuiltins.has(t) && docs.some((d) => d.type === t)
    );
    const custom = [...customTypes]
      .sort((a, b) => a.order - b.order)
      .map(customTypeToken)
      .filter((tok) => docs.some((d) => d.type === tok));
    return [...builtins, ...custom];
  }, [docs, customTypes, disabledBuiltins]);

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

  const groupBy: GroupBy = nook?.tweaks.groupBy ?? "category";
  const sortMode: SortMode = nook?.tweaks.sort ?? "az";
  const cardOrder = nook?.cardOrder ?? {};

  const sections: Section[] = [];
  if (isSearching) {
    sections.push({ label: "Results", docs: rankedDocs, results: true });
  } else {
    for (const g of buildSections(rankedDocs, groupBy, sortMode, {
      categories: data.categories,
      customTypes,
      cardOrder,
      disabledBuiltinTypes: disabledBuiltins,
    })) {
      sections.push({ key: g.key, label: g.label, docs: g.docs, results: false });
    }
  }
  const sectionsRef = useRef<Section[]>(sections);
  sectionsRef.current = sections;

  // shared refs — owned here because more than one subsystem reads them
  const appRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const cells = useRef(new Map<string, HTMLElement>());
  const lastToggled = useRef<string | null>(null);
  // cheap, and only ever stored into a ref by the keyboard hook — no memo needed
  const visibleIds = rankedDocs.map((d) => d.path);

  const regCell = (id: string) => (el: HTMLElement | null): void => {
    if (el) cells.current.set(id, el);
    else cells.current.delete(id);
  };

  const toggle = useCallback((id: string) => {
    lastToggled.current = id;
    setOpen((o) => {
      const n = new Set(o);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
    setFocusId(id);
  }, []);

  // the three self-contained subsystems
  const { regSection } = useMasonryPack({ appRef, scrollRef, cells, lastToggled }, open, query, spanOf, sections);
  const { regRail, onPinDown } = useRailDrag({ store, nookRef, pinOrder, dragId, setDragId });
  const { onCardDown } = useCardDrag({ store, nookRef, sectionsRef, cells, appRef, setDragId: setCardDragId });
  useCardKeyboard({ appRef, scrollRef, cells, lastToggled, focusId, setFocusId, open, setOpen, visibleIds, toggle });

  // pins + pinOrder are persisted together on the nook; toggling a pin keeps the
  // existing order (filtered) and appends a new pin to the end.
  const togglePin = (path: string): void => {
    if (!nook) return;
    const set = new Set(nook.pins);
    if (set.has(path)) set.delete(path);
    else set.add(path);
    const kept = nook.pinOrder.filter((id) => set.has(id));
    const added = [...set].filter((id) => !kept.includes(id));
    store.setNookPins(nook.id, [...set], [...kept, ...added]);
  };
  const onToggleCheck = (key: string, value: boolean): void => {
    if (!nook) return;
    const next = { ...nook.checklist };
    if (value) next[key] = true;
    else delete next[key];
    store.setNookChecklist(nook.id, next);
  };
  const toggleSet = (set: Set<string>, setter: (s: Set<string>) => void, val: string): void => {
    const n = new Set(set);
    if (n.has(val)) n.delete(val);
    else n.add(val);
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
    // tabIndex makes the board focusable so the keyboard navigator can scope its
    // keydown to the pane (it receives focus when the user clicks into it).
    <div class={appClass} ref={appRef} tabIndex={-1}>
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
          {!embed && boardNookId == null && switchableNooks.length > 0 && (
            <select
              class="cr-nooksel"
              value={nook?.id ?? ""}
              onChange={(e) => store.setActiveNook((e.target as HTMLSelectElement).value)}
            >
              {switchableNooks.map((n) => (
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
            {!embed && boardNookId == null && (
              <button class="cr-tbtn cr-tbtn--icon" title="New nook" onClick={() => new CreateNookModal(plugin).open()}>
                +
              </button>
            )}
          </div>
        </div>
        <div class="cr-filters" ref={filtersRef}>
          {nook && (
            <>
              <select
                class="cr-sortsel"
                value={groupBy}
                title="Group cards by"
                onChange={(e) => store.setNookGroupBy(nook.id, (e.target as HTMLSelectElement).value as GroupBy)}
              >
                <option value="category">Group: Category</option>
                <option value="type">Group: Type</option>
                <option value="folder">Group: Folder</option>
                <option value="none">Group: None</option>
              </select>
              <select
                class="cr-sortsel"
                value={sortMode}
                title="Sort cards within each group"
                onChange={(e) => store.setNookSort(nook.id, (e.target as HTMLSelectElement).value as SortMode)}
              >
                <option value="az">Sort: A–Z</option>
                <option value="za">Sort: Z–A</option>
                <option value="type">Sort: Type</option>
                {/* always selectable so a remembered custom arrangement is reachable
                    after switching to a preset (empty order falls back to A–Z) */}
                <option value="custom">Sort: Custom</option>
              </select>
              <span class="cr-filters__div" />
            </>
          )}
          <button class={"cr-chip cr-chip--pin" + (pinnedOnly ? " is-on" : "")} onClick={() => setPinnedOnly((v) => !v)}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill={pinnedOnly ? "currentColor" : "none"} stroke="currentColor" stroke-width="1.8" stroke-linejoin="round">
              <path d={STAR_PATH} />
            </svg>
            {pins.size}
          </button>
          {presentCats.length > 0 && <span class="cr-filters__div" />}
          {presentCats.map((c) => {
            const cc = data.categories.find((cat) => cat.name === c)?.color;
            const hasColor = cc != null && cc !== "";
            return (
              <button
                key={c}
                class={"cr-chip" + (hasColor ? " cr-chip--cat" : "") + (cats.has(c) ? " is-on" : "")}
                style={hasColor ? { "--cc": cc } : undefined}
                onClick={() => toggleSet(cats, setCats, c)}
              >
                {hasColor && <span class="cr-chip__dot" />}
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
                    <path d={STAR_PATH} />
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
                      if (dragId != null && dragId !== "") return;
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
                      <DragGrip />
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
                      <path d={STAR_PATH} />
                    </svg>
                  )}
                  {sec.label}
                  <span class="cr-cat__count">{sec.docs.length}</span>
                </div>
                <div class="cr-masonry" ref={regSection(sec.label)}>
                  {sec.docs.map((d) => (
                    <div
                      class={"cr-cell" + (open.has(d.path) ? " is-open" : "") + (focusId === d.path ? " is-focused" : "") + (cardDragId === d.path ? " is-drag" : "")}
                      key={d.path}
                      data-path={d.path}
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
                        onGripDown={!embed && !sec.results ? (e) => onCardDown(e, d.path) : undefined}
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
