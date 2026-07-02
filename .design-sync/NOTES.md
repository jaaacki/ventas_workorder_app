# design-sync notes — ventas_workorder_app

## Repo shape
- No standalone design-system package, no Storybook. `fe/` is the app; the
  "design system" is `fe/src/components/ui/` (16 stock shadcn/ui primitive
  files, `radix-nova` style per `fe/components.json`) plus one app-specific
  `DashboardLayout`.
- `shape: package`, `srcDir: src/components/ui`. `DashboardLayout` was
  deliberately excluded from scope — it's coupled to `react-router-dom`
  context, the `useAuthStore` zustand store, and this app's own nav-item
  list, so it isn't a reusable DS piece. If it's ever wanted, it needs
  `cfg.provider` for a Router wrapper and a mocked/`$ref`'d auth store.
- `fe/package.json` has no `module`/`main`/`exports` (it's not built as a
  library) → converter always runs in synth-entry mode
  (`[NO_DIST] synthesizing from N src files`). 16 files → 82 exported
  PascalCase symbols (compound-component sub-parts: Dialog/DialogTrigger/
  DialogContent/…, Table/TableRow/TableCell/…, etc.) — expected, not a
  discovery bug.

## cssEntry — fragile hashed path
- `cfg.cssEntry` points at `fe/dist/assets/index-B-G3WP_Q.css`, the
  **compiled** Tailwind v4 output from `vite build` (fe's own
  `src/index.css` is just `@import "tailwindcss"; …` — bare npm specifiers,
  not resolvable CSS, so it fails `[CSS_IMPORT_MISSING]` if used directly).
- Vite content-hashes this filename on every build. **Re-sync risk**: after
  any `fe` rebuild, `ls fe/dist/assets/*.css` and update `cssEntry` to the
  new hash before re-running the converter, or the build will fail
  `[CSS_IMPORT_MISSING]`.
- **`fe`'s own production build ships zero font files.** `fe/dist/assets/`
  has no `.woff2` at all — the compiled CSS still references
  `url(./files/geist-*.woff2)` from the raw `@fontsource-variable/geist`
  package, but Vite never copies those assets into `dist/`. This means
  `Geist Variable` 404s in the *real app* too, not just in this bundle —
  worth a heads-up to the fe team, out of scope to fix here.
  `cfg.extraFonts` points directly at
  `node_modules/@fontsource-variable/geist/wght.css` (the real files) as a
  workaround. Path is relative to `PKG_DIR` = `node_modules/@workorder/fe`
  (the workspace symlink, unresolved) — needed **3** `../` hops to reach
  repo-root `node_modules`, not 1. `fonts/fonts.css` ends up with both the
  dead `./files/...` rules (from the cssEntry scan) and the working flat
  ones (from extraFonts) for the same family/weight/unicode-range; CSS
  duplicate-face resolution picks the **later**-declared rule, and
  extraFonts rules are appended after, so the working ones win — confirmed
  in a real browser, no 404s. This is fragile: if the append order ever
  changes, fonts silently break again.

## Known/accepted warnings
- `[TOKENS_MISSING]` (1 token referenced but not defined) — below the
  non-blocking threshold, not investigated.

## Verification performed (no `package-validate.mjs` render-check)
- Playwright/Chromium was never installed via npm — the user was asked
  twice (component scope, then the ~200MB Chromium install) and didn't
  respond within the prompt window either time, so this run proceeded
  with `--no-render-check` rather than downloading a browser binary
  without consent.
- Instead, the agent used the **already-available Playwright MCP browser**
  (a separate, pre-provisioned tool, not an install into this repo) to
  manually open all 15 authored components' `.html` cards
  (Button, Badge, Card, Alert, Avatar, Table, Tabs, Input, Label,
  Separator, Dialog, Select, DropdownMenu, Sheet, Tooltip) plus one
  un-authored floor card (a sub-part). All 15 authored cards: zero console
  errors (beyond an expected `favicon.ico` 404), real Geist-Variable
  styling, correct token colors. Dialog/Select/DropdownMenu/Sheet/Tooltip
  (the `cardMode: "single"` overlay overrides) all render open and fully
  visible within their card viewport. This is real evidence, not a
  rationalization — but it is **not** the systematic root-empty/thin/
  variants-identical check `package-validate.mjs`'s render-check does, and
  it did not cover the 67 un-authored floor-card sub-parts individually
  (spot-checked one: a real, correctly-styled, childless `Button`, as
  expected for an un-authored floor card).
- Any `report_validate` call this run skips (no full render-check counts
  exist to report).

## Re-sync risks
- `cssEntry`'s hashed filename (see above) is the single most likely thing
  to silently break a re-sync — check it first if `package-build.mjs`
  throws `[CSS_IMPORT_MISSING]`.
- The font dead/working duplicate-rule ordering (see above) is load-bearing
  for fonts actually rendering — don't reorder the extractFonts/extraFonts
  calls without re-checking in a real browser.
- No automated render-check ever ran — a future sync should install
  Playwright + Chromium and do a real pass rather than relying on the
  manual spot-check this run did.
- Authored previews (`.design-sync/previews/`) are hand-written composition
  examples, not mined from real app usage sites — the pages
  (`WorkOrdersPage`, `InventoryPage`, etc.) were not mined for canonical
  prop combinations in this pass; only obvious/common variants were used.
- 67 of 82 exported components are compound sub-parts (DialogTrigger,
  TableRow, CardHeader, …) left as floor cards by design — they're only
  meaningful composed inside their parent, which the parent's authored
  preview already demonstrates.
