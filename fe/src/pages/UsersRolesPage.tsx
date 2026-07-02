import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import UsersPage from './UsersPage';
import RolesPage from './RolesPage';

// Users and roles are both access administration — one home (handoff §8.8).
export default function UsersRolesPage() {
  return (
    <Tabs defaultValue="users" className="space-y-6">
      <TabsList>
        <TabsTrigger value="users">Users</TabsTrigger>
        <TabsTrigger value="roles">Roles</TabsTrigger>
      </TabsList>
      <TabsContent value="users">
        <UsersPage />
      </TabsContent>
      <TabsContent value="roles">
        <RolesPage />
      </TabsContent>
    </Tabs>
  );
}
