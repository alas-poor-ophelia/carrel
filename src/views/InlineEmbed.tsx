/* The inline `carrel` markdown codeblock. A note can embed one nook's board mid-
   document:

       ```carrel
       nook: Combat rules
       ```

   It renders ONLY the pinned rail + cards (chrome suppressed via PaneBoard's
   `chromeless` prop), takes the note's full content width (so vault CSS can
   override it), and caps its height at --cr-inline-max-height (default 500px,
   adjustable in Style Settings). It runs its own CarrelIndex scoped to the
   nook's folders, so it can show a nook other than the active one without
   touching the shared pane — and that index's file watchers are torn down with
   the render child. */
import { MarkdownRenderChild, parseYaml } from "obsidian";
import { render } from "preact";
import type CarrelPlugin from "../main";
import { CarrelIndex } from "../rules/index";
import { PaneBoard } from "../components/pane/PaneBoard";

class CarrelInlineEmbed extends MarkdownRenderChild {
  private root: HTMLElement | null = null;

  constructor(
    private readonly plugin: CarrelPlugin,
    containerEl: HTMLElement,
    private readonly nookRef: string,
  ) {
    super(containerEl);
  }

  onload(): void {
    const nook = this.resolveNook(this.nookRef);
    if (!nook) {
      this.containerEl.createDiv({
        cls: "carrel-inline-error",
        text: this.nookRef
          ? `Carrel: no nook named “${this.nookRef}”.`
          : "Carrel: this block needs a `nook:` field (a nook name or id).",
      });
      return;
    }
    const root = this.containerEl.createDiv({ cls: "carrel-inline-root" });
    this.root = root;
    const index = new CarrelIndex(this.plugin);
    index.setFolders(nook.folders);
    index.initOn(this); // watchers owned by this render child; cleaned on unload
    render(<PaneBoard plugin={this.plugin} embed embedNookId={nook.id} chromeless index={index} />, root);
  }

  onunload(): void {
    if (this.root) {
      render(null, this.root);
      this.root.remove();
      this.root = null;
    }
  }

  private resolveNook(ref: string) {
    const nooks = this.plugin.store.nooks();
    return nooks.find((n) => n.id === ref) ?? nooks.find((n) => n.name === ref) ?? null;
  }
}

/** Register the `carrel` codeblock processor. */
export function registerInlineEmbed(plugin: CarrelPlugin): void {
  plugin.registerMarkdownCodeBlockProcessor("carrel", (source, el, ctx) => {
    ctx.addChild(new CarrelInlineEmbed(plugin, el, parseNookRef(source)));
  });
}

/** Pull the `nook:` value (a nook name or id) out of the block's YAML body. */
function parseNookRef(source: string): string {
  try {
    const y = parseYaml(source) as { nook?: string | number } | null;
    return y && y.nook != null ? String(y.nook).trim() : "";
  } catch {
    return "";
  }
}
