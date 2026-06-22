import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { useAuthStore } from '@/store/authStore';
import { LayoutDashboard, Users, Shield, Menu, LogOut, Workflow, ClipboardList } from 'lucide-react';

const navItems = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, roles: ['owner', 'admin', 'user'] },
  { label: 'Users', href: '/dashboard/users', icon: Users, roles: ['owner', 'admin'] },
  { label: 'Roles', href: '/dashboard/roles', icon: Shield, roles: ['owner'] },
  { label: 'Workflows', href: '/dashboard/workflows', icon: Workflow, roles: ['owner', 'admin'] },
  { label: 'Work Orders', href: '/dashboard/work-orders', icon: ClipboardList, roles: ['owner', 'admin', 'user'] },
];

export function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const location = useLocation();
  const { user } = useAuthStore();
  const role = user?.role?.key || 'user';

  const visibleNav = navItems.filter((item) => item.roles.includes(role));

  return (
    <div className="flex h-full flex-col gap-2 p-4">
      <Link to="/dashboard" className="flex items-center gap-2 px-2 py-3 font-bold text-lg" onClick={onNavigate}>
        <div className="flex h-8 w-8 items-center justify-center rounded bg-primary text-primary-foreground">V</div>
        Ventas WorkOrder
      </Link>
      <nav className="flex-1 space-y-1">
        {visibleNav.map((item) => {
          const Icon = item.icon;
          const active = location.pathname === item.href;
          return (
            <Link
              key={item.href}
              to={item.href}
              onClick={onNavigate}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              }`}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

export function Header() {
  const { user, clearAuth } = useAuthStore();
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b bg-background px-4 lg:px-8">
      <div className="flex items-center gap-4">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="lg:hidden">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-64 p-0">
            <SidebarContent onNavigate={() => {}} />
          </SheetContent>
        </Sheet>
        <h1 className="text-lg font-semibold">Work Order App</h1>
      </div>
      <div className="flex items-center gap-4">
        <div className="hidden text-sm md:block">
          <div className="font-medium">{user?.name || user?.email}</div>
          <div className="text-muted-foreground capitalize">{user?.role?.name || user?.role?.key}</div>
        </div>
        <Button variant="ghost" size="icon" onClick={() => { clearAuth(); navigate('/login', { replace: true }); }} title="Sign out">
          <LogOut className="h-5 w-5" />
        </Button>
      </div>
    </header>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-muted/30">
      <aside className="hidden w-64 shrink-0 border-r bg-background lg:block">
        <SidebarContent />
      </aside>
      <div className="flex flex-1 flex-col">
        <Header />
        <main className="flex-1 p-4 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
