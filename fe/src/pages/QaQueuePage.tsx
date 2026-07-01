import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, ClipboardCheck, FlaskConical, PackageCheck, ShieldCheck } from 'lucide-react';
import { AdminPanel, EmptyState, MetricCard, PageHeader, StatusPill } from '@/components/tailadmin';
import { Button } from '@/components/ui/button';
import { fetchQaWorkOrderQueue, type WorkOrderSummary } from '@/lib/work-orders-api';
import { statusTone, workflowLabel } from '@/lib/work-order-ui';

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleString() : '-';
}

function WorkOrderQueueCard({ workOrder }: { workOrder: WorkOrderSummary }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900">
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

      <div className="mt-4 grid gap-2 text-xs text-gray-500 dark:text-gray-400 sm:grid-cols-2">
        <div>
          <span className="font-medium text-gray-700 dark:text-gray-300">Phase</span>
          <div className="mt-0.5">{workOrder.currentPhaseLabel}</div>
        </div>
        <div>
          <span className="font-medium text-gray-700 dark:text-gray-300">HET</span>
          <div className="mt-0.5">{workOrder.het?.hetNumber || workOrder.hetId || '-'}</div>
        </div>
        <div>
          <span className="font-medium text-gray-700 dark:text-gray-300">Started</span>
          <div className="mt-0.5">{formatDate(workOrder.prodStart)}</div>
        </div>
        <div>
          <span className="font-medium text-gray-700 dark:text-gray-300">Finished</span>
          <div className="mt-0.5">{formatDate(workOrder.prodEnd)}</div>
        </div>
      </div>

      {workOrder.readinessBlockers.length > 0 && (
        <div className="mt-4 flex items-start gap-2 rounded-md bg-warning-50 px-3 py-2 text-xs text-warning-600 dark:bg-warning-500/10 dark:text-warning-500">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{workOrder.readinessBlockers.join(', ')}</span>
        </div>
      )}

      <div className="mt-4">
        <Button asChild size="sm" variant="outline">
          <Link to={`/dashboard/work-orders/${encodeURIComponent(workOrder.id)}`}>
            Open work order
          </Link>
        </Button>
      </div>
    </div>
  );
}

function QueueSection({
  title,
  description,
  items,
  icon,
}: {
  title: string;
  description: string;
  items: WorkOrderSummary[];
  icon: ReactNode;
}) {
  return (
    <AdminPanel title={title} description={description}>
      {items.length ? (
        <div className="grid gap-3 xl:grid-cols-2">
          {items.map((workOrder) => (
            <WorkOrderQueueCard key={workOrder.id} workOrder={workOrder} />
          ))}
        </div>
      ) : (
        <EmptyState icon={icon} title="Nothing waiting" description="No work orders are currently in this queue." />
      )}
    </AdminPanel>
  );
}

export default function QaQueuePage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['work-orders', 'qa-queue'],
    queryFn: fetchQaWorkOrderQueue,
  });

  const queue = data ?? { counts: { sterilisation: 0, quarantine: 0, release: 0 }, sterilisation: [], quarantine: [], release: [] };

  return (
    <div className="space-y-6">
      <PageHeader
        title="QA queue"
        description="Sterilisation/BET gate review, quarantine follow-up, and final release readiness."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard icon={<FlaskConical className="h-6 w-6" />} label="Sterilisation/BET" value={queue.counts.sterilisation} />
        <MetricCard icon={<ShieldCheck className="h-6 w-6" />} label="Quarantine" value={queue.counts.quarantine} />
        <MetricCard icon={<PackageCheck className="h-6 w-6" />} label="Release ready" value={queue.counts.release} />
      </div>

      {isLoading ? (
        <div className="flex h-40 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
        </div>
      ) : isError ? (
        <EmptyState icon={<AlertTriangle className="h-6 w-6" />} title="Queue unavailable" description="The QA queue could not be loaded." />
      ) : (
        <div className="space-y-6">
          <QueueSection
            title="Sterilisation/BET gate"
            description="Current gate-phase work orders waiting for passing sterilisation or BET evidence."
            items={queue.sterilisation}
            icon={<FlaskConical className="h-6 w-6" />}
          />
          <QueueSection
            title="Quarantine review"
            description="Work orders flagged by the legacy quarantine bucket for QA follow-up."
            items={queue.quarantine}
            icon={<ClipboardCheck className="h-6 w-6" />}
          />
          <QueueSection
            title="Final release"
            description="Final-phase work orders that have finished production and are waiting for release handling."
            items={queue.release}
            icon={<CheckCircle2 className="h-6 w-6" />}
          />
        </div>
      )}
    </div>
  );
}
