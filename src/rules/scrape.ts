/**
 * AoN rules page -> markdown note. AoN's display pages put their content in
 * `#MainContent_DetailedOutput`: a breadcrumb, an <h1 class="title">, a
 * `<b>Source</b> <i>book</i>` line, then prose separated by <br><br>, with
 * <b> lead terms, the odd <table>/<ul>. We convert that subtree to clean
 * markdown so the plugin's parser (parse.ts) can infer typed blocks from it.
 *
 * Pure TS (node-html-parser is a self-contained parser — no Node built-ins),
 * so this is the shared seam for BOTH the CLI scraper (scripts/scrape-rules)
 * and the in-Obsidian importer (src/rules/import-rule.ts, which feeds it HTML
 * fetched via Obsidian's mobile-safe requestUrl).
 */
import { parse, type HTMLElement, type Node } from "node-html-parser";

export interface ScrapedNote {
  title: string;
  category: string;
  source: string;
  summary: string;
  markdown: string;
}

function isEl(n: Node): n is HTMLElement {
  return (n as HTMLElement).nodeType === 1;
}

function decode(s: string): string {
  return s
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/&nbsp;/g, " ")
    .replace(/&rsquo;|&#8217;/g, "’")
    .replace(/&lsquo;|&#8216;/g, "‘")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function inline(node: Node): string {
  if (!isEl(node)) return decode((node as Node & { rawText: string }).rawText ?? "");
  const tag = node.rawTagName?.toLowerCase();
  const inner = node.childNodes.map(inline).join("");
  switch (tag) {
    case "b":
    case "strong":
      return inner.trim() ? `**${inner.trim()}**` : "";
    case "i":
    case "em":
      return inner.trim() ? `*${inner.trim()}*` : "";
    case "a":
      return inner; // drop the link, keep the label
    case "br":
      return "\n";
    case "u":
      return inner;
    default:
      return inner;
  }
}

function cells(row: HTMLElement, tag: string): string[] {
  return row.querySelectorAll(tag).map((c) => inline(c).replace(/\s+/g, " ").trim() || " ");
}

function tableToMarkdown(table: HTMLElement): string {
  const rows = table.querySelectorAll("tr");
  if (!rows.length) return "";
  const header = cells(rows[0], "th").length ? cells(rows[0], "th") : cells(rows[0], "td");
  const bodyRows = rows.slice(1).map((r) => cells(r, "td")).filter((r) => r.length);
  const width = header.length || (bodyRows[0]?.length ?? 0);
  if (!width) return "";
  const pad = (r: string[]) => {
    const c = r.slice(0, width);
    while (c.length < width) c.push(" ");
    return `| ${c.join(" | ")} |`;
  };
  const lines = [pad(header), `| ${Array(width).fill("---").join(" | ")} |`, ...bodyRows.map(pad)];
  return lines.join("\n");
}

/** Convert a list of body nodes (post-source) into markdown blocks. */
function bodyToMarkdown(nodes: Node[]): string {
  let out = "";
  for (const n of nodes) {
    if (isEl(n)) {
      const tag = n.rawTagName?.toLowerCase();
      if (tag === "table") {
        out += "\n\n" + tableToMarkdown(n) + "\n\n";
        continue;
      }
      if (tag === "ul" || tag === "ol") {
        const marker = tag === "ol" ? (i: number) => `${i + 1}.` : () => "-";
        const items = n.querySelectorAll("li").map((li, i) => `${marker(i)} ${inline(li).replace(/\s+/g, " ").trim()}`);
        out += "\n\n" + items.join("\n") + "\n\n";
        continue;
      }
      if (tag === "h1" || tag === "h2" || tag === "h3") {
        out += `\n\n## ${inline(n).trim()}\n\n`;
        continue;
      }
    }
    out += inline(n);
  }
  // <br><br> -> paragraph; collapse runs; tidy
  return out
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function extractNote(html: string, fallbackTitle = "Rule"): ScrapedNote | null {
  const root = parse(html);
  const container = root.querySelector("#MainContent_DetailedOutput");
  if (!container) return null;

  const h1 = container.querySelector("h1.title") || container.querySelector("h1");
  const title = (h1?.text ?? "").trim() || fallbackTitle;

  // breadcrumb: the leading <a> links before the title; first = top category
  const crumbs: string[] = [];
  for (const child of container.childNodes) {
    if (child === h1) break;
    if (isEl(child)) {
      const a = child.rawTagName?.toLowerCase() === "a" ? child : child.querySelector?.("a");
      if (a) crumbs.push(a.text.trim());
    }
  }
  const category = crumbs[0] || "Reference";

  // source: <b>Source</b> <i>book pg. N</i>
  const srcM = /<b>\s*Source\s*<\/b>\s*(?:<a[^>]*>)?\s*<i>([^<]+)<\/i>/i.exec(container.innerHTML);
  const source = srcM ? decode(srcM[1]).replace(/\s+pg\.\s*\d+.*$/, "").trim() : "";

  // body = nodes after the h1, with a leading Source run removed
  const kids = container.childNodes;
  const h1Idx = h1 ? kids.indexOf(h1) : -1;
  let body = h1Idx >= 0 ? kids.slice(h1Idx + 1) : kids.slice();
  // drop a leading "Source ... <br>" run
  let skip = 0;
  let sawSource = false;
  for (const n of body) {
    const t = isEl(n) ? n.rawTagName?.toLowerCase() : "";
    const txt = (n as HTMLElement).text?.trim?.() ?? "";
    if (!sawSource && t === "b" && /source/i.test(txt)) { sawSource = true; skip++; continue; }
    if (sawSource && (t === "a" || t === "br" || txt === "")) { skip++; continue; }
    break;
  }
  body = body.slice(skip);

  const markdown = bodyToMarkdown(body);
  const plain = markdown
    .replace(/\*\*?/g, "")
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  let summary = plain;
  if (plain.length > 180) {
    const cut = plain.slice(0, 179);
    const sp = cut.lastIndexOf(" ");
    summary = `${cut.slice(0, sp > 110 ? sp : 179)}…`;
  }

  return { title, category, source, summary, markdown };
}
