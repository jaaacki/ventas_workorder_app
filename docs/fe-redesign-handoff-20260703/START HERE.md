# Ventas WorkOrder — Redesign Handoff Pack

A complete package to rebuild the AmGraft® operator + QA UI in the real `@workorder/fe` codebase.
The HTML files are **design references** (built on your real design-system components) — recreate them
in the app's environment, don't ship the HTML.

## Read in this order
1. **`Product Map.html`** — the *why*: product, material journey, personas/jobs, IA, diagnosis.
2. **`Process Grounding.md`** — the real AM025 SOP domain (phases, reagents, weights, roles, gate).
3. **`Execution Model.md`** — how the UI actually works: **16 grouped phases, WO = one phase of one
   batch (a chain), server-driven readiness, inline base64 evidence, BET/EtO gate, endpoints, do-nots.**
4. **`README.md`** — the build spec: IA, schema-leak rules, component mapping, per-screen instructions,
   definition of done.
5. **`Ventas Brand Foundation.html`** + **`brand-tokens.css`** — the CI: scarlet-as-voice, ink primary,
   light + dark tokens mapped onto the design system. Load `brand-tokens.css` after the DS stylesheet.
6. **`Ventas Redesign (standalone).html`** — the clickable prototype (offline, all screens, light/dark,
   per-line colour switch). Open in a browser and click through.

## Screens (see `screenshots/`)
| # | Screen | What it proves |
|---|---|---|
| 01 | Today | Role-aware home — "what next / what can I release" |
| 02 | Board | **Lifecycle-bucket** columns + **bottleneck KPI** (prodDuration) |
| 03 | Batch detail | **16-phase chain** timeline, dwell time, inline evidence |
| 04 | Phase execution | Procedures, evidence capture, **server-driven Advance checklist**, BET blocker |
| 05 | My queue | Operator tasks → open phase |
| 06 | Release queue (BET gate) | EtO cycle + **BET reading** (pending/PASS/FAIL) → release vs quarantine |
| 07 | Quarantine | BET-fail holds with reasons |
| 08 | Collections | HET intake — lot, clinic + HCI, ethanol level, weight |
| 09 | Collection detail | Human summary, journey, walkable genealogy, collapsed **Source record** |
| 10 | Inventory | Colour-coded reagents + material states |
| 11 | Traceability | Walkable chain of custody |
| 12 | Workflows & phases | Product lines + phase recipe |
| 13 | Users & roles | The five real roles |
| 14–15 | Today / Board (dark) | Dark theme parity |

## Non-negotiables (from Execution Model)
- 16 phases, **one start/finish signature pair each** — never 28 step screens.
- `imagePath` / `*SignPath` are **inline `data:image/...;base64` URLs**, not file URLs. Handle null gracefully.
- **Never compute advance/release readiness client-side** — render `advanceRequirements` / `readinessBlockers`.
- A WorkOrder is **one phase of one batch** — follow the chain (`previousWoId → nextPhaseId`).
- Ignore the 5 placeholder phases; render from the live `PHS-*` phases.

## Brand in one line
Ink is the workhorse action colour; **scarlet `#E5330E` is the brand voice** (logo + a restrained
nav indicator) and `--destructive` (critical only). Each **product line owns a colour** that repaints
the chrome; line-agnostic areas go neutral graphite.
