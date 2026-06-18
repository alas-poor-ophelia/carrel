/* Carrel settings — manage two global lists of icon-entities:
   • Categories: colored, icon'd tags that classify notes (`category:` front-matter).
   • Types: the content type a note renders as (`type:` front-matter). The built-in
     types back the structured parsers (flowchart/table/quote/…); users add their
     own for a custom label/color/icon (no new parsing).
   Both lists share the EntityManager widget. Icons come from Obsidian's Lucide set,
   or the RPG Awesome set when the Wayfinder character-sheet plugin is installed. */
import { useMemo, useState } from "preact/hooks";
import type { JSX } from "preact";
import { Notice } from "obsidian";
import type CarrelPlugin from "../../main";
import type { ContentType } from "../../rules/model";
import { CONTENT_TYPES, FILTERABLE_TYPES, customTypeToken } from "../../rules/registry";
import { getWayfinder } from "../../util/plugins";
import { GlyphIcon } from "../common/GlyphIcon";
import { LucideGlyph, lucideIds } from "./CategoryIcon";
import { EntityManager, type IconEntity } from "./EntityManager";
import { NooksSection } from "./NooksSection";
import { TypeRulesSection } from "./TypeRulesSection";

/** Built-in types shown read-only for reference, in chip order + the neutral fallback. */
const BUILTIN_ORDER: (keyof typeof CONTENT_TYPES)[] = [...FILTERABLE_TYPES, "reference"];

export function SettingsApp({ plugin }: { plugin: CarrelPlugin }): JSX.Element {
  const store = plugin.store;
  const data = store.data.value; // subscribe to store changes
  const cats = data.categories;
  const customTypes = data.customTypes;
  const rpgAvailable = !!getWayfinder(plugin.app);

  const disabledSet = new Set<ContentType>(data.disabledBuiltinTypes);
  const toggleBuiltin = (t: ContentType): void => {
    if (t === "reference") return; // the terminal fallback can't be disabled
    const next = new Set(disabledSet);
    if (next.has(t)) {
      next.delete(t);
    } else {
      // A rule still targeting this type blocks disabling it — disabling stops
      // inference, but a rule would keep assigning it (refuse the half-state).
      if (data.typeRules.some((r) => r.targetType === t)) {
        new Notice(
          `Can't disable “${CONTENT_TYPES[t].label}” — a type rule targets it. ` +
            "Remove or retarget that rule first."
        );
        return;
      }
      next.add(t);
    }
    store.setDisabledBuiltinTypes([...next]);
  };

  const docs = plugin.index.docs.value;
  // note counts: categories by `category:` name, types by the parsed `type:` token
  const catCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of docs) m.set(d.category, (m.get(d.category) ?? 0) + 1);
    return m;
  }, [docs]);
  const typeCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of docs) m.set(d.type, (m.get(d.type) ?? 0) + 1);
    return m;
  }, [docs]);

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
      <EntityManager
        entities={cats}
        onCommit={(next: IconEntity[]) => store.setCategories(next)}
        countFor={(e) => catCounts.get(e.name) ?? 0}
        rpgAvailable={rpgAvailable}
        noun="category"
        namePlaceholder="e.g. Hex, Maneuver, Item…"
        removeNotice={(name, n) =>
          `Removed category “${name}”. ${n} note${n === 1 ? "" : "s"} keep their front-matter tag (now unstyled).`
        }
      />

      <div class="ob-h">
        <h3 class="ob-h__t">Types</h3>
        <span class="ob-h__c">{customTypes.length}</span>
      </div>
      <p class="ob-h__desc">
        A note's type sets its badge, accent and filter chip — declared with a front-matter field, e.g.{" "}
        <code>type: Bookmark</code>. The built-ins below back Carrel's structured parsers (tables, flowcharts,
        quotes…). Add your own for a custom label, color and icon; custom types don't add new parsing — the
        body still renders by its markdown structure.
      </p>
      <div class="ob-builtins">
        {BUILTIN_ORDER.map((t) => {
          const info = CONTENT_TYPES[t];
          const off = disabledSet.has(t);
          return (
            <div class={"ob-builtin" + (off ? " is-off" : "")} key={t} style={{ "--cc": info.color }}>
              <span class="ob-cat__chip">
                <GlyphIcon iconSet="rpg" icon={info.glyph} />
              </span>
              <span class="ob-builtin__name">{info.label}</span>
              <span class="ob-builtin__meta">
                {typeCounts.get(t) ?? 0} {(typeCounts.get(t) ?? 0) === 1 ? "note" : "notes"}
              </span>
              {t === "reference" ? (
                <span class="ob-cat__tag">built-in</span>
              ) : (
                <button
                  class={"ob-btn ob-toggle" + (off ? "" : " is-on")}
                  title={
                    off
                      ? "Auto-detection off — click to enable"
                      : "Auto-detection on — click to disable"
                  }
                  onClick={() => toggleBuiltin(t)}
                >
                  {off ? "Off" : "On"}
                </button>
              )}
            </div>
          );
        })}
      </div>
      <EntityManager
        entities={customTypes}
        onCommit={(next: IconEntity[]) => store.setCustomTypes(next)}
        countFor={(e) => typeCounts.get(customTypeToken(e)) ?? 0}
        rpgAvailable={rpgAvailable}
        noun="type"
        namePlaceholder="e.g. Bookmark, Recipe, Person…"
        removeNotice={(name, n) =>
          `Removed type “${name}”. ${n} note${n === 1 ? "" : "s"} keep their type: front-matter (now shown as plain references).`
        }
      />

      <TypeRulesSection plugin={plugin} />

      <div class="ob-h">
        <h3 class="ob-h__t">Front-matter mapping</h3>
      </div>
      <p class="ob-h__desc">
        Choose which front-matter property Carrel reads for each note's category and type. Defaults are{" "}
        <code>category</code> and <code>type</code> — point them elsewhere (e.g. read your <code>tags</code> list
        for the category) to fit your vault. If the property holds a list, Carrel uses the first value; anything
        it can't read falls through to the usual default.
      </p>
      <div class="ob-propmap">
        <PropField
          label="Category property"
          value={data.categoryProp}
          fallback="category"
          onCommit={(v) => store.setCategoryProp(v)}
        />
        <PropField
          label="Type property"
          value={data.typeProp}
          fallback="type"
          onCommit={(v) => store.setTypeProp(v)}
        />
      </div>

      <NooksSection plugin={plugin} />

      <div class="ob-h">
        <h3 class="ob-h__t">Icons</h3>
      </div>
      <p class="ob-h__desc">
        {rpgAvailable
          ? "The RPG Awesome glyph set is unlocked because the Wayfinder character-sheet plugin is installed."
          : "Install the Wayfinder character-sheet plugin to unlock the RPG Awesome glyph set in the icon picker."}
        <span class="ob-iconnote ob-iconnote--gap">
          <LucideGlyph id="lucide-info" />
          {lucideIds().length} Lucide icons available.
        </span>
      </p>
    </div>
  );
}

/** A single front-matter property name input. Keeps a local draft and commits
 *  on blur / Enter so a reindex fires once per edit rather than per keystroke;
 *  a blank entry reverts to the built-in default. */
function PropField({
  label,
  value,
  fallback,
  onCommit,
}: {
  label: string;
  value: string;
  fallback: string;
  onCommit: (v: string) => void;
}): JSX.Element {
  const [draft, setDraft] = useState(value);
  const commit = (): void => {
    const next = draft.trim() || fallback;
    setDraft(next);
    onCommit(next);
  };
  return (
    <div class="ob-field">
      <div class="ob-field__label">{label}</div>
      <input
        class="ob-input"
        type="text"
        value={draft}
        placeholder={fallback}
        spellcheck={false}
        onInput={(e) => setDraft((e.target as HTMLInputElement).value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
      />
    </div>
  );
}
