import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { useAuthStore } from '@/store/authStore';
import { LayoutDashboard, Users, Shield, Menu, LogOut, Settings2, Factory, Search } from 'lucide-react';

const navItems = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, roles: ['owner', 'admin', 'user'] },
  { label: 'Production', href: '/dashboard/work-orders', icon: Factory, roles: ['owner', 'admin', 'user'] },
  { label: 'Configuration', href: '/dashboard/workflows', icon: Settings2, roles: ['owner', 'admin'] },
  { label: 'Users', href: '/dashboard/users', icon: Users, roles: ['owner', 'admin'] },
  { label: 'Roles', href: '/dashboard/roles', icon: Shield, roles: ['owner'] },
];

export function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const location = useLocation();
  const { user } = useAuthStore();
  const role = user?.role?.key || 'user';

  const visibleNav = navItems.filter((item) => item.roles.includes(role));

  return (
    <div className="flex h-full flex-col overflow-y-auto px-5 py-7">
      <Link to="/dashboard" className="mb-8 flex items-center gap-3 font-bold text-lg text-gray-800 dark:text-white/90" onClick={onNavigate}>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500 text-base font-bold text-white shadow-theme-xs">V</div>
        <span>Ventas WorkOrder</span>
      </Link>
      <div className="mb-4 text-xs font-medium uppercase leading-5 text-gray-400">Menu</div>
      <nav className="flex-1 space-y-1.5">
        {visibleNav.map((item) => {
          const Icon = item.icon;
          const active = location.pathname === item.href;
          return (
            <Link
              key={item.href}
              to={item.href}
              onClick={onNavigate}
              className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                active ? 'bg-brand-50 text-brand-500 dark:bg-brand-500/15 dark:text-brand-400' : 'text-gray-700 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/[0.03] dark:hover:text-gray-200'
              }`}
            >
              <Icon className="h-5 w-5" />
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
    <header className="sticky top-0 z-30 flex w-full border-b border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
      <div className="flex min-h-16 grow flex-col items-center justify-between lg:flex-row lg:px-6">
      <div className="flex w-full items-center justify-between gap-3 border-b border-gray-200 px-3 py-3 lg:justify-normal lg:border-b-0 lg:px-0 dark:border-gray-800">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" size="icon-lg" className="lg:hidden">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[290px] p-0">
            <SidebarContent onNavigate={() => {}} />
          </SheetContent>
        </Sheet>
        <div className="hidden lg:block">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-500" />
            <input
              type="search"
              placeholder="Search work orders, HET, batches..."
              className="h-11 w-[430px] rounded-lg border border-gray-200 bg-transparent py-2.5 pl-12 pr-4 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-none focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-white/[0.03] dark:text-white/90"
            />
          </div>
        </div>
      </div>
      <div className="flex w-full items-center justify-end gap-3 px-5 py-4 lg:w-auto lg:px-0">
        <div className="flex h-11 w-11 items-center justify-center rounded-full border border-gray-200 bg-white text-sm font-semibold text-gray-700 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300">
          {(user?.name || user?.email || 'U').slice(0, 1).toUpperCase()}
        </div>
        <div className="hidden text-sm md:block">
          <div className="font-medium text-gray-700 dark:text-white/90">{user?.name || user?.email}</div>
          <div className="text-gray-500 capitalize dark:text-gray-400">{user?.role?.name || user?.role?.key}</div>
        </div>
        <Button variant="outline" size="icon-lg" onClick={() => { clearAuth(); navigate('/login', { replace: true }); }} title="Sign out">
          <LogOut className="h-5 w-5" />
        </Button>
      </div>
      </div>
    </header>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-gray-900">
      <aside className="hidden w-[290px] shrink-0 border-r border-gray-200 bg-white dark:border-gray-800 dark:bg-black lg:block">
        <SidebarContent />
      </aside>
      <div className="flex flex-1 flex-col">
        <Header />
        <main className="flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
