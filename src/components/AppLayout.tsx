import { useState } from "react";
import { Link, Outlet, useLocation } from "@tanstack/react-router";
import { LayoutGrid, FileText, Calculator, KanbanSquare, BarChart3, Menu, X, Flame, Settings, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth";

const navItems = [
  { title: "X-Matrix", to: "/xmatrix" as const, icon: LayoutGrid },
  { title: "Lean Business Case", to: "/lbc" as const, icon: FileText },
  { title: "WSJF Scoring", to: "/wsjf" as const, icon: Calculator },
  { title: "Kanban Board", to: "/kanban" as const, icon: KanbanSquare },
  { title: "Portfolio", to: "/portfolio" as const, icon: BarChart3 },
];

const roleBadgeClass: Record<string, string> = {
  admin: "bg-primary text-primary-foreground",
  contributor: "bg-accent text-accent-foreground",
  viewer: "bg-muted-foreground text-primary-foreground",
};

function NavItem({ item, onClick }: { item: typeof navItems[0]; onClick?: () => void }) {
  const location = useLocation();
  const active = location.pathname === item.to || location.pathname.startsWith(item.to + "/");

  return (
    <Link
      to={item.to}
      onClick={onClick}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
        active
          ? "bg-sidebar-accent text-accent border-l-[3px] border-accent"
          : "text-sidebar-foreground hover:bg-sidebar-accent/50"
      }`}
    >
      <item.icon className="h-4 w-4 flex-shrink-0" />
      <span>{item.title}</span>
    </Link>
  );
}

function Sidebar({ mobile, onClose }: { mobile?: boolean; onClose?: () => void }) {
  const { role } = useAuth();

  return (
    <aside className={`${mobile ? "w-64" : "hidden md:flex w-60"} flex-col bg-sidebar text-sidebar-foreground h-full`}>
      <div className="flex items-center gap-2 px-5 py-5 border-b border-sidebar-border">
        <div className="h-8 w-8 rounded-lg gradient-phoenix flex items-center justify-center flex-shrink-0">
          <Flame className="h-4 w-4 text-sidebar-primary-foreground" />
        </div>
        <span className="font-bold text-sm tracking-widest text-sidebar-primary-foreground">PHOENIX</span>
        {mobile && (
          <Button variant="ghost" size="icon" className="ml-auto text-sidebar-foreground" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        )}
      </div>
      <nav className="flex-1 py-4 space-y-1 px-2">
        {navItems.map((item) => (
          <NavItem key={item.to} item={item} onClick={onClose} />
        ))}
      </nav>
      {role === "admin" && (
        <div className="px-2 pb-4 border-t border-sidebar-border pt-2">
          <Link
            to="/settings"
            onClick={onClose}
            className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors"
          >
            <Settings className="h-4 w-4 flex-shrink-0" />
            <span>Settings</span>
          </Link>
        </div>
      )}
    </aside>
  );
}

export default function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { profile, client, role, signOut } = useAuth();

  return (
    <div className="min-h-screen flex w-full bg-background">
      <Sidebar />

      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-foreground/40" onClick={() => setMobileOpen(false)} />
          <div className="relative h-full">
            <Sidebar mobile onClose={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 flex items-center justify-between border-b border-border bg-card px-4 md:px-6 shrink-0">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setMobileOpen(true)}>
              <Menu className="h-5 w-5" />
            </Button>
            <span className="font-semibold text-primary text-sm">{client?.name ?? "PhoenixV2"}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground hidden sm:inline">{profile?.full_name}</span>
            {role && (
              <Badge className={`text-xs ${roleBadgeClass[role] ?? ""}`}>
                {role}
              </Badge>
            )}
            <Button variant="ghost" size="icon" onClick={signOut} title="Sign out">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </header>
        <main className="flex-1 p-4 md:p-6 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
