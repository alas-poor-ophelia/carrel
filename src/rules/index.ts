import { signal, type Signal } from "@preact/signals";
import type { App, CachedMetadata, Component, TFile } from "obsidian";
import type CarrelPlugin from "../main";
import { parseNote, readFmProp } from "./parse";

export type { RuleDoc } from "./model";
import type { RuleDoc } from "./model";

/** Union of a note's frontmatter `tags:` and inline `#tags` from the metadata
 *  cache — `#`-stripped, lowercased, deduped. The note body is never scanned. */
function normalizeTags(cache: CachedMetadata | null): string[] {
  const out = new Set<string>();
  const addToken = (raw: string): void => {
    const s = raw.replace(/^#/, "").trim().toLowerCase();
    if (s) out.add(s);
  };
  const addFm = (v: unknown): void => {
    if (v == null) return;
    if (Array.isArray(v)) {
      v.forEach(addFm);
      return;
    }
    if (typeof v === "string" || typeof v === "number") {
      String(v)
        .split(/[,\s]+/)
        .forEach(addToken);
    }
  };
  addFm(cache?.frontmatter?.tags);
  for (const t of cache?.tags ?? []) addToken(t.tag);
  return [...out];
}

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
  /** Bumped on each rebuild() so a slower, superseded rebuild abandons its
   *  partial result instead of clobbering a newer one (file-change storms and
   *  rename cascades fire rebuild() many times in quick succession). */
  private rebuildGen = 0;

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
    this.registerWatchers(this.plugin);
  }

  /** Like init(), but registers the file-change watchers on a disposable owner
   *  (e.g. an inline embed's MarkdownRenderChild) so they're torn down with it,
   *  and rebuilds immediately (callers in reading mode are past layout-ready). */
  initOn(owner: Component): void {
    this.registerWatchers(owner);
    void this.rebuild();
  }

  private registerWatchers(owner: Component): void {
    owner.registerEvent(
      this.app.metadataCache.on("changed", (file) => {
        if (this.inFolders(file.path)) void this.rebuild();
      })
    );
    owner.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        if (this.inFolders(file.path) || this.inFolders(oldPath)) void this.rebuild();
      })
    );
    owner.registerEvent(
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
    const gen = ++this.rebuildGen;
    try {
      const files = this.app.vault.getMarkdownFiles().filter((f) => this.inFolders(f.path));
      const docs: RuleDoc[] = [];
      for (const file of files) {
        const doc = await this.indexFile(file);
        // A newer rebuild started while we awaited — let it win, drop our work.
        if (gen !== this.rebuildGen) return;
        docs.push(doc);
      }
      docs.sort((a, b) => a.title.localeCompare(b.title));
      this.docs.value = docs;
    } catch (e) {
      // Surfacing index failures to the console is intentional dev diagnostics.
      console.error("Carrel: index rebuild failed", e);
    }
  }

  /** Index an EXPLICIT set of files (e.g. a Bases query result) into `docs`,
   *  parsing each note exactly like the watched-folder path — so Bases cards are
   *  real Carrel cards (types, flowcharts, colors, rules). Respects the rebuild
   *  generation guard so a superseded call drops its partial work. */
  async indexFiles(files: TFile[]): Promise<void> {
    const gen = ++this.rebuildGen;
    try {
      const docs: RuleDoc[] = [];
      for (const file of files) {
        const doc = await this.indexFile(file);
        if (gen !== this.rebuildGen) return;
        docs.push(doc);
      }
      docs.sort((a, b) => a.title.localeCompare(b.title));
      this.docs.value = docs;
    } catch (e) {
      console.error("Carrel: bases index failed", e);
    }
  }

  private async indexFile(file: TFile): Promise<RuleDoc> {
    const cache = this.app.metadataCache.getFileCache(file);
    const headings = cache?.headings?.map((h) => h.heading) ?? [];
    const category = readFmProp(cache?.frontmatter, this.plugin.store.categoryProp()) ?? "General";
    const raw = await this.app.vault.cachedRead(file);
    // strip frontmatter from the body we render/search
    const body = raw.replace(/^---\n[\s\S]*?\n---\n?/, "").trim();
    // The note's own title (its filename) is the card title; a heading is only a
    // fallback for the rare title-less case — never let an early H2 win.
    const title = file.basename || headings[0] || "Untitled";
    const tags = normalizeTags(cache);
    const parsed = parseNote(
      body,
      cache?.frontmatter ?? {},
      this.plugin.store.customTypes(),
      this.plugin.store.typeProp(),
      title,
      tags,
      this.plugin.store.typeRules(),
      this.plugin.store.disabledBuiltinTypes(),
      this.plugin.store.imageProp()
    );
    return {
      path: file.path,
      title,
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
