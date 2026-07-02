import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { toast } from 'sonner';
import { AlertTriangle, FlaskConical, PackageCheck } from 'lucide-react';
import { PageHeader, EmptyState } from '@/components/tailadmin';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  fetchQaWorkOrderQueue,
  recordWorkOrderRelease,
  type WorkOrderSummary,
} from '@/lib/work-orders-api';
import { useWorkflowContext } from '@/store/workflowContext';
import { unitsLabel, productLabel } from '@/lib/work-order-ui';

interface BetResult {
  reading: string | number | null;
  status: 'pass' | 'fail' | 'pending';
}

// The BET gate (handoff Execution Model §7): surface the reading + pass/fail from the
// sterilisation records. The backend returns them newest-first (createdAt desc), so the
// first record carrying a reading/result is the most recent.
function betResult(wo: WorkOrderSummary): BetResult {
  const withReading = wo.sterilises.find((record) => record.betReading != null || record.result != null);
  if (!withReading) return { reading: null, status: 'pending' };
  const status = withReading.result == null ? 'pending' : withReading.result ? 'pass' : 'fail';
  return { reading: withReading.betReading, status };
}

function ReleaseDialog({ workOrder }: { workOrder: WorkOrderSummary }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const product = productLabel(workOrder);

  const releaseMutation = useMutation({
    mutationFn: () => recordWorkOrderRelease(workOrder.id, { releaseStatus: 'released' }),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['qa-queue'] });
      queryClient.invalidateQueries({ queryKey: ['work-orders'] });
      toast.success(`Released ${updated.woNumber || updated.id}`);
      setOpen(false);
    },
    onError: (e: AxiosError<{ error?: string }>) =>
      toast.error(e.response?.data?.error || 'Failed to record release'),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">Release</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Release {workOrder.woNumber || workOrder.id}?</DialogTitle>
          <DialogDescription>
            Release {product} · {unitsLabel(workOrder.het?.quantity) ?? '—'}? This records the final QA sign-off and moves the
            batch to finished goods.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button onClick={() => releaseMutation.mutate()} disabled={releaseMutation.isPending}>
            Confirm release
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BetBadge({ status }: { status: BetResult['status'] }) {
  if (status === 'pass') return <Badge variant="default">PASS</Badge>;
  if (status === 'fail') return <Badge variant="destructive">FAIL</Badge>;
  return <Badge variant="outline">Pending</Badge>;
}

export default function QaQueuePage() {
  const { activeWorkflowId } = useWorkflowContext();
  const { data, isLoading, isError } = useQuery({ queryKey: ['qa-queue'], queryFn: fetchQaWorkOrderQueue });

  const inLine = (wo: WorkOrderSummary) => !activeWorkflowId || wo.workflowId === activeWorkflowId;
  const sterilisation = (data?.sterilisation ?? []).filter(inLine);
  const release = (data?.release ?? []).filter(inLine);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Release queue"
        description="Sterilisation/BET gate review and final release sign-off."
      />

      {isLoading ? (
        <div className="flex h-40 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : isError ? (
        <EmptyState icon={<AlertTriangle className="h-6 w-6" />} title="Queue unavailable" description="The release queue could not be loaded." />
      ) : (
        <Tabs defaultValue="release">
          <TabsList>
            <TabsTrigger value="release">
              Ready to release
              <Badge variant="secondary" className="ml-2">{release.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="sterilisation">
              Sterilisation / BET
              <Badge variant="secondary" className="ml-2">{sterilisation.length}</Badge>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="release" className="mt-4">
            {release.length ? (
              <div className="rounded-2xl border border-border bg-card">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Work order</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>Units</TableHead>
                      <TableHead>Phase</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {release.map((wo) => (
                      <TableRow key={wo.id}>
                        <TableCell className="font-medium text-foreground">{wo.woNumber || wo.id}</TableCell>
                        <TableCell className="text-muted-foreground">{productLabel(wo)}</TableCell>
                        <TableCell className="text-muted-foreground">{unitsLabel(wo.het?.quantity) ?? '—'}</TableCell>
                        <TableCell className="text-muted-foreground">{wo.currentPhaseLabel}</TableCell>
                        <TableCell className="text-right">
                          <ReleaseDialog workOrder={wo} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <EmptyState icon={<PackageCheck className="h-6 w-6" />} title="Nothing ready to release" description="No gate-passed work orders are waiting for sign-off." />
            )}
          </TabsContent>

          <TabsContent value="sterilisation" className="mt-4">
            {sterilisation.length ? (
              <div className="rounded-2xl border border-border bg-card">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Work order</TableHead>
                      <TableHead>Phase</TableHead>
                      <TableHead>BET reading</TableHead>
                      <TableHead>Result</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sterilisation.map((wo) => {
                      const bet = betResult(wo);
                      return (
                        <TableRow key={wo.id}>
                          <TableCell className="font-medium text-foreground">{wo.woNumber || wo.id}</TableCell>
                          <TableCell className="text-muted-foreground">{wo.currentPhaseLabel}</TableCell>
                          <TableCell className="font-semibold text-foreground">
                            {bet.reading != null ? `${bet.reading} EU/mL` : 'Awaiting reading'}
                          </TableCell>
                          <TableCell>
                            <BetBadge status={bet.status} />
                          </TableCell>
                          <TableCell className="text-right">
                            <Button asChild size="sm" variant="outline">
                              <Link to={`/dashboard/work-orders/${encodeURIComponent(wo.id)}`}>Open</Link>
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <EmptyState icon={<FlaskConical className="h-6 w-6" />} title="No gate work" description="No work orders are waiting on sterilisation or BET evidence." />
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
