import { useState, type FormEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { fetchWorkflows, createWorkflow } from '@/lib/workflows-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Plus, Workflow as WorkflowIcon } from 'lucide-react';

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
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Workflows</h1>
        <p className="text-sm text-muted-foreground">
          Product families — each workflow defines an ordered set of manufacturing phases.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-4 w-4" /> New workflow
          </CardTitle>
          <CardDescription>
            Create a product workflow (e.g. AmGraft®). Phases are bound once phase data exists.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={submit}
            className="grid gap-3 sm:grid-cols-[1fr_160px_2fr_auto] sm:items-end"
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
              Create
            </Button>
          </form>
        </CardContent>
      </Card>

      <div>
        <h2 className="mb-3 text-lg font-medium">Configured workflows</h2>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : !workflows?.length ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No workflows yet — create your first one above.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {workflows.map((w) => (
              <Card key={w.id}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <WorkflowIcon className="h-4 w-4" />
                      {w.name}
                    </span>
                    <Badge variant={w.active ? 'default' : 'secondary'}>
                      {w.active ? 'Active' : 'Inactive'}
                    </Badge>
                  </CardTitle>
                  <CardDescription>{w.code}</CardDescription>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  <div className="min-h-5">{w.description || '—'}</div>
                  <div className="mt-2 text-xs">
                    {w._count.phases} phase(s) · {w._count.workOrders} work order(s)
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
