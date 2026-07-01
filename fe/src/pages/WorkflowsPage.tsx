import { useMemo, useState, type FormEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import {
  fetchPhases,
  fetchWorkflow,
  fetchWorkflows,
  createWorkflow,
  updateWorkflow,
  type PhaseCatalogItem,
  type WorkflowDetail,
  type WorkflowPhaseBinding,
  type WorkflowSummary,
} from '@/lib/workflows-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AdminPanel, EmptyState, MetricCard, PageHeader, StatusPill } from '@/components/tailadmin';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, Boxes, Link2, Plus, Save, Trash2, Workflow as WorkflowIcon } from 'lucide-react';

function phaseLabel(phase?: PhaseCatalogItem | WorkflowPhaseBinding['phase'] | null) {
  if (!phase) return 'Unknown phase';
  return phase.phaseName || phase.phaseShort || phase.id;
}

function workflowSortValue(binding: Pick<WorkflowPhaseBinding, 'sortOrder'>, index: number) {
  return binding.sortOrder ?? (index + 1) * 10;
}

function WorkflowCard({
  workflow,
  selected,
  onSelect,
}: {
  workflow: WorkflowSummary;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`rounded-lg border p-4 text-left transition ${
        selected
          ? 'border-brand-500 bg-brand-50 dark:border-brand-400 dark:bg-brand-500/10'
          : 'border-gray-100 bg-gray-50 hover:border-brand-200 dark:border-gray-800 dark:bg-white/[0.03]'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="flex items-center gap-2 font-medium text-gray-800 dark:text-white/90">
            <WorkflowIcon className="h-4 w-4 text-brand-500" />
            {workflow.name}
          </span>
          <p className="mt-1 text-xs font-medium uppercase text-gray-400">{workflow.code}</p>
        </div>
        <StatusPill tone={workflow.active ? 'success' : 'neutral'}>{workflow.active ? 'Active' : 'Inactive'}</StatusPill>
      </div>
      <div className="mt-4 text-sm text-gray-500 dark:text-gray-400">
        <div className="min-h-5">{workflow.description || 'No description'}</div>
        <div className="mt-3 text-xs">
          {workflow._count.phases} phase(s) - {workflow._count.workOrders} work order(s)
        </div>
      </div>
    </button>
  );
}

function PhaseBindingsPanel({
  workflowId,
  workflow,
  phases,
  isLoading,
  isError,
}: {
  workflowId: string | null;
  workflow?: WorkflowDetail;
  phases: PhaseCatalogItem[];
  isLoading: boolean;
  isError: boolean;
}) {
  const queryClient = useQueryClient();
  const [draftPhaseIds, setDraftPhaseIds] = useState(() => workflow?.phases.map((binding) => binding.phaseId) ?? []);
  const [phaseToAdd, setPhaseToAdd] = useState('');

  const phaseById = useMemo(() => {
    return new Map(phases.map((phase) => [phase.id, phase]));
  }, [phases]);

  const availablePhases = useMemo(() => {
    const selected = new Set(draftPhaseIds);
    return phases.filter((phase) => !selected.has(phase.id));
  }, [draftPhaseIds, phases]);

  const updatePhasesMutation = useMutation({
    mutationFn: () =>
      updateWorkflow(workflowId!, {
        phases: draftPhaseIds.map((phaseId, index) => ({ phaseId, sortOrder: (index + 1) * 10 })),
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(['workflow', updated.id], updated);
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
      toast.success('Workflow phases saved');
    },
    onError: (e: AxiosError<{ error?: string }>) =>
      toast.error(e.response?.data?.error || 'Failed to save workflow phases'),
  });

  const addPhase = () => {
    if (!phaseToAdd || draftPhaseIds.includes(phaseToAdd)) return;
    setDraftPhaseIds((current) => [...current, phaseToAdd]);
    setPhaseToAdd('');
  };

  const removePhase = (phaseId: string) => {
    setDraftPhaseIds((current) => current.filter((id) => id !== phaseId));
  };

  const movePhase = (phaseId: string, direction: -1 | 1) => {
    setDraftPhaseIds((current) => {
      const index = current.indexOf(phaseId);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  };

  return (
    <AdminPanel
      title="Phase bindings"
      description="Ordered phases used when new work orders are created and advanced."
      action={
        <Button
          type="button"
          disabled={!workflowId || !workflow || updatePhasesMutation.isPending || isLoading}
          onClick={() => updatePhasesMutation.mutate()}
        >
          <Save className="h-4 w-4" />
          Save
        </Button>
      }
    >
      {!workflowId ? (
        <EmptyState icon={<Link2 className="h-6 w-6" />} title="Select a workflow" description="Choose a workflow above to manage its phase bindings." />
      ) : isLoading ? (
        <div className="flex h-40 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
        </div>
      ) : isError || !workflow ? (
        <EmptyState icon={<Link2 className="h-6 w-6" />} title="Configuration unavailable" description="Workflow phases could not be loaded." />
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[1fr_auto]">
            <div className="grid gap-1.5">
              <Label htmlFor="phase-add">Add phase</Label>
              <select
                id="phase-add"
                value={phaseToAdd}
                onChange={(event) => setPhaseToAdd(event.target.value)}
                className="h-11 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 shadow-theme-xs outline-none focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
              >
                <option value="">Select a phase</option>
                {availablePhases.map((phase) => (
                  <option key={phase.id} value={phase.id}>
                    {phaseLabel(phase)} ({phase.phaseOrder ?? '-'})
                  </option>
                ))}
              </select>
            </div>
            <Button type="button" className="md:self-end" disabled={!phaseToAdd} onClick={addPhase}>
              <Plus className="h-4 w-4" />
              Add
            </Button>
          </div>

          {!draftPhaseIds.length ? (
            <EmptyState icon={<WorkflowIcon className="h-6 w-6" />} title="No phases bound" description="Add phases in the order operators should execute them." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Phase</TableHead>
                  <TableHead>Catalog order</TableHead>
                  <TableHead>BOM</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {draftPhaseIds.map((phaseId, index) => {
                  const phase = phaseById.get(phaseId);
                  return (
                    <TableRow key={phaseId}>
                      <TableCell>{workflowSortValue({ sortOrder: (index + 1) * 10 }, index)}</TableCell>
                      <TableCell className="min-w-48 whitespace-normal">
                        <div className="font-medium text-gray-800 dark:text-white/90">{phaseLabel(phase)}</div>
                        <div className="break-all text-xs text-gray-500">{phase?.phaseShort || phaseId}</div>
                      </TableCell>
                      <TableCell>{phase?.phaseOrder ?? '-'}</TableCell>
                      <TableCell className="break-all">{phase?.bomId || '-'}</TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          <Button type="button" variant="outline" size="icon" disabled={index === 0} onClick={() => movePhase(phaseId, -1)}>
                            <ArrowUp className="h-4 w-4" />
                          </Button>
                          <Button type="button" variant="outline" size="icon" disabled={index === draftPhaseIds.length - 1} onClick={() => movePhase(phaseId, 1)}>
                            <ArrowDown className="h-4 w-4" />
                          </Button>
                          <Button type="button" variant="outline" size="icon" onClick={() => removePhase(phaseId)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
      )}
    </AdminPanel>
  );
}

export default function WorkflowsPage() {
  const queryClient = useQueryClient();
  const { data: workflows, isLoading } = useQuery({
    queryKey: ['workflows'],
    queryFn: () => fetchWorkflows(),
  });
  const phasesQuery = useQuery({
    queryKey: ['phases'],
    queryFn: fetchPhases,
  });

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const effectiveSelectedWorkflowId = selectedWorkflowId ?? workflows?.[0]?.id ?? null;

  const workflowQuery = useQuery({
    queryKey: ['workflow', effectiveSelectedWorkflowId],
    queryFn: () => fetchWorkflow(effectiveSelectedWorkflowId!),
    enabled: Boolean(effectiveSelectedWorkflowId),
  });

  const createMutation = useMutation({
    mutationFn: createWorkflow,
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
      queryClient.setQueryData(['workflow', created.id], created);
      setSelectedWorkflowId(created.id);
      toast.success('Workflow created');
      setName('');
      setCode('');
      setDescription('');
    },
    onError: (e: AxiosError<{ error?: string }>) =>
      toast.error(e.response?.data?.error || 'Failed to create workflow'),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !code.trim()) return;
    createMutation.mutate({
      name: name.trim(),
      code: code.trim().toUpperCase(),
      description: description.trim() || null,
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Workflows"
        description="Product families: each workflow defines an ordered set of manufacturing phases."
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <MetricCard icon={<WorkflowIcon className="h-6 w-6" />} label="Configured workflows" value={workflows?.length ?? 0} />
        <MetricCard icon={<Boxes className="h-6 w-6" />} label="Total phases" value={workflows?.reduce((sum, w) => sum + w._count.phases, 0) ?? 0} />
      </div>

      <AdminPanel
        title="New workflow"
        description="Create a product workflow, then bind ordered phases from the tenant phase catalog."
        action={
          <span className="hidden items-center gap-2 text-sm text-gray-500 sm:flex">
            <Plus className="h-4 w-4" /> New workflow
          </span>
        }
      >
          <form
            onSubmit={submit}
            className="grid gap-4 lg:grid-cols-[1fr_160px_2fr_auto] lg:items-end"
          >
            <div className="grid gap-1.5">
              <Label htmlFor="wf-name">Name</Label>
              <Input
                id="wf-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="AmGraft®"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="wf-code">Code</Label>
              <Input
                id="wf-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="AMG"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="wf-desc">Description</Label>
              <Input
                id="wf-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="optional"
              />
            </div>
            <Button type="submit" disabled={createMutation.isPending || !name.trim() || !code.trim()}>
              <Plus className="h-4 w-4" />
              Create
            </Button>
          </form>
      </AdminPanel>

      <AdminPanel title="Configured workflows" description="Select a workflow to inspect and edit its ordered phase bindings.">
        {isLoading ? (
          <div className="flex h-40 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
          </div>
        ) : !workflows?.length ? (
          <EmptyState icon={<WorkflowIcon className="h-6 w-6" />} title="No workflows yet" description="Create your first product workflow above." />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {workflows.map((w) => (
              <WorkflowCard
                key={w.id}
                workflow={w}
                selected={effectiveSelectedWorkflowId === w.id}
                onSelect={() => setSelectedWorkflowId(w.id)}
              />
            ))}
          </div>
        )}
      </AdminPanel>

      <PhaseBindingsPanel
        key={workflowQuery.data?.id ?? effectiveSelectedWorkflowId ?? 'none'}
        workflowId={effectiveSelectedWorkflowId}
        workflow={workflowQuery.data}
        phases={phasesQuery.data ?? []}
        isLoading={workflowQuery.isLoading || phasesQuery.isLoading}
        isError={workflowQuery.isError || phasesQuery.isError}
      />
    </div>
  );
}
