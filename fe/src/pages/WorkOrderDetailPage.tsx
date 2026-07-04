import { useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Boxes,
  ChevronDown,
  ClipboardList,
  Factory,
  GitBranch,
  History,
  ImageUp,
  Layers,
  Lock,
  PackageSearch,
  ShieldCheck,
  Workflow as WorkflowIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AdminPanel, EmptyState, MetricCard, PageHeader, StatusPill } from '@/components/tailadmin';
import { SummaryStrip, GenealogyCard } from '@/components/detail';
import { humanStatus, hasValue, toneToBadgeVariant } from '@/lib/format';
import {
  advanceWorkOrder,
  amendWorkOrderEvidence,
  combineWorkOrderHets,
  fetchWorkOrder,
  fetchWorkOrderAuditEvents,
  fetchWorkOrderChain,
  fetchWorkOrderInventoryTrace,
  deliverEmptyContainer,
  finishWorkOrderPhase,
  recordHetCollection,
  recordWorkOrderEquipment,
  recordWorkOrderOutputQuantity,
  recordWorkOrderPhotoEvidence,
  recordWorkOrderRelease,
  recordWorkOrderSerial,
  startWorkOrderPhase,
  type DeliverEmptyPayload,
  type RecordHetCollectionPayload,
  type WorkOrderAuditEvent,
  type WorkOrderAllowedEquipment,
  type WorkOrderDetail,
  type WorkOrderRequiredSerial,
} from '@/lib/work-orders-api';
import { fetchHets } from '@/lib/hets-api';
import { fetchCollectionPoints, fetchCollectionUnits } from '@/lib/procurement-api';
import { workflowLabel } from '@/lib/work-order-ui';
import { useAuthStore } from '@/store/authStore';
import { SignaturePad, WorkOrderWorkspace } from './WorkOrdersPage';

const MAX_PHOTO_EVIDENCE_BYTES = 5 * 1024 * 1024;

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
  disabled = false,
}: {
  workOrder: WorkOrderDetail;
  onSaved: (updated: WorkOrderDetail) => void;
  disabled?: boolean;
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
            <Button type="submit" disabled={disabled || !canRecord || releaseMutation.isPending}>
              Record disposition
            </Button>
          </form>
        )}
      </div>
    </AdminPanel>
  );
}

function CollectionProcessPanel({
  workOrder,
  onSaved,
  disabled = false,
}: {
  workOrder: WorkOrderDetail;
  onSaved: (updated: WorkOrderDetail) => void;
  disabled?: boolean;
}) {
  const [collectionPointId, setCollectionPointId] = useState('');
  const [lotNumber, setLotNumber] = useState('');
  const [quantity, setQuantity] = useState('');
  const [parcelTrackingNumber, setParcelTrackingNumber] = useState('');
  const [signature, setSignature] = useState('');

  // Deliver-empty leg state (#189).
  const [deliverPointId, setDeliverPointId] = useState('');
  const [deliverUnitId, setDeliverUnitId] = useState('');
  const [deliverParcel, setDeliverParcel] = useState('');
  const [deliverSignature, setDeliverSignature] = useState('');

  const alreadyCollected = Boolean(workOrder.hetId);
  const alreadyDelivered = Boolean(workOrder.issuanceOrderId);

  const pointsQuery = useQuery({
    queryKey: ['collection-points'],
    queryFn: () => fetchCollectionPoints(),
    enabled: !alreadyCollected,
  });
  const collectionPoints = pointsQuery.data ?? [];

  // Containers available to issue on the deliver leg — the list shows each unit's
  // live CollectionUnit.status (ISSUED / RECEIVED / …).
  const unitsQuery = useQuery({
    queryKey: ['collection-units'],
    queryFn: () => fetchCollectionUnits(),
    enabled: !alreadyCollected && !alreadyDelivered,
  });
  const collectionUnits = unitsQuery.data ?? [];
  const selectedUnit = collectionUnits.find((unit) => unit.id === deliverUnitId);

  const deliverMutation = useMutation({
    mutationFn: () => {
      const payload: DeliverEmptyPayload = { collectionPointId: deliverPointId, collectionUnitId: deliverUnitId };
      if (deliverParcel.trim()) payload.parcelTrackingNumber = deliverParcel.trim();
      if (deliverSignature) payload.signatureDataUrl = deliverSignature;
      return deliverEmptyContainer(workOrder.id, payload);
    },
    onSuccess: (updated) => {
      onSaved(updated);
      toast.success('Empty container issued');
    },
    onError: (e: AxiosError<{ error?: string }>) =>
      toast.error(e.response?.data?.error || 'Failed to issue empty container'),
  });

  const collectMutation = useMutation({
    mutationFn: () => {
      const payload: RecordHetCollectionPayload = { collectionPointId };
      const qty = Number(quantity);
      if (quantity.trim() && Number.isFinite(qty) && qty > 0) payload.quantity = Math.trunc(qty);
      if (lotNumber.trim()) payload.lotNumber = lotNumber.trim();
      if (parcelTrackingNumber.trim()) payload.parcelTrackingNumber = parcelTrackingNumber.trim();
      if (signature) payload.signatureDataUrl = signature;
      return recordHetCollection(workOrder.id, payload);
    },
    onSuccess: (updated) => {
      onSaved(updated);
      toast.success('HET collected');
    },
    onError: (e: AxiosError<{ error?: string }>) =>
      toast.error(e.response?.data?.error || 'Failed to record HET collection'),
  });

  const submitDeliver = (event: FormEvent) => {
    event.preventDefault();
    if (!deliverPointId || !deliverUnitId) return;
    deliverMutation.mutate();
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!collectionPointId) return;
    collectMutation.mutate();
  };

  return (
    <AdminPanel title="HET collection" description="Deliver an empty container to the clinic, then collect the filled container to mint the HET and start the run.">
      <div className="grid gap-4 xl:grid-cols-[280px_1fr] xl:items-start">
        <MetricCard
          icon={<Boxes className="h-5 w-5" />}
          label="Collected HET"
          value={workOrder.het?.hetNumber || (alreadyCollected ? workOrder.hetId : 'Not collected')}
          detail={alreadyCollected ? workOrder.het?.clinicName || 'HET minted at collection' : alreadyDelivered ? 'Empty container issued — awaiting filled collection' : 'Awaiting collection'}
        />
        {alreadyCollected ? (
          <div className="rounded-lg border border-gray-200 p-4 text-sm dark:border-gray-800">
            <div className="font-medium text-gray-800 dark:text-white/90">HET minted at collection</div>
            <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {workOrder.het?.hetNumber || workOrder.hetId} · {workOrder.het?.clinicName || 'Clinic on receipt'}
            </div>
            <div className="mt-3 text-gray-600 dark:text-gray-300">Advance the run to continue into production.</div>
          </div>
        ) : (
          <div className="grid gap-4">
            {/* Leg 1 — deliver empty container (optional; a run may collect directly). */}
            {alreadyDelivered ? (
              <div className="rounded-lg border border-gray-200 p-4 text-sm dark:border-gray-800">
                <div className="font-medium text-gray-800 dark:text-white/90">Leg 1 · Empty container issued</div>
                <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Issuance {workOrder.issuanceOrderId} · container in transit to clinic. Collect the filled container below.
                </div>
              </div>
            ) : (
              <form onSubmit={submitDeliver} className="grid gap-3 rounded-lg border border-gray-200 p-4 dark:border-gray-800">
                <div className="text-sm font-medium text-gray-800 dark:text-white/90">Leg 1 · Deliver empty container <span className="text-xs font-normal text-gray-500">(optional)</span></div>
                <div className="grid gap-1.5">
                  <Label htmlFor="deliver-point">Collection point</Label>
                  <select
                    id="deliver-point"
                    value={deliverPointId}
                    onChange={(event) => setDeliverPointId(event.target.value)}
                    className="h-11 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 shadow-theme-xs outline-none focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                  >
                    <option value="">Select collection point</option>
                    {collectionPoints.map((point) => (
                      <option key={point.id} value={point.id}>
                        {point.displayName || point.hciCode || point.id}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="deliver-unit">Container</Label>
                  <select
                    id="deliver-unit"
                    value={deliverUnitId}
                    onChange={(event) => setDeliverUnitId(event.target.value)}
                    className="h-11 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 shadow-theme-xs outline-none focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                  >
                    <option value="">Select container</option>
                    {collectionUnits.map((unit) => (
                      <option key={unit.id} value={unit.id}>
                        {(unit.unitNumber || unit.id)} · {unit.status}
                      </option>
                    ))}
                  </select>
                  {selectedUnit && (
                    <span className="text-xs text-gray-500 dark:text-gray-400">Current status: {selectedUnit.status}</span>
                  )}
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="deliver-parcel">Parcel tracking</Label>
                  <Input id="deliver-parcel" value={deliverParcel} onChange={(event) => setDeliverParcel(event.target.value)} placeholder="Outbound courier tracking number" />
                </div>
                <SignaturePad label="Custody sign-off (optional)" value={deliverSignature} onChange={setDeliverSignature} />
                <Button type="submit" disabled={disabled || !deliverPointId || !deliverUnitId || deliverMutation.isPending}>
                  Issue empty container
                </Button>
              </form>
            )}

            {/* Leg 2 — collect filled container + mint HET (single-step collect stays available). */}
            <form onSubmit={submit} className="grid gap-3 rounded-lg border border-gray-200 p-4 dark:border-gray-800">
              <div className="text-sm font-medium text-gray-800 dark:text-white/90">Leg 2 · Collect filled container</div>
              <div className="grid gap-1.5">
                <Label htmlFor="collection-point">Collection point</Label>
                <select
                  id="collection-point"
                  value={collectionPointId}
                  onChange={(event) => setCollectionPointId(event.target.value)}
                  className="h-11 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 shadow-theme-xs outline-none focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                >
                  <option value="">Select collection point</option>
                  {collectionPoints.map((point) => (
                    <option key={point.id} value={point.id}>
                      {point.displayName || point.hciCode || point.id}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="collection-lot">Lot number</Label>
                  <Input id="collection-lot" value={lotNumber} onChange={(event) => setLotNumber(event.target.value)} placeholder="Clinic lot / HET number" />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="collection-qty">Quantity</Label>
                  <Input id="collection-qty" type="number" min={1} value={quantity} onChange={(event) => setQuantity(event.target.value)} placeholder="1" />
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="collection-parcel">Parcel tracking</Label>
                <Input id="collection-parcel" value={parcelTrackingNumber} onChange={(event) => setParcelTrackingNumber(event.target.value)} placeholder="Return courier tracking number" />
              </div>
              {alreadyDelivered && (
                <span className="text-xs text-gray-500 dark:text-gray-400">The delivered container is closed automatically on collection.</span>
              )}
              <SignaturePad label="Custody sign-off (optional)" value={signature} onChange={setSignature} />
              <Button type="submit" disabled={disabled || !collectionPointId || collectMutation.isPending}>
                Record collection &amp; mint HET
              </Button>
            </form>
          </div>
        )}
      </div>
    </AdminPanel>
  );
}

function PhotoEvidencePanel({
  workOrder,
  onSaved,
  disabled = false,
  amend = false,
}: {
  workOrder: WorkOrderDetail;
  onSaved: (updated: WorkOrderDetail) => void;
  disabled?: boolean;
  amend?: boolean;
}) {
  const [imageDataUrl, setImageDataUrl] = useState('');
  const [fileName, setFileName] = useState('');
  const preview = imageDataUrl || workOrder.imagePath || '';

  const photoMutation = useMutation({
    mutationFn: () =>
      amend
        ? amendWorkOrderEvidence(workOrder.id, { kind: 'photo', imageDataUrl })
        : recordWorkOrderPhotoEvidence(workOrder.id, { imageDataUrl }),
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
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      toast.error('Use a PNG, JPEG, or WebP image');
      event.target.value = '';
      return;
    }
    if (file.size > MAX_PHOTO_EVIDENCE_BYTES) {
      toast.error('Image must be 5 MB or smaller');
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
          <Button type="submit" disabled={disabled || !imageDataUrl || photoMutation.isPending}>
            {amend ? 'Amend' : 'Record'}
          </Button>
        </form>
      </div>
    </AdminPanel>
  );
}

function EquipmentEvidencePanel({
  workOrder,
  onSaved,
  disabled = false,
  amend = false,
}: {
  workOrder: WorkOrderDetail;
  onSaved: (updated: WorkOrderDetail) => void;
  disabled?: boolean;
  amend?: boolean;
}) {
  const [phaseEquipId, setPhaseEquipId] = useState('');
  const missingEquipment = useMemo(
    () => workOrder.allowedEquipment.filter((equipment) => !equipment.recorded),
    [workOrder.allowedEquipment],
  );
  const selectedPhaseEquipId = phaseEquipId || missingEquipment[0]?.phaseEquipId || '';

  const equipmentMutation = useMutation({
    mutationFn: () =>
      amend
        ? amendWorkOrderEvidence(workOrder.id, { kind: 'equipment', phaseEquipId: selectedPhaseEquipId })
        : recordWorkOrderEquipment(workOrder.id, { phaseEquipId: selectedPhaseEquipId }),
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
            <Button type="submit" disabled={disabled || !selectedPhaseEquipId || equipmentMutation.isPending}>
              {amend ? 'Amend' : 'Record'}
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
  disabled = false,
  amend = false,
}: {
  workOrder: WorkOrderDetail;
  onSaved: (updated: WorkOrderDetail) => void;
  disabled?: boolean;
  amend?: boolean;
}) {
  const [outputQuantity, setOutputQuantity] = useState(workOrder.outputQuantity ? String(workOrder.outputQuantity) : '');

  const outputMutation = useMutation({
    mutationFn: () =>
      amend
        ? amendWorkOrderEvidence(workOrder.id, { kind: 'output-quantity', outputQuantity: outputQuantity.trim() })
        : recordWorkOrderOutputQuantity(workOrder.id, { outputQuantity: outputQuantity.trim() }),
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
          <Button type="submit" disabled={disabled || !outputQuantity.trim() || outputMutation.isPending}>
            {amend ? 'Amend' : 'Record'}
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
  disabled = false,
  amend = false,
}: {
  workOrder: WorkOrderDetail;
  onSaved: (updated: WorkOrderDetail) => void;
  disabled?: boolean;
  amend?: boolean;
}) {
  const [bomRefId, setBomRefId] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const missingSerials = useMemo(
    () => workOrder.requiredSerials.filter((serial) => !serial.serialNumber),
    [workOrder.requiredSerials],
  );
  const selectedBomRefId = bomRefId || missingSerials[0]?.bomRefId || workOrder.requiredSerials[0]?.bomRefId || '';

  const serialMutation = useMutation({
    mutationFn: () =>
      amend
        ? amendWorkOrderEvidence(workOrder.id, { kind: 'serial', bomRefId: selectedBomRefId, serialNumber: serialNumber.trim() })
        : recordWorkOrderSerial(workOrder.id, { bomRefId: selectedBomRefId, serialNumber: serialNumber.trim() }),
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
            <Button type="submit" disabled={disabled || !selectedBomRefId || !serialNumber.trim() || serialMutation.isPending}>
              {amend ? 'Amend' : 'Record'}
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
                    {serial.inventorySku ? (
                      <div className="text-xs text-gray-500">
                        SKU {serial.inventorySku.sku || serial.inventorySku.id}
                        {serial.inventorySku.description ? ` — ${serial.inventorySku.description}` : ''}
                      </div>
                    ) : (
                      <div className="text-xs text-warning-600 dark:text-warning-500">Not linked to inventory</div>
                    )}
                    <div className="break-all text-xs text-gray-400">{serial.bomRefId}</div>
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

function RunChainPanel({ workOrderId }: { workOrderId: string }) {
  const chainQuery = useQuery({
    queryKey: ['work-order-chain', workOrderId],
    queryFn: () => fetchWorkOrderChain(workOrderId),
    enabled: Boolean(workOrderId),
  });

  return (
    <AdminPanel title="Run chain" description="Per-phase history for this HET run — each phase links to its work order with evidence, timestamps, and signatures.">
      {chainQuery.isLoading ? (
        <div className="flex h-24 items-center justify-center">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
        </div>
      ) : chainQuery.isError || !chainQuery.data?.workOrders.length ? (
        <EmptyState icon={<WorkflowIcon className="h-6 w-6" />} title="No run chain" description="This run has no linked phase history yet." />
      ) : (
        <ol className="space-y-2">
          {chainQuery.data.workOrders.map((entry, index) => (
            <li
              key={entry.workOrderId}
              className={`rounded-lg border p-3 ${
                entry.isCurrent
                  ? 'border-brand-300 bg-brand-50 dark:border-brand-500/40 dark:bg-brand-500/10'
                  : 'border-gray-200 dark:border-gray-800'
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-gray-800 dark:text-white/90">
                    {index + 1}. {entry.phase?.phaseName || entry.phase?.phaseShort || `Phase ${(entry.phaseOrder ?? 0) + 1}`}
                    {entry.phase?.isGate && (
                      <span className="ml-2 rounded bg-warning-50 px-1.5 py-0.5 text-[10px] font-medium text-warning-600 dark:bg-warning-500/10 dark:text-warning-500">
                        Gate
                      </span>
                    )}
                  </div>
                  {entry.isCurrent ? (
                    <span className="text-xs text-gray-500 dark:text-gray-400">{entry.woNumber || entry.workOrderId} (this work order)</span>
                  ) : (
                    <Link
                      to={`/dashboard/work-orders/${encodeURIComponent(entry.workOrderId)}`}
                      className="text-xs text-brand-600 hover:underline dark:text-brand-400"
                    >
                      {entry.woNumber || entry.workOrderId}
                    </Link>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  {entry.isCurrent && <StatusPill tone="brand">Current</StatusPill>}
                  {entry.releaseStatus && (
                    <StatusPill tone={entry.releaseStatus === 'released' ? 'success' : 'warning'}>{entry.releaseStatus}</StatusPill>
                  )}
                </div>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground sm:grid-cols-4">
                <span>Start {formatDate(entry.prodStart)}</span>
                <span>End {formatDate(entry.prodEnd)}</span>
                <span>{formatDurationMinutes(entry.prodDuration)}</span>
                <span>Output {formatQuantity(entry.outputQuantity)}</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1 text-[10px]">
                {entry.hasPhoto && (
                  <span className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-600 dark:bg-white/[0.06] dark:text-gray-300">Photo</span>
                )}
                <span className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-600 dark:bg-white/[0.06] dark:text-gray-300">{entry.counts.serials} serials</span>
                <span className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-600 dark:bg-white/[0.06] dark:text-gray-300">{entry.counts.equipment} equipment</span>
                {entry.counts.sterilisations > 0 && (
                  <span className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-600 dark:bg-white/[0.06] dark:text-gray-300">
                    {entry.counts.sterilisations} sterilisation
                  </span>
                )}
                {entry.startSignature?.signer && (
                  <span className="rounded bg-success-50 px-1.5 py-0.5 text-success-600 dark:bg-success-500/10 dark:text-success-500">
                    Start ✓ {entry.startSignature.signer}
                  </span>
                )}
                {entry.endSignature?.signer && (
                  <span className="rounded bg-success-50 px-1.5 py-0.5 text-success-600 dark:bg-success-500/10 dark:text-success-500">
                    End ✓ {entry.endSignature.signer}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </AdminPanel>
  );
}

function CombinePanel({ workOrder, onSaved }: { workOrder: WorkOrderDetail; onSaved: (updated: WorkOrderDetail) => void }) {
  const [selected, setSelected] = useState<string[]>([]);
  const hetsQuery = useQuery({ queryKey: ['hets'], queryFn: fetchHets });
  const combinedIds = useMemo(() => new Set(workOrder.batchHets.map((batchHet) => batchHet.hetId)), [workOrder.batchHets]);
  const available = useMemo(
    () => (hetsQuery.data ?? []).filter((het) => !het.deleted && het.id !== workOrder.hetId && !combinedIds.has(het.id)),
    [hetsQuery.data, workOrder.hetId, combinedIds],
  );

  const combineMutation = useMutation({
    mutationFn: () => combineWorkOrderHets(workOrder.id, selected),
    onSuccess: (updated) => {
      onSaved(updated);
      setSelected([]);
      toast.success('Source HETs combined into the batch');
    },
    onError: (e: AxiosError<{ error?: string }>) => toast.error(e.response?.data?.error || 'Failed to combine HETs'),
  });

  const toggle = (hetId: string) =>
    setSelected((prev) => (prev.includes(hetId) ? prev.filter((value) => value !== hetId) : [...prev, hetId]));

  return (
    <AdminPanel title="Combine HETs (C12)" description="Attach source HETs to this run as a combined batch. Combined batches are visibly listed and genealogy-linked.">
      <div className="space-y-4">
        <div>
          <div className="mb-1.5 text-sm font-medium text-gray-800 dark:text-white/90">Combined batch</div>
          {workOrder.batchHets.length ? (
            <div className="flex flex-wrap gap-1.5">
              {workOrder.batchHets.map((batchHet) => (
                <span
                  key={batchHet.hetId}
                  className="inline-flex items-center gap-1 rounded bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-600 dark:bg-brand-500/10 dark:text-brand-400"
                >
                  <Layers className="h-3 w-3" />
                  {batchHet.hetId}
                </span>
              ))}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">No source HETs combined yet.</div>
          )}
        </div>

        <div className="grid gap-1.5">
          <Label>Add source HETs</Label>
          <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-gray-200 p-2 dark:border-gray-800">
            {hetsQuery.isLoading ? (
              <div className="p-2 text-xs text-muted-foreground">Loading HETs…</div>
            ) : available.length ? (
              available.map((het) => (
                <label
                  key={het.id}
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-gray-50 dark:hover:bg-white/[0.03]"
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(het.id)}
                    onChange={() => toggle(het.id)}
                    className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500"
                  />
                  <span className="truncate">
                    {het.hetNumber || het.id}
                    {het.clinicName ? ` · ${het.clinicName}` : ''}
                  </span>
                </label>
              ))
            ) : (
              <div className="p-2 text-xs text-muted-foreground">No other HETs available to combine.</div>
            )}
          </div>
        </div>

        <Button onClick={() => combineMutation.mutate()} disabled={!selected.length || combineMutation.isPending}>
          <Boxes className="h-4 w-4" />
          Combine {selected.length || ''} HET{selected.length === 1 ? '' : 's'}
        </Button>
      </div>
    </AdminPanel>
  );
}

export default function WorkOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const hasPermission = useAuthStore((state) => state.hasPermission);
  // Evidence recorders all require workOrder.execute; release and collect have
  // their own keys. Panels below are disabled (not hidden) so recorded evidence
  // stays visible to read-only roles.
  const canExecute = hasPermission('workOrder.execute');
  const canRelease = hasPermission('workOrder.release');
  const canCollect = hasPermission('workOrder.collect');
  const canCombine = hasPermission('workOrder.combine');
  // Amending locked interior evidence requires an admin/owner role on top of the
  // execute permission (matches the backend amend-evidence route gate).
  const roleKey = useAuthStore((state) => state.user?.role?.key);
  const isAdmin = roleKey === 'admin' || roleKey === 'owner';

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
    queryClient.invalidateQueries({ queryKey: ['qa-queue'] });
    queryClient.invalidateQueries({ queryKey: ['work-order-inventory-trace', updated.id] });
    queryClient.invalidateQueries({ queryKey: ['work-order-audit-events', updated.id] });
    queryClient.invalidateQueries({ queryKey: ['work-order-chain', updated.id] });
    // A release mints a FINISHED_GOOD lot; keep the finished-goods list fresh.
    queryClient.invalidateQueries({ queryKey: ['finished-goods-lots'] });
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
      // Advancing completes this work order and initialises the next phase as a
      // new one — follow the chain to the spawned work order.
      queryClient.invalidateQueries({ queryKey: ['work-order', id] });
      // updateCachedWorkOrder refreshes the spawned WO's chain; the source WO's
      // run-chain also gained the new leg, so invalidate it too.
      queryClient.invalidateQueries({ queryKey: ['work-order-chain', id] });
      toast.success(`Advanced to ${workOrderTitle(updated)}`);
      if (updated.id !== id) {
        navigate(`/dashboard/work-orders/${updated.id}`);
      }
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

  // A superseded interior work order (the HET advanced past this phase) is
  // locked: its evidence is history. It renders read-only for everyone; an admin
  // can still amend through the audited amendment path.
  const isLocked = workOrder.lifecycleState === 'Completed';
  const evidenceDisabled = !canExecute || (isLocked && !isAdmin);
  const evidenceAmend = isLocked && isAdmin;
  // Combine is offered only where it is actually valid: an active (not locked,
  // not released) run with a HET, on a phase that permits combining.
  const combineApplicable =
    canCombine &&
    Boolean(workOrder.hetId) &&
    !workOrder.phase?.blocksCombine &&
    !isLocked &&
    !workOrder.releaseStatus &&
    !workOrder.isCollectionPhase;

  return (
    <div className="space-y-6">
      <PageHeader
        title={workOrderTitle(workOrder)}
        description={`${workflowLabel(workOrder)} · ${workOrder.currentPhaseLabel}`}
        action={
          <>
            <Button asChild variant="outline">
              <Link to="/dashboard/work-orders">
                <ArrowLeft className="h-4 w-4" />
                Board
              </Link>
            </Button>
            {(() => {
              const status = humanStatus(workOrder.operationalStatus);
              return <Badge variant={toneToBadgeVariant(status.tone)}>{status.label}</Badge>;
            })()}
          </>
        }
      />

      <SummaryStrip
        rows={[
          { label: 'Status', value: humanStatus(workOrder.operationalStatus).label },
          { label: 'Product line', value: workOrder.workflow?.name },
          { label: 'HET / batch', value: workOrder.het?.hetNumber },
          { label: 'Received from', value: workOrder.het?.clinicName },
          { label: 'Current phase', value: workOrder.currentPhaseLabel },
          { label: 'Started', value: workOrder.prodStart ? formatDate(workOrder.prodStart) : null },
          { label: 'Cycle time', value: hasValue(workOrder.prodDuration) ? formatDurationMinutes(workOrder.prodDuration) : null },
          { label: 'Output', value: hasValue(workOrder.outputQuantity) ? formatQuantity(workOrder.outputQuantity) : null },
        ]}
      />

      {isLocked && (
        <div className="flex items-start gap-2 rounded-lg border border-gray-300 bg-gray-50 p-3 text-sm text-gray-600 dark:border-gray-700 dark:bg-white/[0.03] dark:text-gray-300">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            This is a completed step in the run chain — the HET has advanced to a later phase, so its evidence is locked.
            {isAdmin
              ? ' As an admin you can amend recorded evidence; every amendment is captured in the audit trail.'
              : ' Evidence is read-only. An administrator can record an audited amendment if a correction is needed.'}
          </span>
        </div>
      )}

      <AdminPanel title="Production execution" description="Controlled phase actions, readiness gates, evidence counts, and workflow timeline for this production run.">
        <WorkOrderWorkspace
          workOrder={workOrder}
          onAdvance={() => advanceMutation.mutate()}
          onStart={(_workOrderId, signatureDataUrl) => startMutation.mutate({ signatureDataUrl })}
          onFinish={(_workOrderId, signatureDataUrl) => finishMutation.mutate({ signatureDataUrl })}
          advancing={advanceMutation.isPending}
          starting={startMutation.isPending}
          finishing={finishMutation.isPending}
          hidePhaseTimeline
        />
      </AdminPanel>

      <RunChainPanel workOrderId={workOrder.id} />

      {combineApplicable && <CombinePanel workOrder={workOrder} onSaved={updateCachedWorkOrder} />}

      {workOrder.isCollectionPhase && (
        <CollectionProcessPanel workOrder={workOrder} onSaved={updateCachedWorkOrder} disabled={!canCollect} />
      )}

      <GenealogyCard genealogy={trace?.genealogy ?? []} lots={trace?.lots ?? []} />

      <OutputEvidencePanel key={workOrder.id} workOrder={workOrder} onSaved={recordOutputSaved} disabled={evidenceDisabled} amend={evidenceAmend} />

      <PhotoEvidencePanel workOrder={workOrder} onSaved={recordPhotoSaved} disabled={evidenceDisabled} amend={evidenceAmend} />

      <ReleaseDispositionPanel workOrder={workOrder} onSaved={recordReleaseSaved} disabled={!canRelease} />

      <EquipmentEvidencePanel workOrder={workOrder} onSaved={recordEquipmentSaved} disabled={evidenceDisabled} amend={evidenceAmend} />

      <SerialEvidencePanel workOrder={workOrder} onSaved={recordSerialSaved} disabled={evidenceDisabled} amend={evidenceAmend} />

      {(workOrder.startSignPath || workOrder.endSignPath) && (
        <AdminPanel title="Signatures" description="Operator start and end sign-off captured for this phase.">
          <div className="grid gap-4 sm:grid-cols-2">
            {workOrder.startSignPath ? (
              <div className="rounded-lg border border-border bg-background p-3">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Start signature</div>
                <img src={workOrder.startSignPath} alt="Start signature" className="mt-2 h-16 w-auto max-w-full bg-white object-contain" />
                <div className="mt-1 text-xs text-muted-foreground">
                  {workOrder.startSignById || '—'}
                  {workOrder.prodStart ? ` · ${formatDate(workOrder.prodStart)}` : ''}
                </div>
              </div>
            ) : null}
            {workOrder.endSignPath ? (
              <div className="rounded-lg border border-border bg-background p-3">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">End signature</div>
                <img src={workOrder.endSignPath} alt="End signature" className="mt-2 h-16 w-auto max-w-full bg-white object-contain" />
                <div className="mt-1 text-xs text-muted-foreground">
                  {workOrder.endSignById || '—'}
                  {workOrder.prodEnd ? ` · ${formatDate(workOrder.prodEnd)}` : ''}
                </div>
              </div>
            ) : null}
          </div>
        </AdminPanel>
      )}

      <details className="group rounded-2xl border border-border bg-card">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 text-sm font-semibold text-foreground">
          <span>Source record — audit trail &amp; inventory movements</span>
          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <div className="space-y-6 border-t border-border p-5">
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
      </details>
    </div>
  );
}
