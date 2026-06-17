# VB Work Order - AmGraft: Feature Analysis

This report is derived from:

- `/Users/noonoon/Dev/ventas_workorder_app/docs/ANALYSIS.md` — synthesized AppSheet specification
- `/Users/noonoon/Dev/ventas_workorder_app/docs/references/appsheet/workorder_appsheet_docs.txt` — raw 856-page AppSheet documentation export
- `/Users/noonoon/Dev/ventas_workorder_app/docs/references/google_script/*.js` — Google Apps Script integration files

Application name: **VB Work Order - AmGraft®** (AppSheet app version 1.001009).
AppSheet stats from the raw export: 30 tables, 957 columns, 12 slices, 54 views.

---

## 1. Executive Summary

**What it is.** The app is a digital manufacturing execution / work-order system for **AmGraft®** tissue-engineered graft production. It replaces a paper-based batch record and production log with a mobile/tablet AppSheet app backed by Google Sheets and Google Apps Script.

**Who uses it.**

- **Production staff** — create/select HET (Human/Engineered Tissue) donor batches, start phases, sign off on production steps, capture serial numbers and sterilisation results.
- **QA / sterilisation staff** — record BET (Biological Indicator / sterilisation) pass/fail readings, images and electronic signatures.
- **Supervisors / admins** — manage master data (procedures, phases, BOMs, phase equipment) and review completed work orders / batch records.
- **Users are synced from Bitrix24** into the `staff` table so the app reuses the corporate directory.

**Business process supported.**

The app tracks a graft from raw tissue receipt (HET) through a fixed sequence of production phases, each with an assigned BOM and equipment list. A central `workOrder` row drives the current phase, records start/end signatures, serialised components, sterilisation/BET results, and finally produces a PDF batch record and a work-order report.

---

## 2. Domain Overview

| Term | Meaning in this app |
|------|---------------------|
| **Procedure** | A catalogued graft type / product procedure. Defines what is being made (e.g., AmGraft® product variant). |
| **HET** | "Human/Engineered Tissue" — a donor or tissue batch record. The raw biological input to production. Has a unique `hetNumber`, donor/clinic details, and a calculated `b11Weight`. |
| **Phase** | One production step in the graft manufacturing workflow. Each phase is tied to a BOM and a list of allowable equipment. Phases have a strict numeric `order` (1, 2, 3 …). |
| **BOM** | Bill of Materials header. A reusable recipe. |
| **BOM Line** | A component/item inside a BOM. Some lines require serial numbers (`hasSerial = TRUE`), others do not. |
| **WO / Work Order** | The central production record. One row represents one phase execution for one HET. It links HET → phase → BOM → manufacturer and tracks signatures, outputs, and sterilisation. |
| **Manufacturer** | A third-party manufacturer/supplier batch number (`manuNumber`). Auto-created / linked to a WO so the manufacturer batch number can be printed on labels and reports. |
| **Serial Number / `woSerial`** | A child record that captures a serialised component consumed by a work order. One `woSerial` row per BOM line that requires serial tracking. |
| **Sterilise / BET** | A sterilisation test record attached to a work order. Captures result (pass/fail), `betReading`, quantity, image, comment and a signature. |
| **Label** | A PDF label generated at specific phases (3, 6, 9, 12). Stored in the `printLabels` Drive folder. |
| **Batch Record** | A PDF manufacturing batch record generated when a work order reaches phase 16 and is completed. |

---

## 3. Core Data Model Explained

The app exposes 12 real tables to users. All but `printLabels` are stored in the Google Sheet workbook `BOM_WO`; `printLabels` is a Google Drive folder exposed through AppSheet’s “Folder as a Table” feature.

### 3.1 `procedure` — product / graft procedure catalog

- **Represents:** the types of grafts/products that can be produced.
- **Why it exists:** it is the top-level selector when creating a work order; phases link to one or more procedures via `procedureIds`.
- **Key fields:**
  - `procedureId` — PK, initial value `CONCATENATE("PRO-", TEXT(TODAY(),"YYMMDD"), MID([keyText], RANDBETWEEN(...),1)...)` (3 random chars from `keyText`).
  - `procedureName`, `procedureShort`, `procedureDesc`.
  - `label` (virtual) = `[procedureShort] & " - " & [procedureName]` — used in dropdowns.
- **Relations:** referenced by `phase.procedureIds` (EnumList) and `workOrder` indirectly through phase selection.

### 3.2 `het` — tissue donor / batch record

- **Represents:** a single HET (tissue) batch received from a clinic/donor.
- **Why it exists:** production cannot start without a HET. The same HET can flow through multiple phases, and multiple HETs can be combined into a later batch (`batchHetIds`).
- **Key fields:**
  - `hetId` — PK, initial value `CONCATENATE("HET-", TEXT(TODAY(),"YYMMDD"), …)`.
  - `clinicId`, `HCICode`, `clinicName`, `address`, `hetNumber`, `parcelTrackingNumber`, `deliverId`, `collectId`.
  - `b11Weight` (virtual) = `INDEX(SELECT(workOrder[outPut], [hetId]=[_THISROW].[hetId] AND [phaseOrder]=5 AND ISNOTBLANK([prodEnd])),1)` — pulls the output weight from the B11 phase.
  - `usedBy` / `finishedBy` / `finishedWorkOrder_REF` — Refs back to `workOrder` indicating whether/where the HET has been used or finished.
  - `label` (virtual) = `[hetNumber] & IF(ISNOTBLANK([b11Weight]), " (" & [b11Weight] & " Grams)", "")`.
- **Relations:** parent of many `workOrder`s via `workOrder.hetId` and `workOrder.batchHetIds`.

### 3.3 `phase` — production step master data

- **Represents:** a step in the production recipe (e.g., decellularisation, packaging).
- **Why it exists:** phases define the sequence of work orders, the BOM to use, the unit of measure, and which equipment is valid.
- **Key fields:**
  - `phaseId` — PK, initial value `CONCATENATE("PHS-", TEXT(TODAY(),"YYMMDD"), …)`.
  - `procedureIds` (EnumList → `procedure`) — which procedures this phase belongs to.
  - `phaseName`, `phaseShort`, `phaseDesc`.
  - `bomId` (Ref → `bom`) — the BOM for this phase.
  - `order` (Number) — strict numeric ordering of the workflow.
  - `uom` (Enum) — Grams or Strips.
  - `virPhaseDesc` / `phaseStart` / `phaseEnd` (virtual) — parse a text representation of the phase list to identify the first/last phase names.
  - `bomLines` (virtual) = `SELECT(bomLine[bomLineId], [bomId]=[_THISROW].[bomId])`.
- **Relations:** referenced by `workOrder.phaseId`; equipment links via `phaseIds` on `phaseEquip`.

### 3.4 `workOrder` — central production record

- **Represents:** one execution of one phase for one (or combined) HET. It is the operational heart of the app.
- **Why it exists:** every signature, output quantity, serial record, sterilisation result and label is ultimately tied to a work order.
- **Key fields:**
  - `woId` — PK, initial value `CONCATENATE("WKO-", TEXT(TODAY(),"YYMMDD"), …)`.
  - `woNumber` — human-facing number; `virWoNumber` (virtual) auto-generates `WO` + 6-digit sequential value.
  - `hetId` (Ref → `het`) — primary HET.
  - `batchHetIds` (EnumList → `het`) — additional HETs combined into this batch.
  - `phaseId` (Ref → `phase`) — current phase; drives `phaseOrder`, `phaseShort`, `phaseBom`, `uom`.
  - `phaseEquipIds` (EnumList → `phaseEquip`) — equipment actually used.
  - `prodStart` / `prodEnd` (DateTime) — auto-timestamped when start/end signatures are captured.
  - `startSign` / `endSign` (Signature) + `startSignBy` / `endSignBy` (Ref → `staff`, auto-filled with `USEREMAIL()`).
  - `outPut` (Number) — quantity produced in this phase.
  - `image` — photo evidence, required before label generation.
  - `manuId` / `manuNumber` — linked manufacturer batch.
  - `previousWo` (Ref → `workOrder`) + `previousOutput` — chain to the prior phase for the same HET.
  - `steralisationCurrent` (Ref → `sterilise`) — latest sterilisation record.
  - `reportPdf` (File) — PDF generated via Apps Script.
  - `labelFile` (virtual) = `CONCATENATE([woId], ".pdf")`.
  - `productionState` (virtual) — complex status string used to group views.
  - `forceField` — dummy column used to trigger process bots.
- **Relations:** parent of `woSerial`, `sterilise`; child of `het`, `phase`, `bom`, `manufacturer`; self-referential for phase chaining.

### 3.5 `staff` — users / employees

- **Represents:** people who can use the app.
- **Why it exists:** created signatures and audit fields must point to a real person; the app syncs Bitrix24 users so signatures map to staff records.
- **Key fields:** `ID`, `ACTIVE`, `NAME`, `SECOND_NAME`, `LAST_NAME`, `EMAIL`, `PERSONAL_MOBILE`, `DATE_REGISTER`, `permission`, `appRole`.
- **Relations:** referenced by every `createdBy`, `updatedBy`, `startSignBy`, `endSignBy`, `signBy` column.

### 3.6 `manufacturer` — supplier / manufacturer batch

- **Represents:** a third-party manufacturer/supplier and its batch number.
- **Why it exists:** each work order needs a `manuNumber` for labels and traceability. Manufacturer rows are auto-generated/linked via process bots.
- **Key fields:**
  - `manuId` — PK, initial value `CONCATENATE("MAN-", TEXT(TODAY(),"YYMMDD"), …)`.
  - `manuNumber` — generated code based on date letters, sequence, and year letters. Formula includes `entryCountToday`.
  - `batchHetIds` (EnumList → `het`) — which HETs this manufacturer batch covers.
  - `entryCountToday` (virtual) = `COUNT(SELECT(manufacturer[manuId], TEXT([createdOn],"DD MMYYYY") = TEXT(TODAY(),"DDMMYYYY")))+1` — **note the suspected date-format mismatch** (see Risky Areas).
- **Relations:** referenced by `workOrder.manuId` and `sterilise.manuId`.

### 3.7 `bom` — Bill of Materials header

- **Represents:** a reusable recipe / BOM.
- **Why it exists:** each phase points to one BOM; the BOM expands into lines that tell the operator what components to consume.
- **Key fields:** `bomId` (PK, `BOM-YYMMDD…`), `bomName`.
- **Relations:** parent of `bomLine`; referenced by `phase.bomId` and `workOrder.phaseBom`.

### 3.8 `bomLine` — BOM component line

- **Represents:** one item/component inside a BOM.
- **Why it exists:** production staff need to know what to use and whether a component needs a serial number.
- **Key fields:**
  - `bomLineId` — PK, `BOL-YYMMDD…`.
  - `bomId` (Ref → `bom`).
  - `itemName`, `quantity`, `uom`.
  - `hasSerial` (Yes/No) — whether serial tracking is required.
  - `deleted` (Yes/No) — soft-delete flag.
- **Relations:** parent of `woSerial` via `woSerial.bomRef`; child of `bom`.

### 3.9 `woSerial` — serialised component usage

- **Represents:** a serial number captured for a BOM line that requires serial tracking.
- **Why it exists:** traceability of consumables/inputs; `workOrder.serialCheckDone` validates that every serial-required BOM line has at least one serial recorded.
- **Key fields:**
  - `woSerialId` — PK, `WOS-YYMMDD…`.
  - `woId` (Ref → `workOrder`), `bomRef` (Ref → `bomLine`).
  - `serialNumber` — the scanned/entered serial.
  - `bomLineItems` (virtual) = `[woId].[bomLineItems]`; `bomLineEntryCount`; `woSerialDone`.
- **Relations:** child of `workOrder` and `bomLine`.

### 3.10 `sterilise` — sterilisation / BET record

- **Represents:** one sterilisation test event for a work order / manufacturer batch.
- **Why it exists:** it is the QA gate that moves the work order from “In Progress” to “Quarantine” or from “Quarantine” to closed.
- **Key fields:**
  - `sterId` — PK, `STE-YYMMDD…`.
  - `woId` (Ref → `workOrder`), `manuId` (Ref → `manufacturer`), `batchHetId` (EnumList → `het`).
  - `direction` (Enum), `result` (Yes/No), `betReading` (Decimal), `quantity`, `comment`, `image`.
  - `signOn` / `signBy` (Ref → `staff`) + `signature` — electronic sign-off.
  - `label` (virtual) = pass/fail prefix + WO number + manufacturer number.
- **Relations:** child of `workOrder`; referenced by `workOrder.steralisationCurrent`.

### 3.11 `phaseEquip` — equipment / assets

- **Represents:** a piece of production equipment that can be used in one or more phases.
- **Why it exists:** a work order must record which equipment was used; the valid list is filtered by the current phase.
- **Key fields:** `id` (PK, `PHQ-YYMMDD…`), `equipId`, `name`, `description`, `phaseIds` (EnumList → `phase`).
- **Relations:** referenced by `workOrder.phaseEquipIds` and `workOrder.validPhaseEquipIds`.

### 3.12 `printLabels` — generated label PDFs

- **Represents:** PDF label files stored in a Google Drive folder, exposed as rows.
- **Why it exists:** the app needs a quick way to let users open pre-generated label PDFs by treating the Drive folder contents as a read-only table.
- **Key fields:** `_ID`, `Path`, `File`, `CreateTime`, `LastModifiedBy`, `MimeType`.
- **Relations:** none in the model; linked at runtime by matching `workOrder.labelFile` to a file name in the folder.

---

## 4. End-to-End Workflow Walkthrough

A typical graft production run looks like this:

### 4.1 Create / select HET

1. A production user creates a new `het` record (or selects an existing one).
2. The HET receives an auto-generated `hetId` (`HET-YYMMDDxxx`) using the `keyText` random-character workaround.
3. `het` status remains available until a work order marks it `usedBy` / `finishedBy`.

### 4.2 Create a work order

1. A user creates a `workOrder`.
2. `woId` is auto-generated (`WKO-…`).
3. `virWoNumber` computes a running sequence: `"WO" & RIGHT("000000" & ([entryCount] + 58 + 1), 6)`.
4. The user selects:
   - `hetId` (primary HET)
   - `phaseId` (production step)
5. Derivation formulas fire:
   - `phaseOrder` = `[phaseId].[order]`
   - `phaseShort` = `[phaseId].[phaseShort]`
   - `phaseBom` = `[phaseId].[bomId]`
   - `uom` = `[phaseId].[uom]`
   - `bomLineItems` = `SELECT(bomLine[bomLineId], [bomId]=[_THISROW].[phaseBom])`
   - `validPhaseEquipIds` = valid equipment for the phase
   - `manuId` auto-resolves to a manufacturer whose `batchHetIds` contain the selected HET.

### 4.3 Start production / signatures

1. When `hetId` is first set, `prodStart` initial-value formula fires: `=IF(AND(ISBLANK([_THIS]), ISNOTBLANK([hetId])), NOW(), [_THIS])`.
2. The operator captures `startSign`; `startSignBy` becomes the current user’s email.
3. The operator selects the equipment used (`phaseEquipIds`).
4. The operator records outputs:
   - `outPut` quantity
   - Serial numbers for every `bomLine` where `hasSerial = TRUE` (creates `woSerial` rows)
   - `serialCheckDone` validates `COUNT([bomLineItems]) - COUNT([woSerials]) = 0`.
5. The operator captures `endSign`; `prodEnd` becomes `NOW()` and `endSignBy` is set.

### 4.4 Serial number tracking

- For each serial-required BOM line, the user creates a `woSerial` row.
- `woSerial.bomRef` points to the BOM line; `woSerial.woId` points to the work order.
- The app uses `serialCheckDone` on the parent work order to block progression if serials are missing.

### 4.5 Label generation

- At phases 3, 6, 9 and 12, after `prodEnd` is set and before an `image` is attached, the action **Generate Label** is visible.
- It navigates to a PDF whose name is `workOrder.labelFile` = `[woId].pdf` in the `printLabels` folder.
- This only works if a matching file already exists in the Drive folder; the app does not visibly generate the PDF from within AppSheet.

### 4.6 Sterilisation pass / fail

1. A sterilisation/BET record (`sterilise`) is added to the work order.
2. The user enters:
   - `result` (pass/fail)
   - `betReading`
   - `quantity`
   - `image`
   - `signature` + optional comment
3. `workOrder.steralisationCurrent` always points to the latest related sterilisation record via `INDEX([Related sterilises], COUNT([Related sterilises]))`.
4. `workOrder.productionState` re-evaluates:
   - If `steralisationCurrent` exists but `result` is blank → "3. In Quarantine (date)"
   - If `result` is pass/fail → status changes accordingly.

### 4.7 BET pass / close

- If the sterilisation/BET passes, a process bot (BETPassCloseWo / closeAfterBET) is triggered, closing the current work order and/or creating the next one.
- If it fails, the work order stays in quarantine until a passing re-test is recorded.

### 4.8 Previous / next phase chaining

- `previousWo` is computed as the work order for the same `hetId` with `phaseOrder = [phaseOrder]-1`.
- `previousOutput` shows the prior phase’s output + UOM, so the current operator can verify input quantity.
- The **Next Phase** action creates a new work order for `phaseOrder + 1`, pre-linked to the same HET and batch.
- When a later-phase work order exists, earlier work orders for the same HET show `productionState = "5. WO Completed"` because `phaseOrderCurrent` (the max phase order across all WOs for this HET) is now greater than their own `phaseOrder`.

### 4.9 Status changes

`productionState` is the user-facing status. The raw export reveals the full formula:

```
=IF([phaseOrderCurrent]=[phaseOrder],
   IF(AND(ISNOTBLANK([prodStart]),ISNOTBLANK([prodEnd])),
      IF([phaseOrder]<16,
         "2. Next Phase" & IF(ISNOTBLANK([phaseId].[phaseShort]),": "&[phaseId].[phaseShort],""),
         "4. Finished Goods"),
      IF(OR(ISBLANK([steralisationCurrent]),ISBLANK([steralisationCurrent].[result])),
         "1. In Progress" & IF(ISNOTBLANK([phaseId].[phaseShort]),": "&[phaseId].[phaseShort],""),
         "3. In Quarantine ("&TEXT([steralisationCurrent].[createdOn],"DD-MM-YY")&")")
   ),
   "5. WO Completed")
```

`phaseOrderCurrent` is itself a workaround to find the leading phase for a HET:

```
=IF([combinedHetCheck],
   INDEX(SELECT(workOrder[phaseOrder], CONTAINS([batchHetIds],[_THISROW].[hetId])), COUNT(...)),
   INDEX(SELECT(workOrder[phaseOrder], [hetId]=[_THISROW].[hetId]), COUNT(...)))
```

This means status is **relative** to the latest work order created for the same HET/batch.

---

## 5. Feature Catalog

### 5.1 Work Order Management

- Create, edit and view work orders.
- Auto-generated `woId` and `woNumber`.
- Grouped list views by `productionState` (`workOrderComplete`, `workOrder`, `workOrderFinsh`).
- Inline views for work order details, in-progress state, finished state, serial entry, and finalisation (`finalizeWo`, `woComplete_Details`, `woFinish_Detail`, `workOrderSeq`).
- Start/end signature capture with automatic timestamp and user stamp.
- Next-phase navigation and previous-phase lookup.
- Close after sterilisation / BET pass.
- View generated WO report PDF (`reportPdf`).

### 5.2 HET Management

- Create/select HET donor/batch records.
- Auto-generated `hetId`.
- Track HET usage (`usedBy`, `finishedBy`, `finishedWorkOrder_REF`).
- Combined HET batches via `batchHetIds`.
- `combinedHetCheck` identifies whether a HET has been used in a combined batch.
- `b11Weight` rolls up output from phase 5 (B11) for combined-weight calculations.

### 5.3 Phase & BOM Tracking

- Master phase catalog with strict numeric ordering.
- Phase-to-BOM linkage (`phase.bomId`).
- Phase-to-procedure linkage (`phase.procedureIds`).
- BOM header/lines with serial-required flag.
- Soft-delete flag on BOM lines (`deleted`).
- Phase equipment filtering (`validPhaseEquipIds`).

### 5.4 Serial Number Tracking

- `woSerial` child records per BOM line.
- Serial-required validation (`serialCheckDone`).
- Count of remaining BOM lines without serials.

### 5.5 Sterilisation / BET

- Add sterilisation/BET records to a work order.
- Pass/fail `result`, `betReading`, `quantity`, image, comment.
- Electronic signature with timestamp and signer.
- Automatic update of `workOrder.steralisationCurrent`.
- Quarantine status until result is recorded.
- Close work order after pass/fail via process bots.

### 5.6 Labels & PDF Reports

- Open label PDFs from the `printLabels` folder at phases 3, 6, 9, 12.
- Generate production batch record PDF (phase 16, after `prodEnd`).
- Generate work-order report PDF via Google Apps Script wrapper.
- Open PDF attachments directly from the app.

### 5.7 Master Data

- Procedure catalog.
- Staff directory (synced from Bitrix24).
- Manufacturer / supplier master.
- Equipment master (`phaseEquip`).

### 5.8 Admin / Sync / Utilities

- Bitrix24 staff sync (`staffPopulator.js`).
- Google Apps Script backend for PDFs and batch updates.
- Tamotsu ORM for direct sheet access (`config.js`, `temp.js`).
- Process bots for actions AppSheet cannot express as simple formulas.

### 5.9 Audit Trail

- `createdOn`/`createdBy`, `updatedOn`/`updatedBy` on every master table.
- Signature columns with `signOn` and `signBy`.
- `USEREMAIL()` and `NOW()` formulas stamped automatically.

---

## 6. How Each Feature Is Implemented in AppSheet

### 6.1 Tables and the Google Sheet backend

Every real table is a sheet/tab inside the Google Sheet `BOM_WO` (spreadsheet ID `1MTW18USJHOLCO7jNOLCnmaYPZ5S0Dte53Y5dwDWOJz0`), except `printLabels` which is a Drive folder. AppSheet reads/writes rows directly to these sheets.

### 6.2 Auto-generated IDs

No built-in UUID. Each PK uses a virtual `keyText` column:

```
keyText = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
```

and an `Initial value` formula such as:

```
=CONCATENATE("WKO-", TEXT(TODAY(),"YYMMDD"),
  MID([keyText], RANDBETWEEN(1, LEN([keyText])), 1),
  MID([keyText], RANDBETWEEN(1, LEN([keyText])), 1),
  MID([keyText], RANDBETWEEN(1, LEN([keyText])), 1))
```

This is repeated across `procedure`, `het`, `phase`, `workOrder`, `manufacturer`, `bom`, `bomLine`, `woSerial`, `sterilise`, and `phaseEquip`.

### 6.3 Status and validation formulas

- `productionState` — virtual Text column with nested `IF`s.
- `phaseOrderCurrent` — virtual Number that uses `INDEX(..., COUNT(...))` to get the maximum phase order for the HET or batch.
- `duplicatePhaseCheck` — `COUNT(SELECT(workOrder[phaseOrder], [hetId]=... AND [phaseOrder]=...))` prevents duplicate phase rows for the same HET.
- `serialCheckDone` — `COUNT([bomLineItems]) - COUNT([woSerials]) = 0`.
- `validPhaseEquipIds` — `SELECT(phaseEquip[id], CONTAINS([phaseIds],[_THISROW].[phaseId]), TRUE)`.

### 6.4 Signatures and audit stamps

Signature fields use `Signature` type. Associated user/date fields are formula-driven:

```
startSignBy = IF(AND(ISNOTBLANK([startSign]), ISBLANK([_THIS])), USEREMAIL(), [_THIS])
prodEnd     = IF(AND(ISNOTBLANK([endSign]), ISBLANK([_THIS])), NOW(), [_THIS])
updatedOn   = NOW()
updatedBy   = USEREMAIL()
```

### 6.5 Views

Views are defined per table. Examples:

- `workOrder` / `workOrderComplete` / `workOrderFinsh` — grouped tables in the left/center positions, grouped by `productionState` and sorted by `woNumber`.
- `workOrderInProgress_Detail` / `workOrderInProgress_Form` — custom detail/form views for the active state.
- Reference-position inline views (`*_Inline`) are attached to every table so child records appear inside parent detail forms.

### 6.6 Actions

Actions are the user-facing triggers:

- **Navigation actions** (`NAVIGATE_APP`) — open related records (e.g., View Ref `hetId`, `phaseId`, `manuId`, `steralisationCurrent`).
- **Data-change actions** (`SET_COLUMN_VALUE`) — set `forceField`, `closeAfterSteralise`, `closeAfterBET`, `B11ReplaceHet`, `generateWoReport`. These exist solely to trigger process bots.
- **Conditional display actions** — `woGenerateLabel`, `viewProductionBatchRecord`, `viewWoReportPdf` only appear when the right state is reached.
- **Add-child actions** — `manuNumber` is a conditional `ADD_RECORD_TO` into `manufacturer`; `addNewCollection` navigates to related workflows.

### 6.7 Process bots

AppSheet process bots run on hidden process tables that mirror the `workOrder` schema plus step/output columns. The bots are needed because AppSheet cannot directly invoke external services or complex multi-row updates from a simple action.

Known process bots and their apparent purpose:

| Bot / process table | Output table | Apparent purpose |
|---------------------|--------------|------------------|
| `generateManuNumber` | `generateNewManuNumber Output` | Create/link a manufacturer record and `manuNumber` for a work order. |
| `finishWorkOrder` | `forceField_HET Output`, `closeWo14 Output` | Mark HET as finished and/or close the WO. |
| `sterilisePassCloseWo` | `closeWo13 Output` | Close a WO after a sterilisation record is recorded. |
| `BETPassCloseWo` | `closeWo14 Output` | Close a WO after a BET pass. |
| `useHetId` | (unknown output) | Mark a HET as used by a work order. |
| `Generate Label` | ( Drive folder `printLabels`) | Produce/refresh a label PDF. |
| `Generate Production Batch Record` | `generateBatchRecord Output` | Produce a production batch-record PDF. |
| `Generate WorkOrder Report (Script)` | `callScript_GenerateWoReportPdf Output` | Call the Google Apps Script PDF wrapper. |

These are triggered by setting `forceField` or another dummy column, then a hidden `REF_ACTION` chains the bot.

### 6.8 Google Apps Script integration

- `config.js` stores AppSheet API credentials and Bitrix webhook keys in script properties.
- `appsheet.service.js` wraps the AppSheet REST API (`editRow`, `deleteRow`) so the script can write back to AppSheet.
- `wrapperForAppSheet.js` exposes `generateWoReportPdf(hetIdOrHetNumber, woId)`, which calls an external Apps Script library (`BOM_WO_SHEET`) and writes the returned PDF path into `workOrder.reportPdf` (and resets `forceField` so the process bot can run again later).
- `staffPopulator.js` + `bitrixHelper.js` pull active Bitrix24 users via `user.search` and write them to the `staff` sheet.
- `temp.js` contains a one-off batch repair routine `findPhaseEquip()` that scans a `workOrder_temp` table and fills `phaseEquipIds`.

---

## 7. AppSheet Limitations and Their Consequences

### 7.1 Random IDs: why `keyText` exists

AppSheet has no native random-alphanumeric generator. The app keeps a virtual column `keyText = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"` and uses `MID([keyText], RANDBETWEEN(1, LEN([keyText])), 1)` three times to build human-readable prefixed IDs. This is repeated for every table.

### 7.2 Triggering process bots: why `forceField` exists

AppSheet actions cannot directly call a process bot. The app therefore defines dummy numeric columns (`forceField` on `workOrder`, `het`, `manufacturer`) and actions that set them. A hidden `REF_ACTION` then fires the process bot as a data-change event. The bot usually resets `forceField` to blank at the end so it can be triggered again.

### 7.3 Hidden / never-visible process and output tables

The export lists tables whose `Visible?` flag is `NEVER` and whose source paths are under `/ProcessStateTables/`. These are required by AppSheet process architecture but are not user data. They hold transient state and outputs such as `generateNewManuNumber Output`, `forceFieldWo Output`, `closeWo13 Output`, `closeWo14 Output`, `generateBatchRecord Output`, and `callScript_GenerateWoReportPdf Output`. The parent `workOrder` table has hidden reference columns pointing to these outputs.

### 7.4 Why formulas are convoluted

- **No local variables / CTEs:** `phaseOrderCurrent` needs to compute a SELECT list twice (once for the value, once for the COUNT) just to retrieve the last row by index.
- **EnumLists as comma-delimited strings:** AppSheet stores multi-valued refs as delimited strings. The app uses `CONTAINS([batchHetIds], [hetId])` and `SPLIT(..., " , ")` to simulate array membership and to parse `virPhaseDesc` into first/last phase names.
- **Max lookup via `INDEX(..., COUNT(...))`:** to find the latest related sterilisation record, the app counts related rows and indexes into them.
- **Status machine in one formula:** `productionState` encodes the entire state machine in a single nested `IF` because AppSheet does not provide a state-machine construct.

### 7.5 Why the Google Apps Script wrapper exists for PDFs

AppSheet can store files but cannot generate complex PDF reports with mixed data from multiple tables. The app delegates report generation to an external Apps Script project (`BOM_WO_SHEET`, referenced as a library in `appsscript.json`). `wrapperForAppSheet.js` bridges the two: it is invoked by the AppSheet process bot, calls the library, then writes the resulting file path back to `workOrder.reportPdf` via the AppSheet API.

### 7.6 Why `printLabels` is a folder-as-table

Labels are stored as PDF files in a Google Drive folder rather than as row data. AppSheet’s “Folder as a Table” feature exposes those files as rows, letting the app open a label by matching `workOrder.labelFile` (`[woId].pdf`) against the folder contents. This avoids building a custom file browser inside AppSheet.

### 7.7 Why there is a `workOrder_temp` table

`temp.js` references a sheet/tab called `workOrder_temp` that is not in the visible 12-table list. It appears to be a utility/process output table used for a batch fix that populates `phaseEquipIds` by scanning work orders and matching them to equipment phase lists. This indicates the live app once needed a back-fill repair script.

### 7.8 Multi-select references stored as strings

`batchHetIds`, `phaseEquipIds`, and `phaseIds` are EnumLists. Formulas that need to test membership use `CONTAINS` rather than true relational joins, which is fragile if ID values appear as substrings of each other.

### 7.9 Audit columns on every table

Every table repeats `createdOn`, `createdBy`, `updatedOn`, `updatedBy` because AppSheet does not provide a global audit-log table. This repetition is part of why the app reaches 957 columns across only 30 tables.

---

## 8. Integration Points

| Integration | What it does | Why it exists |
|-------------|--------------|---------------|
| **Bitrix24** | `staffPopulator.js` calls `https://ventasbio.bitrix24.com/rest/user.search`, filters `ACTIVE=true`, and writes users into the `staff` sheet. `config.js` stores `notifyBotKey` and `techDevops` webhook keys but the visible code only uses the user-search endpoint. | AppSheet has no native Bitrix connector; the script makes the corporate directory available for signatures and permissions. |
| **External PDF library (`BOM_WO_SHEET`)** | Referenced as an Apps Script library in `appsscript.json` (`libraryId: 18Ig3sc-V3n5SRQqjVI_pVm_Jeo6ONJb-WOAjq97hPWxeUZ91U3i9OeWL`). It generates WO report PDFs. | AppSheet cannot natively render multi-table PDF batch records. |
| **AppSheet REST API** | `appsheet.service.js` implements `editRow` and `deleteRow` against the AppSheet server using an application ID and access key stored in script properties. | The Google Apps Script backend must write PDF results and reset `forceField` back into AppSheet. |
| **Google Sheets as DB** | All transactional and master data lives in the `BOM_WO` spreadsheet. AppSheet forms read from and write to these sheets. | AppSheet’s native data source for this app is Google Sheets. |
| **Google Drive labels folder** | The `printLabels` folder is mounted as a table. PDF labels are opened from there. | Provides a lightweight label document store without custom file management. |
| **Tamotsu library** | A Google Apps Script ORM used in `config.js` and `temp.js` to query/update sheets directly. | Easier direct sheet manipulation than raw `SpreadsheetApp` code. |

---

## 9. Risky / Fragile Areas

1. **Hard-coded phase logic.** Phases 3, 6, 9, 12 are label phases; phase 5 is the B11 weight phase; phase 16 appears to be the final batch-record phase. These numbers are embedded in formulas and action conditions. Adding/removing/reordering phases will break the app unless every formula is updated.

2. **`productionState` status machine is a single nested formula.** It is difficult to debug and easy to break if the sterilisation reference becomes stale.

3. **`phaseOrderCurrent` uses `COUNT(...)` as a max-lookup idiom.** If two work orders share the same `phaseOrder` for the same HET, `COUNT` returns the number of rows, not necessarily the max order, because `INDEX(SELECT(...), COUNT(...))` only works correctly when the selected list is ordered by `phaseOrder`. AppSheet does not guarantee ordering unless an explicit sort is applied.

4. **`combinedHetCheck` relies on `CONTAINS`.** If one HET ID is a substring of another, membership tests can return false positives.

5. **Manufacturer `entryCountToday` date-format mismatch.** The formula compares `TEXT([createdOn],"DD MMYYYY")` with `TEXT(TODAY(),"DDMMYYYY")`. The formats differ (space vs. no space), so the daily counter may be wrong, causing duplicate or non-sequential `manuNumber`s.

6. **Race conditions in auto-numbering.** `virWoNumber`, `virBatchId`, `manuNumber`, and all prefixed IDs use `COUNT` of the entire table. Concurrent users can produce duplicate numbers because there is no atomic sequence.

7. **Circular / self-referential HET refs.** `het.usedBy`, `het.finishedBy`, and `het.finishedWorkOrder_REF` point back to `workOrder`, while `workOrder.hetId` points to `het`. This is needed for the UI but can create recalculation loops.

8. **Process-bot dependency on `forceField`.** If a process bot fails silently, the dummy column may not be reset, blocking future triggers. There is no visible error handling in the script wrapper.

9. **`printLabels` depends on files already existing with the exact name `[woId].pdf`.** If the file is missing or renamed, the action will fail or open the wrong document.

10. **`workOrder_temp` is undocumented.** It is not listed in the 12 visible tables but is referenced by the repair script. Its purpose and how it gets populated are unclear.

11. **PDF generation is opaque.** The `BOM_WO_SHEET` library source is not in this repository. If the library changes or its deployment URL changes, reports will break.

12. **Bitrix sync is one-way and manual/trigger-based.** There is no evidence of a schedule or automatic delta sync in the provided scripts; stale staff records are likely.

13. **Soft-delete `bomLine.deleted` is not consistently enforced.** Other formulas reference `bomLine` directly without filtering out `deleted` rows.

---

## 10. Open Questions / Assumptions

The following would need confirmation before a faithful rebuild or migration:

1. **Process bot trigger mapping.** Which user action (or data change) fires each process bot, and in what order? Specifically:
   - Does selecting a HET on a new work order trigger `useHetId`?
   - Does saving a new work order trigger `generateManuNumber`?
   - Is `closeAfterSteralise` the action that runs `sterilisePassCloseWo`, and `closeAfterBET` the action that runs `BETPassCloseWo`?
   - When is `finishWorkOrder` triggered vs `BETPassCloseWo`?

2. **PDF generation entry point.** Is `wrapperForAppSheet.js` exposed as a web app and called via URL from the AppSheet process bot, or invoked through the Apps Script Execution API? What are the exact request/response parameters?

3. **Label creation.** Are label PDFs created by a process bot, by the external PDF library, or uploaded manually? What determines their presence in the `printLabels` folder?

4. **`B11ReplaceHet` purpose.** Does this process replace the primary HET with a new one after the B11 weight phase, or update combined HETs? When does it run?

5. **`workOrder_temp` lifecycle.** What populates `workOrder_temp`, and is `findPhaseEquip()` still used in production or just a historical repair script?

6. **Phase numbering semantics.** Is phase 16 definitively the final batch-record phase? Are phases 3/6/9/12 the only label phases, and phase 5 the only B11 phase?

7. **`batchHetIds` population.** Are combined HETs selected by the user on a later work order, or derived automatically based on some matching rule?

8. **`forceField` values.** What value is written into `forceField`, and how/when is it reset? Is it used purely as a change-event trigger, or does the actual value carry meaning?

9. **Bitrix notifications.** The config defines `NotifyBotUrl` and `TechDevops` but the visible scripts only call `user.search`. Are notifications or other Bitrix methods used elsewhere?

10. **Offline behaviour.** Does the app rely on AppSheet offline sync? If so, timestamp formulas like `NOW()` may be stale when the device comes back online.

11. **Deployment / roles.** Are `appRole` and `permission` columns from Bitrix actually used for AppSheet security, or are they informational only?

12. **Data archival.** Is there any cleanup process for old process/output table rows, or do they accumulate indefinitely?

13. **Audit and compliance.** Are electronic signatures required to be non-editable after capture? Currently the signature columns are editable fields with formulas that freeze the signer only when blank.

---

*End of feature analysis.*
