import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowLeft,
  Boxes,
  Database,
  GitBranch,
  MapPin,
  PackageSearch,
  Route,
  Tags,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AdminPanel, EmptyState, MetricCard, PageHeader, StatusPill } from '@/components/tailadmin';
import {
  fetchInventoryGenealogy,
  fetchInventoryLot,
  type InventoryGenealogyEdge,
  type InventoryLot,
} from '@/lib/inventory-api';

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
  if (/scrap|consume|used|void|lost|reject/i.test(value)) return 'error';
  if (/het|finished_good|transfer/i.test(value)) return 'brand';
  return 'neutral';
}

function lotLabel(lot?: InventoryLot | null) {
  if (!lot) return '-';
  return lot.lotNumber || lot.legacyHetId || lot.legacyItemSerialId || lot.id;
}

function skuLabel(lot?: InventoryLot | null) {
  if (!lot?.inventorySku) return lot?.inventorySkuId || '-';
  return lot.inventorySku.description || lot.inventorySku.sku || lot.inventorySku.id;
}

function DetailItem({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-[0.08em] text-gray-500 dark:text-gray-400">{label}</div>
      <div className="mt-1 break-words text-sm font-medium text-gray-800 dark:text-white/90">{value || '-'}</div>
    </div>
  );
}

function GenealogyTable({
  edges,
  direction,
}: {
  edges: InventoryGenealogyEdge[];
  direction: 'parents' | 'children';
}) {
  const relatedLot = (edge: InventoryGenealogyEdge) =>
    direction === 'parents' ? edge.parentInventoryLot : edge.childInventoryLot;

  if (!edges.length) {
    return <EmptyState icon={<GitBranch className="h-6 w-6" />} title={`No ${direction}`} />;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Lot</TableHead>
          <TableHead>SKU</TableHead>
          <TableHead>Relationship</TableHead>
          <TableHead>Work order</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {edges.map((edge) => {
          const lot = relatedLot(edge);
          return (
            <TableRow key={edge.id}>
              <TableCell>
                {lot ? (
                  <Link to={`/dashboard/inventory/lots/${encodeURIComponent(lot.id)}`} className="font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300">
                    {lotLabel(lot)}
                  </Link>
                ) : (
                  '-'
                )}
              </TableCell>
              <TableCell>{skuLabel(lot)}</TableCell>
              <TableCell>{edge.relationshipType || '-'}</TableCell>
              <TableCell>{edge.workOrderId || lot?.workOrderId || '-'}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

export default function InventoryLotDetailPage() {
  const { id } = useParams<{ id: string }>();

  const lotQuery = useQuery({
    queryKey: ['inventory', 'lot', id],
    queryFn: () => fetchInventoryLot(id!),
    enabled: Boolean(id),
  });

  const genealogyQuery = useQuery({
    queryKey: ['inventory', 'genealogy', id],
    queryFn: () => fetchInventoryGenealogy(id!),
    enabled: Boolean(id),
    retry: false,
  });

  if (lotQuery.isLoading) {
    return (
      <div className="flex min-h-80 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
      </div>
    );
  }

  if (!id || lotQuery.isError || !lotQuery.data) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Inventory lot"
          description="The requested inventory lot could not be loaded."
          action={
            <Button asChild variant="outline">
              <Link to="/dashboard/inventory">
                <ArrowLeft className="h-4 w-4" />
                Inventory
              </Link>
            </Button>
          }
        />
        <EmptyState icon={<AlertTriangle className="h-6 w-6" />} title="Inventory lot not found" description="Open inventory and select a visible lot." />
      </div>
    );
  }

  const lot = lotQuery.data;
  const genealogy = genealogyQuery.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title={lotLabel(lot)}
        description={`${lot.inventoryType.replace(/_/g, ' ')} - ${lot.status.replace(/_/g, ' ')}`}
        action={
          <>
            <Button asChild variant="outline">
              <Link to="/dashboard/inventory">
                <ArrowLeft className="h-4 w-4" />
                Inventory
              </Link>
            </Button>
            <StatusPill tone={statusTone(lot.status)}>{lot.status.replace(/_/g, ' ')}</StatusPill>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={<Boxes className="h-6 w-6" />} label="Current quantity" value={formatQty(lot.quantityCurrent, lot.uom)} detail={`Initial ${formatQty(lot.quantityInitial, lot.uom)}`} />
        <MetricCard icon={<Tags className="h-6 w-6" />} label="SKU" value={lot.inventorySku?.sku || lot.inventorySkuId || '-'} detail={lot.inventorySku?.category || undefined} />
        <MetricCard icon={<MapPin className="h-6 w-6" />} label="Location" value={lot.currentLocation?.name || lot.currentLocationId || '-'} detail={lot.currentLocation?.locationType || undefined} />
        <MetricCard icon={<GitBranch className="h-6 w-6" />} label="Genealogy" value={(genealogy?.parents.length ?? 0) + (genealogy?.children.length ?? 0)} detail={`${genealogy?.parents.length ?? '-'} parents`} />
      </div>

      <AdminPanel title="Lot record" description="Read-only inventory lot identifiers, quantities, status, and legacy references.">
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          <DetailItem label="Lot ID" value={lot.id} />
          <DetailItem label="Lot number" value={lot.lotNumber} />
          <DetailItem label="Inventory type" value={lot.inventoryType.replace(/_/g, ' ')} />
          <DetailItem label="Status" value={lot.status.replace(/_/g, ' ')} />
          <DetailItem label="SKU" value={skuLabel(lot)} />
          <DetailItem label="Current location" value={lot.currentLocation?.name || lot.currentLocationId} />
          <DetailItem label="Collection unit" value={lot.collectionUnitId} />
          <DetailItem label="HET" value={lot.hetId || lot.legacyHetId} />
          <DetailItem label="Work order" value={lot.workOrderId} />
          <DetailItem label="Legacy serial" value={lot.legacyItemSerialId} />
          <DetailItem label="Legacy check in/out" value={lot.legacyCheckInOutId} />
          <DetailItem label="Updated" value={formatDate(lot.updatedAt)} />
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          {lot.collectionUnitId && (
            <Button asChild variant="outline" size="sm">
              <Link to={`/dashboard/procurement/collection-units/${encodeURIComponent(lot.collectionUnitId)}`}>
                <PackageSearch className="h-4 w-4" />
                Collection unit
              </Link>
            </Button>
          )}
          {lot.workOrderId && (
            <Button asChild variant="outline" size="sm">
              <Link to={`/dashboard/work-orders/${encodeURIComponent(lot.workOrderId)}`}>
                <Route className="h-4 w-4" />
                Work order
              </Link>
            </Button>
          )}
        </div>
      </AdminPanel>

      <AdminPanel title="SKU and location context">
        <div className="grid gap-6 xl:grid-cols-2">
          <div className="rounded-lg border border-gray-200 px-4 py-3 dark:border-gray-800">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-white/90">
              <Tags className="h-4 w-4" />
              SKU
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <DetailItem label="Description" value={lot.inventorySku?.description} />
              <DetailItem label="SKU" value={lot.inventorySku?.sku} />
              <DetailItem label="Brand" value={lot.inventorySku?.brand} />
              <DetailItem label="Size / colour" value={[lot.inventorySku?.size, lot.inventorySku?.colour].filter(Boolean).join(' / ') || null} />
            </div>
          </div>
          <div className="rounded-lg border border-gray-200 px-4 py-3 dark:border-gray-800">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-white/90">
              <MapPin className="h-4 w-4" />
              Location
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <DetailItem label="Name" value={lot.currentLocation?.name} />
              <DetailItem label="Type" value={lot.currentLocation?.locationType} />
              <DetailItem label="Parent" value={lot.currentLocation?.parentLocationId} />
              <DetailItem label="Description" value={lot.currentLocation?.description} />
            </div>
          </div>
        </div>
      </AdminPanel>

      <AdminPanel title="Genealogy" description="Parent and child lot relationships for this inventory lot.">
        {genealogyQuery.isLoading ? (
          <div className="flex h-32 items-center justify-center">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
          </div>
        ) : genealogyQuery.isError || !genealogy ? (
          <EmptyState icon={<Database className="h-6 w-6" />} title="Genealogy unavailable" description="No genealogy read model could be loaded for this lot." />
        ) : (
          <div className="grid gap-5 xl:grid-cols-2">
            <div>
              <div className="mb-2 text-sm font-semibold text-gray-800 dark:text-white/90">Parents</div>
              <GenealogyTable edges={genealogy.parents} direction="parents" />
            </div>
            <div>
              <div className="mb-2 text-sm font-semibold text-gray-800 dark:text-white/90">Children</div>
              <GenealogyTable edges={genealogy.children} direction="children" />
            </div>
          </div>
        )}
      </AdminPanel>
    </div>
  );
}
