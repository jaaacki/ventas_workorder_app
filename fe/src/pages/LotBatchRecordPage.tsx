import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, Download, FileText, GitBranch } from 'lucide-react';
import { PageHeader, AdminPanel, EmptyState, StatusPill } from '@/components/tailadmin';
import { SummaryStrip, LotLink } from '@/components/detail';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { fetchBatchRecord, batchRecordPdfUrl, type BatchRecordPhase } from '@/lib/lots-api';
import { formatDate, humanStatus, hasValue } from '@/lib/format';

function SignatureBlock({ label, signer, at, dataUrl }: { label: string; signer: string | null; at: string | null; dataUrl: string }) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <img src={dataUrl} alt={`${label} signature`} className="mt-2 h-16 w-auto max-w-full bg-white object-contain" />
      <div className="mt-1 text-xs text-muted-foreground">
        {signer || '—'}
        {at ? ` · ${formatDate(at)}` : ''}
      </div>
    </div>
  );
}

function PhaseSection({ phase }: { phase: BatchRecordPhase }) {
  const title = `${phase.phase?.sortOrder != null ? `${phase.phase.sortOrder + 1}. ` : ''}${phase.phase?.phaseName ?? phase.phase?.phaseShort ?? phase.workOrderId}`;
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        {phase.phase?.isGate ? <StatusPill tone="warning">Gate</StatusPill> : null}
        <Link
          to={`/dashboard/work-orders/${encodeURIComponent(phase.workOrderId)}`}
          className="ml-auto text-xs text-muted-foreground hover:underline"
        >
          {phase.woNumber || phase.workOrderId}
        </Link>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
        <div>
          <div className="text-xs text-muted-foreground">Started</div>
          <div className="text-foreground">{formatDate(phase.prodStart) ?? '—'}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Finished</div>
          <div className="text-foreground">{formatDate(phase.prodEnd) ?? '—'}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Duration (min)</div>
          <div className="text-foreground">{hasValue(phase.prodDuration) ? phase.prodDuration : '—'}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Output</div>
          <div className="text-foreground">{hasValue(phase.outputQuantity) ? phase.outputQuantity : '—'}</div>
        </div>
      </div>

      {phase.serials.length ? (
        <div className="mt-3 text-sm">
          <div className="text-xs text-muted-foreground">Serials</div>
          <ul className="mt-1 space-y-0.5">
            {phase.serials.map((serial) => (
              <li key={serial.id} className="text-foreground">
                {serial.bomLine?.description || serial.bomLine?.id || 'Line'}: <span className="font-medium">{serial.serialNumber || '—'}</span>
                {serial.bomLine?.inventorySku?.sku ? <span className="text-xs text-muted-foreground"> · {serial.bomLine.inventorySku.sku}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {phase.equipment.length ? (
        <div className="mt-3 text-sm">
          <div className="text-xs text-muted-foreground">Equipment</div>
          <div className="mt-1 flex flex-wrap gap-2">
            {phase.equipment.map((equip) => (
              <Badge key={equip.phaseEquipId} variant="outline">{equip.name || equip.equipId || equip.phaseEquipId}</Badge>
            ))}
          </div>
        </div>
      ) : null}

      {phase.sterilisations.length ? (
        <div className="mt-3 text-sm">
          <div className="text-xs text-muted-foreground">Sterilisation / BET</div>
          <ul className="mt-1 space-y-0.5">
            {phase.sterilisations.map((sterilise) => (
              <li key={sterilise.id} className="flex flex-wrap items-center gap-2 text-foreground">
                <span>{sterilise.direction || '—'}</span>
                {sterilise.result == null ? (
                  <Badge variant="outline">Pending</Badge>
                ) : sterilise.result ? (
                  <Badge variant="default">PASS</Badge>
                ) : (
                  <Badge variant="destructive">FAIL</Badge>
                )}
                <span className="text-xs text-muted-foreground">
                  BET {hasValue(sterilise.betReading) ? `${sterilise.betReading} EU/mL` : '—'}
                  {sterilise.signer ? ` · ${sterilise.signer}` : ''}
                  {sterilise.signOn ? ` · ${formatDate(sterilise.signOn)}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {(phase.startSignature || phase.endSignature || phase.photoDataUrl) && (
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {phase.startSignature ? (
            <SignatureBlock label="Start signature" signer={phase.startSignature.signer} at={phase.startSignature.at} dataUrl={phase.startSignature.dataUrl} />
          ) : null}
          {phase.endSignature ? (
            <SignatureBlock label="End signature" signer={phase.endSignature.signer} at={phase.endSignature.at} dataUrl={phase.endSignature.dataUrl} />
          ) : null}
          {phase.photoDataUrl ? (
            <div className="rounded-lg border border-border bg-background p-3">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Photo evidence</div>
              <img src={phase.photoDataUrl} alt="Phase evidence" className="mt-2 h-24 w-auto max-w-full rounded object-contain" />
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

export default function LotBatchRecordPage() {
  const { lotNumber = '' } = useParams();
  const { data: record, isLoading, isError } = useQuery({
    queryKey: ['batch-record', lotNumber],
    queryFn: () => fetchBatchRecord(lotNumber),
    enabled: Boolean(lotNumber),
  });

  if (isLoading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (isError || !record) {
    return (
      <div className="space-y-6">
        <PageHeader title={lotNumber} />
        <EmptyState icon={<AlertTriangle className="h-6 w-6" />} title="Batch record unavailable" description="This lot's batch record could not be loaded." />
      </div>
    );
  }

  const status = humanStatus(record.lot.status);

  return (
    <div className="space-y-6">
      <div>
        <Link to="/dashboard/lots" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline">
          <ArrowLeft className="h-4 w-4" /> Finished goods
        </Link>
        <PageHeader
          title={record.lot.lotNumber ?? record.lot.id}
          description={record.manufacturer?.manuName ?? undefined}
          action={
            <Button asChild>
              <a href={batchRecordPdfUrl(record.lot.lotNumber ?? record.lot.id)} download>
                <Download className="mr-2 h-4 w-4" /> PDF
              </a>
            </Button>
          }
        />
      </div>

      <SummaryStrip
        rows={[
          { label: 'Status', value: status.label },
          { label: 'Manufacturing number', value: record.manufacturer?.manuNumber },
          { label: 'Disposition', value: record.release?.status ? humanStatus(record.release.status).label : null },
          { label: 'Released', value: formatDate(record.release?.decisionAt ?? null) },
          { label: 'Released by', value: record.release?.decidedBy },
          { label: 'Quantity', value: hasValue(record.lot.quantityInitial) ? record.lot.quantityInitial : null },
          { label: 'HET', value: record.hetOrigin?.hetNumber },
          { label: 'Clinic origin', value: record.hetOrigin?.clinicName },
        ]}
      />

      {(record.hetOrigin || record.genealogyParents.length) && (
        <AdminPanel title="Origin & genealogy" description="Donor HET origin and the parent lots this finished-goods lot was converted from.">
          <div className="space-y-4">
            {record.hetOrigin ? (
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">HET</div>
                  <div className="text-sm font-medium text-foreground">{record.hetOrigin.hetNumber || record.hetOrigin.hetId}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Clinic</div>
                  <div className="text-sm font-medium text-foreground">{record.hetOrigin.clinicName || '—'}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">HCI code</div>
                  <div className="text-sm font-medium text-foreground">{record.hetOrigin.HCICode || '—'}</div>
                </div>
              </div>
            ) : null}
            {record.genealogyParents.length ? (
              <div>
                <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <GitBranch className="h-3.5 w-3.5" /> Parent lots
                </div>
                <div className="flex flex-wrap gap-2">
                  {record.genealogyParents.map((parent) => (
                    <LotLink key={parent.id} id={parent.id} label={`${parent.lotNumber || parent.id} (${parent.relationshipType})`} />
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </AdminPanel>
      )}

      <AdminPanel title="Batch record" description="Every phase of the production run in order, with recorded evidence, signatures, and timestamps.">
        {record.phases.length ? (
          <div className="space-y-4">
            {record.phases.map((phase) => (
              <PhaseSection key={phase.workOrderId} phase={phase} />
            ))}
          </div>
        ) : (
          <EmptyState icon={<FileText className="h-6 w-6" />} title="No phases recorded" description="This lot has no reconstructable production chain." />
        )}
      </AdminPanel>
    </div>
  );
}
