import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchStaff, fetchRoles, updateStaffRole, updateStaffActive } from '@/lib/auth-api';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AdminPanel, EmptyState, MetricCard, PageHeader, StatusPill } from '@/components/tailadmin';
import { toast } from 'sonner';
import { Shield, UserCheck, Users } from 'lucide-react';

export default function UsersPage() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const isOwner = user?.role?.key === 'owner';
  const isAdmin = user?.role?.key === 'admin' || isOwner;

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
      <AdminPanel title="Staff accounts" description="Owner users can update roles. Admins can enable or disable accounts.">
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
