import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchWorkOrders, type WorkOrderSummary } from '@/lib/work-orders-api';
import { useWorkflowContext } from '@/store/workflowContext';
import { humanStatus, toneToBadgeVariant } from '@/lib/format';
import { PageHeader, EmptyState } from '@/components/tailadmin';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ListChecks } from 'lucide-react';

const ACTIONABLE: string[] = ['NotStarted', 'InProgress', 'ReadyToAdvance'];

function nextActionLabel(wo: WorkOrderSummary): string {
  switch (wo.lifecycleState) {
    case 'NotStarted':
      return `Start ${wo.currentPhaseLabel}`;
    case 'InProgress':
      return `Finish ${wo.currentPhaseLabel}`;
    case 'ReadyToAdvance':
      return `Advance from ${wo.currentPhaseLabel}`;
    default:
      return wo.currentPhaseLabel;
  }
}

export default function MyQueuePage() {
  const { activeWorkflowId } = useWorkflowContext();
  const [filter, setFilter] = useState('');
  const { data: workOrders = [], isLoading } = useQuery({ queryKey: ['work-orders'], queryFn: fetchWorkOrders });

  const rows = useMemo(() => {
    const query = filter.trim().toLowerCase();
    return workOrders.filter((wo) => {
      if (activeWorkflowId && wo.workflowId !== activeWorkflowId) return false;
      if (wo.operationalStatus === 'Blocked') return false;
      if (!ACTIONABLE.includes(wo.lifecycleState)) return false;
      if (!query) return true;
      return [wo.woNumber, wo.currentPhaseLabel, wo.het?.hetNumber].filter(Boolean).join(' ').toLowerCase().includes(query);
    });
  }, [workOrders, activeWorkflowId, filter]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="My queue"
        description="Work orders on the active line that are ready for your next action."
        action={
          <Input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Filter by WO, phase, HET…"
            className="w-64"
          />
        }
      />

      {isLoading ? (
        <div className="flex h-40 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : rows.length ? (
        <div className="rounded-2xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Next action</TableHead>
                <TableHead>Work order</TableHead>
                <TableHead>Phase</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Open</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((wo) => {
                const status = humanStatus(wo.lifecycleState);
                return (
                  <TableRow key={wo.id}>
                    <TableCell className="font-medium text-foreground">{nextActionLabel(wo)}</TableCell>
                    <TableCell>{wo.woNumber || wo.id}</TableCell>
                    <TableCell className="text-muted-foreground">{wo.currentPhaseLabel}</TableCell>
                    <TableCell>
                      <Badge variant={toneToBadgeVariant(status.tone)}>{status.label}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild size="sm" variant="outline">
                        <Link to={`/dashboard/work-orders/${encodeURIComponent(wo.id)}`}>Start</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      ) : (
        <EmptyState icon={<ListChecks className="h-6 w-6" />} title="Nothing in your queue" description="No actionable work orders on this line right now." />
      )}
    </div>
  );
}
