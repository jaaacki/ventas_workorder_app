import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowUp, ArrowDown, ArrowRight, Building2, ExternalLink, GitBranch, Package, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader, EmptyState } from '@/components/tailadmin';
import { formatDate, humanStatus, toneToBadgeVariant } from '@/lib/format';
import {
  fetchInventoryLots,
  fetchInventoryLot,
  fetchInventoryGenealogy,
  fetchLotInventoryTrace,
  type InventoryGenealogyEdge,
  type InventoryLot,
  type InventoryTraceCollection,
} from '@/lib/inventory-api';

function lotLabel(lot?: Pick<InventoryLot, 'lotNumber' | 'id'> | null) {
  return lot?.lotNumber || lot?.id || 'Unknown';
}

function skuLabel(lot?: InventoryLot | null) {
  return lot?.inventorySku?.description || lot?.inventorySku?.sku || lot?.inventorySkuId || null;
}

// One step in the upstream collection chain: clinic → container → deliver → collect.
function OriginNode({ icon, label, detail }: { icon: ReactNode; label: string; detail?: string | null }) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
      <span className="text-muted-foreground">{icon}</span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-foreground">{label}</span>
        {detail && <span className="block truncate text-xs text-muted-foreground">{detail}</span>}
      </span>
    </div>
  );
}

// Upstream collection origin of the selected lot: where the HET was collected from.
// Renders nothing when the lot has no collection provenance (e.g. a reagent lot).
function CollectionOrigin({ collection }: { collection: InventoryTraceCollection }) {
  const clinic = collection.collectionPoints[0];
  const supply = collection.supplyEntities[0];
  const unit = collection.collectionUnits[0];
  const issuance = collection.issuanceOrders[0];
  const receipt = collection.collectionReceipts[0];
  const clinicLabel = clinic?.displayName || supply?.name || clinic?.id || supply?.id;
  if (!clinicLabel && !unit && !receipt) return null;

  const nodes: ReactNode[] = [];
  if (clinicLabel) nodes.push(<OriginNode key="clinic" icon={<Building2 className="h-4 w-4" />} label={clinicLabel} detail={clinic?.hciCode || supply?.legalName} />);
  if (unit) nodes.push(<OriginNode key="unit" icon={<Package className="h-4 w-4" />} label={unit.unitNumber || unit.id} detail={humanStatus(unit.status).label} />);
  if (issuance) nodes.push(<OriginNode key="issuance" icon={<ArrowRight className="h-4 w-4" />} label="Delivered empty" detail={formatDate(issuance.issuedAt)} />);
  if (receipt) nodes.push(<OriginNode key="receipt" icon={<ArrowDown className="h-4 w-4" />} label="Collected filled" detail={formatDate(receipt.receivedAt)} />);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          Collection origin
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-center gap-2">
          {nodes.map((node, index) => (
            <div key={index} className="flex items-center gap-2">
              {index > 0 && <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
              {node}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// A walkable genealogy node — clicking re-centres the tree on this lot.
function LotNode({
  id,
  label,
  relationship,
  onWalk,
}: {
  id?: string | null;
  label: string;
  relationship?: string | null;
  onWalk: (id: string) => void;
}) {
  return (
    <button
      type="button"
      disabled={!id}
      onClick={() => id && onWalk(id)}
      className="flex w-full items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2 text-left transition-colors enabled:hover:bg-accent disabled:opacity-60"
    >
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-foreground">{label}</span>
        {relationship && <span className="block truncate text-xs text-muted-foreground">{relationship}</span>}
      </span>
    </button>
  );
}

export default function TraceabilityPage() {
  const [term, setTerm] = useState('');
  const [query, setQuery] = useState('');
  const [selectedLotId, setSelectedLotId] = useState<string | null>(null);

  const searchQuery = useQuery({
    queryKey: ['inventory', 'lots', 'trace-search', query],
    queryFn: () => fetchInventoryLots({ q: query, take: 25 }),
    enabled: query.trim().length >= 2,
  });

  const lotQuery = useQuery({
    queryKey: ['inventory', 'lot', selectedLotId],
    queryFn: () => fetchInventoryLot(selectedLotId!),
    enabled: Boolean(selectedLotId),
  });

  const genealogyQuery = useQuery({
    queryKey: ['inventory', 'genealogy', selectedLotId],
    queryFn: () => fetchInventoryGenealogy(selectedLotId!),
    enabled: Boolean(selectedLotId),
    retry: false,
  });

  const traceQuery = useQuery({
    queryKey: ['inventory', 'lot-trace', selectedLotId],
    queryFn: () => fetchLotInventoryTrace(selectedLotId!),
    enabled: Boolean(selectedLotId),
    retry: false,
  });

  const lot = lotQuery.data;
  const genealogy = genealogyQuery.data;
  const status = lot ? humanStatus(lot.status) : null;

  const relatedLot = (edge: InventoryGenealogyEdge, direction: 'parent' | 'child') =>
    direction === 'parent'
      ? { id: edge.parentInventoryLotId, label: lotLabel(edge.parentInventoryLot) }
      : { id: edge.childInventoryLotId, label: lotLabel(edge.childInventoryLot) };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Traceability"
        description="Walk the chain of custody — search a lot, then follow its parents and children."
      />

      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          setQuery(term);
        }}
      >
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Search a lot number or id…"
            className="h-11 w-full rounded-lg border border-border bg-transparent pl-9 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-3 focus:ring-ring/20"
            aria-label="Search lots"
          />
        </div>
        <Button type="submit">Search</Button>
      </form>

      {query.trim().length >= 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Results</CardTitle>
          </CardHeader>
          <CardContent>
            {searchQuery.isLoading ? (
              <div className="flex h-20 items-center justify-center">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            ) : searchQuery.data?.length ? (
              <ul className="divide-y divide-border">
                {searchQuery.data.map((result) => (
                  <li key={result.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedLotId(result.id)}
                      className={`-mx-2 flex w-[calc(100%+1rem)] items-center justify-between gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-accent ${
                        selectedLotId === result.id ? 'bg-accent' : ''
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-foreground">{lotLabel(result)}</span>
                        <span className="block truncate text-xs text-muted-foreground">{skuLabel(result) || result.inventoryType}</span>
                      </span>
                      <Badge variant={toneToBadgeVariant(humanStatus(result.status).tone)}>{humanStatus(result.status).label}</Badge>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-2 text-sm text-muted-foreground">No lots match “{query}”.</p>
            )}
          </CardContent>
        </Card>
      )}

      {selectedLotId && traceQuery.data && <CollectionOrigin collection={traceQuery.data.collection} />}

      {selectedLotId && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <GitBranch className="h-4 w-4 text-muted-foreground" />
              Chain of custody
            </CardTitle>
          </CardHeader>
          <CardContent>
            {lotQuery.isLoading ? (
              <div className="flex h-24 items-center justify-center">
                <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            ) : (
              <div className="grid items-start gap-4 lg:grid-cols-3">
                <div>
                  <div className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <ArrowUp className="h-3.5 w-3.5" />
                    Parents
                  </div>
                  <div className="space-y-2">
                    {genealogyQuery.isLoading ? (
                      <p className="text-xs text-muted-foreground">Loading…</p>
                    ) : genealogyQuery.isError ? (
                      <p className="text-xs text-muted-foreground">Genealogy unavailable.</p>
                    ) : genealogy?.parents.length ? (
                      genealogy.parents.map((edge) => {
                        const node = relatedLot(edge, 'parent');
                        return <LotNode key={edge.id} id={node.id} label={node.label} relationship={edge.relationshipType} onWalk={setSelectedLotId} />;
                      })
                    ) : (
                      <p className="text-xs text-muted-foreground">No parents.</p>
                    )}
                  </div>
                </div>

                <div className="rounded-xl border border-primary bg-primary/5 p-4">
                  <div className="text-xs text-muted-foreground">This lot</div>
                  <div className="mt-1 truncate text-base font-semibold text-foreground">{lotLabel(lot)}</div>
                  <div className="mt-1 truncate text-xs text-muted-foreground">{skuLabel(lot) || lot?.inventoryType}</div>
                  {status && <Badge variant={toneToBadgeVariant(status.tone)} className="mt-2">{status.label}</Badge>}
                  {lot && (
                    <Button asChild variant="outline" size="sm" className="mt-3 w-full">
                      <Link to={`/dashboard/inventory/lots/${encodeURIComponent(lot.id)}`}>
                        <ExternalLink className="h-3.5 w-3.5" />
                        Open lot detail
                      </Link>
                    </Button>
                  )}
                </div>

                <div>
                  <div className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <ArrowDown className="h-3.5 w-3.5" />
                    Children
                  </div>
                  <div className="space-y-2">
                    {genealogyQuery.isLoading ? (
                      <p className="text-xs text-muted-foreground">Loading…</p>
                    ) : genealogyQuery.isError ? (
                      <p className="text-xs text-muted-foreground">Genealogy unavailable.</p>
                    ) : genealogy?.children.length ? (
                      genealogy.children.map((edge) => {
                        const node = relatedLot(edge, 'child');
                        return <LotNode key={edge.id} id={node.id} label={node.label} relationship={edge.relationshipType} onWalk={setSelectedLotId} />;
                      })
                    ) : (
                      <p className="text-xs text-muted-foreground">No children.</p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {!selectedLotId && query.trim().length < 2 && (
        <EmptyState icon={<GitBranch className="h-6 w-6" />} title="Trace the thread" description="Search a lot above to walk its parents and children." />
      )}
    </div>
  );
}
