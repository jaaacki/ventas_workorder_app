import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Boxes, Building2, CalendarRange } from 'lucide-react';
import { PageHeader, AdminPanel, MetricCard, EmptyState } from '@/components/tailadmin';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { BarRows, CHART_PRIMARY } from '@/components/charts';
import { fetchCollectionReport } from '@/lib/collection-report-api';

// Collections per clinic and period. A "collection" is one minted/collected HET;
// see collectionReportService for the aggregation. Managers only (owner/admin/
// production_manager/qa_manager), matching the Insights dashboard gate.
export default function CollectionReportPage() {
  const [groupBy, setGroupBy] = useState<'week' | 'month'>('month');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['collection-report', groupBy, from, to],
    queryFn: () =>
      fetchCollectionReport({ groupBy, from: from || undefined, to: to || undefined }),
  });

  const controls = (
    <div className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        From
        <input
          type="date"
          value={from}
          onChange={(event) => setFrom(event.target.value)}
          className="h-9 rounded-lg border border-border bg-transparent px-2 text-sm text-foreground focus:border-ring focus:outline-none"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        To
        <input
          type="date"
          value={to}
          onChange={(event) => setTo(event.target.value)}
          className="h-9 rounded-lg border border-border bg-transparent px-2 text-sm text-foreground focus:border-ring focus:outline-none"
        />
      </label>
      <div className="inline-flex overflow-hidden rounded-lg border border-border">
        {(['week', 'month'] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setGroupBy(option)}
            className={`px-3 py-2 text-sm capitalize transition-colors ${
              groupBy === option ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'
            }`}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Collection report"
        description="Minted HETs collected per clinic and per period."
        action={controls}
      />

      {isLoading ? (
        <div className="flex min-h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
        </div>
      ) : isError || !data ? (
        <EmptyState icon={<AlertTriangle className="h-6 w-6" />} title="Could not load report" description="Try again shortly." />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <MetricCard icon={<Boxes className="h-6 w-6" />} label="Collections" value={data.total} detail="HETs collected" />
            <MetricCard icon={<Building2 className="h-6 w-6" />} label="Clinics" value={data.byClinic.length} detail="with collections" />
            <MetricCard icon={<CalendarRange className="h-6 w-6" />} label="Periods" value={data.byPeriod.length} detail={`by ${data.groupBy}`} />
          </div>

          <AdminPanel title="By clinic" description="Collections per donor clinic in the selected window.">
            {data.byClinic.length ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Clinic</TableHead>
                      <TableHead>HCI code</TableHead>
                      <TableHead className="text-right">Collections</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.byClinic.map((clinic) => (
                      <TableRow key={clinic.clinicId ?? clinic.clinicName ?? 'unknown'}>
                        <TableCell className="font-medium text-foreground">{clinic.clinicName || clinic.clinicId || 'Unknown'}</TableCell>
                        <TableCell className="text-muted-foreground">{clinic.hciCode || '—'}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">{clinic.count}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <EmptyState icon={<Building2 className="h-6 w-6" />} title="No collections in window" />
            )}
          </AdminPanel>

          <AdminPanel title="By period" description={`Collections per ${data.groupBy}.`}>
            {data.byPeriod.length ? (
              <BarRows data={data.byPeriod.map((point) => ({ label: point.period, value: point.count }))} color={CHART_PRIMARY} />
            ) : (
              <EmptyState icon={<CalendarRange className="h-6 w-6" />} title="No collections in window" />
            )}
          </AdminPanel>
        </>
      )}
    </div>
  );
}
