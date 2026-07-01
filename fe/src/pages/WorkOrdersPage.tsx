import { useMemo, useState, type FormEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import type { AxiosError } from 'axios';
import { fetchWorkflows } from '@/lib/workflows-api';
import {
  fetchWorkOrders,
  createWorkOrder,
  startWorkOrderPhase,
  finishWorkOrderPhase,
  advanceWorkOrder,
  type WorkOrderSummary,
} from '@/lib/work-orders-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AdminPanel, EmptyState, MetricCard, PageHeader, StatusPill } from '@/components/tailadmin';
import { toast } from 'sonner';
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  CheckCircle2,
  ClipboardList,
  Factory,
  FlaskConical,
  PackageCheck,
  Plus,
  ShieldCheck,
} from 'lucide-react';

function workflowLabel(workOrder: WorkOrderSummary) {
  if (workOrder.workflow) return `${workOrder.workflow.name} (${workOrder.workflow.code})`;
  return workOrder.workflowId ? `Missing workflow (${workOrder.workflowId})` : 'No workflow assigned';
}

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleString() : '-';
}

function statusTone(status: string): 'brand' | 'success' | 'warning' | 'error' | 'neutral' {
  if (status.startsWith('2. ')) return 'success';
  if (status.startsWith('3. ')) return 'warning';
  if (status.startsWith('4. ')) return 'brand';
  if (status.startsWith('5. ')) return 'neutral';
  if (status === 'ReadyToAdvance') return 'success';
  if (status === 'ReleasePending') return 'brand';
  if (status === 'Blocked') return 'warning';
  return 'neutral';
}

const LEGACY_KANBAN_COLUMNS = [
  '1. In Progress',
  '2. Next Phase',
  '3. In Quarantine',
  '4. Finished Goods',
  '5. WO Completed',
] as const;

function groupByLegacyState(workOrders: WorkOrderSummary[]) {
  const grouped = new Map<string, WorkOrderSummary[]>(LEGACY_KANBAN_COLUMNS.map((column) => [column, []]));
  for (const workOrder of workOrders) {
    const bucket = workOrder.legacyStateBucket || '1. In Progress';
    if (!grouped.has(bucket)) grouped.set(bucket, []);
    grouped.get(bucket)?.push(workOrder);
  }

  return Array.from(grouped.entries());
}

function WorkOrderCard({
  workOrder,
  selected,
  onSelect,
}: {
  workOrder: WorkOrderSummary;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-lg border p-3 text-left transition ${
        selected
          ? 'border-brand-300 bg-brand-50 shadow-theme-xs dark:border-brand-500/50 dark:bg-brand-500/10'
          : 'border-gray-200 bg-white hover:border-brand-200 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-brand-500/40'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-gray-800 dark:text-white/90">
            {workOrder.woNumber || workOrder.id}
          </div>
          <div className="mt-1 truncate text-xs text-gray-500 dark:text-gray-400">{workflowLabel(workOrder)}</div>
        </div>
        <StatusPill tone={statusTone(workOrder.legacyStateBucket)}>
          {workOrder.legacyStateBucket.replace(/^\d+\.\s*/, '')}
        </StatusPill>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-gray-500 dark:text-gray-400">
        <span>{workOrder.het?.hetNumber || workOrder.hetId || 'No HET'}</span>
        <span>Phase {workOrder.phaseOrder ?? '-'}/{workOrder.phaseOrderCurrent ?? '-'}</span>
        <span>{workOrder.counts?.serials ?? 0}/{workOrder.serialRequiredCount ?? 0} serials</span>
      </div>

      {workOrder.missingAdvanceRequirements?.length > 0 && (
        <div className="mt-3 flex items-start gap-2 rounded-md bg-warning-50 px-2.5 py-2 text-xs text-warning-600 dark:bg-warning-500/10 dark:text-warning-500">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="line-clamp-2">{workOrder.missingAdvanceRequirements.join(', ')}</span>
        </div>
      )}
    </button>
  );
}

function DetailPanel({
  workOrder,
  onAdvance,
  onStart,
  onFinish,
  advancing,
  starting,
  finishing,
}: {
  workOrder: WorkOrderSummary | null;
  onAdvance: (id: string) => void;
  onStart: (id: string) => void;
  onFinish: (id: string) => void;
  advancing: boolean;
  starting: boolean;
  finishing: boolean;
}) {
  if (!workOrder) {
    return (
      <AdminPanel title="Work order detail">
        <EmptyState
          icon={<ClipboardList className="h-6 w-6" />}
          title="Select a work order"
          description="Open a production run to inspect blockers, phase state, HET, serials, equipment, and QA gates."
        />
      </AdminPanel>
    );
  }

  const canAdvance = workOrder.canAdvanceLegacy;
  const canStart = workOrder.lifecycleState === 'NotStarted' && workOrder.operationalStatus !== 'Blocked';
  const canFinish = workOrder.lifecycleState === 'InProgress';
  const actionPending = advancing || starting || finishing;

  return (
    <AdminPanel
      title={workOrder.woNumber || workOrder.id}
      description={`${workflowLabel(workOrder)} · ${workOrder.currentPhaseLabel} · ${workOrder.legacyProductionState}`}
      action={<StatusPill tone={statusTone(workOrder.legacyStateBucket)}>{workOrder.legacyStateBucket.replace(/^\d+\.\s*/, '')}</StatusPill>}
    >
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
            <div className="text-xs text-gray-500">HET / batch</div>
            <div className="mt-1 text-sm font-medium text-gray-800 dark:text-white/90">
              {workOrder.het?.hetNumber || workOrder.hetId || 'Not assigned'}
            </div>
            <div className="mt-1 text-xs text-gray-500">{workOrder.het?.clinicName || 'No clinic recorded'}</div>
          </div>
          <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
            <div className="text-xs text-gray-500">Batch record</div>
            <div className="mt-1 text-sm font-medium text-gray-800 dark:text-white/90">
              {workOrder.manufacturer?.manuNumber || 'Not generated'}
            </div>
            <div className="mt-1 text-xs text-gray-500">{workOrder.manufacturer?.manuName || 'Manufacturer pending'}</div>
          </div>
          <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
            <div className="text-xs text-gray-500">Phase progress</div>
            <div className="mt-1 text-sm font-medium text-gray-800 dark:text-white/90">
              {workOrder.phaseOrder ?? '-'} / {workOrder.phaseOrderCurrent ?? '-'}
            </div>
            <div className="mt-1 text-xs text-gray-500">{workOrder.legacyProductionState}</div>
          </div>
          <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
            <div className="text-xs text-gray-500">Production timestamps</div>
            <div className="mt-1 text-sm font-medium text-gray-800 dark:text-white/90">{formatDate(workOrder.prodStart)}</div>
            <div className="mt-1 text-xs text-gray-500">Finished {formatDate(workOrder.prodEnd)}</div>
          </div>
        </div>

        <div>
          <div className="mb-2 text-sm font-semibold text-gray-800 dark:text-white/90">Phase timeline</div>
          <div className="grid gap-2 sm:grid-cols-5">
            {workOrder.phaseTimeline?.map((phase) => (
              <div
                key={phase.id}
                className={`rounded-lg border px-3 py-2 text-sm ${
                  phase.state === 'complete'
                    ? 'border-success-500/30 bg-success-50 text-success-600 dark:border-success-500/30 dark:bg-success-500/10 dark:text-success-500'
                    : phase.state === 'current'
                      ? 'border-brand-300 bg-brand-50 text-brand-600 dark:border-brand-500/40 dark:bg-brand-500/10 dark:text-brand-400'
                      : 'border-gray-200 bg-gray-50 text-gray-500 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400'
                }`}
              >
                <div className="truncate font-medium">{phase.phaseName || phase.phaseShort || `Phase ${phase.sortOrder + 1}`}</div>
                <div className="mt-1 text-xs capitalize opacity-80">{phase.state}</div>
              </div>
            ))}
          </div>
        </div>

        {workOrder.missingAdvanceRequirements?.length > 0 ? (
          <div className="rounded-lg border border-warning-500/30 bg-warning-50 p-3 dark:border-warning-500/30 dark:bg-warning-500/10">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-warning-600 dark:text-warning-500">
              <AlertTriangle className="h-4 w-4" />
              Next phase requirements
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {workOrder.advanceRequirements.map((requirement) => (
                <div
                  key={requirement.key}
                  className="flex items-center justify-between gap-3 rounded-md bg-white px-2 py-1.5 text-xs dark:bg-gray-950"
                >
                  <span className={requirement.met ? 'text-gray-600 dark:text-gray-300' : 'text-warning-600 dark:text-warning-500'}>
                    {requirement.label}
                  </span>
                  <StatusPill tone={requirement.met ? 'success' : requirement.parityGap ? 'error' : 'warning'}>
                    {requirement.met ? 'OK' : requirement.parityGap ? 'Gap' : 'Missing'}
                  </StatusPill>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-lg border border-success-500/30 bg-success-50 p-3 text-sm text-success-600 dark:border-success-500/30 dark:bg-success-500/10 dark:text-success-500">
            <CheckCircle2 className="h-4 w-4" />
            AppSheet next-phase requirements are satisfied.
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          <MetricCard icon={<Boxes className="h-5 w-5" />} label="Serial records" value={`${workOrder.counts?.serials ?? 0}/${workOrder.serialRequiredCount ?? 0}`} />
          <MetricCard icon={<Factory className="h-5 w-5" />} label="Equipment records" value={workOrder.counts?.equipment ?? 0} />
          <MetricCard icon={<FlaskConical className="h-5 w-5" />} label="Sterilisation/BET" value={workOrder.counts?.sterilisationRecords ?? 0} />
        </div>

        <div className="flex justify-end">
          {!canAdvance && workOrder.legacyStateBucket === '2. Next Phase' ? (
            <Button disabled>Next phase blocked</Button>
          ) : canStart ? (
            <Button onClick={() => onStart(workOrder.id)} disabled={actionPending}>
              Start phase
              <ArrowRight className="h-4 w-4" />
            </Button>
          ) : canFinish ? (
            <Button onClick={() => onFinish(workOrder.id)} disabled={actionPending}>
              Finish phase
              <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={() => onAdvance(workOrder.id)} disabled={actionPending || !canAdvance}>
              Advance phase
              <ArrowRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </AdminPanel>
  );
}

export default function WorkOrdersPage() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: workOrders = [], isLoading } = useQuery({
    queryKey: ['work-orders'],
    queryFn: fetchWorkOrders,
  });
  const { data: workflows } = useQuery({
    queryKey: ['workflows'],
    queryFn: () => fetchWorkflows(),
  });

  const [workflowId, setWorkflowId] = useState('');
  const [hetId, setHetId] = useState('');
  const selectedId = searchParams.get('wo');

  const selectWorkOrder = (id: string) => {
    setSearchParams({ wo: id });
  };

  const selectedWorkOrder = useMemo(
    () => workOrders.find((wo) => wo.id === selectedId) ?? workOrders[0] ?? null,
    [selectedId, workOrders],
  );

  const grouped = useMemo(() => groupByLegacyState(workOrders), [workOrders]);
  const nextPhaseCount = workOrders.filter((wo) => wo.legacyStateBucket === '2. Next Phase').length;
  const quarantineCount = workOrders.filter((wo) => wo.legacyStateBucket === '3. In Quarantine').length;
  const completedCount = workOrders.filter((wo) => wo.legacyStateBucket === '5. WO Completed').length;

  const createMutation = useMutation({
    mutationFn: createWorkOrder,
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['work-orders'] });
      toast.success('Work order created');
      setWorkflowId('');
      setHetId('');
      selectWorkOrder(created.id);
    },
    onError: (e: AxiosError<{ error?: string }>) =>
      toast.error(e.response?.data?.error || 'Failed to create work order'),
  });

  const startMutation = useMutation({
    mutationFn: startWorkOrderPhase,
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['work-orders'] });
      toast.success(`Started ${updated.woNumber || updated.id}`);
      selectWorkOrder(updated.id);
    },
    onError: (e: AxiosError<{ error?: string }>) =>
      toast.error(e.response?.data?.error || 'Failed to start phase'),
  });

  const finishMutation = useMutation({
    mutationFn: finishWorkOrderPhase,
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['work-orders'] });
      toast.success(`Finished ${updated.woNumber || updated.id}`);
      selectWorkOrder(updated.id);
    },
    onError: (e: AxiosError<{ error?: string }>) =>
      toast.error(e.response?.data?.error || 'Failed to finish phase'),
  });

  const advanceMutation = useMutation({
    mutationFn: advanceWorkOrder,
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['work-orders'] });
      toast.success(`Advanced ${updated.woNumber || updated.id}`);
      selectWorkOrder(updated.id);
    },
    onError: (e: AxiosError<{ error?: string }>) =>
      toast.error(e.response?.data?.error || 'Failed to advance work order'),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!workflowId.trim()) return;
    const payload: { workflowId: string; hetId?: string } = { workflowId: workflowId.trim() };
    if (hetId.trim()) payload.hetId = hetId.trim();
    createMutation.mutate(payload);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Production"
        description="Run factory-floor work, QA gates, and release readiness from the work-order board."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={<ClipboardList className="h-6 w-6" />} label="Work orders" value={workOrders.length} />
        <MetricCard icon={<ArrowRight className="h-6 w-6" />} label="Next phase" value={nextPhaseCount} detail={<StatusPill tone="success">Review</StatusPill>} />
        <MetricCard icon={<ShieldCheck className="h-6 w-6" />} label="In quarantine" value={quarantineCount} />
        <MetricCard icon={<PackageCheck className="h-6 w-6" />} label="Completed" value={completedCount} />
      </div>

      <AdminPanel
        title="Start production run"
        description="Create a work order from a product workflow and assign the HET when it is known."
        action={
          <span className="hidden items-center gap-2 text-sm text-gray-500 sm:flex">
            <Plus className="h-4 w-4" />
            New run
          </span>
        }
      >
        <form className="grid gap-4 lg:grid-cols-[1fr_1fr_auto] lg:items-end" onSubmit={submit}>
          <div className="flex-1 space-y-2">
            <Label htmlFor="workflow">Product workflow</Label>
            <select
              id="workflow"
              className="flex h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs transition-colors focus-visible:border-brand-300 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
              value={workflowId}
              onChange={(e) => setWorkflowId(e.target.value)}
            >
              <option value="">Select product workflow</option>
              {workflows?.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} ({w.code})
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1 space-y-2">
            <Label htmlFor="hetId">HET ID</Label>
            <Input id="hetId" value={hetId} onChange={(e) => setHetId(e.target.value)} placeholder="e.g. HET-0001" />
          </div>
          <Button type="submit" disabled={createMutation.isPending || !workflowId.trim()}>
            <Plus className="h-4 w-4" />
            Start run
          </Button>
        </form>
      </AdminPanel>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(420px,0.8fr)]">
        <AdminPanel title="Production kanban" description="Grouped by the legacy AppSheet production state derived from HET/batch phase progress.">
          {isLoading ? (
            <div className="flex h-40 items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
            </div>
          ) : !workOrders.length ? (
            <EmptyState icon={<Factory className="h-6 w-6" />} title="No active production runs" description="Start a production run above." />
          ) : (
            <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
              {grouped.map(([phase, items]) => (
                <section key={phase} className="min-h-44 rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-white/[0.03]">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="truncate text-sm font-semibold text-gray-800 dark:text-white/90">{phase.replace(/^\d+\.\s*/, '')}</div>
                    <StatusPill tone="neutral">{items.length}</StatusPill>
                  </div>
                  <div className="space-y-2">
                    {items.length ? (
                      items.map((wo) => (
                        <WorkOrderCard
                          key={wo.id}
                          workOrder={wo}
                          selected={selectedWorkOrder?.id === wo.id}
                          onSelect={() => selectWorkOrder(wo.id)}
                        />
                      ))
                    ) : (
                      <div className="rounded-lg border border-dashed border-gray-200 p-4 text-center text-sm text-gray-400 dark:border-gray-800">
                        No work waiting here
                      </div>
                    )}
                  </div>
                </section>
              ))}
            </div>
          )}
        </AdminPanel>

        <DetailPanel
          workOrder={selectedWorkOrder}
          onAdvance={(id) => advanceMutation.mutate(id)}
          onStart={(id) => startMutation.mutate(id)}
          onFinish={(id) => finishMutation.mutate(id)}
          advancing={advanceMutation.isPending}
          starting={startMutation.isPending}
          finishing={finishMutation.isPending}
        />
      </div>
    </div>
  );
}
