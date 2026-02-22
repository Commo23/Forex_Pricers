import { Activity, TrendingUp } from "lucide-react";

export type ViewMode = "home" | "futures" | "options" | "volatility" | "volsurface" | "ivmatrix";

export interface Breadcrumb {
  label: string;
  view: ViewMode;
  symbol?: string;
}

interface DashboardHeaderProps {
  breadcrumbs: Breadcrumb[];
  onBreadcrumbClick: (crumb: Breadcrumb) => void;
}

export function DashboardHeader({ breadcrumbs, onBreadcrumbClick }: DashboardHeaderProps) {
  return (
    <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
      <div className="container mx-auto px-4 max-w-[1600px]">
        <div className="flex items-center justify-between h-14">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center glow-primary">
                <TrendingUp className="w-4 h-4 text-primary" />
              </div>
              <h1 className="text-base font-semibold tracking-tight">
                FX Futures <span className="text-primary">Terminal</span>
              </h1>
            </div>
            <div className="h-5 w-px bg-border mx-1" />
            <nav className="flex items-center gap-1 text-sm">
              {breadcrumbs.map((crumb, i) => (
                <span key={i} className="flex items-center gap-1">
                  {i > 0 && <span className="text-muted-foreground mx-1">/</span>}
                  <button
                    onClick={() => onBreadcrumbClick(crumb)}
                    className={`transition-colors ${
                      i === breadcrumbs.length - 1
                        ? "text-foreground font-medium"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {crumb.label}
                  </button>
                </span>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Activity className="w-3 h-3 text-primary animate-pulse-slow" />
              <span>Live Data</span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
