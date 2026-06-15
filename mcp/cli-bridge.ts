/**
 * CLI Bridge — wraps the Obsidian CLI (Obsidian.com) for programmatic control
 * of Carrel. All operations go through `ob eval` which executes JS in the
 * Obsidian window context with access to `app` and `window.__carrel`.
 *
 * Targets the Carrel clean-room vault by default (CARREL_VAULT env overrides —
 * set it to "MiniSheet Dev" to drive the integration vault).
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";
import * as path from "node:path";

const execAsync = promisify(exec);

const OBSIDIAN_CLI = path.join(
  process.env.LOCALAPPDATA || "",
  "Programs",
  "obsidian",
  "Obsidian.com"
);

const VAULT = process.env.CARREL_VAULT || "carrel-test-vault";

const DEFAULT_TIMEOUT = 15_000;
const EVAL_TIMEOUT = 30_000;

function shellQuote(s: string): string {
  return `"${s.replace(/"/g, '\\"')}"`;
}

export async function cli(...args: string[]): Promise<string> {
  const cmd = [
    shellQuote(OBSIDIAN_CLI),
    shellQuote(`vault=${VAULT}`),
    ...args.map(shellQuote),
  ].join(" ");
  try {
    const { stdout } = await execAsync(cmd, { timeout: DEFAULT_TIMEOUT });
    return stdout.trim();
  } catch (err: any) {
    if (err.code === "ENOENT") {
      throw new Error(`Obsidian CLI not found at ${OBSIDIAN_CLI}. Is Obsidian installed?`);
    }
    if (err.killed) throw new Error(`CLI command timed out: ${args.join(" ")}`);
    throw new Error(`CLI error: ${err.message}`);
  }
}

export async function obsidianEval(code: string): Promise<string> {
  const cmd = [
    shellQuote(OBSIDIAN_CLI),
    shellQuote(`vault=${VAULT}`),
    "eval",
    shellQuote(`code=${code}`),
  ].join(" ");
  const { stdout } = await execAsync(cmd, { timeout: EVAL_TIMEOUT });
  const result = stdout.trim();
  return result.startsWith("=> ") ? result.slice(3) : result;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Evaluate an ASYNC body in Obsidian. Top-level `await` is rejected by the CLI
 * eval context, so the body is wrapped in an async IIFE whose settled result is
 * stashed on `window.__crAsync[id]` and polled for.
 */
export async function obsidianEvalAwait<T = unknown>(
  body: string,
  timeoutMs = 20_000
): Promise<T> {
  const id = Math.random().toString(36).slice(2);
  const start =
    `window.__crAsync = window.__crAsync || {}; ` +
    `(async function(){ ${body} })().then(` +
    `function(r){ window.__crAsync["${id}"] = JSON.stringify({ok:true, value: r === undefined ? null : r}); }, ` +
    `function(e){ window.__crAsync["${id}"] = JSON.stringify({ok:false, error: String(e && e.message || e)}); }); ` +
    `"started"`;
  await obsidianEval(start);

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const raw = await obsidianEval(
      `(function(){ var r = window.__crAsync && window.__crAsync["${id}"]; ` +
        `if (r) delete window.__crAsync["${id}"]; return r || "null"; })()`
    );
    if (raw !== "null") {
      const settled = JSON.parse(raw) as
        | { ok: true; value: T }
        | { ok: false; error: string };
      if (!settled.ok) throw new Error(`Eval (async) failed: ${settled.error}`);
      return settled.value;
    }
    await sleep(250);
  }
  throw new Error(`Eval (async) timed out after ${timeoutMs}ms`);
}

export async function obsidianScreenshot(outputPath: string): Promise<string> {
  const winPath = outputPath.replace(/\//g, "\\");
  await cli("dev:screenshot", `path=${winPath}`);
  return outputPath;
}

export async function obsidianErrors(): Promise<string> {
  return cli("dev:errors");
}

export async function obsidianReloadPlugin(pluginId: string): Promise<string> {
  return cli("plugin:reload", `id=${pluginId}`);
}

export async function obsidianOpen(notePath: string): Promise<string> {
  return cli("open", `path=${notePath}`);
}

export async function obsidianVersion(): Promise<string> {
  return cli("version");
}
