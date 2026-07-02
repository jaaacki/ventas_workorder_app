import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchQaWorkOrderQueue, type WorkOrderSummary } from '@/lib/work-orders-api';
import { useWorkflowContext } from '@/store/workflowContext';
import { PageHeader, EmptyState } from '@/components/tailadmin';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { AlertTriangle, ShieldCheck } from 'lucide-react';

function holdReason(wo: WorkOrderSummary): string {
  if (wo.readinessBlockers.length) return wo.readinessBlockers.join(', ');
  if (wo.releaseStatus === 'quarantined') return 'Quarantined by QA disposition';
  if (wo.releaseStatus === 'rejected') return 'Rejected by QA';
  return 'Held for QA review';
}

export default function QuarantinePage() {
  const { activeWorkflowId } = useWorkflowContext();
  const { data, isLoading, isError } = useQuery({ queryKey: ['qa-queue'], queryFn: fetchQaWorkOrderQueue });

  const items = (data?.quarantine ?? []).filter((wo) => !activeWorkflowId || wo.workflowId === activeWorkflowId);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Quarantine"
        description="Material held for QA follow-up — BET failures, unverified sterilisation, and disposition holds."
      />

      {isLoading ? (
        <div className="flex h-40 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : isError ? (
        <EmptyState icon={<AlertTriangle className="h-6 w-6" />} title="Quarantine unavailable" description="The quarantine list could not be loaded." />
      ) : items.length ? (
        <div className="rounded-2xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Work order</TableHead>
                <TableHead>Phase</TableHead>
                <TableHead>HET</TableHead>
                <TableHead>Why held</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((wo) => (
                <TableRow key={wo.id}>
                  <TableCell className="font-medium text-foreground">{wo.woNumber || wo.id}</TableCell>
                  <TableCell className="text-muted-foreground">{wo.currentPhaseLabel}</TableCell>
                  <TableCell className="text-muted-foreground">{wo.het?.hetNumber || wo.hetId || '—'}</TableCell>
                  <TableCell className="text-destructive">{holdReason(wo)}</TableCell>
                  <TableCell className="text-right">
                    <Button asChild size="sm" variant="outline">
                      <Link to={`/dashboard/work-orders/${encodeURIComponent(wo.id)}`}>Review</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <EmptyState icon={<ShieldCheck className="h-6 w-6" />} title="Nothing in quarantine" description="No held material for this line." />
      )}
    </div>
  );
}
