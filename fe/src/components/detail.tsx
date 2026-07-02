import { type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { hasValue } from '@/lib/format';

export interface SummaryRow {
  label: string;
  value: string | number | null | undefined;
}

// Answer-first summary strip: renders only the fields that have a value (handoff §8.5).
export function SummaryStrip({ rows }: { rows: SummaryRow[] }) {
  const present = rows.filter((row) => hasValue(row.value));
  if (!present.length) return null;
  return (
    <Card>
      <CardContent className="grid grid-cols-2 gap-x-6 gap-y-4 py-5 sm:grid-cols-3 xl:grid-cols-4">
        {present.map((row) => (
          <div key={row.label} className="min-w-0">
            <div className="text-xs text-muted-foreground">{row.label}</div>
            <div className="mt-1 truncate text-sm font-medium text-foreground">{row.value}</div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// Legacy/technical key-values, omitting empties so no `-` rows leak in.
export function DetailGrid({ rows }: { rows: SummaryRow[] }) {
  const present = rows.filter((row) => hasValue(row.value));
  if (!present.length) return <p className="text-sm text-muted-foreground">No source identifiers recorded.</p>;
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {present.map((row) => (
        <div key={row.label} className="min-w-0">
          <div className="text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground">{row.label}</div>
          <div className="mt-1 break-words text-sm font-medium text-foreground">{row.value}</div>
        </div>
      ))}
    </div>
  );
}

// Collapsed disclosure for legacy/migrated identifiers and audit tables (handoff §8.5, tagged Legacy).
export function SourceRecord({ title = 'Source record', children }: { title?: string; children: ReactNode }) {
  return (
    <details className="group rounded-2xl border border-border bg-card">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 text-sm font-semibold text-foreground">
        <span>
          {title} <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground">Legacy</span>
        </span>
        <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="space-y-6 border-t border-border p-5">{children}</div>
    </details>
  );
}
