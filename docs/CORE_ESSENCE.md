# VB Work Order - AmGraft® — Core Essence / Domain Model

This is the distilled understanding of the legacy app, written so the new Node.js app can be built generically enough to support **N products/workflows** while faithfully carrying forward the manufacturing execution logic.

## 1. What the app actually does

The app is a **Manufacturing Execution System (MES)** for tissue-engineered dental grafts.

A **production run** follows one graft type through a fixed sequence of phases. Each phase has a BOM of consumables/equipment, requires start/end signatures, and may need sterilisation/BET verification before the run can continue or close.

Legacy reality: only **one workflow** exists (AmGraft®). The new target: **many workflows**, one per product or product family.

## 2. Core entities and their jobs

| Entity | Job | Legacy table | Multi-workflow implication |
|---|---|---|---|
| **Workflow** | *New.* Defines a product line: ordered phases, phase-to-procedure mapping, units of measure, required sign-off points, sterilisation/BET gates | (implicit in single `procedure`/`phase` tables) | Becomes first-class: `Workflow` table |
| **Procedure** | A step/milestone inside a workflow | `procedure` | Belongs to a `Workflow` |
| **Phase** | A physical manufacturing stage. One phase can map to multiple procedures and has one BOM and valid equipment list | `phase` | Belongs to a `Workflow`; `procedureIds` becomes a join table |
| **BOM** | Header for a phase-specific bill of materials | `bom` | Belongs to a `Phase` |
| **BOM Line** | Individual consumable/material item with quantity, UOM, and serial/lot tracking flag | `bomLine` | Belongs to a `BOM` |
| **Equipment** | Physical equipment that may be used in one or more phases | `phaseEquip` | Independent master, linked by `WorkflowPhaseEquipment` |
| **Work Order** | A single production run instance. Tied to one workflow, one phase at a time, one HET batch | `workOrder` | Adds `workflowId`; `phaseId` is the current phase |
| **Manufacturer** | The production record for a completed/final batch. Generated when a work order reaches the manufacturing-number phase. Holds the batch HET IDs and the generated manu-number | `manufacturer` | Belongs to a `WorkOrder`; may be 1:1 per run |
| **HET** | Human Extracted Tooth batch. Imported from the external HET sheet. Tracks clinic, delivery/collection, and which work order(s) consumed it | `het` + `HETDeliveryReturnRecords` | Synced from external clinic logistics system |
| **Sterilisation** | IN/OUT cycle record for a work order batch. Captures result, BET reading, quantity, signature | `sterilise` | Belongs to a `WorkOrder` (or `Manufacturer`) |
| **Work-Order Serial** | Serial/lot numbers captured per BOM line during the run | `woSerial` | Belongs to a `WorkOrder` + `BOM Line` |
| **Staff / User** | Operator who signs in/out of phases and approves sterilisation | `staff` | Replaced by auth system; may still sync from Bitrix24 |
| **Clinic** | Dental clinic that supplied the HETs | `clinicDb` (external sheet) | Synced from HET logistics |

## 3. Production lifecycle

1. **Create work order**
   - Pick workflow / procedure / product type.
   - Pick an available HET batch (`hetId`).
   - App sets current phase to workflow phase #1.
   - Legacy bot `generateManuNumber` fires if the first phase is P6-equivalent (manufacturing-number generation).

2. **Run a phase**
   - Operator starts production (`prodStart`, `startSign`, `startSignBy`).
   - Operator consumes BOM lines; records serial numbers where `hasSerial = true`.
   - Operator selects valid equipment from the phase’s allowed list.
   - Operator ends production (`prodEnd`, `endSign`, `endSignBy`).
   - Production duration is computed.

3. **Move to next phase**
   - App advances `phaseOrder`.
   - Some phases are auto-advanced; others require sterilisation/BET pass.

4. **Sterilisation / BET gate**
   - A `sterilise` record is created with direction `OUT`, then another with direction `IN`.
   - `result` field is set TRUE/FALSE.
   - On sterilisation pass/fail, `steralisePassCloseWo` updates the work order.
   - On BET pass, `BETPassCloseWo` runs `closeAfterBET` on the work order.

5. **Finish / release**
   - Work order reaches final phase (legacy H28 = release to inventory).
   - Generate label (deferred).
   - Generate production batch record (deferred).
   - Generate work-order report PDF (deferred).
   - Mark HET as consumed (`usedBy`, `finishedBy`).

## 4. Key rules and invariants

- **One HET batch per work order.** The work order references a single `hetId`, but the `manufacturer` record keeps the full `batchHetIds` list (legacy flattened EnumList).
- **Immutable electronic signatures.** `startSign` and `endSign` are image files stored in a file backend. Once saved, they must never be overwritten; a new phase record should be created instead.
- **Traceability is the name of the game.** Every material serial, equipment ID, operator, timestamp, and HET lot must be linked to the work order and retained forever.
- **No data cleanup ever.** All historical records, including failed or abandoned runs, remain in the system.
- **HET consumption is tracked externally.** The external `HETDeliveryReturnRecords` sheet is the canonical HET source; the local `het` table is a working mirror.

## 5. Legacy bot → backend-service mapping

| Legacy bot | What it actually does | New implementation |
|---|---|---|
| `generateManuNumber` | On new WO at P6, create `manufacturer` row with batch HET IDs, run `B11ReplaceHet`, run `forceFieldWo` | Backend service `manufacturingService.createBatchFromWorkOrder()` |
| `useHetId` | Run `forceFieldHet` on linked HET | `hetService.markInUse(workOrderId, hetId)` |
| `finishWorkOrder` | Run `forceFieldHet` on linked HET | `hetService.markFinished(workOrderId, hetId)` |
| `steralisePassCloseWo` | On sterilisation result, update WO / close step | `sterilisationService.handleResult(steriliseId)` |
| `BETPassCloseWo` | On BET pass, close WO | `sterilisationService.handleBETPass(steriliseId)` |
| `Generate Label` | Print product label | Deferred (pdfmonkey / label printer integration) |
| `Generate Production Batch Record` | Generate batch PDF | Deferred |
| `Generate WorkOrder Report (Script)` | Generate WO report PDF | Deferred |

## 6. Multi-workflow design shift

Legacy schema hard-codes one workflow. The new schema needs:

- `Workflow` table: `workflowId`, `name`, `productType`, `version`, `isActive`, `uomDefault`.
- `WorkflowPhase` table: `workflowId`, `phaseId`, `order`, `isSterilisationGate`, `isBETGate`, `requiresEquipment`, `requiresSignatures`.
- `WorkflowPhaseProcedure` join: which procedures belong to a phase.
- `WorkflowPhaseEquipment` join: which equipment is valid for a phase.
- `WorkOrder.workflowId` foreign key.
- `Manufacturer` becomes the official batch record per work order, with the generated `manuNumber`.

The existing Prisma schema already has most tables; the next migration needs to introduce `Workflow` and the workflow-to-phase/equipment joins.

## 7. Next implementation priority

1. Update Prisma schema to add `Workflow` + workflow-phase/equipment joins.
2. Build backend services for work-order lifecycle, phase advancement, and signature capture.
3. Build HET sync service from the external sheet or its replacement API.
4. Build sterilisation/BET gate service.
5. Build frontend work-order execution view (start → consume materials → end → advance).
6. Defer labels and PDFs until the production flow works end-to-end.
