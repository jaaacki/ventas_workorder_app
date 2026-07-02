import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuthStore } from '@/store/authStore';
import UsersPage from './UsersPage';
import RolesPage from './RolesPage';

// Users and roles are both access administration — one home (handoff §8.8). Role editing
// stays owner-only (as the old /dashboard/roles route was); admins see Users only.
export default function UsersRolesPage() {
  const { user } = useAuthStore();
  const isOwner = user?.role?.key === 'owner';

  return (
    <Tabs defaultValue="users" className="space-y-6">
      <TabsList>
        <TabsTrigger value="users">Users</TabsTrigger>
        {isOwner && <TabsTrigger value="roles">Roles</TabsTrigger>}
      </TabsList>
      <TabsContent value="users">
        <UsersPage />
      </TabsContent>
      {isOwner && (
        <TabsContent value="roles">
          <RolesPage />
        </TabsContent>
      )}
    </Tabs>
  );
}
