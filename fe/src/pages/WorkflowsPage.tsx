import { useMemo, useState, type FormEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import {
  createBom,
  createBomLine,
  fetchPhases,
  fetchBoms,
  fetchBomLines,
  fetchPhaseEquipment,
  fetchProcedures,
  fetchWorkflow,
  fetchWorkflows,
  createPhase,
  createPhaseEquipment,
  createProcedure,
  createWorkflow,
  deleteBom,
  deleteBomLine,
  deletePhase,
  deletePhaseEquipment,
  deleteProcedure,
  updateBom,
  updateBomLine,
  updatePhase,
  updatePhaseEquipment,
  updateProcedure,
  updateWorkflow,
  type BomCatalogItem,
  type BomLineCatalogItem,
  type BomLineMutationPayload,
  type BomMutationPayload,
  type PhaseCatalogItem,
  type PhaseEquipmentCatalogItem,
  type PhaseEquipmentMutationPayload,
  type PhaseMutationPayload,
  type ProcedureCatalogItem,
  type ProcedureMutationPayload,
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
import { ArrowDown, ArrowUp, Boxes, Edit3, Link2, Plus, Save, Trash2, Wrench, Workflow as WorkflowIcon } from 'lucide-react';

function phaseLabel(phase?: PhaseCatalogItem | WorkflowPhaseBinding['phase'] | null) {
  if (!phase) return 'Unknown phase';
  return phase.phaseName || phase.phaseShort || phase.id;
}

function workflowSortValue(binding: Pick<WorkflowPhaseBinding, 'sortOrder'>, index: number) {
  return binding.sortOrder ?? (index + 1) * 10;
}

function catalogLabel(item: { id: string }, primary?: string | null, secondary?: string | null) {
  return primary || secondary || item.id;
}

function errorMessage(e: AxiosError<{ error?: string }>, fallback: string) {
  return e.response?.data?.error || fallback;
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

function PhaseCatalogPanel({ phases, isLoading }: { phases: PhaseCatalogItem[]; isLoading: boolean }) {
  const queryClient = useQueryClient();
  const [editingPhaseId, setEditingPhaseId] = useState<string | null>(null);
  const [phaseName, setPhaseName] = useState('');
  const [phaseShort, setPhaseShort] = useState('');
  const [phaseOrder, setPhaseOrder] = useState('');
  const [description, setDescription] = useState('');
  const [keyText, setKeyText] = useState('');

  const resetForm = () => {
    setEditingPhaseId(null);
    setPhaseName('');
    setPhaseShort('');
    setPhaseOrder('');
    setDescription('');
    setKeyText('');
  };

  const mutationPayload = (): PhaseMutationPayload => ({
    phaseName: phaseName.trim() || null,
    phaseShort: phaseShort.trim() || null,
    phaseOrder: phaseOrder.trim() ? Number(phaseOrder) : null,
    description: description.trim() || null,
    keyText: keyText.trim() || null,
  });

  const createPhaseMutation = useMutation({
    mutationFn: createPhase,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['phases'] });
      toast.success('Phase created');
      resetForm();
    },
    onError: (e: AxiosError<{ error?: string }>) => toast.error(e.response?.data?.error || 'Failed to create phase'),
  });

  const updatePhaseMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: PhaseMutationPayload }) => updatePhase(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['phases'] });
      queryClient.invalidateQueries({ queryKey: ['workflow'] });
      toast.success('Phase updated');
      resetForm();
    },
    onError: (e: AxiosError<{ error?: string }>) => toast.error(e.response?.data?.error || 'Failed to update phase'),
  });

  const deletePhaseMutation = useMutation({
    mutationFn: deletePhase,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['phases'] });
      queryClient.invalidateQueries({ queryKey: ['workflow'] });
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
      toast.success('Phase deleted');
      resetForm();
    },
    onError: (e: AxiosError<{ error?: string }>) => toast.error(e.response?.data?.error || 'Failed to delete phase'),
  });

  const startEdit = (phase: PhaseCatalogItem) => {
    setEditingPhaseId(phase.id);
    setPhaseName(phase.phaseName || '');
    setPhaseShort(phase.phaseShort || '');
    setPhaseOrder(phase.phaseOrder == null ? '' : String(phase.phaseOrder));
    setDescription(phase.description || '');
    setKeyText(phase.keyText || '');
  };

  const submitPhase = (event: FormEvent) => {
    event.preventDefault();
    if (!phaseName.trim() && !phaseShort.trim()) return;
    const payload = mutationPayload();
    if (editingPhaseId) {
      updatePhaseMutation.mutate({ id: editingPhaseId, payload });
    } else {
      createPhaseMutation.mutate(payload);
    }
  };

  const busy = createPhaseMutation.isPending || updatePhaseMutation.isPending || deletePhaseMutation.isPending;

  return (
    <AdminPanel title="Phase catalog" description="Tenant phase master data available for workflow binding.">
      <form onSubmit={submitPhase} className="grid gap-3 lg:grid-cols-[1fr_140px_120px_1.5fr_1fr_auto] lg:items-end">
        <div className="grid gap-1.5">
          <Label htmlFor="phase-name">Name</Label>
          <Input id="phase-name" value={phaseName} onChange={(event) => setPhaseName(event.target.value)} placeholder="Intake" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="phase-short">Short</Label>
          <Input id="phase-short" value={phaseShort} onChange={(event) => setPhaseShort(event.target.value)} placeholder="INT" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="phase-order">Order</Label>
          <Input id="phase-order" type="number" value={phaseOrder} onChange={(event) => setPhaseOrder(event.target.value)} placeholder="10" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="phase-description">Description</Label>
          <Input id="phase-description" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="optional" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="phase-key">Key</Label>
          <Input id="phase-key" value={keyText} onChange={(event) => setKeyText(event.target.value)} placeholder="optional" />
        </div>
        <div className="flex gap-2">
          <Button type="submit" disabled={busy || (!phaseName.trim() && !phaseShort.trim())}>
            {editingPhaseId ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {editingPhaseId ? 'Save' : 'Create'}
          </Button>
          {editingPhaseId ? (
            <Button type="button" variant="outline" onClick={resetForm} disabled={busy}>
              Cancel
            </Button>
          ) : null}
        </div>
      </form>

      <div className="mt-5">
        {isLoading ? (
          <div className="flex h-32 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
          </div>
        ) : !phases.length ? (
          <EmptyState icon={<WorkflowIcon className="h-6 w-6" />} title="No phases yet" description="Create phases before binding workflows." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Phase</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Key</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {phases.map((phase) => (
                <TableRow key={phase.id}>
                  <TableCell>{phase.phaseOrder ?? '-'}</TableCell>
                  <TableCell className="min-w-48 whitespace-normal">
                    <div className="font-medium text-gray-800 dark:text-white/90">{phaseLabel(phase)}</div>
                    <div className="break-all text-xs text-gray-500">{phase.phaseShort || phase.id}</div>
                  </TableCell>
                  <TableCell className="whitespace-normal">{phase.description || '-'}</TableCell>
                  <TableCell className="break-all">{phase.keyText || '-'}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="outline" size="icon" onClick={() => startEdit(phase)} disabled={busy}>
                        <Edit3 className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        disabled={busy}
                        onClick={() => {
                          if (window.confirm(`Delete ${phaseLabel(phase)}?`)) {
                            deletePhaseMutation.mutate(phase.id);
                          }
                        }}
                      >
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
    </AdminPanel>
  );
}

function WorkflowMasterDataPanel({
  procedures,
  boms,
  bomLines,
  phaseEquipment,
  isLoading,
}: {
  procedures: ProcedureCatalogItem[];
  boms: BomCatalogItem[];
  bomLines: BomLineCatalogItem[];
  phaseEquipment: PhaseEquipmentCatalogItem[];
  isLoading: boolean;
}) {
  const queryClient = useQueryClient();
  const [procedureEditingId, setProcedureEditingId] = useState<string | null>(null);
  const [procedureName, setProcedureName] = useState('');
  const [procedureShort, setProcedureShort] = useState('');
  const [procedureDesc, setProcedureDesc] = useState('');
  const [bomEditingId, setBomEditingId] = useState<string | null>(null);
  const [bomName, setBomName] = useState('');
  const [bomKeyText, setBomKeyText] = useState('');
  const [bomLineEditingId, setBomLineEditingId] = useState<string | null>(null);
  const [bomLineBomId, setBomLineBomId] = useState('');
  const [bomLineDescription, setBomLineDescription] = useState('');
  const [bomLineQuantity, setBomLineQuantity] = useState('');
  const [bomLineUom, setBomLineUom] = useState('');
  const [bomLineHasSerial, setBomLineHasSerial] = useState(false);
  const [equipmentEditingId, setEquipmentEditingId] = useState<string | null>(null);
  const [equipmentId, setEquipmentId] = useState('');
  const [equipmentName, setEquipmentName] = useState('');
  const [equipmentDescription, setEquipmentDescription] = useState('');

  const invalidateMasterData = () => {
    queryClient.invalidateQueries({ queryKey: ['procedures'] });
    queryClient.invalidateQueries({ queryKey: ['boms'] });
    queryClient.invalidateQueries({ queryKey: ['bom-lines'] });
    queryClient.invalidateQueries({ queryKey: ['phase-equipment'] });
  };

  const resetProcedure = () => {
    setProcedureEditingId(null);
    setProcedureName('');
    setProcedureShort('');
    setProcedureDesc('');
  };

  const resetBom = () => {
    setBomEditingId(null);
    setBomName('');
    setBomKeyText('');
  };

  const resetBomLine = () => {
    setBomLineEditingId(null);
    setBomLineBomId('');
    setBomLineDescription('');
    setBomLineQuantity('');
    setBomLineUom('');
    setBomLineHasSerial(false);
  };

  const resetEquipment = () => {
    setEquipmentEditingId(null);
    setEquipmentId('');
    setEquipmentName('');
    setEquipmentDescription('');
  };

  const procedureMutationPayload = (): ProcedureMutationPayload => ({
    procedureName: procedureName.trim() || null,
    procedureShort: procedureShort.trim() || null,
    procedureDesc: procedureDesc.trim() || null,
  });

  const bomMutationPayload = (): BomMutationPayload => ({
    bomName: bomName.trim() || null,
    keyText: bomKeyText.trim() || null,
  });

  const bomLineMutationPayload = (): BomLineMutationPayload => ({
    bomId: bomLineBomId,
    description: bomLineDescription.trim() || null,
    quantity: bomLineQuantity.trim() || null,
    uom: bomLineUom.trim() || null,
    hasSerial: bomLineHasSerial,
  });

  const equipmentMutationPayload = (): PhaseEquipmentMutationPayload => ({
    equipId: equipmentId.trim() || null,
    name: equipmentName.trim() || null,
    description: equipmentDescription.trim() || null,
  });

  const createProcedureMutation = useMutation({
    mutationFn: createProcedure,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['procedures'] });
      toast.success('Procedure created');
      resetProcedure();
    },
    onError: (e: AxiosError<{ error?: string }>) => toast.error(errorMessage(e, 'Failed to create procedure')),
  });

  const updateProcedureMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ProcedureMutationPayload }) => updateProcedure(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['procedures'] });
      toast.success('Procedure updated');
      resetProcedure();
    },
    onError: (e: AxiosError<{ error?: string }>) => toast.error(errorMessage(e, 'Failed to update procedure')),
  });

  const deleteProcedureMutation = useMutation({
    mutationFn: deleteProcedure,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['procedures'] });
      toast.success('Procedure deleted');
      resetProcedure();
    },
    onError: (e: AxiosError<{ error?: string }>) => toast.error(errorMessage(e, 'Failed to delete procedure')),
  });

  const createBomMutation = useMutation({
    mutationFn: createBom,
    onSuccess: () => {
      invalidateMasterData();
      toast.success('BOM created');
      resetBom();
    },
    onError: (e: AxiosError<{ error?: string }>) => toast.error(errorMessage(e, 'Failed to create BOM')),
  });

  const updateBomMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: BomMutationPayload }) => updateBom(id, payload),
    onSuccess: () => {
      invalidateMasterData();
      toast.success('BOM updated');
      resetBom();
    },
    onError: (e: AxiosError<{ error?: string }>) => toast.error(errorMessage(e, 'Failed to update BOM')),
  });

  const deleteBomMutation = useMutation({
    mutationFn: deleteBom,
    onSuccess: () => {
      invalidateMasterData();
      toast.success('BOM deleted');
      resetBom();
    },
    onError: (e: AxiosError<{ error?: string }>) => toast.error(errorMessage(e, 'Failed to delete BOM')),
  });

  const createBomLineMutation = useMutation({
    mutationFn: createBomLine,
    onSuccess: () => {
      invalidateMasterData();
      toast.success('BOM line created');
      resetBomLine();
    },
    onError: (e: AxiosError<{ error?: string }>) => toast.error(errorMessage(e, 'Failed to create BOM line')),
  });

  const updateBomLineMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: BomLineMutationPayload }) => updateBomLine(id, payload),
    onSuccess: () => {
      invalidateMasterData();
      toast.success('BOM line updated');
      resetBomLine();
    },
    onError: (e: AxiosError<{ error?: string }>) => toast.error(errorMessage(e, 'Failed to update BOM line')),
  });

  const deleteBomLineMutation = useMutation({
    mutationFn: deleteBomLine,
    onSuccess: () => {
      invalidateMasterData();
      toast.success('BOM line deleted');
      resetBomLine();
    },
    onError: (e: AxiosError<{ error?: string }>) => toast.error(errorMessage(e, 'Failed to delete BOM line')),
  });

  const createEquipmentMutation = useMutation({
    mutationFn: createPhaseEquipment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['phase-equipment'] });
      toast.success('Equipment created');
      resetEquipment();
    },
    onError: (e: AxiosError<{ error?: string }>) => toast.error(errorMessage(e, 'Failed to create equipment')),
  });

  const updateEquipmentMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: PhaseEquipmentMutationPayload }) => updatePhaseEquipment(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['phase-equipment'] });
      toast.success('Equipment updated');
      resetEquipment();
    },
    onError: (e: AxiosError<{ error?: string }>) => toast.error(errorMessage(e, 'Failed to update equipment')),
  });

  const deleteEquipmentMutation = useMutation({
    mutationFn: deletePhaseEquipment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['phase-equipment'] });
      toast.success('Equipment deleted');
      resetEquipment();
    },
    onError: (e: AxiosError<{ error?: string }>) => toast.error(errorMessage(e, 'Failed to delete equipment')),
  });

  const submitProcedure = (event: FormEvent) => {
    event.preventDefault();
    if (!procedureName.trim() && !procedureShort.trim()) return;
    const payload = procedureMutationPayload();
    if (procedureEditingId) updateProcedureMutation.mutate({ id: procedureEditingId, payload });
    else createProcedureMutation.mutate(payload);
  };

  const submitBom = (event: FormEvent) => {
    event.preventDefault();
    if (!bomName.trim()) return;
    const payload = bomMutationPayload();
    if (bomEditingId) updateBomMutation.mutate({ id: bomEditingId, payload });
    else createBomMutation.mutate(payload);
  };

  const submitBomLine = (event: FormEvent) => {
    event.preventDefault();
    if (!bomLineBomId || !bomLineDescription.trim()) return;
    const payload = bomLineMutationPayload();
    if (bomLineEditingId) updateBomLineMutation.mutate({ id: bomLineEditingId, payload });
    else createBomLineMutation.mutate({ ...payload, bomId: bomLineBomId });
  };

  const submitEquipment = (event: FormEvent) => {
    event.preventDefault();
    if (!equipmentName.trim() && !equipmentId.trim()) return;
    const payload = equipmentMutationPayload();
    if (equipmentEditingId) updateEquipmentMutation.mutate({ id: equipmentEditingId, payload });
    else createEquipmentMutation.mutate(payload);
  };

  const busy =
    createProcedureMutation.isPending ||
    updateProcedureMutation.isPending ||
    deleteProcedureMutation.isPending ||
    createBomMutation.isPending ||
    updateBomMutation.isPending ||
    deleteBomMutation.isPending ||
    createBomLineMutation.isPending ||
    updateBomLineMutation.isPending ||
    deleteBomLineMutation.isPending ||
    createEquipmentMutation.isPending ||
    updateEquipmentMutation.isPending ||
    deleteEquipmentMutation.isPending;

  return (
    <AdminPanel title="Workflow master data" description="Administer procedure, BOM, BOM-line, and equipment catalogs used by phase setup.">
      {isLoading ? (
        <div className="flex h-40 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
        </div>
      ) : (
        <div className="space-y-6">
          <form onSubmit={submitProcedure} className="grid gap-3 lg:grid-cols-[1fr_160px_1.5fr_auto] lg:items-end">
            <div className="grid gap-1.5">
              <Label htmlFor="procedure-name">Procedure</Label>
              <Input id="procedure-name" value={procedureName} onChange={(event) => setProcedureName(event.target.value)} placeholder="Intake checklist" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="procedure-short">Short</Label>
              <Input id="procedure-short" value={procedureShort} onChange={(event) => setProcedureShort(event.target.value)} placeholder="INTAKE" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="procedure-desc">Description</Label>
              <Input id="procedure-desc" value={procedureDesc} onChange={(event) => setProcedureDesc(event.target.value)} placeholder="optional" />
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={busy || (!procedureName.trim() && !procedureShort.trim())}>
                {procedureEditingId ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                {procedureEditingId ? 'Save' : 'Create'}
              </Button>
              {procedureEditingId ? <Button type="button" variant="outline" onClick={resetProcedure} disabled={busy}>Cancel</Button> : null}
            </div>
          </form>

          {procedures.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Procedure</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {procedures.map((procedure) => (
                  <TableRow key={procedure.id}>
                    <TableCell>
                      <div className="font-medium text-gray-800 dark:text-white/90">{catalogLabel(procedure, procedure.procedureName, procedure.procedureShort)}</div>
                      <div className="break-all text-xs text-gray-500">{procedure.procedureShort || procedure.id}</div>
                    </TableCell>
                    <TableCell className="whitespace-normal">{procedure.procedureDesc || '-'}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <Button type="button" variant="outline" size="icon" disabled={busy} onClick={() => {
                          setProcedureEditingId(procedure.id);
                          setProcedureName(procedure.procedureName || '');
                          setProcedureShort(procedure.procedureShort || '');
                          setProcedureDesc(procedure.procedureDesc || '');
                        }}>
                          <Edit3 className="h-4 w-4" />
                        </Button>
                        <Button type="button" variant="outline" size="icon" disabled={busy} onClick={() => {
                          if (window.confirm(`Delete ${catalogLabel(procedure, procedure.procedureName, procedure.procedureShort)}?`)) deleteProcedureMutation.mutate(procedure.id);
                        }}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : null}

          <div className="grid gap-6 xl:grid-cols-2">
            <div className="space-y-4">
              <form onSubmit={submitBom} className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
                <div className="grid gap-1.5">
                  <Label htmlFor="bom-name">BOM</Label>
                  <Input id="bom-name" value={bomName} onChange={(event) => setBomName(event.target.value)} placeholder="AmGraft intake BOM" />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="bom-key">Key</Label>
                  <Input id="bom-key" value={bomKeyText} onChange={(event) => setBomKeyText(event.target.value)} placeholder="optional" />
                </div>
                <div className="flex gap-2">
                  <Button type="submit" disabled={busy || !bomName.trim()}>
                    {bomEditingId ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                    {bomEditingId ? 'Save' : 'Create'}
                  </Button>
                  {bomEditingId ? <Button type="button" variant="outline" onClick={resetBom} disabled={busy}>Cancel</Button> : null}
                </div>
              </form>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>BOM</TableHead>
                    <TableHead>Lines</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {boms.map((bom) => (
                    <TableRow key={bom.id}>
                      <TableCell>
                        <div className="font-medium text-gray-800 dark:text-white/90">{catalogLabel(bom, bom.bomName, bom.keyText)}</div>
                        <div className="break-all text-xs text-gray-500">{bom.keyText || bom.id}</div>
                      </TableCell>
                      <TableCell>{bom._count?.lines ?? bomLines.filter((line) => line.bomId === bom.id).length}</TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          <Button type="button" variant="outline" size="icon" disabled={busy} onClick={() => {
                            setBomEditingId(bom.id);
                            setBomName(bom.bomName || '');
                            setBomKeyText(bom.keyText || '');
                          }}>
                            <Edit3 className="h-4 w-4" />
                          </Button>
                          <Button type="button" variant="outline" size="icon" disabled={busy} onClick={() => {
                            if (window.confirm(`Delete ${catalogLabel(bom, bom.bomName, bom.keyText)}?`)) deleteBomMutation.mutate(bom.id);
                          }}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="space-y-4">
              <form onSubmit={submitEquipment} className="grid gap-3 md:grid-cols-[150px_1fr_1fr_auto] md:items-end">
                <div className="grid gap-1.5">
                  <Label htmlFor="equipment-id">Equipment ID</Label>
                  <Input id="equipment-id" value={equipmentId} onChange={(event) => setEquipmentId(event.target.value)} placeholder="EQ-1" />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="equipment-name">Equipment</Label>
                  <Input id="equipment-name" value={equipmentName} onChange={(event) => setEquipmentName(event.target.value)} placeholder="Heat sealer" />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="equipment-description">Description</Label>
                  <Input id="equipment-description" value={equipmentDescription} onChange={(event) => setEquipmentDescription(event.target.value)} placeholder="optional" />
                </div>
                <div className="flex gap-2">
                  <Button type="submit" disabled={busy || (!equipmentName.trim() && !equipmentId.trim())}>
                    {equipmentEditingId ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                    {equipmentEditingId ? 'Save' : 'Create'}
                  </Button>
                  {equipmentEditingId ? <Button type="button" variant="outline" onClick={resetEquipment} disabled={busy}>Cancel</Button> : null}
                </div>
              </form>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Equipment</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {phaseEquipment.map((equipment) => (
                    <TableRow key={equipment.id}>
                      <TableCell>
                        <div className="font-medium text-gray-800 dark:text-white/90">{catalogLabel(equipment, equipment.name, equipment.equipId)}</div>
                        <div className="break-all text-xs text-gray-500">{equipment.equipId || equipment.id}</div>
                      </TableCell>
                      <TableCell className="whitespace-normal">{equipment.description || '-'}</TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          <Button type="button" variant="outline" size="icon" disabled={busy} onClick={() => {
                            setEquipmentEditingId(equipment.id);
                            setEquipmentId(equipment.equipId || '');
                            setEquipmentName(equipment.name || '');
                            setEquipmentDescription(equipment.description || '');
                          }}>
                            <Edit3 className="h-4 w-4" />
                          </Button>
                          <Button type="button" variant="outline" size="icon" disabled={busy} onClick={() => {
                            if (window.confirm(`Delete ${catalogLabel(equipment, equipment.name, equipment.equipId)}?`)) deleteEquipmentMutation.mutate(equipment.id);
                          }}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          <form onSubmit={submitBomLine} className="grid gap-3 lg:grid-cols-[1fr_1.5fr_120px_100px_auto_auto] lg:items-end">
            <div className="grid gap-1.5">
              <Label htmlFor="bom-line-bom">BOM</Label>
              <select
                id="bom-line-bom"
                value={bomLineBomId}
                onChange={(event) => setBomLineBomId(event.target.value)}
                className="h-11 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 shadow-theme-xs outline-none focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
              >
                <option value="">Select BOM</option>
                {boms.map((bom) => (
                  <option key={bom.id} value={bom.id}>{catalogLabel(bom, bom.bomName, bom.keyText)}</option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="bom-line-description">Line</Label>
              <Input id="bom-line-description" value={bomLineDescription} onChange={(event) => setBomLineDescription(event.target.value)} placeholder="AmGraft membrane" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="bom-line-quantity">Quantity</Label>
              <Input id="bom-line-quantity" type="number" step="0.0001" value={bomLineQuantity} onChange={(event) => setBomLineQuantity(event.target.value)} placeholder="1" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="bom-line-uom">UOM</Label>
              <Input id="bom-line-uom" value={bomLineUom} onChange={(event) => setBomLineUom(event.target.value)} placeholder="ea" />
            </div>
            <label className="flex h-11 items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input type="checkbox" checked={bomLineHasSerial} onChange={(event) => setBomLineHasSerial(event.target.checked)} />
              Serial
            </label>
            <div className="flex gap-2">
              <Button type="submit" disabled={busy || !bomLineBomId || !bomLineDescription.trim()}>
                {bomLineEditingId ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                {bomLineEditingId ? 'Save' : 'Create'}
              </Button>
              {bomLineEditingId ? <Button type="button" variant="outline" onClick={resetBomLine} disabled={busy}>Cancel</Button> : null}
            </div>
          </form>

          {bomLines.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>BOM line</TableHead>
                  <TableHead>BOM</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>Serial</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bomLines.map((line) => (
                  <TableRow key={line.id}>
                    <TableCell>
                      <div className="font-medium text-gray-800 dark:text-white/90">{line.description || line.id}</div>
                      <div className="break-all text-xs text-gray-500">{line.keyText || line.id}</div>
                    </TableCell>
                    <TableCell>{boms.find((bom) => bom.id === line.bomId)?.bomName || line.bomName || line.bomId}</TableCell>
                    <TableCell>{line.quantity ?? '-'} {line.uom || ''}</TableCell>
                    <TableCell>{line.hasSerial ? 'Yes' : 'No'}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <Button type="button" variant="outline" size="icon" disabled={busy} onClick={() => {
                          setBomLineEditingId(line.id);
                          setBomLineBomId(line.bomId);
                          setBomLineDescription(line.description || '');
                          setBomLineQuantity(line.quantity == null ? '' : String(line.quantity));
                          setBomLineUom(line.uom || '');
                          setBomLineHasSerial(line.hasSerial);
                        }}>
                          <Edit3 className="h-4 w-4" />
                        </Button>
                        <Button type="button" variant="outline" size="icon" disabled={busy} onClick={() => {
                          if (window.confirm(`Delete ${line.description || line.id}?`)) deleteBomLineMutation.mutate(line.id);
                        }}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState icon={<Wrench className="h-6 w-6" />} title="No BOM lines yet" description="Create a BOM header before adding material or serial requirements." />
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
  const proceduresQuery = useQuery({
    queryKey: ['procedures'],
    queryFn: fetchProcedures,
  });
  const bomsQuery = useQuery({
    queryKey: ['boms'],
    queryFn: fetchBoms,
  });
  const bomLinesQuery = useQuery({
    queryKey: ['bom-lines'],
    queryFn: () => fetchBomLines(),
  });
  const phaseEquipmentQuery = useQuery({
    queryKey: ['phase-equipment'],
    queryFn: fetchPhaseEquipment,
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

      <PhaseCatalogPanel phases={phasesQuery.data ?? []} isLoading={phasesQuery.isLoading} />

      <WorkflowMasterDataPanel
        procedures={proceduresQuery.data ?? []}
        boms={bomsQuery.data ?? []}
        bomLines={bomLinesQuery.data ?? []}
        phaseEquipment={phaseEquipmentQuery.data ?? []}
        isLoading={proceduresQuery.isLoading || bomsQuery.isLoading || bomLinesQuery.isLoading || phaseEquipmentQuery.isLoading}
      />

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
