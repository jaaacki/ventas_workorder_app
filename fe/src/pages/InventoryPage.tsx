import { type FormEvent, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { toast } from 'sonner';
import {
  archiveInventoryBalance,
  archiveInventoryGenealogy,
  archiveInventoryImportReport,
  archiveInventoryLocation,
  archiveInventoryLot,
  archiveInventoryReference,
  archiveInventorySku,
  archiveInventoryTransaction,
  archiveWorkOrderInventoryConsumption,
  createInventoryBalance,
  createInventoryGenealogy,
  createInventoryLocation,
  createInventoryLot,
  createInventoryReference,
  createInventorySku,
  createInventoryTransaction,
  createWorkOrderInventoryConsumption,
  fetchInventoryBalanceAudit,
  fetchInventoryBalances,
  fetchInventoryGenealogy,
  fetchInventoryGenealogyAudit,
  fetchInventoryGenealogyLinks,
  fetchInventoryImportReportAudit,
  fetchInventoryImportReports,
  fetchInventoryLocationAudit,
  fetchInventoryLocations,
  fetchInventoryLotAudit,
  fetchInventoryLots,
  fetchInventoryOverview,
  fetchInventoryReferenceAudit,
  fetchInventoryReferences,
  fetchInventorySkuAudit,
  fetchInventorySkus,
  fetchInventoryTransactionAudit,
  fetchInventoryTransactions,
  fetchWorkOrderInventoryConsumptionAudit,
  fetchWorkOrderInventoryConsumptions,
  restoreInventoryBalance,
  restoreInventoryGenealogy,
  restoreInventoryImportReport,
  restoreInventoryLocation,
  restoreInventoryLot,
  restoreInventoryReference,
  restoreInventorySku,
  restoreInventoryTransaction,
  restoreWorkOrderInventoryConsumption,
  updateInventoryBalance,
  updateInventoryGenealogy,
  updateInventoryLocation,
  updateInventoryLot,
  updateInventoryReference,
  updateInventorySku,
  updateInventoryTransaction,
  updateWorkOrderInventoryConsumption,
  type AuditEvent,
  type InventoryBalance,
  type InventoryBalancePayload,
  type InventoryGenealogyEdge,
  type InventoryGenealogyPayload,
  type InventoryImportReport,
  type InventoryLocation,
  type InventoryLocationPayload,
  type InventoryLot,
  type InventoryLotPayload,
  type InventoryReference,
  type InventoryReferencePayload,
  type InventorySku,
  type InventorySkuPayload,
  type InventoryTransaction,
  type InventoryTransactionPayload,
  type WorkOrderInventoryConsumption,
  type WorkOrderInventoryConsumptionPayload,
} from '@/lib/inventory-api';
import { AdminPanel, EmptyState, MetricCard, PageHeader, StatusPill } from '@/components/tailadmin';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AuditDrawer,
  CrudSheet,
  DeletedBadge,
  IncludeDeletedButton,
  RowCrudActions,
  SelectField,
  TextField,
} from '@/components/ErpCrudControls';
import { useAuthStore } from '@/store/authStore';
import { AlertTriangle, Boxes, Database, ExternalLink, FileClock, GitBranch, MapPin, PackageSearch, Search, Tags } from 'lucide-react';

const ALL_FILTER = '__all__';

type EditableKind = 'reference' | 'lot' | 'transaction' | 'sku' | 'location' | 'balance' | 'genealogy' | 'consumption';
type ActionKind = EditableKind | 'import';
type EditorState = { mode: 'create' | 'edit'; kind: EditableKind; id?: string; label: string; values: Record<string, string> } | null;
type AuditState = { kind: ActionKind; id: string; label: string } | null;

const resourceByKind: Record<ActionKind, string> = {
  reference: 'inventory.reference',
  lot: 'inventory.lot',
  transaction: 'inventory.transaction',
  sku: 'inventory.sku',
  location: 'inventory.location',
  balance: 'inventory.balance',
  genealogy: 'inventory.genealogy',
  consumption: 'inventory.workOrderConsumption',
  import: 'inventory.importReport',
};

const editorFieldLabels: Record<EditableKind, Record<string, string>> = {
  reference: {
    refType: 'Reference type',
    name: 'Name',
    shortCode: 'Short code',
    description: 'Description',
    sourceSystem: 'Source system',
  },
  lot: {
    inventorySkuId: 'Inventory SKU ID',
    lotNumber: 'Lot number',
    inventoryType: 'Inventory type',
    status: 'Status',
    quantityInitial: 'Initial quantity',
    quantityCurrent: 'Current quantity',
    uom: 'Unit of measure',
    currentLocationId: 'Current location ID',
    collectionUnitId: 'Collection unit ID',
    hetId: 'HET ID',
    workOrderId: 'Work order ID',
    sourceSystem: 'Source system',
    legacyItemSerialId: 'Legacy item serial ID',
    legacyCheckInOutId: 'Legacy check-in/out ID',
    legacyHetId: 'Legacy HET ID',
  },
  transaction: {
    inventorySkuId: 'Inventory SKU ID',
    inventoryLotId: 'Inventory lot ID',
    transactionType: 'Transaction type',
    direction: 'Direction',
    reason: 'Correction or movement reason',
    quantity: 'Quantity',
    uom: 'Unit of measure',
    fromLocationId: 'From location ID',
    toLocationId: 'To location ID',
    workOrderId: 'Work order ID',
    occurredAt: 'Occurred at',
    actor: 'Actor',
    signaturePath: 'Signature path',
    remarks: 'Correction remarks',
    legacyRefNumber: 'Legacy reference in',
    legacyRefNumberOut: 'Legacy reference out',
    sourceSystem: 'Source system',
  },
  sku: {
    sku: 'SKU code',
    description: 'Description',
    category: 'Category',
    brand: 'Brand',
    size: 'Size',
    colour: 'Colour',
    uom: 'Unit of measure',
    packQuantity: 'Pack quantity',
    threshold: 'Reorder threshold',
    serialisedMode: 'Serialised mode',
    qrImagePath: 'QR image path',
    mediaUrl: 'Media URL',
    qrPrintPath: 'QR print path',
    sourceSystem: 'Source system',
  },
  location: {
    locationType: 'Location type',
    name: 'Name',
    parentLocationId: 'Parent location ID',
    description: 'Description',
    imagePath: 'Image path',
    sourceSystem: 'Source system',
  },
  balance: {
    inventorySkuId: 'Inventory SKU ID',
    inventoryLotId: 'Inventory lot ID',
    inventoryLocationId: 'Inventory location ID',
    quantity: 'Quantity on hand',
    sourceSystem: 'Source system',
  },
  genealogy: {
    parentInventoryLotId: 'Parent lot ID',
    childInventoryLotId: 'Child lot ID',
    relationshipType: 'Relationship type',
    workOrderId: 'Work order ID',
    phaseId: 'Phase ID',
    sourceSystem: 'Source system',
  },
  consumption: {
    workOrderId: 'Work order ID',
    inventoryLotId: 'Inventory lot ID',
    inventorySkuId: 'Inventory SKU ID',
    bomLineId: 'BOM line ID',
    quantity: 'Consumed quantity',
    uom: 'Unit of measure',
    sourceSystem: 'Source system',
  },
};

const requiredFields: Record<EditableKind, string[]> = {
  reference: ['refType', 'name'],
  lot: ['inventoryType', 'status'],
  transaction: ['transactionType'],
  sku: ['sku'],
  location: ['locationType', 'name'],
  balance: ['inventorySkuId'],
  genealogy: ['parentInventoryLotId', 'childInventoryLotId', 'relationshipType'],
  consumption: ['workOrderId'],
};

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleString() : '-';
}

function formatQty(value?: string | number | null, uom?: string | null) {
  if (value === null || value === undefined || value === '') return '-';
  return `${value}${uom ? ` ${uom}` : ''}`;
}

function statusTone(value?: string | null): 'brand' | 'success' | 'warning' | 'error' | 'neutral' {
  if (!value) return 'neutral';
  if (/available|complete|finished|released|receive|transfer_in/i.test(value)) return 'success';
  if (/hold|quarantine|pending|adjust/i.test(value)) return 'warning';
  if (/scrap|consume|used|void|lost|reject|archiv|delete/i.test(value)) return 'error';
  if (/het|finished_good|transfer/i.test(value)) return 'brand';
  return 'neutral';
}

function skuLabel(sku?: InventorySku | null) {
  if (!sku) return '-';
  return sku.description || sku.sku || sku.id;
}

function lotLabel(lot?: InventoryLot | null) {
  if (!lot) return '-';
  return lot.lotNumber || lot.legacyHetId || lot.legacyItemSerialId || lot.id;
}

function locationLabel(location?: InventoryLocation | null) {
  if (!location) return '-';
  return location.name || location.id;
}

function errorMessage(error: Error, fallback: string) {
  const axiosError = error as AxiosError<{ error?: string }>;
  if (axiosError.response?.status === 403) return axiosError.response.data?.error || 'You do not have permission for this action';
  return axiosError.response?.data?.error || fallback;
}

function cleanPayload(values: Record<string, string>) {
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value.trim() === '' ? null : value]));
}

function option(value: string | null | undefined, label: string | null | undefined) {
  if (!value) return null;
  return { value, label: label || value };
}

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <div className="relative w-full sm:max-w-sm">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-10 w-full rounded-lg border border-gray-200 bg-transparent py-2 pl-10 pr-3 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-none focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-white/[0.03] dark:text-white/90"
      />
    </div>
  );
}

function LotsTable({ lots, permissions, busy, onEdit, onArchive, onRestore, onAudit }: {
  lots: InventoryLot[];
  permissions: Record<string, boolean>;
  busy?: boolean;
  onEdit: (record: InventoryLot) => void;
  onArchive: (id: string) => void;
  onRestore: (id: string) => void;
  onAudit: (id: string, label: string) => void;
}) {
  if (!lots.length) return <EmptyState icon={<Boxes className="h-6 w-6" />} title="No inventory lots" />;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Lot</TableHead>
          <TableHead>SKU</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Quantity</TableHead>
          <TableHead>Location</TableHead>
          <TableHead>Work order</TableHead>
          <TableHead>Updated</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {lots.map((lot) => {
          const label = lotLabel(lot);
          return (
            <TableRow key={lot.id}>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Link to={`/dashboard/inventory/lots/${encodeURIComponent(lot.id)}`} className="inline-flex items-center gap-1 font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300">
                    {label}<ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                  <DeletedBadge record={lot} />
                </div>
                <div className="text-xs text-gray-500">{lot.id}</div>
              </TableCell>
              <TableCell><div>{skuLabel(lot.inventorySku)}</div><div className="text-xs text-gray-500">{lot.inventorySku?.category || lot.inventorySkuId || '-'}</div></TableCell>
              <TableCell><StatusPill tone={statusTone(lot.inventoryType)}>{lot.inventoryType.replace(/_/g, ' ')}</StatusPill></TableCell>
              <TableCell><StatusPill tone={statusTone(lot.status)}>{lot.status.replace(/_/g, ' ')}</StatusPill></TableCell>
              <TableCell>{formatQty(lot.quantityCurrent, lot.uom)}</TableCell>
              <TableCell>{locationLabel(lot.currentLocation)}</TableCell>
              <TableCell>{lot.workOrderId || lot.hetId || '-'}</TableCell>
              <TableCell>{formatDate(lot.updatedAt)}</TableCell>
              <TableCell>
                <RowCrudActions deleted={lot.deleted} canEdit={permissions.update} canArchive={permissions.delete} canRestore={permissions.restore} canAudit={permissions.readAudit} busy={busy} onEdit={() => onEdit(lot)} onArchive={() => onArchive(lot.id)} onRestore={() => onRestore(lot.id)} onAudit={() => onAudit(lot.id, label)} />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function TransactionsTable({ transactions, permissions, busy, onEdit, onArchive, onRestore, onAudit }: {
  transactions: InventoryTransaction[];
  permissions: Record<string, boolean>;
  busy?: boolean;
  onEdit: (record: InventoryTransaction) => void;
  onArchive: (id: string) => void;
  onRestore: (id: string) => void;
  onAudit: (id: string, label: string) => void;
}) {
  if (!transactions.length) return <EmptyState icon={<Database className="h-6 w-6" />} title="No inventory transactions" />;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Transaction</TableHead>
          <TableHead>SKU / lot</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Quantity</TableHead>
          <TableHead>Movement</TableHead>
          <TableHead>Reference</TableHead>
          <TableHead>Occurred</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {transactions.map((transaction) => {
          const label = transaction.reason || transaction.id;
          return (
            <TableRow key={transaction.id}>
              <TableCell>
                <div className="flex items-center gap-2 font-medium text-gray-800 dark:text-white/90">{label}<DeletedBadge record={transaction} /></div>
                <div className="text-xs text-gray-500">{transaction.actor || transaction.sourceSystem || '-'}</div>
              </TableCell>
              <TableCell><div>{skuLabel(transaction.inventorySku)}</div><div className="text-xs text-gray-500">{lotLabel(transaction.inventoryLot)}</div></TableCell>
              <TableCell><StatusPill tone={statusTone(transaction.transactionType)}>{transaction.transactionType.replace(/_/g, ' ')}</StatusPill></TableCell>
              <TableCell>{formatQty(transaction.quantity, transaction.uom)}</TableCell>
              <TableCell><div>{locationLabel(transaction.fromLocation)}</div><div className="text-xs text-gray-500">to {locationLabel(transaction.toLocation)}</div></TableCell>
              <TableCell>{transaction.workOrderId || transaction.legacyRefNumber || transaction.legacyRefNumberOut || '-'}</TableCell>
              <TableCell>{formatDate(transaction.occurredAt || transaction.createdAt)}</TableCell>
              <TableCell>
                <RowCrudActions
                  deleted={transaction.deleted}
                  canEdit={permissions.update}
                  canArchive={permissions.delete}
                  canRestore={permissions.restore}
                  canAudit={permissions.readAudit}
                  busy={busy}
                  editLabel="Correct"
                  archiveLabel="Void"
                  archiveTitle="Void transaction"
                  archiveDescription="Void this transaction? The original movement remains auditable and is hidden from normal operational lists."
                  onEdit={() => onEdit(transaction)}
                  onArchive={() => onArchive(transaction.id)}
                  onRestore={() => onRestore(transaction.id)}
                  onAudit={() => onAudit(transaction.id, label)}
                />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function SkusTable({ skus, permissions, busy, onEdit, onArchive, onRestore, onAudit }: {
  skus: InventorySku[];
  permissions: Record<string, boolean>;
  busy?: boolean;
  onEdit: (record: InventorySku) => void;
  onArchive: (id: string) => void;
  onRestore: (id: string) => void;
  onAudit: (id: string, label: string) => void;
}) {
  if (!skus.length) return <EmptyState icon={<Tags className="h-6 w-6" />} title="No inventory SKUs" />;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>SKU</TableHead>
          <TableHead>Category</TableHead>
          <TableHead>Brand</TableHead>
          <TableHead>Size</TableHead>
          <TableHead>Serial mode</TableHead>
          <TableHead>Updated</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {skus.map((sku) => {
          const label = skuLabel(sku);
          return (
            <TableRow key={sku.id}>
              <TableCell><div className="flex items-center gap-2 font-medium text-gray-800 dark:text-white/90">{label}<DeletedBadge record={sku} /></div><div className="text-xs text-gray-500">{sku.sku || sku.id}</div></TableCell>
              <TableCell>{sku.category || '-'}</TableCell>
              <TableCell>{sku.brand || '-'}</TableCell>
              <TableCell>{[sku.size, sku.colour, sku.uom].filter(Boolean).join(' / ') || '-'}</TableCell>
              <TableCell>{sku.serialisedMode || '-'}</TableCell>
              <TableCell>{formatDate(sku.updatedAt)}</TableCell>
              <TableCell>
                <RowCrudActions deleted={sku.deleted} canEdit={permissions.update} canArchive={permissions.delete} canRestore={permissions.restore} canAudit={permissions.readAudit} busy={busy} onEdit={() => onEdit(sku)} onArchive={() => onArchive(sku.id)} onRestore={() => onRestore(sku.id)} onAudit={() => onAudit(sku.id, label)} />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function LocationsTable({ locations, permissions, busy, onEdit, onArchive, onRestore, onAudit }: {
  locations: InventoryLocation[];
  permissions: Record<string, boolean>;
  busy?: boolean;
  onEdit: (record: InventoryLocation) => void;
  onArchive: (id: string) => void;
  onRestore: (id: string) => void;
  onAudit: (id: string, label: string) => void;
}) {
  if (!locations.length) return <EmptyState icon={<MapPin className="h-6 w-6" />} title="No inventory locations" />;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Location</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Parent</TableHead>
          <TableHead>Source</TableHead>
          <TableHead>Updated</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {locations.map((location) => (
          <TableRow key={location.id}>
            <TableCell><div className="flex items-center gap-2 font-medium text-gray-800 dark:text-white/90">{location.name}<DeletedBadge record={location} /></div><div className="text-xs text-gray-500">{location.description || location.id}</div></TableCell>
            <TableCell><StatusPill tone={statusTone(location.locationType)}>{location.locationType.replace(/_/g, ' ')}</StatusPill></TableCell>
            <TableCell>{location.parentLocationId || '-'}</TableCell>
            <TableCell>{location.sourceSystem || '-'}</TableCell>
            <TableCell>{formatDate(location.updatedAt)}</TableCell>
            <TableCell>
              <RowCrudActions deleted={location.deleted} canEdit={permissions.update} canArchive={permissions.delete} canRestore={permissions.restore} canAudit={permissions.readAudit} busy={busy} onEdit={() => onEdit(location)} onArchive={() => onArchive(location.id)} onRestore={() => onRestore(location.id)} onAudit={() => onAudit(location.id, location.name)} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function ReferencesTable({ references, permissions, busy, onEdit, onArchive, onRestore, onAudit }: {
  references: InventoryReference[];
  permissions: Record<string, boolean>;
  busy?: boolean;
  onEdit: (record: InventoryReference) => void;
  onArchive: (id: string) => void;
  onRestore: (id: string) => void;
  onAudit: (id: string, label: string) => void;
}) {
  if (!references.length) return <EmptyState icon={<Tags className="h-6 w-6" />} title="No inventory references" />;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Reference</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Short code</TableHead>
          <TableHead>Source</TableHead>
          <TableHead>Updated</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {references.map((reference) => (
          <TableRow key={reference.id}>
            <TableCell><div className="flex items-center gap-2 font-medium text-gray-800 dark:text-white/90">{reference.name}<DeletedBadge record={reference} /></div><div className="text-xs text-gray-500">{reference.description || reference.id}</div></TableCell>
            <TableCell><StatusPill tone={statusTone(reference.refType)}>{reference.refType.replace(/_/g, ' ')}</StatusPill></TableCell>
            <TableCell>{reference.shortCode || '-'}</TableCell>
            <TableCell>{reference.sourceSystem || '-'}</TableCell>
            <TableCell>{formatDate(reference.updatedAt)}</TableCell>
            <TableCell>
              <RowCrudActions deleted={reference.deleted} canEdit={permissions.update} canArchive={permissions.delete} canRestore={permissions.restore} canAudit={permissions.readAudit} busy={busy} onEdit={() => onEdit(reference)} onArchive={() => onArchive(reference.id)} onRestore={() => onRestore(reference.id)} onAudit={() => onAudit(reference.id, reference.name)} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function BalancesTable({ balances, permissions, busy, onEdit, onArchive, onRestore, onAudit }: {
  balances: InventoryBalance[];
  permissions: Record<string, boolean>;
  busy?: boolean;
  onEdit: (record: InventoryBalance) => void;
  onArchive: (id: string) => void;
  onRestore: (id: string) => void;
  onAudit: (id: string, label: string) => void;
}) {
  if (!balances.length) return <EmptyState icon={<Database className="h-6 w-6" />} title="No inventory balances" />;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>SKU / lot</TableHead>
          <TableHead>Location</TableHead>
          <TableHead>Quantity</TableHead>
          <TableHead>Source</TableHead>
          <TableHead>Updated</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {balances.map((balance) => {
          const label = `${skuLabel(balance.inventorySku)} ${formatQty(balance.quantity)}`;
          return (
            <TableRow key={balance.id}>
              <TableCell><div className="flex items-center gap-2 font-medium text-gray-800 dark:text-white/90">{skuLabel(balance.inventorySku)}<DeletedBadge record={balance} /></div><div className="text-xs text-gray-500">{lotLabel(balance.inventoryLot) || balance.inventoryLotId || '-'}</div></TableCell>
              <TableCell>{locationLabel(balance.inventoryLocation) || balance.inventoryLocationId || '-'}</TableCell>
              <TableCell>{formatQty(balance.quantity)}</TableCell>
              <TableCell>{balance.sourceSystem || '-'}</TableCell>
              <TableCell>{formatDate(balance.updatedAt)}</TableCell>
              <TableCell>
                <RowCrudActions deleted={balance.deleted} canEdit={permissions.update} canArchive={permissions.delete} canRestore={permissions.restore} canAudit={permissions.readAudit} busy={busy} onEdit={() => onEdit(balance)} onArchive={() => onArchive(balance.id)} onRestore={() => onRestore(balance.id)} onAudit={() => onAudit(balance.id, label)} />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function ConsumptionsTable({ consumptions, permissions, busy, onEdit, onArchive, onRestore, onAudit }: {
  consumptions: WorkOrderInventoryConsumption[];
  permissions: Record<string, boolean>;
  busy?: boolean;
  onEdit: (record: WorkOrderInventoryConsumption) => void;
  onArchive: (id: string) => void;
  onRestore: (id: string) => void;
  onAudit: (id: string, label: string) => void;
}) {
  if (!consumptions.length) return <EmptyState icon={<Database className="h-6 w-6" />} title="No work-order consumptions" />;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Work order</TableHead>
          <TableHead>Lot / SKU</TableHead>
          <TableHead>BOM line</TableHead>
          <TableHead>Quantity</TableHead>
          <TableHead>Source</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {consumptions.map((consumption) => {
          const label = `${consumption.workOrderId} ${formatQty(consumption.quantity, consumption.uom)}`;
          return (
            <TableRow key={consumption.id}>
              <TableCell><div className="flex items-center gap-2 font-medium text-gray-800 dark:text-white/90">{consumption.workOrderId}<DeletedBadge record={consumption} /></div></TableCell>
              <TableCell><div>{lotLabel(consumption.inventoryLot) || consumption.inventoryLotId || '-'}</div><div className="text-xs text-gray-500">{consumption.inventorySkuId || '-'}</div></TableCell>
              <TableCell>{consumption.bomLineId || '-'}</TableCell>
              <TableCell>{formatQty(consumption.quantity, consumption.uom)}</TableCell>
              <TableCell>{consumption.sourceSystem || '-'}</TableCell>
              <TableCell>
                <RowCrudActions deleted={consumption.deleted} canEdit={permissions.update} canArchive={permissions.delete} canRestore={permissions.restore} canAudit={permissions.readAudit} busy={busy} onEdit={() => onEdit(consumption)} onArchive={() => onArchive(consumption.id)} onRestore={() => onRestore(consumption.id)} onAudit={() => onAudit(consumption.id, label)} />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function GenealogyEdgeTable({ title, edges, direction, permissions, busy, onEdit, onArchive, onRestore, onAudit }: {
  title: string;
  edges: InventoryGenealogyEdge[];
  direction: 'parent' | 'child';
  permissions: Record<string, boolean>;
  busy?: boolean;
  onEdit: (record: InventoryGenealogyEdge) => void;
  onArchive: (id: string) => void;
  onRestore: (id: string) => void;
  onAudit: (id: string, label: string) => void;
}) {
  const lotOf = (edge: InventoryGenealogyEdge) => (direction === 'parent' ? edge.parentInventoryLot : edge.childInventoryLot);
  return (
    <div>
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-white/90"><GitBranch className="h-4 w-4" />{title}</div>
      {!edges.length ? <EmptyState icon={<GitBranch className="h-6 w-6" />} title={`No ${title.toLowerCase()}`} /> : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Lot</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>Relationship</TableHead>
              <TableHead>Work order</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {edges.map((edge) => {
              const lot = lotOf(edge);
              const label = `${edge.relationshipType || 'genealogy'} ${lotLabel(lot)}`;
              return (
                <TableRow key={edge.id}>
                  <TableCell><div className="flex items-center gap-2 font-medium text-gray-800 dark:text-white/90">{lotLabel(lot)}<DeletedBadge record={edge} /></div></TableCell>
                  <TableCell>{skuLabel(lot?.inventorySku)}</TableCell>
                  <TableCell>{edge.relationshipType || '-'}</TableCell>
                  <TableCell>{edge.workOrderId || lot?.workOrderId || '-'}</TableCell>
                  <TableCell>
                    <RowCrudActions deleted={edge.deleted} canEdit={permissions.update} canArchive={permissions.delete} canRestore={permissions.restore} canAudit={permissions.readAudit} busy={busy} onEdit={() => onEdit(edge)} onArchive={() => onArchive(edge.id)} onRestore={() => onRestore(edge.id)} onAudit={() => onAudit(edge.id, label)} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function GenealogyLinksTable({ edges, permissions, busy, onEdit, onArchive, onRestore, onAudit }: {
  edges: InventoryGenealogyEdge[];
  permissions: Record<string, boolean>;
  busy?: boolean;
  onEdit: (record: InventoryGenealogyEdge) => void;
  onArchive: (id: string) => void;
  onRestore: (id: string) => void;
  onAudit: (id: string, label: string) => void;
}) {
  if (!edges.length) return <EmptyState icon={<GitBranch className="h-6 w-6" />} title="No genealogy links" />;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Parent lot</TableHead>
          <TableHead>Child lot</TableHead>
          <TableHead>Relationship</TableHead>
          <TableHead>Work order</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {edges.map((edge) => {
          const label = `${lotLabel(edge.parentInventoryLot)} -> ${lotLabel(edge.childInventoryLot)}`;
          return (
            <TableRow key={edge.id}>
              <TableCell><div className="flex items-center gap-2 font-medium text-gray-800 dark:text-white/90">{lotLabel(edge.parentInventoryLot)}<DeletedBadge record={edge} /></div></TableCell>
              <TableCell>{lotLabel(edge.childInventoryLot)}</TableCell>
              <TableCell>{edge.relationshipType || '-'}</TableCell>
              <TableCell>{edge.workOrderId || '-'}</TableCell>
              <TableCell>
                <RowCrudActions deleted={edge.deleted} canEdit={permissions.update} canArchive={permissions.delete} canRestore={permissions.restore} canAudit={permissions.readAudit} busy={busy} onEdit={() => onEdit(edge)} onArchive={() => onArchive(edge.id)} onRestore={() => onRestore(edge.id)} onAudit={() => onAudit(edge.id, label)} />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function ImportReportsTable({ reports, permissions, busy, onArchive, onRestore, onAudit }: {
  reports: InventoryImportReport[];
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
            <TableCell><div className="flex items-center gap-2 font-medium text-gray-800 dark:text-white/90">{report.source}<DeletedBadge record={report} /></div></TableCell>
            <TableCell><StatusPill tone={report.dryRun ? 'warning' : 'success'}>{report.dryRun ? 'Dry run' : 'Applied'}</StatusPill></TableCell>
            <TableCell>{formatDate(report.startedAt)}</TableCell>
            <TableCell>{formatDate(report.finishedAt)}</TableCell>
            <TableCell><code className="block max-w-md truncate rounded bg-gray-100 px-2 py-1 text-xs text-gray-700 dark:bg-gray-800 dark:text-gray-300">{JSON.stringify(report.report)}</code></TableCell>
            <TableCell>
              <RowCrudActions deleted={report.deleted} canEdit={false} canArchive={permissions.delete} canRestore={permissions.restore} canAudit={permissions.readAudit} busy={busy} onEdit={() => undefined} onArchive={() => onArchive(report.id)} onRestore={() => onRestore(report.id)} onAudit={() => onAudit(report.id, report.source)} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default function InventoryPage() {
  const queryClient = useQueryClient();
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const [lotSearch, setLotSearch] = useState('');
  const [transactionSearch, setTransactionSearch] = useState('');
  const [skuSearch, setSkuSearch] = useState('');
  const [referenceSearch, setReferenceSearch] = useState('');
  const [consumptionSearch, setConsumptionSearch] = useState('');
  const [inventoryType, setInventoryType] = useState(ALL_FILTER);
  const [status, setStatus] = useState(ALL_FILTER);
  const [genealogyLotId, setGenealogyLotId] = useState('');
  const [selectedGenealogyLotId, setSelectedGenealogyLotId] = useState('');
  const [includeDeletedByKind, setIncludeDeletedByKind] = useState<Partial<Record<ActionKind, boolean>>>({});
  const [editor, setEditor] = useState<EditorState>(null);
  const [audit, setAudit] = useState<AuditState>(null);
  const canReadImports = hasPermission('inventory.importReport.read');
  const can = (kind: ActionKind, action: string) => hasPermission(`${resourceByKind[kind]}.${action}`);
  const permissions = (kind: ActionKind) => ({
    create: can(kind, 'create'),
    update: can(kind, 'update'),
    delete: can(kind, 'delete'),
    restore: can(kind, 'restore'),
    readAudit: can(kind, 'readAudit'),
  });
  const canSeeDeletedFor = (kind: ActionKind) => can(kind, 'readDeleted') || can(kind, 'readAudit');
  const includeDeletedFor = (kind: ActionKind) => Boolean(includeDeletedByKind[kind]) && canSeeDeletedFor(kind);
  const toggleIncludeDeletedFor = (kind: ActionKind) => setIncludeDeletedByKind((current) => ({ ...current, [kind]: !current[kind] }));
  const includeDeletedToggle = (kind: ActionKind, label: string) => canSeeDeletedFor(kind) ? (
    <IncludeDeletedButton includeDeleted={Boolean(includeDeletedByKind[kind])} label={label} onToggle={() => toggleIncludeDeletedFor(kind)} />
  ) : null;

  const overview = useQuery({ queryKey: ['inventory', 'overview'], queryFn: fetchInventoryOverview });
  const lots = useQuery({
    queryKey: ['inventory', 'lots', lotSearch, inventoryType, status, includeDeletedFor('lot')],
    queryFn: () => fetchInventoryLots({ q: lotSearch, includeDeleted: includeDeletedFor('lot'), inventoryType: inventoryType === ALL_FILTER ? undefined : inventoryType, status: status === ALL_FILTER ? undefined : status }),
  });
  const transactions = useQuery({ queryKey: ['inventory', 'transactions', transactionSearch, includeDeletedFor('transaction')], queryFn: () => fetchInventoryTransactions({ q: transactionSearch, includeDeleted: includeDeletedFor('transaction') }) });
  const skus = useQuery({ queryKey: ['inventory', 'skus', skuSearch, includeDeletedFor('sku')], queryFn: () => fetchInventorySkus({ q: skuSearch, includeDeleted: includeDeletedFor('sku') }) });
  const references = useQuery({ queryKey: ['inventory', 'references', referenceSearch, includeDeletedFor('reference')], queryFn: () => fetchInventoryReferences({ q: referenceSearch, includeDeleted: includeDeletedFor('reference') }) });
  const locations = useQuery({ queryKey: ['inventory', 'locations', includeDeletedFor('location')], queryFn: () => fetchInventoryLocations({ includeDeleted: includeDeletedFor('location') }) });
  const balances = useQuery({ queryKey: ['inventory', 'balances', includeDeletedFor('balance')], queryFn: () => fetchInventoryBalances({ includeDeleted: includeDeletedFor('balance') }) });
  const consumptions = useQuery({ queryKey: ['inventory', 'consumptions', consumptionSearch, includeDeletedFor('consumption')], queryFn: () => fetchWorkOrderInventoryConsumptions({ q: consumptionSearch, includeDeleted: includeDeletedFor('consumption') }) });
  const genealogyLinks = useQuery({ queryKey: ['inventory', 'genealogy-links', includeDeletedFor('genealogy')], queryFn: () => fetchInventoryGenealogyLinks({ includeDeleted: includeDeletedFor('genealogy') }) });
  const genealogy = useQuery({ queryKey: ['inventory', 'genealogy', selectedGenealogyLotId], queryFn: () => fetchInventoryGenealogy(selectedGenealogyLotId), enabled: Boolean(selectedGenealogyLotId), retry: false });
  const importReports = useQuery({ queryKey: ['inventory', 'import-reports', includeDeletedFor('import')], queryFn: () => fetchInventoryImportReports({ includeDeleted: includeDeletedFor('import') }), enabled: canReadImports, retry: false });
  const auditQuery = useQuery<AuditEvent<unknown>[]>({
    queryKey: ['inventory', 'audit', audit?.kind, audit?.id],
    enabled: Boolean(audit),
    queryFn: () => {
      if (!audit) return Promise.resolve([]);
      if (audit.kind === 'reference') return fetchInventoryReferenceAudit(audit.id);
      if (audit.kind === 'lot') return fetchInventoryLotAudit(audit.id);
      if (audit.kind === 'transaction') return fetchInventoryTransactionAudit(audit.id);
      if (audit.kind === 'sku') return fetchInventorySkuAudit(audit.id);
      if (audit.kind === 'location') return fetchInventoryLocationAudit(audit.id);
      if (audit.kind === 'balance') return fetchInventoryBalanceAudit(audit.id);
      if (audit.kind === 'genealogy') return fetchInventoryGenealogyAudit(audit.id);
      if (audit.kind === 'consumption') return fetchWorkOrderInventoryConsumptionAudit(audit.id);
      return fetchInventoryImportReportAudit(audit.id);
    },
  });

  const invalidateInventory = () => queryClient.invalidateQueries({ queryKey: ['inventory'] });
  const archiveMutation = useMutation<unknown, Error, { kind: ActionKind; id: string }>({
    mutationFn: ({ kind, id }: { kind: ActionKind; id: string }) => {
      if (kind === 'lot') return archiveInventoryLot(id);
      if (kind === 'transaction') return archiveInventoryTransaction(id);
      if (kind === 'sku') return archiveInventorySku(id);
      if (kind === 'location') return archiveInventoryLocation(id);
      if (kind === 'reference') return archiveInventoryReference(id);
      if (kind === 'balance') return archiveInventoryBalance(id);
      if (kind === 'genealogy') return archiveInventoryGenealogy(id);
      if (kind === 'consumption') return archiveWorkOrderInventoryConsumption(id);
      return archiveInventoryImportReport(id);
    },
    onSuccess: () => { invalidateInventory(); toast.success('Record archived'); },
    onError: (error) => toast.error(errorMessage(error, 'Failed to archive record')),
  });
  const restoreMutation = useMutation<unknown, Error, { kind: ActionKind; id: string }>({
    mutationFn: ({ kind, id }: { kind: ActionKind; id: string }) => {
      if (kind === 'lot') return restoreInventoryLot(id);
      if (kind === 'transaction') return restoreInventoryTransaction(id);
      if (kind === 'sku') return restoreInventorySku(id);
      if (kind === 'location') return restoreInventoryLocation(id);
      if (kind === 'reference') return restoreInventoryReference(id);
      if (kind === 'balance') return restoreInventoryBalance(id);
      if (kind === 'genealogy') return restoreInventoryGenealogy(id);
      if (kind === 'consumption') return restoreWorkOrderInventoryConsumption(id);
      return restoreInventoryImportReport(id);
    },
    onSuccess: () => { invalidateInventory(); toast.success('Record restored'); },
    onError: (error) => toast.error(errorMessage(error, 'Failed to restore record')),
  });
  const updateMutation = useMutation<unknown, Error, { kind: EditableKind; id: string; values: Record<string, string> }>({
    mutationFn: ({ kind, id, values }: { kind: EditableKind; id: string; values: Record<string, string> }) => {
      const payload = cleanPayload(values);
      if (kind === 'lot') return updateInventoryLot(id, payload as InventoryLotPayload);
      if (kind === 'transaction') return updateInventoryTransaction(id, payload as InventoryTransactionPayload);
      if (kind === 'sku') return updateInventorySku(id, payload as InventorySkuPayload);
      if (kind === 'location') return updateInventoryLocation(id, payload as InventoryLocationPayload);
      if (kind === 'reference') return updateInventoryReference(id, payload as InventoryReferencePayload);
      if (kind === 'balance') return updateInventoryBalance(id, payload as InventoryBalancePayload);
      if (kind === 'consumption') return updateWorkOrderInventoryConsumption(id, payload as WorkOrderInventoryConsumptionPayload);
      return updateInventoryGenealogy(id, payload as InventoryGenealogyPayload);
    },
    onSuccess: () => { setEditor(null); invalidateInventory(); toast.success('Record updated'); },
    onError: (error) => toast.error(errorMessage(error, 'Failed to update record')),
  });
  const createMutation = useMutation<unknown, Error, { kind: EditableKind; values: Record<string, string> }>({
    mutationFn: ({ kind, values }) => {
      const payload = cleanPayload(values);
      if (kind === 'lot') return createInventoryLot(payload as InventoryLotPayload);
      if (kind === 'transaction') return createInventoryTransaction(payload as InventoryTransactionPayload);
      if (kind === 'sku') return createInventorySku(payload as InventorySkuPayload);
      if (kind === 'location') return createInventoryLocation(payload as InventoryLocationPayload);
      if (kind === 'reference') return createInventoryReference(payload as InventoryReferencePayload);
      if (kind === 'balance') return createInventoryBalance(payload as InventoryBalancePayload);
      if (kind === 'consumption') return createWorkOrderInventoryConsumption(payload as WorkOrderInventoryConsumptionPayload);
      return createInventoryGenealogy(payload as InventoryGenealogyPayload);
    },
    onSuccess: () => { setEditor(null); invalidateInventory(); toast.success('Record created'); },
    onError: (error) => toast.error(errorMessage(error, 'Failed to create record')),
  });

  const typeOptions = useMemo(() => Array.from(new Set((lots.data ?? []).map((lot) => lot.inventoryType).filter(Boolean))).sort(), [lots.data]);
  const statusOptions = useMemo(() => Array.from(new Set((lots.data ?? []).map((lot) => lot.status).filter(Boolean))).sort(), [lots.data]);
  const skuOptions = useMemo(() => (skus.data ?? []).map((sku) => option(sku.id, skuLabel(sku))).filter((entry): entry is { value: string; label: string } => Boolean(entry)), [skus.data]);
  const lotOptions = useMemo(() => (lots.data ?? []).map((lot) => option(lot.id, lotLabel(lot))).filter((entry): entry is { value: string; label: string } => Boolean(entry)), [lots.data]);
  const locationOptions = useMemo(() => (locations.data ?? []).map((location) => option(location.id, locationLabel(location))).filter((entry): entry is { value: string; label: string } => Boolean(entry)), [locations.data]);
  const metrics = overview.data;
  const hasError = overview.isError || lots.isError || transactions.isError || skus.isError || references.isError || locations.isError || balances.isError || genealogyLinks.isError || consumptions.isError;
  const mutationBusy = archiveMutation.isPending || restoreMutation.isPending;

  const setField = (key: string, value: string) => setEditor((current) => current && { ...current, values: { ...current.values, [key]: value } });
  const submitEditor = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editor) return;
    if (editor.mode === 'create') {
      createMutation.mutate({ kind: editor.kind, values: editor.values });
      return;
    }
    if (editor.id) updateMutation.mutate({ kind: editor.kind, id: editor.id, values: editor.values });
  };
  const openLotEditor = (lot: InventoryLot) => setEditor({ mode: 'edit', kind: 'lot', id: lot.id, label: lotLabel(lot), values: {
    inventorySkuId: lot.inventorySkuId || '', lotNumber: lot.lotNumber || '', inventoryType: lot.inventoryType || '', status: lot.status || '', quantityInitial: String(lot.quantityInitial ?? ''), quantityCurrent: String(lot.quantityCurrent ?? ''), uom: lot.uom || '', currentLocationId: lot.currentLocationId || '', collectionUnitId: lot.collectionUnitId || '', hetId: lot.hetId || '', workOrderId: lot.workOrderId || '', sourceSystem: lot.sourceSystem || '', legacyItemSerialId: lot.legacyItemSerialId || '', legacyCheckInOutId: lot.legacyCheckInOutId || '', legacyHetId: lot.legacyHetId || '',
  } });
  const openTransactionEditor = (transaction: InventoryTransaction) => setEditor({ mode: 'edit', kind: 'transaction', id: transaction.id, label: transaction.reason || transaction.id, values: {
    inventorySkuId: transaction.inventorySkuId || '', inventoryLotId: transaction.inventoryLotId || '', transactionType: transaction.transactionType || '', direction: transaction.direction || '', reason: transaction.reason || '', quantity: String(transaction.quantity ?? ''), uom: transaction.uom || '', fromLocationId: transaction.fromLocationId || '', toLocationId: transaction.toLocationId || '', workOrderId: transaction.workOrderId || '', occurredAt: transaction.occurredAt || '', actor: transaction.actor || '', signaturePath: transaction.signaturePath || '', remarks: transaction.remarks || '', legacyRefNumber: transaction.legacyRefNumber || '', legacyRefNumberOut: transaction.legacyRefNumberOut || '', sourceSystem: transaction.sourceSystem || '',
  } });
  const openSkuEditor = (sku: InventorySku) => setEditor({ mode: 'edit', kind: 'sku', id: sku.id, label: skuLabel(sku), values: {
    sku: sku.sku || '', description: sku.description || '', category: sku.category || '', brand: sku.brand || '', size: sku.size || '', colour: sku.colour || '', uom: sku.uom || '', packQuantity: String(sku.packQuantity ?? ''), threshold: String(sku.threshold ?? ''), serialisedMode: sku.serialisedMode || '', qrImagePath: sku.qrImagePath || '', mediaUrl: sku.mediaUrl || '', qrPrintPath: sku.qrPrintPath || '', sourceSystem: sku.sourceSystem || '',
  } });
  const openLocationEditor = (location: InventoryLocation) => setEditor({ mode: 'edit', kind: 'location', id: location.id, label: location.name, values: {
    locationType: location.locationType || '', name: location.name || '', parentLocationId: location.parentLocationId || '', description: location.description || '', imagePath: location.imagePath || '', sourceSystem: location.sourceSystem || '',
  } });
  const openReferenceEditor = (reference: InventoryReference) => setEditor({ mode: 'edit', kind: 'reference', id: reference.id, label: reference.name, values: {
    refType: reference.refType || '', name: reference.name || '', shortCode: reference.shortCode || '', description: reference.description || '', sourceSystem: reference.sourceSystem || '',
  } });
  const openBalanceEditor = (balance: InventoryBalance) => setEditor({ mode: 'edit', kind: 'balance', id: balance.id, label: `${skuLabel(balance.inventorySku)} balance`, values: {
    inventorySkuId: balance.inventorySkuId || '', inventoryLotId: balance.inventoryLotId || '', inventoryLocationId: balance.inventoryLocationId || '', quantity: String(balance.quantity ?? ''), sourceSystem: balance.sourceSystem || '',
  } });
  const openGenealogyEditor = (edge: InventoryGenealogyEdge) => setEditor({ mode: 'edit', kind: 'genealogy', id: edge.id, label: edge.relationshipType || edge.id, values: {
    parentInventoryLotId: edge.parentInventoryLotId || '', childInventoryLotId: edge.childInventoryLotId || '', relationshipType: edge.relationshipType || '', workOrderId: edge.workOrderId || '', phaseId: edge.phaseId || '', sourceSystem: edge.sourceSystem || '',
  } });
  const openConsumptionEditor = (consumption: WorkOrderInventoryConsumption) => setEditor({ mode: 'edit', kind: 'consumption', id: consumption.id, label: consumption.workOrderId, values: {
    workOrderId: consumption.workOrderId || '', inventoryLotId: consumption.inventoryLotId || '', inventorySkuId: consumption.inventorySkuId || '', bomLineId: consumption.bomLineId || '', quantity: String(consumption.quantity ?? ''), uom: consumption.uom || '', sourceSystem: consumption.sourceSystem || '',
  } });
  const openCreateEditor = (kind: EditableKind) => {
    const values: Record<EditableKind, Record<string, string>> = {
      reference: { refType: '', name: '', shortCode: '', description: '', sourceSystem: '' },
      lot: { inventorySkuId: '', lotNumber: '', inventoryType: 'HET', status: 'available', quantityInitial: '', quantityCurrent: '', uom: '', currentLocationId: '', collectionUnitId: '', hetId: '', workOrderId: '', sourceSystem: '', legacyItemSerialId: '', legacyCheckInOutId: '', legacyHetId: '' },
      transaction: { inventorySkuId: '', inventoryLotId: '', transactionType: 'ADJUST', direction: '', reason: '', quantity: '', uom: '', fromLocationId: '', toLocationId: '', workOrderId: '', occurredAt: '', actor: '', signaturePath: '', remarks: '', legacyRefNumber: '', legacyRefNumberOut: '', sourceSystem: '' },
      sku: { sku: '', description: '', category: '', brand: '', size: '', colour: '', uom: '', packQuantity: '', threshold: '', serialisedMode: '', qrImagePath: '', mediaUrl: '', qrPrintPath: '', sourceSystem: '' },
      location: { locationType: 'warehouse', name: '', parentLocationId: '', description: '', imagePath: '', sourceSystem: '' },
      balance: { inventorySkuId: '', inventoryLotId: '', inventoryLocationId: '', quantity: '', sourceSystem: '' },
      genealogy: { parentInventoryLotId: '', childInventoryLotId: '', relationshipType: 'consumed_into', workOrderId: '', phaseId: '', sourceSystem: '' },
      consumption: { workOrderId: '', inventoryLotId: '', inventorySkuId: '', bomLineId: '', quantity: '', uom: '', sourceSystem: '' },
    };
    setEditor({ mode: 'create', kind, label: kind.replace(/_/g, ' '), values: values[kind] });
  };

  const renderEditorFields = () => {
    if (!editor) return null;
    const labels = editorFieldLabels[editor.kind];
    const orderedKeys = [...Object.keys(labels), ...Object.keys(editor.values).filter((key) => !labels[key])];
    const value = (key: string) => editor.values[key] ?? '';
    const isRequired = (key: string) => requiredFields[editor.kind].includes(key);
    const selectField = (key: string, options: Array<{ value: string; label: string }>, label?: string) => (
      <SelectField key={key} label={label ?? labels[key]} value={value(key)} options={options} required={isRequired(key)} allowEmpty={!isRequired(key)} onChange={(next) => setField(key, next)} />
    );
    const enumField = (key: string, values: string[], label?: string) => selectField(key, values.map((entry) => ({ value: entry, label: entry.replace(/_/g, ' ') })), label);
    const relationshipField = (key: string) => {
      if (key === 'inventorySkuId') return selectField(key, skuOptions);
      if (key === 'inventoryLotId' || key === 'parentInventoryLotId' || key === 'childInventoryLotId') return selectField(key, lotOptions);
      if (key === 'currentLocationId' || key === 'fromLocationId' || key === 'toLocationId' || key === 'inventoryLocationId' || key === 'parentLocationId') return selectField(key, locationOptions);
      return null;
    };
    return orderedKeys.map((key) => (
      relationshipField(key) ??
      (key === 'inventoryType'
        ? enumField(key, ['HET', 'RAW_MATERIAL', 'WIP', 'FINISHED_GOOD', 'CONSUMABLE'])
        : key === 'status'
          ? enumField(key, ['available', 'reserved', 'consumed', 'quarantined', 'released', 'scrapped'])
          : key === 'transactionType'
            ? enumField(key, ['RECEIVE', 'TRANSFER_IN', 'TRANSFER_OUT', 'CONSUME', 'SCRAP', 'ADJUST'])
            : key === 'direction'
              ? enumField(key, ['IN', 'OUT'])
              : key === 'relationshipType'
                ? enumField(key, ['consumed_into', 'produced_from', 'split_from', 'merged_into'])
                : key === 'locationType'
                  ? enumField(key, ['warehouse', 'room', 'rack', 'bin', 'production_area'])
                  : <TextField key={key} label={labels[key] ?? key.replace(/([A-Z])/g, ' $1')} value={value(key)} required={isRequired(key)} onChange={(next) => setField(key, next)} />)
    ));
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Inventory" description="Lots, SKUs, locations, movements, genealogy, and import audit records." />

      <div className="flex flex-wrap gap-2">
        {includeDeletedToggle('lot', 'lots')}
        {includeDeletedToggle('transaction', 'transactions')}
        {includeDeletedToggle('sku', 'SKUs')}
        {includeDeletedToggle('reference', 'references')}
        {includeDeletedToggle('location', 'locations')}
        {includeDeletedToggle('balance', 'balances')}
        {includeDeletedToggle('genealogy', 'genealogy')}
        {includeDeletedToggle('consumption', 'consumptions')}
        {includeDeletedToggle('import', 'imports')}
      </div>

      {hasError && <div className="flex items-start gap-3 rounded-lg border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-300"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>{errorMessage((overview.error || lots.error || transactions.error || skus.error || references.error || locations.error || balances.error || genealogyLinks.error || consumptions.error) as Error, 'Inventory data could not be loaded.')}</span></div>}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={<Tags className="h-6 w-6" />} label="SKUs" value={metrics?.skus ?? '-'} />
        <MetricCard icon={<Boxes className="h-6 w-6" />} label="Lots" value={metrics?.lots ?? '-'} detail={`${metrics?.hetLots ?? '-'} HET`} />
        <MetricCard icon={<Database className="h-6 w-6" />} label="Transactions" value={metrics?.transactions ?? '-'} detail={`${metrics?.balances ?? '-'} balances`} />
        <MetricCard icon={<MapPin className="h-6 w-6" />} label="Locations" value={metrics?.locations ?? '-'} detail={`${metrics?.finishedGoodLots ?? '-'} finished`} />
      </div>

      <AdminPanel>
        <Tabs defaultValue="lots">
          <TabsList className="h-auto flex-wrap justify-start">
            <TabsTrigger value="lots">Lots</TabsTrigger>
            <TabsTrigger value="transactions">Transactions</TabsTrigger>
            <TabsTrigger value="skus">SKUs</TabsTrigger>
            <TabsTrigger value="references">References</TabsTrigger>
            <TabsTrigger value="locations">Locations</TabsTrigger>
            <TabsTrigger value="balances">Balances</TabsTrigger>
            <TabsTrigger value="genealogy">Genealogy</TabsTrigger>
            <TabsTrigger value="consumptions">Consumptions</TabsTrigger>
            <TabsTrigger value="imports">Imports</TabsTrigger>
          </TabsList>

          <TabsContent value="lots" className="mt-4">
            <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <SearchBox value={lotSearch} onChange={setLotSearch} placeholder="Search lot, HET, serial" />
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <Select value={inventoryType} onValueChange={setInventoryType}><SelectTrigger className="w-full sm:w-48"><SelectValue placeholder="Inventory type" /></SelectTrigger><SelectContent><SelectItem value={ALL_FILTER}>All types</SelectItem>{typeOptions.map((type) => <SelectItem key={type} value={type}>{type.replace(/_/g, ' ')}</SelectItem>)}</SelectContent></Select>
                <Select value={status} onValueChange={setStatus}><SelectTrigger className="w-full sm:w-48"><SelectValue placeholder="Status" /></SelectTrigger><SelectContent><SelectItem value={ALL_FILTER}>All statuses</SelectItem>{statusOptions.map((option) => <SelectItem key={option} value={option}>{option.replace(/_/g, ' ')}</SelectItem>)}</SelectContent></Select>
                {permissions('lot').create && <Button type="button" onClick={() => openCreateEditor('lot')}>Create lot</Button>}
                {lots.isFetching && <span className="text-sm text-gray-500 dark:text-gray-400">Loading lots...</span>}
              </div>
            </div>
            {lots.isError ? <EmptyState icon={<AlertTriangle className="h-6 w-6" />} title="Unable to load inventory lots" /> : lots.isLoading ? <EmptyState icon={<Boxes className="h-6 w-6" />} title="Loading inventory lots" /> : <LotsTable lots={lots.data ?? []} permissions={permissions('lot')} busy={mutationBusy} onEdit={openLotEditor} onArchive={(id) => archiveMutation.mutate({ kind: 'lot', id })} onRestore={(id) => restoreMutation.mutate({ kind: 'lot', id })} onAudit={(id, label) => setAudit({ kind: 'lot', id, label })} />}
          </TabsContent>

          <TabsContent value="transactions" className="mt-4">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><SearchBox value={transactionSearch} onChange={setTransactionSearch} placeholder="Search reason, ref, work order" /><div className="flex items-center gap-2">{permissions('transaction').create && <Button type="button" onClick={() => openCreateEditor('transaction')}>Create movement</Button>}{transactions.isFetching && <span className="text-sm text-gray-500 dark:text-gray-400">Loading transactions...</span>}</div></div>
            {transactions.isError ? <EmptyState icon={<AlertTriangle className="h-6 w-6" />} title="Unable to load inventory transactions" /> : transactions.isLoading ? <EmptyState icon={<Database className="h-6 w-6" />} title="Loading inventory transactions" /> : <TransactionsTable transactions={transactions.data ?? []} permissions={permissions('transaction')} busy={mutationBusy} onEdit={openTransactionEditor} onArchive={(id) => archiveMutation.mutate({ kind: 'transaction', id })} onRestore={(id) => restoreMutation.mutate({ kind: 'transaction', id })} onAudit={(id, label) => setAudit({ kind: 'transaction', id, label })} />}
          </TabsContent>

          <TabsContent value="skus" className="mt-4">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><SearchBox value={skuSearch} onChange={setSkuSearch} placeholder="Search SKU, category, description" /><div className="flex items-center gap-2">{permissions('sku').create && <Button type="button" onClick={() => openCreateEditor('sku')}>Create SKU</Button>}{skus.isFetching && <span className="text-sm text-gray-500 dark:text-gray-400">Loading SKUs...</span>}</div></div>
            {skus.isError ? <EmptyState icon={<AlertTriangle className="h-6 w-6" />} title="Unable to load inventory SKUs" /> : skus.isLoading ? <EmptyState icon={<Tags className="h-6 w-6" />} title="Loading inventory SKUs" /> : <SkusTable skus={skus.data ?? []} permissions={permissions('sku')} busy={mutationBusy} onEdit={openSkuEditor} onArchive={(id) => archiveMutation.mutate({ kind: 'sku', id })} onRestore={(id) => restoreMutation.mutate({ kind: 'sku', id })} onAudit={(id, label) => setAudit({ kind: 'sku', id, label })} />}
          </TabsContent>

          <TabsContent value="references" className="mt-4">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><SearchBox value={referenceSearch} onChange={setReferenceSearch} placeholder="Search reference, type, code" /><div className="flex items-center gap-2">{permissions('reference').create && <Button type="button" onClick={() => openCreateEditor('reference')}>Create reference</Button>}{references.isFetching && <span className="text-sm text-gray-500 dark:text-gray-400">Loading references...</span>}</div></div>
            {references.isError ? <EmptyState icon={<AlertTriangle className="h-6 w-6" />} title="Unable to load inventory references" /> : references.isLoading ? <EmptyState icon={<Tags className="h-6 w-6" />} title="Loading inventory references" /> : <ReferencesTable references={references.data ?? []} permissions={permissions('reference')} busy={mutationBusy} onEdit={openReferenceEditor} onArchive={(id) => archiveMutation.mutate({ kind: 'reference', id })} onRestore={(id) => restoreMutation.mutate({ kind: 'reference', id })} onAudit={(id, label) => setAudit({ kind: 'reference', id, label })} />}
          </TabsContent>

          <TabsContent value="locations" className="mt-4">
            <div className="mb-4 flex justify-end">{permissions('location').create && <Button type="button" onClick={() => openCreateEditor('location')}>Create location</Button>}</div>
            {locations.isError ? <EmptyState icon={<AlertTriangle className="h-6 w-6" />} title="Unable to load inventory locations" /> : locations.isLoading ? <EmptyState icon={<MapPin className="h-6 w-6" />} title="Loading inventory locations" /> : <LocationsTable locations={locations.data ?? []} permissions={permissions('location')} busy={mutationBusy} onEdit={openLocationEditor} onArchive={(id) => archiveMutation.mutate({ kind: 'location', id })} onRestore={(id) => restoreMutation.mutate({ kind: 'location', id })} onAudit={(id, label) => setAudit({ kind: 'location', id, label })} />}
          </TabsContent>

          <TabsContent value="balances" className="mt-4">
            <div className="mb-4 flex justify-end">{permissions('balance').create && <Button type="button" onClick={() => openCreateEditor('balance')}>Create balance</Button>}</div>
            {balances.isError ? <EmptyState icon={<AlertTriangle className="h-6 w-6" />} title="Unable to load inventory balances" /> : balances.isLoading ? <EmptyState icon={<Database className="h-6 w-6" />} title="Loading inventory balances" /> : <BalancesTable balances={balances.data ?? []} permissions={permissions('balance')} busy={mutationBusy} onEdit={openBalanceEditor} onArchive={(id) => archiveMutation.mutate({ kind: 'balance', id })} onRestore={(id) => restoreMutation.mutate({ kind: 'balance', id })} onAudit={(id, label) => setAudit({ kind: 'balance', id, label })} />}
          </TabsContent>

          <TabsContent value="genealogy" className="mt-4">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative w-full sm:max-w-sm"><PackageSearch className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" /><input type="search" value={genealogyLotId} onChange={(event) => setGenealogyLotId(event.target.value)} placeholder="Lot ID" className="h-10 w-full rounded-lg border border-gray-200 bg-transparent py-2 pl-10 pr-3 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-none focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-white/[0.03] dark:text-white/90" /></div>
              <Button type="button" variant="outline" onClick={() => setSelectedGenealogyLotId(genealogyLotId.trim())} disabled={!genealogyLotId.trim()}><GitBranch className="h-4 w-4" />Trace</Button>
              {permissions('genealogy').create && <Button type="button" onClick={() => openCreateEditor('genealogy')}>Create link</Button>}
              {(genealogy.isFetching || genealogyLinks.isFetching) && <span className="text-sm text-gray-500 dark:text-gray-400">Loading genealogy...</span>}
            </div>
            <div className="space-y-6">
              <div>
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-white/90"><GitBranch className="h-4 w-4" />All genealogy links</div>
                {genealogyLinks.isError ? <EmptyState icon={<AlertTriangle className="h-6 w-6" />} title="Unable to load genealogy links" /> : genealogyLinks.isLoading ? <EmptyState icon={<GitBranch className="h-6 w-6" />} title="Loading genealogy links" /> : <GenealogyLinksTable edges={genealogyLinks.data ?? []} permissions={permissions('genealogy')} busy={mutationBusy} onEdit={openGenealogyEditor} onArchive={(id) => archiveMutation.mutate({ kind: 'genealogy', id })} onRestore={(id) => restoreMutation.mutate({ kind: 'genealogy', id })} onAudit={(id, label) => setAudit({ kind: 'genealogy', id, label })} />}
              </div>
              <div>
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-white/90"><PackageSearch className="h-4 w-4" />Lot trace</div>
                {!selectedGenealogyLotId ? <EmptyState icon={<GitBranch className="h-6 w-6" />} title="Select a lot" /> : genealogy.isError ? <EmptyState icon={<AlertTriangle className="h-6 w-6" />} title="Unable to load genealogy" /> : genealogy.isLoading ? <EmptyState icon={<GitBranch className="h-6 w-6" />} title="Loading genealogy" /> : (
                  <div className="space-y-5">
                    <div className="rounded-lg border border-gray-200 px-4 py-3 text-sm dark:border-gray-800"><div className="font-medium text-gray-800 dark:text-white/90">{lotLabel(genealogy.data?.lot)}</div><div className="text-gray-500 dark:text-gray-400">{skuLabel(genealogy.data?.lot.inventorySku)}</div></div>
                    <div className="grid gap-5 xl:grid-cols-2">
                      <GenealogyEdgeTable title="Parents" edges={genealogy.data?.parents ?? []} direction="parent" permissions={permissions('genealogy')} busy={mutationBusy} onEdit={openGenealogyEditor} onArchive={(id) => archiveMutation.mutate({ kind: 'genealogy', id })} onRestore={(id) => restoreMutation.mutate({ kind: 'genealogy', id })} onAudit={(id, label) => setAudit({ kind: 'genealogy', id, label })} />
                      <GenealogyEdgeTable title="Children" edges={genealogy.data?.children ?? []} direction="child" permissions={permissions('genealogy')} busy={mutationBusy} onEdit={openGenealogyEditor} onArchive={(id) => archiveMutation.mutate({ kind: 'genealogy', id })} onRestore={(id) => restoreMutation.mutate({ kind: 'genealogy', id })} onAudit={(id, label) => setAudit({ kind: 'genealogy', id, label })} />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="consumptions" className="mt-4">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><SearchBox value={consumptionSearch} onChange={setConsumptionSearch} placeholder="Search work order, lot, SKU, BOM" /><div className="flex items-center gap-2">{permissions('consumption').create && <Button type="button" onClick={() => openCreateEditor('consumption')}>Create consumption</Button>}{consumptions.isFetching && <span className="text-sm text-gray-500 dark:text-gray-400">Loading consumptions...</span>}</div></div>
            {consumptions.isError ? <EmptyState icon={<AlertTriangle className="h-6 w-6" />} title="Unable to load work-order consumptions" /> : consumptions.isLoading ? <EmptyState icon={<Database className="h-6 w-6" />} title="Loading work-order consumptions" /> : <ConsumptionsTable consumptions={consumptions.data ?? []} permissions={permissions('consumption')} busy={mutationBusy} onEdit={openConsumptionEditor} onArchive={(id) => archiveMutation.mutate({ kind: 'consumption', id })} onRestore={(id) => restoreMutation.mutate({ kind: 'consumption', id })} onAudit={(id, label) => setAudit({ kind: 'consumption', id, label })} />}
          </TabsContent>

          <TabsContent value="imports" className="mt-4">
            {!canReadImports ? <EmptyState icon={<FileClock className="h-6 w-6" />} title="Import reports require import-report read permission" /> : importReports.isError ? <EmptyState icon={<AlertTriangle className="h-6 w-6" />} title="Unable to load import reports" /> : importReports.isLoading ? <EmptyState icon={<FileClock className="h-6 w-6" />} title="Loading import reports" /> : (
              <div className="space-y-3">
                <div className="rounded-lg border border-gray-200 px-4 py-3 text-sm text-gray-600 dark:border-gray-800 dark:text-gray-400">Import report content is immutable audit evidence. Authorized users can archive, restore, and inspect audit history only.</div>
                <ImportReportsTable reports={importReports.data ?? []} permissions={permissions('import')} busy={mutationBusy} onArchive={(id) => archiveMutation.mutate({ kind: 'import', id })} onRestore={(id) => restoreMutation.mutate({ kind: 'import', id })} onAudit={(id, label) => setAudit({ kind: 'import', id, label })} />
              </div>
            )}
          </TabsContent>
        </Tabs>
      </AdminPanel>

      <CrudSheet open={Boolean(editor)} title={editor ? `${editor.mode === 'create' ? 'Create' : 'Edit'} ${editor.label}` : 'Edit record'} description="Update operational inventory fields. Blank optional values are saved as null." submitLabel={editor?.mode === 'create' ? 'Create record' : 'Save changes'} isSubmitting={updateMutation.isPending || createMutation.isPending} onOpenChange={(open) => !open && setEditor(null)} onSubmit={submitEditor}>
        {renderEditorFields()}
      </CrudSheet>
      <AuditDrawer open={Boolean(audit)} title={audit ? `Audit: ${audit.label}` : 'Audit'} events={auditQuery.data} isLoading={auditQuery.isLoading} isError={auditQuery.isError} errorMessage={auditQuery.error ? errorMessage(auditQuery.error, 'Unable to load audit events.') : undefined} onOpenChange={(open) => !open && setAudit(null)} />
    </div>
  );
}
