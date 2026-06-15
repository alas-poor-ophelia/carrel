import { signal, type Signal } from "@preact/signals";
import { TFile, type App } from "obsidian";
import type CarrelPlugin from "../main";
import { parseNote } from "./parse";

export type { RuleDoc } from "./model";
import type { RuleDoc } from "./model";

/**
 * Multi-folder note index. Unlike MiniSheet's single-folder RulesIndex, a
 * Carrel index watches a SET of folders (a nook's source folders) and parses
 * each markdown note into a typed RuleDoc. The `docs` signal re-renders the
 * board whenever a watched note changes. Folders are set imperatively
 * (setFolders) — in Phase 5 the active nook drives them.
 */
export class CarrelIndex {
  readonly docs: Signal<RuleDoc[]> = signal([]);
  private folders: string[] = [];
  private app: App;

  constructor(private plugin: CarrelPlugin) {
    this.app = plugin.app;
  }

  /** The folders currently indexed (normalized, no trailing slash). */
  getFolders(): string[] {
    return [...this.folders];
  }

  /** Replace the watched folder set and rebuild. "" means the whole vault.
   *  No-ops when the normalized set is unchanged (avoids needless rebuilds when
   *  driven by a signal effect that also fires on unrelated state changes). */
  setFolders(folders: string[]): void {
    const next = folders.map((f) => f.replace(/\/$/, "")).filter((f, i, a) => a.indexOf(f) === i);
    if (next.length === this.folders.length && next.every((f, i) => f === this.folders[i])) return;
    this.folders = next;
    void this.rebuild();
  }

  init(): void {
    this.plugin.app.workspace.onLayoutReady(() => void this.rebuild());
    this.plugin.registerEvent(
      this.app.metadataCache.on("changed", (file) => {
        if (this.inFolders(file.path)) void this.rebuild();
      })
    );
    this.plugin.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        if (this.inFolders(file.path) || this.inFolders(oldPath)) void this.rebuild();
      })
    );
    this.plugin.registerEvent(
      this.app.vault.on("delete", (file) => {
        if (this.inFolders(file.path)) void this.rebuild();
      })
    );
  }

  private inFolders(path: string): boolean {
    if (!path.endsWith(".md")) return false;
    if (!this.folders.length) return false;
    return this.folders.some((f) => f === "" || path.startsWith(`${f}/`));
  }

  async rebuild(): Promise<void> {
    const files = this.app.vault.getMarkdownFiles().filter((f) => this.inFolders(f.path));
    const docs: RuleDoc[] = [];
    for (const file of files) {
      docs.push(await this.indexFile(file));
    }
    docs.sort((a, b) => a.title.localeCompare(b.title));
    this.docs.value = docs;
  }

  private async indexFile(file: TFile): Promise<RuleDoc> {
    const cache = this.app.metadataCache.getFileCache(file);
    const headings = cache?.headings?.map((h) => h.heading) ?? [];
    const category = (cache?.frontmatter?.category as string | undefined) ?? "General";
    const raw = await this.app.vault.cachedRead(file);
    // strip frontmatter from the body we render/search
    const body = raw.replace(/^---\n[\s\S]*?\n---\n?/, "").trim();
    const parsed = parseNote(body, cache?.frontmatter ?? {});
    return {
      path: file.path,
      title: headings[0] ?? file.basename,
      category,
      headings,
      body,
      ...parsed,
    };
  }

  byPath(path: string): RuleDoc | undefined {
    return this.docs.value.find((d) => d.path === path);
  }
}
