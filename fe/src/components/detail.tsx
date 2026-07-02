import { type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ChevronDown, GitBranch } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { hasValue } from '@/lib/format';
import type { InventoryGenealogyEdge } from '@/lib/inventory-api';

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

// A walkable lot chip that links to the lot's detail (or a quiet span when unknown).
export function LotLink({ id, label }: { id?: string | null; label: string }) {
  if (!id) return <span className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">{label}</span>;
  return (
    <Link
      to={`/dashboard/inventory/lots/${encodeURIComponent(id)}`}
      className="rounded-md bg-muted px-2 py-1 text-xs font-medium text-foreground transition-colors hover:bg-accent"
    >
      {label}
    </Link>
  );
}

// Walkable genealogy: the lots produced here + their parent→child links.
export function GenealogyCard({
  genealogy,
  lots,
}: {
  genealogy: InventoryGenealogyEdge[];
  lots: Array<{ id: string; lotNumber: string | null }>;
}) {
  if (!genealogy.length && !lots.length) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GitBranch className="h-4 w-4 text-muted-foreground" />
          Genealogy
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {lots.length > 0 && (
          <div>
            <div className="mb-2 text-xs text-muted-foreground">Lots in this run</div>
            <div className="flex flex-wrap gap-2">
              {lots.map((lot) => (
                <LotLink key={lot.id} id={lot.id} label={lot.lotNumber || lot.id} />
              ))}
            </div>
          </div>
        )}
        {genealogy.length > 0 && (
          <div>
            <div className="mb-2 text-xs text-muted-foreground">Parent → child links</div>
            <ul className="space-y-1.5">
              {genealogy.map((edge) => (
                <li key={edge.id} className="flex flex-wrap items-center gap-2">
                  <LotLink id={edge.parentInventoryLotId} label={edge.parentInventoryLot?.lotNumber || edge.parentInventoryLotId || 'Unknown'} />
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                  <LotLink id={edge.childInventoryLotId} label={edge.childInventoryLot?.lotNumber || edge.childInventoryLotId || 'Unknown'} />
                  <span className="text-xs text-muted-foreground">{edge.relationshipType}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
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
