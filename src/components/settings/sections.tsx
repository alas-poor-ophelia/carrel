/* Carrel settings — the custom Preact sections mounted inside the declarative
   settings tab (src/settings.tsx). Each section is only the interactive widget:
   headings and descriptions live in the tab's setting definitions so Obsidian
   renders them natively (and indexes them for settings search).
   • CategoriesSection: the colored, icon'd category list (EntityManager).
   • TypesSection: built-in type detection toggles + custom types (EntityManager).
   Both lists share the EntityManager widget. Icons come from Obsidian's Lucide
   set, or the RPG Awesome set when the Wayfinder plugin is installed. */
import { useMemo } from "preact/hooks";
import type { JSX } from "preact";
import { Notice } from "obsidian";
import type CarrelPlugin from "../../main";
import type { ContentType } from "../../rules/model";
import { CONTENT_TYPES, FILTERABLE_TYPES, customTypeToken } from "../../rules/registry";
import { getWayfinder } from "../../util/plugins";
import { GlyphIcon } from "../common/GlyphIcon";
import { EntityManager, type IconEntity } from "./EntityManager";

/** Built-in types shown read-only for reference, in chip order + the neutral fallback. */
const BUILTIN_ORDER: (keyof typeof CONTENT_TYPES)[] = [...FILTERABLE_TYPES, "reference"];

export function CategoriesSection({ plugin }: { plugin: CarrelPlugin }): JSX.Element {
  const store = plugin.store;
  const cats = store.data.value.categories; // subscribe to store changes
  const docs = plugin.index.docs.value;
  // note counts by `category:` name
  const catCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of docs) m.set(d.category, (m.get(d.category) ?? 0) + 1);
    return m;
  }, [docs]);
  return (
    <EntityManager
      entities={cats}
      onCommit={(next: IconEntity[]) => store.setCategories(next)}
      countFor={(e) => catCounts.get(e.name) ?? 0}
      rpgAvailable={!!getWayfinder(plugin.app)}
      noun="category"
      namePlaceholder="e.g. Hex, Maneuver, Item…"
      removeNotice={(name, n) =>
        `Removed category “${name}”. ${n} note${n === 1 ? "" : "s"} keep their front-matter tag (now unstyled).`
      }
    />
  );
}

export function TypesSection({ plugin }: { plugin: CarrelPlugin }): JSX.Element {
  const store = plugin.store;
  const data = store.data.value; // subscribe to store changes
  const customTypes = data.customTypes;
  const docs = plugin.index.docs.value;

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

  // note counts by the parsed `type:` token
  const typeCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of docs) m.set(d.type, (m.get(d.type) ?? 0) + 1);
    return m;
  }, [docs]);

  return (
    <>
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
        rpgAvailable={!!getWayfinder(plugin.app)}
        noun="type"
        namePlaceholder="e.g. Bookmark, Recipe, Person…"
        removeNotice={(name, n) =>
          `Removed type “${name}”. ${n} note${n === 1 ? "" : "s"} keep their type: front-matter (now shown as plain references).`
        }
      />
    </>
  );
}
