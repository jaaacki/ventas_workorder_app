import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, PackageCheck } from 'lucide-react';
import { PageHeader, EmptyState } from '@/components/tailadmin';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { fetchFinishedGoodsLots } from '@/lib/lots-api';
import { formatDate, humanStatus, toneToBadgeVariant } from '@/lib/format';

export default function LotsPage() {
  const { data, isLoading, isError } = useQuery({ queryKey: ['finished-goods-lots'], queryFn: fetchFinishedGoodsLots });
  const lots = data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Finished goods"
        description="Released finished-goods lots. Open a lot for its full batch record and genealogy."
      />

      {isLoading ? (
        <div className="flex h-40 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : isError ? (
        <EmptyState icon={<AlertTriangle className="h-6 w-6" />} title="Lots unavailable" description="The finished-goods list could not be loaded." />
      ) : lots.length ? (
        <div className="rounded-2xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lot</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Quantity</TableHead>
                <TableHead>HET / clinic origin</TableHead>
                <TableHead>Released</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lots.map((lot) => {
                const status = humanStatus(lot.status);
                return (
                  <TableRow key={lot.id}>
                    <TableCell className="font-medium text-foreground">
                      {lot.lotNumber ? (
                        <Link className="hover:underline" to={`/dashboard/lots/${encodeURIComponent(lot.lotNumber)}`}>
                          {lot.lotNumber}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">{lot.id}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{lot.product || '—'}</TableCell>
                    <TableCell>
                      <Badge variant={toneToBadgeVariant(status.tone)}>{status.label}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {lot.quantity != null ? `${lot.quantity}${lot.uom ? ` ${lot.uom}` : ''}` : '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {lot.hetNumber || '—'}
                      {lot.clinicName ? <span className="text-xs"> · {lot.clinicName}</span> : null}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(lot.releasedAt) ?? '—'}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      ) : (
        <EmptyState
          icon={<PackageCheck className="h-6 w-6" />}
          title="No finished goods yet"
          description="Released production runs appear here as finished-goods lots."
        />
      )}
    </div>
  );
}
