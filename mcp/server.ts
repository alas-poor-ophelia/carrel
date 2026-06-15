/**
 * Carrel MCP Server
 *
 * Programmatic control of Carrel inside Obsidian for the dev/verify loop.
 * Targets the Carrel clean-room vault (CARREL_VAULT env overrides).
 *
 * Usage:
 *   bun run mcp/server.ts        (stdio transport for Claude Code)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerViewTools } from "./tools/view-tools.js";
import { registerStateTools } from "./tools/state-tools.js";

const server = new McpServer({
  name: "carrel",
  version: "0.1.0",
});

registerViewTools(server);
registerStateTools(server);

const transport = new StdioServerTransport();
await server.connect(transport);
