import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Building2, Inbox, PackageCheck, Truck } from 'lucide-react';
import { PageHeader, AdminPanel, MetricCard, EmptyState, StatusPill } from '@/components/tailadmin';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { fetchCollectionQueue, type WorkOrderSummary } from '@/lib/work-orders-api';
import { fetchCollectionPoints, type CollectionPoint } from '@/lib/procurement-api';
import { useWorkflowContext } from '@/store/workflowContext';
import { useAuthStore } from '@/store/authStore';
import { productLabel, unitsLabel } from '@/lib/work-order-ui';

// One row shape across the three buckets. The clinic is only known once a HET is
// minted (received); awaiting/in-transit runs have no HET yet, so clinic reads '—'.
function QueueTable({
  workOrders,
  emptyIcon,
  emptyTitle,
  emptyDescription,
}: {
  workOrders: WorkOrderSummary[];
  emptyIcon: ReactNode;
  emptyTitle: string;
  emptyDescription: string;
}) {
  if (!workOrders.length) {
    return <EmptyState icon={emptyIcon} title={emptyTitle} description={emptyDescription} />;
  }
  return (
    <div className="rounded-2xl border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Work order</TableHead>
            <TableHead>Product</TableHead>
            <TableHead>Clinic</TableHead>
            <TableHead>Units</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {workOrders.map((wo) => (
            <TableRow key={wo.id}>
              <TableCell className="font-medium text-foreground">{wo.woNumber || wo.id}</TableCell>
              <TableCell className="text-muted-foreground">{productLabel(wo)}</TableCell>
              <TableCell className="text-muted-foreground">{wo.het?.clinicName ?? '—'}</TableCell>
              <TableCell className="text-muted-foreground">{unitsLabel(wo.het?.quantity) ?? '—'}</TableCell>
              <TableCell className="text-right">
                <Button asChild size="sm" variant="outline">
                  <Link to={`/dashboard/work-orders/${encodeURIComponent(wo.id)}`}>Open</Link>
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// Purpose-built clinic registry surface (#191): the imported SupplyEntity/
// CollectionPoint records shown with their identity fields (HCI code, license,
// person-in-charge, contact) so collection is run from a first-class registry
// rather than the raw procurement CRUD console. Read-only — CRUD stays in the
// procurement console.
function ClinicRegistry() {
  const canRead = useAuthStore((state) => state.hasPermission)('procurement.collectionPoint.read');
  const { data, isLoading, isError } = useQuery({
    queryKey: ['clinic-registry'],
    queryFn: () => fetchCollectionPoints(),
    enabled: canRead,
  });
  const clinics = (data ?? []) as CollectionPoint[];

  if (!canRead) {
    return <EmptyState icon={<Building2 className="h-6 w-6" />} title="No clinic access" description="Your role cannot view the clinic registry." />;
  }
  if (isLoading) {
    return (
      <div className="flex h-24 items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }
  if (isError) {
    return <EmptyState icon={<AlertTriangle className="h-6 w-6" />} title="Registry unavailable" description="The clinic registry could not be loaded." />;
  }
  if (!clinics.length) {
    return <EmptyState icon={<Building2 className="h-6 w-6" />} title="No clinics registered" description="No collection points exist yet. Add them from the Collections console." />;
  }

  return (
    <div className="rounded-2xl border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Clinic</TableHead>
            <TableHead>HCI code</TableHead>
            <TableHead>License</TableHead>
            <TableHead>Person in charge</TableHead>
            <TableHead>Contact</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {clinics.map((clinic) => (
            <TableRow key={clinic.id}>
              <TableCell className="font-medium text-foreground">
                {clinic.displayName || clinic.id}
                {clinic.address ? <div className="text-xs text-muted-foreground">{clinic.address}</div> : null}
              </TableCell>
              <TableCell className="text-muted-foreground">{clinic.hciCode ?? '—'}</TableCell>
              <TableCell className="text-muted-foreground">{clinic.licenseName ?? '—'}</TableCell>
              <TableCell className="text-muted-foreground">{clinic.personInCharge ?? '—'}</TableCell>
              <TableCell className="text-muted-foreground">{clinic.telephone ?? '—'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export default function CollectionQueuePage() {
  const { activeWorkflowId } = useWorkflowContext();
  const { data, isLoading, isError } = useQuery({ queryKey: ['collection-queue'], queryFn: fetchCollectionQueue });

  const inLine = (wo: WorkOrderSummary) => !activeWorkflowId || wo.workflowId === activeWorkflowId;
  const awaiting = (data?.awaiting ?? []).filter(inLine);
  const inTransit = (data?.inTransit ?? []).filter(inLine);
  const received = (data?.received ?? []).filter(inLine);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Collection queue"
        description="HET collection and logistics: runs awaiting collection, containers in transit, and collections received."
      />

      {isLoading ? (
        <div className="flex h-40 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : isError ? (
        <EmptyState icon={<AlertTriangle className="h-6 w-6" />} title="Queue unavailable" description="The collection queue could not be loaded." />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <MetricCard icon={<Inbox className="h-6 w-6" />} label="Awaiting collection" value={awaiting.length} detail={<StatusPill tone="warning">To collect</StatusPill>} />
            <MetricCard icon={<Truck className="h-6 w-6" />} label="In transit" value={inTransit.length} detail={<StatusPill tone="brand">Issued</StatusPill>} />
            <MetricCard icon={<PackageCheck className="h-6 w-6" />} label="Received" value={received.length} detail={<StatusPill tone="success">Collected</StatusPill>} />
          </div>

          <Tabs defaultValue="awaiting">
            <TabsList>
              <TabsTrigger value="awaiting">
                Awaiting
                <Badge variant="secondary" className="ml-2">{awaiting.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="in-transit">
                In transit
                <Badge variant="secondary" className="ml-2">{inTransit.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="received">
                Received
                <Badge variant="secondary" className="ml-2">{received.length}</Badge>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="awaiting" className="mt-4">
              <QueueTable
                workOrders={awaiting}
                emptyIcon={<Inbox className="h-6 w-6" />}
                emptyTitle="Nothing awaiting collection"
                emptyDescription="No collection runs are waiting for a HET to be collected."
              />
            </TabsContent>
            <TabsContent value="in-transit" className="mt-4">
              <QueueTable
                workOrders={inTransit}
                emptyIcon={<Truck className="h-6 w-6" />}
                emptyTitle="Nothing in transit"
                emptyDescription="No empty containers are currently issued out to a clinic."
              />
            </TabsContent>
            <TabsContent value="received" className="mt-4">
              <QueueTable
                workOrders={received}
                emptyIcon={<PackageCheck className="h-6 w-6" />}
                emptyTitle="Nothing received yet"
                emptyDescription="No collections have minted a HET yet."
              />
            </TabsContent>
          </Tabs>

          <AdminPanel title="Clinic registry" description="Collection points with their HCI, license, and contact details.">
            <ClinicRegistry />
          </AdminPanel>
        </>
      )}
    </div>
  );
}
