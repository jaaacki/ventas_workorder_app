import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { toast } from 'sonner';
import { AlertTriangle, Check, ChevronDown, ChevronRight, FlaskConical, PackageCheck, X } from 'lucide-react';
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
  fetchWorkOrder,
  recordWorkOrderRelease,
  type WorkOrderSummary,
} from '@/lib/work-orders-api';
import { useWorkflowContext } from '@/store/workflowContext';
import { useAuthStore } from '@/store/authStore';
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
  const canRelease = useAuthStore((state) => state.hasPermission)('workOrder.release');
  const product = productLabel(workOrder);

  const releaseMutation = useMutation({
    mutationFn: () => recordWorkOrderRelease(workOrder.id, { releaseStatus: 'released' }),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['qa-queue'] });
      queryClient.invalidateQueries({ queryKey: ['work-orders'] });
      // Release mints a FINISHED_GOOD lot; keep the finished-goods list fresh.
      queryClient.invalidateQueries({ queryKey: ['finished-goods-lots'] });
      toast.success(`Released ${updated.woNumber || updated.id}`);
      setOpen(false);
    },
    onError: (e: AxiosError<{ error?: string }>) =>
      toast.error(e.response?.data?.error || 'Failed to record release'),
  });

  if (!canRelease) {
    return (
      <Button size="sm" disabled title="Your role cannot release work orders">
        Release
      </Button>
    );
  }

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

// Expandable release row: chevron reveals an inline evidence summary so QA can
// sign off without opening the full work order. The detail is fetched lazily on
// expand from the same ['work-order', id] cache the detail page uses.
function ReleaseRow({ workOrder }: { workOrder: WorkOrderSummary }) {
  const [open, setOpen] = useState(false);
  const detailQuery = useQuery({
    queryKey: ['work-order', workOrder.id],
    queryFn: () => fetchWorkOrder(workOrder.id),
    enabled: open,
  });
  const detail = detailQuery.data;
  const bet = detail ? betResult(detail) : null;

  return (
    <>
      <TableRow className="cursor-pointer" onClick={() => setOpen((v) => !v)}>
        <TableCell className="w-8">
          {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        </TableCell>
        <TableCell className="font-medium text-foreground">{workOrder.woNumber || workOrder.id}</TableCell>
        <TableCell className="text-muted-foreground">{productLabel(workOrder)}</TableCell>
        <TableCell className="text-muted-foreground">{unitsLabel(workOrder.het?.quantity) ?? '—'}</TableCell>
        <TableCell className="text-muted-foreground">{workOrder.currentPhaseLabel}</TableCell>
        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
          <ReleaseDialog workOrder={workOrder} />
        </TableCell>
      </TableRow>
      {open && (
        <TableRow>
          <TableCell colSpan={6} className="bg-muted/30">
            {detailQuery.isLoading ? (
              <div className="py-3 text-sm text-muted-foreground">Loading evidence…</div>
            ) : detailQuery.isError || !detail ? (
              <div className="py-3 text-sm text-muted-foreground">Evidence could not be loaded.</div>
            ) : (
              <div className="space-y-3 py-2">
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                  <span className="flex items-center gap-2">
                    <span className="text-muted-foreground">BET / gate:</span>
                    <BetBadge status={bet!.status} />
                    {bet!.reading != null ? <span className="text-xs text-muted-foreground">{bet!.reading} EU/mL</span> : null}
                  </span>
                  <span className="text-muted-foreground">
                    Output: <span className="font-medium text-foreground">{detail.outputQuantity ?? '—'}</span>
                  </span>
                  <span className="text-muted-foreground">
                    Signatures: <span className="font-medium text-foreground">start {detail.startSignPath ? '✓' : '—'} · end {detail.endSignPath ? '✓' : '—'}</span>
                  </span>
                </div>
                <div>
                  <div className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Evidence checklist</div>
                  <div className="flex flex-wrap gap-2">
                    {detail.advanceRequirements.map((req) => (
                      <span
                        key={req.key}
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${req.met ? 'bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-500' : 'bg-error-50 text-error-600 dark:bg-error-500/15 dark:text-error-500'}`}
                      >
                        {req.met ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                        {req.label}
                      </span>
                    ))}
                  </div>
                  {detail.missingAdvanceRequirements.length ? (
                    <p className="mt-2 text-xs text-error-600 dark:text-error-500">Missing: {detail.missingAdvanceRequirements.join(', ')}</p>
                  ) : null}
                </div>
                <Link to={`/dashboard/work-orders/${encodeURIComponent(workOrder.id)}`} className="inline-block text-xs text-muted-foreground hover:underline">
                  Open full work order
                </Link>
              </div>
            )}
          </TableCell>
        </TableRow>
      )}
    </>
  );
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
                      <TableHead className="w-8" />
                      <TableHead>Work order</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>Units</TableHead>
                      <TableHead>Phase</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {release.map((wo) => (
                      <ReleaseRow key={wo.id} workOrder={wo} />
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
