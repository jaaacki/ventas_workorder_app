import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, ArrowRight, GitBranch } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader, EmptyState } from '@/components/tailadmin';
import { SummaryStrip, DetailGrid, SourceRecord } from '@/components/detail';
import { fetchHets, fetchHetInventoryTrace, type HetSummary } from '@/lib/hets-api';

function hetStatus(het: HetSummary): { label: string; variant: 'default' | 'secondary' | 'outline' } {
  if (het.finishedById) return { label: 'Consumed', variant: 'default' };
  if (het.usedById) return { label: 'In production', variant: 'secondary' };
  return { label: 'Collected', variant: 'outline' };
}

function LotLink({ id, label }: { id?: string | null; label: string }) {
  if (!id) return <span className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">{label}</span>;
  return (
    <Link to={`/dashboard/inventory/lots/${encodeURIComponent(id)}`} className="rounded-md bg-muted px-2 py-1 text-xs font-medium text-foreground transition-colors hover:bg-accent">
      {label}
    </Link>
  );
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

  const het = hetsQuery.data?.find((candidate) => candidate.id === id) ?? null;
  const trace = traceQuery.data;

  if (hetsQuery.isLoading) {
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
          { label: 'Quantity', value: het.quantity != null ? `${het.quantity} unit${het.quantity === 1 ? '' : 's'}` : null },
        ]}
      />

      {trace && (trace.genealogy.length > 0 || trace.lots.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <GitBranch className="h-4 w-4 text-muted-foreground" />
              Genealogy
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {trace.lots.length > 0 && (
              <div>
                <div className="mb-2 text-xs text-muted-foreground">Lots from this HET</div>
                <div className="flex flex-wrap gap-2">
                  {trace.lots.map((lot) => (
                    <LotLink key={lot.id} id={lot.id} label={lot.lotNumber || lot.id} />
                  ))}
                </div>
              </div>
            )}
            {trace.genealogy.length > 0 && (
              <div>
                <div className="mb-2 text-xs text-muted-foreground">Parent → child links</div>
                <ul className="space-y-1.5">
                  {trace.genealogy.map((edge) => (
                    <li key={edge.id} className="flex flex-wrap items-center gap-2">
                      <LotLink id={edge.parentInventoryLotId} label={edge.parentInventoryLot?.lotNumber || edge.parentInventoryLotId || 'Unknown'} />
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                      <LotLink id={edge.childInventoryLotId} label={edge.childInventoryLot?.lotNumber || edge.childInventoryLotId || 'Unknown'} />
                      <span className="text-xs text-muted-foreground">{edge.relationshipType}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

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
