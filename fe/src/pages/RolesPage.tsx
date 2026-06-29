import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchRoles, updateRole } from '@/lib/auth-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AdminPanel, MetricCard, PageHeader, StatusPill } from '@/components/tailadmin';
import { toast } from 'sonner';
import { LockKeyhole, Shield } from 'lucide-react';

export default function RolesPage() {
  const queryClient = useQueryClient();
  const { data: roles, isLoading } = useQuery({ queryKey: ['roles'], queryFn: fetchRoles });
  const [editing, setEditing] = useState<Record<string, { name: string; description: string }>>({});

  const mutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: { name: string; description: string } }) => updateRole(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      toast.success('Role updated');
    },
    onError: () => toast.error('Failed to update role'),
  });

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
        </div>
      </div>
    );
  }

  const startEdit = (role: NonNullable<typeof roles>[number]) => {
    setEditing((prev) => ({
      ...prev,
      [role.id]: {
        name: role.name,
        description: role.description || '',
      },
    }));
  };

  const updateField = (id: string, field: 'name' | 'description', value: string) => {
    setEditing((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Roles" description="Review and update role labels and descriptions used across staff access." />
      <div className="grid gap-4 sm:grid-cols-2">
        <MetricCard icon={<Shield className="h-6 w-6" />} label="Roles" value={roles?.length ?? 0} />
        <MetricCard icon={<LockKeyhole className="h-6 w-6" />} label="Built-in roles" value={roles?.filter((role) => role.builtIn).length ?? 0} />
      </div>
      <AdminPanel title="Role configuration">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {roles?.map((role) => (
            <div key={role.id} className="rounded-xl border border-gray-100 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.03]">
              <div>
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-gray-800 dark:text-white/90">{role.name}</h3>
                  {role.builtIn && <StatusPill tone="neutral">built-in</StatusPill>}
                </div>
                <p className="mt-1 text-xs font-medium uppercase tracking-wide text-gray-400">{role.key}</p>
              </div>
              <div className="mt-4 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor={`name-${role.id}`}>Role name</Label>
                  <Input
                    id={`name-${role.id}`}
                    value={editing[role.id]?.name ?? role.name}
                    onChange={(e) => updateField(role.id, 'name', e.target.value)}
                    onFocus={() => startEdit(role)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`desc-${role.id}`}>Description</Label>
                  <Input
                    id={`desc-${role.id}`}
                    value={editing[role.id]?.description ?? (role.description || '')}
                    onChange={(e) => updateField(role.id, 'description', e.target.value)}
                    onFocus={() => startEdit(role)}
                  />
                </div>
                <Button
                  className="w-full"
                  disabled={!editing[role.id] || mutation.isPending}
                  onClick={() =>
                    mutation.mutate({
                      id: role.id,
                      payload: {
                        name: editing[role.id].name,
                        description: editing[role.id].description,
                      },
                    })
                  }
                >
                  Save changes
                </Button>
              </div>
            </div>
          ))}
        </div>
      </AdminPanel>
    </div>
  );
}
