import esbuild from "esbuild";
import process from "process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const prod = process.argv[2] === "production";
const watch = process.argv.includes("--watch");

const context = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: ["obsidian", "electron"],
  format: "cjs",
  target: "es2020",
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  outfile: "main.js",
  minify: prod,
  jsx: "automatic",
  jsxImportSource: "preact",
  // Changes every build; window.__carrel.buildStamp exposes it so the
  // MCP reload tool can verify the running code actually changed.
  define: {
    __BUILD_STAMP__: JSON.stringify(String(Date.now())),
  },
  nodePaths: [path.resolve(__dirname, "node_modules")],
});

if (watch) {
  await context.watch();
} else {
  await context.rebuild();
  process.exit(0);
}
