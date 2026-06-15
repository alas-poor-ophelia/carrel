/* Carrel full-pane board — toolbar (brand + search + filter chips), category
   sections, and typed cards. Phase 2 uses a static responsive grid and
   single-open cards; Phase 3 swaps in the JS column-balancing masonry +
   multi-open, Phase 4 adds the pinned rail + keyboard nav, Phase 5 persists
   pins/checklist per nook. */
import { useMemo, useState } from "preact/hooks";
import type CarrelPlugin from "../../main";
import type { RuleDoc } from "../../rules/model";
import { searchRules } from "../../rules/search";
import { CONTENT_TYPES, FILTERABLE_TYPES } from "../../rules/registry";
import { refIconId } from "../../rules/icons";
import { Icon } from "../common/Icon";
import { useDragScroll } from "../common/useDragScroll";
import { Blocks, MetaChips, StarButton, TypeBadge, hl, hlFuzzy } from "./blocks";

interface Section {
  label: string;
  docs: RuleDoc[];
  results: boolean;
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
  const [open, setOpen] = useState<string | null>(null);
  // Phase 2 transient state; Phase 5 persists these per nook.
  const [pins, setPins] = useState<Set<string>>(() => new Set());
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
  const filtersRef = useDragScroll<HTMLDivElement>();

  const docs = plugin.index.docs.value;

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
    <>
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

      <div class="cr-scroll">
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
                <div class="cr-masonry">
                  {sec.docs.map((d, i) => (
                    <div class={"cr-cell cr-anim" + (open === d.path ? " is-open" : "")} style={{ "--i": i }} key={d.path}>
                      <Card
                        plugin={plugin}
                        doc={d}
                        isOpen={open === d.path}
                        q={query}
                        titlePos={titlePos.get(d.path)}
                        pinned={pins.has(d.path)}
                        onToggle={() => setOpen(open === d.path ? null : d.path)}
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
    </>
  );
}
