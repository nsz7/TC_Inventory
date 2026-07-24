import { useState } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  TestTube2,
  Sprout,
  CalendarClock,
  BarChart2,
  Settings2,
  Menu,
  X,
  LogOut,
  UserCog,
} from "lucide-react";
import { useCurrentUser, useLogout } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/samples", label: "Samples", icon: TestTube2 },
  { href: "/varieties", label: "Varieties", icon: Sprout },
  { href: "/schedule", label: "Schedule", icon: CalendarClock },
  { href: "/analytics", label: "Analytics", icon: BarChart2 },
  { href: "/settings", label: "Settings", icon: Settings2 },
];

function NavLinks({ location, onNavigate }: { location: string; onNavigate?: () => void }) {
  return (
    <nav className="flex-1 py-4 px-3 space-y-1">
      {navItems.map((item) => {
        const isActive =
          location === item.href ||
          (item.href !== "/" && location.startsWith(item.href));
        return (
          <Link key={item.href} href={item.href} onClick={onNavigate}>
            <div
              className={`flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors cursor-pointer ${
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
              }`}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {item.label}
            </div>
          </Link>
        );
      })}
    </nav>
  );
}

function AccountSection() {
  const { data: currentUser } = useCurrentUser();
  const logout = useLogout();

  if (!currentUser) return null;

  return (
    <div className="border-t border-sidebar-border p-3 space-y-2">
      <div className="px-3">
        <p className="text-sm font-medium text-sidebar-foreground truncate">{currentUser.displayName}</p>
        <p className="text-xs text-sidebar-foreground/60 capitalize">{currentUser.role}</p>
      </div>
      {currentUser.role === "admin" && (
        <Link href="/admin/users">
          <div className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground cursor-pointer">
            <UserCog className="h-4 w-4 shrink-0" />
            Manage accounts
          </div>
        </Link>
      )}
      <Button
        variant="ghost"
        size="sm"
        className="w-full justify-start gap-2 text-sidebar-foreground"
        onClick={() => logout.mutate()}
        disabled={logout.isPending}
        data-testid="button-logout"
      >
        <LogOut className="h-4 w-4" />
        Log out
      </Button>
    </div>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-background text-foreground">

      {/* ── Desktop sidebar (lg+) ─────────────────────────────────────── */}
      <aside className="hidden lg:flex w-64 border-r border-sidebar-border bg-sidebar shrink-0 flex-col">
        <div className="h-16 flex items-center px-6 border-b border-sidebar-border">
          <div className="flex items-center gap-2 text-sidebar-primary">
            <TestTube2 className="h-6 w-6" />
            <span className="font-semibold text-lg tracking-tight">TC Inventory</span>
          </div>
        </div>
        <NavLinks location={location} />
        <AccountSection />
      </aside>

      {/* ── Mobile/tablet drawer overlay ─────────────────────────────── */}
      {drawerOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/40"
          onClick={() => setDrawerOpen(false)}
        />
      )}
      <aside
        className={`lg:hidden fixed inset-y-0 left-0 z-50 w-64 bg-sidebar border-r border-sidebar-border flex flex-col transition-transform duration-200 ${
          drawerOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="h-16 flex items-center justify-between px-6 border-b border-sidebar-border">
          <div className="flex items-center gap-2 text-sidebar-primary">
            <TestTube2 className="h-6 w-6" />
            <span className="font-semibold text-lg tracking-tight">TC Inventory</span>
          </div>
          <button
            onClick={() => setDrawerOpen(false)}
            className="text-sidebar-foreground hover:text-sidebar-accent-foreground p-1"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <NavLinks location={location} onNavigate={() => setDrawerOpen(false)} />
        <AccountSection />
      </aside>

      {/* ── Main content ─────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Top bar (mobile/tablet only) */}
        <header className="lg:hidden h-14 border-b border-border bg-card flex items-center px-4 gap-3 shrink-0">
          <button
            onClick={() => setDrawerOpen(true)}
            className="text-muted-foreground hover:text-foreground p-1"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2 text-primary">
            <TestTube2 className="h-5 w-5" />
            <span className="font-semibold tracking-tight">TC Inventory</span>
          </div>
        </header>

        <div className="flex-1 overflow-auto p-4 md:p-6 lg:p-8">
          <div className="mx-auto max-w-6xl">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
