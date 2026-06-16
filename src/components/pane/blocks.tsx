/* Shared building blocks — ported from MiniSheet's rules/blocks.tsx. Typed
   block renderers (hybrid: prose goes through Obsidian's MarkdownRenderer;
   everything else is bespoke), plus the small UI atoms (type badge, star, meta
   chips) and search-highlight helpers. */
import { MarkdownRenderer, MarkdownRenderChild } from "obsidian";
import { useEffect, useRef, useState } from "preact/hooks";
import type { ComponentChildren, JSX, VNode } from "preact";
import type CarrelPlugin from "../../main";
import type { CustomType } from "../../types/data";
import type { RuleBlock, RuleDoc } from "../../rules/model";
import { resolveType } from "../../rules/registry";
import { getRollEngine, type RollResult } from "../../rules/rollEngine";
import { getDiceRoller } from "../../util/plugins";
import { Icon } from "../common/Icon";
import { GlyphIcon } from "../common/GlyphIcon";
import { STAR_PATH } from "../common/glyphs";

/** Dispatched (bubbling) by ProseBlock once Obsidian's async markdown render
 *  finishes — the masonry listens so it can recompute a grown card's slot. */
export const RENDERED_EVENT = "cr-rendered";

/** First of the given values that is present and non-empty, falling through on
 *  empty strings exactly like a chain of `||` (used for label/ref fallbacks). */
function firstNonEmpty(...vals: (string | undefined)[]): string {
  for (const v of vals) if (v != null && v !== "") return v;
  return "";
}

/* ---------- search highlight ---------- */

/** Highlight the first case-insensitive substring of `q` in `text`. */
export function hl(text: string, q: string): ComponentChildren {
  if (!q) return text;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      <mark class="r-hl">{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}

/** Highlight a set of (possibly non-contiguous) character indices. */
export function hlFuzzy(text: string, positions: number[] | undefined): ComponentChildren {
  if (!positions || !positions.length) return text;
  const set = new Set(positions);
  const out: VNode[] = [];
  let buf = "";
  let on = false;
  const flush = (): void => {
    if (buf) {
      out.push(
        on ? (
          <mark class="r-hl" key={out.length}>
            {buf}
          </mark>
        ) : (
          <span key={out.length}>{buf}</span>
        )
      );
      buf = "";
    }
  };
  for (let i = 0; i < text.length; i++) {
    const m = set.has(i);
    if (m !== on) {
      flush();
      on = m;
    }
    buf += text[i];
  }
  flush();
  return <>{out}</>;
}

/* ---------- UI atoms ---------- */

export function TypeBadge({
  type,
  customTypes,
  mini = false,
}: {
  type: string;
  customTypes?: CustomType[];
  mini?: boolean;
}): JSX.Element {
  const t = resolveType(type, customTypes);
  return (
    <span class={"r-badge" + (mini ? " r-badge--mini" : "")} style={{ "--bc": t.color }}>
      {!mini && <GlyphIcon iconSet={t.iconSet} icon={t.icon} class="r-badge__ic" />}
      <span>{t.label}</span>
    </span>
  );
}

export function StarButton({ active, onToggle }: { active: boolean; onToggle: () => void }): JSX.Element {
  const [pop, setPop] = useState(false);
  return (
    <button
      class={"r-star" + (active ? " is-on" : "") + (pop ? " is-pop" : "")}
      title={active ? "Unpin" : "Pin"}
      onClick={(e) => {
        e.stopPropagation();
        setPop(true);
        setTimeout(() => setPop(false), 360);
        onToggle();
      }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" stroke-width="1.7" stroke-linejoin="round">
        <path d={STAR_PATH} />
      </svg>
    </button>
  );
}

export function MetaChips({ meta }: { meta: RuleDoc["meta"] }): JSX.Element | null {
  if (meta.length === 0) return null;
  return (
    <div class="r-meta">
      {meta.map((m, i) => (
        <span class="r-meta__chip" key={i}>
          {m.k}
        </span>
      ))}
    </div>
  );
}

/* ---------- typed blocks ---------- */

/** Prose paragraph — rendered through Obsidian's MarkdownRenderer so
 *  wikilinks, embeds and inline markdown resolve. The optional lead term is
 *  reconstructed into the markdown (`**term** — text`) and styled via CSS. */
function ProseBlock({ plugin, path, block }: { plugin: CarrelPlugin; path: string; block: Extract<RuleBlock, { t: "p" }> }): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const md = (block.term != null && block.term !== "" ? `**${block.term}** — ` : "") + block.text;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.empty();
    // A render child scopes the rendered markdown's lifecycle (embeds, etc.) to
    // this block: unloading it on cleanup avoids the leak of handing the
    // long-lived plugin to MarkdownRenderer.
    const child = new MarkdownRenderChild(el);
    child.load();
    // Markdown fills in asynchronously and grows the card after the masonry has
    // already measured it — notify the board so it can recompute the slot.
    void MarkdownRenderer.render(plugin.app, md, el, path, child).then(() => {
      el.dispatchEvent(new CustomEvent(RENDERED_EVENT, { bubbles: true }));
    });
    return () => child.unload();
  }, [md, path, plugin.app]);
  return <div class="r-prose" ref={ref} />;
}

function TableBlock({ block, q }: { block: Extract<RuleBlock, { t: "table" }>; q: string }): JSX.Element {
  return (
    <div class="r-table-wrap">
      {block.caption != null && block.caption !== "" && (
        <div class="r-table-cap">
          <Icon id="ra-scroll-unfurled" class="r-table-cap__ic" />
          {block.caption}
        </div>
      )}
      <table class="r-table">
        <thead>
          <tr>
            {block.cols.map((c, i) => (
              <th key={i}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => (
                <td key={ci}>{hl(String(cell), q)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StepsBlock({ block, q }: { block: Extract<RuleBlock, { t: "steps" }>; q: string }): JSX.Element {
  return (
    <ol class="r-steps">
      {block.items.map((it, i) => (
        <li class="r-steps__item" key={i}>
          <span class="r-steps__num">{i + 1}</span>
          <span class="r-steps__text">{hl(it.text, q)}</span>
        </li>
      ))}
    </ol>
  );
}

function BulletsBlock({ block, q }: { block: Extract<RuleBlock, { t: "bullets" }>; q: string }): JSX.Element {
  return (
    <ul class="r-bullets">
      {block.items.map((it, i) => (
        <li class="r-bullets__item" key={i}>
          {it.term != null && it.term !== "" && <span class="r-term">{hl(it.term, q)} </span>}
          {hl(it.text, q)}
        </li>
      ))}
    </ul>
  );
}

function CalloutBlock({ block, q }: { block: Extract<RuleBlock, { t: "callout" }>; q: string }): JSX.Element {
  return (
    <blockquote class="r-callout">
      <span class="r-callout__mark">“</span>
      <span class="r-callout__text">{hl(block.text, q)}</span>
      {block.cite != null && block.cite !== "" && <cite class="r-callout__cite">— {block.cite}</cite>}
    </blockquote>
  );
}

function FlowBlock({ block, q }: { block: Extract<RuleBlock, { t: "flow" }>; q: string }): JSX.Element {
  return (
    <div class="r-flow">
      {block.nodes.map((n, i) => {
        if (n.kind === "branch") {
          return (
            <div class="r-flow__fork" key={i}>
              {n.branches.map((br, bi) => (
                <div class={"r-flow__leaf is-" + br.tone} key={bi}>
                  <span class="r-flow__leaf-label">{br.label}</span>
                  <span class="r-flow__leaf-text">{hl(br.text, q)}</span>
                </div>
              ))}
            </div>
          );
        }
        if (n.kind === "options") {
          return (
            <div class="r-flow__opts" key={i}>
              {n.items.map((it, ii) => (
                <span class="r-flow__opt" key={ii}>
                  {hl(it, q)}
                </span>
              ))}
            </div>
          );
        }
        return (
          <div class={"r-flow__node is-" + n.kind} key={i}>
            <span class="r-flow__dot" />
            <span class="r-flow__text">{hl(n.text, q)}</span>
          </div>
        );
      })}
    </div>
  );
}

function DiceBlock({
  block,
  q,
  plugin,
}: {
  block: Extract<RuleBlock, { t: "dice" }>;
  q: string;
  plugin: CarrelPlugin;
}): JSX.Element {
  const [roll, setRoll] = useState<RollResult | null>(null);
  const [spin, setSpin] = useState(false);
  const doRoll = async (): Promise<void> => {
    setSpin(true);
    setTimeout(() => setSpin(false), 360);
    const result = await getRollEngine(plugin.app).roll(block.expr, block.mod ?? 0);
    setRoll(result);
  };
  return (
    <div class="r-dice">
      <div class="r-dice__main">
        <div class="r-dice__expr">
          <span class="r-dice__notation">{hl(block.expr, q)}</span>
          {block.label != null && block.label !== "" && <span class="r-dice__label">{hl(block.label, q)}</span>}
        </div>
        <button class={"r-dice__roll" + (spin ? " is-spin" : "")} onClick={doRoll}>
          <Icon id="ra-perspective-dice-five" class="r-dice__roll-ic" />
          <span>Roll</span>
        </button>
      </div>
      {roll && (
        <div class={"r-dice__out" + (spin ? " is-spin" : "")} title={roll.text}>
          {roll.dice.length > 0 && (
            <>
              <span class="r-dice__dice">
                {roll.dice.map((d, i) => (
                  <span class="r-dice__die" key={i}>
                    {d}
                  </span>
                ))}
                {roll.mod ? (
                  <span class="r-dice__mod">{roll.mod > 0 ? "+" + roll.mod : roll.mod}</span>
                ) : null}
              </span>
              <span class="r-dice__eq">=</span>
            </>
          )}
          <span class="r-dice__total">{roll.total}</span>
        </div>
      )}
    </div>
  );
}

/** Pull the rolled number(s) out of a Dice Roller tooltip like
 *  `[[Tbl^id]] 1d6 --> [3]` (nested rolls show several `--> [n]`; we surface
 *  the first, i.e. the top-level table roll). */
function rollNumber(tooltip?: string): string {
  const m = (tooltip ?? "").match(/-->\s*\[([^\]]+)\]/);
  return m ? m[1] : "";
}

/** True if a lookup-table range spec (`1-3`, `6`, `13,14`) contains `n`. */
function rangeContains(spec: string, n: number): boolean {
  return String(spec)
    .split(",")
    .some((part) => {
      const r = part.trim().match(/^(\d+)\s*-\s*(\d+)$/);
      if (r) return n >= +r[1] && n <= +r[2];
      const s = part.trim().match(/^(\d+)$/);
      return s ? +s[1] === n : false;
    });
}

/** Friendly label for a nested reference: `[[Rare Loot^rare]]` -> "Rare Loot"
 *  (prefers an alias, else strips the block anchor); a bare expr stays as-is. */
function refLabel(inner: string): string {
  const link = inner.match(/\[\[([^\]]+)\]\]/);
  if (!link) return inner.trim();
  let t = link[1];
  const pipe = t.indexOf("|");
  if (pipe >= 0) t = t.slice(pipe + 1);
  else {
    const caret = t.indexOf("^");
    if (caret >= 0) t = t.slice(0, caret);
  }
  return t.trim();
}

/** A lookup-table cell. Cells holding a nested `dice:` reference (e.g.
 *  `` `dice: [[Rare Loot^rare]]` ``) render as a marked reference chip instead
 *  of raw markdown; everything else is plain highlighted text. */
function lookupCell(cell: string, q: string): ComponentChildren {
  const m = cell.match(/dice:\s*([^`]+)/i);
  if (m) {
    return (
      <span class="r-lookup__ref" title={cell.trim()}>
        <Icon id="ra-perspective-dice-five" class="r-lookup__refic" />
        <span>{refLabel(m[1].trim())}</span>
      </span>
    );
  }
  return hl(String(cell), q);
}

/** Lookup / nested random tables referenced by link (`[[Encounters^wild]]`).
 *  Rolls via Dice Roller (range matching + nested recursion come for free) and
 *  shows the result value plus the rolled number subtly. The ref is resolved
 *  against the host note path. Lights up only when Dice Roller is installed. */
function RollTableBlock({
  block,
  plugin,
  path,
}: {
  block: Extract<RuleBlock, { t: "rolltable" }>;
  plugin: CarrelPlugin;
  path: string;
}): JSX.Element {
  const dr = getDiceRoller(plugin.app);
  const [res, setRes] = useState<{ value: string; num: string; tip: string } | null>(null);
  const [spin, setSpin] = useState(false);
  const doRoll = async (): Promise<void> => {
    if (!dr || !block.ref) return;
    setSpin(true);
    setTimeout(() => setSpin(false), 360);
    try {
      const roller = await dr.getRoller(block.ref, path);
      const value = await roller.roll();
      const tip = roller.getTooltip?.() ?? "";
      setRes({ value: String(value), num: rollNumber(tip), tip });
    } catch {
      setRes({ value: "—", num: "", tip: "" });
    }
  };
  return (
    <div class="r-rolltable">
      <div class="r-rolltable__bar">
        <span class="r-rolltable__label">{firstNonEmpty(block.label, block.ref, "roll table")}</span>
        {dr ? (
          <button class={"r-rolltable__roll" + (spin ? " is-spin" : "")} onClick={doRoll}>
            <Icon id="ra-perspective-dice-five" class="r-rolltable__ic" />
            <span>Roll</span>
          </button>
        ) : (
          <span class="r-rolltable__hint">Install Dice Roller to roll</span>
        )}
      </div>
      {res && (
        <div class={"r-rolltable__out" + (spin ? " is-spin" : "")} title={res.tip}>
          {res.num && <span class="r-rolltable__num">{res.num}</span>}
          <span class="r-rolltable__val">{res.value}</span>
        </div>
      )}
    </div>
  );
}

/** A note that IS a Dice Roller lookup table (first header cell is a `dice:`
 *  formula). Renders the table and a Roll button; rolling uses the active roll
 *  engine for the formula, range-matches the rows ourselves, and renders the
 *  winning cell through MarkdownRenderer so a nested `dice:` cell auto-rolls. */
function LookupTableBlock({
  block,
  plugin,
  path,
  q,
}: {
  block: Extract<RuleBlock, { t: "lookuptable" }>;
  plugin: CarrelPlugin;
  path: string;
  q: string;
}): JSX.Element {
  const resRef = useRef<HTMLDivElement>(null);
  const [hit, setHit] = useState<{ num: number; cell: string } | null>(null);
  const [spin, setSpin] = useState(false);
  const doRoll = async (): Promise<void> => {
    setSpin(true);
    setTimeout(() => setSpin(false), 360);
    const n = (await getRollEngine(plugin.app).roll(block.formula)).total;
    const row = block.rows.find((r) => rangeContains(r[0] ?? "", n));
    setHit({ num: n, cell: row ? (row[1] ?? row[0] ?? "—") : "—" });
  };
  useEffect(() => {
    const el = resRef.current;
    if (!el || !hit) return;
    el.empty();
    const child = new MarkdownRenderChild(el);
    child.load();
    void MarkdownRenderer.render(plugin.app, hit.cell, el, path, child).then(() => {
      el.dispatchEvent(new CustomEvent(RENDERED_EVENT, { bubbles: true }));
    });
    return () => child.unload();
  }, [hit, path, plugin.app]);
  return (
    <div class="r-lookup">
      <div class="r-lookup__bar">
        {block.caption != null && block.caption !== "" && <span class="r-lookup__cap">{block.caption}</span>}
        <span class="r-lookup__formula">{block.formula}</span>
        <button class={"r-lookup__roll" + (spin ? " is-spin" : "")} onClick={doRoll}>
          <Icon id="ra-perspective-dice-five" class="r-lookup__ic" />
          <span>Roll</span>
        </button>
      </div>
      <table class="r-table r-lookup__table">
        <thead>
          <tr>
            {block.cols.map((c, i) => (
              <th key={i}>{hl(c, q)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row, ri) => (
            <tr key={ri} class={hit && rangeContains(row[0] ?? "", hit.num) ? "is-hit" : ""}>
              {row.map((cell, ci) => (
                <td key={ci}>{lookupCell(String(cell), q)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {hit && (
        <div class={"r-lookup__out" + (spin ? " is-spin" : "")}>
          <span class="r-lookup__num">{hit.num}</span>
          <span class="r-lookup__arrow">→</span>
          <span class="r-lookup__val" ref={resRef} />
        </div>
      )}
    </div>
  );
}

const CHECK_PATH = "M5 12.5l4.5 4.5L19 7";

/** Tickable checklist — completion persists per-nook via the parent. */
function ChecklistBlock({
  block,
  blockKey,
  state,
  onToggle,
}: {
  block: Extract<RuleBlock, { t: "checklist" }>;
  blockKey: string;
  state: Record<string, boolean>;
  onToggle: (key: string, value: boolean) => void;
}): JSX.Element {
  const done = block.items.filter((_, i) => state[`${blockKey}#${i}`]).length;
  const pct = block.items.length ? Math.round((done / block.items.length) * 100) : 0;
  return (
    <div class="r-check">
      <div class="r-check__bar">
        <span class="r-check__fill" style={{ width: pct + "%" }} />
      </div>
      <ul class="r-check__list">
        {block.items.map((it, i) => {
          const key = `${blockKey}#${i}`;
          const on = !!state[key];
          return (
            <li
              key={i}
              class={"r-check__item" + (on ? " is-done" : "")}
              onClick={() => onToggle(key, !on)}
            >
              <span class="r-check__box">
                {on && (
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round">
                    <path d={CHECK_PATH} />
                  </svg>
                )}
              </span>
              <span class="r-check__text">{it.text}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ---------- block dispatcher ---------- */

export function Blocks({
  plugin,
  doc,
  q,
  checklistState,
  onToggleCheck,
}: {
  plugin: CarrelPlugin;
  doc: RuleDoc;
  q: string;
  checklistState: Record<string, boolean>;
  onToggleCheck: (key: string, value: boolean) => void;
}): JSX.Element {
  return (
    <div class="r-blocks">
      {doc.blocks.map((b, i) => {
        switch (b.t) {
          case "p":
            return <ProseBlock plugin={plugin} path={doc.path} block={b} key={i} />;
          case "table":
            return <TableBlock block={b} q={q} key={i} />;
          case "steps":
            return <StepsBlock block={b} q={q} key={i} />;
          case "bullets":
            return <BulletsBlock block={b} q={q} key={i} />;
          case "callout":
            return <CalloutBlock block={b} q={q} key={i} />;
          case "flow":
            return <FlowBlock block={b} q={q} key={i} />;
          case "dice":
            return <DiceBlock block={b} q={q} plugin={plugin} key={i} />;
          case "rolltable":
            return <RollTableBlock block={b} plugin={plugin} path={doc.path} key={i} />;
          case "lookuptable":
            return <LookupTableBlock block={b} plugin={plugin} path={doc.path} q={q} key={i} />;
          case "checklist":
            return (
              <ChecklistBlock
                block={b}
                blockKey={`${doc.path}#${i}`}
                state={checklistState}
                onToggle={onToggleCheck}
                key={i}
              />
            );
          default:
            return null;
        }
      })}
    </div>
  );
}
