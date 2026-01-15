import { RefreshCw, Clock, Database, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface DashboardHeaderProps {
  lastUpdated?: string;
  onRefresh: () => void;
  isRefreshing?: boolean;
  onLoadAll?: () => void;
  isLoadingAll?: boolean;
}

export function DashboardHeader({ 
  lastUpdated, 
  onRefresh, 
  isRefreshing,
  onLoadAll,
  isLoadingAll 
}: DashboardHeaderProps) {
  const formattedTime = lastUpdated
    ? new Date(lastUpdated).toLocaleTimeString("fr-FR", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : null;

  const formattedDate = lastUpdated
    ? new Date(lastUpdated).toLocaleDateString("fr-FR", {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : null;

  return (
    <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
      <div className="container mx-auto px-4 py-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              <span className="text-primary">Rates</span>{" "}
              <span className="text-foreground">Dashboard</span>
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Interest rate futures from global markets
            </p>
          </div>

          <div className="flex items-center gap-4">
            {lastUpdated && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="w-4 h-4" />
                <div className="text-right">
                  <div className="font-mono">{formattedTime}</div>
                  <div className="text-xs">{formattedDate}</div>
                </div>
              </div>
            )}

            {onLoadAll && (
              <Button
                variant="default"
                size="sm"
                onClick={onLoadAll}
                disabled={isLoadingAll}
                className="gap-2"
              >
                {isLoadingAll ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Database className="w-4 h-4" />
                )}
                {isLoadingAll ? "Chargement..." : "Charger Tout"}
              </Button>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={onRefresh}
              disabled={isRefreshing}
              className="gap-2"
            >
              <RefreshCw
                className={cn("w-4 h-4", isRefreshing && "animate-spin")}
              />
              Refresh
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}

