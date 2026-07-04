import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Activity, AlertTriangle, Boxes, Gauge, PackageCheck, Timer } from 'lucide-react';
import { PageHeader, AdminPanel, MetricCard, EmptyState } from '@/components/tailadmin';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { BarRows, LineChart, CHART_PRIMARY, CHART_SECONDARY } from '@/components/charts';
import { fetchMetricsOverview, type MetricsOverview } from '@/lib/metrics-api';
import { humanStatus } from '@/lib/format';

function formatMinutes(minutes: number): string {
  if (!Number.isFinite(minutes)) return '—';
  if (minutes < 60) return `${Math.round(minutes)}m`;
  return `${(minutes / 60).toFixed(1)}h`;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function CycleTimeTable({ rows }: { rows: MetricsOverview['cycleTimeByPhase'] }) {
  const maxAvg = Math.max(1, ...rows.map((row) => row.avgMinutes));
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Phase</TableHead>
            <TableHead className="w-[30%]">Avg</TableHead>
            <TableHead className="text-right">P50</TableHead>
            <TableHead className="text-right">P90</TableHead>
            <TableHead className="text-right">Runs</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.phaseShort}>
              <TableCell className="font-medium text-foreground">{row.phaseShort}</TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <div className="h-2 flex-1 overflow-hidden rounded bg-gray-100 dark:bg-gray-800">
                    <div
                      className="h-full rounded"
                      style={{ width: `${(row.avgMinutes / maxAvg) * 100}%`, background: CHART_PRIMARY }}
                    />
                  </div>
                  <span className="w-12 shrink-0 text-right text-sm tabular-nums text-muted-foreground">
                    {formatMinutes(row.avgMinutes)}
                  </span>
                </div>
              </TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">{formatMinutes(row.p50Minutes)}</TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">{formatMinutes(row.p90Minutes)}</TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">{row.count}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export default function ManagerDashboardPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['metrics', 'overview'],
    queryFn: () => fetchMetricsOverview(),
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Insights" description="Line health for production and QA managers." />
        <div className="flex min-h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="space-y-6">
        <PageHeader title="Insights" description="Line health for production and QA managers." />
        <EmptyState icon={<AlertTriangle className="h-6 w-6" />} title="Could not load metrics" description="Try again shortly." />
      </div>
    );
  }

  const wipTotal = sum(data.wipByPhase.map((phase) => phase.count));
  const releasedTotal = sum(data.throughput.weekly.map((point) => point.released));
  const lotsTotal = sum(data.throughput.weekly.map((point) => point.lotsMinted));
  const weekly = data.throughput.weekly;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Insights"
        description={`Line health over the last ${data.windowDays} days. Refreshes on load.`}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={<Activity className="h-6 w-6" />} label="Runs in progress" value={wipTotal} detail={`${data.wipByPhase.length} phases`} />
        <MetricCard icon={<PackageCheck className="h-6 w-6" />} label="Released" value={releasedTotal} detail={`${data.windowDays}d`} />
        <MetricCard icon={<Boxes className="h-6 w-6" />} label="Lots minted" value={lotsTotal} detail={`${data.windowDays}d`} />
        <MetricCard icon={<AlertTriangle className="h-6 w-6" />} label="Stalled runs" value={data.stalledRuns.length} detail={`> ${data.stalledDays}d idle`} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <AdminPanel title="Work in progress by phase" description="Active runs at each current phase.">
          {data.wipByPhase.length ? (
            <BarRows data={data.wipByPhase.map((phase) => ({ label: phase.phaseShort ?? 'Unassigned', value: phase.count }))} />
          ) : (
            <EmptyState icon={<Activity className="h-6 w-6" />} title="No active runs" />
          )}
        </AdminPanel>

        <AdminPanel title="Cycle time by phase" description={`Avg / P50 / P90 of finished phases in the last ${data.windowDays} days.`}>
          {data.cycleTimeByPhase.length ? (
            <CycleTimeTable rows={data.cycleTimeByPhase} />
          ) : (
            <EmptyState icon={<Timer className="h-6 w-6" />} title="No finished phases in window" />
          )}
        </AdminPanel>
      </div>

      <AdminPanel title="Throughput" description="Runs released and finished-goods lots minted per week.">
        {weekly.length ? (
          <LineChart
            periods={weekly.map((point) => point.period)}
            formatPeriod={(period) => period.slice(5)}
            series={[
              { name: 'Released', color: CHART_PRIMARY, values: weekly.map((point) => point.released) },
              { name: 'Lots minted', color: CHART_SECONDARY, values: weekly.map((point) => point.lotsMinted) },
            ]}
          />
        ) : (
          <EmptyState icon={<Gauge className="h-6 w-6" />} title="No throughput in window" />
        )}
      </AdminPanel>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <AdminPanel title="Stalled runs" description={`Active runs with no state change in over ${data.stalledDays} days.`}>
          {data.stalledRuns.length ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Run</TableHead>
                    <TableHead>Phase</TableHead>
                    <TableHead className="text-right">Age</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.stalledRuns.map((run) => (
                    <TableRow key={run.id}>
                      <TableCell>
                        <Link
                          to={`/dashboard/work-orders/${encodeURIComponent(run.id)}`}
                          className="font-medium text-foreground hover:underline"
                        >
                          {run.woNumber || run.id}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{run.phaseShort ?? '—'}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{run.ageDays}d</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <EmptyState icon={<AlertTriangle className="h-6 w-6" />} title="No stalled runs" description="Every active run has moved recently." />
          )}
        </AdminPanel>

        <AdminPanel title="Collection pipeline" description="Operational collection units by status.">
          {data.collectionPipeline.length ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {data.collectionPipeline.map((entry) => (
                <div key={entry.status} className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
                  <div className="text-2xl font-bold text-gray-800 dark:text-white/90">{entry.count}</div>
                  <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{humanStatus(entry.status).label}</div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon={<Boxes className="h-6 w-6" />} title="No collection units" />
          )}
        </AdminPanel>
      </div>
    </div>
  );
}
