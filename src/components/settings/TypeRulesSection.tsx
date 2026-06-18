/* Carrel settings — type detection rules. Redirect notes to a target type by
   matching metadata-cache fields (a frontmatter key, a key/value pair, or a
   tag). Detection only — no custom rendering. Rules are evaluated in order
   between an explicit `type:` declaration and structural inference; the first
   enabled match wins. See rules/parse.matchTypeRule. */
import { useState } from "preact/hooks";
import type { JSX } from "preact";
import { Notice } from "obsidian";
import type CarrelPlugin from "../../main";
import type { CustomType, TypeRule, TypeRuleKind } from "../../types/data";
import { CONTENT_TYPES, FILTERABLE_TYPES, customTypeToken } from "../../rules/registry";
import { genId } from "../../util/id";

const KIND_LABELS: Record<TypeRuleKind, string> = {
  "frontmatter-key": "Has frontmatter key",
  "frontmatter-key-value": "Frontmatter key equals",
  tag: "Has tag",
};

interface TargetOption {
  value: string;
  label: string;
}

/** Selectable rule targets: enabled built-ins (disabled ones are excluded so a
 *  rule can't be created pointing at a suppressed type) + custom types. */
function targetOptions(customTypes: CustomType[], disabled: Set<string>): TargetOption[] {
  const builtins = FILTERABLE_TYPES.filter((t) => !disabled.has(t)).map((t) => ({
    value: t,
    label: CONTENT_TYPES[t].label,
  }));
  const custom = [...customTypes]
    .sort((a, b) => a.order - b.order)
    .map((t) => ({ value: customTypeToken(t), label: t.name }));
  return [...builtins, ...custom];
}

export function TypeRulesSection({ plugin }: { plugin: CarrelPlugin }): JSX.Element {
  const store = plugin.store;
  const data = store.data.value; // subscribe to store changes
  const rules = data.typeRules;
  const disabled = new Set<string>(data.disabledBuiltinTypes);
  const options = targetOptions(data.customTypes, disabled);

  const commit = (next: TypeRule[]): void => store.setTypeRules(next);
  const patch = (id: string, p: Partial<TypeRule>): void =>
    commit(rules.map((r) => (r.id === id ? { ...r, ...p } : r)));
  const remove = (id: string): void => commit(rules.filter((r) => r.id !== id));
  const add = (): void => {
    const first = options[0];
    if (first == null) {
      new Notice("Add a custom type (or enable a built-in) before creating a rule.");
      return;
    }
    commit([
      ...rules,
      { id: genId(), name: "", targetType: first.value, kind: "tag", key: "", enabled: true },
    ]);
  };

  return (
    <>
      <div class="ob-h">
        <h3 class="ob-h__t">Type detection rules</h3>
        <span class="ob-h__c">{rules.length}</span>
      </div>
      <p class="ob-h__desc">
        Auto-assign a type to notes that match a metadata rule. Rules are checked in order —
        the first enabled match wins — and an explicit <code>type:</code> front-matter always
        takes precedence. Rules read metadata only (frontmatter + tags), never the note body.
      </p>
      <div class="ob-rules">
        {rules.length === 0 && <div class="ob-rules__empty">No rules yet.</div>}
        {rules.map((r) => (
          <RuleRow
            key={r.id}
            rule={r}
            options={options}
            onPatch={(p) => patch(r.id, p)}
            onRemove={() => remove(r.id)}
          />
        ))}
      </div>
      <button class="ob-btn ob-btn--cta ob-addbtn" onClick={add}>
        + Add rule
      </button>
    </>
  );
}

function RuleRow({
  rule,
  options,
  onPatch,
  onRemove,
}: {
  rule: TypeRule;
  options: TargetOption[];
  onPatch: (p: Partial<TypeRule>) => void;
  onRemove: () => void;
}): JSX.Element {
  const targetMissing = !options.some((o) => o.value === rule.targetType);
  return (
    <div class={"ob-rule" + (rule.enabled ? "" : " is-off")}>
      <div class="ob-rule__top">
        <TextField
          value={rule.name}
          placeholder="Rule name"
          extraClass="ob-rule__name"
          onCommit={(name) => onPatch({ name })}
        />
        <button
          class={"ob-btn ob-toggle" + (rule.enabled ? " is-on" : "")}
          title={rule.enabled ? "Enabled — click to disable" : "Disabled — click to enable"}
          onClick={() => onPatch({ enabled: !rule.enabled })}
        >
          {rule.enabled ? "On" : "Off"}
        </button>
        <button class="ob-btn ob-rule__rm" title="Remove rule" onClick={onRemove}>
          ×
        </button>
      </div>
      <div class="ob-rule__body">
        <select
          class="ob-select"
          value={rule.kind}
          onChange={(e) => onPatch({ kind: (e.target as HTMLSelectElement).value as TypeRuleKind })}
        >
          {(Object.keys(KIND_LABELS) as TypeRuleKind[]).map((k) => (
            <option value={k} key={k}>
              {KIND_LABELS[k]}
            </option>
          ))}
        </select>
        <TextField
          value={rule.key}
          placeholder={rule.kind === "tag" ? "tag (no #)" : "frontmatter key"}
          onCommit={(key) => onPatch({ key })}
        />
        {rule.kind === "frontmatter-key-value" && (
          <TextField
            value={rule.value ?? ""}
            placeholder="value"
            onCommit={(value) => onPatch({ value })}
          />
        )}
        <span class="ob-rule__arrow">→</span>
        <select
          class="ob-select"
          value={rule.targetType}
          onChange={(e) => onPatch({ targetType: (e.target as HTMLSelectElement).value })}
        >
          {options.map((o) => (
            <option value={o.value} key={o.value}>
              {o.label}
            </option>
          ))}
          {targetMissing && (
            <option value={rule.targetType} key={rule.targetType}>
              {rule.targetType} (unavailable)
            </option>
          )}
        </select>
      </div>
    </div>
  );
}

/** A text input that keeps a local draft and commits on blur / Enter, so editing
 *  a rule field re-indexes once per edit rather than once per keystroke. */
function TextField({
  value,
  placeholder,
  extraClass,
  onCommit,
}: {
  value: string;
  placeholder: string;
  extraClass?: string;
  onCommit: (v: string) => void;
}): JSX.Element {
  const [draft, setDraft] = useState(value);
  return (
    <input
      class={"ob-input" + (extraClass != null ? " " + extraClass : "")}
      type="text"
      value={draft}
      placeholder={placeholder}
      spellcheck={false}
      onInput={(e) => setDraft((e.target as HTMLInputElement).value)}
      onBlur={() => {
        if (draft !== value) onCommit(draft);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
    />
  );
}
