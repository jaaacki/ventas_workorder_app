import { useMemo, useRef, useState, type PointerEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useSearchParams } from 'react-router-dom';
import type { AxiosError } from 'axios';
import { fetchWorkflows } from '@/lib/workflows-api';
import { fetchHets, type HetSummary } from '@/lib/hets-api';
import { statusTone, workflowLabel, unitsLabel } from '@/lib/work-order-ui';
import { useWorkflowContext } from '@/store/workflowContext';
import { humanStatus, toneToBadgeVariant } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import {
  fetchWorkOrders,
  createWorkOrder,
  startWorkOrderPhase,
  finishWorkOrderPhase,
  advanceWorkOrder,
  type WorkOrderSummary,
} from '@/lib/work-orders-api';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { EmptyState, MetricCard, PageHeader, StatusPill } from '@/components/tailadmin';
import { toast } from 'sonner';
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  CheckCircle2,
  ClipboardList,
  Factory,
  FileSignature,
  FlaskConical,
  Maximize2,
  Plus,
  Signature,
  X,
} from 'lucide-react';

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleString() : '-';
}

interface PhaseColumn {
  id: string;
  label: string;
  order: number;
}

// Board columns = the workflow's phases in recipe order. Any work order in a line carries
// the full ordered phaseTimeline, so we derive the columns from the richest timeline present.
function buildPhaseColumns(workOrders: WorkOrderSummary[]): PhaseColumn[] {
  let template: WorkOrderSummary['phaseTimeline'] = [];
  for (const wo of workOrders) {
    if ((wo.phaseTimeline?.length ?? 0) > template.length) template = wo.phaseTimeline;
  }
  if (template.length) {
    return [...template]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((phase) => ({
        id: phase.id,
        label: phase.phaseShort || phase.phaseName || `Phase ${phase.sortOrder + 1}`,
        order: phase.sortOrder,
      }));
  }
  // Fallback: distinct current phases when no timeline is available.
  const seen = new Map<string, PhaseColumn>();
  for (const wo of workOrders) {
    const id = wo.phase?.id || `order-${wo.phaseOrder ?? 0}`;
    if (!seen.has(id)) {
      seen.set(id, {
        id,
        label: wo.phase?.phaseShort || wo.phaseShort || `Phase ${wo.phaseOrder ?? '?'}`,
        order: wo.phaseOrder ?? 0,
      });
    }
  }
  return Array.from(seen.values()).sort((a, b) => a.order - b.order);
}

function workOrderColumnId(workOrder: WorkOrderSummary): string {
  return workOrder.phase?.id || `order-${workOrder.phaseOrder ?? 0}`;
}

function groupByPhase(workOrders: WorkOrderSummary[], columns: PhaseColumn[]) {
  const grouped = new Map<string, WorkOrderSummary[]>(columns.map((column) => [column.id, []]));
  for (const workOrder of workOrders) {
    const key = workOrderColumnId(workOrder);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)?.push(workOrder);
  }
  return grouped;
}

function hetLabel(het: HetSummary) {
  return [het.hetNumber || het.id, het.clinicName, het.quantity != null ? `${het.quantity} unit(s)` : null]
    .filter(Boolean)
    .join(' - ');
}


function WorkOrderCard({
  workOrder,
  selected,
  onOpen,
}: {
  workOrder: WorkOrderSummary;
  selected: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
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
          <div className="mt-1 truncate text-xs text-muted-foreground">{workflowLabel(workOrder)}</div>
        </div>
        {(() => {
          const status = humanStatus(workOrder.operationalStatus);
          return <Badge variant={toneToBadgeVariant(status.tone)}>{status.label}</Badge>;
        })()}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-muted-foreground">
        <span className="truncate">{workOrder.het?.hetNumber || workOrder.hetId || 'No HET'}</span>
        <span>{unitsLabel(workOrder.het?.quantity) ?? '—'}</span>
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

function SignaturePad({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);

  const writePoint = (event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const x = (event.clientX - rect.left) * (canvas.width / rect.width);
    const y = (event.clientY - rect.top) * (canvas.height / rect.height);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#111827';
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const startDrawing = (event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) * (canvas.width / rect.width);
    const y = (event.clientY - rect.top) * (canvas.height / rect.height);
    drawingRef.current = true;
    canvas.setPointerCapture(event.pointerId);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const finishDrawing = () => {
    const canvas = canvasRef.current;
    if (!canvas || !drawingRef.current) return;
    drawingRef.current = false;
    onChange(canvas.toDataURL('image/png'));
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    onChange('');
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-950">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-white/90">
          <Signature className="h-4 w-4" />
          {label}
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={clear} disabled={!value}>
          <X className="h-3.5 w-3.5" />
          Clear
        </Button>
      </div>
      <canvas
        ref={canvasRef}
        width={720}
        height={180}
        className="h-36 w-full touch-none rounded-md border border-dashed border-gray-300 bg-gray-50 dark:border-gray-700 dark:bg-gray-900"
        onPointerDown={startDrawing}
        onPointerMove={(event) => drawingRef.current && writePoint(event)}
        onPointerUp={finishDrawing}
        onPointerCancel={finishDrawing}
        aria-label={label}
      />
      <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
        {value ? 'Signature captured for this sign-off.' : 'Sign in the box before submitting a controlled start or finish action.'}
      </div>
    </div>
  );
}

const createWorkOrderSchema = z
  .object({
    workflowId: z.string().min(1, 'Select a product workflow'),
    hetId: z.string().min(1, 'Select a HET record'),
    startNow: z.boolean(),
    signatureDataUrl: z.string(),
  })
  // A controlled immediate start requires a captured sign-off signature.
  .refine((values) => !values.startNow || values.signatureDataUrl.length > 0, {
    message: 'Capture a start sign-off signature before starting the phase',
    path: ['signatureDataUrl'],
  });

type CreateWorkOrderValues = z.infer<typeof createWorkOrderSchema>;

function CreateWorkOrderForm({
  workflows,
  hets,
  creating,
  onCreate,
}: {
  workflows: Array<{ id: string; name: string; code: string; description: string | null }>;
  hets: HetSummary[];
  creating: boolean;
  onCreate: (payload: { workflowId: string; hetId: string; startNow: boolean; signatureDataUrl?: string }) => void;
}) {
  const form = useForm<CreateWorkOrderValues>({
    resolver: zodResolver(createWorkOrderSchema),
    defaultValues: { workflowId: '', hetId: '', startNow: true, signatureDataUrl: '' },
  });
  const { control, register, handleSubmit, watch, formState: { errors } } = form;
  const workflowId = watch('workflowId');
  const hetId = watch('hetId');
  const startNow = watch('startNow');
  const selectedWorkflow = workflows.find((workflow) => workflow.id === workflowId);
  const selectedHet = hets.find((het) => het.id === hetId);

  const submit = handleSubmit((values) => {
    onCreate({
      workflowId: values.workflowId,
      hetId: values.hetId,
      startNow: values.startNow,
      signatureDataUrl: values.startNow ? values.signatureDataUrl : undefined,
    });
  });

  return (
    <form className="space-y-6" onSubmit={submit}>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="create-workflow">Product workflow</Label>
          <select
            id="create-workflow"
            className="flex h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs transition-colors focus-visible:border-brand-300 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
            {...register('workflowId')}
          >
            <option value="">Select product workflow</option>
            {workflows.map((workflow) => (
              <option key={workflow.id} value={workflow.id}>
                {workflow.name} ({workflow.code})
              </option>
            ))}
          </select>
          {errors.workflowId && <p className="text-sm text-error-500">{errors.workflowId.message}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="create-het">HET record</Label>
          <select
            id="create-het"
            className="flex h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs transition-colors focus-visible:border-brand-300 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
            {...register('hetId')}
          >
            <option value="">Select HET</option>
            {hets.map((het) => (
              <option key={het.id} value={het.id}>
                {hetLabel(het)}
              </option>
            ))}
          </select>
          {errors.hetId && <p className="text-sm text-error-500">{errors.hetId.message}</p>}
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
          <div className="text-xs text-gray-500">Selected workflow</div>
          <div className="mt-1 text-sm font-semibold text-gray-800 dark:text-white/90">
            {selectedWorkflow ? `${selectedWorkflow.name} (${selectedWorkflow.code})` : 'No workflow selected'}
          </div>
          <div className="mt-1 text-xs text-gray-500">{selectedWorkflow?.description || 'Workflow determines the phase route.'}</div>
        </div>
        <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
          <div className="text-xs text-gray-500">Selected HET</div>
          <div className="mt-1 text-sm font-semibold text-gray-800 dark:text-white/90">
            {selectedHet ? selectedHet.hetNumber || selectedHet.id : 'No HET selected'}
          </div>
          <div className="mt-1 text-xs text-gray-500">{selectedHet?.clinicName || 'Select from the HET register.'}</div>
        </div>
      </div>

      <label className="flex items-center gap-3 rounded-lg border border-gray-200 p-3 text-sm text-gray-700 dark:border-gray-800 dark:text-gray-300">
        <input
          type="checkbox"
          {...register('startNow')}
          className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500"
        />
        Start first phase immediately after creation
      </label>

      {startNow && (
        <div className="space-y-1">
          <Controller
            control={control}
            name="signatureDataUrl"
            render={({ field }) => <SignaturePad label="Start sign-off" value={field.value} onChange={field.onChange} />}
          />
          {errors.signatureDataUrl && <p className="text-sm text-error-500">{errors.signatureDataUrl.message}</p>}
        </div>
      )}

      <SheetFooter className="border-t border-gray-100 px-0 pb-0 dark:border-gray-800">
        <Button type="submit" disabled={creating}>
          <FileSignature className="h-4 w-4" />
          {startNow ? 'Create and start phase' : 'Create work order'}
        </Button>
      </SheetFooter>
    </form>
  );
}

export function WorkOrderWorkspace({
  workOrder,
  onAdvance,
  onStart,
  onFinish,
  advancing,
  starting,
  finishing,
}: {
  workOrder: WorkOrderSummary;
  onAdvance: (id: string) => void;
  onStart: (id: string, signatureDataUrl: string) => void;
  onFinish: (id: string, signatureDataUrl: string) => void;
  advancing: boolean;
  starting: boolean;
  finishing: boolean;
}) {
  const [startSignature, setStartSignature] = useState('');
  const [finishSignature, setFinishSignature] = useState('');
  const canAdvance = workOrder.canAdvanceLegacy;
  const canStart = workOrder.lifecycleState === 'NotStarted' && workOrder.operationalStatus !== 'Blocked';
  const canFinish = workOrder.lifecycleState === 'InProgress';
  const actionPending = advancing || starting || finishing;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 lg:grid-cols-4">
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
        <div className="grid gap-2 md:grid-cols-5">
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

      <div className="grid gap-3 sm:grid-cols-3">
        <MetricCard icon={<Boxes className="h-5 w-5" />} label="Serial records" value={`${workOrder.counts?.serials ?? 0}/${workOrder.serialRequiredCount ?? 0}`} />
        <MetricCard icon={<Factory className="h-5 w-5" />} label="Equipment records" value={workOrder.counts?.equipment ?? 0} />
        <MetricCard icon={<FlaskConical className="h-5 w-5" />} label="Sterilisation/BET" value={workOrder.counts?.sterilisationRecords ?? 0} />
      </div>

      {workOrder.missingAdvanceRequirements?.length > 0 ? (
        <div className="rounded-lg border border-warning-500/30 bg-warning-50 p-3 dark:border-warning-500/30 dark:bg-warning-500/10">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-warning-600 dark:text-warning-500">
            <AlertTriangle className="h-4 w-4" />
            Next phase requirements
          </div>
          <div className="grid gap-2 md:grid-cols-2">
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

      {canStart && <SignaturePad label="Start sign-off" value={startSignature} onChange={setStartSignature} />}
      {canFinish && <SignaturePad label="Finish sign-off" value={finishSignature} onChange={setFinishSignature} />}

      <SheetFooter className="border-t border-gray-100 px-0 pb-0 dark:border-gray-800">
        {!canAdvance && workOrder.legacyStateBucket === '2. Next Phase' ? (
          <Button disabled>Next phase blocked</Button>
        ) : canStart ? (
          <Button onClick={() => onStart(workOrder.id, startSignature)} disabled={actionPending || !startSignature}>
            <FileSignature className="h-4 w-4" />
            Start phase
          </Button>
        ) : canFinish ? (
          <Button onClick={() => onFinish(workOrder.id, finishSignature)} disabled={actionPending || !finishSignature}>
            <FileSignature className="h-4 w-4" />
            Finish phase
          </Button>
        ) : (
          <Button onClick={() => onAdvance(workOrder.id)} disabled={actionPending || !canAdvance}>
            Advance phase
            <ArrowRight className="h-4 w-4" />
          </Button>
        )}
      </SheetFooter>
    </div>
  );
}

export default function WorkOrdersPage() {
  const queryClient = useQueryClient();
  const { activeWorkflowId } = useWorkflowContext();
  const [allLines, setAllLines] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get('wo');
  const [workspaceMode, setWorkspaceMode] = useState<'create' | 'detail' | null>(selectedId ? 'detail' : null);
  const activeWorkspaceMode = workspaceMode ?? (selectedId ? 'detail' : null);

  const { data: workOrders = [], isLoading } = useQuery({
    queryKey: ['work-orders'],
    queryFn: fetchWorkOrders,
  });
  const { data: workflows = [] } = useQuery({
    queryKey: ['workflows'],
    queryFn: () => fetchWorkflows(true),
  });
  const { data: hets = [] } = useQuery({
    queryKey: ['hets'],
    queryFn: fetchHets,
  });

  const scopedWorkOrders = useMemo(
    () => (allLines || !activeWorkflowId ? workOrders : workOrders.filter((wo) => wo.workflowId === activeWorkflowId)),
    [workOrders, allLines, activeWorkflowId],
  );
  const selectedWorkOrder = useMemo(
    () => workOrders.find((wo) => wo.id === selectedId) ?? null,
    [selectedId, workOrders],
  );
  const phaseColumns = useMemo(() => {
    const base = buildPhaseColumns(scopedWorkOrders);
    const known = new Set(base.map((column) => column.id));
    // Append a column for any work order whose current phase isn't in the template
    // (unphased/legacy WOs, or a foreign workflow in "All lines") so none are dropped.
    const extras: PhaseColumn[] = [];
    for (const wo of scopedWorkOrders) {
      const key = workOrderColumnId(wo);
      if (!known.has(key) && !extras.some((column) => column.id === key)) {
        extras.push({
          id: key,
          label: wo.phase?.phaseShort || wo.phaseShort || 'Unphased',
          order: (wo.phaseOrder ?? 0) + 1000,
        });
      }
    }
    return [...base, ...extras].sort((a, b) => a.order - b.order);
  }, [scopedWorkOrders]);
  const groupedByPhase = useMemo(() => groupByPhase(scopedWorkOrders, phaseColumns), [scopedWorkOrders, phaseColumns]);

  const openCreate = () => {
    setSearchParams({});
    setWorkspaceMode('create');
  };

  const openWorkOrder = (id: string) => {
    setSearchParams({ wo: id });
    setWorkspaceMode('detail');
  };

  const closeWorkspace = () => {
    setWorkspaceMode(null);
    setSearchParams({});
  };

  const createMutation = useMutation({
    mutationFn: async (payload: { workflowId: string; hetId: string; startNow: boolean; signatureDataUrl?: string }) => {
      const created = await createWorkOrder({ workflowId: payload.workflowId, hetId: payload.hetId });
      if (payload.startNow) {
        return startWorkOrderPhase(created.id, payload.signatureDataUrl);
      }
      return created;
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['work-orders'] });
      toast.success(`Work order ${created.woNumber || created.id} created`);
      openWorkOrder(created.id);
    },
    onError: (e: AxiosError<{ error?: string }>) =>
      toast.error(e.response?.data?.error || 'Failed to create work order'),
  });

  const startMutation = useMutation({
    mutationFn: ({ id, signatureDataUrl }: { id: string; signatureDataUrl: string }) => startWorkOrderPhase(id, signatureDataUrl),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['work-orders'] });
      toast.success(`Started ${updated.woNumber || updated.id}`);
      openWorkOrder(updated.id);
    },
    onError: (e: AxiosError<{ error?: string }>) =>
      toast.error(e.response?.data?.error || 'Failed to start phase'),
  });

  const finishMutation = useMutation({
    mutationFn: ({ id, signatureDataUrl }: { id: string; signatureDataUrl: string }) => finishWorkOrderPhase(id, signatureDataUrl),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['work-orders'] });
      toast.success(`Finished ${updated.woNumber || updated.id}`);
      openWorkOrder(updated.id);
    },
    onError: (e: AxiosError<{ error?: string }>) =>
      toast.error(e.response?.data?.error || 'Failed to finish phase'),
  });

  const advanceMutation = useMutation({
    mutationFn: advanceWorkOrder,
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['work-orders'] });
      toast.success(`Advanced ${updated.woNumber || updated.id}`);
      openWorkOrder(updated.id);
    },
    onError: (e: AxiosError<{ error?: string }>) =>
      toast.error(e.response?.data?.error || 'Failed to advance work order'),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Board"
        description="Every work order by production phase for the active line."
        action={
          <div className="flex items-center gap-2">
            <Button variant={allLines ? 'default' : 'outline'} onClick={() => setAllLines((value) => !value)}>
              {allLines ? 'Active line' : 'All lines'}
            </Button>
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" />
              New work order
            </Button>
          </div>
        }
      />

      {isLoading ? (
        <div className="flex h-40 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : !scopedWorkOrders.length ? (
        <EmptyState icon={<Factory className="h-6 w-6" />} title="No active production runs" description="Start a production run with New work order." />
      ) : (
        <div className="overflow-x-auto pb-2">
          <div className="flex gap-4">
            {phaseColumns.map((column) => {
              const items = groupedByPhase.get(column.id) ?? [];
              return (
                <section key={column.id} className="flex w-[260px] shrink-0 flex-col rounded-xl border border-border bg-muted/40 p-3">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div className="truncate text-sm font-semibold text-foreground" title={column.label}>{column.label}</div>
                    <Badge variant="outline">{items.length}</Badge>
                  </div>
                  <div className="space-y-2">
                    {items.length ? (
                      items.map((wo) => (
                        <WorkOrderCard
                          key={wo.id}
                          workOrder={wo}
                          selected={selectedWorkOrder?.id === wo.id && activeWorkspaceMode === 'detail'}
                          onOpen={() => openWorkOrder(wo.id)}
                        />
                      ))
                    ) : (
                      <div className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">Empty</div>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      )}

      <Sheet open={activeWorkspaceMode !== null} onOpenChange={(open) => !open && closeWorkspace()}>
        <SheetContent className="w-full overflow-y-auto p-0 sm:max-w-[min(1120px,96vw)]">
          <SheetHeader className="border-b border-gray-100 p-6 dark:border-gray-800">
            <div className="flex flex-wrap items-start justify-between gap-3 pr-10">
              <div>
                <SheetTitle className="text-xl">
                  {activeWorkspaceMode === 'create' ? 'New work order' : selectedWorkOrder?.woNumber || selectedWorkOrder?.id || 'Work order'}
                </SheetTitle>
                <SheetDescription className="mt-1">
                  {activeWorkspaceMode === 'create'
                    ? 'Select the product workflow, bind the HET record, and capture the operator sign-off before starting controlled production.'
                    : selectedWorkOrder
                      ? `${workflowLabel(selectedWorkOrder)} - ${selectedWorkOrder.currentPhaseLabel} - ${selectedWorkOrder.legacyProductionState}`
                      : 'Loading work order'}
                </SheetDescription>
              </div>
              {selectedWorkOrder && activeWorkspaceMode === 'detail' && (
                <div className="flex items-center gap-2">
                  <Button asChild variant="outline" size="sm">
                    <Link to={`/dashboard/work-orders/${encodeURIComponent(selectedWorkOrder.id)}`}>
                      <Maximize2 className="h-3.5 w-3.5" />
                      Full page
                    </Link>
                  </Button>
                  <StatusPill tone={statusTone(selectedWorkOrder.legacyStateBucket)}>
                    {selectedWorkOrder.legacyStateBucket.replace(/^\d+\.\s*/, '')}
                  </StatusPill>
                </div>
              )}
            </div>
          </SheetHeader>
          <div className="p-6">
            {activeWorkspaceMode === 'create' ? (
              <CreateWorkOrderForm
                workflows={workflows}
                hets={hets}
                creating={createMutation.isPending}
                onCreate={(payload) => createMutation.mutate(payload)}
              />
            ) : selectedWorkOrder ? (
              <WorkOrderWorkspace
                key={selectedWorkOrder.id}
                workOrder={selectedWorkOrder}
                onAdvance={(id) => advanceMutation.mutate(id)}
                onStart={(id, signatureDataUrl) => startMutation.mutate({ id, signatureDataUrl })}
                onFinish={(id, signatureDataUrl) => finishMutation.mutate({ id, signatureDataUrl })}
                advancing={advanceMutation.isPending}
                starting={startMutation.isPending}
                finishing={finishMutation.isPending}
              />
            ) : (
              <EmptyState icon={<ClipboardList className="h-6 w-6" />} title="Work order not found" description="The selected work order is not in the current list." />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
