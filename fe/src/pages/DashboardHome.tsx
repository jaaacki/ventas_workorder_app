import { useMemo, type ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchWorkOrders, fetchQaWorkOrderQueue, type WorkOrderSummary } from '@/lib/work-orders-api';
import { useAuthStore } from '@/store/authStore';
import { useWorkflowContext } from '@/store/workflowContext';
import { humanStatus, toneToBadgeVariant } from '@/lib/format';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowRight, CheckCircle2, ListChecks, PackageCheck, ShieldAlert } from 'lucide-react';

function relativeAge(value: string | null | undefined): string | null {
  if (!value) return null;
  const then = new Date(value).getTime();
  if (!Number.isFinite(then)) return null;
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

function unitsLabel(wo: WorkOrderSummary): string | null {
  const qty = wo.het?.quantity;
  return qty != null ? `${qty} unit${qty === 1 ? '' : 's'}` : null;
}

function productLabel(wo: WorkOrderSummary): string {
  return wo.workflow?.name || 'AmGraft';
}

function nextActionLabel(wo: WorkOrderSummary): string {
  switch (wo.lifecycleState) {
    case 'NotStarted':
      return `Start ${wo.currentPhaseLabel}`;
    case 'InProgress':
      return `Finish ${wo.currentPhaseLabel}`;
    case 'ReadyToAdvance':
      return `Advance from ${wo.currentPhaseLabel}`;
    case 'ReleasePending':
      return `Release ${productLabel(wo)}`;
    default:
      return wo.currentPhaseLabel;
  }
}

function StatusBadge({ code }: { code: string }) {
  const { label, tone } = humanStatus(code);
  return <Badge variant={toneToBadgeVariant(tone)}>{label}</Badge>;
}

function ReadyToReleaseCard({ items }: { items: WorkOrderSummary[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PackageCheck className="h-4 w-4 text-muted-foreground" />
          Ready to release today
        </CardTitle>
        <CardDescription>Gate-passed work orders awaiting final QA sign-off.</CardDescription>
        <CardAction>
          <Badge variant={items.length ? 'default' : 'outline'}>{items.length} ready</Badge>
        </CardAction>
      </CardHeader>
      <CardContent>
        {items.length ? (
          <ul className="divide-y divide-border">
            {items.slice(0, 6).map((wo) => {
              const age = relativeAge(wo.prodEnd);
              return (
                <li key={wo.id} className="flex items-center justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-foreground">{wo.woNumber || wo.id}</div>
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">
                      {[productLabel(wo), unitsLabel(wo), wo.currentPhaseLabel].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    {age && <span className="text-xs text-muted-foreground">waited {age}</span>}
                    <Button asChild variant="outline" size="sm">
                      <Link to="/dashboard/qa">Release</Link>
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="py-2 text-sm text-muted-foreground">Nothing waiting for release right now.</p>
        )}
      </CardContent>
    </Card>
  );
}

function NextTasksCard({ items }: { items: WorkOrderSummary[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ListChecks className="h-4 w-4 text-muted-foreground" />
          Your next tasks
        </CardTitle>
        <CardDescription>Work orders on the active line that are ready for the next action.</CardDescription>
        <CardAction>
          <Badge variant={items.length ? 'secondary' : 'outline'}>{items.length}</Badge>
        </CardAction>
      </CardHeader>
      <CardContent>
        {items.length ? (
          <ul className="divide-y divide-border">
            {items.slice(0, 6).map((wo) => (
              <li key={wo.id}>
                <Link
                  to={`/dashboard/work-orders/${encodeURIComponent(wo.id)}`}
                  className="-mx-2 flex items-center justify-between gap-4 rounded-lg px-2 py-3 transition-colors hover:bg-accent"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-foreground">{nextActionLabel(wo)}</div>
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">
                      {[wo.woNumber || wo.id, productLabel(wo)].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <StatusBadge code={wo.lifecycleState} />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-2 text-sm text-muted-foreground">No actionable work orders on this line.</p>
        )}
      </CardContent>
    </Card>
  );
}

function BlockedCard({ items }: { items: WorkOrderSummary[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-muted-foreground" />
          Blocked — needs attention
        </CardTitle>
        <CardDescription>Work orders that can&apos;t advance until a requirement is resolved.</CardDescription>
        <CardAction>
          <Badge variant={items.length ? 'destructive' : 'outline'}>{items.length}</Badge>
        </CardAction>
      </CardHeader>
      <CardContent>
        {items.length ? (
          <ul className="divide-y divide-border">
            {items.slice(0, 8).map((wo) => {
              const age = relativeAge(wo.prodStart);
              return (
                <li key={wo.id} className="flex items-center justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-foreground">{wo.woNumber || wo.id}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      <span className="text-foreground/70">{wo.currentPhaseLabel}</span>
                      {wo.readinessBlockers.length > 0 && <> — {wo.readinessBlockers.join(', ')}</>}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    {age && <Badge variant="destructive">waited {age}</Badge>}
                    <Button asChild variant="ghost" size="sm">
                      <Link to={`/dashboard/work-orders/${encodeURIComponent(wo.id)}`}>
                        Resolve
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4" />
            No blocked work orders.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Which block leads, by role (handoff §8.2): operators do, QA releases, managers unblock.
function blockOrderForRole(role: string): Array<'tasks' | 'release' | 'blocked'> {
  switch (role) {
    case 'operator':
      return ['tasks', 'release', 'blocked'];
    case 'qa_manager':
      return ['release', 'blocked', 'tasks'];
    case 'production_manager':
      return ['blocked', 'tasks', 'release'];
    default:
      return ['blocked', 'release', 'tasks'];
  }
}

export default function DashboardHome() {
  const { user } = useAuthStore();
  const { activeWorkflowId } = useWorkflowContext();
  const role = user?.role?.key || 'user';

  const { data: workOrders = [] } = useQuery({ queryKey: ['work-orders'], queryFn: fetchWorkOrders });
  const { data: qaQueue } = useQuery({ queryKey: ['qa-queue'], queryFn: fetchQaWorkOrderQueue });

  const inLine = useMemo(
    () => (wo: WorkOrderSummary) => !activeWorkflowId || wo.workflowId === activeWorkflowId,
    [activeWorkflowId],
  );

  const release = (qaQueue?.release ?? []).filter(inLine);
  const blocked = workOrders.filter((wo) => inLine(wo) && wo.readinessBlockers.length > 0);
  const tasks = workOrders.filter(
    (wo) =>
      inLine(wo) &&
      wo.operationalStatus !== 'Blocked' &&
      (['NotStarted', 'InProgress', 'ReadyToAdvance'] as string[]).includes(wo.lifecycleState),
  );

  const blocks: Record<'tasks' | 'release' | 'blocked', ReactElement> = {
    tasks: <NextTasksCard items={tasks} />,
    release: <ReadyToReleaseCard items={release} />,
    blocked: <BlockedCard items={blocked} />,
  };
  const order = blockOrderForRole(role);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Today</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {user?.name || user?.email ? `Welcome back, ${user?.name || user?.email}. ` : ''}
          What to work on next, and what&apos;s ready to release.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="space-y-6">
          {blocks[order[0]]}
          {blocks[order[2]]}
        </div>
        <div className="space-y-6">{blocks[order[1]]}</div>
      </div>
    </div>
  );
}
