import type CarrelPlugin from "../main";

function BookGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );
}

/** Phase 0 stub view. Replaced by the masonry board + toolbar in Phase 2+. */
export function App({ plugin }: { plugin: CarrelPlugin }) {
  return (
    <>
      <div class="carrel-pane__top">
        <div class="carrel-brand">
          <span class="carrel-brand__mark">
            <BookGlyph />
          </span>
          <div>
            <div class="carrel-brand__name">Carrel</div>
            <div class="carrel-brand__sub">References</div>
          </div>
        </div>
      </div>
      <div class="carrel-pane__body">
        <div class="carrel-stub">
          <div class="carrel-stub__title">Carrel</div>
          <p class="carrel-stub__note">
            A novel way to view your notes. The scaffold is live — the
            column-balancing masonry board, nooks, and the category system
            arrive over the coming phases.
          </p>
          <div class="carrel-stub__stamp">
            v{plugin.manifest.version} · build {__BUILD_STAMP__}
          </div>
        </div>
      </div>
    </>
  );
}
