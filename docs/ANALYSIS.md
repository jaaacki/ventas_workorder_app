# VB Work Order - AmGraft: AppSheet Specification

Generated from the AppSheet documentation export for **VB Work Order - AmGraft®** (version 1.001009).

## 1. Tables

| Table | Visible | Shared | Data source | Key field | Purpose |
|---|---|---|---|---|---|
| **procedure** | ALWAYS | Yes | Google Sheets / `BOM_WO` / `procedure` | procedureId | Master catalogue of procedures / graft types |
| **het** | ALWAYS | Yes | Google Sheets / `BOM_WO` / `het` | hetId | Human/Engineered tissue (HET) donor/batch records |
| **phase** | ALWAYS | Yes | Google Sheets / `BOM_WO` / `phase` | phaseId | Production phases/steps, each tied to a BOM and equipment list |
| **workOrder** | ALWAYS | Yes | Google Sheets / `BOM_WO` / `workOrder` | woId | Central work orders driving the production workflow |
| **staff** | ALWAYS | Yes | Google Sheets / `BOM_WO` / `staff` | EMAIL | Users/employees synced from Bitrix24 |
| **manufacturer** | ALWAYS | Yes | Google Sheets / `BOM_WO` / `manufacturer` | manuId | Third-party manufacturers / suppliers |
| **bom** | ALWAYS | Yes | Google Sheets / `BOM_WO` / `bom` | bomId | Bill of Materials headers |
| **bomLine** | ALWAYS | Yes | Google Sheets / `BOM_WO` / `bomLine` | bomLineId | BOM line items / components |
| **woSerial** | ALWAYS | Yes | Google Sheets / `BOM_WO` / `woSerial` | woSerialId | Serialised items assigned to a work order |
| **sterilise** | ALWAYS | Yes | Google Sheets / `BOM_WO` / `sterilise` | sterId | Sterilisation (BET) test records |
| **printLabels** | ALWAYS | Yes | Google Drive folder / `printLabels` / `Folder as a Table` | _ID | Generated label PDFs stored in a Google Drive folder |
| **phaseEquip** | ALWAYS | Yes | Google Drive folder / `BOM_WO` / `phaseEquip` | id | Equipment/assets available for production phases |

## 2. Schemas (important columns)

### procedure

| Column | Type | Key | RO | Virtual | References / enum | Formula (notable) |
|---|---|---|---|---|---|---|
| procedureId | Text | PK |  |  |  |  |
| createdOn | DateTime |  |  |  |  |  |
| createdBy | Ref |  |  |  | staff |  |
| updatedOn | DateTime |  |  |  |  | =NOW() |
| updatedBy | Ref |  |  |  | staff | =USEREMAIL() |
| procedureName | Name |  |  |  |  |  |
| procedureDesc | LongText |  |  |  |  |  |
| procedureShort | Text |  |  |  |  |  |
| keyText | Text |  | Yes | Yes |  | ="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789" |
| label | Text |  | Yes | Yes |  | =[procedureShort]&" - "&[procedureName] |

### het

| Column | Type | Key | RO | Virtual | References / enum | Formula (notable) |
|---|---|---|---|---|---|---|
| hetId | Text | PK |  |  |  |  |
| createdOn | DateTime |  |  |  |  |  |
| createdBy | Ref |  |  |  | staff |  |
| updatedOn | DateTime |  |  |  |  | =NOW() |
| updatedBy | Ref |  |  |  | staff | =USEREMAIL() |
| clinicId | Text |  |  |  |  |  |
| HCICode | Text |  |  |  |  |  |
| clinicName | Name |  |  |  |  |  |
| licenseName | Name |  |  |  |  |  |
| address | Address |  |  |  |  |  |
| hetNumber | Text |  |  |  |  |  |
| parcelTrackingNumber | Number |  |  |  |  |  |
| deliverId | Text |  |  |  |  |  |
| collectId | Text |  |  |  |  |  |
| usedBy | Ref |  |  |  | workOrder | =INDEX(SELECT(workOrder[woId], AND([hetId] = [_THISROW]. [hetId], NOT([delete]))),1) |
| finishedBy | Ref |  |  |  | workOrder | =IF(ISNOTBLANK([finishedWorkOrder_REF]), [finishedWorkOrder_REF],"") |
| quantity | Number |  |  |  |  | =IF(ISNOTBLANK([finishedWorkOrder_REF]), [finishedWorkOrder_REF].[outPut], "") |
| delete | Yes/No |  |  |  |  |  |
| forceField | Number |  |  |  |  |  |
| keyText | Text |  | Yes | Yes |  | ="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789" |
| b11Weight | Number |  | Yes |  |  | =INDEX(SELECT(workOrder[outPut], AND( [hetId] = [_THISROW]. [hetId], [phaseOrder] = 5, ISNOTBLANK([prodEnd]) )),1) |
| label | Text |  | Yes | Yes |  | =[hetNumber]&IF( ISNOTBLANK([b11Weight])," ("& [b11Weight]&" Grams)","" ) |
| finishedWorkOrder_REF | Ref |  | Yes | Yes | workOrder | =INDEX( SELECT(workOrder[woId], AND( [hetId] = [_THISROW]. [hetId], [phaseOrder] = 15 ) ),1 ) |

### phase

| Column | Type | Key | RO | Virtual | References / enum | Formula (notable) |
|---|---|---|---|---|---|---|
| phaseId | Text | PK |  |  |  |  |
| createdOn | DateTime |  |  |  |  |  |
| createdBy | Ref |  |  |  | staff |  |
| updatedOn | DateTime |  |  |  |  | =NOW() |
| updatedBy | Ref |  |  |  | staff | =USEREMAIL() |
| procedureIds | EnumList |  |  |  | →procedure |  |
| phaseName | Name |  |  |  |  |  |
| phaseDesc | LongText |  |  |  |  |  |
| phaseShort | Text |  |  |  |  |  |
| bomId | Ref |  |  |  | bom |  |
| bomName | Name |  |  |  |  | =[bomId].[bomName] |
| order | Number |  |  |  |  |  |
| uom | Enum |  |  |  | enum: Grams, Strips |  |
| keyText | Text |  | Yes | Yes |  | ="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789" |
| virPhaseDesc | Text |  | Yes | Yes |  | =TEXT(SELECT(procedure[label], CONTAINS([_THISROW]. [procedureIds],[procedureId]))) |
| procedureShorts | Text |  | Yes | Yes |  | =TEXT(SELECT(procedure[procedureShort], CONTAINS([_THISROW].[procedureIds],[procedureId]))) |
| phaseStart | Text |  | Yes | Yes |  | =INDEX(SPLIT(INDEX(SPLIT([virPhaseDesc], " , "),1)," - "),1) |
| phaseEnd | Text |  | Yes | Yes |  | =INDEX(SPLIT(INDEX(SPLIT([virPhaseDesc], " , "),COUNT(SPLIT([virPhaseDesc], " , ")))," - "),1) |
| bomLines | Related |  | Yes | Yes |  | =SELECT(bomLine[bomLineId], [bomId] = [_THISROW].[bomId]) |
| procedures | Related |  | Yes | Yes |  | =SELECT(procedure[procedureId], IN([procedureId], [_THISROW].[procedureIds])) |

### workOrder

| Column | Type | Key | RO | Virtual | References / enum | Formula (notable) |
|---|---|---|---|---|---|---|
| woId | Text | PK |  |  |  |  |
| woNumber | Text |  |  |  |  |  |
| createdOn | DateTime |  |  |  |  |  |
| createdBy | Ref |  |  |  | staff |  |
| updatedOn | DateTime |  |  |  |  | =NOW() |
| updatedBy | Ref |  |  |  | staff | =USEREMAIL() |
| hetId | Ref |  |  |  | het |  |
| batchHetIds | EnumList |  |  |  | →het |  |
| phaseId | Ref |  |  |  | phase |  |
| phaseOrder | Number |  |  |  |  | =[phaseId].[order] |
| phaseShort | Text |  |  |  |  | =[phaseId].[phaseShort] |
| phaseEquipIds | EnumList |  |  |  | →phaseEquip |  |
| prodStart | DateTime |  |  |  |  | =IF( AND(ISBLANK([_THIS]),ISNOTBLANK([hetId])),NOW(), [_THIS] ) |
| startSign | Signature |  |  |  |  |  |
| startSignBy | Ref |  |  |  | staff | =IF(AND(ISNOTBLANK([startSign]), ISBLANK([_THIS])), USEREMAIL(),[_THIS]) |
| prodEnd | DateTime |  |  |  |  | =IF(AND(ISNOTBLANK([endSign]),ISBLANK([_THIS])),NOW(), [_THIS]) |
| endSign | Signature |  |  |  |  |  |
| endSignBy | Ref |  |  |  | staff | =IF(AND(ISNOTBLANK([endSign]), ISBLANK([_THIS])), USEREMAIL(),[_THIS]) |
| prodDuration | Duration |  |  |  |  | =IF(AND(ISNOTBLANK([prodStart]),ISNOTBLANK([prodEnd])), [prodEnd]-[prodStart],"") |
| b11CycleNo | Text |  |  |  |  |  |
| outPut | Number |  |  |  |  |  |
| uom | Text |  |  |  |  | =[phaseId].[uom] |
| image | Image |  |  |  |  |  |
| manuId | Ref |  |  |  | manufacturer | =INDEX(SELECT(manufacturer[manuId], IN([_THISROW].[hetId], [batchHetIds]) ),1) |
| manuNumber | Text |  |  |  |  | =[manuId].[manuNumber] |
| reportPdf | File |  |  |  |  |  |
| delete | Yes/No |  |  |  |  |  |
| forceField | Number |  |  |  |  |  |
| keyText | Text |  | Yes | Yes |  | ="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789" |
| entryCount | Number |  | Yes | Yes |  | =COUNT(SELECT(workOrder[woId], TRUE, TRUE)) |
| virWoNumber | Text |  | Yes | Yes |  | ="WO"&RIGHT("000000"&([entryCount] + 58 + 1),6) |
| phaseBom | Ref |  | Yes | Yes | bom | =[phaseId].[bomId] |
| virBatchId | Text |  | Yes | Yes |  | =TEXT(TODAY(),"DDMMYYYY")&RIGHT("000"& [entryCountDaily],3) |
| entryCountDaily | Number |  | Yes | Yes |  | =COUNT(SELECT(workOrder[woId],TEXT([_THISROW]. [createdOn],"DDMMYYYY") = TEXT(TODAY(),"DDMMYYYY")))+1 |
| bomLineItems | Related |  | Yes | Yes |  | =SELECT(bomLine[bomLineId],[bomId] = [_THISROW]. [phaseBom]) |
| productionState | Text |  | Yes | Yes |  | [nextPhase].[phaseShort],""), "4. Finished Goods"), IF(OR(ISBLANK([steralisationCurrent]),ISBLANK([steralisationC urrent … |
| phaseOrderCurrent | Number |  | Yes | Yes |  | SELECT(workOrder[phaseOrder], CONTAINS([batchHetIds], [_THISROW].[hetId])), COUNT(SELECT(workOrder[phaseOrder], CONTAINS … |
| woSerials | Related |  | Yes | Yes |  | REF_ROWS("woSerial", "woId") |
| usedHetIds | Related |  | Yes | Yes |  | =SELECT(workOrder[hetId], [phaseOrder] = 1) |
| B11Weight | Number |  | Yes | Yes |  | =SUM(SELECT(workOrder[outPut], AND( IN([hetId], [_THISROW]. [batchHetIds]), ISNOTBLANK([prodEnd]), [phaseOrder] = 5 ) )) |
| combinedHetCheck | Yes/No |  | Yes | Yes |  | =COUNT(SELECT(workOrder[batchHetIds], AND( ISNOTBLANK([batchHetIds]), CONTAINS([batchHetIds], [_THISROW].[hetId]) ) ,TRU … |
| serialCheckDone | Yes/No |  | Yes | Yes |  | =COUNT([bomLineItems]) - COUNT([woSerials]) = 0 |
| duplicatePhaseCheck | Number |  | Yes | Yes |  | =COUNT(SELECT(workOrder[phaseOrder], AND([hetId] = [_THISROW].[hetId], [phaseOrder] = [_THISROW].[phaseOrder] ) ) ) |
| previousWo | Ref |  | Yes | Yes | workOrder | =INDEX( SELECT(workOrder[woId], AND( [hetId] = [_THISROW]. [hetId], [phaseOrder] = ([_THISROW].[phaseOrder] - 1) ) ),1) |
| previousOutput | Text |  | Yes | Yes |  | =[previousWo].[outPut]&" "&[previousWo].[uom] |
| steralisationCurrent | Ref |  | Yes | Yes | sterilise | =INDEX([Related sterilises], COUNT([Related sterilises])) |
| nextPhase | Ref |  | Yes | Yes | phase | =INDEX(SELECT( phase[phaseId], [order] = [_THISROW]. [phaseOrder] + 1 ),1) |
| woSerialsRO | Related |  | Yes | Yes |  | =REF_ROWS("woSerial", "woId") |
| labelFile | Text |  | Yes | Yes |  | =CONCATENATE([woId], '.pdf') |
| betReading | Decimal |  | Yes | Yes |  | =INDEX( SELECT( sterilise[betReading], AND( [manuId] = [_THISROW].[manuId], ISNOTBLANK([betReading]) ) ), 1 ) |
| validPhaseEquipIds | Related |  | Yes | Yes |  | =SELECT(phaseEquip[id], CONTAINS([phaseIds], [_THISROW]. [phaseId]), TRUE ) |

### staff

| Column | Type | Key | RO | Virtual | References / enum | Formula (notable) |
|---|---|---|---|---|---|---|
| ID | Text |  |  |  |  |  |
| ACTIVE | Yes/No |  |  |  |  |  |
| NAME | Name |  |  |  |  |  |
| SECOND_NAME | Name |  |  |  |  |  |
| LAST_NAME | Name |  |  |  |  |  |
| EMAIL | Email | PK |  |  |  |  |
| UF_PHONE_INNER | Number |  |  |  |  |  |
| UF_DEPARTMENT | Number |  |  |  |  |  |
| PERSONAL_MOBILE | Phone |  |  |  |  |  |
| DATE_REGISTER | DateTime |  |  |  |  |  |
| permission | Text |  |  |  |  |  |
| appRole | Enum |  |  |  |  |  |

### manufacturer

| Column | Type | Key | RO | Virtual | References / enum | Formula (notable) |
|---|---|---|---|---|---|---|
| manuId | Text | PK |  |  |  |  |
| createdOn | DateTime |  |  |  |  |  |
| createdBy | Ref |  |  |  | staff |  |
| updatedOn | DateTime |  |  |  |  | =NOW() |
| updatedBy | Ref |  |  |  | staff | =USEREMAIL() |
| manuNumber | Text |  |  |  |  | MID("ABCDEFGHIJ", NUMBER(LEFT(RIGHT(TEXT(YEAR(TODAY())), 2), 1)), 1) & MID("ABCDEFGHIJ", NUMBER(RIGHT(TEXT(YEAR(TODAY()) … |
| hetId | Text |  |  |  |  |  |
| batchHetIds | EnumList |  |  |  | →het |  |
| keyText | Text |  | Yes | Yes |  | ="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789" |
| entryCountToday | Number |  | Yes | Yes |  | =COUNT(SELECT(manufacturer[manuId],TEXT([createdOn],"DD MMYYYY") = TEXT(TODAY(),"DDMMYYYY")))+1 |

### bom

| Column | Type | Key | RO | Virtual | References / enum | Formula (notable) |
|---|---|---|---|---|---|---|
| bomId | Text | PK |  |  |  |  |
| createdOn | DateTime |  |  |  |  |  |
| createdBy | Ref |  |  |  | staff |  |
| updatedOn | DateTime |  |  |  |  | =NOW() |
| updatedBy | Ref |  |  |  | staff | =USEREMAIL() |
| bomName | Name |  |  |  |  |  |
| keyText | Text |  | Yes | Yes |  | ="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789" |

### bomLine

| Column | Type | Key | RO | Virtual | References / enum | Formula (notable) |
|---|---|---|---|---|---|---|
| bomLineId | Text | PK |  |  |  |  |
| createdOn | DateTime |  |  |  |  |  |
| createdBy | Ref |  |  |  | staff |  |
| updatedOn | DateTime |  |  |  |  | =NOW() |
| updatedBy | Ref |  |  |  | staff | =USEREMAIL() |
| bomId | Ref |  |  |  | bom |  |
| bomName | Name |  |  |  |  | =[bomId].[bomName] |
| description | LongText |  |  |  |  |  |
| quantity | Number |  |  |  |  |  |
| uom | Text |  |  |  |  |  |
| hasSerial | Yes/No |  |  |  |  |  |
| deleted | Yes/No |  |  |  |  |  |
| keyText | Text |  | Yes | Yes |  | ="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789" |

### woSerial

| Column | Type | Key | RO | Virtual | References / enum | Formula (notable) |
|---|---|---|---|---|---|---|
| woSerialId | Text | PK |  |  |  |  |
| woId | Ref |  |  |  | workOrder |  |
| createdOn | Text |  |  |  |  |  |
| createdBy | Text |  |  |  |  |  |
| updatedOn | DateTime |  |  |  |  | =NOW() |
| updatedBy | Email |  |  |  |  | =USEREMAIL() |
| bomRef | Ref |  |  |  | bomLine |  |
| bomLineName | Name |  |  |  |  | =[bomRef].[bomName] |
| quantity | Text |  |  |  |  | =[bomRef].[quantity]&" "&[bomRef].[uom] |
| hasSerial | Yes/No |  |  |  |  | =[bomRef].[hasSerial] |
| serialNumber | Text |  |  |  |  |  |
| keyText | Text |  | Yes | Yes |  | ="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789" |
| bomLineItems | Related |  | Yes | Yes |  | =[woId].[bomLineItems] |
| bomLineEntryCount | Number |  | Yes | Yes |  | =COUNT( [bomLineItems] - [woSerialDone] ) |
| woSerialDone | Related |  | Yes | Yes |  | =SELECT(woSerial[bomRef], [woId] = [_THISROW].[woId]) |

### sterilise

| Column | Type | Key | RO | Virtual | References / enum | Formula (notable) |
|---|---|---|---|---|---|---|
| sterId | Text | PK |  |  |  |  |
| woId | Ref |  |  |  | workOrder |  |
| createdOn | DateTime |  |  |  |  |  |
| createdBy | Ref |  |  |  | staff |  |
| manuId | Ref |  |  |  | manufacturer | =[woId].[manuId] |
| batchHetId | EnumList |  |  |  | →het | =[woId].[batchHetIds] |
| direction | Enum |  |  |  |  |  |
| result | Yes/No |  |  |  |  |  |
| betReading | Decimal |  |  |  |  |  |
| quantity | Number |  |  |  |  |  |
| comment | LongText |  |  |  |  |  |
| image | Image |  |  |  |  |  |
| signOn | DateTime |  |  |  |  | =IF(ISNOTBLANK([signature]), NOW(), [_THIS]) |
| signBy | Ref |  |  |  | staff | =IF(ISNOTBLANK([signature]), USEREMAIL(), [_THIS]) |
| signature | Signature |  |  |  |  |  |
| keyText | Text |  | Yes | Yes |  | ="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789" |
| label | Text |  | Yes | Yes |  | =IF(ISBLANK([result]),"",IF([result],"PASSED","FAILED")&": ")& [woId].[woNumber]&" - "&[manuId].[manuNumber] |

### printLabels

| Column | Type | Key | RO | Virtual | References / enum | Formula (notable) |
|---|---|---|---|---|---|---|
| _ID | Text | PK | Yes |  |  |  |
| Path | Text |  | Yes |  |  |  |
| File | File |  |  |  |  |  |
| CreateTime | DateTime |  |  |  |  |  |
| LastModifiedBy | Email |  |  |  |  |  |
| MimeType | Text |  |  |  |  |  |

### phaseEquip

| Column | Type | Key | RO | Virtual | References / enum | Formula (notable) |
|---|---|---|---|---|---|---|
| id | Text | PK |  |  |  |  |
| createdOn | DateTime |  |  |  |  |  |
| createdBy | Ref |  |  |  | staff |  |
| updatedOn | DateTime |  |  |  |  | =NOW() |
| updatedBy | Ref |  |  |  | staff | =USEREMAIL() |
| equipId | Text |  |  |  |  |  |
| name | Name |  |  |  |  |  |
| description | LongText |  |  |  |  |  |
| phaseIds | EnumList |  |  |  | →phase |  |

## 3. Relationships / References

### Direct foreign keys

| From table.column | Type | To table |
|---|---|---|
| procedure.createdBy | Ref | staff |
| procedure.updatedBy | Ref | staff |
| het.createdBy | Ref | staff |
| het.updatedBy | Ref | staff |
| het.usedBy | Ref | workOrder |
| het.finishedBy | Ref | workOrder |
| het.finishedWorkOrder_REF | Ref | workOrder |
| phase.createdBy | Ref | staff |
| phase.updatedBy | Ref | staff |
| phase.procedureIds | EnumList | procedure |
| phase.bomId | Ref | bom |
| workOrder.createdBy | Ref | staff |
| workOrder.updatedBy | Ref | staff |
| workOrder.hetId | Ref | het |
| workOrder.batchHetIds | EnumList | het |
| workOrder.phaseId | Ref | phase |
| workOrder.phaseEquipIds | EnumList | phaseEquip |
| workOrder.startSignBy | Ref | staff |
| workOrder.endSignBy | Ref | staff |
| workOrder.manuId | Ref | manufacturer |
| workOrder.phaseBom | Ref | bom |
| workOrder.previousWo | Ref | workOrder |
| workOrder.steralisationCurrent | Ref | sterilise |
| workOrder.nextPhase | Ref | phase |
| manufacturer.createdBy | Ref | staff |
| manufacturer.updatedBy | Ref | staff |
| manufacturer.batchHetIds | EnumList | het |
| bom.createdBy | Ref | staff |
| bom.updatedBy | Ref | staff |
| bomLine.createdBy | Ref | staff |
| bomLine.updatedBy | Ref | staff |
| bomLine.bomId | Ref | bom |
| woSerial.woId | Ref | workOrder |
| woSerial.bomRef | Ref | bomLine |
| sterilise.woId | Ref | workOrder |
| sterilise.createdBy | Ref | staff |
| sterilise.manuId | Ref | manufacturer |
| sterilise.batchHetId | EnumList | het |
| sterilise.signBy | Ref | staff |
| phaseEquip.createdBy | Ref | staff |
| phaseEquip.updatedBy | Ref | staff |
| phaseEquip.phaseIds | EnumList | phase |

### Virtual / computed relationship columns

- **procedure**
  - `keyText`: ="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
  - `label`: =[procedureShort]&" - "&[procedureName]
- **het**
  - `keyText`: ="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
  - `Related workOrders`: REF_ROWS("workOrder", "hetId")
  - `label`: =[hetNumber]&IF( ISNOTBLANK([b11Weight])," ("& [b11Weight]&" Grams)","" )
  - `finishedWorkOrder_REF`: =INDEX( SELECT(workOrder[woId], AND( [hetId] = [_THISROW]. [hetId], [phaseOrder] = 15 ) ),1 )
- **phase**
  - `keyText`: ="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
  - `virPhaseDesc`: =TEXT(SELECT(procedure[label], CONTAINS([_THISROW]. [procedureIds],[procedureId])))
  - `Related workOrders`: REF_ROWS("workOrder", "phaseId")
  - `procedureShorts`: =TEXT(SELECT(procedure[procedureShort], CONTAINS([_THISROW].[procedureIds],[procedureId])))
  - `phaseStart`: =INDEX(SPLIT(INDEX(SPLIT([virPhaseDesc], " , "),1)," - "),1)
  - `phaseEnd`: =INDEX(SPLIT(INDEX(SPLIT([virPhaseDesc], " , "),COUNT(SPLIT([virPhaseDesc], " , ")))," - "),1)
  - `Related workOrders By nextPhase`: REF_ROWS("workOrder", "nextPhase")
  - `bomLines`: =SELECT(bomLine[bomLineId], [bomId] = [_THISROW].[bomId])
  - `procedures`: =SELECT(procedure[procedureId], IN([procedureId], [_THISROW].[procedureIds]))
- **workOrder**
  - `keyText`: ="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
  - `entryCount`: =COUNT(SELECT(workOrder[woId], TRUE, TRUE))
  - `virWoNumber`: ="WO"&RIGHT("000000"&([entryCount] + 58 + 1),6)
  - `phaseBom`: =[phaseId].[bomId]
  - `virBatchId`: =TEXT(TODAY(),"DDMMYYYY")&RIGHT("000"& [entryCountDaily],3)
  - `entryCountDaily`: =COUNT(SELECT(workOrder[woId],TEXT([_THISROW]. [createdOn],"DDMMYYYY") = TEXT(TODAY(),"DDMMYYYY")))+1
  - `bomLineItems`: =SELECT(bomLine[bomLineId],[bomId] = [_THISROW]. [phaseBom])
  - `productionState`: [nextPhase].[phaseShort],""), "4. Finished Goods"), IF(OR(ISBLANK([steralisationCurrent]),ISBLANK([steralisationC urrent …
  - `phaseOrderCurrent`: SELECT(workOrder[phaseOrder], CONTAINS([batchHetIds], [_THISROW].[hetId])), COUNT(SELECT(workOrder[phaseOrder], CONTAINS …
  - `woSerials`: REF_ROWS("woSerial", "woId")
  - `usedHetIds`: =SELECT(workOrder[hetId], [phaseOrder] = 1)
  - `B11Weight`: =SUM(SELECT(workOrder[outPut], AND( IN([hetId], [_THISROW]. [batchHetIds]), ISNOTBLANK([prodEnd]), [phaseOrder] = 5 ) ))
  - `combinedHetCheck`: =COUNT(SELECT(workOrder[batchHetIds], AND( ISNOTBLANK([batchHetIds]), CONTAINS([batchHetIds], [_THISROW].[hetId]) ) ,TRU …
  - `serialCheckDone`: =COUNT([bomLineItems]) - COUNT([woSerials]) = 0
  - `duplicatePhaseCheck`: =COUNT(SELECT(workOrder[phaseOrder], AND([hetId] = [_THISROW].[hetId], [phaseOrder] = [_THISROW].[phaseOrder] ) ) )
  - `previousWo`: =INDEX( SELECT(workOrder[woId], AND( [hetId] = [_THISROW]. [hetId], [phaseOrder] = ([_THISROW].[phaseOrder] - 1) ) ),1)
  - `previousOutput`: =[previousWo].[outPut]&" "&[previousWo].[uom]
  - `Related sterilises`: =REF_ROWS("sterilise", "woId")
  - `steralisationCurrent`: =INDEX([Related sterilises], COUNT([Related sterilises]))
  - `nextPhase`: =INDEX(SELECT( phase[phaseId], [order] = [_THISROW]. [phaseOrder] + 1 ),1)
  - `Related hets`: REF_ROWS("het", "usedBy")
  - `woSerialsRO`: =REF_ROWS("woSerial", "woId")
  - `Related hets By finishedBy`: REF_ROWS("het", "finishedBy")
  - `Related hets By`: REF_ROWS("het", "finishedWorkOrder_REF")
  - `labelFile`: =CONCATENATE([woId], '.pdf')
  - `betReading`: =INDEX( SELECT( sterilise[betReading], AND( [manuId] = [_THISROW].[manuId], ISNOTBLANK([betReading]) ) ), 1 )
  - `validPhaseEquipIds`: =SELECT(phaseEquip[id], CONTAINS([phaseIds], [_THISROW]. [phaseId]), TRUE )
- **staff**
  - `Related procedures By createdBy`: REF_ROWS("procedure", "createdBy")
  - `Related procedures By updatedBy`: REF_ROWS("procedure", "updatedBy")
  - `Related phases By createdBy`: REF_ROWS("phase", "createdBy")
  - `Related phases By updatedBy`: REF_ROWS("phase", "updatedBy")
  - `Related hets By createdBy`: REF_ROWS("het", "createdBy")
  - `Related hets By updatedBy`: REF_ROWS("het", "updatedBy")
  - `Related workOrders By createdBy`: REF_ROWS("workOrder", "createdBy")
  - `Related workOrders By updatedBy`: REF_ROWS("workOrder", "updatedBy")
  - `Related manufacturers By createdBy`: REF_ROWS("manufacturer", "createdBy")
  - `Related manufacturers By updatedBy`: REF_ROWS("manufacturer", "updatedBy")
  - `Related boms By createdBy`: REF_ROWS("bom", "createdBy")
  - `Related boms By updatedBy`: REF_ROWS("bom", "updatedBy")
  - `Related bomLines By createdBy`: REF_ROWS("bomLine", "createdBy")
  - `Related bomLines By updatedBy`: REF_ROWS("bomLine", "updatedBy")
  - `Related sterilises`: REF_ROWS("sterilise", "createdBy")
  - `Related sterilises By signBy`: REF_ROWS("sterilise", "signBy")
  - `Related workOrders By startSignBy`: REF_ROWS("workOrder", "startSignBy")
  - `Related workOrders By endSignBy`: REF_ROWS("workOrder", "endSignBy")
  - `Related phaseEquips By createdBy`: REF_ROWS("phaseEquip", "createdBy")
  - `Related phaseEquips By updatedBy`: REF_ROWS("phaseEquip", "updatedBy")
- **manufacturer**
  - `keyText`: ="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
  - `entryCountToday`: =COUNT(SELECT(manufacturer[manuId],TEXT([createdOn],"DD MMYYYY") = TEXT(TODAY(),"DDMMYYYY")))+1
  - `Related workOrders`: REF_ROWS("workOrder", "manuId")
  - `Related sterilises`: REF_ROWS("sterilise", "manuId")
- **bom**
  - `Related bomLines`: REF_ROWS("bomLine", "bomId")
  - `keyText`: ="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
  - `Related phases`: REF_ROWS("phase", "bomId")
- **bomLine**
  - `keyText`: ="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
  - `Related woSerials`: REF_ROWS("woSerial", "bomRef")
- **woSerial**
  - `keyText`: ="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
  - `bomLineItems`: =[woId].[bomLineItems]
  - `bomLineEntryCount`: =COUNT( [bomLineItems] - [woSerialDone] )
  - `woSerialDone`: =SELECT(woSerial[bomRef], [woId] = [_THISROW].[woId])
- **sterilise**
  - `keyText`: ="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
  - `label`: =IF(ISBLANK([result]),"",IF([result],"PASSED","FAILED")&": ")& [woId].[woNumber]&" - "&[manuId].[manuNumber]
  - `Related workOrders`: REF_ROWS("workOrder", "steralisationCurrent")

## 4. Views

### procedure

| View | Type | Position | Visibility | Notes |
|---|---|---|---|---|
| procedure | table | menu | ALWAYS |  |
| procedure_Inline | table | ref | ALWAYS |  |

### het

| View | Type | Position | Visibility | Notes |
|---|---|---|---|---|
| het_Detail | detail | ref | ALWAYS |  |
| het_Form | form | ref | ALWAYS |  |
| het_Inline | table | ref | ALWAYS |  |

### phase

| View | Type | Position | Visibility | Notes |
|---|---|---|---|---|
| phase | table | menu | ALWAYS |  |
| defPhase_Detail | detail | ref | ALWAYS |  |
| defPhase_Form | form | ref | ALWAYS |  |
| phase_Detail | detail | ref | ALWAYS |  |
| phase_Form | form | ref | ALWAYS |  |
| phase_Inline | table | ref | ALWAYS |  |

### workOrder

| View | Type | Position | Visibility | Notes |
|---|---|---|---|---|
| workOrderComplete | table | center | ALWAYS | GroupBy=productionState SortBy=woNumber |
| workOrder | table | left | ALWAYS | GroupBy=productionState SortBy=woNumber |
| workOrderFinsh | table | left | ALWAYS | GroupBy=productionState SortBy=woNumber |
| finalizeWo | form | ref | ALWAYS |  |
| woComplete_Details | detail | ref | ALWAYS |  |
| woFinish_Details | detail | ref | ALWAYS |  |
| woInProgress_Details | detail | ref | ALWAYS |  |
| workOrder_Detail | detail | ref | ALWAYS |  |
| workOrder_Form | form | ref | ALWAYS |  |
| workOrder_Inline | table | ref | ALWAYS |  |
| workOrderAddImage | form | ref | ALWAYS |  |
| workOrderComplete_Detail | detail | ref | ALWAYS |  |
| workOrderFinish_Detail | detail | ref | ALWAYS |  |
| workOrderFinish_Form | form | ref | ALWAYS |  |
| workOrderInProgress_Detail | detail | ref | ALWAYS |  |
| workOrderInProgress_Form | form | ref | ALWAYS |  |
| workOrderSeq | form | ref | ALWAYS |  |

### staff

| View | Type | Position | Visibility | Notes |
|---|---|---|---|---|
| staff | table | menu | ALWAYS |  |
| staff_Detail | detail | ref | ALWAYS |  |
| staff_Form | form | ref | ALWAYS |  |

### manufacturer

| View | Type | Position | Visibility | Notes |
|---|---|---|---|---|
| manufacturer | table | menu | ALWAYS |  |
| manufacturer_Detail | detail | ref | ALWAYS |  |
| manufacturer_Form | form | ref | ALWAYS |  |
| manufacturer_Inline | table | ref | ALWAYS |  |

### bom

| View | Type | Position | Visibility | Notes |
|---|---|---|---|---|
| bom | table | menu | ALWAYS |  |
| bom_Detail | detail | ref | ALWAYS |  |
| bom_Form | form | ref | ALWAYS |  |
| bom_Inline | table | ref | ALWAYS |  |

### bomLine

| View | Type | Position | Visibility | Notes |
|---|---|---|---|---|
| bomLine_Detail | detail | ref | ALWAYS |  |
| bomLine_Form | form | ref | ALWAYS |  |
| bomLine_Inline | table | ref | ALWAYS |  |

### woSerial

| View | Type | Position | Visibility | Notes |
|---|---|---|---|---|
| woSerial_Detail | detail | ref | ALWAYS |  |
| woSerial_Form | form | ref | ALWAYS |  |
| woSerial_Inline | table | ref | ALWAYS |  |

### sterilise

| View | Type | Position | Visibility | Notes |
|---|---|---|---|---|
| steraliseRO_Inline | table | ref | ALWAYS |  |
| sterilise_Detail | detail | ref | ALWAYS |  |
| sterilise_Form | form | ref | ALWAYS |  |
| sterilise_Inline | table | ref | ALWAYS |  |

### printLabels

| View | Type | Position | Visibility | Notes |
|---|---|---|---|---|
| printLabels_Detail | detail | ref | ALWAYS |  |

### phaseEquip

| View | Type | Position | Visibility | Notes |
|---|---|---|---|---|
| phaseEquip_Detail | detail | ref | ALWAYS |  |
| phaseEquip_Form | form | ref | ALWAYS |  |
| phaseEquip_Inline | table | ref | ALWAYS |  |

### uncategorized

| View | Type | Position | Visibility | Notes |
|---|---|---|---|---|
| New View | table | menu | ALWAYS |  |

## 5. Actions

### procedure

| Action | Behavior | Bulk | Confirmation | Visibility |
|---|---|---|---|---|
| Delete | DELETE_RECORD | Yes | Yes | No |
| Edit | EDIT_RECORD | No | No | No |
| Add | ADD_RECORD | Yes | No | ALWAYS |

### het

| Action | Behavior | Bulk | Confirmation | Visibility |
|---|---|---|---|---|
| Edit | EDIT_RECORD | No | No | ALWAYS |
| Add | ADD_RECORD | Yes | No | Yes |
| View Ref (createdBy) | NAVIGATE_APP | No | No | No |
| View Ref (updatedBy) | NAVIGATE_APP | No | No | No |
| View Ref (usedBy) | NAVIGATE_APP | No | No | No |
| forceFieldHet | SET_COLUMN_VALUE | Yes | No | ALWAYS |
| View Map (address) | NAVIGATE_APP | No | No | ALWAYS |
| View Ref (finishedBy) | NAVIGATE_APP | No | No | No |
| View Ref (finishedWorkOrder_REF) | NAVIGATE_APP | No | No | ALWAYS |

### phase

| Action | Behavior | Bulk | Confirmation | Visibility |
|---|---|---|---|---|
| Delete | DELETE_RECORD | Yes | Yes | No |
| Edit | EDIT_RECORD | No | No | No |
| Add | ADD_RECORD | Yes | No | ALWAYS |
| View Ref (createdBy) | NAVIGATE_APP | No | No | No |
| View Ref (updatedBy) | NAVIGATE_APP | No | No | ALWAYS |
| View Ref (bomId) | NAVIGATE_APP | No | No | No |

### workOrder

| Action | Behavior | Bulk | Confirmation | Visibility |
|---|---|---|---|---|
| Edit | EDIT_RECORD | No | No | No |
| Add | ADD_RECORD | Yes | No | Yes |
| View Ref (phaseId) | NAVIGATE_APP | No | No | No |
| View Ref (hetId) | NAVIGATE_APP | No | No | No |
| View Ref (phaseBom) | NAVIGATE_APP | No | No | No |
| nextPhase | NAVIGATE_APP | No | No | ALWAYS |
| woSerial | NAVIGATE_APP | No | No | No |
| woComplete | NAVIGATE_APP | No | No | ALWAYS |
| manuNumber | Conditional: ADD_RECORD_TO true Disable automatic updates? | Yes | No | ALWAYS |
| View Ref (manuId) | NAVIGATE_APP | No | No | ALWAYS |
| forceFieldWo | SET_COLUMN_VALUE | Yes | No | ALWAYS |
| Action for forceFieldWo | REF_ACTION | Yes | No | No |
| addNewCollection | NAVIGATE_APP | No | No | ALWAYS |
| B11ReplaceHet | SET_COLUMN_VALUE | Yes | No | ALWAYS |
| Action for b11ReplaceHet | Conditional: REF_ACTION true Disable automatic updates? | Yes | No | ALWAYS |
| View Ref (previousWo) | NAVIGATE_APP | No | No | ALWAYS |
| wo13SendSter | NAVIGATE_APP | No | No | No |
| View Ref (steralisationCurrent) | NAVIGATE_APP | No | No | ALWAYS |
| wo13RecSter | NAVIGATE_APP | No | No | ALWAYS |
| closeAfterSteralise | SET_COLUMN_VALUE | Yes | No | ALWAYS |
| View Ref (nextPhase) | NAVIGATE_APP | No | No | No |
| Action for forceFieldHet | Conditional: REF_ACTION true Disable automatic updates? | Yes | No | ALWAYS |
| View Ref (startSignBy) | NAVIGATE_APP | No | No | No |
| View Ref (endSignBy) | NAVIGATE_APP | No | No | No |
| forceField_HET Action - 1 | REF_ACTION | Yes | No | No |
| woGenerateLabel | Conditional: =AND(ISNOTBLANK([prodEnd]), ISBLANK([image]), OR([phaseOrder]=3, [phaseOrder]=6, [phaseOrder]=9, [ph … | No | No | ALWAYS |
| woAddImage | NAVIGATE_APP | No | No | No |
| closeAfterBET | SET_COLUMN_VALUE | Yes | No | ALWAYS |
| wo14RecBET | NAVIGATE_APP | No | No | No |
| wo14SendBET | NAVIGATE_APP | No | No | ALWAYS |
| viewProductionBatchRecord | Conditional: =AND([phaseOrder]=16, ISNOTBLANK([prodEnd])) | No | No | ALWAYS |
| Open File (reportPdf) | Conditional: NOT(ISBLANK([reportPdf])) | No | No | No |
| viewWoReportPdf | Conditional: =ISNOTBLANK([reportPdf]) | No | No | ALWAYS |
| generateWoReport | SET_COLUMN_VALUE | Yes | No | ALWAYS |

### staff

| Action | Behavior | Bulk | Confirmation | Visibility |
|---|---|---|---|---|
| Delete | DELETE_RECORD | Yes | Yes | No |
| Edit | EDIT_RECORD | No | No | ALWAYS |
| Add | ADD_RECORD | Yes | No | Yes |
| Compose Email (EMAIL) | Conditional: NOT(ISBLANK([EMAIL])) | No | No | No |
| Call Phone (PERSONAL_MOBILE) | Conditional: NOT(ISBLANK([PERSONAL_MOBILE])) | No | No | No |
| Send SMS (PERSONAL_MOBILE) | Conditional: NOT(ISBLANK([PERSONAL_MOBILE])) | No | No | ALWAYS |

### manufacturer

| Action | Behavior | Bulk | Confirmation | Visibility |
|---|---|---|---|---|
| Delete | DELETE_RECORD | Yes | Yes | ADVANCED |
| Edit | EDIT_RECORD | No | No | ALWAYS |
| Add | ADD_RECORD | Yes | No | Yes |
| View Ref (createdBy) | NAVIGATE_APP | No | No | No |
| View Ref (updatedBy) | NAVIGATE_APP | No | No | ALWAYS |

### bom

| Action | Behavior | Bulk | Confirmation | Visibility |
|---|---|---|---|---|
| Delete | DELETE_RECORD | Yes | Yes | ADVANCED |
| Edit | EDIT_RECORD | No | No | No |
| Add | ADD_RECORD | Yes | No | ALWAYS |
| View Ref (createdBy) | NAVIGATE_APP | No | No | No |
| View Ref (updatedBy) | NAVIGATE_APP | No | No | ADVANCED |

### bomLine

| Action | Behavior | Bulk | Confirmation | Visibility |
|---|---|---|---|---|
| Delete | DELETE_RECORD | Yes | Yes | ADVANCED |
| Edit | EDIT_RECORD | No | No | ALWAYS |
| Add | ADD_RECORD | Yes | No | ALWAYS |
| View Ref (bomId) | NAVIGATE_APP | No | No | ALWAYS |
| View Ref (createdBy) | NAVIGATE_APP | No | No | ADVANCED |
| View Ref (updatedBy) | NAVIGATE_APP | No | No | ADVANCED |

### woSerial

| Action | Behavior | Bulk | Confirmation | Visibility |
|---|---|---|---|---|
| Delete | DELETE_RECORD | Yes | Yes | ADVANCED |
| Edit | EDIT_RECORD | No | No | No |
| Add | ADD_RECORD | Yes | No | ALWAYS |
| View Ref (woId) | NAVIGATE_APP | No | No | ALWAYS |
| View Ref (bomRef) | NAVIGATE_APP | No | No | No |

### sterilise

| Action | Behavior | Bulk | Confirmation | Visibility |
|---|---|---|---|---|
| Delete | DELETE_RECORD | Yes | Yes | ADVANCED |
| Edit | EDIT_RECORD | No | No | ALWAYS |
| Add | ADD_RECORD | Yes | No | ALWAYS |
| View Ref (woId) | NAVIGATE_APP | No | No | ALWAYS |
| View Ref (createdBy) | NAVIGATE_APP | No | No | ADVANCED |
| View Ref (manuId) | NAVIGATE_APP | No | No | No |
| View Ref (signBy) | NAVIGATE_APP | No | No | ALWAYS |
| Action for closeWo13 | Conditional: REF_ACTION true Disable automatic updates? | Yes | No | ALWAYS |
| closeWo14 Action - 1 | REF_ACTION | Yes | No | No |

### printLabels

| Action | Behavior | Bulk | Confirmation | Visibility |
|---|---|---|---|---|
| Open File (File) | Conditional: NOT(ISBLANK([File])) | No | No | No |
| Compose Email (LastModifiedBy) | Conditional: NOT(ISBLANK([LastModifiedBy])) | No | No | No |

### phaseEquip

| Action | Behavior | Bulk | Confirmation | Visibility |
|---|---|---|---|---|
| Delete | DELETE_RECORD | Yes | Yes | No |
| Edit | EDIT_RECORD | No | No | No |
| Add | ADD_RECORD | Yes | No | ALWAYS |
| View Ref (createdBy) | NAVIGATE_APP | No | No | No |
| View Ref (updatedBy) | NAVIGATE_APP | No | No | No |

## 6. Processes / Automation

AppSheet process bots are defined on hidden “Process” tables. Each process mirrors the `workOrder` schema plus a step/action column and is executed as a row-change automation. Heavy operations call Google Apps Script web apps.

| Process / Bot | Trigger table | Output table | Purpose |
|---|---|---|---|
| generateManuNumber | Process for generateManuNumber | generateNewManuNumber Output | Generate a new manufacturer number for a WO |
| finishWorkOrder | Process for finishWorkOrder | finishWorkOrder Output | Mark a work order / phase as finished |
| printLabels | Process for printLabels | printLabels_output Output | Produce label files for a WO |
| sterilise | Process for sterilise | sterilise_output Output | Record / drive sterilisation BET workflow |
| phaseEquip | Process for phaseEquip | closeWo14 Output | Assign/check equipment for a WO phase |
| Generate Production Batch Record | Process for Generate Production Batch Record - 1 | generateBatchRecord Output | Generate a PDF batch record via Google Apps Script |
| Generate WorkOrder Report (Script) | Process for Generate WorkOrder Report (Script) | callScript_GenerateWoReportPdf Output | Generate a PDF work-order report via Google Apps Script |

Key workflow formulas:

- `workOrder.nextPhase` — lookup for the next production phase.
- `workOrder.productionState` — computed/virtual status used for grouping views.
- `workOrder.labelFile` / `sterilise.label` — generate label text/PDF references.
- `workOrder.combinedHetCheck`, `serialCheckDone`, `duplicatePhaseCheck`, `validPhaseEquipIds` — enforce business rules.

## 7. Integrations

### External services used by the Google Apps Script backend

| Integration | Purpose | Key details |
|---|---|---|
| **Bitrix24** | Staff/user sync; notifications | `https://ventasbio.bitrix24.com/rest` via `notifyBotKey` / `techDevops` script properties. `user.search` populates the `staff` sheet (`staffPopulator.js`). |
| **AppSheet API** | Update AppSheet rows from scripts | `https://api.appsheet.com/api/v2/apps/{APP_ID}/tables/{table}/Action` (add/edit/delete). Wrapper in `appsheet.service.js`. |
| **Google Sheets** | Primary data store + script backend | Spreadsheet ID `1MTW18USJHOLCO7jNOLCnmaYPZ5S0Dte53Y5dwDWOJz0`; accessed via Tamotsu ORM and `SpreadsheetApp`. Sheets include `workOrder`, `workOrder_temp`, `phaseEquip`, `staff`, etc. |
| **Google Drive folder-as-table** | Stores generated label files | `printLabels` table is a “Folder as a Table” source (`google`). |
| **External Apps Script library** | PDF report generation | Library `BOM_WO_SHEET` (script ID `18Ig3sc-V3n5SRQqjVI_pVm_Jeo6ONJb-WOAjq97hPWxeUZ91U3i9OeWL`) exposes `generateWoReportPdf()`, called from `wrapperForAppSheet.js`. |
| **Tamotsu** | Lightweight ORM over Google Sheets | Used in `config.js` / `temp.js` to read/write `staff`, `workOrder`, `workOrder_temp`, `phaseEquip`. |

### Relevant script files

- `/Users/noonoon/Dev/ventas_workorder_app/docs/references/google_script/config.js` — API keys, Bitrix URL, Tamotsu table definitions.
- `/Users/noonoon/Dev/ventas_workorder_app/docs/references/google_script/appsheet.service.js` — AppSheet API wrapper (add/edit/delete rows).
- `/Users/noonoon/Dev/ventas_workorder_app/docs/references/google_script/bitrixHelper.js` — Bitrix REST helpers (`httpBitrix`, `httpBitrixArray`).
- `/Users/noonoon/Dev/ventas_workorder_app/docs/references/google_script/staffPopulator.js` — Syncs active Bitrix users into the `staff` sheet.
- `/Users/noonoon/Dev/ventas_workorder_app/docs/references/google_script/helper.service.js` — Generic array/sheet helpers.
- `/Users/noonoon/Dev/ventas_workorder_app/docs/references/google_script/wrapperForAppSheet.js` — Calls the external PDF library and writes the result back to AppSheet.
- `/Users/noonoon/Dev/ventas_workorder_app/docs/references/google_script/temp.js` — Example batch processor (`findPhaseEquip`) that scans `workOrder_temp` and updates `phaseEquip` via Tamotsu.

---

*End of specification.*
