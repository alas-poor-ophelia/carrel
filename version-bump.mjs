// Syncs the plugin version across manifest.json and versions.json.
//
// Run indirectly via `bun version <newversion>` (the npm "version" lifecycle
// script wires this up), or directly with `MANIFEST_VERSION already set`:
//
//   bun version 0.10.0      # bumps package.json, then runs this, then git adds
//
// It reads the (already-bumped) version from package.json, writes it into
// manifest.json, and records the version -> minAppVersion mapping in
// versions.json so Obsidian/BRAT can resolve the right minimum app version.
import { readFileSync, writeFileSync } from "fs";

const targetVersion = process.env.npm_package_version;
if (!targetVersion) {
	console.error("npm_package_version is not set — run this via `bun version <newversion>`.");
	process.exit(1);
}

// Update manifest.json, keeping its existing minAppVersion.
const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const { minAppVersion } = manifest;
manifest.version = targetVersion;
writeFileSync("manifest.json", JSON.stringify(manifest, null, "\t") + "\n");

// Record version -> minAppVersion in versions.json.
const versions = JSON.parse(readFileSync("versions.json", "utf8"));
versions[targetVersion] = minAppVersion;
writeFileSync("versions.json", JSON.stringify(versions, null, "\t") + "\n");

console.log(`Set version ${targetVersion} (minAppVersion ${minAppVersion}).`);
