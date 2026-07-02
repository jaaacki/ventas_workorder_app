import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, Database, GitBranch, PackageSearch, Route } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader, EmptyState } from '@/components/tailadmin';
import { SummaryStrip, DetailGrid, SourceRecord } from '@/components/detail';
import { humanStatus, toneToBadgeVariant } from '@/lib/format';
import {
  fetchInventoryGenealogy,
  fetchInventoryLot,
  type InventoryGenealogyEdge,
  type InventoryLot,
} from '@/lib/inventory-api';

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleString() : null;
}

function formatQty(value?: string | number | null, uom?: string | null) {
  if (value === null || value === undefined || value === '') return null;
  return `${value}${uom ? ` ${uom}` : ''}`;
}

function humanText(value?: string | null) {
  return value ? value.replace(/_/g, ' ') : null;
}

function lotLabel(lot?: InventoryLot | null) {
  if (!lot) return '—';
  return lot.lotNumber || lot.legacyHetId || lot.legacyItemSerialId || lot.id;
}

function skuLabel(lot?: InventoryLot | null) {
  if (!lot?.inventorySku) return lot?.inventorySkuId || null;
  return lot.inventorySku.description || lot.inventorySku.sku || lot.inventorySku.id;
}

function GenealogyTable({ edges, direction }: { edges: InventoryGenealogyEdge[]; direction: 'parents' | 'children' }) {
  const relatedLot = (edge: InventoryGenealogyEdge) =>
    direction === 'parents' ? edge.parentInventoryLot : edge.childInventoryLot;

  if (!edges.length) {
    return <p className="text-sm text-muted-foreground">No {direction} recorded.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Lot</TableHead>
          <TableHead>SKU</TableHead>
          <TableHead>Relationship</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {edges.map((edge) => {
          const lot = relatedLot(edge);
          return (
            <TableRow key={edge.id}>
              <TableCell>
                {lot ? (
                  <Link to={`/dashboard/inventory/lots/${encodeURIComponent(lot.id)}`} className="font-medium text-foreground underline-offset-2 hover:underline">
                    {lotLabel(lot)}
                  </Link>
                ) : (
                  '—'
                )}
              </TableCell>
              <TableCell className="text-muted-foreground">{skuLabel(lot) || '—'}</TableCell>
              <TableCell className="text-muted-foreground">{edge.relationshipType || '—'}</TableCell>
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
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
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
  const status = humanStatus(lot.status);

  return (
    <div className="space-y-6">
      <PageHeader
        title={lotLabel(lot)}
        description={[skuLabel(lot), humanText(lot.inventoryType)].filter(Boolean).join(' · ')}
        action={
          <>
            <Button asChild variant="outline">
              <Link to="/dashboard/inventory">
                <ArrowLeft className="h-4 w-4" />
                Inventory
              </Link>
            </Button>
            <Badge variant={toneToBadgeVariant(status.tone)}>{status.label}</Badge>
          </>
        }
      />

      <SummaryStrip
        rows={[
          { label: 'Status', value: status.label },
          { label: 'Current quantity', value: formatQty(lot.quantityCurrent, lot.uom) },
          { label: 'SKU', value: skuLabel(lot) },
          { label: 'Location', value: lot.currentLocation?.name ?? null },
          { label: 'Type', value: humanText(lot.inventoryType) },
        ]}
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-muted-foreground" />
            Genealogy
          </CardTitle>
        </CardHeader>
        <CardContent>
          {genealogyQuery.isLoading ? (
            <div className="flex h-24 items-center justify-center">
              <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : genealogyQuery.isError || !genealogy ? (
            <EmptyState icon={<Database className="h-6 w-6" />} title="Genealogy unavailable" description="No genealogy read model could be loaded for this lot." />
          ) : (
            <div className="grid gap-6 xl:grid-cols-2">
              <div>
                <div className="mb-2 text-xs text-muted-foreground">Parents</div>
                <GenealogyTable edges={genealogy.parents} direction="parents" />
              </div>
              <div>
                <div className="mb-2 text-xs text-muted-foreground">Children</div>
                <GenealogyTable edges={genealogy.children} direction="children" />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {(lot.collectionUnitId || lot.workOrderId) && (
        <div className="flex flex-wrap gap-2">
          {lot.collectionUnitId && (
            <Button asChild variant="outline" size="sm">
              <Link to={`/dashboard/procurement/collection-units/${encodeURIComponent(lot.collectionUnitId)}`}>
                <PackageSearch className="h-4 w-4" />
                Collection
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
      )}

      <SourceRecord>
        <DetailGrid
          rows={[
            { label: 'Lot ID', value: lot.id },
            { label: 'Lot number', value: lot.lotNumber },
            { label: 'SKU code', value: lot.inventorySku?.sku ?? lot.inventorySkuId },
            { label: 'SKU brand', value: lot.inventorySku?.brand ?? null },
            { label: 'SKU size / colour', value: [lot.inventorySku?.size, lot.inventorySku?.colour].filter(Boolean).join(' / ') || null },
            { label: 'Location type', value: lot.currentLocation?.locationType ?? null },
            { label: 'Collection unit', value: lot.collectionUnitId },
            { label: 'HET', value: lot.hetId ?? lot.legacyHetId },
            { label: 'Work order', value: lot.workOrderId },
            { label: 'Legacy serial', value: lot.legacyItemSerialId },
            { label: 'Legacy check in/out', value: lot.legacyCheckInOutId ?? null },
            { label: 'Source system', value: lot.sourceSystem },
            { label: 'Updated', value: formatDate(lot.updatedAt) },
          ]}
        />
      </SourceRecord>
    </div>
  );
}
