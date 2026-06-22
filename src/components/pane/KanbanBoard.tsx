/* Carrel kanban swimlanes — the parallel render path to the masonry board.

   Categories become fixed-width columns laid out left→right; each card's home
   column is its category. The set of visible columns is the nook's
   `kanbanColumns` (seeded from present categories on first entry), and add/remove
   controls splice that list — that's the per-nook show/hide.

   Cards share ONE absolutely-positioned layer (not nested per-column DOM) so an
   opened card can span and overlap column boundaries; useKanbanPack owns the
   stacking + sideways-displacement transforms. Dragging a card across columns
   writes its new category to the note's frontmatter (useKanbanDrag); an in-flight
   override keeps the card under the new column until the reindex confirms. */
import { Menu } from "obsidian";
import { useCallback, useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { JSX } from "preact";
import type CarrelPlugin from "../../main";
import type { RuleDoc } from "../../rules/model";
import type { Category, CustomType, Nook, SortMode } from "../../types/data";
import type { CarrelStore } from "../../state/store";
import { categoryComparator, sortDocs } from "../../rules/grouping";
import { PromptModal } from "../../modals";
import { GlyphIcon } from "../common/GlyphIcon";
import { useDragScroll } from "../common/useDragScroll";
import { Card } from "./PaneBoard";
import { useKanbanPack, type KanbanColumnDocs } from "./hooks/useKanbanPack";
import { useKanbanDrag, type KanbanDragColumn } from "./hooks/useKanbanDrag";

export interface KanbanBoardProps {
  plugin: CarrelPlugin;
  store: CarrelStore;
  nook: Nook;
  nookRef: { current: Nook | null };
  embed: boolean;
  /** Filtered, ranked docs (non-search) — the same list the masonry path renders. */
  docs: RuleDoc[];
  docByPath: Map<string, RuleDoc>;
  categories: Category[];
  customTypes: CustomType[];
  disabledBuiltins: Set<string>;
  cardOrder: Record<string, string[]>;
  sortMode: SortMode;
  spanOf: Map<string, number>;
  query: string;
  open: Set<string>;
  toggle: (id: string) => void;
  pins: Set<string>;
  togglePin: (path: string) => void;
  checklist: Record<string, boolean>;
  onToggleCheck: (key: string, value: boolean) => void;
  titlePos: Map<string, number[]>;
  focusId: string | null;
  cardDragId: string | null;
  setCardDragId: (id: string | null) => void;
  // shared refs owned by the board (ghost host + the card-cell map + last toggled)
  appRef: { current: HTMLDivElement | null };
  cells: { current: Map<string, HTMLElement> };
  lastToggled: { current: string | null };
  regCell: (id: string) => (el: HTMLElement | null) => void;
}

export function KanbanBoard(props: KanbanBoardProps): JSX.Element {
  const {
    plugin, store, nook, nookRef, embed, docs, docByPath, categories, customTypes,
    disabledBuiltins, cardOrder, sortMode, spanOf, query, open, toggle, pins, togglePin,
    checklist, onToggleCheck, titlePos, focusId, cardDragId, setCardDragId,
    appRef, cells, lastToggled, regCell,
  } = props;

  const scrollRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  // wheel + mouse-drag over the sticky header row pan the board horizontally;
  // the viewport itself scrolls vertically (and natively in both axes for touch).
  const headsRef = useDragScroll<HTMLDivElement>([], scrollRef);

  // Optimistic per-card category overrides: a cross-column drop sets one so the
  // card shows under its new swimlane immediately; it's dropped once the reindex
  // confirms doc.category (avoids a flicker back during the write+reindex window).
  const [overrides, setOverrides] = useState<Map<string, string>>(() => new Map());
  const effectiveCat = useCallback(
    (d: RuleDoc): string => overrides.get(d.path) ?? d.category,
    [overrides]
  );
  const setOverride = useCallback((path: string, category: string | null): void => {
    setOverrides((prev) => {
      const next = new Map(prev);
      if (category == null) next.delete(path);
      else next.set(path, category);
      return next;
    });
  }, []);
  // reconcile: drop any override the reindexed doc now satisfies (or that vanished)
  useEffect(() => {
    setOverrides((prev) => {
      if (prev.size === 0) return prev;
      let changed = false;
      const next = new Map(prev);
      for (const [path, cat] of prev) {
        const d = docByPath.get(path);
        if (!d || d.category === cat) {
          next.delete(path);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [docByPath]);

  // categories actually present among the docs, ordered by global Category.order
  const presentCats = useMemo(() => {
    const seen: string[] = [];
    for (const d of docs) {
      const c = effectiveCat(d);
      if (!seen.includes(c)) seen.push(c);
    }
    return seen.sort(categoryComparator(categories));
  }, [docs, categories, effectiveCat]);

  // visible columns: the nook's saved list, or the present categories until seeded
  const cols = nook.kanbanColumns ?? presentCats;
  // seed the saved list once, on first kanban entry with docs present
  useEffect(() => {
    if (nook.kanbanColumns === undefined && presentCats.length > 0) {
      store.setNookKanbanColumns(nook.id, presentCats);
    }
  }, [nook.kanbanColumns, nook.id, presentCats, store]);

  // per-column ordered docs (within-column order honours the nook's sort mode)
  const columnDocs: KanbanColumnDocs[] = cols.map((key) => {
    const ds = docs.filter((d) => effectiveCat(d) === key);
    return {
      key,
      docs: sortDocs(ds, sortMode, key, {
        categories,
        customTypes,
        cardOrder,
        disabledBuiltinTypes: disabledBuiltins,
      }),
    };
  });
  const visibleDocs = columnDocs.flatMap((c) => c.docs);

  // live column snapshot for the drag hook (keys + ordered paths)
  const columnsRef = useRef<KanbanDragColumn[]>([]);
  columnsRef.current = columnDocs.map((c) => ({ key: c.key, paths: c.docs.map((d) => d.path) }));

  useKanbanPack({ appRef, scrollRef, layerRef, stripRef, cells, lastToggled }, open, query, spanOf, columnDocs);
  const { onCardDown } = useKanbanDrag({
    store, nookRef, columnsRef, cells, appRef, layerRef, scrollRef, setDragId: setCardDragId, setOverride,
    canMoveCategory: nook.kind !== "bases",
  });

  const addColumn = (name: string): void => {
    const n = name.trim();
    if (n === "" || cols.includes(n)) return;
    store.setNookKanbanColumns(nook.id, [...cols, n]);
  };
  const removeColumn = (name: string): void => {
    store.setNookKanbanColumns(nook.id, cols.filter((c) => c !== name));
  };

  // categories that could become a column: those present on notes plus the
  // global category list, minus the ones already shown (ordered by category order)
  const addableCats = [...new Set([...presentCats, ...categories.map((c) => c.name)])]
    .filter((c) => !cols.includes(c))
    .sort(categoryComparator(categories));

  // the persistent "+ Add column" menu: existing addable categories + a
  // "New category…" entry that creates a brand-new (empty) swimlane on the spot
  const openAddMenu = (e: MouseEvent): void => {
    const menu = new Menu();
    for (const name of addableCats) {
      menu.addItem((item) => item.setTitle(name).onClick(() => addColumn(name)));
    }
    if (addableCats.length > 0) menu.addSeparator();
    menu.addItem((item) =>
      item
        .setTitle("New category…")
        .setIcon("plus")
        .onClick(() =>
          new PromptModal(plugin.app, {
            title: "New column",
            placeholder: "Category name",
            cta: "Add column",
            onSubmit: (v) => addColumn(v),
          }).open()
        )
    );
    menu.showAtMouseEvent(e);
  };

  return (
    <div class="cr-kanban">
      <div class="cr-kbn-bar">
        <button class="cr-tbtn cr-kbn-addbtn" title="Add a category column" onClick={openAddMenu}>
          ＋ Add column
        </button>
      </div>

      <div class="cr-kbn-scroll" ref={scrollRef}>
        <div class="cr-kbn-strip" ref={stripRef}>
          <div class="cr-kbn-heads" ref={headsRef}>
            {columnDocs.map((c) => {
              const cat = categories.find((x) => x.name === c.key);
              const color = cat?.color;
              const hasColor = color != null && color !== "";
              return (
                <div
                  key={c.key}
                  class={"cr-kbn-head" + (hasColor ? " has-color" : "")}
                  style={{ width: "var(--kbn-col)", ...(hasColor ? { "--cc": color } : {}) }}
                >
                  {hasColor && <span class="cr-kbn-head__dot" />}
                  {cat && cat.icon !== "" && (
                    <span class="cr-kbn-head__ic">
                      <GlyphIcon iconSet={cat.iconSet} icon={cat.icon} />
                    </span>
                  )}
                  <span class="cr-kbn-head__name">{c.key}</span>
                  <span class="cr-kbn-head__count">{c.docs.length}</span>
                  <button
                    class="cr-kbn-head__rm"
                    title={"Hide the " + c.key + " column"}
                    aria-label={"Hide the " + c.key + " column"}
                    onClick={() => removeColumn(c.key)}
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>

          {cols.length === 0 ? (
            <div class="cr-kbn-empty">No columns shown — add a category column above.</div>
          ) : (
            <div class="cr-kbn-layer" ref={layerRef}>
              {visibleDocs.map((d) => (
                <div
                  class={
                    "cr-cell" +
                    (open.has(d.path) ? " is-open" : "") +
                    (focusId === d.path ? " is-focused" : "") +
                    (cardDragId === d.path ? " is-drag" : "")
                  }
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
                    onGripDown={!embed ? (e) => onCardDown(e, d.path) : undefined}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
