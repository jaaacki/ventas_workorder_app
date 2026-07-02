import { type FormEvent, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { toast } from 'sonner';
import {
  archiveCollectionOrder,
  archiveCollectionPoint,
  archiveCollectionReceipt,
  archiveCollectionReceiptLine,
  archiveCollectionUnit,
  archiveCollectionUnitFulfilment,
  archiveIssuanceOrder,
  archiveIssuanceOrderLine,
  archiveProcurementImportReport,
  archiveSupplyEntity,
  createCollectionOrder,
  createCollectionPoint,
  createCollectionReceipt,
  createCollectionReceiptLine,
  createCollectionUnit,
  createCollectionUnitFulfilment,
  createIssuanceOrder,
  createIssuanceOrderLine,
  createSupplyEntity,
  fetchCollectionOrderAudit,
  fetchCollectionOrders,
  fetchCollectionPointAudit,
  fetchCollectionReceiptAudit,
  fetchCollectionReceiptLineAudit,
  fetchCollectionReceiptLines,
  fetchCollectionReceipts,
  fetchCollectionUnitAudit,
  fetchCollectionUnitFulfilmentAudit,
  fetchCollectionUnitFulfilments,
  fetchCollectionUnits,
  fetchCollectionPoints,
  fetchIssuanceOrderAudit,
  fetchIssuanceOrderLineAudit,
  fetchIssuanceOrderLines,
  fetchIssuanceOrders,
  fetchProcurementImportReportAudit,
  fetchProcurementImportReports,
  fetchProcurementOverview,
  fetchSupplyEntities,
  fetchSupplyEntityAudit,
  restoreCollectionOrder,
  restoreCollectionPoint,
  restoreCollectionReceipt,
  restoreCollectionReceiptLine,
  restoreCollectionUnit,
  restoreCollectionUnitFulfilment,
  restoreIssuanceOrder,
  restoreIssuanceOrderLine,
  restoreProcurementImportReport,
  restoreSupplyEntity,
  updateCollectionOrder,
  updateCollectionPoint,
  updateCollectionReceipt,
  updateCollectionReceiptLine,
  updateCollectionUnit,
  updateCollectionUnitFulfilment,
  updateIssuanceOrder,
  updateIssuanceOrderLine,
  updateSupplyEntity,
  type CollectionOrderPayload,
  type CollectionPoint,
  type CollectionPointPayload,
  type CollectionReceiptPayload,
  type CollectionReceiptLine,
  type CollectionReceiptLinePayload,
  type CollectionUnit,
  type CollectionUnitFulfilment,
  type CollectionUnitFulfilmentPayload,
  type CollectionUnitPayload,
  type IssuanceOrderLine,
  type IssuanceOrderLinePayload,
  type IssuanceOrderPayload,
  type ProcurementEvent,
  type ProcurementImportReport,
  type SupplyEntity,
  type SupplyEntityPayload,
} from '@/lib/procurement-api';
import type { AuditEvent } from '@/lib/inventory-api';
import { AdminPanel, EmptyState, MetricCard, PageHeader, StatusPill } from '@/components/tailadmin';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import {
  AuditDrawer,
  CheckboxField,
  CrudSheet,
  DeletedBadge,
  IncludeDeletedButton,
  RowCrudActions,
  SelectField,
  TextField,
} from '@/components/ErpCrudControls';
import { useAuthStore } from '@/store/authStore';
import { AlertTriangle, Boxes, Building2, ClipboardList, ExternalLink, FileCheck2, FileClock, MapPin, PackageCheck, Route, Search, Truck } from 'lucide-react';

type EditableKind = 'supply' | 'point' | 'unit' | 'issuance' | 'issuanceLine' | 'fulfilment' | 'order' | 'receipt' | 'receiptLine';
type ActionKind = EditableKind | 'import';
type EditorState = { mode: 'create' | 'edit'; kind: EditableKind; id?: string; label: string; values: Record<string, string | boolean> } | null;
type AuditState = { kind: ActionKind; id: string; label: string } | null;

const resourceByKind: Record<ActionKind, string> = {
  supply: 'procurement.supplyEntity',
  point: 'procurement.collectionPoint',
  unit: 'procurement.collectionUnit',
  issuance: 'procurement.issuanceOrder',
  issuanceLine: 'procurement.issuanceOrderLine',
  fulfilment: 'procurement.collectionUnitFulfilment',
  order: 'procurement.collectionOrder',
  receipt: 'procurement.collectionReceipt',
  receiptLine: 'procurement.collectionReceiptLine',
  import: 'procurement.importReport',
};

const editorFieldLabels: Record<EditableKind, Record<string, string>> = {
  supply: {
    name: 'Name',
    legalName: 'Legal name',
    externalCode: 'External code',
    legacyClinicId: 'Legacy clinic ID',
    legacyGroupKey: 'Legacy group key',
    sourceSystem: 'Source system',
  },
  point: {
    supplyEntityId: 'Supply entity ID',
    legacyClinicId: 'Legacy clinic ID',
    hciCode: 'HCI code',
    displayName: 'Display name',
    licenseName: 'License name',
    address: 'Address',
    postalCode: 'Postal code',
    telephone: 'Telephone',
    personInCharge: 'Person in charge',
  },
  unit: {
    unitNumber: 'Unit number',
    status: 'Status',
    supplyEntityId: 'Supply entity ID',
    collectionPointId: 'Collection point ID',
    legacyHetId: 'Legacy HET ID',
    parcelTrackingNumber: 'Parcel tracking number',
    legacyUsedByWorkOrderId: 'Used by work order ID',
    sourceSystem: 'Source system',
    linkCompleteness: 'Link completeness',
    semanticConfidence: 'Semantic confidence',
    hiddenFromOperations: 'Hidden from operations',
  },
  issuance: {
    supplyEntityId: 'Supply entity ID',
    collectionPointId: 'Collection point ID',
    issuedAt: 'Issued at',
    issuedBy: 'Issued by',
    semanticConfidence: 'Semantic confidence',
    level: 'Level',
    remarks: 'Remarks',
  },
  issuanceLine: {
    issuanceOrderId: 'Issuance order ID',
    collectionUnitId: 'Collection unit ID',
    legacyHetId: 'Legacy HET ID',
    legacyHetNumber: 'Legacy HET number',
    parcelTrackingNumber: 'Parcel tracking number',
  },
  fulfilment: {
    collectionUnitId: 'Collection unit ID',
    fulfilledAt: 'Fulfilled at',
    fulfilledBy: 'Fulfilled by',
    source: 'Source',
    evidencePath: 'Evidence path',
    remarks: 'Remarks',
    inferred: 'Inferred',
  },
  order: {
    supplyEntityId: 'Supply entity ID',
    collectionPointId: 'Collection point ID',
    requestedAt: 'Requested at',
    scheduledFor: 'Scheduled for',
    requestedBy: 'Requested by',
    status: 'Status',
    semanticConfidence: 'Semantic confidence',
    remarks: 'Remarks',
    legacyConflatedOrderReceipt: 'Conflated legacy order/receipt',
  },
  receipt: {
    collectionOrderId: 'Collection order ID',
    receivedAt: 'Received at',
    receivedBy: 'Received by',
    signaturePath: 'Signature path',
    remarks: 'Remarks',
    legacyConflatedOrderReceipt: 'Conflated legacy order/receipt',
    acceptanceState: 'Acceptance state',
  },
  receiptLine: {
    collectionReceiptId: 'Collection receipt ID',
    collectionUnitId: 'Collection unit ID',
    conditionStatus: 'Condition status',
    acceptanceStatus: 'Acceptance status',
    resultingHetId: 'Resulting HET ID',
    discrepancyReason: 'Discrepancy reason',
  },
};

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleString() : '-';
}

function statusTone(value?: string | null): 'brand' | 'success' | 'warning' | 'error' | 'neutral' {
  if (!value) return 'neutral';
  if (/placeholder|no_procurement|hidden/i.test(value)) return 'warning';
  if (/received|accepted|consumed/i.test(value)) return 'success';
  if (/deliver|issuance/i.test(value)) return 'brand';
  if (/archiv|delete/i.test(value)) return 'error';
  return 'neutral';
}

function entityName(entity?: SupplyEntity) {
  return entity?.name || entity?.legalName || entity?.legacyClinicId || '-';
}

function pointName(point?: CollectionPoint) {
  return point?.displayName || point?.hciCode || point?.legacyClinicId || '-';
}

function unitName(unit?: CollectionUnit) {
  return unit?.unitNumber || unit?.legacyHetId || unit?.parcelTrackingNumber || unit?.id || '-';
}

function importReportSummary(report: ProcurementImportReport) {
  if (report.report && typeof report.report === 'object') {
    return JSON.stringify(report.report);
  }
  return String(report.report ?? '-');
}

function errorMessage(error: Error, fallback: string) {
  const axiosError = error as AxiosError<{ error?: string }>;
  if (axiosError.response?.status === 403) return axiosError.response.data?.error || 'You do not have permission for this action';
  return axiosError.response?.data?.error || fallback;
}

function cleanPayload(values: Record<string, string | boolean>) {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, typeof value === 'string' && value.trim() === '' ? null : value]),
  );
}

function option(value: string | null | undefined, label: string | null | undefined) {
  if (!value) return null;
  return { value, label: label || value };
}

function eventDate(event: ProcurementEvent, kind: 'issuance' | 'order' | 'receipt') {
  return kind === 'issuance' ? event.issuedAt : kind === 'order' ? event.requestedAt : event.receivedAt;
}

function eventInitialValues(event: ProcurementEvent, kind: 'issuance' | 'order' | 'receipt'): Record<string, string | boolean> {
  if (kind === 'issuance') {
    return {
      supplyEntityId: event.supplyEntityId || '',
      collectionPointId: event.collectionPointId || '',
      issuedAt: event.issuedAt || '',
      issuedBy: event.issuedBy || '',
      legacyDeliverCollectId: event.legacyDeliverCollectId || '',
      legacyDirection: event.legacyDirection || '',
      semanticConfidence: event.semanticConfidence || '',
      level: event.level || '',
      remarks: event.remarks || '',
    };
  }
  if (kind === 'order') {
    return {
      supplyEntityId: event.supplyEntityId || '',
      collectionPointId: event.collectionPointId || '',
      requestedAt: event.requestedAt || '',
      scheduledFor: event.scheduledFor || '',
      requestedBy: event.requestedBy || '',
      status: event.status || '',
      legacyCollectDeliverCollectId: event.legacyCollectDeliverCollectId || '',
      legacyDirection: event.legacyDirection || '',
      semanticConfidence: event.semanticConfidence || '',
      legacyConflatedOrderReceipt: Boolean(event.legacyConflatedOrderReceipt),
      level: event.level || '',
      remarks: event.remarks || '',
    };
  }
  return {
    collectionOrderId: event.collectionOrderId || '',
    receivedAt: event.receivedAt || '',
    receivedBy: event.receivedBy || '',
    signaturePath: event.signaturePath || '',
    remarks: event.remarks || '',
    legacyCollectDeliverCollectId: event.legacyCollectDeliverCollectId || '',
    legacyConflatedOrderReceipt: Boolean(event.legacyConflatedOrderReceipt),
    acceptanceState: event.acceptanceState || '',
  };
}

function UnitTable({
  units,
  entitiesById,
  pointsById,
  permissions,
  busy,
  onEdit,
  onArchive,
  onRestore,
  onAudit,
}: {
  units: CollectionUnit[];
  entitiesById: Map<string, SupplyEntity>;
  pointsById: Map<string, CollectionPoint>;
  permissions: Record<string, boolean>;
  busy?: boolean;
  onEdit: (record: CollectionUnit) => void;
  onArchive: (id: string) => void;
  onRestore: (id: string) => void;
  onAudit: (id: string, label: string) => void;
}) {
  if (!units.length) return <EmptyState icon={<Boxes className="h-6 w-6" />} title="No collection units" />;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Unit</TableHead>
          <TableHead>Supply</TableHead>
          <TableHead>Point</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>HET</TableHead>
          <TableHead>Work order</TableHead>
          <TableHead>Parity</TableHead>
          <TableHead>Updated</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {units.map((unit) => {
          const label = unit.unitNumber || unit.id;
          return (
            <TableRow key={unit.id}>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Link
                    to={`/dashboard/procurement/collection-units/${encodeURIComponent(unit.id)}`}
                    className="inline-flex items-center gap-1 font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300"
                  >
                    {label}
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                  <DeletedBadge record={unit} />
                </div>
                <div className="text-xs text-gray-500">{unit.parcelTrackingNumber || unit.sourceSystem || '-'}</div>
              </TableCell>
              <TableCell>{unit.supplyEntityId ? entityName(entitiesById.get(unit.supplyEntityId)) : '-'}</TableCell>
              <TableCell>{unit.collectionPointId ? pointName(pointsById.get(unit.collectionPointId)) : '-'}</TableCell>
              <TableCell><StatusPill tone={statusTone(unit.status)}>{unit.status.replace(/_/g, ' ')}</StatusPill></TableCell>
              <TableCell>{unit.legacyHetId || '-'}</TableCell>
              <TableCell>{unit.legacyUsedByWorkOrderId || '-'}</TableCell>
              <TableCell>
                <div className="flex flex-col gap-1">
                  <StatusPill tone={unit.hiddenFromOperations ? 'warning' : 'success'}>
                    {unit.hiddenFromOperations ? 'Hidden' : 'Operational'}
                  </StatusPill>
                  <span className="text-xs text-gray-500">{unit.linkCompleteness || unit.semanticConfidence || '-'}</span>
                </div>
              </TableCell>
              <TableCell>{formatDate(unit.updatedAt)}</TableCell>
              <TableCell>
                <RowCrudActions
                  deleted={unit.deleted}
                  canEdit={permissions.update}
                  canArchive={permissions.delete}
                  canRestore={permissions.restore}
                  canAudit={permissions.readAudit}
                  busy={busy}
                  onEdit={() => onEdit(unit)}
                  onArchive={() => onArchive(unit.id)}
                  onRestore={() => onRestore(unit.id)}
                  onAudit={() => onAudit(unit.id, label)}
                />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function EventTable({
  events,
  kind,
  permissions,
  busy,
  onEdit,
  onArchive,
  onRestore,
  onAudit,
}: {
  events: ProcurementEvent[];
  kind: 'issuance' | 'order' | 'receipt';
  permissions: Record<string, boolean>;
  busy?: boolean;
  onEdit: (record: ProcurementEvent, kind: 'issuance' | 'order' | 'receipt') => void;
  onArchive: (id: string) => void;
  onRestore: (id: string) => void;
  onAudit: (id: string, label: string) => void;
}) {
  if (!events.length) return <EmptyState icon={<ClipboardList className="h-6 w-6" />} title="No records" />;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>ID</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Legacy event</TableHead>
          <TableHead>Confidence</TableHead>
          <TableHead>Date</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {events.map((event) => {
          const legacyId = event.legacyDeliverCollectId || event.legacyCollectDeliverCollectId || '-';
          return (
            <TableRow key={event.id}>
              <TableCell>
                <div className="flex items-center gap-2 font-medium text-gray-800 dark:text-white/90">
                  {event.id}
                  <DeletedBadge record={event} />
                </div>
              </TableCell>
              <TableCell>
                <StatusPill tone={statusTone(event.status || event.legacyDirection)}>
                  {(event.status || event.legacyDirection || '-').replace(/_/g, ' ')}
                </StatusPill>
              </TableCell>
              <TableCell>{legacyId}</TableCell>
              <TableCell>
                <div className="flex flex-col gap-1">
                  <span>{event.semanticConfidence || '-'}</span>
                  {event.legacyConflatedOrderReceipt && <StatusPill tone="warning">Conflated</StatusPill>}
                </div>
              </TableCell>
              <TableCell>{formatDate(eventDate(event, kind))}</TableCell>
              <TableCell>
                <RowCrudActions
                  deleted={event.deleted}
                  canEdit={permissions.update}
                  canArchive={permissions.delete}
                  canRestore={permissions.restore}
                  canAudit={permissions.readAudit}
                  busy={busy}
                  onEdit={() => onEdit(event, kind)}
                  onArchive={() => onArchive(event.id)}
                  onRestore={() => onRestore(event.id)}
                  onAudit={() => onAudit(event.id, event.id)}
                />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function PointsTable({
  points,
  entitiesById,
  permissions,
  busy,
  onEdit,
  onArchive,
  onRestore,
  onAudit,
}: {
  points: CollectionPoint[];
  entitiesById: Map<string, SupplyEntity>;
  permissions: Record<string, boolean>;
  busy?: boolean;
  onEdit: (record: CollectionPoint) => void;
  onArchive: (id: string) => void;
  onRestore: (id: string) => void;
  onAudit: (id: string, label: string) => void;
}) {
  if (!points.length) return <EmptyState icon={<MapPin className="h-6 w-6" />} title="No collection points" />;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Collection point</TableHead>
          <TableHead>Supply</TableHead>
          <TableHead>Contact</TableHead>
          <TableHead>Address</TableHead>
          <TableHead>Updated</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {points.map((point) => {
          const label = pointName(point);
          return (
            <TableRow key={point.id}>
              <TableCell>
                <div className="flex items-center gap-2 font-medium text-gray-800 dark:text-white/90">
                  {label}
                  <DeletedBadge record={point} />
                </div>
                <div className="text-xs text-gray-500">{point.hciCode || point.legacyClinicId || point.id}</div>
              </TableCell>
              <TableCell>{entityName(entitiesById.get(point.supplyEntityId))}</TableCell>
              <TableCell>
                <div>{point.personInCharge || '-'}</div>
                <div className="text-xs text-gray-500">{point.telephone || point.licenseName || '-'}</div>
              </TableCell>
              <TableCell>
                <div>{point.address || '-'}</div>
                <div className="text-xs text-gray-500">{point.postalCode || '-'}</div>
              </TableCell>
              <TableCell>{formatDate(point.updatedAt)}</TableCell>
              <TableCell>
                <RowCrudActions
                  deleted={point.deleted}
                  canEdit={permissions.update}
                  canArchive={permissions.delete}
                  canRestore={permissions.restore}
                  canAudit={permissions.readAudit}
                  busy={busy}
                  onEdit={() => onEdit(point)}
                  onArchive={() => onArchive(point.id)}
                  onRestore={() => onRestore(point.id)}
                  onAudit={() => onAudit(point.id, label)}
                />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function IssuanceLinesTable({
  lines,
  unitsById,
  permissions,
  busy,
  onEdit,
  onArchive,
  onRestore,
  onAudit,
}: {
  lines: IssuanceOrderLine[];
  unitsById: Map<string, CollectionUnit>;
  permissions: Record<string, boolean>;
  busy?: boolean;
  onEdit: (record: IssuanceOrderLine) => void;
  onArchive: (id: string) => void;
  onRestore: (id: string) => void;
  onAudit: (id: string, label: string) => void;
}) {
  if (!lines.length) return <EmptyState icon={<ClipboardList className="h-6 w-6" />} title="No issuance lines" />;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Issuance order</TableHead>
          <TableHead>Collection unit</TableHead>
          <TableHead>Legacy HET</TableHead>
          <TableHead>Tracking</TableHead>
          <TableHead>Updated</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {lines.map((line) => {
          const label = line.legacyHetNumber || line.parcelTrackingNumber || line.id;
          return (
            <TableRow key={line.id}>
              <TableCell>
                <div className="flex items-center gap-2 font-medium text-gray-800 dark:text-white/90">
                  {line.issuanceOrderId}
                  <DeletedBadge record={line} />
                </div>
              </TableCell>
              <TableCell>{line.collectionUnitId ? unitName(unitsById.get(line.collectionUnitId)) : '-'}</TableCell>
              <TableCell>
                <div>{line.legacyHetNumber || '-'}</div>
                <div className="text-xs text-gray-500">{line.legacyHetId || '-'}</div>
              </TableCell>
              <TableCell>{line.parcelTrackingNumber || '-'}</TableCell>
              <TableCell>{formatDate(line.updatedAt)}</TableCell>
              <TableCell>
                <RowCrudActions
                  deleted={line.deleted}
                  canEdit={permissions.update}
                  canArchive={permissions.delete}
                  canRestore={permissions.restore}
                  canAudit={permissions.readAudit}
                  busy={busy}
                  onEdit={() => onEdit(line)}
                  onArchive={() => onArchive(line.id)}
                  onRestore={() => onRestore(line.id)}
                  onAudit={() => onAudit(line.id, label)}
                />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function FulfilmentsTable({
  fulfilments,
  unitsById,
  permissions,
  busy,
  onEdit,
  onArchive,
  onRestore,
  onAudit,
}: {
  fulfilments: CollectionUnitFulfilment[];
  unitsById: Map<string, CollectionUnit>;
  permissions: Record<string, boolean>;
  busy?: boolean;
  onEdit: (record: CollectionUnitFulfilment) => void;
  onArchive: (id: string) => void;
  onRestore: (id: string) => void;
  onAudit: (id: string, label: string) => void;
}) {
  if (!fulfilments.length) return <EmptyState icon={<Truck className="h-6 w-6" />} title="No fulfilments" />;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Collection unit</TableHead>
          <TableHead>Fulfilled</TableHead>
          <TableHead>Source</TableHead>
          <TableHead>Evidence</TableHead>
          <TableHead>Remarks</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {fulfilments.map((fulfilment) => {
          const label = unitName(unitsById.get(fulfilment.collectionUnitId));
          return (
            <TableRow key={fulfilment.id}>
              <TableCell>
                <div className="flex items-center gap-2 font-medium text-gray-800 dark:text-white/90">
                  {label}
                  <DeletedBadge record={fulfilment} />
                </div>
              </TableCell>
              <TableCell>
                <div>{formatDate(fulfilment.fulfilledAt)}</div>
                <div className="text-xs text-gray-500">{fulfilment.fulfilledBy || '-'}</div>
              </TableCell>
              <TableCell>
                <div className="flex flex-col gap-1">
                  <span>{fulfilment.source || '-'}</span>
                  {fulfilment.inferred && <StatusPill tone="warning">Inferred</StatusPill>}
                </div>
              </TableCell>
              <TableCell>{fulfilment.evidencePath || '-'}</TableCell>
              <TableCell>{fulfilment.remarks || '-'}</TableCell>
              <TableCell>
                <RowCrudActions
                  deleted={fulfilment.deleted}
                  canEdit={permissions.update}
                  canArchive={permissions.delete}
                  canRestore={permissions.restore}
                  canAudit={permissions.readAudit}
                  busy={busy}
                  onEdit={() => onEdit(fulfilment)}
                  onArchive={() => onArchive(fulfilment.id)}
                  onRestore={() => onRestore(fulfilment.id)}
                  onAudit={() => onAudit(fulfilment.id, label)}
                />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function ReceiptLinesTable({
  lines,
  unitsById,
  permissions,
  busy,
  onEdit,
  onArchive,
  onRestore,
  onAudit,
}: {
  lines: CollectionReceiptLine[];
  unitsById: Map<string, CollectionUnit>;
  permissions: Record<string, boolean>;
  busy?: boolean;
  onEdit: (record: CollectionReceiptLine) => void;
  onArchive: (id: string) => void;
  onRestore: (id: string) => void;
  onAudit: (id: string, label: string) => void;
}) {
  if (!lines.length) return <EmptyState icon={<FileCheck2 className="h-6 w-6" />} title="No receipt lines" />;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Receipt</TableHead>
          <TableHead>Collection unit</TableHead>
          <TableHead>Condition</TableHead>
          <TableHead>Acceptance</TableHead>
          <TableHead>Resulting HET</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {lines.map((line) => {
          const label = line.resultingHetId || line.collectionReceiptId || line.id;
          return (
            <TableRow key={line.id}>
              <TableCell>
                <div className="flex items-center gap-2 font-medium text-gray-800 dark:text-white/90">
                  {line.collectionReceiptId}
                  <DeletedBadge record={line} />
                </div>
              </TableCell>
              <TableCell>{line.collectionUnitId ? unitName(unitsById.get(line.collectionUnitId)) : '-'}</TableCell>
              <TableCell>{line.conditionStatus || '-'}</TableCell>
              <TableCell>
                <div className="flex flex-col gap-1">
                  <StatusPill tone={statusTone(line.acceptanceStatus)}>
                    {(line.acceptanceStatus || '-').replace(/_/g, ' ')}
                  </StatusPill>
                  <span className="text-xs text-gray-500">{line.discrepancyReason || '-'}</span>
                </div>
              </TableCell>
              <TableCell>{line.resultingHetId || '-'}</TableCell>
              <TableCell>
                <RowCrudActions
                  deleted={line.deleted}
                  canEdit={permissions.update}
                  canArchive={permissions.delete}
                  canRestore={permissions.restore}
                  canAudit={permissions.readAudit}
                  busy={busy}
                  onEdit={() => onEdit(line)}
                  onArchive={() => onArchive(line.id)}
                  onRestore={() => onRestore(line.id)}
                  onAudit={() => onAudit(line.id, label)}
                />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function ImportReportsTable({
  reports,
  permissions,
  busy,
  onArchive,
  onRestore,
  onAudit,
}: {
  reports: ProcurementImportReport[];
  permissions: Record<string, boolean>;
  busy?: boolean;
  onArchive: (id: string) => void;
  onRestore: (id: string) => void;
  onAudit: (id: string, label: string) => void;
}) {
  if (!reports.length) return <EmptyState icon={<FileClock className="h-6 w-6" />} title="No import reports" />;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Source</TableHead>
          <TableHead>Mode</TableHead>
          <TableHead>Started</TableHead>
          <TableHead>Finished</TableHead>
          <TableHead>Report</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {reports.map((report) => (
          <TableRow key={report.id}>
            <TableCell>
              <div className="flex items-center gap-2 font-medium text-gray-800 dark:text-white/90">
                {report.source}
                <DeletedBadge record={report} />
              </div>
            </TableCell>
            <TableCell><StatusPill tone={report.dryRun ? 'warning' : 'success'}>{report.dryRun ? 'Dry run' : 'Applied'}</StatusPill></TableCell>
            <TableCell>{formatDate(report.startedAt)}</TableCell>
            <TableCell>{formatDate(report.finishedAt)}</TableCell>
            <TableCell><code className="block max-w-md truncate rounded bg-gray-100 px-2 py-1 text-xs text-gray-700 dark:bg-gray-800 dark:text-gray-300">{importReportSummary(report)}</code></TableCell>
            <TableCell>
              <RowCrudActions
                deleted={report.deleted}
                canEdit={false}
                canArchive={permissions.delete}
                canRestore={permissions.restore}
                canAudit={permissions.readAudit}
                busy={busy}
                onEdit={() => undefined}
                onArchive={() => onArchive(report.id)}
                onRestore={() => onRestore(report.id)}
                onAudit={() => onAudit(report.id, report.source)}
              />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default function ProcurementPage() {
  const queryClient = useQueryClient();
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const role = useAuthStore((state) => state.user?.role?.key || 'user');
  const [includeHidden, setIncludeHidden] = useState(false);
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [unitSearch, setUnitSearch] = useState('');
  const [editor, setEditor] = useState<EditorState>(null);
  const [audit, setAudit] = useState<AuditState>(null);

  const can = (kind: ActionKind, action: string) => hasPermission(`${resourceByKind[kind]}.${action}`);
  const permissions = (kind: ActionKind) => ({
    create: can(kind, 'create'),
    update: can(kind, 'update'),
    delete: can(kind, 'delete'),
    restore: can(kind, 'restore'),
    readDeleted: can(kind, 'readDeleted'),
    readAudit: can(kind, 'readAudit'),
  });
  const canIncludeDeleted = (Object.keys(resourceByKind) as ActionKind[]).some((kind) => can(kind, 'readDeleted') || can(kind, 'readAudit'));
  const includeDeletedFor = (kind: ActionKind) => includeDeleted && (can(kind, 'readDeleted') || can(kind, 'readAudit'));
  const canReadImports = role === 'owner' || role === 'admin' || can('import', 'read');

  const overview = useQuery({ queryKey: ['procurement', 'overview'], queryFn: fetchProcurementOverview });
  const entities = useQuery({
    queryKey: ['procurement', 'supply-entities', includeDeletedFor('supply')],
    queryFn: () => fetchSupplyEntities({ includeDeleted: includeDeletedFor('supply') }),
  });
  const points = useQuery({ queryKey: ['procurement', 'collection-points', includeDeletedFor('point')], queryFn: () => fetchCollectionPoints({ includeDeleted: includeDeletedFor('point') }) });
  const units = useQuery({
    queryKey: ['procurement', 'collection-units', includeHidden, includeDeletedFor('unit'), unitSearch],
    queryFn: () => fetchCollectionUnits({ includeHidden, includeDeleted: includeDeletedFor('unit'), q: unitSearch }),
  });
  const issuance = useQuery({
    queryKey: ['procurement', 'issuance-orders', includeDeletedFor('issuance')],
    queryFn: () => fetchIssuanceOrders({ includeDeleted: includeDeletedFor('issuance') }),
  });
  const issuanceLines = useQuery({
    queryKey: ['procurement', 'issuance-order-lines', includeDeletedFor('issuanceLine')],
    queryFn: () => fetchIssuanceOrderLines({ includeDeleted: includeDeletedFor('issuanceLine') }),
  });
  const fulfilments = useQuery({
    queryKey: ['procurement', 'collection-unit-fulfilments', includeDeletedFor('fulfilment')],
    queryFn: () => fetchCollectionUnitFulfilments({ includeDeleted: includeDeletedFor('fulfilment') }),
  });
  const collectionOrders = useQuery({
    queryKey: ['procurement', 'collection-orders', includeDeletedFor('order')],
    queryFn: () => fetchCollectionOrders({ includeDeleted: includeDeletedFor('order') }),
  });
  const receipts = useQuery({
    queryKey: ['procurement', 'collection-receipts', includeDeletedFor('receipt')],
    queryFn: () => fetchCollectionReceipts({ includeDeleted: includeDeletedFor('receipt') }),
  });
  const receiptLines = useQuery({
    queryKey: ['procurement', 'collection-receipt-lines', includeDeletedFor('receiptLine')],
    queryFn: () => fetchCollectionReceiptLines({ includeDeleted: includeDeletedFor('receiptLine') }),
  });
  const importReports = useQuery({
    queryKey: ['procurement', 'import-reports', includeDeletedFor('import')],
    queryFn: () => fetchProcurementImportReports({ includeDeleted: includeDeletedFor('import') }),
    enabled: canReadImports,
    retry: false,
  });
  const auditQuery = useQuery<AuditEvent<unknown>[]>({
    queryKey: ['procurement', 'audit', audit?.kind, audit?.id],
    enabled: Boolean(audit),
    queryFn: async () => {
      if (!audit) return Promise.resolve([]);
      if (audit.kind === 'supply') return fetchSupplyEntityAudit(audit.id);
      if (audit.kind === 'point') return fetchCollectionPointAudit(audit.id);
      if (audit.kind === 'unit') return fetchCollectionUnitAudit(audit.id);
      if (audit.kind === 'issuance') return fetchIssuanceOrderAudit(audit.id);
      if (audit.kind === 'issuanceLine') return fetchIssuanceOrderLineAudit(audit.id);
      if (audit.kind === 'fulfilment') return fetchCollectionUnitFulfilmentAudit(audit.id);
      if (audit.kind === 'order') return fetchCollectionOrderAudit(audit.id);
      if (audit.kind === 'receipt') return fetchCollectionReceiptAudit(audit.id);
      if (audit.kind === 'receiptLine') return fetchCollectionReceiptLineAudit(audit.id);
      return fetchProcurementImportReportAudit(audit.id);
    },
  });

  const invalidateProcurement = () => {
    queryClient.invalidateQueries({ queryKey: ['procurement'] });
  };

  const archiveMutation = useMutation<unknown, Error, { kind: ActionKind; id: string }>({
    mutationFn: ({ kind, id }: { kind: ActionKind; id: string }) => {
      if (kind === 'supply') return archiveSupplyEntity(id);
      if (kind === 'point') return archiveCollectionPoint(id);
      if (kind === 'unit') return archiveCollectionUnit(id);
      if (kind === 'issuance') return archiveIssuanceOrder(id);
      if (kind === 'issuanceLine') return archiveIssuanceOrderLine(id);
      if (kind === 'fulfilment') return archiveCollectionUnitFulfilment(id);
      if (kind === 'order') return archiveCollectionOrder(id);
      if (kind === 'receipt') return archiveCollectionReceipt(id);
      if (kind === 'receiptLine') return archiveCollectionReceiptLine(id);
      return archiveProcurementImportReport(id);
    },
    onSuccess: () => {
      invalidateProcurement();
      toast.success('Record archived');
    },
    onError: (error) => toast.error(errorMessage(error, 'Failed to archive record')),
  });

  const restoreMutation = useMutation<unknown, Error, { kind: ActionKind; id: string }>({
    mutationFn: ({ kind, id }: { kind: ActionKind; id: string }) => {
      if (kind === 'supply') return restoreSupplyEntity(id);
      if (kind === 'point') return restoreCollectionPoint(id);
      if (kind === 'unit') return restoreCollectionUnit(id);
      if (kind === 'issuance') return restoreIssuanceOrder(id);
      if (kind === 'issuanceLine') return restoreIssuanceOrderLine(id);
      if (kind === 'fulfilment') return restoreCollectionUnitFulfilment(id);
      if (kind === 'order') return restoreCollectionOrder(id);
      if (kind === 'receipt') return restoreCollectionReceipt(id);
      if (kind === 'receiptLine') return restoreCollectionReceiptLine(id);
      return restoreProcurementImportReport(id);
    },
    onSuccess: () => {
      invalidateProcurement();
      toast.success('Record restored');
    },
    onError: (error) => toast.error(errorMessage(error, 'Failed to restore record')),
  });

  const updateMutation = useMutation<unknown, Error, { kind: EditableKind; id: string; values: Record<string, string | boolean> }>({
    mutationFn: ({ kind, id, values }: { kind: EditableKind; id: string; values: Record<string, string | boolean> }) => {
      const payload = cleanPayload(values);
      if (kind === 'supply') return updateSupplyEntity(id, payload as SupplyEntityPayload);
      if (kind === 'point') return updateCollectionPoint(id, payload as CollectionPointPayload);
      if (kind === 'unit') return updateCollectionUnit(id, payload as CollectionUnitPayload);
      if (kind === 'issuance') return updateIssuanceOrder(id, payload as IssuanceOrderPayload);
      if (kind === 'issuanceLine') return updateIssuanceOrderLine(id, payload as IssuanceOrderLinePayload);
      if (kind === 'fulfilment') return updateCollectionUnitFulfilment(id, payload as CollectionUnitFulfilmentPayload);
      if (kind === 'order') return updateCollectionOrder(id, payload as CollectionOrderPayload);
      if (kind === 'receipt') return updateCollectionReceipt(id, payload as CollectionReceiptPayload);
      return updateCollectionReceiptLine(id, payload as CollectionReceiptLinePayload);
    },
    onSuccess: () => {
      setEditor(null);
      invalidateProcurement();
      toast.success('Record updated');
    },
    onError: (error) => toast.error(errorMessage(error, 'Failed to update record')),
  });

  const createMutation = useMutation<unknown, Error, { kind: EditableKind; values: Record<string, string | boolean> }>({
    mutationFn: ({ kind, values }) => {
      const payload = cleanPayload(values);
      if (kind === 'supply') return createSupplyEntity(payload as SupplyEntityPayload);
      if (kind === 'point') return createCollectionPoint(payload as CollectionPointPayload);
      if (kind === 'unit') return createCollectionUnit(payload as CollectionUnitPayload);
      if (kind === 'issuance') return createIssuanceOrder(payload as IssuanceOrderPayload);
      if (kind === 'issuanceLine') return createIssuanceOrderLine(payload as IssuanceOrderLinePayload);
      if (kind === 'fulfilment') return createCollectionUnitFulfilment(payload as CollectionUnitFulfilmentPayload);
      if (kind === 'order') return createCollectionOrder(payload as CollectionOrderPayload);
      if (kind === 'receipt') return createCollectionReceipt(payload as CollectionReceiptPayload);
      return createCollectionReceiptLine(payload as CollectionReceiptLinePayload);
    },
    onSuccess: () => {
      setEditor(null);
      invalidateProcurement();
      toast.success('Record created');
    },
    onError: (error) => toast.error(errorMessage(error, 'Failed to create record')),
  });

  const entitiesById = useMemo(() => new Map((entities.data ?? []).map((entity) => [entity.id, entity])), [entities.data]);
  const pointsById = useMemo(() => new Map((points.data ?? []).map((point) => [point.id, point])), [points.data]);
  const unitsById = useMemo(() => new Map((units.data ?? []).map((unit) => [unit.id, unit])), [units.data]);
  const entityOptions = useMemo(() => (entities.data ?? []).map((entity) => option(entity.id, entityName(entity))).filter((entry): entry is { value: string; label: string } => Boolean(entry)), [entities.data]);
  const pointOptions = useMemo(() => (points.data ?? []).map((point) => option(point.id, pointName(point))).filter((entry): entry is { value: string; label: string } => Boolean(entry)), [points.data]);
  const unitOptions = useMemo(() => (units.data ?? []).map((unit) => option(unit.id, unitName(unit))).filter((entry): entry is { value: string; label: string } => Boolean(entry)), [units.data]);
  const issuanceOptions = useMemo(() => (issuance.data ?? []).map((event) => option(event.id, event.issuedBy || event.legacyDeliverCollectId || event.id)).filter((entry): entry is { value: string; label: string } => Boolean(entry)), [issuance.data]);
  const orderOptions = useMemo(() => (collectionOrders.data ?? []).map((event) => option(event.id, event.requestedBy || event.legacyCollectDeliverCollectId || event.id)).filter((entry): entry is { value: string; label: string } => Boolean(entry)), [collectionOrders.data]);
  const receiptOptions = useMemo(() => (receipts.data ?? []).map((event) => option(event.id, event.receivedBy || event.legacyCollectDeliverCollectId || event.id)).filter((entry): entry is { value: string; label: string } => Boolean(entry)), [receipts.data]);
  const metrics = overview.data;
  const hasError = overview.isError || entities.isError || points.isError || units.isError || issuance.isError || issuanceLines.isError || fulfilments.isError || collectionOrders.isError || receipts.isError || receiptLines.isError;
  const mutationBusy = archiveMutation.isPending || restoreMutation.isPending;

  const setField = (key: string, value: string | boolean) => {
    setEditor((current) => current && { ...current, values: { ...current.values, [key]: value } });
  };
  const submitEditor = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editor) return;
    if (editor.mode === 'create') {
      createMutation.mutate({ kind: editor.kind, values: editor.values });
      return;
    }
    if (editor.id) updateMutation.mutate({ kind: editor.kind, id: editor.id, values: editor.values });
  };

  const openSupplyEditor = (entity: SupplyEntity) => setEditor({
    mode: 'edit',
    kind: 'supply',
    id: entity.id,
    label: entityName(entity),
    values: {
      name: entity.name || '',
      legalName: entity.legalName || '',
      externalCode: entity.externalCode || '',
      legacyClinicId: entity.legacyClinicId || '',
      legacyGroupKey: entity.legacyGroupKey || '',
      sourceSystem: entity.sourceSystem || '',
    },
  });
  const openPointEditor = (point: CollectionPoint) => setEditor({
    mode: 'edit',
    kind: 'point',
    id: point.id,
    label: pointName(point),
    values: {
      supplyEntityId: point.supplyEntityId || '',
      legacyClinicId: point.legacyClinicId || '',
      hciCode: point.hciCode || '',
      displayName: point.displayName || '',
      licenseName: point.licenseName || '',
      address: point.address || '',
      postalCode: point.postalCode || '',
      telephone: point.telephone || '',
      personInCharge: point.personInCharge || '',
    },
  });
  const openUnitEditor = (unit: CollectionUnit) => setEditor({
    mode: 'edit',
    kind: 'unit',
    id: unit.id,
    label: unit.unitNumber || unit.id,
    values: {
      unitNumber: unit.unitNumber || '',
      status: unit.status || '',
      supplyEntityId: unit.supplyEntityId || '',
      collectionPointId: unit.collectionPointId || '',
      legacyHetId: unit.legacyHetId || '',
      parcelTrackingNumber: unit.parcelTrackingNumber || '',
      legacyUsedByWorkOrderId: unit.legacyUsedByWorkOrderId || '',
      sourceSystem: unit.sourceSystem || '',
      linkCompleteness: unit.linkCompleteness || '',
      semanticConfidence: unit.semanticConfidence || '',
      hiddenFromOperations: unit.hiddenFromOperations,
    },
  });
  const openEventEditor = (record: ProcurementEvent, kind: 'issuance' | 'order' | 'receipt') => {
    setEditor({ mode: 'edit', kind, id: record.id, label: record.id, values: eventInitialValues(record, kind) });
  };
  const openIssuanceLineEditor = (line: IssuanceOrderLine) => setEditor({
    mode: 'edit',
    kind: 'issuanceLine',
    id: line.id,
    label: line.legacyHetNumber || line.id,
    values: {
      issuanceOrderId: line.issuanceOrderId || '',
      collectionUnitId: line.collectionUnitId || '',
      legacyHetId: line.legacyHetId || '',
      legacyHetNumber: line.legacyHetNumber || '',
      parcelTrackingNumber: line.parcelTrackingNumber || '',
    },
  });
  const openFulfilmentEditor = (fulfilment: CollectionUnitFulfilment) => setEditor({
    mode: 'edit',
    kind: 'fulfilment',
    id: fulfilment.id,
    label: unitName(unitsById.get(fulfilment.collectionUnitId)),
    values: {
      collectionUnitId: fulfilment.collectionUnitId || '',
      fulfilledAt: fulfilment.fulfilledAt || '',
      fulfilledBy: fulfilment.fulfilledBy || '',
      source: fulfilment.source || '',
      evidencePath: fulfilment.evidencePath || '',
      remarks: fulfilment.remarks || '',
      inferred: fulfilment.inferred,
    },
  });
  const openReceiptLineEditor = (line: CollectionReceiptLine) => setEditor({
    mode: 'edit',
    kind: 'receiptLine',
    id: line.id,
    label: line.resultingHetId || line.collectionReceiptId || line.id,
    values: {
      collectionReceiptId: line.collectionReceiptId || '',
      collectionUnitId: line.collectionUnitId || '',
      conditionStatus: line.conditionStatus || '',
      acceptanceStatus: line.acceptanceStatus || '',
      resultingHetId: line.resultingHetId || '',
      discrepancyReason: line.discrepancyReason || '',
    },
  });
  const openCreateEditor = (kind: EditableKind) => {
    const values: Record<EditableKind, Record<string, string | boolean>> = {
      supply: { name: '', legalName: '', externalCode: '', legacyClinicId: '', legacyGroupKey: '', sourceSystem: '' },
      point: {
        supplyEntityId: '',
        legacyClinicId: '',
        hciCode: '',
        displayName: '',
        licenseName: '',
        address: '',
        postalCode: '',
        telephone: '',
        personInCharge: '',
      },
      unit: {
        unitNumber: '',
        status: 'available',
        supplyEntityId: '',
        collectionPointId: '',
        legacyHetId: '',
        parcelTrackingNumber: '',
        legacyUsedByWorkOrderId: '',
        sourceSystem: '',
        linkCompleteness: '',
        semanticConfidence: '',
        hiddenFromOperations: false,
      },
      issuance: eventInitialValues({ id: '' } as ProcurementEvent, 'issuance'),
      issuanceLine: {
        issuanceOrderId: '',
        collectionUnitId: '',
        legacyHetId: '',
        legacyHetNumber: '',
        parcelTrackingNumber: '',
      },
      fulfilment: {
        collectionUnitId: '',
        fulfilledAt: '',
        fulfilledBy: '',
        source: '',
        evidencePath: '',
        remarks: '',
        inferred: false,
      },
      order: eventInitialValues({ id: '', status: 'requested' } as ProcurementEvent, 'order'),
      receipt: eventInitialValues({ id: '' } as ProcurementEvent, 'receipt'),
      receiptLine: {
        collectionReceiptId: '',
        collectionUnitId: '',
        conditionStatus: '',
        acceptanceStatus: '',
        resultingHetId: '',
        discrepancyReason: '',
      },
    };
    setEditor({ mode: 'create', kind, label: kind.replace(/_/g, ' '), values: values[kind] });
  };

  const renderEditorFields = () => {
    if (!editor) return null;
    const value = (key: string) => String(editor.values[key] ?? '');
    const selectField = (key: string, options: Array<{ value: string; label: string }>, label?: string) => (
      <SelectField key={key} label={label ?? editorFieldLabels[editor.kind][key]} value={value(key)} options={options} onChange={(next) => setField(key, next)} />
    );
    const enumField = (key: string, values: string[], label?: string) => selectField(key, values.map((entry) => ({ value: entry, label: entry.replace(/_/g, ' ') })), label);
    const relationshipField = (key: string) => {
      if (key === 'supplyEntityId') return selectField(key, entityOptions);
      if (key === 'collectionPointId') return selectField(key, pointOptions);
      if (key === 'collectionUnitId') return selectField(key, unitOptions);
      if (key === 'issuanceOrderId') return selectField(key, issuanceOptions);
      if (key === 'collectionOrderId') return selectField(key, orderOptions);
      if (key === 'collectionReceiptId') return selectField(key, receiptOptions);
      return null;
    };
    if (editor.kind === 'supply') {
      return (
        <>
          <TextField label="Name" value={value('name')} onChange={(next) => setField('name', next)} />
          <TextField label="Legal name" value={value('legalName')} onChange={(next) => setField('legalName', next)} />
          <TextField label="External code" value={value('externalCode')} onChange={(next) => setField('externalCode', next)} />
          <TextField label="Legacy clinic" value={value('legacyClinicId')} onChange={(next) => setField('legacyClinicId', next)} />
          <TextField label="Legacy group" value={value('legacyGroupKey')} onChange={(next) => setField('legacyGroupKey', next)} />
          <TextField label="Source system" value={value('sourceSystem')} onChange={(next) => setField('sourceSystem', next)} />
        </>
      );
    }
    if (editor.kind === 'unit') {
      return (
        <>
          <TextField label="Unit number" value={value('unitNumber')} onChange={(next) => setField('unitNumber', next)} />
          {enumField('status', ['available', 'issued', 'received', 'consumed', 'archived'])}
          {selectField('supplyEntityId', entityOptions, 'Supply entity')}
          {selectField('collectionPointId', pointOptions, 'Collection point')}
          <TextField label="Legacy HET" value={value('legacyHetId')} onChange={(next) => setField('legacyHetId', next)} />
          <TextField label="Parcel tracking" value={value('parcelTrackingNumber')} onChange={(next) => setField('parcelTrackingNumber', next)} />
          <TextField label="Work order ID" value={value('legacyUsedByWorkOrderId')} onChange={(next) => setField('legacyUsedByWorkOrderId', next)} />
          <TextField label="Source system" value={value('sourceSystem')} onChange={(next) => setField('sourceSystem', next)} />
          <TextField label="Link completeness" value={value('linkCompleteness')} onChange={(next) => setField('linkCompleteness', next)} />
          <TextField label="Semantic confidence" value={value('semanticConfidence')} onChange={(next) => setField('semanticConfidence', next)} />
          <CheckboxField label="Hidden from operations" checked={Boolean(editor.values.hiddenFromOperations)} onChange={(next) => setField('hiddenFromOperations', next)} />
        </>
      );
    }
    const labels = editorFieldLabels[editor.kind];
    const orderedKeys = [...Object.keys(labels), ...Object.keys(editor.values).filter((key) => !labels[key])];
    const fields = orderedKeys.filter((key) => typeof editor.values[key] !== 'boolean');
    const booleanFields = orderedKeys.filter((key) => typeof editor.values[key] === 'boolean');
    return (
      <>
        {fields.map((key) => (
          relationshipField(key) ??
          (key === 'status'
            ? enumField(key, ['requested', 'scheduled', 'collected', 'received', 'cancelled'])
            : key === 'acceptanceState' || key === 'acceptanceStatus'
              ? enumField(key, ['accepted', 'rejected', 'quarantined', 'pending'])
              : key === 'conditionStatus'
                ? enumField(key, ['intact', 'damaged', 'missing', 'unknown'])
                : key === 'source'
                  ? enumField(key, ['manual', 'legacy', 'api', 'inferred'])
                  : <TextField key={key} label={labels[key] ?? key.replace(/([A-Z])/g, ' $1')} value={value(key)} onChange={(next) => setField(key, next)} />)
        ))}
        {booleanFields.map((key) => (
          <CheckboxField key={key} label={labels[key] ?? (key === 'legacyConflatedOrderReceipt' ? 'Conflated order/receipt' : key.replace(/([A-Z])/g, ' $1'))} checked={Boolean(editor.values[key])} onChange={(next) => setField(key, next)} />
        ))}
      </>
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Procurement"
        description="Supply, collection units, collection returns, and HET intake."
        action={
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => setIncludeHidden((value) => !value)}>
              {includeHidden ? 'Hide placeholders' : 'Show placeholders'}
            </Button>
            {canIncludeDeleted && <IncludeDeletedButton includeDeleted={includeDeleted} onToggle={() => setIncludeDeleted((value) => !value)} />}
          </div>
        }
      />

      {hasError && (
        <div className="flex items-start gap-3 rounded-lg border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{errorMessage((overview.error || entities.error || points.error || units.error || issuance.error || issuanceLines.error || fulfilments.error || collectionOrders.error || receipts.error || receiptLines.error) as Error, 'Procurement data could not be loaded.')}</span>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={<Building2 className="h-6 w-6" />} label="Supply entities" value={metrics?.supplyEntities ?? '-'} detail={`${metrics?.collectionPoints ?? '-'} points`} />
        <MetricCard icon={<Boxes className="h-6 w-6" />} label="Collection units" value={metrics?.unitsOperational ?? '-'} detail={`${metrics?.unitsTotal ?? '-'} total`} />
        <MetricCard icon={<Route className="h-6 w-6" />} label="Issuance orders" value={metrics?.issuanceOrders ?? '-'} />
        <MetricCard icon={<FileCheck2 className="h-6 w-6" />} label="Receipts" value={metrics?.collectionReceipts ?? '-'} detail={`${metrics?.linkedHets ?? '-'} HET links`} />
      </div>

      <AdminPanel>
        <Tabs defaultValue="units">
          <TabsList className="h-auto flex-wrap justify-start">
            <TabsTrigger value="units">Units</TabsTrigger>
            <TabsTrigger value="supply">Supply</TabsTrigger>
            <TabsTrigger value="issuance">Issuance</TabsTrigger>
            <TabsTrigger value="returns">Returns</TabsTrigger>
            <TabsTrigger value="imports">Imports</TabsTrigger>
          </TabsList>

          <TabsContent value="units" className="mt-4">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative w-full sm:max-w-sm">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                <input
                  type="search"
                  value={unitSearch}
                  onChange={(event) => setUnitSearch(event.target.value)}
                  placeholder="Search unit, HET, tracking, work order"
                  className="h-10 w-full rounded-lg border border-gray-200 bg-transparent py-2 pl-10 pr-3 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-none focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-white/[0.03] dark:text-white/90"
                />
              </div>
              <div className="flex items-center gap-2">
                {permissions('unit').create && <Button type="button" onClick={() => openCreateEditor('unit')}>Create unit</Button>}
                {units.isFetching && <span className="text-sm text-gray-500 dark:text-gray-400">Loading units...</span>}
              </div>
            </div>
            {units.isError ? <EmptyState icon={<AlertTriangle className="h-6 w-6" />} title="Unable to load collection units" /> : units.isLoading ? <EmptyState icon={<Boxes className="h-6 w-6" />} title="Loading collection units" /> : (
              <div className="space-y-6">
                <UnitTable
                  units={units.data ?? []}
                  entitiesById={entitiesById}
                  pointsById={pointsById}
                  permissions={permissions('unit')}
                  busy={mutationBusy}
                  onEdit={openUnitEditor}
                  onArchive={(id) => archiveMutation.mutate({ kind: 'unit', id })}
                  onRestore={(id) => restoreMutation.mutate({ kind: 'unit', id })}
                  onAudit={(id, label) => setAudit({ kind: 'unit', id, label })}
                />
                <div>
                  <div className="mb-3 flex items-center justify-between gap-2 text-sm font-semibold text-gray-800 dark:text-white/90">
                    <span className="inline-flex items-center gap-2"><Truck className="h-4 w-4" />Fulfilments</span>
                    {permissions('fulfilment').create && <Button type="button" size="sm" onClick={() => openCreateEditor('fulfilment')}>Create</Button>}
                  </div>
                  {fulfilments.isError ? <EmptyState icon={<AlertTriangle className="h-6 w-6" />} title="Unable to load fulfilments" /> : fulfilments.isLoading ? <EmptyState icon={<Truck className="h-6 w-6" />} title="Loading fulfilments" /> : (
                    <FulfilmentsTable
                      fulfilments={fulfilments.data ?? []}
                      unitsById={unitsById}
                      permissions={permissions('fulfilment')}
                      busy={mutationBusy}
                      onEdit={openFulfilmentEditor}
                      onArchive={(id) => archiveMutation.mutate({ kind: 'fulfilment', id })}
                      onRestore={(id) => restoreMutation.mutate({ kind: 'fulfilment', id })}
                      onAudit={(id, label) => setAudit({ kind: 'fulfilment', id, label })}
                    />
                  )}
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="supply" className="mt-4">
            <div className="space-y-6">
              <div>
                <div className="mb-4 flex justify-end">
                  {permissions('supply').create && <Button type="button" onClick={() => openCreateEditor('supply')}>Create supply entity</Button>}
                </div>
                {entities.isError ? <EmptyState icon={<AlertTriangle className="h-6 w-6" />} title="Unable to load supply entities" /> : entities.isLoading ? <EmptyState icon={<Building2 className="h-6 w-6" />} title="Loading supply entities" /> : !(entities.data ?? []).length ? <EmptyState icon={<Building2 className="h-6 w-6" />} title="No supply entities" /> : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Supply entity</TableHead>
                        <TableHead>External code</TableHead>
                        <TableHead>Legacy clinic</TableHead>
                        <TableHead>Collection points</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(entities.data ?? []).map((entity) => (
                        <TableRow key={entity.id}>
                          <TableCell>
                            <div className="flex items-center gap-2 font-medium text-gray-800 dark:text-white/90">
                              {entityName(entity)}
                              <DeletedBadge record={entity} />
                            </div>
                          </TableCell>
                          <TableCell>{entity.externalCode || '-'}</TableCell>
                          <TableCell>{entity.legacyClinicId || '-'}</TableCell>
                          <TableCell>{(points.data ?? []).filter((point) => point.supplyEntityId === entity.id).length}</TableCell>
                          <TableCell>
                            <RowCrudActions
                              deleted={entity.deleted}
                              canEdit={permissions('supply').update}
                              canArchive={permissions('supply').delete}
                              canRestore={permissions('supply').restore}
                              canAudit={permissions('supply').readAudit}
                              busy={mutationBusy}
                              onEdit={() => openSupplyEditor(entity)}
                              onArchive={() => archiveMutation.mutate({ kind: 'supply', id: entity.id })}
                              onRestore={() => restoreMutation.mutate({ kind: 'supply', id: entity.id })}
                              onAudit={() => setAudit({ kind: 'supply', id: entity.id, label: entityName(entity) })}
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
              <div>
                <div className="mb-3 flex items-center justify-between gap-2 text-sm font-semibold text-gray-800 dark:text-white/90">
                  <span className="inline-flex items-center gap-2"><MapPin className="h-4 w-4" />Collection points</span>
                  {permissions('point').create && <Button type="button" size="sm" onClick={() => openCreateEditor('point')}>Create</Button>}
                </div>
                {points.isError ? <EmptyState icon={<AlertTriangle className="h-6 w-6" />} title="Unable to load collection points" /> : points.isLoading ? <EmptyState icon={<MapPin className="h-6 w-6" />} title="Loading collection points" /> : (
                  <PointsTable
                    points={points.data ?? []}
                    entitiesById={entitiesById}
                    permissions={permissions('point')}
                    busy={mutationBusy}
                    onEdit={openPointEditor}
                    onArchive={(id) => archiveMutation.mutate({ kind: 'point', id })}
                    onRestore={(id) => restoreMutation.mutate({ kind: 'point', id })}
                    onAudit={(id, label) => setAudit({ kind: 'point', id, label })}
                  />
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="issuance" className="mt-4">
            <div className="space-y-6">
              <div>
                <div className="mb-4 flex justify-end">
                  {permissions('issuance').create && <Button type="button" onClick={() => openCreateEditor('issuance')}>Create issuance order</Button>}
                </div>
                {issuance.isError ? <EmptyState icon={<AlertTriangle className="h-6 w-6" />} title="Unable to load issuance orders" /> : issuance.isLoading ? <EmptyState icon={<ClipboardList className="h-6 w-6" />} title="Loading issuance orders" /> : (
                  <EventTable
                    events={issuance.data ?? []}
                    kind="issuance"
                    permissions={permissions('issuance')}
                    busy={mutationBusy}
                    onEdit={openEventEditor}
                    onArchive={(id) => archiveMutation.mutate({ kind: 'issuance', id })}
                    onRestore={(id) => restoreMutation.mutate({ kind: 'issuance', id })}
                    onAudit={(id, label) => setAudit({ kind: 'issuance', id, label })}
                  />
                )}
              </div>
              <div>
                <div className="mb-3 flex items-center justify-between gap-2 text-sm font-semibold text-gray-800 dark:text-white/90">
                  <span className="inline-flex items-center gap-2"><ClipboardList className="h-4 w-4" />Issuance lines</span>
                  {permissions('issuanceLine').create && <Button type="button" size="sm" onClick={() => openCreateEditor('issuanceLine')}>Create</Button>}
                </div>
                {issuanceLines.isError ? <EmptyState icon={<AlertTriangle className="h-6 w-6" />} title="Unable to load issuance lines" /> : issuanceLines.isLoading ? <EmptyState icon={<ClipboardList className="h-6 w-6" />} title="Loading issuance lines" /> : (
                  <IssuanceLinesTable
                    lines={issuanceLines.data ?? []}
                    unitsById={unitsById}
                    permissions={permissions('issuanceLine')}
                    busy={mutationBusy}
                    onEdit={openIssuanceLineEditor}
                    onArchive={(id) => archiveMutation.mutate({ kind: 'issuanceLine', id })}
                    onRestore={(id) => restoreMutation.mutate({ kind: 'issuanceLine', id })}
                    onAudit={(id, label) => setAudit({ kind: 'issuanceLine', id, label })}
                  />
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="returns" className="mt-4">
            <div className="space-y-6">
              <div className="grid gap-5 xl:grid-cols-2">
                <div>
                  <div className="mb-3 flex items-center justify-between gap-2 text-sm font-semibold text-gray-800 dark:text-white/90"><span className="inline-flex items-center gap-2"><ClipboardList className="h-4 w-4" />Collection orders</span>{permissions('order').create && <Button type="button" size="sm" onClick={() => openCreateEditor('order')}>Create</Button>}</div>
                  {collectionOrders.isError ? <EmptyState icon={<AlertTriangle className="h-6 w-6" />} title="Unable to load collection orders" /> : collectionOrders.isLoading ? <EmptyState icon={<ClipboardList className="h-6 w-6" />} title="Loading collection orders" /> : (
                    <EventTable events={collectionOrders.data ?? []} kind="order" permissions={permissions('order')} busy={mutationBusy} onEdit={openEventEditor} onArchive={(id) => archiveMutation.mutate({ kind: 'order', id })} onRestore={(id) => restoreMutation.mutate({ kind: 'order', id })} onAudit={(id, label) => setAudit({ kind: 'order', id, label })} />
                  )}
                </div>
                <div>
                  <div className="mb-3 flex items-center justify-between gap-2 text-sm font-semibold text-gray-800 dark:text-white/90"><span className="inline-flex items-center gap-2"><PackageCheck className="h-4 w-4" />Receipts</span>{permissions('receipt').create && <Button type="button" size="sm" onClick={() => openCreateEditor('receipt')}>Create</Button>}</div>
                  {receipts.isError ? <EmptyState icon={<AlertTriangle className="h-6 w-6" />} title="Unable to load receipts" /> : receipts.isLoading ? <EmptyState icon={<PackageCheck className="h-6 w-6" />} title="Loading receipts" /> : (
                    <EventTable events={receipts.data ?? []} kind="receipt" permissions={permissions('receipt')} busy={mutationBusy} onEdit={openEventEditor} onArchive={(id) => archiveMutation.mutate({ kind: 'receipt', id })} onRestore={(id) => restoreMutation.mutate({ kind: 'receipt', id })} onAudit={(id, label) => setAudit({ kind: 'receipt', id, label })} />
                  )}
                </div>
              </div>
              <div>
                <div className="mb-3 flex items-center justify-between gap-2 text-sm font-semibold text-gray-800 dark:text-white/90">
                  <span className="inline-flex items-center gap-2"><FileCheck2 className="h-4 w-4" />Receipt lines</span>
                  {permissions('receiptLine').create && <Button type="button" size="sm" onClick={() => openCreateEditor('receiptLine')}>Create</Button>}
                </div>
                {receiptLines.isError ? <EmptyState icon={<AlertTriangle className="h-6 w-6" />} title="Unable to load receipt lines" /> : receiptLines.isLoading ? <EmptyState icon={<FileCheck2 className="h-6 w-6" />} title="Loading receipt lines" /> : (
                  <ReceiptLinesTable
                    lines={receiptLines.data ?? []}
                    unitsById={unitsById}
                    permissions={permissions('receiptLine')}
                    busy={mutationBusy}
                    onEdit={openReceiptLineEditor}
                    onArchive={(id) => archiveMutation.mutate({ kind: 'receiptLine', id })}
                    onRestore={(id) => restoreMutation.mutate({ kind: 'receiptLine', id })}
                    onAudit={(id, label) => setAudit({ kind: 'receiptLine', id, label })}
                  />
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="imports" className="mt-4">
            {!canReadImports ? <EmptyState icon={<FileClock className="h-6 w-6" />} title="Import reports require admin access" /> : importReports.isError ? <EmptyState icon={<AlertTriangle className="h-6 w-6" />} title="Unable to load import reports" /> : importReports.isLoading ? <EmptyState icon={<FileClock className="h-6 w-6" />} title="Loading import reports" /> : (
              <ImportReportsTable
                reports={importReports.data ?? []}
                permissions={permissions('import')}
                busy={mutationBusy}
                onArchive={(id) => archiveMutation.mutate({ kind: 'import', id })}
                onRestore={(id) => restoreMutation.mutate({ kind: 'import', id })}
                onAudit={(id, label) => setAudit({ kind: 'import', id, label })}
              />
            )}
          </TabsContent>
        </Tabs>
      </AdminPanel>

      <CrudSheet
        open={Boolean(editor)}
        title={editor ? `${editor.mode === 'create' ? 'Create' : 'Edit'} ${editor.label}` : 'Edit record'}
        description="Update operational ERP fields. Blank optional values are saved as null."
        submitLabel={editor?.mode === 'create' ? 'Create record' : 'Save changes'}
        isSubmitting={updateMutation.isPending || createMutation.isPending}
        onOpenChange={(open) => !open && setEditor(null)}
        onSubmit={submitEditor}
      >
        {renderEditorFields()}
      </CrudSheet>

      <AuditDrawer
        open={Boolean(audit)}
        title={audit ? `Audit: ${audit.label}` : 'Audit'}
        events={auditQuery.data}
        isLoading={auditQuery.isLoading}
        isError={auditQuery.isError}
        errorMessage={auditQuery.error ? errorMessage(auditQuery.error, 'Unable to load audit events.') : undefined}
        onOpenChange={(open) => !open && setAudit(null)}
      />
    </div>
  );
}
