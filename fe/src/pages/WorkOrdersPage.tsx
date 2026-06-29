import { useState, type FormEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { fetchWorkflows } from '@/lib/workflows-api';
import {
  fetchWorkOrders,
  createWorkOrder,
  advanceWorkOrder,
} from '@/lib/work-orders-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AdminPanel, EmptyState, MetricCard, PageHeader, StatusPill } from '@/components/tailadmin';
import { toast } from 'sonner';
import { ArrowRight, ClipboardList, Clock, Plus, Workflow as WorkflowIcon } from 'lucide-react';

export default function WorkOrdersPage() {
  const queryClient = useQueryClient();
  const { data: workOrders, isLoading } = useQuery({
    queryKey: ['work-orders'],
    queryFn: fetchWorkOrders,
  });
  const { data: workflows } = useQuery({
    queryKey: ['workflows'],
    queryFn: () => fetchWorkflows(),
  });

  const [workflowId, setWorkflowId] = useState('');
  const [hetId, setHetId] = useState('');

  const createMutation = useMutation({
    mutationFn: createWorkOrder,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-orders'] });
      toast.success('Work order created');
      setWorkflowId('');
      setHetId('');
    },
    onError: (e: AxiosError<{ error?: string }>) =>
      toast.error(e.response?.data?.error || 'Failed to create work order'),
  });

  const advanceMutation = useMutation({
    mutationFn: advanceWorkOrder,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-orders'] });
      toast.success('Work order advanced');
    },
    onError: (e: AxiosError<{ error?: string }>) =>
      toast.error(e.response?.data?.error || 'Failed to advance work order'),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!workflowId.trim()) return;
    const payload: { workflowId: string; hetId?: string } = {
      workflowId: workflowId.trim(),
    };
    if (hetId.trim()) payload.hetId = hetId.trim();
    createMutation.mutate(payload);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Work Orders"
        description="Create work orders and advance them through their workflow phases."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard icon={<ClipboardList className="h-6 w-6" />} label="Active work orders" value={workOrders?.length ?? 0} />
        <MetricCard icon={<WorkflowIcon className="h-6 w-6" />} label="Available workflows" value={workflows?.length ?? 0} />
        <MetricCard icon={<Clock className="h-6 w-6" />} label="Open phase tracking" value="Live" detail={<StatusPill tone="brand">Now</StatusPill>} />
      </div>

      <AdminPanel
        title="New work order"
        description="Choose a workflow to start a new work order."
        action={
          <span className="hidden items-center gap-2 text-sm text-gray-500 sm:flex">
            <Plus className="h-4 w-4" />
            New work order
          </span>
        }
      >
          <form className="grid gap-4 lg:grid-cols-[1fr_1fr_auto] lg:items-end" onSubmit={submit}>
            <div className="flex-1 space-y-2">
              <Label htmlFor="workflow">Workflow</Label>
              <select
                id="workflow"
                className="flex h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs transition-colors focus-visible:border-brand-300 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                value={workflowId}
                onChange={(e) => setWorkflowId(e.target.value)}
              >
                <option value="">Select a workflow…</option>
                {workflows?.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({w.code})
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1 space-y-2">
              <Label htmlFor="hetId">HET ID (optional)</Label>
              <Input
                id="hetId"
                value={hetId}
                onChange={(e) => setHetId(e.target.value)}
                placeholder="e.g. HET-0001"
              />
            </div>
            <Button type="submit" disabled={createMutation.isPending || !workflowId.trim()}>
              <Plus className="h-4 w-4" />
              Create
            </Button>
          </form>
      </AdminPanel>

      <AdminPanel title="Active work orders">
        {isLoading ? (
          <div className="flex h-40 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
          </div>
        ) : !workOrders?.length ? (
          <EmptyState icon={<ClipboardList className="h-6 w-6" />} title="No work orders yet" description="Create your first work order above." />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {workOrders.map((wo) => (
              <div key={wo.id} className="rounded-xl border border-gray-100 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.03]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="flex items-center gap-2">
                      <ClipboardList className="h-4 w-4 text-brand-500" />
                      {wo.woNumber || 'Unnumbered'}
                    </span>
                    <p className="mt-1 text-xs font-medium uppercase tracking-wide text-gray-400">
                      {wo.workflow.name} ({wo.workflow.code})
                    </p>
                  </div>
                  <StatusPill tone="brand">Phase {wo.phaseOrder ?? '-'}</StatusPill>
                </div>
                <div className="mt-4 text-sm text-gray-500 dark:text-gray-400">
                  <div className="text-xs">
                    Start: {wo.prodStart ? new Date(wo.prodStart).toLocaleString() : '-'} · End:{' '}
                    {wo.prodEnd ? new Date(wo.prodEnd).toLocaleString() : '-'}
                  </div>
                  <div className="mt-3">
                    <Button
                      size="sm"
                      onClick={() => advanceMutation.mutate(wo.id)}
                      disabled={advanceMutation.isPending}
                    >
                      Advance
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </AdminPanel>
    </div>
  );
}
