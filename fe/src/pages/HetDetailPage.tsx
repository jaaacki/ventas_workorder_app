import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader, EmptyState } from '@/components/tailadmin';
import { SummaryStrip, DetailGrid, SourceRecord, GenealogyCard } from '@/components/detail';
import { unitsLabel } from '@/lib/work-order-ui';
import { fetchHets, fetchHetInventoryTrace } from '@/lib/hets-api';

interface HetView {
  id: string;
  hetNumber: string | null;
  clinicName: string | null;
  quantity: number | null;
  usedById: string | null;
  finishedById: string | null;
}

function hetStatus(het: HetView): { label: string; variant: 'default' | 'secondary' | 'outline' } {
  if (het.finishedById) return { label: 'Consumed', variant: 'default' };
  if (het.usedById) return { label: 'In production', variant: 'secondary' };
  return { label: 'Collected', variant: 'outline' };
}

export default function HetDetailPage() {
  const { id } = useParams<{ id: string }>();

  const hetsQuery = useQuery({ queryKey: ['hets'], queryFn: fetchHets });
  const traceQuery = useQuery({
    queryKey: ['hets', 'inventory-trace', id],
    queryFn: () => fetchHetInventoryTrace(id!),
    enabled: Boolean(id),
    retry: false,
  });

  const trace = traceQuery.data;
  const listHet = hetsQuery.data?.find((candidate) => candidate.id === id) ?? null;
  // Fall back to the trace's own HET record when the list omits it (e.g. a soft-deleted
  // HET still linked from a collection unit) so the Trace link never dead-ends.
  const traceHet = trace?.hets.find((candidate) => candidate.id === id) ?? null;
  const het: HetView | null = listHet
    ? listHet
    : traceHet
      ? { id: traceHet.id, hetNumber: traceHet.hetNumber, clinicName: null, quantity: null, usedById: traceHet.usedById, finishedById: traceHet.finishedById }
      : null;

  if (!het && (hetsQuery.isLoading || traceQuery.isLoading)) {
    return (
      <div className="flex min-h-80 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!id || !het) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="HET"
          description="The requested HET collection could not be loaded."
          action={
            <Button asChild variant="outline">
              <Link to="/dashboard/procurement">
                <ArrowLeft className="h-4 w-4" />
                Collections
              </Link>
            </Button>
          }
        />
        <EmptyState icon={<AlertTriangle className="h-6 w-6" />} title="HET not found" description="Open Collections and trace a HET from its unit." />
      </div>
    );
  }

  const status = hetStatus(het);

  return (
    <div className="space-y-6">
      <PageHeader
        title={het.hetNumber || het.id}
        description="Human extracted teeth · dentin"
        action={
          <>
            <Button asChild variant="outline">
              <Link to="/dashboard/procurement">
                <ArrowLeft className="h-4 w-4" />
                Collections
              </Link>
            </Button>
            <Badge variant={status.variant}>{status.label}</Badge>
          </>
        }
      />

      <SummaryStrip
        rows={[
          { label: 'Status', value: status.label },
          { label: 'HET lot', value: het.hetNumber },
          { label: 'Source clinic', value: het.clinicName },
          { label: 'Quantity', value: unitsLabel(het.quantity) },
        ]}
      />

      <GenealogyCard genealogy={trace?.genealogy ?? []} lots={trace?.lots ?? []} />

      {trace && trace.workOrders.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Work orders</CardTitle>
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
            { label: 'HET ID', value: het.id },
            { label: 'HET number', value: het.hetNumber },
            { label: 'Used by work order', value: het.usedById },
            { label: 'Finished by work order', value: het.finishedById },
          ]}
        />
      </SourceRecord>
    </div>
  );
}
