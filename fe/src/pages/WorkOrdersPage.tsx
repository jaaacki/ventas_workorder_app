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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Plus, ClipboardList } from 'lucide-react';

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
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Work Orders</h1>
        <p className="text-sm text-muted-foreground">
          Create work orders and advance them through their workflow phases.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            New work order
          </CardTitle>
          <CardDescription>Choose a workflow to start a new work order.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4 md:flex-row md:items-end" onSubmit={submit}>
            <div className="flex-1 space-y-2">
              <Label htmlFor="workflow">Workflow</Label>
              <select
                id="workflow"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
              Create
            </Button>
          </form>
        </CardContent>
      </Card>

      <div>
        <h2 className="mb-3 text-lg font-medium">Active work orders</h2>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : !workOrders?.length ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No work orders yet — create your first one above.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {workOrders.map((wo) => (
              <Card key={wo.id}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <ClipboardList className="h-4 w-4" />
                      {wo.woNumber || 'Unnumbered'}
                    </span>
                    <Badge variant="secondary">
                      Phase {wo.phaseOrder ?? '—'}
                    </Badge>
                  </CardTitle>
                  <CardDescription>{wo.workflow.name} ({wo.workflow.code})</CardDescription>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  <div className="text-xs">
                    Start: {wo.prodStart ? new Date(wo.prodStart).toLocaleString() : '—'} · End:{' '}
                    {wo.prodEnd ? new Date(wo.prodEnd).toLocaleString() : '—'}
                  </div>
                  <div className="mt-3">
                    <Button
                      size="sm"
                      onClick={() => advanceMutation.mutate(wo.id)}
                      disabled={advanceMutation.isPending}
                    >
                      Advance
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
