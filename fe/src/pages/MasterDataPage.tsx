import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { Controller, useForm, type Control } from 'react-hook-form';
import { Boxes, Plus, Wrench, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  fetchBoms,
  createBom,
  updateBom,
  deleteBom,
  fetchBomLines,
  createBomLine,
  updateBomLine,
  deleteBomLine,
  fetchPhaseEquipment,
  createPhaseEquipment,
  updatePhaseEquipment,
  deletePhaseEquipment,
  fetchWorkflows,
  fetchWorkflow,
  fetchPhaseEquipmentBindings,
  addPhaseEquipmentBinding,
  removePhaseEquipmentBinding,
  type BomCatalogItem,
  type BomLineCatalogItem,
  type PhaseEquipmentCatalogItem,
  type PhaseItem,
} from '@/lib/workflows-api';
import { fetchInventorySkus, type InventorySku } from '@/lib/inventory-api';
import { PageHeader, AdminPanel, EmptyState } from '@/components/tailadmin';
import { CrudSheet, TextField, CheckboxField, RowCrudActions } from '@/components/ErpCrudControls';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

function apiError(e: AxiosError<{ error?: string }>, fallback: string) {
  return e.response?.data?.error || fallback;
}

function phaseTitle(phase: PhaseItem, index: number) {
  const letter = phase.phaseShort || String.fromCharCode(65 + index);
  return `${letter} · ${phase.phaseName || 'Untitled phase'}`;
}

export default function MasterDataPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Master data"
        description="Bills of materials, the equipment catalog, and which equipment each phase allows."
      />
      <Tabs defaultValue="boms">
        <TabsList className="h-auto flex-wrap justify-start">
          <TabsTrigger value="boms">BOMs</TabsTrigger>
          <TabsTrigger value="equipment">Equipment</TabsTrigger>
          <TabsTrigger value="bindings">Phase bindings</TabsTrigger>
        </TabsList>
        <TabsContent value="boms" className="mt-4">
          <BomsTab />
        </TabsContent>
        <TabsContent value="equipment" className="mt-4">
          <EquipmentTab />
        </TabsContent>
        <TabsContent value="bindings" className="mt-4">
          <PhaseBindingsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── BOMs + BOM lines ─────────────────────────────────────────────────────────

type BomForm = { bomName: string; keyText: string };
type BomLineForm = {
  description: string;
  quantity: string;
  uom: string;
  hasSerial: boolean;
  keyText: string;
  inventorySkuId: string;
};

function BomsTab() {
  const queryClient = useQueryClient();
  const onError = (e: AxiosError<{ error?: string }>) => toast.error(apiError(e, 'Action failed'));
  const [selectedBomId, setSelectedBomId] = useState<string | null>(null);
  const [sheet, setSheet] = useState<{ record: BomCatalogItem | null } | null>(null);
  const form = useForm<BomForm>({ defaultValues: { bomName: '', keyText: '' } });

  const { data: boms = [] } = useQuery({ queryKey: ['boms'], queryFn: fetchBoms });
  const selectedBom = boms.find((b) => b.id === selectedBomId) ?? null;

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['boms'] });
  const saveBom = useMutation({
    mutationFn: (values: BomForm) => {
      const payload = { bomName: values.bomName.trim(), keyText: values.keyText.trim() || null };
      return sheet?.record ? updateBom(sheet.record.id, payload) : createBom(payload);
    },
    onSuccess: () => {
      invalidate();
      toast.success('BOM saved');
      setSheet(null);
    },
    onError,
  });
  const removeBom = useMutation({
    mutationFn: (id: string) => deleteBom(id),
    onSuccess: (_r, id) => {
      invalidate();
      toast.success('BOM deleted');
      if (selectedBomId === id) setSelectedBomId(null);
    },
    onError,
  });

  const openCreate = () => {
    form.reset({ bomName: '', keyText: '' });
    setSheet({ record: null });
  };
  const openEdit = (bom: BomCatalogItem) => {
    form.reset({ bomName: bom.bomName ?? '', keyText: bom.keyText ?? '' });
    setSheet({ record: bom });
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
      <AdminPanel
        title="BOMs"
        description="Bill-of-materials headers."
        action={
          <Button type="button" size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4" /> New BOM
          </Button>
        }
      >
        {boms.length === 0 ? (
          <EmptyState icon={<Boxes className="h-6 w-6" />} title="No BOMs yet" description="Create a BOM to add its lines." />
        ) : (
          <ul className="space-y-1">
            {boms.map((bom) => (
              <li
                key={bom.id}
                className={`flex items-center gap-1 rounded-lg border px-3 py-2 text-sm ${
                  bom.id === selectedBomId
                    ? 'border-brand-500/50 bg-brand-50 dark:bg-brand-500/10'
                    : 'border-gray-200 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-white/[0.03]'
                }`}
              >
                <button type="button" onClick={() => setSelectedBomId(bom.id)} className="min-w-0 flex-1 text-left">
                  <span className="block truncate font-medium text-gray-800 dark:text-white/90">{bom.bomName || bom.id}</span>
                  {bom.keyText && <span className="block truncate text-xs text-gray-500">{bom.keyText}</span>}
                </button>
                <Badge variant="outline">{bom._count?.lines ?? 0} lines</Badge>
                <RowCrudActions
                  canEdit
                  canArchive
                  canRestore={false}
                  canAudit={false}
                  busy={removeBom.isPending}
                  onEdit={() => openEdit(bom)}
                  onArchive={() => removeBom.mutate(bom.id)}
                  onRestore={() => {}}
                  onAudit={() => {}}
                  archiveLabel="Delete"
                  archiveTitle="Delete BOM"
                  archiveDescription="Delete this BOM? BOMs referenced by a phase are protected and cannot be deleted."
                />
              </li>
            ))}
          </ul>
        )}
      </AdminPanel>

      {selectedBom ? (
        <BomLinesPanel bom={selectedBom} onError={onError} />
      ) : (
        <EmptyState icon={<Boxes className="h-6 w-6" />} title="Select a BOM" description="Pick a BOM to manage its lines." />
      )}

      <CrudSheet
        open={Boolean(sheet)}
        title={sheet?.record ? 'Edit BOM' : 'New BOM'}
        description="Bill-of-materials header metadata."
        submitLabel={sheet?.record ? 'Save BOM' : 'Create BOM'}
        isSubmitting={saveBom.isPending}
        onOpenChange={(open) => !open && setSheet(null)}
        onSubmit={form.handleSubmit((values) => {
          if (!values.bomName.trim()) {
            toast.error('BOM name is required');
            return;
          }
          saveBom.mutate(values);
        })}
      >
        <TextField control={form.control} name="bomName" label="BOM name" required className="sm:col-span-2" />
        <TextField control={form.control} name="keyText" label="Key / reference" className="sm:col-span-2" />
      </CrudSheet>
    </div>
  );
}

function BomLinesPanel({ bom, onError }: { bom: BomCatalogItem; onError: (e: AxiosError<{ error?: string }>) => void }) {
  const queryClient = useQueryClient();
  const [sheet, setSheet] = useState<{ record: BomLineCatalogItem | null } | null>(null);
  const form = useForm<BomLineForm>({
    defaultValues: { description: '', quantity: '', uom: '', hasSerial: false, keyText: '', inventorySkuId: '' },
  });

  const { data: lines = [] } = useQuery({ queryKey: ['bom-lines', bom.id], queryFn: () => fetchBomLines(bom.id) });
  const { data: skus = [] } = useQuery({ queryKey: ['inventory-skus'], queryFn: () => fetchInventorySkus('') });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['bom-lines'] });
    // The BOM list badge reads bom._count.lines from ['boms']; refresh it too.
    queryClient.invalidateQueries({ queryKey: ['boms'] });
  };
  const saveLine = useMutation({
    mutationFn: (values: BomLineForm) => {
      const payload = {
        description: values.description.trim() || null,
        quantity: values.quantity.trim() === '' ? null : values.quantity.trim(),
        uom: values.uom.trim() || null,
        hasSerial: values.hasSerial,
        keyText: values.keyText.trim() || null,
        inventorySkuId: values.inventorySkuId || null,
      };
      return sheet?.record ? updateBomLine(sheet.record.id, payload) : createBomLine({ ...payload, bomId: bom.id });
    },
    onSuccess: () => {
      invalidate();
      toast.success('BOM line saved');
      setSheet(null);
    },
    onError,
  });
  const removeLine = useMutation({
    mutationFn: (id: string) => deleteBomLine(id),
    onSuccess: () => {
      invalidate();
      toast.success('BOM line deleted');
    },
    onError,
  });

  const openCreate = () => {
    form.reset({ description: '', quantity: '', uom: '', hasSerial: false, keyText: '', inventorySkuId: '' });
    setSheet({ record: null });
  };
  const openEdit = (line: BomLineCatalogItem) => {
    form.reset({
      description: line.description ?? '',
      quantity: line.quantity != null ? String(line.quantity) : '',
      uom: line.uom ?? '',
      hasSerial: line.hasSerial,
      keyText: line.keyText ?? '',
      inventorySkuId: line.inventorySkuId ?? '',
    });
    setSheet({ record: line });
  };

  return (
    <AdminPanel
      title={`Lines · ${bom.bomName || bom.id}`}
      description="Materials for this BOM. Serial-required lines gate the phase advance."
      action={
        <Button type="button" size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4" /> New line
        </Button>
      }
    >
      {lines.length === 0 ? (
        <EmptyState icon={<Boxes className="h-6 w-6" />} title="No lines" description="Add a material line to this BOM." />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Material</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead>Serial</TableHead>
                <TableHead>Inventory SKU</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((line) => (
                <TableRow key={line.id}>
                  <TableCell className="font-medium text-gray-800 dark:text-white/90">{line.description || '—'}</TableCell>
                  <TableCell className="text-gray-500">
                    {line.quantity ?? '—'} {line.uom || ''}
                  </TableCell>
                  <TableCell>{line.hasSerial ? <Badge>serial required</Badge> : <span className="text-gray-400">—</span>}</TableCell>
                  <TableCell className="text-gray-500">
                    {line.inventorySku ? line.inventorySku.sku || line.inventorySku.description || line.inventorySku.id : <span className="text-warning-600">unlinked</span>}
                  </TableCell>
                  <TableCell>
                    <RowCrudActions
                      canEdit
                      canArchive
                      canRestore={false}
                      canAudit={false}
                      busy={removeLine.isPending}
                      onEdit={() => openEdit(line)}
                      onArchive={() => removeLine.mutate(line.id)}
                      onRestore={() => {}}
                      onAudit={() => {}}
                      archiveLabel="Delete"
                      archiveTitle="Delete BOM line"
                      archiveDescription="Delete this BOM line? It is soft-deleted so historical serial evidence is preserved."
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <CrudSheet
        open={Boolean(sheet)}
        title={sheet?.record ? 'Edit BOM line' : 'New BOM line'}
        description="A material consumed in a phase. Serial-required lines demand serial capture before advance."
        submitLabel={sheet?.record ? 'Save line' : 'Create line'}
        isSubmitting={saveLine.isPending}
        onOpenChange={(open) => !open && setSheet(null)}
        onSubmit={form.handleSubmit((values) => saveLine.mutate(values))}
      >
        <TextField control={form.control} name="description" label="Material / description" className="sm:col-span-2" />
        <TextField control={form.control} name="quantity" label="Quantity" type="number" />
        <TextField control={form.control} name="uom" label="Unit" />
        <SkuField control={form.control} name="inventorySkuId" skus={skus} />
        <TextField control={form.control} name="keyText" label="Key / reference" />
        <CheckboxField control={form.control} name="hasSerial" label="Requires serial number" />
      </CrudSheet>
    </AdminPanel>
  );
}

function SkuField({ control, name, skus }: { control: Control<BomLineForm>; name: 'inventorySkuId'; skus: InventorySku[] }) {
  const groups = useMemo(() => {
    const byCat = new Map<string, InventorySku[]>();
    const sorted = [...skus].sort((a, b) => (a.description || a.sku || '').localeCompare(b.description || b.sku || ''));
    for (const s of sorted) {
      const cat = s.category || 'Other';
      if (!byCat.has(cat)) byCat.set(cat, []);
      byCat.get(cat)!.push(s);
    }
    return [...byCat.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [skus]);

  return (
    <label className="sm:col-span-2">
      <Label className="mb-1.5">Inventory SKU</Label>
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <select
            className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-3 text-sm dark:border-gray-800 dark:bg-gray-900"
            value={field.value || ''}
            onChange={(e) => field.onChange(e.target.value)}
          >
            <option value="">— Unlinked —</option>
            {groups.map(([cat, items]) => (
              <optgroup key={cat} label={cat}>
                {items.map((s) => (
                  <option key={s.id} value={s.id}>
                    {(s.sku || s.id)}
                    {s.description ? ` · ${s.description}` : ''}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        )}
      />
    </label>
  );
}

// ── Equipment catalog ────────────────────────────────────────────────────────

type EquipForm = { name: string; equipId: string; description: string; keyText: string };

function EquipmentTab() {
  const queryClient = useQueryClient();
  const onError = (e: AxiosError<{ error?: string }>) => toast.error(apiError(e, 'Action failed'));
  const [sheet, setSheet] = useState<{ record: PhaseEquipmentCatalogItem | null } | null>(null);
  const form = useForm<EquipForm>({ defaultValues: { name: '', equipId: '', description: '', keyText: '' } });

  const { data: equipment = [] } = useQuery({ queryKey: ['phase-equipment'], queryFn: fetchPhaseEquipment });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['phase-equipment'] });
  const saveEquip = useMutation({
    mutationFn: (values: EquipForm) => {
      const payload = {
        name: values.name.trim(),
        equipId: values.equipId.trim() || null,
        description: values.description.trim() || null,
        keyText: values.keyText.trim() || null,
      };
      return sheet?.record ? updatePhaseEquipment(sheet.record.id, payload) : createPhaseEquipment(payload);
    },
    onSuccess: () => {
      invalidate();
      toast.success('Equipment saved');
      setSheet(null);
    },
    onError,
  });
  const removeEquip = useMutation({
    mutationFn: (id: string) => deletePhaseEquipment(id),
    onSuccess: () => {
      invalidate();
      toast.success('Equipment deleted');
    },
    onError,
  });

  const openCreate = () => {
    form.reset({ name: '', equipId: '', description: '', keyText: '' });
    setSheet({ record: null });
  };
  const openEdit = (item: PhaseEquipmentCatalogItem) => {
    form.reset({ name: item.name ?? '', equipId: item.equipId ?? '', description: item.description ?? '', keyText: item.keyText ?? '' });
    setSheet({ record: item });
  };

  return (
    <AdminPanel
      title="Equipment catalog"
      description="Equipment entries phases can allow. Bindings are managed on the Phase bindings tab."
      action={
        <Button type="button" size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4" /> New equipment
        </Button>
      }
    >
      {equipment.length === 0 ? (
        <EmptyState icon={<Wrench className="h-6 w-6" />} title="No equipment" description="Add equipment to the catalog." />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Used by</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {equipment.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium text-gray-800 dark:text-white/90">{item.name || '—'}</TableCell>
                  <TableCell className="text-gray-500">{item.equipId || '—'}</TableCell>
                  <TableCell className="text-gray-500">{item.description || '—'}</TableCell>
                  <TableCell className="text-gray-500">{item._count?.phases ?? 0} phases</TableCell>
                  <TableCell>
                    <RowCrudActions
                      canEdit
                      canArchive
                      canRestore={false}
                      canAudit={false}
                      busy={removeEquip.isPending}
                      onEdit={() => openEdit(item)}
                      onArchive={() => removeEquip.mutate(item.id)}
                      onRestore={() => {}}
                      onAudit={() => {}}
                      archiveLabel="Delete"
                      archiveTitle="Delete equipment"
                      archiveDescription="Delete this equipment? Equipment bound to a phase or used by a work order is protected and cannot be deleted."
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <CrudSheet
        open={Boolean(sheet)}
        title={sheet?.record ? 'Edit equipment' : 'New equipment'}
        description="Equipment catalog entry."
        submitLabel={sheet?.record ? 'Save equipment' : 'Create equipment'}
        isSubmitting={saveEquip.isPending}
        onOpenChange={(open) => !open && setSheet(null)}
        onSubmit={form.handleSubmit((values) => {
          if (!values.name.trim()) {
            toast.error('Equipment name is required');
            return;
          }
          saveEquip.mutate(values);
        })}
      >
        <TextField control={form.control} name="name" label="Name" required />
        <TextField control={form.control} name="equipId" label="Code" />
        <TextField control={form.control} name="description" label="Description" className="sm:col-span-2" />
        <TextField control={form.control} name="keyText" label="Key / reference" className="sm:col-span-2" />
      </CrudSheet>
    </AdminPanel>
  );
}

// ── Phase ↔ equipment bindings ───────────────────────────────────────────────

function PhaseBindingsTab() {
  const [selected, setSelected] = useState<string>('');
  const { data: workflows = [] } = useQuery({ queryKey: ['workflows'], queryFn: () => fetchWorkflows() });
  const effectiveWorkflowId = selected || workflows[0]?.id || '';
  const { data: workflow } = useQuery({
    queryKey: ['workflow', effectiveWorkflowId],
    queryFn: () => fetchWorkflow(effectiveWorkflowId),
    enabled: Boolean(effectiveWorkflowId),
  });
  const { data: equipment = [] } = useQuery({ queryKey: ['phase-equipment'], queryFn: fetchPhaseEquipment });

  const phases = workflow?.phases ?? [];

  return (
    <AdminPanel
      title="Allowed equipment per phase"
      description="Bind catalog equipment to a phase. Bound equipment must be recorded before a work order can advance."
      action={
        <select
          className="h-10 rounded-lg border border-gray-200 bg-transparent px-3 text-sm dark:border-gray-800 dark:bg-gray-900"
          value={effectiveWorkflowId}
          onChange={(e) => setSelected(e.target.value)}
        >
          {workflows.map((wf) => (
            <option key={wf.id} value={wf.id}>
              {wf.name} ({wf.code})
            </option>
          ))}
        </select>
      }
    >
      {phases.length === 0 ? (
        <EmptyState icon={<Wrench className="h-6 w-6" />} title="No phases" description="This workflow has no phases to bind equipment to." />
      ) : (
        <div className="space-y-3">
          {phases.map((phase, index) => (
            <PhaseBindingRow key={phase.id} phase={phase} index={index} catalog={equipment} />
          ))}
        </div>
      )}
    </AdminPanel>
  );
}

function PhaseBindingRow({ phase, index, catalog }: { phase: PhaseItem; index: number; catalog: PhaseEquipmentCatalogItem[] }) {
  const queryClient = useQueryClient();
  const onError = (e: AxiosError<{ error?: string }>) => toast.error(apiError(e, 'Action failed'));
  const { data: bindings = [] } = useQuery({
    queryKey: ['phase-equipment-bindings', phase.id],
    queryFn: () => fetchPhaseEquipmentBindings(phase.id),
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['phase-equipment-bindings', phase.id] });

  const addBinding = useMutation({
    mutationFn: (phaseEquipId: string) => addPhaseEquipmentBinding(phase.id, phaseEquipId),
    onSuccess: () => {
      invalidate();
      toast.success('Equipment bound');
    },
    onError,
  });
  const removeBinding = useMutation({
    mutationFn: (phaseEquipId: string) => removePhaseEquipmentBinding(phase.id, phaseEquipId),
    onSuccess: () => {
      invalidate();
      toast.success('Equipment unbound');
    },
    onError,
  });

  const boundIds = new Set(bindings.map((b) => b.phaseEquipId));
  const available = catalog.filter((e) => !boundIds.has(e.id));
  const busy = addBinding.isPending || removeBinding.isPending;

  return (
    <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-medium text-gray-800 dark:text-white/90">
          {phaseTitle(phase, index)}
          {phase.isGate && (
            <Badge variant="outline" className="ml-2">
              gate
            </Badge>
          )}
        </div>
        <select
          className="h-9 rounded-lg border border-gray-200 bg-transparent px-3 text-sm dark:border-gray-800 dark:bg-gray-900"
          value=""
          disabled={busy || available.length === 0}
          onChange={(e) => e.target.value && addBinding.mutate(e.target.value)}
        >
          <option value="">{available.length === 0 ? 'All equipment bound' : '+ Add equipment'}</option>
          {available.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name || e.equipId || e.id}
            </option>
          ))}
        </select>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {bindings.length === 0 ? (
          <span className="text-sm text-gray-400">No equipment bound.</span>
        ) : (
          bindings.map((b) => (
            <span
              key={b.phaseEquipId}
              className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 py-1 pl-3 pr-1 text-sm dark:border-gray-800 dark:bg-white/[0.03]"
            >
              {b.phaseEquip.name || b.phaseEquip.equipId || b.phaseEquipId}
              <button
                type="button"
                aria-label="Unbind equipment"
                disabled={busy}
                onClick={() => removeBinding.mutate(b.phaseEquipId)}
                className="rounded-full p-0.5 text-gray-400 hover:text-error-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))
        )}
      </div>
    </div>
  );
}
