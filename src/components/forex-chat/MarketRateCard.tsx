import { MarketRate } from "@/types/forexChat";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

interface MarketRateCardProps {
  rate: MarketRate;
}

export function MarketRateCard({ rate }: MarketRateCardProps) {
  const isPositive = rate.change > 0;
  const isNegative = rate.change < 0;

  return (
    <div className="bg-card border border-border rounded-lg p-3 hover:border-primary/50 transition-colors">
      <div className="flex items-center justify-between mb-2">
        <span className="font-semibold text-foreground">{rate.pair}</span>
        <div
          className={cn(
            "flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded",
            isPositive && "bg-success/20 text-success",
            isNegative && "bg-destructive/20 text-destructive",
            !isPositive && !isNegative && "bg-muted text-muted-foreground"
          )}
        >
          {isPositive && <TrendingUp className="h-3 w-3" />}
          {isNegative && <TrendingDown className="h-3 w-3" />}
          {!isPositive && !isNegative && <Minus className="h-3 w-3" />}
          {rate.changePercent > 0 ? "+" : ""}{rate.changePercent}%
        </div>
      </div>

      <div className="font-mono text-xl font-bold text-foreground mb-2">
        {rate.spotRate.toFixed(4)}
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <span className="text-muted-foreground">Bid</span>
          <span className="font-mono text-foreground ml-2">{rate.bid.toFixed(4)}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Ask</span>
          <span className="font-mono text-foreground ml-2">{rate.ask.toFixed(4)}</span>
        </div>
        <div>
          <span className="text-muted-foreground">H</span>
          <span className="font-mono text-success ml-2">{rate.high24h.toFixed(4)}</span>
        </div>
        <div>
          <span className="text-muted-foreground">L</span>
          <span className="font-mono text-destructive ml-2">{rate.low24h.toFixed(4)}</span>
        </div>
      </div>
    </div>
  );
}

