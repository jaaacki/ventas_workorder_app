import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Boxes,
  ClipboardList,
  Factory,
  FlaskConical,
  GitBranch,
  History,
  PackageSearch,
  Route,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AdminPanel, EmptyState, MetricCard, PageHeader, StatusPill } from '@/components/tailadmin';
import {
  advanceWorkOrder,
  fetchWorkOrder,
  fetchWorkOrderAuditEvents,
  fetchWorkOrderInventoryTrace,
  finishWorkOrderPhase,
  startWorkOrderPhase,
  type WorkOrderAuditEvent,
  type WorkOrderDetail,
} from '@/lib/work-orders-api';
import { statusTone, workflowLabel } from '@/lib/work-order-ui';
import { WorkOrderWorkspace } from './WorkOrdersPage';

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleString() : '-';
}

function workOrderTitle(workOrder: WorkOrderDetail) {
  return workOrder.woNumber || workOrder.id;
}

function actionLabel(action: string) {
  return action
    .replace(/^work_order\./, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function stateSummary(event: WorkOrderAuditEvent) {
  const previous = event.previousState;
  const next = event.newState;
  if (!previous && next) {
    return `Created at phase ${next.phaseOrder ?? '-'}`;
  }
  if (!previous || !next) return '-';

  const changes = [
    previous.phaseId !== next.phaseId || previous.phaseOrder !== next.phaseOrder
      ? `Phase ${previous.phaseOrder ?? '-'} -> ${next.phaseOrder ?? '-'}`
      : null,
    previous.prodStart !== next.prodStart
      ? `Start ${previous.prodStart ? formatDate(previous.prodStart) : '-'} -> ${next.prodStart ? formatDate(next.prodStart) : '-'}`
      : null,
    previous.prodEnd !== next.prodEnd
      ? `End ${previous.prodEnd ? formatDate(previous.prodEnd) : '-'} -> ${next.prodEnd ? formatDate(next.prodEnd) : '-'}`
      : null,
  ].filter(Boolean);

  return changes.length ? changes.join(' | ') : 'No visible state delta';
}

export default function WorkOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const workOrderQuery = useQuery({
    queryKey: ['work-order', id],
    queryFn: () => fetchWorkOrder(id!),
    enabled: Boolean(id),
  });

  const traceQuery = useQuery({
    queryKey: ['work-order-inventory-trace', id],
    queryFn: () => fetchWorkOrderInventoryTrace(id!),
    enabled: Boolean(id),
  });

  const auditQuery = useQuery({
    queryKey: ['work-order-audit-events', id],
    queryFn: () => fetchWorkOrderAuditEvents(id!),
    enabled: Boolean(id),
  });

  const updateCachedWorkOrder = (updated: WorkOrderDetail) => {
    queryClient.setQueryData(['work-order', updated.id], updated);
    queryClient.invalidateQueries({ queryKey: ['work-orders'] });
    queryClient.invalidateQueries({ queryKey: ['work-order-inventory-trace', updated.id] });
    queryClient.invalidateQueries({ queryKey: ['work-order-audit-events', updated.id] });
  };

  const startMutation = useMutation({
    mutationFn: ({ signatureDataUrl }: { signatureDataUrl: string }) => startWorkOrderPhase(id!, signatureDataUrl),
    onSuccess: (updated) => {
      updateCachedWorkOrder(updated);
      toast.success(`Started ${workOrderTitle(updated)}`);
    },
    onError: (e: AxiosError<{ error?: string }>) =>
      toast.error(e.response?.data?.error || 'Failed to start phase'),
  });

  const finishMutation = useMutation({
    mutationFn: ({ signatureDataUrl }: { signatureDataUrl: string }) => finishWorkOrderPhase(id!, signatureDataUrl),
    onSuccess: (updated) => {
      updateCachedWorkOrder(updated);
      toast.success(`Finished ${workOrderTitle(updated)}`);
    },
    onError: (e: AxiosError<{ error?: string }>) =>
      toast.error(e.response?.data?.error || 'Failed to finish phase'),
  });

  const advanceMutation = useMutation({
    mutationFn: () => advanceWorkOrder(id!),
    onSuccess: (updated) => {
      updateCachedWorkOrder(updated);
      toast.success(`Advanced ${workOrderTitle(updated)}`);
    },
    onError: (e: AxiosError<{ error?: string }>) =>
      toast.error(e.response?.data?.error || 'Failed to advance work order'),
  });

  if (workOrderQuery.isLoading) {
    return (
      <div className="flex min-h-80 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
      </div>
    );
  }

  if (!id || workOrderQuery.isError || !workOrderQuery.data) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Work order"
          description="The requested production run could not be loaded."
          action={
            <Button asChild variant="outline">
              <Link to="/dashboard/work-orders">
                <ArrowLeft className="h-4 w-4" />
                Production board
              </Link>
            </Button>
          }
        />
        <EmptyState icon={<ClipboardList className="h-6 w-6" />} title="Work order not found" description="Open the production board and select an active work order." />
      </div>
    );
  }

  const workOrder = workOrderQuery.data;
  const trace = traceQuery.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title={workOrderTitle(workOrder)}
        description={`${workflowLabel(workOrder)} - ${workOrder.currentPhaseLabel} - ${workOrder.legacyProductionState}`}
        action={
          <>
            <Button asChild variant="outline">
              <Link to="/dashboard/work-orders">
                <ArrowLeft className="h-4 w-4" />
                Board
              </Link>
            </Button>
            <StatusPill tone={statusTone(workOrder.legacyStateBucket)}>
              {workOrder.legacyStateBucket.replace(/^\d+\.\s*/, '')}
            </StatusPill>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={<Factory className="h-6 w-6" />} label="Current phase" value={workOrder.currentPhaseLabel} detail={`Order ${workOrder.phaseOrder ?? '-'}`} />
        <MetricCard icon={<Boxes className="h-6 w-6" />} label="HET / batch" value={workOrder.het?.hetNumber || workOrder.hetId || 'Unassigned'} />
        <MetricCard icon={<FlaskConical className="h-6 w-6" />} label="Sterilisation/BET" value={workOrder.counts.sterilisationRecords} />
        <MetricCard icon={<Route className="h-6 w-6" />} label="Lifecycle" value={workOrder.lifecycleState} detail={workOrder.operationalStatus} />
      </div>

      <AdminPanel title="Production execution" description="Controlled phase actions, readiness gates, evidence counts, and workflow timeline for this production run.">
        <WorkOrderWorkspace
          workOrder={workOrder}
          onAdvance={() => advanceMutation.mutate()}
          onStart={(_workOrderId, signatureDataUrl) => startMutation.mutate({ signatureDataUrl })}
          onFinish={(_workOrderId, signatureDataUrl) => finishMutation.mutate({ signatureDataUrl })}
          advancing={advanceMutation.isPending}
          starting={startMutation.isPending}
          finishing={finishMutation.isPending}
        />
      </AdminPanel>

      <AdminPanel title="Audit trail" description="Controlled lifecycle events recorded for this production run.">
        {auditQuery.isLoading ? (
          <div className="flex h-32 items-center justify-center">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
          </div>
        ) : auditQuery.isError || !auditQuery.data ? (
          <EmptyState icon={<History className="h-6 w-6" />} title="Audit unavailable" description="Audit events could not be loaded for this work order." />
        ) : auditQuery.data.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>State change</TableHead>
                <TableHead>Source</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {auditQuery.data.map((event) => (
                <TableRow key={event.id}>
                  <TableCell>{formatDate(event.createdAt)}</TableCell>
                  <TableCell>{actionLabel(event.action)}</TableCell>
                  <TableCell>{event.actorId || '-'}</TableCell>
                  <TableCell>{stateSummary(event)}</TableCell>
                  <TableCell>{event.source}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <EmptyState icon={<History className="h-6 w-6" />} title="No audit events" description="No controlled lifecycle events have been recorded for this work order yet." />
        )}
      </AdminPanel>

      <AdminPanel title="Inventory trace" description="Lots, movements, genealogy, and HET/work-order links associated with this production run.">
        {traceQuery.isLoading ? (
          <div className="flex h-32 items-center justify-center">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
          </div>
        ) : traceQuery.isError || !trace ? (
          <EmptyState icon={<PackageSearch className="h-6 w-6" />} title="Trace unavailable" description="Inventory trace data could not be loaded for this work order." />
        ) : (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <MetricCard icon={<PackageSearch className="h-5 w-5" />} label="Lots" value={trace.lots.length} />
              <MetricCard icon={<GitBranch className="h-5 w-5" />} label="Genealogy" value={trace.genealogy.length} />
              <MetricCard icon={<Boxes className="h-5 w-5" />} label="Transactions" value={trace.transactions.length} />
              <MetricCard icon={<ClipboardList className="h-5 w-5" />} label="Consumptions" value={trace.consumptions.length} />
              <MetricCard icon={<Factory className="h-5 w-5" />} label="Linked HETs" value={trace.hets.length} />
            </div>

            <div>
              <div className="mb-2 text-sm font-semibold text-gray-800 dark:text-white/90">Lots</div>
              {trace.lots.length ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Lot</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Location</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {trace.lots.slice(0, 8).map((lot) => (
                      <TableRow key={lot.id}>
                        <TableCell>{lot.lotNumber || lot.id}</TableCell>
                        <TableCell>{lot.inventorySku?.sku || lot.inventorySku?.description || lot.inventorySkuId || '-'}</TableCell>
                        <TableCell>{lot.inventoryType}</TableCell>
                        <TableCell>{lot.status}</TableCell>
                        <TableCell>{lot.currentLocation?.name || lot.currentLocationId || '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <EmptyState icon={<PackageSearch className="h-6 w-6" />} title="No lots linked" description="No inventory lots are currently linked to this work order trace." />
              )}
            </div>

            <div>
              <div className="mb-2 text-sm font-semibold text-gray-800 dark:text-white/90">Recent movements</div>
              {trace.transactions.length ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Quantity</TableHead>
                      <TableHead>Occurred</TableHead>
                      <TableHead>Actor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {trace.transactions.slice(0, 8).map((txn) => (
                      <TableRow key={txn.id}>
                        <TableCell>{txn.transactionType}</TableCell>
                        <TableCell>{txn.reason || txn.legacyRefNumber || '-'}</TableCell>
                        <TableCell>{txn.quantity ?? '-'} {txn.uom || ''}</TableCell>
                        <TableCell>{formatDate(txn.occurredAt)}</TableCell>
                        <TableCell>{txn.actor || '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <EmptyState icon={<Boxes className="h-6 w-6" />} title="No movements linked" description="No inventory transactions are currently linked to this work order trace." />
              )}
            </div>
          </div>
        )}
      </AdminPanel>
    </div>
  );
}
