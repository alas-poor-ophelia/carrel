import esbuild from "esbuild";
import process from "process";
import path from "path";
import { fileURLToPath } from "url";
import { readFileSync } from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const prod = process.argv[2] === "production";
const watch = process.argv.includes("--watch");

// Read from manifest so prod builds carry a deterministic stamp (see define below).
const manifestVersion = JSON.parse(
  readFileSync(path.resolve(__dirname, "manifest.json"), "utf8")
).version;

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
  // window.__carrel.buildStamp exposes this so the MCP reload tool can verify
  // the running code actually changed. Dev builds use a per-build clock for that;
  // PROD must be byte-reproducible (the store rebuilds main.js from the tag and
  // diffs it against the published asset), so it stamps the manifest version —
  // which any rebuild of the same commit reproduces. A wall-clock here was why
  // "build output does not match the released main.js" kept firing.
  define: {
    __BUILD_STAMP__: JSON.stringify(prod ? manifestVersion : String(Date.now())),
  },
  nodePaths: [path.resolve(__dirname, "node_modules")],
});

if (watch) {
  await context.watch();
} else {
  await context.rebuild();
  process.exit(0);
}
