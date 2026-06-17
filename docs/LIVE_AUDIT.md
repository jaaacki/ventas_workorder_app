# VB Work Order - AmGraft® — Live AppSheet Audit

> Captured directly from the AppSheet editor and the live Google Sheets on 2026-06-17.
> This supplements the static analysis in `docs/ANALYSIS.md` and `docs/FEATURE_ANALYSIS.md` with ground-truth from the running app.

## 1. Live data sources

| Source | Spreadsheet / URL | Sheets / tabs discovered | Used for tables |
|---|---|---|---|
| `BOM_WO` | `https://docs.google.com/spreadsheets/d/1MTW18USJHOLCO7jNOLCnmaYPZ5S0Dte53Y5dwDWOJz0` | `workOrder`, `workOrder_temp`, `workOrder_bk`, `woSerial`, `phase`, `procedure`, `phaseEquip`, `bom`, `bomLine`, `manufacturer`, `staff`, `staff2`, `sterilise`, `WO_Numbers_Table`, `Sheet21`, `tempReport`, `woPdfReport`, `het` | All production tables except `printLabels` |
| `HETDeliveryReturnRecords` | `https://docs.google.com/spreadsheets/d/14uvxUpt-FqIY3YdgmiP9tT8hphkN_SHN-Ajj3YpxqEY` | `clinicDb`, `deliverCollect`, `Sheet4`, `staff`, `HETLot_TODEL` | External HET / clinic master data |

Notes:
- `printLabels` does **not** appear as a sheet in `BOM_WO` and has no source link in the AppSheet table editor. It is likely a generated/virtual table or a Google-Drive-folder table used only for label images.
- The `BOM_WO` spreadsheet also contains backup / helper tabs (`workOrder_temp`, `workOrder_bk`, `staff2`, `WO_Numbers_Table`, `Sheet21`, `tempReport`, `woPdfReport`) that are not exposed as real AppSheet tables.

## 2. Tables exposed in the live editor

The AppSheet editor lists exactly **12 real tables**:

`bom`, `bomLine`, `het`, `manufacturer`, `phase`, `phaseEquip`, `printLabels`, `procedure`, `staff`, `sterilise`, `workOrder`, `woSerial`.

`printLabels` is the only one whose source is not a `BOM_WO` worksheet in the editor, confirming it is a special label-printing construct.

## 3. Live view catalog (improved editor)

### Primary views (bottom navigation)
- `workOrder` → data `workOrderInProgress`, type `table`
- `workOrderComplete` → data `workOrderComplete`, type `table`
- `workOrderFinsh` (sic) → data `workOrderFinish`, type `table`

### Menu views
- `bom` → data `bom`, type `table`
- `manufacturer` → data `manufacturer`, type `table`
- `New View` → data `phaseEquip`, type `table`
- `phase` → data `phase`, type `table`
- `procedure` → data `procedure`, type `table`
- `staff` → data `staff`, type `table`
- `sterilise` → data `sterilise`, type `table`
- `workOrderAdmin` → data `workOrder`, type `table`
- `settings`

### Detail / form views (slices observed)
- `workOrderInProgress` (slice) with detail view `woInProgress_Details`
- `workOrderFinish` detail view `woInProgress_Details`

## 4. Automation bots observed

| Bot | Table / view | Event | Process / steps | Notes |
|---|---|---|---|---|
| `steralisePassCloseWo` | `sterilise` | `sterlisePassed` | conditional `Yes`/`No` branch → `steralisationResult`, `closeWo13` | If `result` = TRUE/FALSE, runs `steralisationResult` which updates the `result` field itself; `closeWo13` is the pass/fail close step |
| `BETPassCloseWo` | `sterilise` | `BETPassed` | `closeWo14` | Runs `closeAfterBET` action on `workOrder` rows `LIST([woId])` when BET passes |
| `generateManuNumber` | `workOrder` / `workOrderInProgress` | `newWoP6` | `generateNewManuNumber`, `b11ReplaceHet`, `forceFieldWo` | Runs when a new work order is created at phase P6 |
| `useHetId` | `workOrder` / `workOrderInProgress` | `addUpdateHet` | `forceFieldHet` | Runs `forceFieldHet` on the linked `het` record (`LIST([hetId])`) |
| `finishWorkOrder` | `workOrder` / `workOrderInProgress` | `finishWorkOrder` | `forceField_HET` | Runs `forceFieldHet` on the linked `het` record (`LIST([hetId])`) |
| `Generate Label` | `workOrder` / `workOrderInProgress` | Data change on `workOrder` | `Generate PDF` | Triggered by a data change; prints a product label |
| `Generate Production Batch Record` | `workOrder` / `workOrderInProgress` | `onH28` | `Generate Production Batch Record` | Generates the final batch PDF when a phase H28 condition is met |
| `Generate WorkOrder Report (Script)` | `workOrder` / `workOrderInProgress` | `onH29` | `callScript_GenerateWoReportPdf` | Calls the Google Apps Script / pdfmonkey integration |

### Step details captured from `generateManuNumber`

| Step | Action type | Target / rows | Key values / formula |
|---|---|---|---|
| `generateNewManuNumber` | Add row to this table | `manufacturer` | `batchHetIds = [batchHetIds]` |
| `b11ReplaceHet` | Run action on rows | `workOrder` rows `LIST([woId])` | action = `B11ReplaceHet` |
| `forceFieldWo` | Run action on rows | `workOrder` rows `SELECT(workOrder[woId], IN([hetId], [_THISROW].[batchHetIds])) + LIST([woId])` | action = `forceFieldWo` |

Interpretation: when a new work order is created at phase P6, the bot first creates the matching `manufacturer` row (copying the selected HET batch), then runs the `B11ReplaceHet` action on the current work order, and finally runs `forceFieldWo` against every work order that shares the same HET batch plus the current row to force recalculation.

### Step details captured from `useHetId` and `finishWorkOrder`

| Step | Action type | Target / rows | Key values / formula |
|---|---|---|---|
| `forceFieldHet` (used by both bots) | Run action on rows | `het` rows `LIST([hetId])` | action = `forceFieldHet` |

Interpretation: whenever a work order’s HET is assigned or the work order is finished, the bot runs `forceFieldHet` on the linked `het` record. The `forceFieldHet` action most likely writes the consuming work-order ID into `HETLot_TODEL.usedBy`, marking the HET as consumed.

## 5. HET workflow clarified from live sheets

The HET master workbook is **not** the same as `BOM_WO`. It has its own tab structure:

- `clinicDb` — clinic master (`clinicId`, `HCICode`, `clinicName`, `licenseName`, address, postal code, telephone, PIC).
- `deliverCollect` — every HET delivery/collection event (`deliverCollectId`, `hetId`, `hetNumber`, `parcelTrackingNumber`, `level`, `direction` = `DELIVER`/`COLLECT`, clinic details, `signature`, `signDate`, `remarks`, `includeNewDelivery`, `newParcelNo`, `newHetId`, `newHetNumber`, `newRemarks`, `forceField`).
- `HETLot_TODEL` — individual HET lots (`hetId`, `HETLotNumber`, `parcelTrackingNumber`, `deliverId`, `collectId`, `usedBy` ← references a work order, `delete`).

Key workflow insight:
- A clinic request triggers a `DELIVER` record. When the HET is consumed/returned, a `COLLECT` record is created. If `includeNewDelivery` is true, the collection also schedules the next delivery (`newHetId` / `newHetNumber`).
- The `usedBy` column in `HETLot_TODEL` links an HET lot to a `workOrder`, explaining how the manufacturing app knows which HET batch was used for a graft.

## 6. Data samples captured locally

CSV exports downloaded during the session were copied to `data/legacy/` for analysis. They contain production data, so treat them as sensitive and do not commit to a public repository.

| File | Source sheet | Description |
|---|---|---|
| `data/legacy/BOM-WO---workOrder.csv` | `BOM_WO.workOrder` | Live work orders with signatures, HET IDs, phase data |
| `data/legacy/BOM-WO---bom.csv` | `BOM_WO.bom` | Bill of materials header |
| `data/legacy/BOM-WO---bomLine.csv` | `BOM_WO.bomLine` | BOM line items |
| `data/legacy/BOM-WO---manufacturer.csv` | `BOM_WO.manufacturer` | Production phase execution rows |
| `data/legacy/BOM-WO---phase.csv` | `BOM_WO.phase` | Phase catalog |
| `data/legacy/BOM-WO---phaseEquip.csv` | `BOM_WO.phaseEquip` | Equipment per phase |
| `data/legacy/BOM-WO---procedure.csv` | `BOM_WO.procedure` | Procedure / graft catalog |
| `data/legacy/BOM-WO---staff.csv` | `BOM_WO.staff` | Staff master |
| `data/legacy/BOM-WO---sterilise.csv` | `BOM_WO.sterilise` | Sterilisation / BET records |
| `data/legacy/BOM-WO---woSerial.csv` | `BOM_WO.woSerial` | Work order serial / manu-number counter |
| `data/legacy/BOM-WO---het.csv` | `BOM_WO.het` | HET records mirrored in `BOM_WO` (possibly cached subset) |
| `data/legacy/BOM-WO---tempReport.csv` | `BOM_WO.tempReport` | Report template / placeholder data |
| `data/legacy/BOM-WO---woPdfReport.csv` | `BOM_WO.woPdfReport` | PDF report output table (currently empty) |
| `data/legacy/HETDeliveryReturnRecords---clinicDb.csv` | `HETDeliveryReturnRecords.clinicDb` | Clinic master |
| `data/legacy/HETDeliveryReturnRecords---deliverCollect.csv` | `HETDeliveryReturnRecords.deliverCollect` | HET delivery/collect log |
| `data/legacy/HETDeliveryReturnRecords---HETLot-TODEL.csv` | `HETDeliveryReturnRecords.HETLot_TODEL` | HET lot inventory / usage |

## 7. Still outstanding for complete legacy context

- [x] Export remaining `BOM_WO` sheets.
- [ ] Open each bot step in the AppSheet editor to capture exact action types, conditions, and formulas.
- [ ] Map AppSheet **Actions** and **Tasks** to the bot steps above.
- [ ] Clarify `printLabels`: how is it populated and where are label images stored?
- [ ] Capture all format rules, show/hide conditions, and slice definitions.
- [ ] Identify the pdfmonkey template(s) used for labels, batch records, and work-order reports.
- [ ] Confirm deployment target and file-storage backend (Google Drive images, signature files, generated PDFs).
- [ ] Confirm the BET vs. sterilisation sequence and the exact label/sticker printing process.
