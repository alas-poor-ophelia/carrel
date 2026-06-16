# Releasing Carrel

Carrel ships as three files Obsidian loads from a plugin folder: `main.js`,
`styles.css`, and `manifest.json`. A release is just a GitHub release with those
three attached as assets, tagged with the exact version string.

The tag **must equal `manifest.json`'s `version`** (e.g. `0.9.0`, no leading
`v`). BRAT and the community manifest both key off that match — the release
workflow refuses to publish on a mismatch.

## Cutting a release

1. **Land everything on `main`.** Make sure the working tree is clean and `main`
   holds the code you want to ship.

2. **Bump the version.** This updates `package.json`, `manifest.json`, and
   `versions.json` (which maps the new version to its `minAppVersion`) and stages
   them:

   ```sh
   bun version 0.10.0      # patch | minor | major | <explicit version>
   ```

   Review and commit the bump:

   ```sh
   git commit -m "Release 0.10.0"
   ```

3. **Tag and push.** The tag triggers the release workflow:

   ```sh
   git tag 0.10.0          # no "v" prefix — must match manifest.version
   git push origin main --tags
   ```

4. **The workflow does the rest.** `.github/workflows/release.yml` checks out the
   tag, verifies it matches `manifest.json`, runs `bun run build:prod`, and
   creates a GitHub release with `main.js`, `styles.css`, and `manifest.json`
   attached.

5. **Verify.** Open the repo's Releases page and confirm the release is visible
   (not marked pre-release) and that all three assets are attached.

## Installing a release

- **BRAT (beta):** add `alas-poor-ophelia/carrel` via *BRAT: Add a beta plugin*.
- **Manual:** download the three assets into `<vault>/.obsidian/plugins/carrel/`.

## Community directory (later)

Carrel is not yet submitted to the Community Plugins directory. When it is, the
submission PR to `obsidianmd/obsidian-releases` references this repo and the
latest matching release; `versions.json` lets older Obsidian installs resolve a
compatible version.
