/* Carrel settings — manage two global lists of icon-entities:
   • Categories: colored, icon'd tags that classify notes (`category:` front-matter).
   • Types: the content type a note renders as (`type:` front-matter). The built-in
     types back the structured parsers (flowchart/table/quote/…); users add their
     own for a custom label/color/icon (no new parsing).
   Both lists share the EntityManager widget. Icons come from Obsidian's Lucide set,
   or the RPG Awesome set when the Wayfinder character-sheet plugin is installed. */
import { useMemo } from "preact/hooks";
import type CarrelPlugin from "../../main";
import type { Category, CustomType } from "../../types/data";
import { CONTENT_TYPES, FILTERABLE_TYPES, customTypeToken } from "../../rules/registry";
import { getWayfinder } from "../../util/plugins";
import { GlyphIcon } from "../common/GlyphIcon";
import { LucideGlyph, lucideIds } from "./CategoryIcon";
import { EntityManager, type IconEntity } from "./EntityManager";
import { NooksSection } from "./NooksSection";

/** Built-in types shown read-only for reference, in chip order + the neutral fallback. */
const BUILTIN_ORDER: (keyof typeof CONTENT_TYPES)[] = [...FILTERABLE_TYPES, "reference"];

export function SettingsApp({ plugin }: { plugin: CarrelPlugin }) {
  const store = plugin.store;
  const data = store.data.value; // subscribe to store changes
  const cats = data.categories;
  const customTypes = data.customTypes;
  const rpgAvailable = !!getWayfinder(plugin.app);

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
        onCommit={(next: IconEntity[]) => store.setCategories(next as Category[])}
        countFor={(e) => catCounts.get(e.name) ?? 0}
        rpgAvailable={rpgAvailable}
        noun="category"
        namePlaceholder="e.g. Hex, Maneuver, Item…"
        removeNotice={(e, n) =>
          `Removed category “${e.name}”. ${n} note${n === 1 ? "" : "s"} keep their front-matter tag (now unstyled).`
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
          return (
            <div class="ob-builtin" key={t} style={{ "--cc": info.color }}>
              <span class="ob-cat__chip">
                <GlyphIcon iconSet="rpg" icon={info.glyph} />
              </span>
              <span class="ob-builtin__name">{info.label}</span>
              <span class="ob-builtin__meta">
                {typeCounts.get(t) ?? 0} {(typeCounts.get(t) ?? 0) === 1 ? "note" : "notes"}
              </span>
              <span class="ob-cat__tag">built-in</span>
            </div>
          );
        })}
      </div>
      <EntityManager
        entities={customTypes}
        onCommit={(next: IconEntity[]) => store.setCustomTypes(next as CustomType[])}
        countFor={(e) => typeCounts.get(customTypeToken(e)) ?? 0}
        rpgAvailable={rpgAvailable}
        noun="type"
        namePlaceholder="e.g. Bookmark, Recipe, Person…"
        removeNotice={(e, n) =>
          `Removed type “${e.name}”. ${n} note${n === 1 ? "" : "s"} keep their type: front-matter (now shown as plain references).`
        }
      />

      <NooksSection plugin={plugin} />

      <div class="ob-h">
        <h3 class="ob-h__t">Icons</h3>
      </div>
      <p class="ob-h__desc">
        {rpgAvailable
          ? "The RPG Awesome glyph set is unlocked because the Wayfinder character-sheet plugin is installed."
          : "Install the Wayfinder character-sheet plugin to unlock the RPG Awesome glyph set in the icon picker."}
        <span class="ob-iconnote" style={{ marginTop: "6px" }}>
          <LucideGlyph id="lucide-info" />
          {lucideIds().length} Lucide icons available.
        </span>
      </p>
    </div>
  );
}
