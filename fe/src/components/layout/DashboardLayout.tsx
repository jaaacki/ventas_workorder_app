import { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuthStore } from '@/store/authStore';
import { useWorkflowContext } from '@/store/workflowContext';
import { fetchQaWorkOrderQueue } from '@/lib/work-orders-api';
import { logoutApi } from '@/lib/auth-api';
import {
  LayoutDashboard,
  Users,
  Menu,
  LogOut,
  Settings2,
  Columns3,
  Search,
  Boxes,
  Warehouse,
  ArrowRight,
  ShieldCheck,
  ListChecks,
  Ban,
  Waypoints,
  Moon,
  Sun,
} from 'lucide-react';

interface NavItem {
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
  roles: string[];
  keywords: string[];
  badgeKey?: 'release';
}

interface NavGroup {
  heading?: string;
  items: NavItem[];
}

// Operational screens are open to every authenticated role (display-only role awareness);
// Setup stays owner/admin. Keep in sync with the route guards in App.tsx.
const ALL_ROLES = [
  'owner',
  'admin',
  'user',
  'operator',
  'qa_manager',
  'production_manager',
  'procurement_manager',
  'inventory_manager',
  'viewer',
];

// Job-oriented IA (handoff §4). Every link resolves to a live route; My queue, a split
// Quarantine, Traceability, and the Users+Roles merge land in their own follow-up PRs.
const navGroups: NavGroup[] = [
  {
    items: [
      { label: 'Today', href: '/dashboard', icon: LayoutDashboard, roles: ALL_ROLES, keywords: ['home', 'overview', 'release', 'tasks'] },
    ],
  },
  {
    heading: 'Production',
    items: [
      { label: 'Board', href: '/dashboard/work-orders', icon: Columns3, roles: ALL_ROLES, keywords: ['work orders', 'wo', 'phases', 'kanban', 'batches'] },
      { label: 'My queue', href: '/dashboard/my-queue', icon: ListChecks, roles: ALL_ROLES, keywords: ['tasks', 'operator', 'my work', 'assigned', 'next action'] },
    ],
  },
  {
    heading: 'Quality',
    items: [
      { label: 'Release queue', href: '/dashboard/qa', icon: ShieldCheck, roles: ALL_ROLES, keywords: ['qa', 'sterilisation', 'bet', 'release'], badgeKey: 'release' },
      { label: 'Quarantine', href: '/dashboard/quarantine', icon: Ban, roles: ALL_ROLES, keywords: ['held', 'bet fail', 'reject', 'hold', 'quarantine'] },
    ],
  },
  {
    heading: 'Material',
    items: [
      { label: 'Collections', href: '/dashboard/procurement', icon: Boxes, roles: ALL_ROLES, keywords: ['collection units', 'clinic', 'het', 'intake', 'procurement'] },
      { label: 'Inventory', href: '/dashboard/inventory', icon: Warehouse, roles: ALL_ROLES, keywords: ['lots', 'sku', 'stock', 'reagents', 'locations'] },
      { label: 'Traceability', href: '/dashboard/traceability', icon: Waypoints, roles: ALL_ROLES, keywords: ['genealogy', 'chain of custody', 'trace', 'parent', 'child'] },
    ],
  },
  {
    heading: 'Setup',
    items: [
      { label: 'Workflows & phases', href: '/dashboard/workflows', icon: Settings2, roles: ['owner', 'admin'], keywords: ['workflows', 'phases', 'bom', 'equipment', 'master data'] },
      { label: 'Users & roles', href: '/dashboard/users', icon: Users, roles: ['owner', 'admin'], keywords: ['staff', 'people', 'access', 'permissions', 'roles'] },
    ],
  },
];

function visibleGroupsForRole(role: string): NavGroup[] {
  return navGroups
    .map((group) => ({ ...group, items: group.items.filter((item) => item.roles.includes(role)) }))
    .filter((group) => group.items.length > 0);
}

function flatNavForRole(role: string): NavItem[] {
  return visibleGroupsForRole(role).flatMap((group) => group.items);
}

function isActive(pathname: string, href: string) {
  if (href === '/dashboard') return pathname === '/dashboard';
  return pathname === href || pathname.startsWith(`${href}/`);
}

function useReleaseCount() {
  const { activeWorkflowId } = useWorkflowContext();
  const { data } = useQuery({ queryKey: ['qa-queue'], queryFn: fetchQaWorkOrderQueue });
  if (!data) return 0;
  // Scope to the active line so the badge matches the Release queue page's count.
  return data.release.filter((wo) => !activeWorkflowId || wo.workflowId === activeWorkflowId).length;
}

function WorkflowSwitcher() {
  const { workflows, activeWorkflowId, activeWorkflow, setActiveWorkflowId } = useWorkflowContext();

  if (workflows.length <= 1) {
    return (
      <div className="rounded-lg border border-border bg-background px-3 py-2">
        <div className="text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground">Product line</div>
        <div className="mt-0.5 truncate text-sm font-semibold text-foreground">
          {activeWorkflow ? activeWorkflow.name : 'AmGraft'}
        </div>
      </div>
    );
  }

  return (
    <Select value={activeWorkflowId ?? undefined} onValueChange={setActiveWorkflowId}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder="Select product line" />
      </SelectTrigger>
      <SelectContent>
        {workflows.map((workflow) => (
          <SelectItem key={workflow.id} value={workflow.id}>
            {workflow.name} ({workflow.code})
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const location = useLocation();
  const { user } = useAuthStore();
  const role = user?.role?.key || 'user';
  const groups = visibleGroupsForRole(role);
  const releaseCount = useReleaseCount();

  return (
    <div className="flex h-full flex-col overflow-y-auto px-4 py-6">
      <Link to="/dashboard" className="mb-6 flex items-center gap-3 px-2 text-lg font-semibold text-foreground" onClick={onNavigate}>
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand text-base font-bold text-brand-foreground">V</div>
        <span>Ventas WorkOrder</span>
      </Link>

      <div className="mb-5 px-1">
        <WorkflowSwitcher />
      </div>

      <nav className="flex-1 space-y-5">
        {groups.map((group, groupIndex) => (
          <div key={group.heading ?? `group-${groupIndex}`} className="space-y-1">
            {group.heading && (
              <div className="px-3 pb-1 text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">
                {group.heading}
              </div>
            )}
            {group.items.map((item) => {
              const Icon = item.icon;
              const active = isActive(location.pathname, item.href);
              const showBadge = item.badgeKey === 'release' && releaseCount > 0;
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  onClick={onNavigate}
                  aria-current={active ? 'page' : undefined}
                  className={`group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    active
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                  }`}
                >
                  {active && <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-brand" />}
                  <Icon className="h-[1.15rem] w-[1.15rem] shrink-0" />
                  <span className="flex-1 truncate">{item.label}</span>
                  {showBadge && (
                    <Badge variant={active ? 'secondary' : 'default'} className="h-5 min-w-5 justify-center px-1.5">
                      {releaseCount}
                    </Badge>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    </div>
  );
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  return (
    <Button
      variant="outline"
      size="icon-lg"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      title={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      aria-label="Toggle theme"
    >
      {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </Button>
  );
}

export function Header() {
  const { user, clearAuth } = useAuthStore();
  const navigate = useNavigate();
  const role = user?.role?.key || 'user';
  const [searchValue, setSearchValue] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [activeSearchIndex, setActiveSearchIndex] = useState(0);
  const visibleNav = useMemo(() => flatNavForRole(role), [role]);
  const searchResults = useMemo(() => {
    const query = searchValue.trim().toLowerCase();
    if (!query) return visibleNav;
    return visibleNav.filter((item) => {
      const haystack = [item.label, item.href, ...item.keywords].join(' ').toLowerCase();
      return haystack.includes(query);
    });
  }, [searchValue, visibleNav]);
  const showSearchResults = searchFocused && searchValue.trim().length > 0;

  const goToSearchResult = (index: number) => {
    const item = searchResults[index];
    if (!item) return;
    navigate(item.href);
    setSearchValue('');
    setSearchFocused(false);
    setActiveSearchIndex(0);
  };

  return (
    <header className="sticky top-0 z-30 flex w-full border-b border-border bg-card">
      <div className="flex min-h-16 grow flex-col items-center justify-between lg:flex-row lg:px-6">
        <div className="flex w-full items-center justify-between gap-3 border-b border-border px-3 py-3 lg:justify-normal lg:border-b-0 lg:px-0">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon-lg" className="lg:hidden">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[280px] p-0">
              <SidebarContent onNavigate={() => {}} />
            </SheetContent>
          </Sheet>
          <div className="hidden lg:block">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={searchValue}
                onChange={(event) => {
                  setSearchValue(event.target.value);
                  setActiveSearchIndex(0);
                }}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowDown') {
                    event.preventDefault();
                    setActiveSearchIndex((index) => Math.min(index + 1, Math.max(searchResults.length - 1, 0)));
                  }
                  if (event.key === 'ArrowUp') {
                    event.preventDefault();
                    setActiveSearchIndex((index) => Math.max(index - 1, 0));
                  }
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    goToSearchResult(activeSearchIndex);
                  }
                  if (event.key === 'Escape') {
                    setSearchFocused(false);
                    setActiveSearchIndex(0);
                  }
                }}
                placeholder="Search work orders, collections, lots…"
                className="h-11 w-[430px] rounded-lg border border-border bg-transparent py-2.5 pl-12 pr-4 text-sm text-foreground shadow-theme-xs placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-3 focus:ring-ring/20"
                aria-label="Search"
              />
              {showSearchResults && (
                <div
                  className="absolute left-0 top-12 z-40 w-[430px] overflow-hidden rounded-lg border border-border bg-popover shadow-lg"
                  onMouseDown={(event) => event.preventDefault()}
                >
                  {searchResults.length ? (
                    <div className="py-1">
                      {searchResults.map((item, index) => {
                        const Icon = item.icon;
                        const active = index === activeSearchIndex;
                        return (
                          <button
                            key={item.href}
                            type="button"
                            onMouseEnter={() => setActiveSearchIndex(index)}
                            onClick={() => goToSearchResult(index)}
                            className={`flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm transition-colors ${
                              active ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent'
                            }`}
                          >
                            <span className="flex min-w-0 items-center gap-3">
                              <Icon className="h-4 w-4 shrink-0" />
                              <span className="min-w-0">
                                <span className="block truncate font-medium text-foreground">{item.label}</span>
                                <span className="block truncate text-xs text-muted-foreground">{item.keywords.slice(0, 3).join(' / ')}</span>
                              </span>
                            </span>
                            <ArrowRight className="h-4 w-4 shrink-0" />
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="px-4 py-3 text-sm text-muted-foreground">No accessible page matches this search.</div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="flex w-full items-center justify-end gap-3 px-5 py-4 lg:w-auto lg:px-0">
          <ThemeToggle />
          <div className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card text-sm font-semibold text-foreground">
            {(user?.name || user?.email || 'U').slice(0, 1).toUpperCase()}
          </div>
          <div className="hidden text-sm md:block">
            <div className="font-medium text-foreground">{user?.name || user?.email}</div>
            <div className="capitalize text-muted-foreground">{user?.role?.name || user?.role?.key}</div>
          </div>
          <Button variant="outline" size="icon-lg" onClick={async () => { try { await logoutApi(); } finally { clearAuth(); navigate('/login', { replace: true }); } }} title="Sign out">
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </header>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-[260px] shrink-0 border-r border-border bg-card lg:block">
        <SidebarContent />
      </aside>
      <div className="flex flex-1 flex-col">
        <Header />
        <main className="mx-auto w-full max-w-[1180px] flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
