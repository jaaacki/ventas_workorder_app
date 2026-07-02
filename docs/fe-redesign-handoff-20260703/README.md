# Ventas WorkOrder — UX/UI Redesign Handoff

> A build spec for a developer (or dev AI agent) implementing the redesign in the real
> `@workorder/fe` codebase. Read this top to bottom; it is self-sufficient.

---

## 1. What's in this bundle

| File | What it is | How to use it |
|---|---|---|
| `Product Map.html` | The **why/what**: product thesis, material journey, domain model, personas & jobs, diagnosis of the current UI, and the proposed information architecture. | Read first. It is the reasoning behind every decision below. Open in a browser. |
| `Ventas Brand Foundation.html` | The **corporate identity ground**: logo, color system (brand + semantic tokens for light & dark), typography, voice, UI application, iconography & imagery — derived from ventas.bio. | Read before styling. Everything visual inherits from here. |
| `brand-tokens.css` | The CI palette expressed as design-system token overrides (`--primary` → Ventas Scarlet, full light + dark). | Drop-in: load after the DS stylesheet. This is how the brand reaches the app. |
| `Ventas Redesign.html` + `data.js` + `app.jsx` | The **how**: a live, clickable reference prototype of **all screens** (Today, Board, My queue, Release queue, Quarantine, Collections, Inventory, Traceability, Workflows & phases, Users & roles, and the redesigned Detail) built with the **real** `WorkorderFe` components. | Open in a browser. This is the visual + interaction target. Click the nav. |
| `README.md` | This document. | The build spec. |
| Screenshots (optional) | The **current** app, for before/after context. | Reference only — do not rebuild these. |

### These files are design references, not production code
The HTML/JSX prototype is a **reference built in a sandbox** to show intended look, layout, and
behavior. **Do not copy `app.jsx` into the app.** Recreate these designs in the existing
`@workorder/fe` React codebase using its real routing, data layer, and component library. The
prototype already uses the true design-system components, so the visual mapping is 1:1 — your job
is to wire them to real data and routes.

**Fidelity: high.** Colors, type, spacing, and component choices are final and come straight from
the design system. Match them. Layout structure (grids, the sidebar shell, the detail-page
composition) is intentional and should be reproduced closely.

### Brand / corporate identity
The visual identity comes from **`Ventas Brand Foundation.html`** and is applied via
**`brand-tokens.css`**. **Scarlet is a voice, not paint.** The workhorse action color is **ink**
(`--primary` `#16161A`, light-ink `#F4F3F1` in dark); **Ventas Scarlet** lives in a dedicated
`--brand` token (`#E5330E` / `#FF4A1C`) used only for the logo and a few deliberate accents (e.g. the
selected-nav indicator), and in `--destructive` for **critical states only**. Keeping red rare is the
point — a "Blocked" badge or a destructive action must genuinely shout, which it can't if scarlet is
also every primary button. The app supports **light (default) and dark** via a `.dark` class on
`<html>`; the prototype's topbar has a working theme toggle. Product UI stays in **Geist** (the DS
font); the **Playfair Display** serif is reserved for brand moments (sign-in, empty states, marketing
headings), never inside tables or controls.

---

## 2. The one-line product truth (memorize this)

**Ventas turns human extracted teeth (HET) into released biomaterial. The app is the single
thread of traceability and control across that journey.** Every screen is a slice of one flow:

```
Collect → Receive → Process → Gate → Release
(clinic)  (intake)  (factory) (QA)   (ship)
```

- **HET** — a sealed container of dentin from a partner dental clinic. The raw material.
- **Work order (WO)** — one atomic unit of work running a lot through a workflow's phases.
- **Workflow / line** — one of several product lines (A-Graft, Cortico, …), each with its own
  ordered phase recipe. A WO lives in exactly one. **Workflow is a context the whole app filters by.**
- **BET** — Bacterial Endotoxin Test. The safety evidence that gates release.
- **Genealogy** — parent/child lot links; the traceability thread end to end.

---

## 3. The four problems we are fixing

1. **Navigation mirrors database tables, not jobs.** The current menu flattens a workflow
   (Production), one role's queue (QA), two domains (Procurement, Inventory), and admin side by side.
2. **Schema leaks onto every screen.** Detail pages surface raw keys — `unit:HET-…`, `supply:CLI-…`,
   `Legacy serial`, `Inferred from legacy deliver` — and rows of `-` and empty "No X" cards.
3. **No real dashboarding.** The home is a wall of counts; it never answers the two questions that
   matter: *what do I work on next?* and *what can I release today?*
4. **The thread is invisible.** You can't walk from a finished good back to its clinic-collected tooth.

---

## 4. Information architecture (the new nav)

Re-group everything around the flow and the jobs. A **product-line switcher** sits at the top of the
sidebar and scopes the whole app.

```
[ Product line: A-Graft ▾ ]      ← workflow switcher, scopes board/queues/gates

Today                            ← role-aware home

PRODUCTION
  Board                          ← all WOs by phase (manager)
  My queue                       ← an operator's own next tasks (do)

QUALITY
  Release queue        (3)       ← gates ready to sign off (badge = count)
  Quarantine                     ← held material

MATERIAL
  Collections                    ← intake from clinics (was "Procurement")
  Inventory                      ← lots, SKU, location
  Traceability                   ← genealogy explorer (promoted to first-class)

SETUP
  Workflows & phases             ← was half of "Configuration"
  Users & roles                  ← was two separate pages
```

### Route → screen mapping (old → new)
| Current page | Becomes | Why |
|---|---|---|
| Dashboard | **Today** | Role-aware home that answers the two primary questions on open. |
| Production | **Production ▸ Board + My queue** | Split *manage* (board) from *do* (an operator's tasks). |
| QA queue | **Quality ▸ Release queue + Quarantine** | Name by the job; separate held from ready-to-sign. |
| Procurement | **Material ▸ Collections** | It's material intake. File it where the flow begins. |
| Inventory | **Material ▸ Inventory + Traceability** | Promote genealogy to a navigable explorer. |
| Configuration | **Setup ▸ Workflows & phases** + **BOM & equipment** | Break the mega-page into what it actually configures. |
| Users / Roles | **Setup ▸ Users & roles** | Both are access admin — one home. |
| Legacy fields (everywhere) | Collapsed **"Source record"** panel | Present for audit, gone from the primary view. |

---

## 5. Four principles that govern every screen

1. **Follow the material.** Screens read in the order dentin moves: Collect → Process → Gate → Release.
2. **Answer the question, then show the record.** Open with the job's answer up top; data and legacy
   fields sit below or behind a disclosure.
3. **Make the thread walkable.** From any lot/WO/finished good, trace parents & children in one click.
4. **Scope to one line.** The workflow switcher is above everything; boards/queues/gates default to the
   active line, with an "All lines" view for managers.

---

## 6. Terminology & schema-leak rules (apply globally)

**Never render raw keys, prefixes, or legacy codes in the primary UI.** Translate on the way out:

| Never show (raw) | Show instead |
|---|---|
| `unit:HET-2607010DEJ` | `HET-2607010DEJ` (drop the `unit:` prefix) or "Collection HET-2607010DEJ" |
| `supply:CLI-240825088`, `point:CLI-…` | "Northside Dental Clinic" (resolve the reference to a name) |
| `ISSUED TO SUPPLIER LEGACY` | `In production` / `Issued` (human status; see status map below) |
| `INFERRED_FROM_LEGACY_DELIVER`, `CLINIC_AND_ISSUANCE` | Move to the Source record panel; don't surface as chips |
| `Legacy serial`, `Legacy check in/out`, `Legacy deliver` | Collapse into **Source record** (audit only) |
| A field with no value | **Omit the field entirely** — never render a row of `-` |
| A relation with no rows | Omit the section, or one quiet line ("No linked lots yet") — not a giant empty card |

**Status vocabulary** (map backend codes → these human labels + a tone):
`Collected` · `Issued` · `Received` · `In production` · `In quarantine` · `Blocked` ·
`Released` (finished goods). Tone: neutral for in-flight, `secondary` badge for active,
`destructive` for blocked/quarantine, `default` (primary) for released/ready.

**Rule of thumb:** if a value only makes sense to someone who has read the database schema, it does not
belong on the primary view. Put it in **Source record**.

---

## 7. Component mapping (`window.WorkorderFe`)

The prototype uses only real components. Recreate with the same ones. Styling idiom (from the DS
README): **semantic color tokens as Tailwind utilities** (`bg-primary`, `text-muted-foreground`,
`border`, …) and the **`variant`/`size` props** — never raw hex, never invented classes.

| UI element | Component(s) | Notes |
|---|---|---|
| Buttons | `Button` | variants: `default \| secondary \| outline \| ghost \| destructive \| link`; sizes: `sm \| default \| lg \| icon` |
| Status chips | `Badge` | `default \| secondary \| outline \| destructive` — map to the status tones above |
| Panels/cards | `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardAction`, `CardContent`, `CardFooter` | `CardAction` holds the top-right badge/button |
| Lists/tables | `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell` | Blockers, release queue, inventory |
| Line switcher | `Select`, `SelectTrigger`, `SelectValue`, `SelectContent`, `SelectItem` | The product-line context switcher |
| Gate tabs | `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` | Sterilisation/BET · Quarantine · Release sub-views |
| People | `Avatar`, `AvatarFallback` | Owner initials on board cards |
| Search / forms | `Input`, `Label` | Topbar search, config forms |
| Dividers | `Separator` | Sidebar sections, summary strip |
| Confirmations | `Dialog` + parts | "Release batch?", "Advance phase?" |
| Row menus | `DropdownMenu` + parts | Per-row actions |

Loading (per DS README): `<link rel="stylesheet" href="styles.css">` then
`<script src="_ds_bundle.js">` (React first). Components live at `window.WorkorderFe.*`. Dark mode is a
`.dark` class toggle — every token already has a dark value, so no extra styling needed.

---

## 8. Screen-by-screen build spec

### 8.1 Shell (every authenticated screen)
- **Left sidebar, 260px**, `bg-card`, right border `border`. Order: brand → **product-line `Select`** →
  `Separator` → grouped nav (§4). Active item: `bg-primary` / `text-primary-foreground`; hover:
  `bg-accent`. Release queue item carries a count badge.
- **Topbar, 64px**: global `Input` search (placeholder "Search work orders, collections, lots…") on the
  left; org name + role + `Avatar` + sign-out `Button` (icon, ghost) on the right.
- Main content scrolls; cap content width ~1180px.

### 8.2 Today (home) — *flagship, mocked*
Answers both primary questions immediately. Three blocks:
1. **Ready to release today** (`Card`): list of gate-passed WOs with product, units, gate, wait time;
   each row has a `Release` outline button. `CardAction` shows "N ready".
2. **Your next tasks** (`Card`): the signed-in operator's queue in phase order — the *action* (e.g.
   "Load freezer rack B") is the headline, WO/phase/product is the subline; a due `Badge`.
3. **Blocked — needs attention** (`Card` + `Table`): WOs that can't advance — WO, stuck-at phase, plain
   reason, wait-time badge (`destructive` if high), and a "Resolve →" action.

**Role-aware:** operators lead with *Your next tasks*; QA leads with *Ready to release*; managers lead
with *Blocked*. Owner sees all three. No wall of counts — at most a small count per block header.

### 8.3 Production ▸ Board — *flagship, mocked*
- Horizontal columns, one per **phase** in the workflow's recipe order; column header shows phase name +
  count. Cards show WO, product · units, a status badge (`On track` / `Blocked` / `Ready`), and an owner
  `Avatar`. Blocked cards use a `destructive` badge.
- Header actions: **All lines** (outline) to widen beyond the active line; **New work order** (primary).
- Clicking a card → the WO detail (same pattern as §8.5).

### 8.4 My queue / Release queue / Quarantine
- **My queue**: the operator's tasks as a `Table` (action, WO, phase, due, "Start" button). Same content
  as the Today block, expanded + filterable.
- **Release queue**: gate-passed WOs as a `Table`; primary action **Release** opens a `Dialog`
  confirmation ("Release {product} · {units}? This records final QA sign-off."). Group by gate type with
  `Tabs` (Sterilisation/BET · Ready).
- **Quarantine**: held material list; each row explains *why* held and offers "Review". Never show the
  raw `quarantine` bucket code.

### 8.5 Detail page (collection unit / lot / WO) — *flagship, mocked; this is the biggest fix*
Replaces the current schema dump. Four stacked blocks:
1. **Title + human subtitle** ("Collection HET-2607010DEJ" / "Human extracted teeth · dentin") + a
   back button and a status `Badge`.
2. **Summary strip** (`Card`, 4 columns): only fields that have meaning and a value — e.g. **Status /
   Received from / Received / Now at**. Resolve references to names. **Omit any empty field.**
3. **Journey** (`Card`, vertical timeline): the real story — Collected → Issued → Received → In
   production → Gate → Released, each with a one-line human detail and date; the current step is marked.
   This replaces the row of empty "No fulfilments / No receipt lines / No HET links" cards.
4. **Genealogy** (`Card`): parents → **this lot** (highlighted) → children as clickable nodes. Each node
   navigates to that lot's detail. This is the walkable thread.
5. **Source record** (`Card`, collapsed by default): all legacy/migrated identifiers
   (legacy serial, tracking, deliver ref, import flags, "migrated from AppSheet + spreadsheet",
   record-updated timestamp) as a quiet key/value grid behind a disclosure, tagged `Legacy`.

**Empty-state rule (critical):** if a relation has no rows, omit its section or show one quiet line —
never a full-height empty card with an icon. The current detail pages violate this ~10× per page.

### 8.6 Material ▸ Collections
- List of collection units from clinics (`Table`): unit, source clinic (resolved name), issued/received
  status, date. Row → the detail page (§8.5). Header filter by clinic and status. No `supply:`/`point:`
  prefixes anywhere.

### 8.7 Material ▸ Inventory + Traceability
- **Inventory**: `Table` of lots — lot, what it is (SKU description, not the SKU code as the headline),
  status badge, location, quantity. Heavy list; add a sticky filter bar (status, location, line). Row →
  detail.
- **Traceability**: a genealogy explorer — search a lot/WO/HET, render the parent/child tree (same node
  style as §8.5 genealogy), click to walk. This is the promoted first-class version of what's buried in
  detail pages today.

### 8.8 Setup ▸ Workflows & phases / BOM & equipment / Users & roles
- **Workflows & phases**: list the product lines; selecting one shows its ordered phase recipe (drag to
  reorder), and per phase its procedures. Split the "BOM & equipment" configuration into its own view.
- **Users & roles**: merge the two current pages. Users `Table` (name, role, status) + a roles panel
  (role → permissions). Use `Dialog` for invite/edit.

### 8.9 404 / not-found
- Keep it simple and on-brand: short message, a `Button` back to **Today**, and the global search. Don't
  over-design it.

---

## 9. Interactions & states
- **Navigation**: client-side routing; the workflow `Select` writes to app-level context that every
  board/queue/gate reads and filters by. Persist the chosen line (e.g. URL param or storage).
- **Release / Advance phase**: `Dialog` confirmation → optimistic update → toast (`Toaster`).
- **Loading**: skeleton rows in tables/cards; never a blank screen.
- **Empty**: follow the empty-state rule in §8.5 — quiet one-liners, not giant placeholder cards.
- **Error**: inline `Alert` (`destructive`) at the top of the affected panel.
- **Blocked**: `destructive` badges + a "Resolve" path that deep-links to what's missing (e.g. the BET
  evidence upload).

---

## 10. Definition of done
- [ ] Nav re-grouped per §4; product-line switcher scopes board/queues/gates.
- [ ] Today answers "what next?" and "what can I release?" above the fold, role-aware.
- [ ] No raw keys, prefixes, or legacy codes on any primary view (§6); legacy lives in **Source record**.
- [ ] No empty `-` rows and no giant empty relation cards anywhere.
- [ ] Every lot/WO/HET detail has a walkable genealogy; Traceability exists as its own screen.
- [ ] All UI built from `window.WorkorderFe` components with semantic tokens + variants only.
- [ ] Dark mode works via the `.dark` class with no extra styling.

---

*Ventas WorkOrder redesign · handoff for engineering · built on `@workorder/fe`.*
