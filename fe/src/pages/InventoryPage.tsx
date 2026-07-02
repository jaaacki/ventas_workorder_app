import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  fetchInventoryGenealogy,
  fetchInventoryImportReports,
  fetchInventoryLocations,
  fetchInventoryLots,
  fetchInventoryOverview,
  fetchInventorySkus,
  fetchInventoryTransactions,
  type InventoryGenealogyEdge,
  type InventoryImportReport,
  type InventoryLocation,
  type InventoryLot,
  type InventorySku,
  type InventoryTransaction,
} from '@/lib/inventory-api';
import { AdminPanel, EmptyState, MetricCard, PageHeader, StatusPill } from '@/components/tailadmin';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuthStore } from '@/store/authStore';
import {
  AlertTriangle,
  Boxes,
  Database,
  ExternalLink,
  FileClock,
  GitBranch,
  MapPin,
  PackageSearch,
  Search,
  Tags,
} from 'lucide-react';

const ALL_FILTER = '__all__';

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleString() : '-';
}

function formatQty(value?: string | number | null, uom?: string | null) {
  if (value === null || value === undefined || value === '') return '-';
  return `${value}${uom ? ` ${uom}` : ''}`;
}

function statusTone(value?: string | null): 'brand' | 'success' | 'warning' | 'error' | 'neutral' {
  if (!value) return 'neutral';
  if (/available|complete|finished|released|receive|transfer_in/i.test(value)) return 'success';
  if (/hold|quarantine|pending|adjust/i.test(value)) return 'warning';
  if (/scrap|consume|used|void|lost|reject/i.test(value)) return 'error';
  if (/het|finished_good|transfer/i.test(value)) return 'brand';
  return 'neutral';
}

function skuLabel(sku?: InventorySku | null) {
  if (!sku) return '-';
  return sku.description || sku.sku || sku.id;
}

function lotLabel(lot?: InventoryLot | null) {
  if (!lot) return '-';
  return lot.lotNumber || lot.legacyHetId || lot.legacyItemSerialId || lot.id;
}

function locationLabel(location?: InventoryLocation | null) {
  if (!location) return '-';
  return location.name || location.id;
}

function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative w-full sm:max-w-sm">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-10 w-full rounded-lg border border-gray-200 bg-transparent py-2 pl-10 pr-3 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-none focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-white/[0.03] dark:text-white/90"
      />
    </div>
  );
}

function LotsTable({ lots }: { lots: InventoryLot[] }) {
  if (!lots.length) {
    return <EmptyState icon={<Boxes className="h-6 w-6" />} title="No inventory lots" />;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Lot</TableHead>
          <TableHead>SKU</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Quantity</TableHead>
          <TableHead>Location</TableHead>
          <TableHead>Work order</TableHead>
          <TableHead>Updated</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {lots.map((lot) => (
          <TableRow key={lot.id}>
            <TableCell>
              <Link
                to={`/dashboard/inventory/lots/${encodeURIComponent(lot.id)}`}
                className="inline-flex items-center gap-1 font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300"
              >
                {lotLabel(lot)}
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
              <div className="text-xs text-gray-500">{lot.id}</div>
            </TableCell>
            <TableCell>
              <div>{skuLabel(lot.inventorySku)}</div>
              <div className="text-xs text-gray-500">{lot.inventorySku?.category || lot.inventorySkuId || '-'}</div>
            </TableCell>
            <TableCell>
              <StatusPill tone={statusTone(lot.inventoryType)}>{lot.inventoryType.replace(/_/g, ' ')}</StatusPill>
            </TableCell>
            <TableCell>
              <StatusPill tone={statusTone(lot.status)}>{lot.status.replace(/_/g, ' ')}</StatusPill>
            </TableCell>
            <TableCell>{formatQty(lot.quantityCurrent, lot.uom)}</TableCell>
            <TableCell>{locationLabel(lot.currentLocation)}</TableCell>
            <TableCell>{lot.workOrderId || lot.hetId || '-'}</TableCell>
            <TableCell>{formatDate(lot.updatedAt)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function TransactionsTable({ transactions }: { transactions: InventoryTransaction[] }) {
  if (!transactions.length) {
    return <EmptyState icon={<Database className="h-6 w-6" />} title="No inventory transactions" />;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Transaction</TableHead>
          <TableHead>SKU / lot</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Quantity</TableHead>
          <TableHead>Movement</TableHead>
          <TableHead>Reference</TableHead>
          <TableHead>Occurred</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {transactions.map((transaction) => (
          <TableRow key={transaction.id}>
            <TableCell>
              <div className="font-medium text-gray-800 dark:text-white/90">{transaction.reason || transaction.id}</div>
              <div className="text-xs text-gray-500">{transaction.actor || transaction.sourceSystem || '-'}</div>
            </TableCell>
            <TableCell>
              <div>{skuLabel(transaction.inventorySku)}</div>
              <div className="text-xs text-gray-500">{lotLabel(transaction.inventoryLot)}</div>
            </TableCell>
            <TableCell>
              <StatusPill tone={statusTone(transaction.transactionType)}>
                {transaction.transactionType.replace(/_/g, ' ')}
              </StatusPill>
            </TableCell>
            <TableCell>{formatQty(transaction.quantity, transaction.uom)}</TableCell>
            <TableCell>
              <div>{locationLabel(transaction.fromLocation)}</div>
              <div className="text-xs text-gray-500">to {locationLabel(transaction.toLocation)}</div>
            </TableCell>
            <TableCell>{transaction.workOrderId || transaction.legacyRefNumber || transaction.legacyRefNumberOut || '-'}</TableCell>
            <TableCell>{formatDate(transaction.occurredAt || transaction.createdAt)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function SkusTable({ skus }: { skus: InventorySku[] }) {
  if (!skus.length) {
    return <EmptyState icon={<Tags className="h-6 w-6" />} title="No inventory SKUs" />;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>SKU</TableHead>
          <TableHead>Category</TableHead>
          <TableHead>Brand</TableHead>
          <TableHead>Size</TableHead>
          <TableHead>Serial mode</TableHead>
          <TableHead>Updated</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {skus.map((sku) => (
          <TableRow key={sku.id}>
            <TableCell>
              <div className="font-medium text-gray-800 dark:text-white/90">{sku.description || sku.sku || sku.id}</div>
              <div className="text-xs text-gray-500">{sku.sku || sku.id}</div>
            </TableCell>
            <TableCell>{sku.category || '-'}</TableCell>
            <TableCell>{sku.brand || '-'}</TableCell>
            <TableCell>{[sku.size, sku.colour, sku.uom].filter(Boolean).join(' / ') || '-'}</TableCell>
            <TableCell>{sku.serialisedMode || '-'}</TableCell>
            <TableCell>{formatDate(sku.updatedAt)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function LocationsTable({ locations }: { locations: InventoryLocation[] }) {
  if (!locations.length) {
    return <EmptyState icon={<MapPin className="h-6 w-6" />} title="No inventory locations" />;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Location</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Parent</TableHead>
          <TableHead>Source</TableHead>
          <TableHead>Updated</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {locations.map((location) => (
          <TableRow key={location.id}>
            <TableCell>
              <div className="font-medium text-gray-800 dark:text-white/90">{location.name}</div>
              <div className="text-xs text-gray-500">{location.description || location.id}</div>
            </TableCell>
            <TableCell>
              <StatusPill tone={statusTone(location.locationType)}>{location.locationType.replace(/_/g, ' ')}</StatusPill>
            </TableCell>
            <TableCell>{location.parentLocationId || '-'}</TableCell>
            <TableCell>{location.sourceSystem || '-'}</TableCell>
            <TableCell>{formatDate(location.updatedAt)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function GenealogyEdgeTable({
  title,
  edges,
  direction,
}: {
  title: string;
  edges: InventoryGenealogyEdge[];
  direction: 'parent' | 'child';
}) {
  const lotOf = (edge: InventoryGenealogyEdge) => (direction === 'parent' ? edge.parentInventoryLot : edge.childInventoryLot);

  return (
    <div>
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-white/90">
        <GitBranch className="h-4 w-4" />
        {title}
      </div>
      {!edges.length ? (
        <EmptyState icon={<GitBranch className="h-6 w-6" />} title={`No ${title.toLowerCase()}`} />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Lot</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>Relationship</TableHead>
              <TableHead>Work order</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {edges.map((edge) => {
              const lot = lotOf(edge);
              return (
                <TableRow key={edge.id}>
                  <TableCell className="font-medium text-gray-800 dark:text-white/90">{lotLabel(lot)}</TableCell>
                  <TableCell>{skuLabel(lot?.inventorySku)}</TableCell>
                  <TableCell>{edge.relationshipType || '-'}</TableCell>
                  <TableCell>{edge.workOrderId || lot?.workOrderId || '-'}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function ImportReportsTable({ reports }: { reports: InventoryImportReport[] }) {
  if (!reports.length) {
    return <EmptyState icon={<FileClock className="h-6 w-6" />} title="No import reports" />;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Source</TableHead>
          <TableHead>Mode</TableHead>
          <TableHead>Started</TableHead>
          <TableHead>Finished</TableHead>
          <TableHead>Report</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {reports.map((report) => (
          <TableRow key={report.id}>
            <TableCell className="font-medium text-gray-800 dark:text-white/90">{report.source}</TableCell>
            <TableCell>
              <StatusPill tone={report.dryRun ? 'warning' : 'success'}>{report.dryRun ? 'Dry run' : 'Applied'}</StatusPill>
            </TableCell>
            <TableCell>{formatDate(report.startedAt)}</TableCell>
            <TableCell>{formatDate(report.finishedAt)}</TableCell>
            <TableCell>
              <code className="block max-w-md truncate rounded bg-gray-100 px-2 py-1 text-xs text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                {JSON.stringify(report.report)}
              </code>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default function InventoryPage() {
  const [lotSearch, setLotSearch] = useState('');
  const [transactionSearch, setTransactionSearch] = useState('');
  const [skuSearch, setSkuSearch] = useState('');
  const [inventoryType, setInventoryType] = useState(ALL_FILTER);
  const [status, setStatus] = useState(ALL_FILTER);
  const [genealogyLotId, setGenealogyLotId] = useState('');
  const [selectedGenealogyLotId, setSelectedGenealogyLotId] = useState('');
  const role = useAuthStore((state) => state.user?.role?.key || 'user');
  const canReadImports = role === 'owner' || role === 'admin';

  const overview = useQuery({ queryKey: ['inventory', 'overview'], queryFn: fetchInventoryOverview });
  const lots = useQuery({
    queryKey: ['inventory', 'lots', lotSearch, inventoryType, status],
    queryFn: () =>
      fetchInventoryLots({
        q: lotSearch,
        inventoryType: inventoryType === ALL_FILTER ? undefined : inventoryType,
        status: status === ALL_FILTER ? undefined : status,
      }),
  });
  const transactions = useQuery({
    queryKey: ['inventory', 'transactions', transactionSearch],
    queryFn: () => fetchInventoryTransactions(transactionSearch),
  });
  const skus = useQuery({ queryKey: ['inventory', 'skus', skuSearch], queryFn: () => fetchInventorySkus(skuSearch) });
  const locations = useQuery({ queryKey: ['inventory', 'locations'], queryFn: fetchInventoryLocations });
  const genealogy = useQuery({
    queryKey: ['inventory', 'genealogy', selectedGenealogyLotId],
    queryFn: () => fetchInventoryGenealogy(selectedGenealogyLotId),
    enabled: Boolean(selectedGenealogyLotId),
    retry: false,
  });
  const importReports = useQuery({
    queryKey: ['inventory', 'import-reports'],
    queryFn: fetchInventoryImportReports,
    enabled: canReadImports,
    retry: false,
  });

  const typeOptions = useMemo(
    () => Array.from(new Set((lots.data ?? []).map((lot) => lot.inventoryType).filter(Boolean))).sort(),
    [lots.data],
  );
  const statusOptions = useMemo(
    () => Array.from(new Set((lots.data ?? []).map((lot) => lot.status).filter(Boolean))).sort(),
    [lots.data],
  );
  const metrics = overview.data;
  const hasError = overview.isError || lots.isError || transactions.isError || skus.isError || locations.isError;

  return (
    <div className="space-y-6">
      <PageHeader title="Inventory" description="Lots, SKUs, locations, movements, genealogy, and import audit records." />

      {hasError && (
        <div className="flex items-start gap-3 rounded-lg border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Inventory data could not be loaded. Refresh or check the API before treating this view as current.</span>
        </div>
      )}

      <div className="flex items-start gap-3 rounded-lg border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-warning-800 dark:border-warning-500/30 dark:bg-warning-500/10 dark:text-warning-200">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Inventory is currently a read-only ledger backed by import, genealogy, lot, SKU, location, and transaction read APIs. Create, update, and delete controls are intentionally not shown until inventory write endpoints exist.
        </span>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={<Tags className="h-6 w-6" />} label="SKUs" value={metrics?.skus ?? '-'} />
        <MetricCard icon={<Boxes className="h-6 w-6" />} label="Lots" value={metrics?.lots ?? '-'} detail={`${metrics?.hetLots ?? '-'} HET`} />
        <MetricCard icon={<Database className="h-6 w-6" />} label="Transactions" value={metrics?.transactions ?? '-'} detail={`${metrics?.balances ?? '-'} balances`} />
        <MetricCard icon={<MapPin className="h-6 w-6" />} label="Locations" value={metrics?.locations ?? '-'} detail={`${metrics?.finishedGoodLots ?? '-'} finished`} />
      </div>

      <AdminPanel>
        <Tabs defaultValue="lots">
          <TabsList className="h-auto flex-wrap justify-start">
            <TabsTrigger value="lots">Lots</TabsTrigger>
            <TabsTrigger value="transactions">Transactions</TabsTrigger>
            <TabsTrigger value="skus">SKUs</TabsTrigger>
            <TabsTrigger value="locations">Locations</TabsTrigger>
            <TabsTrigger value="genealogy">Genealogy</TabsTrigger>
            <TabsTrigger value="imports">Imports</TabsTrigger>
          </TabsList>

          <TabsContent value="lots" className="mt-4">
            <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <SearchBox value={lotSearch} onChange={setLotSearch} placeholder="Search lot, HET, serial" />
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <Select value={inventoryType} onValueChange={setInventoryType}>
                  <SelectTrigger className="w-full sm:w-48">
                    <SelectValue placeholder="Inventory type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_FILTER}>All types</SelectItem>
                    {typeOptions.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type.replace(/_/g, ' ')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger className="w-full sm:w-48">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_FILTER}>All statuses</SelectItem>
                    {statusOptions.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option.replace(/_/g, ' ')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {lots.isFetching && <span className="text-sm text-gray-500 dark:text-gray-400">Loading lots...</span>}
              </div>
            </div>
            {lots.isError ? (
              <EmptyState icon={<AlertTriangle className="h-6 w-6" />} title="Unable to load inventory lots" />
            ) : lots.isLoading ? (
              <EmptyState icon={<Boxes className="h-6 w-6" />} title="Loading inventory lots" />
            ) : (
              <LotsTable lots={lots.data ?? []} />
            )}
          </TabsContent>

          <TabsContent value="transactions" className="mt-4">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <SearchBox value={transactionSearch} onChange={setTransactionSearch} placeholder="Search reason, ref, work order" />
              {transactions.isFetching && <span className="text-sm text-gray-500 dark:text-gray-400">Loading transactions...</span>}
            </div>
            {transactions.isError ? (
              <EmptyState icon={<AlertTriangle className="h-6 w-6" />} title="Unable to load inventory transactions" />
            ) : transactions.isLoading ? (
              <EmptyState icon={<Database className="h-6 w-6" />} title="Loading inventory transactions" />
            ) : (
              <TransactionsTable transactions={transactions.data ?? []} />
            )}
          </TabsContent>

          <TabsContent value="skus" className="mt-4">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <SearchBox value={skuSearch} onChange={setSkuSearch} placeholder="Search SKU, category, description" />
              {skus.isFetching && <span className="text-sm text-gray-500 dark:text-gray-400">Loading SKUs...</span>}
            </div>
            {skus.isError ? (
              <EmptyState icon={<AlertTriangle className="h-6 w-6" />} title="Unable to load inventory SKUs" />
            ) : skus.isLoading ? (
              <EmptyState icon={<Tags className="h-6 w-6" />} title="Loading inventory SKUs" />
            ) : (
              <SkusTable skus={skus.data ?? []} />
            )}
          </TabsContent>

          <TabsContent value="locations" className="mt-4">
            {locations.isError ? (
              <EmptyState icon={<AlertTriangle className="h-6 w-6" />} title="Unable to load inventory locations" />
            ) : locations.isLoading ? (
              <EmptyState icon={<MapPin className="h-6 w-6" />} title="Loading inventory locations" />
            ) : (
              <LocationsTable locations={locations.data ?? []} />
            )}
          </TabsContent>

          <TabsContent value="genealogy" className="mt-4">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative w-full sm:max-w-sm">
                <PackageSearch className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                <input
                  type="search"
                  value={genealogyLotId}
                  onChange={(event) => setGenealogyLotId(event.target.value)}
                  placeholder="Lot ID"
                  className="h-10 w-full rounded-lg border border-gray-200 bg-transparent py-2 pl-10 pr-3 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-none focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-white/[0.03] dark:text-white/90"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => setSelectedGenealogyLotId(genealogyLotId.trim())}
                disabled={!genealogyLotId.trim()}
              >
                <GitBranch className="h-4 w-4" />
                Trace
              </Button>
              {genealogy.isFetching && <span className="text-sm text-gray-500 dark:text-gray-400">Loading genealogy...</span>}
            </div>
            {!selectedGenealogyLotId ? (
              <EmptyState icon={<GitBranch className="h-6 w-6" />} title="Select a lot" />
            ) : genealogy.isError ? (
              <EmptyState icon={<AlertTriangle className="h-6 w-6" />} title="Unable to load genealogy" />
            ) : genealogy.isLoading ? (
              <EmptyState icon={<GitBranch className="h-6 w-6" />} title="Loading genealogy" />
            ) : (
              <div className="space-y-5">
                <div className="rounded-lg border border-gray-200 px-4 py-3 text-sm dark:border-gray-800">
                  <div className="font-medium text-gray-800 dark:text-white/90">{lotLabel(genealogy.data?.lot)}</div>
                  <div className="text-gray-500 dark:text-gray-400">{skuLabel(genealogy.data?.lot.inventorySku)}</div>
                </div>
                <div className="grid gap-5 xl:grid-cols-2">
                  <GenealogyEdgeTable title="Parents" edges={genealogy.data?.parents ?? []} direction="parent" />
                  <GenealogyEdgeTable title="Children" edges={genealogy.data?.children ?? []} direction="child" />
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="imports" className="mt-4">
            {!canReadImports ? (
              <EmptyState icon={<FileClock className="h-6 w-6" />} title="Import reports require admin access" />
            ) : importReports.isError ? (
              <EmptyState icon={<AlertTriangle className="h-6 w-6" />} title="Unable to load import reports" />
            ) : importReports.isLoading ? (
              <EmptyState icon={<FileClock className="h-6 w-6" />} title="Loading import reports" />
            ) : (
              <ImportReportsTable reports={importReports.data ?? []} />
            )}
          </TabsContent>
        </Tabs>
      </AdminPanel>
    </div>
  );
}
