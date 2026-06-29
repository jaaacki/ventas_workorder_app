import { useAuthStore } from '@/store/authStore';
import { AdminPanel, MetricCard, PageHeader, StatusPill } from '@/components/tailadmin';
import { ClipboardList, ShieldCheck, Users, Workflow } from 'lucide-react';

export default function DashboardHome() {
  const { user } = useAuthStore();
  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome back, ${user?.name || user?.email || 'there'}`}
        description="Monitor work order activity, workflow coverage, and staff access from one operational dashboard."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={<ClipboardList className="h-6 w-6" />} label="Work orders" value="Active" detail={<StatusPill tone="brand">Live</StatusPill>} />
        <MetricCard icon={<Workflow className="h-6 w-6" />} label="Workflows" value="Configured" detail={<StatusPill tone="success">Ready</StatusPill>} />
        <MetricCard icon={<Users className="h-6 w-6" />} label="Staff" value="Role based" detail={<StatusPill tone="neutral">Access</StatusPill>} />
        <MetricCard icon={<ShieldCheck className="h-6 w-6" />} label="Security" value="Protected" detail={<StatusPill tone="success">OAuth</StatusPill>} />
      </div>

      <AdminPanel title="Operations Overview" description="Core work order modules available in this workspace.">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.03]">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-500 dark:bg-brand-500/15">
                <ClipboardList className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-800 dark:text-white/90">Work Orders</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">Create and advance production work through workflow phases.</p>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.03]">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-500 dark:bg-brand-500/15">
                <Users className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-800 dark:text-white/90">Staff Access</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">Manage user status and owner-controlled role assignments.</p>
              </div>
            </div>
          </div>
        </div>
      </AdminPanel>
    </div>
  );
}
