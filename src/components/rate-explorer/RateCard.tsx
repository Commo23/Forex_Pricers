import { cn } from "@/lib/utils";
import { RateIndex } from "@/lib/rate-explorer/rateIndices";
import { TrendingUp } from "lucide-react";

interface RateCardProps {
  rate: RateIndex;
  isSelected: boolean;
  onClick: () => void;
  isLoading?: boolean;
}

const currencyFlags: Record<string, string> = {
  EUR: "🇪🇺",
  USD: "🇺🇸",
  GBP: "🇬🇧",
  JPY: "🇯🇵",
  CHF: "🇨🇭",
  CAD: "🇨🇦",
  SGD: "🇸🇬",
};

export function RateCard({ rate, isSelected, onClick, isLoading }: RateCardProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left p-4 rounded-lg border transition-all duration-200",
        "hover:border-primary/50 hover:bg-secondary/30",
        isSelected
          ? "border-primary bg-primary/10 shadow-lg shadow-primary/10"
          : "border-border bg-card"
      )}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">{currencyFlags[rate.currency] || "🌐"}</span>
          <div>
            <h3 className="font-semibold text-foreground">{rate.name}</h3>
            <p className="text-xs text-muted-foreground">{rate.description}</p>
          </div>
        </div>
        <div
          className={cn(
            "p-2 rounded-full transition-colors",
            isSelected ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
          )}
        >
          <TrendingUp className="w-4 h-4" />
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <span
          className={cn(
            "px-2 py-0.5 rounded text-xs font-medium",
            rate.currency === "EUR" && "bg-blue-500/20 text-blue-400",
            rate.currency === "USD" && "bg-green-500/20 text-green-400",
            rate.currency === "GBP" && "bg-purple-500/20 text-purple-400",
            rate.currency === "JPY" && "bg-red-500/20 text-red-400",
            rate.currency === "CHF" && "bg-orange-500/20 text-orange-400",
            rate.currency === "CAD" && "bg-cyan-500/20 text-cyan-400",
            rate.currency === "SGD" && "bg-pink-500/20 text-pink-400"
          )}
        >
          {rate.currency}
        </span>
        {isLoading && (
          <span className="text-xs text-muted-foreground animate-pulse">
            Loading...
          </span>
        )}
      </div>
    </button>
  );
}

