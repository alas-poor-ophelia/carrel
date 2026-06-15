import { TFolder, type App } from "obsidian";

/** All real folders in the vault (excludes the root), sorted alphabetically.
 *  Shared by the create-nook modal, the nook settings modal, and the settings
 *  Nooks section so every folder picker enumerates the vault the same way. */
export function listVaultFolders(app: App): string[] {
  const out: string[] = [];
  for (const f of app.vault.getAllLoadedFiles()) {
    if (f instanceof TFolder && f.path && f.path !== "/") out.push(f.path);
  }
  return out.sort((a, b) => a.localeCompare(b));
}
