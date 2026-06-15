/* Shared building blocks — ported from MiniSheet's rules/blocks.tsx. Typed
   block renderers (hybrid: prose goes through Obsidian's MarkdownRenderer;
   everything else is bespoke), plus the small UI atoms (type badge, star, meta
   chips) and search-highlight helpers. */
import { MarkdownRenderer } from "obsidian";
import { useEffect, useRef, useState } from "preact/hooks";
import type { ComponentChildren, VNode } from "preact";
import type CarrelPlugin from "../../main";
import type { RuleBlock, RuleDoc } from "../../rules/model";
import { CONTENT_TYPES } from "../../rules/registry";
import { refIconId } from "../../rules/icons";
import { Icon } from "../common/Icon";

/** Dispatched (bubbling) by ProseBlock once Obsidian's async markdown render
 *  finishes — the masonry listens so it can recompute a grown card's slot. */
export const RENDERED_EVENT = "cr-rendered";

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
  const flush = () => {
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

export function TypeBadge({ type, mini = false }: { type: RuleDoc["type"]; mini?: boolean }) {
  const t = CONTENT_TYPES[type];
  if (!t) return null;
  return (
    <span class={"r-badge" + (mini ? " r-badge--mini" : "")} style={{ "--bc": t.color }}>
      {!mini && <Icon id={refIconId(t.glyph)} class="r-badge__ic" />}
      <span>{t.label}</span>
    </span>
  );
}

const STAR_PATH =
  "M12 3.5l2.6 5.3 5.9.86-4.25 4.14 1 5.86L12 17.9l-5.25 2.76 1-5.86L3.5 9.66l5.9-.86z";

export function StarButton({ active, onToggle }: { active: boolean; onToggle: () => void }) {
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

export function MetaChips({ meta }: { meta: RuleDoc["meta"] }) {
  if (!meta || !meta.length) return null;
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
function ProseBlock({ plugin, path, block }: { plugin: CarrelPlugin; path: string; block: Extract<RuleBlock, { t: "p" }> }) {
  const ref = useRef<HTMLDivElement>(null);
  const md = (block.term ? `**${block.term}** — ` : "") + block.text;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.empty();
    // Markdown fills in asynchronously and grows the card after the masonry has
    // already measured it — notify the board so it can recompute the slot.
    void MarkdownRenderer.render(plugin.app, md, el, path, plugin).then(() => {
      el.dispatchEvent(new CustomEvent(RENDERED_EVENT, { bubbles: true }));
    });
  }, [md, path]);
  return <div class="r-prose" ref={ref} />;
}

function TableBlock({ block, q }: { block: Extract<RuleBlock, { t: "table" }>; q: string }) {
  return (
    <div class="r-table-wrap">
      {block.caption && (
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

function StepsBlock({ block, q }: { block: Extract<RuleBlock, { t: "steps" }>; q: string }) {
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

function BulletsBlock({ block, q }: { block: Extract<RuleBlock, { t: "bullets" }>; q: string }) {
  return (
    <ul class="r-bullets">
      {block.items.map((it, i) => (
        <li class="r-bullets__item" key={i}>
          {it.term && <span class="r-term">{hl(it.term, q)} </span>}
          {hl(it.text, q)}
        </li>
      ))}
    </ul>
  );
}

function CalloutBlock({ block, q }: { block: Extract<RuleBlock, { t: "callout" }>; q: string }) {
  return (
    <blockquote class="r-callout">
      <span class="r-callout__mark">“</span>
      <span class="r-callout__text">{hl(block.text, q)}</span>
      {block.cite && <cite class="r-callout__cite">— {block.cite}</cite>}
    </blockquote>
  );
}

function FlowBlock({ block, q }: { block: Extract<RuleBlock, { t: "flow" }>; q: string }) {
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

function DiceBlock({ block, q }: { block: Extract<RuleBlock, { t: "dice" }>; q: string }) {
  const [roll, setRoll] = useState<{ dice: number[]; mod: number; total: number } | null>(null);
  const [spin, setSpin] = useState(false);
  const doRoll = () => {
    const m = (block.expr || "").match(/(\d*)d(\d+)/i);
    const dice: number[] = [];
    if (m) {
      const n = parseInt(m[1] || "1", 10);
      const faces = parseInt(m[2], 10);
      for (let i = 0; i < n; i++) dice.push(1 + Math.floor(Math.random() * faces));
    }
    const sum = dice.reduce((a, b) => a + b, 0);
    const mod = block.mod || 0;
    setSpin(true);
    setTimeout(() => setSpin(false), 360);
    setRoll({ dice, mod, total: sum + mod });
  };
  return (
    <div class="r-dice">
      <div class="r-dice__main">
        <div class="r-dice__expr">
          <span class="r-dice__notation">{hl(block.expr, q)}</span>
          {block.label && <span class="r-dice__label">{hl(block.label, q)}</span>}
        </div>
        <button class={"r-dice__roll" + (spin ? " is-spin" : "")} onClick={doRoll}>
          <Icon id="ra-perspective-dice-five" class="r-dice__roll-ic" />
          <span>Roll</span>
        </button>
      </div>
      {roll && (
        <div class={"r-dice__out" + (spin ? " is-spin" : "")}>
          <span class="r-dice__dice">
            {roll.dice.map((d, i) => (
              <span class="r-dice__die" key={i}>
                {d}
              </span>
            ))}
            {roll.mod ? <span class="r-dice__mod">{roll.mod > 0 ? "+" + roll.mod : roll.mod}</span> : null}
          </span>
          <span class="r-dice__eq">=</span>
          <span class="r-dice__total">{roll.total}</span>
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
}) {
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
}) {
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
            return <DiceBlock block={b} q={q} key={i} />;
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
