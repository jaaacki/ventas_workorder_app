import { useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
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
  ImageUp,
  PackageSearch,
  Route,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AdminPanel, EmptyState, MetricCard, PageHeader, StatusPill } from '@/components/tailadmin';
import {
  advanceWorkOrder,
  fetchWorkOrder,
  fetchWorkOrderAuditEvents,
  fetchWorkOrderInventoryTrace,
  finishWorkOrderPhase,
  recordWorkOrderEquipment,
  recordWorkOrderOutputQuantity,
  recordWorkOrderPhotoEvidence,
  recordWorkOrderRelease,
  recordWorkOrderSerial,
  startWorkOrderPhase,
  type WorkOrderAuditEvent,
  type WorkOrderAllowedEquipment,
  type WorkOrderDetail,
  type WorkOrderRequiredSerial,
} from '@/lib/work-orders-api';
import { statusTone, workflowLabel } from '@/lib/work-order-ui';
import { WorkOrderWorkspace } from './WorkOrdersPage';

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleString() : '-';
}

function formatDurationMinutes(value?: string | number | null) {
  if (value == null || value === '') return '-';
  const minutes = Number(value);
  if (!Number.isFinite(minutes)) return String(value);
  if (minutes < 60) return `${minutes.toFixed(1)} min`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = Math.round(minutes % 60);
  return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

function formatQuantity(value?: string | number | null) {
  if (value == null || value === '') return '-';
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return String(value);
  return numeric.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function workOrderTitle(workOrder: WorkOrderDetail) {
  return workOrder.woNumber || workOrder.id;
}

function lifecycleDetail(workOrder: WorkOrderDetail) {
  const duration = formatDurationMinutes(workOrder.prodDuration);
  return duration === '-' ? workOrder.operationalStatus : `${workOrder.operationalStatus} - ${duration}`;
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
    previous.prodDurationMinutes !== next.prodDurationMinutes
      ? `Duration ${formatDurationMinutes(previous.prodDurationMinutes)} -> ${formatDurationMinutes(next.prodDurationMinutes)}`
      : null,
    previous.outputQuantity !== next.outputQuantity
      ? `Output ${formatQuantity(previous.outputQuantity)} -> ${formatQuantity(next.outputQuantity)}`
      : null,
    previous.releaseStatus !== next.releaseStatus
      ? `Release ${previous.releaseStatus || '-'} -> ${next.releaseStatus || '-'}`
      : null,
    previous.imageCaptured !== next.imageCaptured
      ? `Photo ${previous.imageCaptured ? 'captured' : 'missing'} -> ${next.imageCaptured ? 'captured' : 'missing'}`
      : null,
    previous.equipmentCount !== next.equipmentCount
      ? `Equipment ${previous.equipmentCount ?? '-'} -> ${next.equipmentCount ?? '-'}`
      : null,
    previous.serialCount !== next.serialCount
      ? `Serials ${previous.serialCount ?? '-'} -> ${next.serialCount ?? '-'}`
      : null,
  ].filter(Boolean);

  return changes.length ? changes.join(' | ') : 'No visible state delta';
}

function equipmentLabel(equipment: WorkOrderAllowedEquipment) {
  return equipment.name || equipment.equipId || equipment.phaseEquipId;
}

function ReleaseDispositionPanel({
  workOrder,
  onSaved,
}: {
  workOrder: WorkOrderDetail;
  onSaved: (updated: WorkOrderDetail) => void;
}) {
  const [releaseStatus, setReleaseStatus] = useState<'released' | 'quarantined' | 'rejected'>('released');
  const [remarks, setRemarks] = useState('');
  const canRecord = workOrder.lifecycleState === 'ReleasePending';

  const releaseMutation = useMutation({
    mutationFn: () => recordWorkOrderRelease(workOrder.id, { releaseStatus, remarks: remarks.trim() || undefined }),
    onSuccess: (updated) => {
      onSaved(updated);
      setRemarks('');
      toast.success('Release disposition recorded');
    },
    onError: (e: AxiosError<{ error?: string }>) =>
      toast.error(e.response?.data?.error || 'Failed to record release disposition'),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!canRecord) return;
    releaseMutation.mutate();
  };

  return (
    <AdminPanel title="Release disposition" description="Final QA disposition for release-ready work orders.">
      <div className="grid gap-4 xl:grid-cols-[280px_1fr] xl:items-start">
        <MetricCard
          icon={<ShieldCheck className="h-5 w-5" />}
          label="Release status"
          value={workOrder.releaseStatus || 'Pending'}
          detail={workOrder.releaseDecisionAt ? formatDate(workOrder.releaseDecisionAt) : workOrder.lifecycleState}
        />
        {workOrder.releaseStatus ? (
          <div className="rounded-lg border border-gray-200 p-4 text-sm dark:border-gray-800">
            <div className="font-medium text-gray-800 dark:text-white/90">
              {workOrder.releaseStatus}
            </div>
            <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              By {workOrder.releaseDecisionById || '-'} at {formatDate(workOrder.releaseDecisionAt)}
            </div>
            <div className="mt-3 text-gray-600 dark:text-gray-300">{workOrder.releaseRemarks || 'No remarks recorded.'}</div>
          </div>
        ) : (
          <form onSubmit={submit} className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="release-status">Disposition</Label>
              <select
                id="release-status"
                value={releaseStatus}
                onChange={(event) => setReleaseStatus(event.target.value as 'released' | 'quarantined' | 'rejected')}
                disabled={!canRecord}
                className="h-11 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 shadow-theme-xs outline-none focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
              >
                <option value="released">Release</option>
                <option value="quarantined">Quarantine</option>
                <option value="rejected">Reject</option>
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="release-remarks">Remarks</Label>
              <textarea
                id="release-remarks"
                value={remarks}
                onChange={(event) => setRemarks(event.target.value)}
                disabled={!canRecord}
                rows={4}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 shadow-theme-xs outline-none focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                placeholder={canRecord ? 'Release notes or quarantine/rejection reason' : 'Work order must be in final release readiness before disposition.'}
              />
            </div>
            <Button type="submit" disabled={!canRecord || releaseMutation.isPending}>
              Record disposition
            </Button>
          </form>
        )}
      </div>
    </AdminPanel>
  );
}

function PhotoEvidencePanel({
  workOrder,
  onSaved,
}: {
  workOrder: WorkOrderDetail;
  onSaved: (updated: WorkOrderDetail) => void;
}) {
  const [imageDataUrl, setImageDataUrl] = useState('');
  const [fileName, setFileName] = useState('');
  const preview = imageDataUrl || workOrder.imagePath || '';

  const photoMutation = useMutation({
    mutationFn: () => recordWorkOrderPhotoEvidence(workOrder.id, { imageDataUrl }),
    onSuccess: (updated) => {
      onSaved(updated);
      setImageDataUrl('');
      setFileName('');
      toast.success('Photo evidence recorded');
    },
    onError: (e: AxiosError<{ error?: string }>) =>
      toast.error(e.response?.data?.error || 'Failed to record photo evidence'),
  });

  const selectFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      setImageDataUrl('');
      setFileName('');
      return;
    }
    if (!file.type.startsWith('image/')) {
      toast.error('Select an image file');
      event.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setImageDataUrl(String(reader.result || ''));
      setFileName(file.name);
    };
    reader.onerror = () => toast.error('Failed to read image file');
    reader.readAsDataURL(file);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!imageDataUrl) return;
    photoMutation.mutate();
  };

  return (
    <AdminPanel title="Photo evidence" description="Required work-order image captured before advancement.">
      <div className="grid gap-4 lg:grid-cols-[240px_1fr] lg:items-start">
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900">
          {preview ? (
            <img src={preview} alt="Work-order evidence" className="aspect-[4/3] w-full object-cover" />
          ) : (
            <div className="flex aspect-[4/3] items-center justify-center text-gray-400">
              <ImageUp className="h-8 w-8" />
            </div>
          )}
        </div>
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <div className="grid gap-1.5">
            <Label htmlFor="photo-evidence">Image</Label>
            <Input id="photo-evidence" type="file" accept="image/*" capture="environment" onChange={selectFile} />
            <div className="text-xs text-gray-500">
              {fileName || (workOrder.imagePath ? 'Photo evidence already recorded' : 'No photo evidence recorded')}
            </div>
          </div>
          <Button type="submit" disabled={!imageDataUrl || photoMutation.isPending}>
            Record
          </Button>
        </form>
      </div>
    </AdminPanel>
  );
}

function EquipmentEvidencePanel({
  workOrder,
  onSaved,
}: {
  workOrder: WorkOrderDetail;
  onSaved: (updated: WorkOrderDetail) => void;
}) {
  const [phaseEquipId, setPhaseEquipId] = useState('');
  const missingEquipment = useMemo(
    () => workOrder.allowedEquipment.filter((equipment) => !equipment.recorded),
    [workOrder.allowedEquipment],
  );
  const selectedPhaseEquipId = phaseEquipId || missingEquipment[0]?.phaseEquipId || '';

  const equipmentMutation = useMutation({
    mutationFn: () => recordWorkOrderEquipment(workOrder.id, { phaseEquipId: selectedPhaseEquipId }),
    onSuccess: (updated) => {
      onSaved(updated);
      setPhaseEquipId('');
      toast.success('Equipment recorded');
    },
    onError: (e: AxiosError<{ error?: string }>) =>
      toast.error(e.response?.data?.error || 'Failed to record equipment'),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!selectedPhaseEquipId) return;
    equipmentMutation.mutate();
  };

  return (
    <AdminPanel title="Equipment evidence" description="Allowed equipment for the current phase.">
      {!workOrder.allowedEquipment.length ? (
        <EmptyState icon={<Boxes className="h-6 w-6" />} title="No equipment required" description="The current phase does not define allowed equipment." />
      ) : (
        <div className="space-y-4">
          <form onSubmit={submit} className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
            <div className="grid gap-1.5">
              <Label htmlFor="phase-equipment">Equipment</Label>
              <select
                id="phase-equipment"
                value={selectedPhaseEquipId}
                onChange={(event) => setPhaseEquipId(event.target.value)}
                disabled={!missingEquipment.length}
                className="h-11 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 shadow-theme-xs outline-none focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
              >
                {missingEquipment.length ? null : <option value="">All equipment recorded</option>}
                {missingEquipment.map((equipment) => (
                  <option key={equipment.phaseEquipId} value={equipment.phaseEquipId}>
                    {equipmentLabel(equipment)}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" disabled={!selectedPhaseEquipId || equipmentMutation.isPending}>
              Record
            </Button>
          </form>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Equipment</TableHead>
                <TableHead>Asset</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {workOrder.allowedEquipment.map((equipment) => (
                <TableRow key={equipment.phaseEquipId}>
                  <TableCell>
                    <div className="font-medium text-gray-800 dark:text-white/90">{equipmentLabel(equipment)}</div>
                    <div className="text-xs text-gray-500">{equipment.description || equipment.phaseEquipId}</div>
                  </TableCell>
                  <TableCell>{equipment.equipId || '-'}</TableCell>
                  <TableCell>
                    <StatusPill tone={equipment.recorded ? 'success' : 'warning'}>
                      {equipment.recorded ? 'Recorded' : 'Missing'}
                    </StatusPill>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </AdminPanel>
  );
}

function OutputEvidencePanel({
  workOrder,
  onSaved,
}: {
  workOrder: WorkOrderDetail;
  onSaved: (updated: WorkOrderDetail) => void;
}) {
  const [outputQuantity, setOutputQuantity] = useState(workOrder.outputQuantity ? String(workOrder.outputQuantity) : '');

  const outputMutation = useMutation({
    mutationFn: () => recordWorkOrderOutputQuantity(workOrder.id, { outputQuantity: outputQuantity.trim() }),
    onSuccess: (updated) => {
      onSaved(updated);
      setOutputQuantity(updated.outputQuantity ? String(updated.outputQuantity) : '');
      toast.success('Output quantity recorded');
    },
    onError: (e: AxiosError<{ error?: string }>) =>
      toast.error(e.response?.data?.error || 'Failed to record output quantity'),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!outputQuantity.trim()) return;
    outputMutation.mutate();
  };

  return (
    <AdminPanel title="Output evidence" description="Produced quantity captured for this work order.">
      <div className="grid gap-4 lg:grid-cols-[220px_1fr] lg:items-end">
        <MetricCard icon={<Factory className="h-5 w-5" />} label="Output quantity" value={formatQuantity(workOrder.outputQuantity)} />
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <div className="grid gap-1.5">
            <Label htmlFor="output-quantity">Quantity produced</Label>
            <Input
              id="output-quantity"
              type="number"
              min="0.0001"
              step="0.0001"
              value={outputQuantity}
              onChange={(event) => setOutputQuantity(event.target.value)}
              placeholder="1.0000"
            />
          </div>
          <Button type="submit" disabled={!outputQuantity.trim() || outputMutation.isPending}>
            Record
          </Button>
        </form>
      </div>
    </AdminPanel>
  );
}

function serialLabel(serial: WorkOrderRequiredSerial) {
  return serial.description || serial.bomRefId;
}

function SerialEvidencePanel({
  workOrder,
  onSaved,
}: {
  workOrder: WorkOrderDetail;
  onSaved: (updated: WorkOrderDetail) => void;
}) {
  const [bomRefId, setBomRefId] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const missingSerials = useMemo(
    () => workOrder.requiredSerials.filter((serial) => !serial.serialNumber),
    [workOrder.requiredSerials],
  );
  const selectedBomRefId = bomRefId || missingSerials[0]?.bomRefId || workOrder.requiredSerials[0]?.bomRefId || '';

  const serialMutation = useMutation({
    mutationFn: () => recordWorkOrderSerial(workOrder.id, { bomRefId: selectedBomRefId, serialNumber: serialNumber.trim() }),
    onSuccess: (updated) => {
      onSaved(updated);
      setBomRefId('');
      setSerialNumber('');
      toast.success('Serial recorded');
    },
    onError: (e: AxiosError<{ error?: string }>) =>
      toast.error(e.response?.data?.error || 'Failed to record serial'),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!selectedBomRefId || !serialNumber.trim()) return;
    serialMutation.mutate();
  };

  return (
    <AdminPanel title="BOM serial evidence" description="Serial-required BOM lines for the current phase.">
      {!workOrder.requiredSerials.length ? (
        <EmptyState icon={<ClipboardList className="h-6 w-6" />} title="No serials required" description="The current phase does not require BOM serial capture." />
      ) : (
        <div className="space-y-4">
          <form onSubmit={submit} className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
            <div className="grid gap-1.5">
              <Label htmlFor="serial-bom-line">BOM line</Label>
              <select
                id="serial-bom-line"
                value={selectedBomRefId}
                onChange={(event) => setBomRefId(event.target.value)}
                className="h-11 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 shadow-theme-xs outline-none focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
              >
                {workOrder.requiredSerials.map((serial) => (
                  <option key={serial.bomRefId} value={serial.bomRefId}>
                    {serialLabel(serial)}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="serial-number">Serial number</Label>
              <Input
                id="serial-number"
                value={serialNumber}
                onChange={(event) => setSerialNumber(event.target.value)}
                placeholder="SN-AMG-1001"
              />
            </div>
            <Button type="submit" disabled={!selectedBomRefId || !serialNumber.trim() || serialMutation.isPending}>
              Record
            </Button>
          </form>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>BOM line</TableHead>
                <TableHead>Quantity</TableHead>
                <TableHead>Serial</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {workOrder.requiredSerials.map((serial) => (
                <TableRow key={serial.bomRefId}>
                  <TableCell>
                    <div className="font-medium text-gray-800 dark:text-white/90">{serialLabel(serial)}</div>
                    <div className="break-all text-xs text-gray-500">{serial.bomRefId}</div>
                  </TableCell>
                  <TableCell>{serial.quantity ?? '-'} {serial.uom || ''}</TableCell>
                  <TableCell>{serial.serialNumber || '-'}</TableCell>
                  <TableCell>
                    <StatusPill tone={serial.serialNumber ? 'success' : 'warning'}>
                      {serial.serialNumber ? 'Captured' : 'Missing'}
                    </StatusPill>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </AdminPanel>
  );
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

  const recordSerialSaved = (updated: WorkOrderDetail) => {
    updateCachedWorkOrder(updated);
  };

  const recordEquipmentSaved = (updated: WorkOrderDetail) => {
    updateCachedWorkOrder(updated);
  };

  const recordOutputSaved = (updated: WorkOrderDetail) => {
    updateCachedWorkOrder(updated);
  };

  const recordPhotoSaved = (updated: WorkOrderDetail) => {
    updateCachedWorkOrder(updated);
  };

  const recordReleaseSaved = (updated: WorkOrderDetail) => {
    updateCachedWorkOrder(updated);
  };

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
        <MetricCard icon={<Route className="h-6 w-6" />} label="Lifecycle" value={workOrder.lifecycleState} detail={lifecycleDetail(workOrder)} />
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

      <OutputEvidencePanel key={workOrder.id} workOrder={workOrder} onSaved={recordOutputSaved} />

      <PhotoEvidencePanel workOrder={workOrder} onSaved={recordPhotoSaved} />

      <ReleaseDispositionPanel workOrder={workOrder} onSaved={recordReleaseSaved} />

      <EquipmentEvidencePanel workOrder={workOrder} onSaved={recordEquipmentSaved} />

      <SerialEvidencePanel workOrder={workOrder} onSaved={recordSerialSaved} />

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
