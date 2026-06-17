import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchStaff, fetchRoles, updateStaffRole, updateStaffActive } from '@/lib/auth-api';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';

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
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Users</h1>
      <Card>
        <CardHeader>
          <CardTitle>Staff accounts</CardTitle>
        </CardHeader>
        <CardContent>
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
                  <TableCell className="font-medium">{s.name || '-'}</TableCell>
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
                      <Badge variant="secondary">{s.role?.name || s.role?.key}</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={s.active ? 'default' : 'destructive'}>{s.active ? 'Active' : 'Inactive'}</Badge>
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
        </CardContent>
      </Card>
    </div>
  );
}
