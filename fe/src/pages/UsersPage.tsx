import { useState, type FormEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchStaff, fetchRoles, register, updateStaffRole, updateStaffActive } from '@/lib/auth-api';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AdminPanel, EmptyState, MetricCard, PageHeader, StatusPill } from '@/components/tailadmin';
import { toast } from 'sonner';
import { Plus, Save, Shield, UserCheck, Users } from 'lucide-react';

export default function UsersPage() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const isOwner = user?.role?.key === 'owner';
  const isAdmin = user?.role?.key === 'admin' || isOwner;
  const [createOpen, setCreateOpen] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRoleId, setNewRoleId] = useState('');

  const { data: staff, isLoading: staffLoading } = useQuery({ queryKey: ['staff'], queryFn: fetchStaff });
  const { data: roles, isLoading: rolesLoading } = useQuery({ queryKey: ['roles'], queryFn: fetchRoles });

  const roleMutation = useMutation({
    mutationFn: ({ id, roleId }: { id: string; roleId: string }) => updateStaffRole(id, roleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff'] });
      toast.success('Role updated');
    },
    onError: () => toast.error('Failed to update role'),
  });

  const activeMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => updateStaffActive(id, active),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff'] });
      toast.success('Status updated');
    },
    onError: () => toast.error('Failed to update status'),
  });

  const createUserMutation = useMutation({
    mutationFn: () =>
      register({
        email: newEmail.trim(),
        password: newPassword,
        name: newName.trim() || undefined,
        roleId: newRoleId || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff'] });
      toast.success('User created');
      setNewEmail('');
      setNewName('');
      setNewPassword('');
      setNewRoleId('');
      setCreateOpen(false);
    },
    onError: () => toast.error('Failed to create user'),
  });

  const submitCreateUser = (event: FormEvent) => {
    event.preventDefault();
    if (!newEmail.trim() || !newPassword) return;
    createUserMutation.mutate();
  };

  if (staffLoading || rolesLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Users" description="Manage staff accounts, role assignment, and active access." />
      <div className="grid gap-4 sm:grid-cols-2">
        <MetricCard icon={<Users className="h-6 w-6" />} label="Staff accounts" value={staff?.length ?? 0} />
        <MetricCard icon={<UserCheck className="h-6 w-6" />} label="Active users" value={staff?.filter((s) => s.active).length ?? 0} />
      </div>
      <AdminPanel
        title="Staff accounts"
        description="Owner users can update roles. Admins can create, enable, or disable accounts."
        action={
          isAdmin ? (
            <Button type="button" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              New user
            </Button>
          ) : null
        }
      >
        <Sheet open={createOpen} onOpenChange={setCreateOpen}>
          <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
            <form onSubmit={submitCreateUser} className="flex min-h-full flex-col">
              <SheetHeader>
                <SheetTitle>Create user</SheetTitle>
                <SheetDescription>Add a staff account and assign its initial role.</SheetDescription>
              </SheetHeader>
              <div className="grid gap-4 p-4">
                <div className="grid gap-1.5">
                  <Label htmlFor="new-user-email">Email</Label>
                  <Input id="new-user-email" type="email" value={newEmail} onChange={(event) => setNewEmail(event.target.value)} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="new-user-name">Name</Label>
                  <Input id="new-user-name" value={newName} onChange={(event) => setNewName(event.target.value)} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="new-user-password">Temporary password</Label>
                  <Input id="new-user-password" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="new-user-role">Role</Label>
                  <Select value={newRoleId} onValueChange={setNewRoleId}>
                    <SelectTrigger id="new-user-role">
                      <SelectValue placeholder="Default role" />
                    </SelectTrigger>
                    <SelectContent>
                      {roles?.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <SheetFooter>
                <Button type="submit" disabled={createUserMutation.isPending || !newEmail.trim() || !newPassword}>
                  <Save className="h-4 w-4" />
                  Create user
                </Button>
                <Button type="button" variant="outline" disabled={createUserMutation.isPending} onClick={() => setCreateOpen(false)}>
                  Cancel
                </Button>
              </SheetFooter>
            </form>
          </SheetContent>
        </Sheet>
        {!staff?.length ? (
          <EmptyState icon={<Shield className="h-6 w-6" />} title="No staff accounts" description="Staff users will appear here after they are created or sign in." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                {isAdmin && <TableHead>Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {staff?.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium text-gray-800 dark:text-white/90">{s.name || '-'}</TableCell>
                  <TableCell>{s.email}</TableCell>
                  <TableCell>
                    {isOwner ? (
                      <Select
                        value={s.role?.id}
                        onValueChange={(roleId) => roleMutation.mutate({ id: s.id, roleId })}
                        disabled={roleMutation.isPending}
                      >
                        <SelectTrigger className="w-40">
                          <SelectValue placeholder="Select role" />
                        </SelectTrigger>
                        <SelectContent>
                          {roles?.map((r) => (
                            <SelectItem key={r.id} value={r.id}>
                              {r.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <StatusPill tone="neutral">{s.role?.name || s.role?.key}</StatusPill>
                    )}
                  </TableCell>
                  <TableCell>
                    <StatusPill tone={s.active ? 'success' : 'error'}>{s.active ? 'Active' : 'Inactive'}</StatusPill>
                  </TableCell>
                  {isAdmin && (
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => activeMutation.mutate({ id: s.id, active: !s.active })}
                        disabled={activeMutation.isPending}
                      >
                        {s.active ? 'Disable' : 'Enable'}
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </AdminPanel>
    </div>
  );
}
