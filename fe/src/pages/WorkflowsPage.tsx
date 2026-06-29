import { useState, type FormEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { fetchWorkflows, createWorkflow } from '@/lib/workflows-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AdminPanel, EmptyState, MetricCard, PageHeader, StatusPill } from '@/components/tailadmin';
import { toast } from 'sonner';
import { Boxes, Plus, Workflow as WorkflowIcon } from 'lucide-react';

export default function WorkflowsPage() {
  const queryClient = useQueryClient();
  const { data: workflows, isLoading } = useQuery({
    queryKey: ['workflows'],
    queryFn: () => fetchWorkflows(),
  });

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');

  const createMutation = useMutation({
    mutationFn: createWorkflow,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
      toast.success('Workflow created');
      setName('');
      setCode('');
      setDescription('');
    },
    onError: (e: AxiosError<{ error?: string }>) =>
      toast.error(e.response?.data?.error || 'Failed to create workflow'),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !code.trim()) return;
    createMutation.mutate({
      name: name.trim(),
      code: code.trim().toUpperCase(),
      description: description.trim() || null,
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Workflows"
        description="Product families: each workflow defines an ordered set of manufacturing phases."
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <MetricCard icon={<WorkflowIcon className="h-6 w-6" />} label="Configured workflows" value={workflows?.length ?? 0} />
        <MetricCard icon={<Boxes className="h-6 w-6" />} label="Total phases" value={workflows?.reduce((sum, w) => sum + w._count.phases, 0) ?? 0} />
      </div>

      <AdminPanel
        title="New workflow"
        description="Create a product workflow. Phases are bound once phase data exists."
        action={
          <span className="hidden items-center gap-2 text-sm text-gray-500 sm:flex">
            <Plus className="h-4 w-4" /> New workflow
          </span>
        }
      >
          <form
            onSubmit={submit}
            className="grid gap-4 lg:grid-cols-[1fr_160px_2fr_auto] lg:items-end"
          >
            <div className="grid gap-1.5">
              <Label htmlFor="wf-name">Name</Label>
              <Input
                id="wf-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="AmGraft®"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="wf-code">Code</Label>
              <Input
                id="wf-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="AMG"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="wf-desc">Description</Label>
              <Input
                id="wf-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="optional"
              />
            </div>
            <Button type="submit" disabled={createMutation.isPending || !name.trim() || !code.trim()}>
              <Plus className="h-4 w-4" />
              Create
            </Button>
          </form>
      </AdminPanel>

      <AdminPanel title="Configured workflows">
        {isLoading ? (
          <div className="flex h-40 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
          </div>
        ) : !workflows?.length ? (
          <EmptyState icon={<WorkflowIcon className="h-6 w-6" />} title="No workflows yet" description="Create your first product workflow above." />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {workflows.map((w) => (
              <div key={w.id} className="rounded-xl border border-gray-100 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.03]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="flex items-center gap-2">
                      <WorkflowIcon className="h-4 w-4 text-brand-500" />
                      {w.name}
                    </span>
                    <p className="mt-1 text-xs font-medium uppercase tracking-wide text-gray-400">{w.code}</p>
                  </div>
                  <StatusPill tone={w.active ? 'success' : 'neutral'}>{w.active ? 'Active' : 'Inactive'}</StatusPill>
                </div>
                <div className="mt-4 text-sm text-gray-500 dark:text-gray-400">
                  <div className="min-h-5">{w.description || 'No description'}</div>
                  <div className="mt-3 text-xs">
                    {w._count.phases} phase(s) · {w._count.workOrders} work order(s)
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
