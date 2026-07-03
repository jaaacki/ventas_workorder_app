import { useMemo, useState, type FormEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import {
  fetchWorkflows,
  fetchWorkflow,
  createWorkflow,
  updateWorkflow,
  deleteWorkflow,
  createPhase,
  updatePhase,
  deletePhase,
  reorderPhases,
  createStep,
  updateStep,
  deleteStep,
  placeStep,
  unplaceStep,
  reorderSteps,
  fetchBoms,
  type WorkflowSummary,
  type PhaseItem,
  type StepItem,
  type PhaseMutationPayload,
} from '@/lib/workflows-api';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { EmptyState, MetricCard, PageHeader } from '@/components/tailadmin';
import { toast } from 'sonner';
import { ArrowDown, ArrowLeft, ArrowUp, Edit3, GripVertical, ListChecks, Plus, Trash2, Workflow as WorkflowIcon } from 'lucide-react';

function apiError(e: AxiosError<{ error?: string }>, fallback: string) {
  return e.response?.data?.error || fallback;
}

// The phase letter shown in the board / configurator: an explicit phaseShort,
// else derived from its position (0 -> A, 1 -> B, ...).
function phaseLetter(phase: Pick<PhaseItem, 'phaseShort' | 'sortOrder'>, index: number) {
  if (phase.phaseShort) return phase.phaseShort;
  const n = index ?? phase.sortOrder ?? 0;
  return n >= 0 && n < 26 ? String.fromCharCode(65 + n) : String(n + 1);
}

function phaseTitle(phase: PhaseItem, index: number) {
  const letter = phaseLetter(phase, index);
  const name = phase.phaseName || 'Untitled phase';
  return `${letter} · ${name}`;
}

function stepTitle(step: StepItem) {
  return [step.code, step.name].filter(Boolean).join(' · ') || 'Untitled step';
}

function ConfirmDialog({
  open,
  title,
  description,
  busy,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" disabled={busy} onClick={onConfirm}>
            <Trash2 className="h-4 w-4" />
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Workflow list ───────────────────────────────────────────────────────────

function CreateWorkflowDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (id: string) => void;
}) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');

  const mutation = useMutation({
    mutationFn: () => createWorkflow({ name: name.trim(), code: code.trim(), description: description.trim() || null }),
    onSuccess: (workflow) => {
      toast.success(`Workflow ${workflow.code} created`);
      onOpenChange(false);
      setName('');
      setCode('');
      setDescription('');
      onCreated(workflow.id);
    },
    onError: (e: AxiosError<{ error?: string }>) => toast.error(apiError(e, 'Failed to create workflow')),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !code.trim()) return;
    mutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Create workflow</DialogTitle>
            <DialogDescription>A workflow is one product line. You will arrange its phases and steps next.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="wf-name">Name</Label>
              <Input id="wf-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="AmGraft Granulate" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wf-code">Code</Label>
              <Input id="wf-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="AM025" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wf-desc">Description</Label>
              <Input id="wf-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={mutation.isPending || !name.trim() || !code.trim()}>
              <Plus className="h-4 w-4" />
              Create workflow
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function WorkflowList({ onOpen }: { onOpen: (id: string) => void }) {
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [toDelete, setToDelete] = useState<WorkflowSummary | null>(null);

  const { data: workflows = [], isLoading } = useQuery({
    queryKey: ['workflows'],
    queryFn: () => fetchWorkflows(false),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteWorkflow(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
      toast.success('Workflow deleted');
      setToDelete(null);
    },
    onError: (e: AxiosError<{ error?: string }>) => toast.error(apiError(e, 'Failed to delete workflow')),
  });

  const totalPhases = workflows.reduce((sum, w) => sum + (w.phaseCount ?? 0), 0);
  const totalSteps = workflows.reduce((sum, w) => sum + (w.stepCount ?? 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Workflows & phases"
        description="Each product line is a workflow. Open one to arrange its phases and steps."
        action={
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" />
            Create workflow
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <MetricCard icon={<WorkflowIcon className="h-5 w-5" />} label="Workflows" value={workflows.length} />
        <MetricCard icon={<ListChecks className="h-5 w-5" />} label="Phases" value={totalPhases} />
        <MetricCard icon={<ListChecks className="h-5 w-5" />} label="Steps" value={totalSteps} />
      </div>

      <div className="rounded-xl border border-border bg-card">
        {isLoading ? (
          <div className="flex h-40 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : !workflows.length ? (
          <EmptyState icon={<WorkflowIcon className="h-6 w-6" />} title="No workflows yet" description="Create a product line to get started." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Workflow</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Phases</TableHead>
                <TableHead className="text-right">Steps</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {workflows.map((workflow) => (
                <TableRow key={workflow.id}>
                  <TableCell>
                    <button className="font-semibold text-foreground hover:underline" onClick={() => onOpen(workflow.id)}>
                      {workflow.name}
                    </button>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{workflow.code}</TableCell>
                  <TableCell className="max-w-md truncate text-muted-foreground">{workflow.description || '—'}</TableCell>
                  <TableCell className="text-right"><Badge variant="outline">{workflow.phaseCount ?? 0}</Badge></TableCell>
                  <TableCell className="text-right"><Badge variant="outline">{workflow.stepCount ?? 0}</Badge></TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => onOpen(workflow.id)}>
                        <Edit3 className="h-4 w-4" />
                        Edit
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setToDelete(workflow)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <CreateWorkflowDialog open={creating} onOpenChange={setCreating} onCreated={onOpen} />
      <ConfirmDialog
        open={Boolean(toDelete)}
        title="Delete workflow"
        description={`Delete "${toDelete?.name}" and all its phases and steps? This cannot be undone.`}
        busy={deleteMutation.isPending}
        onOpenChange={(open) => !open && setToDelete(null)}
        onConfirm={() => toDelete && deleteMutation.mutate(toDelete.id)}
      />
    </div>
  );
}

// ── Phase create/edit dialog ────────────────────────────────────────────────

function PhaseDialog({
  open,
  workflowId,
  phase,
  onOpenChange,
}: {
  open: boolean;
  workflowId: string;
  phase: PhaseItem | null; // null = create
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [phaseShort, setPhaseShort] = useState(phase?.phaseShort || '');
  const [phaseName, setPhaseName] = useState(phase?.phaseName || '');
  const [description, setDescription] = useState(phase?.description || '');
  const [bomId, setBomId] = useState(phase?.bomId || '');

  const { data: boms = [] } = useQuery({ queryKey: ['boms'], queryFn: fetchBoms });

  const mutation = useMutation({
    mutationFn: () => {
      const payload: PhaseMutationPayload = {
        phaseShort: phaseShort.trim() || null,
        phaseName: phaseName.trim() || null,
        description: description.trim() || null,
        bomId: bomId || null,
      };
      return phase ? updatePhase(phase.id, payload) : createPhase(workflowId, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflow', workflowId] });
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
      toast.success(phase ? 'Phase updated' : 'Phase added');
      onOpenChange(false);
    },
    onError: (e: AxiosError<{ error?: string }>) => toast.error(apiError(e, 'Failed to save phase')),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!phaseName.trim() && !phaseShort.trim()) return;
    mutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{phase ? 'Edit phase' : 'Add a phase'}</DialogTitle>
            <DialogDescription>A phase is a letter-grouped stage of the workflow.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-[80px_1fr] gap-3">
              <div className="space-y-2">
                <Label htmlFor="ph-short">Letter</Label>
                <Input id="ph-short" value={phaseShort} maxLength={4} onChange={(e) => setPhaseShort(e.target.value)} placeholder="A" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ph-name">Name</Label>
                <Input id="ph-name" value={phaseName} onChange={(e) => setPhaseName(e.target.value)} placeholder="Material Acquisition" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ph-desc">Description</Label>
              <Input id="ph-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What happens in this phase" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ph-bom">Bill of materials</Label>
              <select
                id="ph-bom"
                className="flex h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900"
                value={bomId}
                onChange={(e) => setBomId(e.target.value)}
              >
                <option value="">No BOM</option>
                {boms.map((bom) => (
                  <option key={bom.id} value={bom.id}>
                    {bom.bomName || bom.id}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={mutation.isPending || (!phaseName.trim() && !phaseShort.trim())}>
              {phase ? 'Save phase' : 'Add phase'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Manage-steps drawer ─────────────────────────────────────────────────────

function StepsDrawer({
  workflowId,
  phase,
  phaseIndex,
  pool,
  onClose,
}: {
  workflowId: string;
  phase: PhaseItem;
  phaseIndex: number;
  pool: StepItem[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [newStep, setNewStep] = useState('');
  const [showPool, setShowPool] = useState(false);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['workflow', workflowId] });
  const bump = () => queryClient.invalidateQueries({ queryKey: ['workflows'] });
  const onError = (e: AxiosError<{ error?: string }>) => toast.error(apiError(e, 'Step action failed'));

  const steps = [...phase.steps].sort((a, b) => a.sortOrder - b.sortOrder);

  const addMutation = useMutation({
    mutationFn: () => createStep(workflowId, { name: newStep.trim(), phaseId: phase.id }),
    onSuccess: () => { invalidate(); bump(); setNewStep(''); },
    onError,
  });
  const renameMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => updateStep(id, { name }),
    onSuccess: invalidate,
    onError,
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteStep(id),
    onSuccess: () => { invalidate(); bump(); },
    onError,
  });
  const placeMutation = useMutation({
    mutationFn: (id: string) => placeStep(id, phase.id),
    onSuccess: invalidate,
    onError,
  });
  const unplaceMutation = useMutation({
    mutationFn: (id: string) => unplaceStep(id),
    onSuccess: invalidate,
    onError,
  });
  const reorderMutation = useMutation({
    mutationFn: (ids: string[]) => reorderSteps(phase.id, ids),
    onSuccess: invalidate,
    onError,
  });

  const move = (index: number, direction: -1 | 1) => {
    const next = index + direction;
    if (next < 0 || next >= steps.length) return;
    const ids = steps.map((s) => s.id);
    [ids[index], ids[next]] = [ids[next], ids[index]];
    reorderMutation.mutate(ids);
  };

  const addStep = (event: FormEvent) => {
    event.preventDefault();
    if (!newStep.trim()) return;
    addMutation.mutate();
  };

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-[520px]">
        <SheetHeader>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Editing phase</div>
          <SheetTitle>{phaseTitle(phase, phaseIndex)}</SheetTitle>
          <SheetDescription>{phase.description || 'Order the steps that make up this phase.'}</SheetDescription>
        </SheetHeader>

        <div className="space-y-4 py-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            Steps in this phase
            <Badge variant="outline">{steps.length}</Badge>
          </div>

          <div className="space-y-2">
            {steps.length ? (
              steps.map((step, index) => (
                <div key={step.id} className="flex items-start gap-2 rounded-lg border border-border p-3">
                  <div className="flex flex-col">
                    <button className="text-muted-foreground disabled:opacity-30" disabled={index === 0} onClick={() => move(index, -1)}>
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button className="text-muted-foreground disabled:opacity-30" disabled={index === steps.length - 1} onClick={() => move(index, 1)}>
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <span className="mt-0.5 w-6 text-center text-xs text-muted-foreground">{index + 1}</span>
                  <div className="min-w-0 flex-1">
                    <input
                      className="w-full bg-transparent text-sm font-medium text-foreground focus:outline-none"
                      defaultValue={stepTitle(step)}
                      onBlur={(e) => {
                        const name = e.target.value.trim();
                        if (name && name !== stepTitle(step)) renameMutation.mutate({ id: step.id, name });
                      }}
                    />
                    {step.description && <div className="truncate text-xs text-muted-foreground">{step.description}</div>}
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => unplaceMutation.mutate(step.id)}>Unplace</Button>
                  <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(step.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))
            ) : (
              <div className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                No steps yet. Add one below or pull from the pool.
              </div>
            )}
          </div>

          <form className="flex items-center gap-2" onSubmit={addStep}>
            <Input value={newStep} onChange={(e) => setNewStep(e.target.value)} placeholder="Name a new step and press Enter…" />
            <Button type="submit" disabled={addMutation.isPending || !newStep.trim()}>
              <Plus className="h-4 w-4" />
              Add step
            </Button>
          </form>

          <div className="rounded-lg border border-border">
            <button
              className="flex w-full items-center justify-between p-3 text-sm font-medium text-foreground"
              onClick={() => setShowPool((v) => !v)}
            >
              <span className="flex items-center gap-2">
                Available to pull in
                <Badge variant="outline">{pool.length}</Badge>
              </span>
              <span className="text-xs text-muted-foreground">steps not in any phase</span>
            </button>
            {showPool && (
              <div className="space-y-2 border-t border-border p-3">
                {pool.length ? (
                  pool.map((step) => (
                    <div key={step.id} className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-2 py-1.5">
                      <span className="truncate text-sm text-foreground">{stepTitle(step)}</span>
                      <Button variant="outline" size="sm" onClick={() => placeMutation.mutate(step.id)}>
                        Place
                      </Button>
                    </div>
                  ))
                ) : (
                  <div className="text-center text-xs text-muted-foreground">Pool is empty.</div>
                )}
              </div>
            )}
          </div>
        </div>

        <SheetFooter>
          <Button variant="outline" onClick={onClose}>Done</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

// ── Workflow editor ─────────────────────────────────────────────────────────

function WorkflowEditor({ workflowId, onBack }: { workflowId: string; onBack: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [phaseDialog, setPhaseDialog] = useState<{ phase: PhaseItem | null } | null>(null);
  const [manageStepsFor, setManageStepsFor] = useState<string | null>(null);
  const [deletePhaseTarget, setDeletePhaseTarget] = useState<PhaseItem | null>(null);
  const [deleteWorkflowOpen, setDeleteWorkflowOpen] = useState(false);

  const { data: workflow, isLoading } = useQuery({
    queryKey: ['workflow', workflowId],
    queryFn: () => fetchWorkflow(workflowId),
  });

  // Sync header fields once per loaded workflow (render-phase guard, no effect).
  if (workflow && loadedFor !== workflow.id) {
    setName(workflow.name);
    setCode(workflow.code);
    setDescription(workflow.description || '');
    setLoadedFor(workflow.id);
  }

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['workflow', workflowId] });
    queryClient.invalidateQueries({ queryKey: ['workflows'] });
  };
  const onError = (e: AxiosError<{ error?: string }>) => toast.error(apiError(e, 'Action failed'));

  const saveWorkflow = useMutation({
    mutationFn: () => updateWorkflow(workflowId, { name: name.trim(), code: code.trim(), description: description.trim() || null }),
    onSuccess: () => { invalidate(); toast.success('Workflow saved'); },
    onError,
  });
  const deleteWorkflowMutation = useMutation({
    mutationFn: () => deleteWorkflow(workflowId),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['workflows'] }); toast.success('Workflow deleted'); onBack(); },
    onError,
  });
  const deletePhaseMutation = useMutation({
    mutationFn: (id: string) => deletePhase(id),
    onSuccess: () => { invalidate(); toast.success('Phase deleted'); setDeletePhaseTarget(null); },
    onError,
  });
  const togglePhaseFlag = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: PhaseMutationPayload }) => updatePhase(id, payload),
    onSuccess: invalidate,
    onError,
  });
  const reorderMutation = useMutation({
    mutationFn: (phaseIds: string[]) => reorderPhases(workflowId, phaseIds),
    onSuccess: invalidate,
    onError,
  });

  const phases = useMemo(
    () => (workflow ? [...workflow.phases].sort((a, b) => a.sortOrder - b.sortOrder) : []),
    [workflow],
  );

  const movePhase = (index: number, direction: -1 | 1) => {
    const next = index + direction;
    if (next < 0 || next >= phases.length) return;
    const ids = phases.map((p) => p.id);
    [ids[index], ids[next]] = [ids[next], ids[index]];
    reorderMutation.mutate(ids);
  };

  if (isLoading || !workflow) {
    return (
      <div className="flex h-40 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const stepCount = phases.reduce((sum, p) => sum + p.steps.length, 0);
  const managedPhase = phases.find((p) => p.id === manageStepsFor) ?? null;
  const managedIndex = phases.findIndex((p) => p.id === manageStepsFor);

  return (
    <div className="space-y-6">
      <button className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground" onClick={onBack}>
        <ArrowLeft className="h-4 w-4" />
        All workflows
      </button>

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="grid gap-4 lg:grid-cols-[1fr_160px_1fr_auto]">
          <div className="space-y-2">
            <Label htmlFor="wf-name">Workflow name</Label>
            <Input id="wf-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="wf-code">Code</Label>
            <Input id="wf-code" value={code} onChange={(e) => setCode(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="wf-desc">Description</Label>
            <Input id="wf-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="flex items-end gap-2">
            <Button onClick={() => saveWorkflow.mutate()} disabled={saveWorkflow.isPending || !name.trim() || !code.trim()}>
              Save
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setDeleteWorkflowOpen(true)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between p-4">
          <div>
            <div className="text-lg font-semibold text-foreground">Phases</div>
            <div className="text-sm text-muted-foreground">
              {phases.length} phases · in order · {workflow.unplacedSteps.length} steps not yet placed · {stepCount} placed
            </div>
          </div>
          <Button onClick={() => setPhaseDialog({ phase: null })}>
            <Plus className="h-4 w-4" />
            Add a phase
          </Button>
        </div>

        {!phases.length ? (
          <EmptyState icon={<ListChecks className="h-6 w-6" />} title="No phases yet" description="Add the first phase of this workflow." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">#</TableHead>
                <TableHead>Phase</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Flags</TableHead>
                <TableHead className="text-right">Steps</TableHead>
                <TableHead className="w-56" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {phases.map((phase, index) => (
                <TableRow key={phase.id}>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <GripVertical className="h-4 w-4 text-muted-foreground/50" />
                      <div className="flex flex-col">
                        <button className="text-muted-foreground disabled:opacity-30" disabled={index === 0} onClick={() => movePhase(index, -1)}>
                          <ArrowUp className="h-3.5 w-3.5" />
                        </button>
                        <button className="text-muted-foreground disabled:opacity-30" disabled={index === phases.length - 1} onClick={() => movePhase(index, 1)}>
                          <ArrowDown className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <span className="ml-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs">{index + 1}</span>
                    </div>
                  </TableCell>
                  <TableCell className="font-medium text-foreground">{phaseTitle(phase, index)}</TableCell>
                  <TableCell className="max-w-xs truncate text-muted-foreground">{phase.description || '—'}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      <button
                        className={`rounded-full border px-2 py-0.5 text-xs ${phase.isGate ? 'border-warning-500/40 bg-warning-50 text-warning-600 dark:bg-warning-500/10' : 'border-border text-muted-foreground'}`}
                        onClick={() => togglePhaseFlag.mutate({ id: phase.id, payload: { isGate: !phase.isGate } })}
                        title="Sterilisation/BET gate — requires a passing result to advance"
                      >
                        gate
                      </button>
                      <button
                        className={`rounded-full border px-2 py-0.5 text-xs ${phase.blocksCombine ? 'border-brand-300 bg-brand-50 text-brand-600 dark:bg-brand-500/10' : 'border-border text-muted-foreground'}`}
                        onClick={() => togglePhaseFlag.mutate({ id: phase.id, payload: { blocksCombine: !phase.blocksCombine } })}
                        title="Forbids running this phase on a combined (multi-HET) batch"
                      >
                        no-combine
                      </button>
                    </div>
                  </TableCell>
                  <TableCell className="text-right"><Badge variant="outline">{phase.steps.length}</Badge></TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="outline" size="sm" onClick={() => setManageStepsFor(phase.id)}>
                        <ListChecks className="h-4 w-4" />
                        Manage steps
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setPhaseDialog({ phase })}>
                        <Edit3 className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setDeletePhaseTarget(phase)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {phaseDialog && (
        <PhaseDialog
          key={phaseDialog.phase?.id ?? 'new'}
          open
          workflowId={workflowId}
          phase={phaseDialog.phase}
          onOpenChange={(open) => !open && setPhaseDialog(null)}
        />
      )}

      {managedPhase && (
        <StepsDrawer
          workflowId={workflowId}
          phase={managedPhase}
          phaseIndex={managedIndex}
          pool={workflow.unplacedSteps}
          onClose={() => setManageStepsFor(null)}
        />
      )}

      <ConfirmDialog
        open={Boolean(deletePhaseTarget)}
        title="Delete phase"
        description={`Delete phase "${deletePhaseTarget ? phaseTitle(deletePhaseTarget, phases.indexOf(deletePhaseTarget)) : ''}"? Its steps move back to the pool.`}
        busy={deletePhaseMutation.isPending}
        onOpenChange={(open) => !open && setDeletePhaseTarget(null)}
        onConfirm={() => deletePhaseTarget && deletePhaseMutation.mutate(deletePhaseTarget.id)}
      />
      <ConfirmDialog
        open={deleteWorkflowOpen}
        title="Delete workflow"
        description={`Delete "${workflow.name}" and all its phases and steps? This cannot be undone.`}
        busy={deleteWorkflowMutation.isPending}
        onOpenChange={setDeleteWorkflowOpen}
        onConfirm={() => deleteWorkflowMutation.mutate()}
      />
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function WorkflowsPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return selectedId ? (
    <WorkflowEditor workflowId={selectedId} onBack={() => setSelectedId(null)} />
  ) : (
    <WorkflowList onOpen={setSelectedId} />
  );
}
