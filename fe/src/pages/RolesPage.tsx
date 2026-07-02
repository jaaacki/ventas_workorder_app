import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchRoles, updateRole, type Role } from '@/lib/auth-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { AdminPanel, MetricCard, PageHeader, StatusPill } from '@/components/tailadmin';
import { toast } from 'sonner';
import { Edit3, LockKeyhole, Save, Shield } from 'lucide-react';

export default function RolesPage() {
  const queryClient = useQueryClient();
  const { data: roles, isLoading } = useQuery({ queryKey: ['roles'], queryFn: fetchRoles });
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const mutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: { name: string; description: string } }) => updateRole(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      toast.success('Role updated');
      setEditingRole(null);
      setName('');
      setDescription('');
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

  const startEdit = (role: Role) => {
    setEditingRole(role);
    setName(role.name);
    setDescription(role.description || '');
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Roles" description="Review and update role labels and descriptions used across staff access." />
      <div className="grid gap-4 sm:grid-cols-2">
        <MetricCard icon={<Shield className="h-6 w-6" />} label="Roles" value={roles?.length ?? 0} />
        <MetricCard icon={<LockKeyhole className="h-6 w-6" />} label="Built-in roles" value={roles?.filter((role) => role.builtIn).length ?? 0} />
      </div>
      <AdminPanel title="Role configuration">
        <Sheet
          open={Boolean(editingRole)}
          onOpenChange={(open) => {
            if (!open) setEditingRole(null);
          }}
        >
          <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
            <div className="flex min-h-full flex-col">
              <SheetHeader>
                <SheetTitle>Edit role</SheetTitle>
                <SheetDescription>Update the role label and description shown across staff access.</SheetDescription>
              </SheetHeader>
              <div className="grid gap-4 p-4">
                <div className="grid gap-1.5">
                  <Label htmlFor="role-edit-name">Role name</Label>
                  <Input id="role-edit-name" value={name} onChange={(event) => setName(event.target.value)} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="role-edit-desc">Description</Label>
                  <Input id="role-edit-desc" value={description} onChange={(event) => setDescription(event.target.value)} />
                </div>
              </div>
              <SheetFooter>
                <Button
                  disabled={!editingRole || mutation.isPending || !name.trim()}
                  onClick={() => {
                    if (!editingRole) return;
                    mutation.mutate({
                      id: editingRole.id,
                      payload: {
                        name: name.trim(),
                        description: description.trim(),
                      },
                    });
                  }}
                >
                  <Save className="h-4 w-4" />
                  Save role
                </Button>
                <Button type="button" variant="outline" disabled={mutation.isPending} onClick={() => setEditingRole(null)}>
                  Cancel
                </Button>
              </SheetFooter>
            </div>
          </SheetContent>
        </Sheet>
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
                <p className="min-h-10 text-sm text-gray-500 dark:text-gray-400">{role.description || 'No description'}</p>
                <Button className="w-full" variant="outline" disabled={mutation.isPending} onClick={() => startEdit(role)}>
                  <Edit3 className="h-4 w-4" />
                  Edit role
                </Button>
              </div>
            </div>
          ))}
        </div>
      </AdminPanel>
    </div>
  );
}
