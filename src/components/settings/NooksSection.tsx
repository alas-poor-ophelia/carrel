/* Carrel settings — manage nooks: the named boards that read notes from one or
   more vault folders. List / create / rename / delete, switch the active nook,
   and open each nook's settings (theme, density, tweaks, and source folders).
   Source-folder and theme editing live in NookSettingsModal (the same editor the
   pane's gear opens); this section is the top-level list + lifecycle controls. */
import { Notice } from "obsidian";
import type CarrelPlugin from "../../main";
import { CreateNookModal, NookSettingsModal } from "../../modals";

function sourceSummary(folders: string[]): string {
  if (!folders.length) return "Whole vault";
  const names = folders.map((f) => f.split("/").pop() || f);
  const shown = names.slice(0, 3).join(", ");
  return folders.length > 3 ? `${shown} +${folders.length - 3} more` : shown;
}

export function NooksSection({ plugin }: { plugin: CarrelPlugin }) {
  const store = plugin.store;
  const data = store.data.value; // reading .value subscribes this section to nook changes
  const nooks = data.nooks;
  const activeId = data.activeNookId;

  const remove = (id: string) => {
    const nook = nooks.find((n) => n.id === id);
    store.deleteNook(id);
    new Notice(`Removed nook “${nook?.name ?? id}”. Its notes are untouched.`);
  };

  return (
    <>
      <div class="ob-h">
        <h3 class="ob-h__t">Nooks</h3>
        <span class="ob-h__c">{nooks.length}</span>
      </div>
      <p class="ob-h__desc">
        A nook is a named board that reads notes from one or more vault folders. Create, rename or
        delete nooks here, switch which one is active, and open a nook to edit its source folders,
        theme and density.
      </p>

      {nooks.length === 0 && <div class="ob-nookempty">No nooks yet — create one to start a board.</div>}

      <div class="ob-nooks">
        {nooks.map((n) => (
          <div class={"ob-nook" + (n.id === activeId ? " is-active" : "")} key={n.id}>
            <div class="ob-nook__main">
              <div class="ob-nook__name">
                {n.name}
                {n.id === activeId && <span class="ob-nook__badge">Active</span>}
              </div>
              <div class="ob-nook__meta">
                {n.folders.length} {n.folders.length === 1 ? "folder" : "folders"} · {sourceSummary(n.folders)} ·{" "}
                {n.theme === "brand" ? "Character Sheet" : "Obsidian"} theme
              </div>
            </div>
            <div class="ob-nook__btns">
              {n.id !== activeId && (
                <button class="ob-btn" onClick={() => store.setActiveNook(n.id)}>
                  Set active
                </button>
              )}
              <button class="ob-btn" onClick={() => new NookSettingsModal(plugin, n.id).open()}>
                Edit
              </button>
              <button class="ob-btn ob-btn--icon ob-btn--danger" title="Delete nook" onClick={() => remove(n.id)}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M5 7h14M9 7V5h6v2M10 11v6M14 11v6M6 7l1 13h10l1-13" />
                </svg>
              </button>
            </div>
          </div>
        ))}
      </div>

      <button class="ob-btn ob-btn--cta ob-addbtn" onClick={() => new CreateNookModal(plugin).open()}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
        New nook
      </button>
    </>
  );
}
