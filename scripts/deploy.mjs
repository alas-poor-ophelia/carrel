// Copies the compiled Carrel plugin into its target vaults.
// Build first (`bun run deploy` chains build + this script).
//
// Carrel deploys to TWO vaults:
//   1. test-vault  — the isolated clean-room vault (Carrel alone).
//   2. MiniSheet Dev — the integration vault (Carrel + MiniSheet loaded
//      together), driven by the existing minisheet MCP during development.
// The Sync tripwire only applies to the MiniSheet Dev vault (the test-vault
// is local-only and never synced to other devices).

import { copyFileSync, mkdirSync, readFileSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const FILES = ["main.js", "styles.css", "manifest.json"];

/** @type {{ name: string, dir: string, syncTripwire?: boolean }[]} */
const TARGETS = [
  {
    name: "carrel-test-vault",
    dir: path.join(repoRoot, "carrel-test-vault", ".obsidian", "plugins", "carrel"),
  },
  {
    name: "MiniSheet Dev",
    dir: "C:/Users/whipl/OneDrive/Documents/MiniSheet Dev/.obsidian/plugins/carrel",
    syncTripwire: true,
  },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Tripwire: integration deploys only reach the iPad through Obsidian Sync.
// A vault config reset once silently disabled the sync core plugin and the
// iPad quietly fell behind — warn loudly if that ever happens again.
function checkSync(pluginDir) {
  try {
    const corePlugins = JSON.parse(
      readFileSync(path.resolve(pluginDir, "../..", "core-plugins.json"), "utf8")
    );
    if (corePlugins.sync !== true) {
      console.warn(
        "\n  *** WARNING: the vault's Sync core plugin is DISABLED — this deploy" +
          "\n  *** will NOT reach other devices. Re-enable Sync in Obsidian settings" +
          "\n  *** (and keep all syncing options on).\n"
      );
    }
  } catch {
    // unreadable config is not a deploy failure; the copy below still matters
  }
}

for (const target of TARGETS) {
  // Skip a target whose parent vault doesn't exist yet (e.g. MiniSheet Dev on
  // a machine that only has the test-vault) rather than failing the build.
  const vaultRoot = path.resolve(target.dir, "../..", "..");
  if (!existsSync(vaultRoot)) {
    console.log(`  (skipped ${target.name}: vault not found at ${vaultRoot})`);
    continue;
  }
  if (target.syncTripwire) checkSync(target.dir);
  mkdirSync(target.dir, { recursive: true });
  for (const file of FILES) {
    const src = path.join(repoRoot, file);
    const dest = path.join(target.dir, file);
    try {
      copyFileSync(src, dest);
    } catch (err) {
      // OneDrive can briefly lock files mid-sync; retry once.
      if (err.code === "EBUSY" || err.code === "EPERM") {
        await sleep(1000);
        copyFileSync(src, dest);
      } else {
        throw err;
      }
    }
    console.log(`  ${file} -> ${dest}`);
  }
  console.log(`Deployed to ${target.name}.`);
}
