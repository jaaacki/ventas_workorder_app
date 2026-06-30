import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchWorkOrders } from '@/lib/work-orders-api';
import { useAuthStore } from '@/store/authStore';
import { AdminPanel, EmptyState, MetricCard, PageHeader, StatusPill } from '@/components/tailadmin';
import { AlertTriangle, ArrowRight, ClipboardList, Factory, FlaskConical, PackageCheck } from 'lucide-react';

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    NotStarted: 'Not started',
    InProgress: 'In progress',
    ReadyToAdvance: 'Ready to advance',
    ReleasePending: 'Release pending',
    Blocked: 'Blocked',
  };
  return labels[status] ?? status;
}

export default function DashboardHome() {
  const { user } = useAuthStore();
  const { data: workOrders = [], isLoading } = useQuery({
    queryKey: ['work-orders'],
    queryFn: fetchWorkOrders,
  });

  const blocked = workOrders.filter((wo) => wo.operationalStatus === 'Blocked');
  const qaGate = workOrders.filter((wo) => /steril|bet/i.test(wo.currentPhaseLabel));
  const release = workOrders.filter((wo) => wo.operationalStatus === 'ReleasePending');
  const ready = workOrders.filter((wo) => wo.lifecycleState === 'ReadyToAdvance' && wo.operationalStatus !== 'Blocked');
  const priority = Array.from(
    new Map([...blocked, ...qaGate, ...release].map((wo) => [wo.id, wo])).values(),
  ).slice(0, 6);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Operations, ${user?.name || user?.email || 'team'}`}
        description="Production readiness, QA gates, and release status across active work orders."
        action={
          <Link
            to="/dashboard/work-orders"
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-500 px-4 text-sm font-medium text-white shadow-theme-xs transition-colors hover:bg-brand-600"
          >
            Production board
            <ArrowRight className="h-4 w-4" />
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={<ClipboardList className="h-6 w-6" />} label="Active work orders" value={workOrders.length} />
        <MetricCard icon={<AlertTriangle className="h-6 w-6" />} label="Blocked" value={blocked.length} detail={<StatusPill tone="warning">Review</StatusPill>} />
        <MetricCard icon={<FlaskConical className="h-6 w-6" />} label="QA gates" value={qaGate.length} />
        <MetricCard icon={<PackageCheck className="h-6 w-6" />} label="At release" value={release.length} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <AdminPanel title="Priority work" description="Blocked, QA-gated, and release-stage work orders.">
          {isLoading ? (
            <div className="flex h-40 items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
            </div>
          ) : priority.length ? (
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {priority.map((wo) => (
                <Link
                  key={wo.id}
                  to={`/dashboard/work-orders?wo=${encodeURIComponent(wo.id)}`}
                  className="flex items-center justify-between gap-4 py-3 transition-colors hover:bg-gray-50 dark:hover:bg-white/[0.03]"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-gray-800 dark:text-white/90">{wo.woNumber || wo.id}</div>
                    <div className="mt-1 truncate text-xs text-gray-500 dark:text-gray-400">
                      {wo.currentPhaseLabel} · {wo.het?.hetNumber || wo.hetId || 'No HET'}
                    </div>
                  </div>
                  <StatusPill tone={wo.operationalStatus === 'Blocked' ? 'warning' : wo.lifecycleState === 'ReadyToAdvance' ? 'success' : 'brand'}>
                    {statusLabel(wo.operationalStatus)}
                  </StatusPill>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState icon={<Factory className="h-6 w-6" />} title="No priority exceptions" description="Blocked, QA-gated, and release work will appear here." />
          )}
        </AdminPanel>

        <AdminPanel title="Readiness summary">
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-lg border border-gray-200 p-3 dark:border-gray-800">
              <span className="text-sm text-gray-600 dark:text-gray-300">Ready to move</span>
              <span className="text-lg font-semibold text-gray-800 dark:text-white/90">{ready.length}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-gray-200 p-3 dark:border-gray-800">
              <span className="text-sm text-gray-600 dark:text-gray-300">Blocked by missing data/gates</span>
              <span className="text-lg font-semibold text-gray-800 dark:text-white/90">{blocked.length}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-gray-200 p-3 dark:border-gray-800">
              <span className="text-sm text-gray-600 dark:text-gray-300">Waiting on QA/BET</span>
              <span className="text-lg font-semibold text-gray-800 dark:text-white/90">{qaGate.length}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-gray-200 p-3 dark:border-gray-800">
              <span className="text-sm text-gray-600 dark:text-gray-300">Release stage</span>
              <span className="text-lg font-semibold text-gray-800 dark:text-white/90">{release.length}</span>
            </div>
          </div>
        </AdminPanel>
      </div>
    </div>
  );
}
