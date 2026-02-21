import { Home, Clock, Settings, Subtitles, Flame } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AppScreen } from "@/lib/types";

interface NavItem {
  id: AppScreen;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const NAV_ITEMS: NavItem[] = [
  { id: "home", label: "Home", icon: Home },
  { id: "editor", label: "Editor", icon: Subtitles },
  { id: "burn", label: "Burn-in", icon: Flame },
  { id: "history", label: "Histórico", icon: Clock },
  { id: "settings", label: "Configurações", icon: Settings },
];

interface AppSidebarProps {
  current: AppScreen;
  onNavigate: (screen: AppScreen) => void;
  collapsed?: boolean;
}

export function AppSidebar({ current, onNavigate, collapsed = false }: AppSidebarProps) {
  return (
    <aside
      className={cn(
        "flex flex-col border-r border-sidebar-border bg-sidebar transition-all duration-200",
        collapsed ? "w-14" : "w-48"
      )}
      style={{ minHeight: "100vh" }}
    >
      {/* Logo */}
      <div className="flex h-14 items-center gap-2.5 border-b border-sidebar-border px-4">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/20">
          <svg viewBox="0 0 24 24" className="h-4 w-4 text-primary" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5" />
            <path d="M2 12l10 5 10-5" />
          </svg>
        </div>
        {!collapsed && (
          <div className="flex flex-col gap-0">
            <span className="text-sm font-bold tracking-tight font-serif text-sidebar-foreground leading-none">
              SubForge
            </span>
            <span className="text-[9px] font-medium uppercase tracking-widest text-muted-foreground leading-none mt-0.5">
              subtitle generator
            </span>
          </div>
        )}
      </div>

      {/* Navegação */}
      <nav className="flex-1 px-2 py-3 space-y-0.5">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = current === item.id || (current === "processing" && item.id === "home");
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-xs transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-primary font-medium"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              )}
              title={collapsed ? item.label : undefined}
            >
              <Icon className={cn("h-4 w-4 shrink-0", isActive ? "text-sidebar-primary" : "")} />
              {!collapsed && <span>{item.label}</span>}
            </button>
          );
        })}
      </nav>

      {/* Versão */}
      {!collapsed && (
        <div className="px-4 py-3 border-t border-sidebar-border">
          <p className="text-[9px] text-muted-foreground/40 font-mono">v0.1.0</p>
        </div>
      )}
    </aside>
  );
}
