import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthStore } from '@/store/authStore';

export default function DashboardHome() {
  const { user } = useAuthStore();
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Welcome back, {user?.name || user?.email}!</h1>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Work Orders</CardTitle>
            <CardDescription>Feature coming soon</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">List, create and manage work orders.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Staff</CardTitle>
            <CardDescription>Manage users and roles</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Invite users and control access.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
