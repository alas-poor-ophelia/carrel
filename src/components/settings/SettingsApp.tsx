/* Carrel settings — manage global categories: the colored, icon'd tags that
   classify notes (declared per-note via `category:` front-matter). Create /
   edit / delete / reorder; each declares a color and an icon from Obsidian's
   Lucide set, or the RPG Awesome set when the MiniSheet character-sheet plugin
   is installed. Ported from the design handoff's SettingsApp. */
import { Notice } from "obsidian";
import { useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import type CarrelPlugin from "../../main";
import type { Category } from "../../types/data";
import { getPlugin } from "../../util/plugins";
import { CategoryIcon, LucideGlyph, iconDisplayName, lucideIds, rpgIds } from "./CategoryIcon";
import { NooksSection } from "./NooksSection";

const PALETTE = [
  "#cf9b54", "#d8893f", "#cd6a5a", "#c0594c", "#c66b8e", "#b07cc6",
  "#8a7bd8", "#6f86d6", "#5aa6b0", "#5fa98c", "#7aa86a", "#9a9099",
];

const GRID_CAP = 150;

function genId(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  return c && typeof c.randomUUID === "function" ? "c" + c.randomUUID().slice(0, 7) : "c" + Math.floor(Math.random() * 1e9).toString(36);
}

interface Draft {
  id: string;
  name: string;
  color: string;
  iconSet: "lucide" | "rpg";
  icon: string;
}

function Editor({
  draft,
  isNew,
  rpgAvailable,
  onChange,
  onSave,
  onCancel,
}: {
  draft: Draft;
  isNew: boolean;
  rpgAvailable: boolean;
  onChange: (fn: (d: Draft) => Draft) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const [tab, setTab] = useState<"lucide" | "rpg">(draft.iconSet);
  const [q, setQ] = useState("");
  const allIds = useMemo(() => (tab === "rpg" ? rpgIds() : lucideIds()), [tab]);
  const matches = useMemo(() => {
    const ql = q.toLowerCase();
    const filtered = ql ? allIds.filter((n) => iconDisplayName(n).includes(ql)) : allIds;
    return filtered.slice(0, GRID_CAP);
  }, [allIds, q]);
  // functional merge so batched edits (icon + color in one frame) accumulate
  const set = (patch: Partial<Draft>) => onChange((d) => ({ ...d, ...patch }));
  const valid = draft.name.trim().length > 0;

  return (
    <div class="ob-editor">
      <div class="ob-ed__title">{isNew ? "New category" : "Edit category"}</div>
      <div class="ob-ed__row">
        <div class="ob-ed__col ob-ed__col--left">
          <div class="ob-field">
            <div class="ob-field__label">Name</div>
            <input
              class="ob-input"
              type="text"
              value={draft.name}
              placeholder="e.g. Hex, Maneuver, Item…"
              onInput={(e) => set({ name: (e.target as HTMLInputElement).value })}
            />
          </div>
          <div class="ob-field">
            <div class="ob-field__label">Color</div>
            <div class="ob-swatches">
              {PALETTE.map((c) => (
                <button
                  key={c}
                  class={"ob-swatch" + (draft.color.toLowerCase() === c.toLowerCase() ? " is-on" : "")}
                  style={{ background: c }}
                  title={c}
                  onClick={() => set({ color: c })}
                />
              ))}
              <label class="ob-swatch ob-swatch--custom" title="Custom color">
                <input type="color" value={draft.color} onInput={(e) => set({ color: (e.target as HTMLInputElement).value })} />
              </label>
            </div>
          </div>
          <div class="ob-field ob-preview">
            <div class="ob-field__label">Preview</div>
            <div class="ob-preview__box" style={{ "--cc": draft.color }}>
              <span class="ob-preview__chip">
                <CategoryIcon iconSet={draft.iconSet} icon={draft.icon} />
              </span>
              <div>
                <div class="ob-preview__name">{draft.name.trim() || "Untitled"}</div>
                <span class="ob-preview__tag">
                  <CategoryIcon iconSet={draft.iconSet} icon={draft.icon} />
                  {draft.name.trim() || "Tag"}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div class="ob-ed__col ob-ed__col--right">
          <div class="ob-field__label">Icon</div>
          <div class="ob-iconsrc" role="tablist">
            <button class={tab === "lucide" ? "is-on" : ""} onClick={() => setTab("lucide")}>
              Lucide
            </button>
            <button
              class={tab === "rpg" ? "is-on" : ""}
              disabled={!rpgAvailable}
              onClick={() => rpgAvailable && setTab("rpg")}
              title={rpgAvailable ? "" : "Requires the MiniSheet character-sheet plugin"}
            >
              {!rpgAvailable && <span class="ob-iconsrc__lock">🔒</span>}RPG Awesome
            </button>
          </div>
          <p class="ob-iconnote">
            {tab === "rpg"
              ? "Provided by the MiniSheet character-sheet plugin."
              : "Obsidian's built-in icon set — always available."}
          </p>
          <div class="ob-iconsearch">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="6.5" />
              <path d="M20 20l-3.6-3.6" />
            </svg>
            <input
              type="text"
              value={q}
              placeholder={"Search " + (tab === "rpg" ? rpgIds().length : lucideIds().length) + " icons…"}
              onInput={(e) => setQ((e.target as HTMLInputElement).value)}
            />
          </div>
          <div class="ob-icongrid" style={{ "--cc": draft.color }}>
            {matches.length === 0 && <div class="ob-iconempty">No icons match “{q}”.</div>}
            {matches.map((n) => (
              <button
                key={n}
                class={"ob-iconbtn" + (draft.icon === n && draft.iconSet === tab ? " is-on" : "")}
                title={iconDisplayName(n)}
                onClick={() => set({ icon: n, iconSet: tab })}
              >
                <CategoryIcon iconSet={tab} icon={n} />
              </button>
            ))}
          </div>
        </div>
      </div>

      <div class="ob-ed__actions">
        <div class="ob-spacer" />
        <button class="ob-btn ob-btn--ghost" onClick={onCancel}>
          Cancel
        </button>
        <button class="ob-btn ob-btn--cta" disabled={!valid} onClick={onSave}>
          {isNew ? "Add category" : "Save changes"}
        </button>
      </div>
    </div>
  );
}

export function SettingsApp({ plugin }: { plugin: CarrelPlugin }) {
  const store = plugin.store;
  const cats = store.data.value.categories;
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const rpgAvailable = !!getPlugin(plugin.app, "minisheet");

  const rows = useRef(new Map<string, HTMLElement>());
  const prev = useRef(new Map<string, DOMRect>());
  const dragRef = useRef<{ id: string; el: HTMLElement; dy: number; w: number; h: number } | null>(null);
  const catsRef = useRef(cats);
  catsRef.current = cats;

  // note counts per category (from the active nook's index)
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of plugin.index.docs.value) m.set(d.category, (m.get(d.category) ?? 0) + 1);
    return m;
  }, [plugin.index.docs.value]);

  const commit = (next: Category[]) => store.setCategories(next.map((c, i) => ({ ...c, order: i })));

  const startNew = () => {
    setDraft({ id: genId(), name: "", color: PALETTE[0], iconSet: "lucide", icon: "lucide-book" });
    setEditing("new");
  };
  const startEdit = (cat: Category) => {
    setDraft({ id: cat.id, name: cat.name, color: cat.color, iconSet: cat.iconSet, icon: cat.icon });
    setEditing(cat.id);
  };
  const cancel = () => {
    setEditing(null);
    setDraft(null);
  };
  const save = () => {
    if (!draft) return;
    const entry: Category = { id: draft.id, name: draft.name.trim(), color: draft.color, iconSet: draft.iconSet, icon: draft.icon, order: 0 };
    if (editing === "new") commit([...cats, entry]);
    else commit(cats.map((c) => (c.id === editing ? entry : c)));
    cancel();
  };
  const remove = (id: string) => {
    const cat = cats.find((c) => c.id === id);
    if (editing === id) cancel();
    commit(cats.filter((c) => c.id !== id));
    // warn + keep: notes keep their `category:` front-matter; only the styling
    // registry entry is removed. Surface how many notes referenced it.
    const n = cat ? counts.get(cat.name) ?? 0 : 0;
    new Notice(`Removed category “${cat?.name ?? id}”. ${n} note${n === 1 ? "" : "s"} keep their front-matter tag (now unstyled).`);
  };

  /* row reorder FLIP */
  const regRow = (id: string) => (el: HTMLElement | null) => {
    if (el) rows.current.set(id, el);
    else rows.current.delete(id);
  };
  useLayoutEffect(() => {
    rows.current.forEach((el, id) => {
      const nr = el.getBoundingClientRect();
      const old = prev.current.get(id);
      if (old && id !== dragId) {
        const dy = old.top - nr.top;
        if (Math.abs(dy) > 0.5) {
          el.style.transition = "none";
          el.style.transform = `translateY(${dy}px)`;
          requestAnimationFrame(() => {
            el.style.transition = "transform .22s cubic-bezier(.3,.8,.35,1)";
            el.style.transform = "";
          });
        }
      }
    });
    const m = new Map<string, DOMRect>();
    rows.current.forEach((el, id) => m.set(id, el.getBoundingClientRect()));
    prev.current = m;
  });

  const onGripMove = useRef((e: PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const parentLeft = d.el.parentElement?.getBoundingClientRect().left ?? 0;
    Object.assign(d.el.style, { position: "fixed", left: parentLeft + "px", top: e.clientY - d.dy + "px", width: d.w + "px", zIndex: "40", pointerEvents: "none" });
    let nearest: { id: string; cy: number } | null = null;
    let nd = Infinity;
    rows.current.forEach((el, id) => {
      if (id === d.id) return;
      const rr = el.getBoundingClientRect();
      const cy = rr.top + rr.height / 2;
      const dist = Math.abs(cy - e.clientY);
      if (dist < nd) {
        nd = dist;
        nearest = { id, cy };
      }
    });
    if (nearest) {
      const near = nearest as { id: string; cy: number };
      const cur = catsRef.current;
      const order = cur.filter((c) => c.id !== d.id);
      const ni = order.findIndex((c) => c.id === near.id);
      const moving = cur.find((c) => c.id === d.id);
      if (moving) {
        order.splice(e.clientY > near.cy ? ni + 1 : ni, 0, moving);
        if (order.map((c) => c.id).join() !== cur.map((c) => c.id).join()) commit(order);
      }
    }
  }).current;

  const onGripUp = useRef(() => {
    const d = dragRef.current;
    if (d) Object.assign(d.el.style, { position: "", left: "", top: "", width: "", zIndex: "", pointerEvents: "", transform: "", transition: "" });
    dragRef.current = null;
    setDragId(null);
    window.removeEventListener("pointermove", onGripMove);
    window.removeEventListener("pointerup", onGripUp);
  }).current;

  const onGripDown = (e: PointerEvent, id: string) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const el = (e.currentTarget as HTMLElement).closest(".ob-cat") as HTMLElement | null;
    if (!el) return;
    const r = el.getBoundingClientRect();
    dragRef.current = { id, el, dy: e.clientY - r.top, w: r.width, h: r.height };
    setDragId(id);
    window.addEventListener("pointermove", onGripMove);
    window.addEventListener("pointerup", onGripUp);
  };

  return (
    <div class="ob">
      <div class="ob-h">
        <h3 class="ob-h__t">Categories</h3>
        <span class="ob-h__c">{cats.length}</span>
      </div>
      <p class="ob-h__desc">
        Categories are the colored tags that classify each note — every note declares one with a
        front-matter field, e.g. <code>category: Deed</code>. Give each a color and an icon; they drive the
        tinting, badges and filter chips throughout the references pane.
      </p>

      <div class="ob-cats">
        {cats.map((cat) => (
          <div class="ob-catwrap" key={cat.id}>
            <div class={"ob-cat" + (dragId === cat.id ? " is-drag" : "")} style={{ "--cc": cat.color }} ref={regRow(cat.id)}>
              <span class="ob-cat__grip" title="Drag to reorder" onPointerDown={(e) => onGripDown(e, cat.id)}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                  <circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" />
                  <circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" />
                  <circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" />
                </svg>
              </span>
              <span class="ob-cat__chip">
                <CategoryIcon iconSet={cat.iconSet} icon={cat.icon} />
              </span>
              <div class="ob-cat__main">
                <div class="ob-cat__name">
                  {cat.name}
                  {cat.iconSet === "rpg" && <span class="ob-cat__tag">RPG</span>}
                </div>
                <div class="ob-cat__meta">
                  {counts.get(cat.name) ?? 0} {(counts.get(cat.name) ?? 0) === 1 ? "note" : "notes"} ·{" "}
                  {cat.iconSet === "rpg" ? "RPG Awesome" : "Lucide"} · {iconDisplayName(cat.icon)}
                </div>
              </div>
              <div class="ob-cat__btns">
                <button class="ob-btn" onClick={() => startEdit(cat)}>
                  Edit
                </button>
                <button class="ob-btn ob-btn--icon ob-btn--danger" title="Delete category" onClick={() => remove(cat.id)}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M5 7h14M9 7V5h6v2M10 11v6M14 11v6M6 7l1 13h10l1-13" />
                  </svg>
                </button>
              </div>
            </div>
            {editing === cat.id && draft && (
              <Editor draft={draft} isNew={false} rpgAvailable={rpgAvailable} onChange={(fn) => setDraft((d) => (d ? fn(d) : d))} onSave={save} onCancel={cancel} />
            )}
          </div>
        ))}
      </div>

      {editing === "new" && draft && (
        <Editor draft={draft} isNew={true} rpgAvailable={rpgAvailable} onChange={(fn) => setDraft((d) => (d ? fn(d) : d))} onSave={save} onCancel={cancel} />
      )}

      {editing !== "new" && (
        <button class="ob-btn ob-btn--cta ob-addbtn" onClick={startNew}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Add category
        </button>
      )}

      <NooksSection plugin={plugin} />

      <div class="ob-h">
        <h3 class="ob-h__t">Icons</h3>
      </div>
      <p class="ob-h__desc">
        {rpgAvailable
          ? "The RPG Awesome glyph set is unlocked because the MiniSheet character-sheet plugin is installed."
          : "Install the MiniSheet character-sheet plugin to unlock the RPG Awesome glyph set in the icon picker."}
        <span class="ob-iconnote" style={{ marginTop: "6px" }}>
          <LucideGlyph id="lucide-info" />
          {lucideIds().length} Lucide icons available.
        </span>
      </p>
    </div>
  );
}
