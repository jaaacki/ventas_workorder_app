# Execution Model — how the WorkOrder UI actually works

> Engineering brief grounding (supersedes the phase *count* in Process Grounding.md).
> The UI follows the **backend**, not the 28-step PDF. Build to this.

## 1. The one thing to internalise
**A WorkOrder = ONE phase of ONE batch.** A batch walking all phases produces a **chain of 16 WO rows**
linked `previousWoId → nextPhaseId`. You don't mutate one WO through phases — `advance` **creates the
next-phase WO** and links it. "Show this batch's progress" = **follow the chain**
(`GET /work-orders/:id/inventory-trace` + phase-timeline fields), not read one row.

## 2. 16 grouped phases — NOT 28 steps, NOT my earlier 8 columns
Several consecutive PDF steps are folded into one **signed phase** (one start-sign, one end-sign, one QC
photo per group). The 28 steps survive as **Procedures** (a checklist *inside* the phase). Historical data
is 16-grouped and can't be un-grouped → the timeline is **16 nodes, full stop**.

**phaseOrder (16), grouped visually by letter, tagged by room:**
| # | phaseShort | Label | Room |
|---|---|---|---|
| 1 | A1 | Raw Material Acquisition | Prep Room |
| 2 | A2 | Transfer of Collected HET | Prep Room |
| 3 | **A3–A5** | Retrieve · Decoronate · Split Roots | Prep Room |
| 4 | **B6–B8** | Clean-yellow · Rinse · Clean-orange | Prep Room |
| 5 | **B9–B11** | Burring · Clean-burred · Autoclave | Prep Room |
| 6 | C12 | Milling & Sieving | Cleanroom |
| 7 | **D13–D16** | Four sonication cleans | Cleanroom |
| 8 | E17 | Freezing | Cleanroom |
| 9 | E18 | Lyophilisation | Cleanroom |
| 10 | F19 | Dispensing (0.255 cc/tray) | Cleanroom |
| 11 | **F20–F22** | Seal inner · Seal outer · Send to PLS | Cleanroom→PLS |
| 12 | G23 | Packing for EtO | PLS |
| 13 | G24 | Terminal Sterilisation (EtO) | PLS · 3rd-party |
| 14 | **G25–G26** | BET test · Pass/Fail handling | PLS · 3rd-party |
| 15 | H27 | Labelling & EtO-sticker verify | PLS |
| 16 | H28 | Release to Inventory | PLS |

- Inside a phase: show grouped steps as a **Procedures checklist** (read/tick), **not** separately signable.
- **One start / finish / photo per phase.** Never build 28 step screens or 28 sign-offs.
- Ignore the 5 placeholder phases (`PREP/PROD/STER/BET/REL`, 0 WOs). Render from the live `PHS-*` phases.

## 3. Lifecycle enums (key the UI off these)
- `lifecycleState`: **NotStarted → InProgress → ReadyToAdvance → ReleasePending → Released**
- `legacyStateBucket` (**board columns**): `1. In Progress` · `2. Next Phase` · `3. In Quarantine` ·
  `4. Finished Goods` · `5. WO Completed`
- `operationalStatus` (**the card badge**): `Blocked` *or* a lifecycle state. `Blocked` whenever
  `readinessBlockers[]` is non-empty.
- `releaseStatus`: `released | quarantined | rejected | null` (QA disposition, PDF G26).

## 4. Phase-execution screen (the core operator flow)
Order of interactions inside one phase WO:
1. **`POST /start`** → capture **start signature** image → `prodStart` + `startSignById`.
2. Operator works; records **serials** (`/serials`, per hasSerial BOM line), **equipment** (`/equipment`),
   **output weight/qty** (`/output-quantity`), **photo** (`/photo-evidence`).
3. **`POST /finish`** → capture **end signature** → `prodEnd` + `endSignById` + `prodDuration`.
4. **`POST /advance`** → create next-phase WO.

Per-phase completion booleans to drive the checklist UI:
`imageCaptured`, `outputQuantityCaptured`, `serialCheckDone` (+ `serialRequiredCount`), `equipmentCheckDone`.
**A phase is "complete" when its end-signature exists** — not when a timestamp is set.

## 5. Readiness is server-driven — never compute client-side
- Advance button ← `canAdvanceLegacy` + render `advanceRequirements[]` (`{key,label,met,parityGap}`) /
  `missingAdvanceRequirements[]` as the checklist that unlocks it.
- Release ← `readinessBlockers[]`. Blocked reasons come from the server, not the client.

## 6. Evidence = inline base64 data URLs (NOT file URLs)
`startSignPath`, `endSignPath`, `imagePath` hold the **entire image** as `data:image/png;base64,…`.
- Render directly: `<img src={wo.imagePath}>` — no fetch, no asset host, no `/files/` prefix.
- Capture: signature pad / photo input must **produce a `data:image/...;base64,…` string**; POST that
  inline (e.g. `{ signatureDataUrl }` → `/start`, `{ imageDataUrl }` → `/photo-evidence`). png/jpeg/webp, ≤5 MB.
- **No upload-to-storage step exists.** ~45 earliest WOs have `null` images → show **"no evidence on
  record,"** never a broken image.

## 7. Sterilisation / BET gate (G24–G26)
Separate records: `sterilises[]` = `{ direction OUT/IN (EtO cycle), result (bool pass/fail), betReading, quantity }`.
The batch can't clear the G-phase until the **BET gate passes** → appears as an `advanceRequirement` /
`readinessBlocker`. **Show the BET reading + pass/fail prominently on the QA screen.**

## 8. KPIs — `prodDuration` is per-phase cycle time in **minutes**
`prodDurationMinutes = prodEnd − prodStart`. Dashboards: **phase dwell time, batch throughput, bottleneck
phases** (expect B9–B11 autoclave, E18 lyophilisation, G25–G26 BET wait to dominate). Timeline granular to
the 16 phases.

## 9. HET linkage
`hetId` = the single HET batch this WO consumes; `het.hetNumber` = the collection lot; `batchHets[]` = full
batch list. `POST /hets/:id/use` + `/finish` mark consumption. **Show HET lot + source clinic on the WO header.**

## 10. Endpoints (all under `/work-orders/:id`)
`GET /work-orders` · `/:id` · `/qa-queue` · `/:id/audit-events` · `/:id/inventory-trace` ·
`POST /start` · `/finish` · `/advance` · `/photo-evidence` · `/output-quantity` · `/serials` ·
`/equipment` · `/release`. HET: `POST /hets/:id/use` · `/finish`.

## Do-nots
❌ 28 step screens / 28 sign-offs — 16 phases, one sign-off pair each.
❌ Treat `imagePath`/`*SignPath` as URLs — they're inline data URLs.
❌ Compute advance/release readiness client-side — use `advanceRequirements` / `readinessBlockers`.
❌ Assume one WO = one run — it's one phase; follow the chain.
❌ Hard-fail on null evidence — legacy gaps exist.
