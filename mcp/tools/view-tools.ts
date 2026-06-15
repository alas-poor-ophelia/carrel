/**
 * View tools — generic Obsidian operations for Carrel.
 * Ping, open note, screenshot, reload plugin, get errors, eval.
 */

import { z } from "zod";
import * as path from "node:path";
import { mkdirSync } from "node:fs";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  obsidianVersion,
  obsidianErrors,
  obsidianOpen,
  obsidianScreenshot,
  obsidianEval,
  obsidianEvalAwait,
} from "../cli-bridge.js";

const SCREENSHOT_DIR = path.resolve(import.meta.dirname || ".", "..", "screenshots");

const CARREL_PLUGIN_ID = "carrel";

export function registerViewTools(server: McpServer): void {
  server.tool(
    "carrel_ping",
    "Check if Obsidian is running. Returns version and active file.",
    {},
    async () => {
      try {
        const version = await obsidianVersion();
        const info = await obsidianEval(
          `JSON.stringify({activeFile: app.workspace.getActiveFile()?.path || null, carrel: !!window.__carrel})`
        );
        const parsed = JSON.parse(info);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ obsidian: version, ...parsed }, null, 2) }],
        };
      } catch (err: any) {
        return {
          content: [{ type: "text" as const, text: `Obsidian not reachable: ${err.message}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "carrel_open",
    "Open a note by vault-relative path in Obsidian",
    { notePath: z.string().describe("Vault-relative path to the note") },
    async ({ notePath }) => {
      await obsidianOpen(notePath);
      return { content: [{ type: "text" as const, text: `Opened: ${notePath}` }] };
    }
  );

  server.tool(
    "carrel_screenshot",
    "Take a screenshot of the current Obsidian window. Returns the file path.",
    { filename: z.string().optional().describe("Screenshot filename (default: timestamped)") },
    async ({ filename }) => {
      const name = filename || `carrel-${Date.now()}.png`;
      mkdirSync(SCREENSHOT_DIR, { recursive: true });
      const outputPath = path.join(SCREENSHOT_DIR, name);
      await obsidianScreenshot(outputPath);
      return { content: [{ type: "text" as const, text: `Screenshot saved: ${outputPath}` }] };
    }
  );

  server.tool(
    "carrel_reload",
    "Reload the carrel plugin from disk, verifying via buildStamp that the RUNNING code actually changed.",
    {},
    async () => {
      try {
        const result = await obsidianEvalAwait<{ before: string | null; after: string | null }>(
          `var before = window.__carrel ? window.__carrel.buildStamp : null; ` +
            `await app.plugins.unloadPlugin("${CARREL_PLUGIN_ID}"); ` +
            `await app.plugins.loadPlugin("${CARREL_PLUGIN_ID}"); ` +
            `var after = window.__carrel ? window.__carrel.buildStamp : null; ` +
            `return {before: before, after: after};`
        );
        if (!result.after) {
          return {
            content: [{ type: "text" as const, text: `RELOAD FAILED: plugin did not come back up (no window.__carrel). Check carrel_errors.` }],
            isError: true,
          };
        }
        if (result.before !== null && result.after === result.before) {
          return {
            content: [{ type: "text" as const, text: `RELOAD STALE: buildStamp unchanged (${result.after}). Did you run \`bun run deploy\`?` }],
            isError: true,
          };
        }
        return {
          content: [{ type: "text" as const, text: `Reloaded carrel. buildStamp ${result.before ?? "(none)"} -> ${result.after} (verified fresh code).` }],
        };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Reload error: ${err.message}` }], isError: true };
      }
    }
  );

  server.tool("carrel_errors", "Get console errors from Obsidian", {}, async () => {
    const errors = await obsidianErrors();
    return { content: [{ type: "text" as const, text: errors }] };
  });

  server.tool(
    "carrel_eval",
    "Evaluate arbitrary JavaScript in the Obsidian window context. Single-line only.",
    { code: z.string().describe("JS to evaluate; has access to app, window, window.__carrel") },
    async ({ code }) => {
      try {
        const result = await obsidianEval(code);
        return { content: [{ type: "text" as const, text: result || "(no output)" }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Eval error: ${err.message}` }], isError: true };
      }
    }
  );
}
