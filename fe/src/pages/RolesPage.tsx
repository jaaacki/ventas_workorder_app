import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchRoles, updateRole } from '@/lib/auth-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

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
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
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
      <h1 className="text-3xl font-bold">Roles</h1>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {roles?.map((role) => (
          <Card key={role.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>{role.name}</CardTitle>
                {role.builtIn && <Badge variant="outline">built-in</Badge>}
              </div>
              <CardDescription className="uppercase tracking-wide text-xs">{role.key}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
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
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
