import { Layers } from "lucide-react";
import type { ReactNode } from "react";

interface AppHeaderProps {
  title: string;
  subtitle?: string;
  icon?: React.ComponentType<{ className?: string }>;
  actions?: ReactNode;
}

export function AppHeader({
  title,
  subtitle,
  icon: Icon = Layers,
  actions,
}: AppHeaderProps) {
  return (
    <header className="relative z-30 flex h-14 shrink-0 items-center gap-4 border-b border-white/5 bg-background/60 px-6 backdrop-blur-xl">
      {/* Título */}
      <div className="flex items-center gap-2.5">
        <Icon className="h-4 w-4 text-primary" />
        <div className="flex flex-col gap-0.5">
          <h1 className="text-base font-bold leading-none tracking-tight text-foreground font-serif">
            {title}
          </h1>
          {subtitle && (
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-widest leading-none">
              {subtitle}
            </span>
          )}
        </div>
      </div>

      {actions && (
        <>
          <div className="h-6 w-px bg-white/10 hidden md:block" />
          <div className="ml-auto flex items-center gap-2">{actions}</div>
        </>
      )}
    </header>
  );
}
