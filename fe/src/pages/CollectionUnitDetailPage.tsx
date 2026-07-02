import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowLeft,
  Boxes,
  CheckCircle2,
  ClipboardList,
  FileCheck2,
  GitBranch,
  PackageSearch,
  Route,
  Truck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AdminPanel, EmptyState, MetricCard, PageHeader, StatusPill } from '@/components/tailadmin';
import {
  fetchCollectionUnit,
  fetchCollectionUnitInventoryTrace,
  type CollectionReceiptLine,
  type CollectionUnitDetail,
  type CollectionUnitFulfilment,
  type IssuanceOrderLine,
} from '@/lib/procurement-api';
import type { InventoryGenealogyEdge, InventoryLot, InventoryTransaction } from '@/lib/inventory-api';

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleString() : '-';
}

function formatQuantity(value?: string | number | null, uom?: string | null) {
  if (value === null || value === undefined || value === '') return '-';
  return `${value}${uom ? ` ${uom}` : ''}`;
}

function statusTone(value?: string | null): 'brand' | 'success' | 'warning' | 'error' | 'neutral' {
  if (!value) return 'neutral';
  if (/placeholder|hidden|inferred|no_procurement|discrepancy|rejected/i.test(value)) return 'warning';
  if (/received|accepted|fulfilled|complete|consumed|available/i.test(value)) return 'success';
  if (/deliver|issuance|issued|requested|transit/i.test(value)) return 'brand';
  if (/error|failed|void|deleted/i.test(value)) return 'error';
  return 'neutral';
}

function unitTitle(unit: CollectionUnitDetail) {
  return unit.unitNumber || unit.legacyHetId || unit.id;
}

function DetailItem({ label, value }: { label: string; value?: string | number | boolean | null }) {
  const display = typeof value === 'boolean' ? (value ? 'Yes' : 'No') : value || '-';
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-[0.08em] text-gray-500 dark:text-gray-400">{label}</div>
      <div className="mt-1 break-words text-sm font-medium text-gray-800 dark:text-white/90">{display}</div>
    </div>
  );
}

function IssuanceLinesTable({ lines }: { lines: IssuanceOrderLine[] }) {
  if (!lines.length) {
    return <EmptyState icon={<ClipboardList className="h-6 w-6" />} title="No issuance lines" />;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Issuance order</TableHead>
          <TableHead>Legacy HET</TableHead>
          <TableHead>Tracking</TableHead>
          <TableHead>Created</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {lines.map((line) => (
          <TableRow key={line.id}>
            <TableCell className="font-medium text-gray-800 dark:text-white/90">{line.issuanceOrderId}</TableCell>
            <TableCell>{line.legacyHetNumber || line.legacyHetId || '-'}</TableCell>
            <TableCell>{line.parcelTrackingNumber || '-'}</TableCell>
            <TableCell>{formatDate(line.createdAt)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function FulfilmentsTable({ fulfilments }: { fulfilments: CollectionUnitFulfilment[] }) {
  if (!fulfilments.length) {
    return <EmptyState icon={<Truck className="h-6 w-6" />} title="No fulfilments" />;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Fulfilled</TableHead>
          <TableHead>By</TableHead>
          <TableHead>Source</TableHead>
          <TableHead>Evidence</TableHead>
          <TableHead>Remarks</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {fulfilments.map((fulfilment) => (
          <TableRow key={fulfilment.id}>
            <TableCell>{formatDate(fulfilment.fulfilledAt)}</TableCell>
            <TableCell>{fulfilment.fulfilledBy || '-'}</TableCell>
            <TableCell>
              <div className="flex flex-col gap-1">
                <span>{fulfilment.source || '-'}</span>
                {fulfilment.inferred && <StatusPill tone="warning">Inferred</StatusPill>}
              </div>
            </TableCell>
            <TableCell>{fulfilment.evidencePath || '-'}</TableCell>
            <TableCell>{fulfilment.remarks || '-'}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function ReceiptLinesTable({ lines }: { lines: CollectionReceiptLine[] }) {
  if (!lines.length) {
    return <EmptyState icon={<FileCheck2 className="h-6 w-6" />} title="No receipt lines" />;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Receipt</TableHead>
          <TableHead>Condition</TableHead>
          <TableHead>Acceptance</TableHead>
          <TableHead>Resulting HET</TableHead>
          <TableHead>Discrepancy</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {lines.map((line) => (
          <TableRow key={line.id}>
            <TableCell className="font-medium text-gray-800 dark:text-white/90">{line.collectionReceiptId}</TableCell>
            <TableCell>{line.conditionStatus || '-'}</TableCell>
            <TableCell>
              <StatusPill tone={statusTone(line.acceptanceStatus)}>
                {(line.acceptanceStatus || '-').replace(/_/g, ' ')}
              </StatusPill>
            </TableCell>
            <TableCell>{line.resultingHetId || '-'}</TableCell>
            <TableCell>{line.discrepancyReason || '-'}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function LotsTable({ lots }: { lots: InventoryLot[] }) {
  if (!lots.length) {
    return <EmptyState icon={<PackageSearch className="h-6 w-6" />} title="No lots linked" />;
  }

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
        </TableRow>
      </TableHeader>
      <TableBody>
        {lots.slice(0, 10).map((lot) => (
          <TableRow key={lot.id}>
            <TableCell className="font-medium text-gray-800 dark:text-white/90">{lot.lotNumber || lot.id}</TableCell>
            <TableCell>{lot.inventorySku?.sku || lot.inventorySku?.description || lot.inventorySkuId || '-'}</TableCell>
            <TableCell>{lot.inventoryType}</TableCell>
            <TableCell>{lot.status}</TableCell>
            <TableCell>{formatQuantity(lot.quantityCurrent, lot.uom)}</TableCell>
            <TableCell>{lot.currentLocation?.name || lot.currentLocationId || '-'}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function TransactionsTable({ transactions }: { transactions: InventoryTransaction[] }) {
  if (!transactions.length) {
    return <EmptyState icon={<Boxes className="h-6 w-6" />} title="No movements linked" />;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Type</TableHead>
          <TableHead>Direction</TableHead>
          <TableHead>Reason</TableHead>
          <TableHead>Quantity</TableHead>
          <TableHead>Occurred</TableHead>
          <TableHead>Actor</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {transactions.slice(0, 10).map((transaction) => (
          <TableRow key={transaction.id}>
            <TableCell className="font-medium text-gray-800 dark:text-white/90">{transaction.transactionType}</TableCell>
            <TableCell>{transaction.direction || '-'}</TableCell>
            <TableCell>{transaction.reason || transaction.legacyRefNumber || '-'}</TableCell>
            <TableCell>{formatQuantity(transaction.quantity, transaction.uom)}</TableCell>
            <TableCell>{formatDate(transaction.occurredAt)}</TableCell>
            <TableCell>{transaction.actor || '-'}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function GenealogyTable({ genealogy }: { genealogy: InventoryGenealogyEdge[] }) {
  if (!genealogy.length) {
    return <EmptyState icon={<GitBranch className="h-6 w-6" />} title="No genealogy edges" />;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Parent lot</TableHead>
          <TableHead>Relationship</TableHead>
          <TableHead>Child lot</TableHead>
          <TableHead>Work order</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {genealogy.slice(0, 10).map((edge) => (
          <TableRow key={edge.id}>
            <TableCell>{edge.parentInventoryLot?.lotNumber || edge.parentInventoryLot?.id || '-'}</TableCell>
            <TableCell>{edge.relationshipType || '-'}</TableCell>
            <TableCell>{edge.childInventoryLot?.lotNumber || edge.childInventoryLot?.id || '-'}</TableCell>
            <TableCell>{edge.workOrderId || '-'}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default function CollectionUnitDetailPage() {
  const { id } = useParams<{ id: string }>();

  const unitQuery = useQuery({
    queryKey: ['procurement', 'collection-unit', id],
    queryFn: () => fetchCollectionUnit(id!),
    enabled: Boolean(id),
  });

  const traceQuery = useQuery({
    queryKey: ['procurement', 'collection-unit-inventory-trace', id],
    queryFn: () => fetchCollectionUnitInventoryTrace(id!),
    enabled: Boolean(id),
  });

  if (unitQuery.isLoading) {
    return (
      <div className="flex min-h-80 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
      </div>
    );
  }

  if (!id || unitQuery.isError || !unitQuery.data) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Collection unit"
          description="The requested procurement unit could not be loaded."
          action={
            <Button asChild variant="outline">
              <Link to="/dashboard/procurement">
                <ArrowLeft className="h-4 w-4" />
                Procurement
              </Link>
            </Button>
          }
        />
        <EmptyState icon={<AlertTriangle className="h-6 w-6" />} title="Collection unit not found" description="Open procurement and select a visible collection unit." />
      </div>
    );
  }

  const unit = unitQuery.data;
  const trace = traceQuery.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title={unitTitle(unit)}
        description={`${unit.status.replace(/_/g, ' ')} - ${unit.sourceSystem || 'procurement read model'}`}
        action={
          <>
            <Button asChild variant="outline">
              <Link to="/dashboard/procurement">
                <ArrowLeft className="h-4 w-4" />
                Procurement
              </Link>
            </Button>
            <StatusPill tone={unit.hiddenFromOperations ? 'warning' : 'success'}>
              {unit.hiddenFromOperations ? 'Hidden placeholder' : 'Operational'}
            </StatusPill>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={<Truck className="h-6 w-6" />} label="Procurement records" value={unit.issuanceLines.length + unit.fulfilments.length + unit.receiptLines.length} detail={`${unit.receiptLines.length} receipts`} />
        <MetricCard icon={<CheckCircle2 className="h-6 w-6" />} label="Linked HETs" value={unit.hets.length} detail={unit.legacyHetId || unit.legacyNextHetId || undefined} />
        <MetricCard icon={<PackageSearch className="h-6 w-6" />} label="Trace lots" value={trace?.lots.length ?? '-'} detail={`${trace?.transactions.length ?? '-'} movements`} />
        <MetricCard icon={<Route className="h-6 w-6" />} label="Work orders" value={trace?.workOrders.length ?? '-'} detail={unit.legacyUsedByWorkOrderId || undefined} />
      </div>

      <AdminPanel title="Collection unit record" description="Imported procurement unit identifiers, source links, and operational visibility flags.">
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          <DetailItem label="Unit ID" value={unit.id} />
          <DetailItem label="Unit number" value={unit.unitNumber} />
          <DetailItem label="Tracking" value={unit.parcelTrackingNumber} />
          <DetailItem label="Status" value={unit.status.replace(/_/g, ' ')} />
          <DetailItem label="Supply entity" value={unit.supplyEntityId} />
          <DetailItem label="Collection point" value={unit.collectionPointId} />
          <DetailItem label="Legacy deliver" value={unit.legacyDeliverId} />
          <DetailItem label="Legacy collect" value={unit.legacyCollectId} />
          <DetailItem label="Legacy HET" value={unit.legacyHetId} />
          <DetailItem label="Next HET" value={unit.legacyNextHetId} />
          <DetailItem label="Used by work order" value={unit.legacyUsedByWorkOrderId} />
          <DetailItem label="Updated" value={formatDate(unit.updatedAt)} />
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <StatusPill tone={statusTone(unit.linkCompleteness)}>{unit.linkCompleteness || 'Link completeness unknown'}</StatusPill>
          <StatusPill tone={statusTone(unit.semanticConfidence)}>{unit.semanticConfidence || 'Confidence unknown'}</StatusPill>
          {unit.deleted && <StatusPill tone="error">Deleted in source</StatusPill>}
        </div>
      </AdminPanel>

      <div className="grid gap-6 xl:grid-cols-2">
        <AdminPanel title="Issuance lines">
          <IssuanceLinesTable lines={unit.issuanceLines} />
        </AdminPanel>
        <AdminPanel title="Fulfilments">
          <FulfilmentsTable fulfilments={unit.fulfilments} />
        </AdminPanel>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <AdminPanel title="Receipt lines">
          <ReceiptLinesTable lines={unit.receiptLines} />
        </AdminPanel>
        <AdminPanel title="Linked HETs">
          {unit.hets.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>HET</TableHead>
                  <TableHead>Clinic</TableHead>
                  <TableHead>Used by</TableHead>
                  <TableHead>Finished by</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {unit.hets.map((het) => (
                  <TableRow key={het.id}>
                    <TableCell className="font-medium text-gray-800 dark:text-white/90">{het.hetNumber || het.id}</TableCell>
                    <TableCell>{het.clinicName || '-'}</TableCell>
                    <TableCell>{het.usedById || '-'}</TableCell>
                    <TableCell>{het.finishedById || '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState icon={<Boxes className="h-6 w-6" />} title="No HET links" />
          )}
        </AdminPanel>
      </div>

      <AdminPanel title="Inventory trace" description="Lots, movements, genealogy, consumptions, HETs, and work orders associated with this collection unit.">
        {traceQuery.isLoading ? (
          <div className="flex h-32 items-center justify-center">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
          </div>
        ) : traceQuery.isError || !trace ? (
          <EmptyState icon={<PackageSearch className="h-6 w-6" />} title="Trace unavailable" description="Inventory trace data could not be loaded for this collection unit." />
        ) : (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <MetricCard icon={<PackageSearch className="h-5 w-5" />} label="Lots" value={trace.lots.length} />
              <MetricCard icon={<Boxes className="h-5 w-5" />} label="Transactions" value={trace.transactions.length} />
              <MetricCard icon={<GitBranch className="h-5 w-5" />} label="Genealogy" value={trace.genealogy.length} />
              <MetricCard icon={<ClipboardList className="h-5 w-5" />} label="Consumptions" value={trace.consumptions.length} />
              <MetricCard icon={<Route className="h-5 w-5" />} label="Work orders" value={trace.workOrders.length} />
            </div>

            <div>
              <div className="mb-2 text-sm font-semibold text-gray-800 dark:text-white/90">Lots</div>
              <LotsTable lots={trace.lots} />
            </div>

            <div>
              <div className="mb-2 text-sm font-semibold text-gray-800 dark:text-white/90">Recent movements</div>
              <TransactionsTable transactions={trace.transactions} />
            </div>

            <div className="grid gap-5 xl:grid-cols-2">
              <div>
                <div className="mb-2 text-sm font-semibold text-gray-800 dark:text-white/90">Genealogy</div>
                <GenealogyTable genealogy={trace.genealogy} />
              </div>
              <div>
                <div className="mb-2 text-sm font-semibold text-gray-800 dark:text-white/90">Related work orders</div>
                {trace.workOrders.length ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Work order</TableHead>
                        <TableHead>HET</TableHead>
                        <TableHead>Phase</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {trace.workOrders.map((workOrder) => (
                        <TableRow key={workOrder.id}>
                          <TableCell>
                            <Link to={`/dashboard/work-orders/${encodeURIComponent(workOrder.id)}`} className="font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300">
                              {workOrder.woNumber || workOrder.id}
                            </Link>
                          </TableCell>
                          <TableCell>{workOrder.hetId || '-'}</TableCell>
                          <TableCell>{workOrder.phaseOrder ?? '-'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <EmptyState icon={<Route className="h-6 w-6" />} title="No work orders linked" />
                )}
              </div>
            </div>
          </div>
        )}
      </AdminPanel>
    </div>
  );
}
