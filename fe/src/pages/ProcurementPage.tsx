import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  fetchCollectionOrders,
  fetchCollectionPoints,
  fetchCollectionReceipts,
  fetchCollectionUnits,
  fetchIssuanceOrders,
  fetchProcurementOverview,
  fetchSupplyEntities,
  type CollectionPoint,
  type CollectionUnit,
  type ProcurementEvent,
  type SupplyEntity,
} from '@/lib/procurement-api';
import { AdminPanel, EmptyState, MetricCard, PageHeader, StatusPill } from '@/components/tailadmin';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Boxes, Building2, ClipboardList, Eye, EyeOff, ExternalLink, FileCheck2, PackageCheck, Route, Search } from 'lucide-react';

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleString() : '-';
}

function statusTone(value?: string | null): 'brand' | 'success' | 'warning' | 'error' | 'neutral' {
  if (!value) return 'neutral';
  if (/placeholder|no_procurement|hidden/i.test(value)) return 'warning';
  if (/received|accepted|consumed/i.test(value)) return 'success';
  if (/deliver|issuance/i.test(value)) return 'brand';
  return 'neutral';
}

function entityName(entity?: SupplyEntity) {
  return entity?.name || entity?.legalName || entity?.legacyClinicId || '-';
}

function pointName(point?: CollectionPoint) {
  return point?.displayName || point?.hciCode || point?.legacyClinicId || '-';
}

function UnitTable({
  units,
  entitiesById,
  pointsById,
}: {
  units: CollectionUnit[];
  entitiesById: Map<string, SupplyEntity>;
  pointsById: Map<string, CollectionPoint>;
}) {
  if (!units.length) {
    return <EmptyState icon={<Boxes className="h-6 w-6" />} title="No collection units" />;
  }

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
        </TableRow>
      </TableHeader>
      <TableBody>
        {units.map((unit) => (
          <TableRow key={unit.id}>
            <TableCell>
              <Link
                to={`/dashboard/procurement/collection-units/${encodeURIComponent(unit.id)}`}
                className="inline-flex items-center gap-1 font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300"
              >
                {unit.unitNumber || unit.id}
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
              <div className="text-xs text-gray-500">{unit.parcelTrackingNumber || unit.sourceSystem || '-'}</div>
            </TableCell>
            <TableCell>{unit.supplyEntityId ? entityName(entitiesById.get(unit.supplyEntityId)) : '-'}</TableCell>
            <TableCell>{unit.collectionPointId ? pointName(pointsById.get(unit.collectionPointId)) : '-'}</TableCell>
            <TableCell>
              <StatusPill tone={statusTone(unit.status)}>{unit.status.replace(/_/g, ' ')}</StatusPill>
            </TableCell>
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
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function EventTable({ events, kind }: { events: ProcurementEvent[]; kind: 'issuance' | 'order' | 'receipt' }) {
  if (!events.length) {
    return <EmptyState icon={<ClipboardList className="h-6 w-6" />} title="No records" />;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>ID</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Legacy event</TableHead>
          <TableHead>Confidence</TableHead>
          <TableHead>Date</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {events.map((event) => {
          const date =
            kind === 'issuance'
              ? event.issuedAt
              : kind === 'order'
                ? event.requestedAt
                : event.receivedAt;
          const legacyId = event.legacyDeliverCollectId || event.legacyCollectDeliverCollectId || '-';
          return (
            <TableRow key={event.id}>
              <TableCell className="font-medium text-gray-800 dark:text-white/90">{event.id}</TableCell>
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
              <TableCell>{formatDate(date)}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

export default function ProcurementPage() {
  const [includeHidden, setIncludeHidden] = useState(false);
  const [unitSearch, setUnitSearch] = useState('');
  const overview = useQuery({ queryKey: ['procurement', 'overview'], queryFn: fetchProcurementOverview });
  const entities = useQuery({ queryKey: ['procurement', 'supply-entities'], queryFn: fetchSupplyEntities });
  const points = useQuery({ queryKey: ['procurement', 'collection-points'], queryFn: fetchCollectionPoints });
  const units = useQuery({ queryKey: ['procurement', 'collection-units', includeHidden, unitSearch], queryFn: () => fetchCollectionUnits(includeHidden, unitSearch) });
  const issuance = useQuery({ queryKey: ['procurement', 'issuance-orders'], queryFn: fetchIssuanceOrders });
  const collectionOrders = useQuery({ queryKey: ['procurement', 'collection-orders'], queryFn: fetchCollectionOrders });
  const receipts = useQuery({ queryKey: ['procurement', 'collection-receipts'], queryFn: fetchCollectionReceipts });

  const entitiesById = useMemo(() => new Map((entities.data ?? []).map((entity) => [entity.id, entity])), [entities.data]);
  const pointsById = useMemo(() => new Map((points.data ?? []).map((point) => [point.id, point])), [points.data]);
  const metrics = overview.data;
  const hasError = overview.isError || entities.isError || points.isError || units.isError || issuance.isError || collectionOrders.isError || receipts.isError;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Procurement"
        description="Supply, collection units, collection returns, and HET intake."
        action={
          <Button type="button" variant="outline" onClick={() => setIncludeHidden((value) => !value)}>
            {includeHidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            {includeHidden ? 'Hide placeholders' : 'Show placeholders'}
          </Button>
        }
      />

      {hasError && (
        <div className="flex items-start gap-3 rounded-lg border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Procurement data could not be loaded. Refresh or check the API before treating this view as current.</span>
        </div>
      )}

      <div className="flex items-start gap-3 rounded-lg border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-warning-800 dark:border-warning-500/30 dark:bg-warning-500/10 dark:text-warning-200">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Procurement is currently a read-only operational ledger backed by import/read APIs. Create, update, and delete controls are intentionally not shown until procurement write endpoints exist.
        </span>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={<Building2 className="h-6 w-6" />} label="Supply entities" value={metrics?.supplyEntities ?? '-'} detail={`${metrics?.collectionPoints ?? '-'} points`} />
        <MetricCard icon={<Boxes className="h-6 w-6" />} label="Collection units" value={metrics?.unitsOperational ?? '-'} detail={`${metrics?.unitsTotal ?? '-'} total`} />
        <MetricCard icon={<Route className="h-6 w-6" />} label="Issuance orders" value={metrics?.issuanceOrders ?? '-'} />
        <MetricCard icon={<FileCheck2 className="h-6 w-6" />} label="Receipts" value={metrics?.collectionReceipts ?? '-'} detail={`${metrics?.linkedHets ?? '-'} HET links`} />
      </div>

      <AdminPanel>
        <Tabs defaultValue="units">
          <TabsList>
            <TabsTrigger value="units">Units</TabsTrigger>
            <TabsTrigger value="supply">Supply</TabsTrigger>
            <TabsTrigger value="issuance">Issuance</TabsTrigger>
            <TabsTrigger value="returns">Returns</TabsTrigger>
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
              {units.isFetching && <span className="text-sm text-gray-500 dark:text-gray-400">Loading units...</span>}
            </div>
            {units.isError ? (
              <EmptyState icon={<AlertTriangle className="h-6 w-6" />} title="Unable to load collection units" />
            ) : units.isLoading ? (
              <EmptyState icon={<Boxes className="h-6 w-6" />} title="Loading collection units" />
            ) : (
              <UnitTable units={units.data ?? []} entitiesById={entitiesById} pointsById={pointsById} />
            )}
          </TabsContent>

          <TabsContent value="supply" className="mt-4">
            {entities.isError ? (
              <EmptyState icon={<AlertTriangle className="h-6 w-6" />} title="Unable to load supply entities" />
            ) : entities.isLoading ? (
              <EmptyState icon={<Building2 className="h-6 w-6" />} title="Loading supply entities" />
            ) : (entities.data ?? []).length === 0 ? (
              <EmptyState icon={<Building2 className="h-6 w-6" />} title="No supply entities" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Supply entity</TableHead>
                    <TableHead>External code</TableHead>
                    <TableHead>Legacy clinic</TableHead>
                    <TableHead>Collection points</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(entities.data ?? []).map((entity) => (
                    <TableRow key={entity.id}>
                      <TableCell className="font-medium text-gray-800 dark:text-white/90">{entityName(entity)}</TableCell>
                      <TableCell>{entity.externalCode || '-'}</TableCell>
                      <TableCell>{entity.legacyClinicId || '-'}</TableCell>
                      <TableCell>{(points.data ?? []).filter((point) => point.supplyEntityId === entity.id).length}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </TabsContent>

          <TabsContent value="issuance" className="mt-4">
            {issuance.isError ? (
              <EmptyState icon={<AlertTriangle className="h-6 w-6" />} title="Unable to load issuance orders" />
            ) : issuance.isLoading ? (
              <EmptyState icon={<ClipboardList className="h-6 w-6" />} title="Loading issuance orders" />
            ) : (
              <EventTable events={issuance.data ?? []} kind="issuance" />
            )}
          </TabsContent>

          <TabsContent value="returns" className="mt-4">
            <div className="grid gap-5 xl:grid-cols-2">
              <div>
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-white/90">
                  <ClipboardList className="h-4 w-4" />
                  Collection orders
                </div>
                {collectionOrders.isError ? (
                  <EmptyState icon={<AlertTriangle className="h-6 w-6" />} title="Unable to load collection orders" />
                ) : collectionOrders.isLoading ? (
                  <EmptyState icon={<ClipboardList className="h-6 w-6" />} title="Loading collection orders" />
                ) : (
                  <EventTable events={collectionOrders.data ?? []} kind="order" />
                )}
              </div>
              <div>
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-white/90">
                  <PackageCheck className="h-4 w-4" />
                  Receipts
                </div>
                {receipts.isError ? (
                  <EmptyState icon={<AlertTriangle className="h-6 w-6" />} title="Unable to load receipts" />
                ) : receipts.isLoading ? (
                  <EmptyState icon={<PackageCheck className="h-6 w-6" />} title="Loading receipts" />
                ) : (
                  <EventTable events={receipts.data ?? []} kind="receipt" />
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </AdminPanel>
    </div>
  );
}
