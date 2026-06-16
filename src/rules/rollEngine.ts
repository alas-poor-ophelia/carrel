/* Roll engine seam (plan Part A, Layer 1). Lifts dice evaluation out of the
   DiceBlock renderer so the result can come from EITHER our own RNG (always
   available) or the community Dice Roller plugin when it's installed.

   Detection is per-call and cheap; no build-time dependency on Dice Roller —
   we talk to the window global it exposes (see util/plugins.getDiceRoller). */
import type { App } from "obsidian";
import { getDiceRoller } from "../util/plugins";

export interface RollResult {
  total: number;
  /** Per-die values. Empty when the engine doesn't expose a breakdown
   *  (the Dice Roller path returns a total + text only). */
  dice: number[];
  mod: number;
  /** Engine-provided result/breakdown text (Dice Roller), for the tooltip. */
  text?: string;
}

export interface RollEngine {
  /** True when backed by the Dice Roller plugin (full grammar + tables). */
  readonly external: boolean;
  roll(expr: string, mod?: number): Promise<RollResult>;
}

/** Our own engine — the floor everyone gets. Expanded beyond the original
 *  single-group regex to sum any sequence of `NdM` groups and flat integer
 *  terms joined by + / - (e.g. "2d6 + 1d8 - 1"). */
class BuiltinRollEngine implements RollEngine {
  readonly external = false;
  async roll(expr: string, mod = 0): Promise<RollResult> {
    const dice: number[] = [];
    let constants = 0;
    const re = /([+-])?\s*(?:(\d*)d(\d+)|(\d+))/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(expr || ""))) {
      const sign = m[1] === "-" ? -1 : 1;
      if (m[3] !== undefined) {
        const n = parseInt(m[2] || "1", 10);
        const faces = parseInt(m[3], 10);
        for (let i = 0; i < n; i++) dice.push(sign * (1 + Math.floor(Math.random() * faces)));
      } else if (m[4] !== undefined) {
        constants += sign * parseInt(m[4], 10);
      }
    }
    const totalMod = constants + mod;
    const total = dice.reduce((a, b) => a + b, 0) + totalMod;
    return { total, dice, mod: totalMod };
  }
}

/** Wraps the live Dice Roller plugin. Folds the block's modifier into the
 *  notation string so Dice Roller's own grammar evaluates the whole thing,
 *  then prefers its synchronous rollSync() (confirmed by spike S-A1). */
class DiceRollerEngine implements RollEngine {
  readonly external = true;
  private readonly fallback = new BuiltinRollEngine();
  constructor(private readonly dr: import("../util/plugins").DiceRollerLike) {}
  async roll(expr: string, mod = 0): Promise<RollResult> {
    try {
      const full = mod ? `${expr}${mod > 0 ? "+" + mod : mod}` : expr;
      const roller = await this.dr.getRoller(full, "carrel");
      let raw: unknown;
      try {
        raw = typeof roller.rollSync === "function" ? roller.rollSync() : await roller.roll();
      } catch {
        raw = await roller.roll();
      }
      const total = Number(raw);
      if (!Number.isFinite(total)) throw new Error("non-numeric roll");
      const text = roller.getResultText?.() ?? roller.getTooltip?.();
      return { total, dice: [], mod: 0, text: text ?? String(total) };
    } catch {
      // Malformed expression or API hiccup — never break the card.
      return this.fallback.roll(expr, mod);
    }
  }
}

/** Resolve the active engine. Dice Roller when present and usable, else our
 *  built-in. Detected fresh each call (a click handler, not a hot path), so a
 *  later plugin enable is picked up without restarting Carrel. */
export function getRollEngine(app: App): RollEngine {
  const dr = getDiceRoller(app);
  return dr ? new DiceRollerEngine(dr) : new BuiltinRollEngine();
}
