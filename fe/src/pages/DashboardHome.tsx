import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchWorkOrders } from '@/lib/work-orders-api';
import { useAuthStore } from '@/store/authStore';
import { AdminPanel, EmptyState, MetricCard, PageHeader, StatusPill } from '@/components/tailadmin';
import { AlertTriangle, ArrowRight, ClipboardList, Factory, FlaskConical, PackageCheck } from 'lucide-react';

function legacyStateLabel(status: string) {
  return status.replace(/^\d+\.\s*/, '');
}

function legacyStateTone(status: string): 'brand' | 'success' | 'warning' | 'error' | 'neutral' {
  if (status.startsWith('2. ')) return 'success';
  if (status.startsWith('3. ')) return 'warning';
  if (status.startsWith('4. ')) return 'brand';
  if (status.startsWith('5. ')) return 'neutral';
  return 'neutral';
}

export default function DashboardHome() {
  const { user } = useAuthStore();
  const { data: workOrders = [], isLoading } = useQuery({
    queryKey: ['work-orders'],
    queryFn: fetchWorkOrders,
  });

  const nextPhase = workOrders.filter((wo) => wo.legacyStateBucket === '2. Next Phase');
  const quarantine = workOrders.filter((wo) => wo.legacyStateBucket === '3. In Quarantine');
  const finishedGoods = workOrders.filter((wo) => wo.legacyStateBucket === '4. Finished Goods');
  const completed = workOrders.filter((wo) => wo.legacyStateBucket === '5. WO Completed');
  const blocked = workOrders.filter((wo) => wo.missingAdvanceRequirements.length > 0 && wo.legacyStateBucket === '2. Next Phase');
  const priority = Array.from(
    new Map([...blocked, ...quarantine, ...finishedGoods].map((wo) => [wo.id, wo])).values(),
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
        <MetricCard icon={<ClipboardList className="h-6 w-6" />} label="Work orders" value={workOrders.length} />
        <MetricCard icon={<AlertTriangle className="h-6 w-6" />} label="Blocked next phase" value={blocked.length} detail={<StatusPill tone="warning">Review</StatusPill>} />
        <MetricCard icon={<FlaskConical className="h-6 w-6" />} label="In quarantine" value={quarantine.length} />
        <MetricCard icon={<PackageCheck className="h-6 w-6" />} label="Finished goods" value={finishedGoods.length} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <AdminPanel title="Priority work" description="Next-phase blockers, quarantined work, and finished goods waiting for release handling.">
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
                      {wo.legacyProductionState} · {wo.het?.hetNumber || wo.hetId || 'No HET'}
                    </div>
                  </div>
                  <StatusPill tone={legacyStateTone(wo.legacyStateBucket)}>
                    {legacyStateLabel(wo.legacyStateBucket)}
                  </StatusPill>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState icon={<Factory className="h-6 w-6" />} title="No priority exceptions" description="Next-phase blockers, quarantined work, and finished goods will appear here." />
          )}
        </AdminPanel>

        <AdminPanel title="Readiness summary">
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-lg border border-gray-200 p-3 dark:border-gray-800">
              <span className="text-sm text-gray-600 dark:text-gray-300">Next phase</span>
              <span className="text-lg font-semibold text-gray-800 dark:text-white/90">{nextPhase.length}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-gray-200 p-3 dark:border-gray-800">
              <span className="text-sm text-gray-600 dark:text-gray-300">Blocked next phase</span>
              <span className="text-lg font-semibold text-gray-800 dark:text-white/90">{blocked.length}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-gray-200 p-3 dark:border-gray-800">
              <span className="text-sm text-gray-600 dark:text-gray-300">In quarantine</span>
              <span className="text-lg font-semibold text-gray-800 dark:text-white/90">{quarantine.length}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-gray-200 p-3 dark:border-gray-800">
              <span className="text-sm text-gray-600 dark:text-gray-300">WO completed</span>
              <span className="text-lg font-semibold text-gray-800 dark:text-white/90">{completed.length}</span>
            </div>
          </div>
        </AdminPanel>
      </div>
    </div>
  );
}
