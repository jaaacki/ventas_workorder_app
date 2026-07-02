import { useMemo, useState, type FormEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import {
  createBom,
  createBomLine,
  addPhaseEquipment,
  addPhaseProcedure,
  fetchPhases,
  fetchBoms,
  fetchBomLines,
  fetchPhaseEquipment,
  fetchProcedures,
  fetchPhaseEquipmentBindings,
  fetchPhaseProcedures,
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
  deletePhaseEquipmentBinding,
  deletePhaseProcedure,
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
  type PhaseEquipmentBinding,
  type PhaseEquipmentCatalogItem,
  type PhaseEquipmentMutationPayload,
  type PhaseMutationPayload,
  type PhaseProcedureBinding,
  type ProcedureCatalogItem,
  type ProcedureMutationPayload,
  type WorkflowDetail,
  type WorkflowPhaseBinding,
  type WorkflowSummary,
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

function ConfirmDeleteDialog({
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

function WorkflowCard({
  workflow,
  selected,
  onSelect,
  onEdit,
}: {
  workflow: WorkflowSummary;
  selected: boolean;
  onSelect: () => void;
  onEdit: () => void;
}) {
  return (
    <div
      className={`rounded-lg border p-4 text-left transition ${
        selected
          ? 'border-brand-500 bg-brand-50 dark:border-brand-400 dark:bg-brand-500/10'
          : 'border-gray-100 bg-gray-50 hover:border-brand-200 dark:border-gray-800 dark:bg-white/[0.03]'
      }`}
    >
      <button type="button" onClick={onSelect} className="block w-full text-left">
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
      <div className="mt-4 flex justify-end">
        <Button type="button" variant="outline" size="sm" onClick={onEdit}>
          <Edit3 className="h-4 w-4" />
          Edit
        </Button>
      </div>
    </div>
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

function procedureLabel(procedure?: ProcedureCatalogItem | PhaseProcedureBinding['procedure'] | null) {
  if (!procedure) return 'Unknown procedure';
  return procedure.procedureName || procedure.procedureShort || procedure.id;
}

function equipmentLabel(equipment?: PhaseEquipmentCatalogItem | PhaseEquipmentBinding['phaseEquip'] | null) {
  if (!equipment) return 'Unknown equipment';
  return equipment.name || equipment.equipId || equipment.id;
}

function PhaseRequirementsPanel({
  phases,
  procedures,
  phaseEquipment,
  isLoading,
}: {
  phases: PhaseCatalogItem[];
  procedures: ProcedureCatalogItem[];
  phaseEquipment: PhaseEquipmentCatalogItem[];
  isLoading: boolean;
}) {
  const queryClient = useQueryClient();
  const [selectedPhaseId, setSelectedPhaseId] = useState('');
  const [procedureToAdd, setProcedureToAdd] = useState('');
  const [equipmentToAdd, setEquipmentToAdd] = useState('');
  const effectivePhaseId = selectedPhaseId || phases[0]?.id || '';

  const procedureBindingsQuery = useQuery({
    queryKey: ['phase-procedures', effectivePhaseId],
    queryFn: () => fetchPhaseProcedures(effectivePhaseId),
    enabled: Boolean(effectivePhaseId),
  });

  const equipmentBindingsQuery = useQuery({
    queryKey: ['phase-equipment-bindings', effectivePhaseId],
    queryFn: () => fetchPhaseEquipmentBindings(effectivePhaseId),
    enabled: Boolean(effectivePhaseId),
  });

  const procedureBindings = procedureBindingsQuery.data ?? [];
  const equipmentBindings = equipmentBindingsQuery.data ?? [];
  const boundProcedureIds = new Set(procedureBindings.map((binding) => binding.procedureId));
  const boundEquipmentIds = new Set(equipmentBindings.map((binding) => binding.phaseEquipId));
  const availableProcedures = procedures.filter((procedure) => !boundProcedureIds.has(procedure.id));
  const availableEquipment = phaseEquipment.filter((equipment) => !boundEquipmentIds.has(equipment.id));

  const invalidateBindings = () => {
    queryClient.invalidateQueries({ queryKey: ['phase-procedures', effectivePhaseId] });
    queryClient.invalidateQueries({ queryKey: ['phase-equipment-bindings', effectivePhaseId] });
  };

  const addProcedureMutation = useMutation({
    mutationFn: () => addPhaseProcedure(effectivePhaseId, procedureToAdd),
    onSuccess: () => {
      invalidateBindings();
      setProcedureToAdd('');
      toast.success('Procedure bound');
    },
    onError: (e: AxiosError<{ error?: string }>) => toast.error(errorMessage(e, 'Failed to bind procedure')),
  });

  const deleteProcedureMutation = useMutation({
    mutationFn: (procedureId: string) => deletePhaseProcedure(effectivePhaseId, procedureId),
    onSuccess: () => {
      invalidateBindings();
      toast.success('Procedure unbound');
    },
    onError: (e: AxiosError<{ error?: string }>) => toast.error(errorMessage(e, 'Failed to unbind procedure')),
  });

  const addEquipmentMutation = useMutation({
    mutationFn: () => addPhaseEquipment(effectivePhaseId, equipmentToAdd),
    onSuccess: () => {
      invalidateBindings();
      setEquipmentToAdd('');
      toast.success('Equipment bound');
    },
    onError: (e: AxiosError<{ error?: string }>) => toast.error(errorMessage(e, 'Failed to bind equipment')),
  });

  const deleteEquipmentMutation = useMutation({
    mutationFn: (phaseEquipId: string) => deletePhaseEquipmentBinding(effectivePhaseId, phaseEquipId),
    onSuccess: () => {
      invalidateBindings();
      toast.success('Equipment unbound');
    },
    onError: (e: AxiosError<{ error?: string }>) => toast.error(errorMessage(e, 'Failed to unbind equipment')),
  });

  const busy =
    addProcedureMutation.isPending ||
    deleteProcedureMutation.isPending ||
    addEquipmentMutation.isPending ||
    deleteEquipmentMutation.isPending ||
    procedureBindingsQuery.isLoading ||
    equipmentBindingsQuery.isLoading;

  return (
    <AdminPanel title="Phase requirements" description="Bind controlled procedures and allowed equipment to each phase.">
      {isLoading ? (
        <div className="flex h-40 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
        </div>
      ) : !phases.length ? (
        <EmptyState icon={<WorkflowIcon className="h-6 w-6" />} title="No phases available" description="Create phase catalog entries before binding requirements." />
      ) : (
        <div className="space-y-5">
          <div className="grid gap-1.5 md:max-w-md">
            <Label htmlFor="requirements-phase">Phase</Label>
            <select
              id="requirements-phase"
              value={effectivePhaseId}
              onChange={(event) => {
                setSelectedPhaseId(event.target.value);
                setProcedureToAdd('');
                setEquipmentToAdd('');
              }}
              className="h-11 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 shadow-theme-xs outline-none focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
            >
              {phases.map((phase) => (
                <option key={phase.id} value={phase.id}>
                  {phaseLabel(phase)}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
                <div className="grid gap-1.5">
                  <Label htmlFor="procedure-bind">Procedure</Label>
                  <select
                    id="procedure-bind"
                    value={procedureToAdd}
                    onChange={(event) => setProcedureToAdd(event.target.value)}
                    className="h-11 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 shadow-theme-xs outline-none focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                  >
                    <option value="">Select procedure</option>
                    {availableProcedures.map((procedure) => (
                      <option key={procedure.id} value={procedure.id}>
                        {procedureLabel(procedure)}
                      </option>
                    ))}
                  </select>
                </div>
                <Button type="button" disabled={busy || !procedureToAdd} onClick={() => addProcedureMutation.mutate()}>
                  <Plus className="h-4 w-4" />
                  Bind
                </Button>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Bound procedures</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {procedureBindings.map((binding) => (
                    <TableRow key={binding.procedureId}>
                      <TableCell>
                        <div className="font-medium text-gray-800 dark:text-white/90">{procedureLabel(binding.procedure)}</div>
                        <div className="text-xs text-gray-500">{binding.procedure.procedureShort || binding.procedureId}</div>
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end">
                          <Button type="button" variant="outline" size="icon" disabled={busy} onClick={() => deleteProcedureMutation.mutate(binding.procedureId)}>
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
              <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
                <div className="grid gap-1.5">
                  <Label htmlFor="equipment-bind">Equipment</Label>
                  <select
                    id="equipment-bind"
                    value={equipmentToAdd}
                    onChange={(event) => setEquipmentToAdd(event.target.value)}
                    className="h-11 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 shadow-theme-xs outline-none focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                  >
                    <option value="">Select equipment</option>
                    {availableEquipment.map((equipment) => (
                      <option key={equipment.id} value={equipment.id}>
                        {equipmentLabel(equipment)}
                      </option>
                    ))}
                  </select>
                </div>
                <Button type="button" disabled={busy || !equipmentToAdd} onClick={() => addEquipmentMutation.mutate()}>
                  <Plus className="h-4 w-4" />
                  Bind
                </Button>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Allowed equipment</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {equipmentBindings.map((binding) => (
                    <TableRow key={binding.phaseEquipId}>
                      <TableCell>
                        <div className="font-medium text-gray-800 dark:text-white/90">{equipmentLabel(binding.phaseEquip)}</div>
                        <div className="text-xs text-gray-500">{binding.phaseEquip.equipId || binding.phaseEquipId}</div>
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end">
                          <Button type="button" variant="outline" size="icon" disabled={busy} onClick={() => deleteEquipmentMutation.mutate(binding.phaseEquipId)}>
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
        </div>
      )}
    </AdminPanel>
  );
}

function PhaseCatalogPanel({ phases, isLoading }: { phases: PhaseCatalogItem[]; isLoading: boolean }) {
  const queryClient = useQueryClient();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [phaseToDelete, setPhaseToDelete] = useState<PhaseCatalogItem | null>(null);
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
      setSheetOpen(false);
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
      setSheetOpen(false);
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
      setPhaseToDelete(null);
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
    setSheetOpen(true);
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
    <AdminPanel
      title="Phase catalog"
      description="Tenant phase master data available for workflow binding."
      action={
        <Button
          type="button"
          onClick={() => {
            resetForm();
            setSheetOpen(true);
          }}
        >
          <Plus className="h-4 w-4" />
          New phase
        </Button>
      }
    >
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <form onSubmit={submitPhase} className="flex min-h-full flex-col">
            <SheetHeader>
              <SheetTitle>{editingPhaseId ? 'Edit phase' : 'Create phase'}</SheetTitle>
              <SheetDescription>Maintain the catalog fields used when workflows bind ordered phases.</SheetDescription>
            </SheetHeader>
            <div className="grid gap-4 p-4">
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
            </div>
            <SheetFooter>
              <Button type="submit" disabled={busy || (!phaseName.trim() && !phaseShort.trim())}>
                {editingPhaseId ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                {editingPhaseId ? 'Save phase' : 'Create phase'}
              </Button>
              <Button type="button" variant="outline" onClick={() => setSheetOpen(false)} disabled={busy}>
                Cancel
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
      <ConfirmDeleteDialog
        open={Boolean(phaseToDelete)}
        title="Delete phase?"
        description={phaseToDelete ? `Delete ${phaseLabel(phaseToDelete)} from the phase catalog.` : ''}
        busy={busy}
        onOpenChange={(open) => {
          if (!open) setPhaseToDelete(null);
        }}
        onConfirm={() => {
          if (phaseToDelete) deletePhaseMutation.mutate(phaseToDelete.id);
        }}
      />
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
                      <Button type="button" variant="outline" size="icon" disabled={busy} onClick={() => setPhaseToDelete(phase)}>
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
  const [procedureSheetOpen, setProcedureSheetOpen] = useState(false);
  const [bomSheetOpen, setBomSheetOpen] = useState(false);
  const [bomLineSheetOpen, setBomLineSheetOpen] = useState(false);
  const [equipmentSheetOpen, setEquipmentSheetOpen] = useState(false);
  const [procedureToDelete, setProcedureToDelete] = useState<ProcedureCatalogItem | null>(null);
  const [bomToDelete, setBomToDelete] = useState<BomCatalogItem | null>(null);
  const [bomLineToDelete, setBomLineToDelete] = useState<BomLineCatalogItem | null>(null);
  const [equipmentToDelete, setEquipmentToDelete] = useState<PhaseEquipmentCatalogItem | null>(null);
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
      setProcedureSheetOpen(false);
    },
    onError: (e: AxiosError<{ error?: string }>) => toast.error(errorMessage(e, 'Failed to create procedure')),
  });

  const updateProcedureMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ProcedureMutationPayload }) => updateProcedure(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['procedures'] });
      toast.success('Procedure updated');
      resetProcedure();
      setProcedureSheetOpen(false);
    },
    onError: (e: AxiosError<{ error?: string }>) => toast.error(errorMessage(e, 'Failed to update procedure')),
  });

  const deleteProcedureMutation = useMutation({
    mutationFn: deleteProcedure,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['procedures'] });
      toast.success('Procedure deleted');
      resetProcedure();
      setProcedureToDelete(null);
    },
    onError: (e: AxiosError<{ error?: string }>) => toast.error(errorMessage(e, 'Failed to delete procedure')),
  });

  const createBomMutation = useMutation({
    mutationFn: createBom,
    onSuccess: () => {
      invalidateMasterData();
      toast.success('BOM created');
      resetBom();
      setBomSheetOpen(false);
    },
    onError: (e: AxiosError<{ error?: string }>) => toast.error(errorMessage(e, 'Failed to create BOM')),
  });

  const updateBomMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: BomMutationPayload }) => updateBom(id, payload),
    onSuccess: () => {
      invalidateMasterData();
      toast.success('BOM updated');
      resetBom();
      setBomSheetOpen(false);
    },
    onError: (e: AxiosError<{ error?: string }>) => toast.error(errorMessage(e, 'Failed to update BOM')),
  });

  const deleteBomMutation = useMutation({
    mutationFn: deleteBom,
    onSuccess: () => {
      invalidateMasterData();
      toast.success('BOM deleted');
      resetBom();
      setBomToDelete(null);
    },
    onError: (e: AxiosError<{ error?: string }>) => toast.error(errorMessage(e, 'Failed to delete BOM')),
  });

  const createBomLineMutation = useMutation({
    mutationFn: createBomLine,
    onSuccess: () => {
      invalidateMasterData();
      toast.success('BOM line created');
      resetBomLine();
      setBomLineSheetOpen(false);
    },
    onError: (e: AxiosError<{ error?: string }>) => toast.error(errorMessage(e, 'Failed to create BOM line')),
  });

  const updateBomLineMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: BomLineMutationPayload }) => updateBomLine(id, payload),
    onSuccess: () => {
      invalidateMasterData();
      toast.success('BOM line updated');
      resetBomLine();
      setBomLineSheetOpen(false);
    },
    onError: (e: AxiosError<{ error?: string }>) => toast.error(errorMessage(e, 'Failed to update BOM line')),
  });

  const deleteBomLineMutation = useMutation({
    mutationFn: deleteBomLine,
    onSuccess: () => {
      invalidateMasterData();
      toast.success('BOM line deleted');
      resetBomLine();
      setBomLineToDelete(null);
    },
    onError: (e: AxiosError<{ error?: string }>) => toast.error(errorMessage(e, 'Failed to delete BOM line')),
  });

  const createEquipmentMutation = useMutation({
    mutationFn: createPhaseEquipment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['phase-equipment'] });
      toast.success('Equipment created');
      resetEquipment();
      setEquipmentSheetOpen(false);
    },
    onError: (e: AxiosError<{ error?: string }>) => toast.error(errorMessage(e, 'Failed to create equipment')),
  });

  const updateEquipmentMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: PhaseEquipmentMutationPayload }) => updatePhaseEquipment(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['phase-equipment'] });
      toast.success('Equipment updated');
      resetEquipment();
      setEquipmentSheetOpen(false);
    },
    onError: (e: AxiosError<{ error?: string }>) => toast.error(errorMessage(e, 'Failed to update equipment')),
  });

  const deleteEquipmentMutation = useMutation({
    mutationFn: deletePhaseEquipment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['phase-equipment'] });
      toast.success('Equipment deleted');
      resetEquipment();
      setEquipmentToDelete(null);
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

  const startProcedureCreate = () => {
    resetProcedure();
    setProcedureSheetOpen(true);
  };

  const startProcedureEdit = (procedure: ProcedureCatalogItem) => {
    setProcedureEditingId(procedure.id);
    setProcedureName(procedure.procedureName || '');
    setProcedureShort(procedure.procedureShort || '');
    setProcedureDesc(procedure.procedureDesc || '');
    setProcedureSheetOpen(true);
  };

  const startBomCreate = () => {
    resetBom();
    setBomSheetOpen(true);
  };

  const startBomEdit = (bom: BomCatalogItem) => {
    setBomEditingId(bom.id);
    setBomName(bom.bomName || '');
    setBomKeyText(bom.keyText || '');
    setBomSheetOpen(true);
  };

  const startEquipmentCreate = () => {
    resetEquipment();
    setEquipmentSheetOpen(true);
  };

  const startEquipmentEdit = (equipment: PhaseEquipmentCatalogItem) => {
    setEquipmentEditingId(equipment.id);
    setEquipmentId(equipment.equipId || '');
    setEquipmentName(equipment.name || '');
    setEquipmentDescription(equipment.description || '');
    setEquipmentSheetOpen(true);
  };

  const startBomLineCreate = () => {
    resetBomLine();
    setBomLineSheetOpen(true);
  };

  const startBomLineEdit = (line: BomLineCatalogItem) => {
    setBomLineEditingId(line.id);
    setBomLineBomId(line.bomId);
    setBomLineDescription(line.description || '');
    setBomLineQuantity(line.quantity == null ? '' : String(line.quantity));
    setBomLineUom(line.uom || '');
    setBomLineHasSerial(line.hasSerial);
    setBomLineSheetOpen(true);
  };

  return (
    <AdminPanel title="Workflow master data" description="Administer procedure, BOM, BOM-line, and equipment catalogs used by phase setup.">
      {isLoading ? (
        <div className="flex h-40 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={startProcedureCreate}>
              <Plus className="h-4 w-4" />
              New procedure
            </Button>
            <Button type="button" variant="outline" onClick={startBomCreate}>
              <Plus className="h-4 w-4" />
              New BOM
            </Button>
            <Button type="button" variant="outline" onClick={startEquipmentCreate}>
              <Plus className="h-4 w-4" />
              New equipment
            </Button>
            <Button type="button" variant="outline" onClick={startBomLineCreate} disabled={!boms.length}>
              <Plus className="h-4 w-4" />
              New BOM line
            </Button>
          </div>

          <Sheet open={procedureSheetOpen} onOpenChange={setProcedureSheetOpen}>
            <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
              <form onSubmit={submitProcedure} className="flex min-h-full flex-col">
                <SheetHeader>
                  <SheetTitle>{procedureEditingId ? 'Edit procedure' : 'Create procedure'}</SheetTitle>
                  <SheetDescription>Maintain procedure catalog entries used by phase requirements.</SheetDescription>
                </SheetHeader>
                <div className="grid gap-4 p-4">
                  <div className="grid gap-1.5">
                    <Label htmlFor="procedure-sheet-name">Procedure</Label>
                    <Input id="procedure-sheet-name" value={procedureName} onChange={(event) => setProcedureName(event.target.value)} placeholder="Intake checklist" />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="procedure-sheet-short">Short</Label>
                    <Input id="procedure-sheet-short" value={procedureShort} onChange={(event) => setProcedureShort(event.target.value)} placeholder="INTAKE" />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="procedure-sheet-desc">Description</Label>
                    <Input id="procedure-sheet-desc" value={procedureDesc} onChange={(event) => setProcedureDesc(event.target.value)} placeholder="optional" />
                  </div>
                </div>
                <SheetFooter>
                  <Button type="submit" disabled={busy || (!procedureName.trim() && !procedureShort.trim())}>
                    {procedureEditingId ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                    {procedureEditingId ? 'Save procedure' : 'Create procedure'}
                  </Button>
                  <Button type="button" variant="outline" disabled={busy} onClick={() => setProcedureSheetOpen(false)}>
                    Cancel
                  </Button>
                </SheetFooter>
              </form>
            </SheetContent>
          </Sheet>

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
                        <Button type="button" variant="outline" size="icon" disabled={busy} onClick={() => startProcedureEdit(procedure)}>
                          <Edit3 className="h-4 w-4" />
                        </Button>
                        <Button type="button" variant="outline" size="icon" disabled={busy} onClick={() => setProcedureToDelete(procedure)}>
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
              <Sheet open={bomSheetOpen} onOpenChange={setBomSheetOpen}>
                <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
                  <form onSubmit={submitBom} className="flex min-h-full flex-col">
                    <SheetHeader>
                      <SheetTitle>{bomEditingId ? 'Edit BOM' : 'Create BOM'}</SheetTitle>
                      <SheetDescription>Maintain BOM headers used by phase and line setup.</SheetDescription>
                    </SheetHeader>
                    <div className="grid gap-4 p-4">
                      <div className="grid gap-1.5">
                        <Label htmlFor="bom-sheet-name">BOM</Label>
                        <Input id="bom-sheet-name" value={bomName} onChange={(event) => setBomName(event.target.value)} placeholder="AmGraft intake BOM" />
                      </div>
                      <div className="grid gap-1.5">
                        <Label htmlFor="bom-sheet-key">Key</Label>
                        <Input id="bom-sheet-key" value={bomKeyText} onChange={(event) => setBomKeyText(event.target.value)} placeholder="optional" />
                      </div>
                    </div>
                    <SheetFooter>
                      <Button type="submit" disabled={busy || !bomName.trim()}>
                        {bomEditingId ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                        {bomEditingId ? 'Save BOM' : 'Create BOM'}
                      </Button>
                      <Button type="button" variant="outline" disabled={busy} onClick={() => setBomSheetOpen(false)}>
                        Cancel
                      </Button>
                    </SheetFooter>
                  </form>
                </SheetContent>
              </Sheet>

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
                          <Button type="button" variant="outline" size="icon" disabled={busy} onClick={() => startBomEdit(bom)}>
                            <Edit3 className="h-4 w-4" />
                          </Button>
                          <Button type="button" variant="outline" size="icon" disabled={busy} onClick={() => setBomToDelete(bom)}>
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
              <Sheet open={equipmentSheetOpen} onOpenChange={setEquipmentSheetOpen}>
                <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
                  <form onSubmit={submitEquipment} className="flex min-h-full flex-col">
                    <SheetHeader>
                      <SheetTitle>{equipmentEditingId ? 'Edit equipment' : 'Create equipment'}</SheetTitle>
                      <SheetDescription>Maintain equipment catalog entries that can be bound to phases.</SheetDescription>
                    </SheetHeader>
                    <div className="grid gap-4 p-4">
                      <div className="grid gap-1.5">
                        <Label htmlFor="equipment-sheet-id">Equipment ID</Label>
                        <Input id="equipment-sheet-id" value={equipmentId} onChange={(event) => setEquipmentId(event.target.value)} placeholder="EQ-1" />
                      </div>
                      <div className="grid gap-1.5">
                        <Label htmlFor="equipment-sheet-name">Equipment</Label>
                        <Input id="equipment-sheet-name" value={equipmentName} onChange={(event) => setEquipmentName(event.target.value)} placeholder="Heat sealer" />
                      </div>
                      <div className="grid gap-1.5">
                        <Label htmlFor="equipment-sheet-description">Description</Label>
                        <Input id="equipment-sheet-description" value={equipmentDescription} onChange={(event) => setEquipmentDescription(event.target.value)} placeholder="optional" />
                      </div>
                    </div>
                    <SheetFooter>
                      <Button type="submit" disabled={busy || (!equipmentName.trim() && !equipmentId.trim())}>
                        {equipmentEditingId ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                        {equipmentEditingId ? 'Save equipment' : 'Create equipment'}
                      </Button>
                      <Button type="button" variant="outline" disabled={busy} onClick={() => setEquipmentSheetOpen(false)}>
                        Cancel
                      </Button>
                    </SheetFooter>
                  </form>
                </SheetContent>
              </Sheet>

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
                          <Button type="button" variant="outline" size="icon" disabled={busy} onClick={() => startEquipmentEdit(equipment)}>
                            <Edit3 className="h-4 w-4" />
                          </Button>
                          <Button type="button" variant="outline" size="icon" disabled={busy} onClick={() => setEquipmentToDelete(equipment)}>
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

          <Sheet open={bomLineSheetOpen} onOpenChange={setBomLineSheetOpen}>
            <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
              <form onSubmit={submitBomLine} className="flex min-h-full flex-col">
                <SheetHeader>
                  <SheetTitle>{bomLineEditingId ? 'Edit BOM line' : 'Create BOM line'}</SheetTitle>
                  <SheetDescription>Maintain material, quantity, UOM, and serial requirements for a BOM.</SheetDescription>
                </SheetHeader>
                <div className="grid gap-4 p-4">
                  <div className="grid gap-1.5">
                    <Label htmlFor="bom-line-sheet-bom">BOM</Label>
                    <select
                      id="bom-line-sheet-bom"
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
                    <Label htmlFor="bom-line-sheet-description">Line</Label>
                    <Input id="bom-line-sheet-description" value={bomLineDescription} onChange={(event) => setBomLineDescription(event.target.value)} placeholder="AmGraft membrane" />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="bom-line-sheet-quantity">Quantity</Label>
                    <Input id="bom-line-sheet-quantity" type="number" step="0.0001" value={bomLineQuantity} onChange={(event) => setBomLineQuantity(event.target.value)} placeholder="1" />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="bom-line-sheet-uom">UOM</Label>
                    <Input id="bom-line-sheet-uom" value={bomLineUom} onChange={(event) => setBomLineUom(event.target.value)} placeholder="ea" />
                  </div>
                  <label className="flex h-11 items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                    <input type="checkbox" checked={bomLineHasSerial} onChange={(event) => setBomLineHasSerial(event.target.checked)} />
                    Serial
                  </label>
                </div>
                <SheetFooter>
                  <Button type="submit" disabled={busy || !bomLineBomId || !bomLineDescription.trim()}>
                    {bomLineEditingId ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                    {bomLineEditingId ? 'Save BOM line' : 'Create BOM line'}
                  </Button>
                  <Button type="button" variant="outline" disabled={busy} onClick={() => setBomLineSheetOpen(false)}>
                    Cancel
                  </Button>
                </SheetFooter>
              </form>
            </SheetContent>
          </Sheet>

          <ConfirmDeleteDialog
            open={Boolean(procedureToDelete)}
            title="Delete procedure?"
            description={procedureToDelete ? `Delete ${catalogLabel(procedureToDelete, procedureToDelete.procedureName, procedureToDelete.procedureShort)} from the procedure catalog.` : ''}
            busy={busy}
            onOpenChange={(open) => {
              if (!open) setProcedureToDelete(null);
            }}
            onConfirm={() => {
              if (procedureToDelete) deleteProcedureMutation.mutate(procedureToDelete.id);
            }}
          />
          <ConfirmDeleteDialog
            open={Boolean(bomToDelete)}
            title="Delete BOM?"
            description={bomToDelete ? `Delete ${catalogLabel(bomToDelete, bomToDelete.bomName, bomToDelete.keyText)} and its dependent setup if the API allows it.` : ''}
            busy={busy}
            onOpenChange={(open) => {
              if (!open) setBomToDelete(null);
            }}
            onConfirm={() => {
              if (bomToDelete) deleteBomMutation.mutate(bomToDelete.id);
            }}
          />
          <ConfirmDeleteDialog
            open={Boolean(equipmentToDelete)}
            title="Delete equipment?"
            description={equipmentToDelete ? `Delete ${catalogLabel(equipmentToDelete, equipmentToDelete.name, equipmentToDelete.equipId)} from the equipment catalog.` : ''}
            busy={busy}
            onOpenChange={(open) => {
              if (!open) setEquipmentToDelete(null);
            }}
            onConfirm={() => {
              if (equipmentToDelete) deleteEquipmentMutation.mutate(equipmentToDelete.id);
            }}
          />
          <ConfirmDeleteDialog
            open={Boolean(bomLineToDelete)}
            title="Delete BOM line?"
            description={bomLineToDelete ? `Delete ${bomLineToDelete.description || bomLineToDelete.id} from its BOM.` : ''}
            busy={busy}
            onOpenChange={(open) => {
              if (!open) setBomLineToDelete(null);
            }}
            onConfirm={() => {
              if (bomLineToDelete) deleteBomLineMutation.mutate(bomLineToDelete.id);
            }}
          />

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
                        <Button type="button" variant="outline" size="icon" disabled={busy} onClick={() => startBomLineEdit(line)}>
                          <Edit3 className="h-4 w-4" />
                        </Button>
                        <Button type="button" variant="outline" size="icon" disabled={busy} onClick={() => setBomLineToDelete(line)}>
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

  const [workflowSheetOpen, setWorkflowSheetOpen] = useState(false);
  const [editingWorkflowId, setEditingWorkflowId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [active, setActive] = useState(true);
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
      setActive(true);
      setWorkflowSheetOpen(false);
    },
    onError: (e: AxiosError<{ error?: string }>) =>
      toast.error(e.response?.data?.error || 'Failed to create workflow'),
  });

  const updateWorkflowMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: { name: string; description: string | null; active: boolean } }) =>
      updateWorkflow(id, payload),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
      queryClient.setQueryData(['workflow', updated.id], updated);
      setSelectedWorkflowId(updated.id);
      toast.success('Workflow updated');
      setEditingWorkflowId(null);
      setName('');
      setCode('');
      setDescription('');
      setActive(true);
      setWorkflowSheetOpen(false);
    },
    onError: (e: AxiosError<{ error?: string }>) =>
      toast.error(e.response?.data?.error || 'Failed to update workflow'),
  });

  const startWorkflowCreate = () => {
    setEditingWorkflowId(null);
    setName('');
    setCode('');
    setDescription('');
    setActive(true);
    setWorkflowSheetOpen(true);
  };

  const startWorkflowEdit = (workflow: WorkflowSummary) => {
    setEditingWorkflowId(workflow.id);
    setName(workflow.name);
    setCode(workflow.code);
    setDescription(workflow.description || '');
    setActive(workflow.active);
    setWorkflowSheetOpen(true);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || (!editingWorkflowId && !code.trim())) return;
    if (editingWorkflowId) {
      updateWorkflowMutation.mutate({
        id: editingWorkflowId,
        payload: {
          name: name.trim(),
          description: description.trim() || null,
          active,
        },
      });
    } else {
      createMutation.mutate({
        name: name.trim(),
        code: code.trim().toUpperCase(),
        description: description.trim() || null,
      });
    }
  };

  const workflowBusy = createMutation.isPending || updateWorkflowMutation.isPending;

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

      <Sheet open={workflowSheetOpen} onOpenChange={setWorkflowSheetOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <form onSubmit={submit} className="flex min-h-full flex-col">
            <SheetHeader>
              <SheetTitle>{editingWorkflowId ? 'Edit workflow' : 'Create workflow'}</SheetTitle>
              <SheetDescription>Create or update workflow metadata without leaving the selected row context.</SheetDescription>
            </SheetHeader>
            <div className="grid gap-4 p-4">
              <div className="grid gap-1.5">
                <Label htmlFor="wf-sheet-name">Name</Label>
                <Input id="wf-sheet-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="AmGraft" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="wf-sheet-code">Code</Label>
                <Input id="wf-sheet-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="AMG" disabled={Boolean(editingWorkflowId)} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="wf-sheet-desc">Description</Label>
                <Input id="wf-sheet-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="optional" />
              </div>
              {editingWorkflowId ? (
                <label className="flex h-11 items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />
                  Active
                </label>
              ) : null}
            </div>
            <SheetFooter>
              <Button type="submit" disabled={workflowBusy || !name.trim() || (!editingWorkflowId && !code.trim())}>
                {editingWorkflowId ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                {editingWorkflowId ? 'Save workflow' : 'Create workflow'}
              </Button>
              <Button type="button" variant="outline" disabled={workflowBusy} onClick={() => setWorkflowSheetOpen(false)}>
                Cancel
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      <AdminPanel
        title="Configured workflows"
        description="Select a workflow to inspect phase bindings, or edit metadata from its row."
        action={
          <Button type="button" onClick={startWorkflowCreate}>
            <Plus className="h-4 w-4" />
            New workflow
          </Button>
        }
      >
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
                onEdit={() => startWorkflowEdit(w)}
              />
            ))}
          </div>
        )}
      </AdminPanel>

      <PhaseCatalogPanel phases={phasesQuery.data ?? []} isLoading={phasesQuery.isLoading} />

      <PhaseRequirementsPanel
        phases={phasesQuery.data ?? []}
        procedures={proceduresQuery.data ?? []}
        phaseEquipment={phaseEquipmentQuery.data ?? []}
        isLoading={phasesQuery.isLoading || proceduresQuery.isLoading || phaseEquipmentQuery.isLoading}
      />

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
