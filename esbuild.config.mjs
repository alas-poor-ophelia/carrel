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
  // Dev builds get a volatile per-build stamp so window.__carrel.buildStamp lets
  // the MCP reload tool prove the running code actually changed. PRODUCTION builds
  // get a STABLE stamp so the released main.js is byte-reproducible from source:
  // the store's "Build verified against source" check rebuilds and diffs, and a
  // Date.now() value is the only thing that would differ (confirmed: a clean-room
  // build:prod of a release tag matches the published main.js except these digits).
  define: {
    __BUILD_STAMP__: JSON.stringify(prod ? "release" : String(Date.now())),
  },
  nodePaths: [path.resolve(__dirname, "node_modules")],
});

if (watch) {
  await context.watch();
} else {
  await context.rebuild();
  process.exit(0);
}
