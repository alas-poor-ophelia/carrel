/**
 * State tools — drive Carrel's window.__carrel bridge (nooks, index, pane).
 */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { obsidianEval, obsidianEvalAwait } from "../cli-bridge.js";

export function registerStateTools(server: McpServer): void {
  server.tool("carrel_get_state", "Get Carrel's persisted state (nooks + categories).", {}, async () => {
    const r = await obsidianEval("JSON.stringify(window.__carrel.getState())");
    return { content: [{ type: "text" as const, text: r }] };
  });

  server.tool("carrel_list_nooks", "List Carrel nooks (id, name, folders, pin count).", {}, async () => {
    const r = await obsidianEval("JSON.stringify(window.__carrel.listNooks())");
    return { content: [{ type: "text" as const, text: r }] };
  });

  server.tool("carrel_index_stats", "Index health: folders watched, doc count, titles.", {}, async () => {
    const r = await obsidianEval("JSON.stringify(window.__carrel.indexStats())");
    return { content: [{ type: "text" as const, text: r }] };
  });

  server.tool(
    "carrel_set_nook",
    "Set the active nook by id (the index follows it).",
    { nookId: z.string() },
    async ({ nookId }) => {
      await obsidianEval(`(function(){window.__carrel.setActiveNook(${JSON.stringify(nookId)});return "ok";})()`);
      return { content: [{ type: "text" as const, text: `active nook -> ${nookId}` }] };
    }
  );

  server.tool(
    "carrel_create_nook",
    "Create a nook from one or more folders and make it active.",
    { name: z.string(), folders: z.array(z.string()) },
    async ({ name, folders }) => {
      const r = await obsidianEval(
        `window.__carrel.createNook(${JSON.stringify(name)}, ${JSON.stringify(folders)})`
      );
      return { content: [{ type: "text" as const, text: `created nook ${r}` }] };
    }
  );

  server.tool("carrel_open_pane", "Open (or reveal) the Carrel full pane.", {}, async () => {
    await obsidianEvalAwait("await window.__carrel.openPane(); return 'ok';");
    return { content: [{ type: "text" as const, text: "pane opened" }] };
  });
}
