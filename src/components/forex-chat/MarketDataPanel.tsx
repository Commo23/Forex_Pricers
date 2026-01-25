import { useMarketData } from "@/hooks/useMarketData";
import { MarketRateCard } from "./MarketRateCard";
import { Activity, Clock, RefreshCw, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export function MarketDataPanel() {
  const { rates, lastUpdate, isLoading, error, refetch } = useMarketData();

  return (
    <div className="h-full flex flex-col bg-background border-l border-border">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            <h2 className="font-semibold text-foreground">Market Data</h2>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={refetch}
              disabled={isLoading}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className={`w-2 h-2 rounded-full ${error ? 'bg-red-500' : 'bg-green-500'} pulse-live`} />
              <span>{error ? 'Error' : 'Live'}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          <span>Updated: {lastUpdate.toLocaleTimeString()}</span>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Error State */}
        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-sm">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Loading State */}
        {isLoading && rates.length === 0 && (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-20 rounded-lg bg-muted/50 animate-pulse" />
            ))}
          </div>
        )}

        {/* Spot Rates */}
        {rates.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Spot Rates
            </h3>
            <div className="grid gap-3">
              {rates.map((rate) => (
                <MarketRateCard key={rate.pair} rate={rate} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

