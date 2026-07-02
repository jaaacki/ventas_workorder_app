import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, Boxes } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader, EmptyState } from '@/components/tailadmin';
import { SummaryStrip, DetailGrid, SourceRecord } from '@/components/detail';
import { humanStatus, toneToBadgeVariant } from '@/lib/format';
import {
  fetchCollectionUnit,
  fetchCollectionUnitInventoryTrace,
  type CollectionUnitDetail,
} from '@/lib/procurement-api';

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleString() : null;
}

function unitTitle(unit: CollectionUnitDetail) {
  return unit.unitNumber || unit.legacyHetId || unit.id;
}

function clinicName(unit: CollectionUnitDetail) {
  return unit.hets.find((het) => het.clinicName)?.clinicName ?? null;
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
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!id || unitQuery.isError || !unitQuery.data) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Collection"
          description="The requested collection unit could not be loaded."
          action={
            <Button asChild variant="outline">
              <Link to="/dashboard/procurement">
                <ArrowLeft className="h-4 w-4" />
                Collections
              </Link>
            </Button>
          }
        />
        <EmptyState icon={<AlertTriangle className="h-6 w-6" />} title="Collection unit not found" description="Open Collections and select a visible unit." />
      </div>
    );
  }

  const unit = unitQuery.data;
  const trace = traceQuery.data;
  const status = humanStatus(unit.status);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Collection ${unitTitle(unit)}`}
        description={clinicName(unit) || 'Human extracted teeth'}
        action={
          <>
            <Button asChild variant="outline">
              <Link to="/dashboard/procurement">
                <ArrowLeft className="h-4 w-4" />
                Collections
              </Link>
            </Button>
            <Badge variant={unit.hiddenFromOperations ? 'outline' : toneToBadgeVariant(status.tone)}>
              {unit.hiddenFromOperations ? 'Placeholder' : status.label}
            </Badge>
          </>
        }
      />

      <SummaryStrip
        rows={[
          { label: 'Status', value: status.label },
          { label: 'Clinic', value: clinicName(unit) },
          { label: 'HET lot', value: unit.hets.find((het) => het.hetNumber)?.hetNumber ?? null },
          { label: 'Tracking', value: unit.parcelTrackingNumber },
        ]}
      />

      {unit.hets.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Boxes className="h-4 w-4 text-muted-foreground" />
              Linked HET
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>HET</TableHead>
                  <TableHead>Clinic</TableHead>
                  <TableHead className="text-right">Open</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {unit.hets.map((het) => (
                  <TableRow key={het.id}>
                    <TableCell className="font-medium text-foreground">{het.hetNumber || het.id}</TableCell>
                    <TableCell className="text-muted-foreground">{het.clinicName || '—'}</TableCell>
                    <TableCell className="text-right">
                      <Button asChild size="sm" variant="outline">
                        <Link to={`/dashboard/hets/${encodeURIComponent(het.id)}`}>Trace</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {trace && trace.workOrders.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Related work orders</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Work order</TableHead>
                  <TableHead>Phase</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {trace.workOrders.map((workOrder) => (
                  <TableRow key={workOrder.id}>
                    <TableCell>
                      <Link to={`/dashboard/work-orders/${encodeURIComponent(workOrder.id)}`} className="font-medium text-foreground underline-offset-2 hover:underline">
                        {workOrder.woNumber || workOrder.id}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{workOrder.phaseOrder ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <SourceRecord>
        <DetailGrid
          rows={[
            { label: 'Unit ID', value: unit.id },
            { label: 'Unit number', value: unit.unitNumber },
            { label: 'Tracking', value: unit.parcelTrackingNumber },
            { label: 'Status code', value: unit.status },
            { label: 'Supply entity', value: unit.supplyEntityId },
            { label: 'Collection point', value: unit.collectionPointId },
            { label: 'Legacy deliver', value: unit.legacyDeliverId },
            { label: 'Legacy collect', value: unit.legacyCollectId },
            { label: 'Legacy HET', value: unit.legacyHetId },
            { label: 'Next HET', value: unit.legacyNextHetId },
            { label: 'Used by work order', value: unit.legacyUsedByWorkOrderId },
            { label: 'Link completeness', value: unit.linkCompleteness },
            { label: 'Semantic confidence', value: unit.semanticConfidence },
            { label: 'Source system', value: unit.sourceSystem },
            { label: 'Updated', value: formatDate(unit.updatedAt) },
          ]}
        />
        {trace && trace.lots.length > 0 && (
          <div>
            <div className="mb-2 text-xs text-muted-foreground">Inventory lots</div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Lot</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {trace.lots.slice(0, 10).map((lot) => (
                  <TableRow key={lot.id}>
                    <TableCell>
                      <Link to={`/dashboard/inventory/lots/${encodeURIComponent(lot.id)}`} className="font-medium text-foreground underline-offset-2 hover:underline">
                        {lot.lotNumber || lot.id}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{lot.inventoryType}</TableCell>
                    <TableCell className="text-muted-foreground">{lot.status}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </SourceRecord>
    </div>
  );
}
