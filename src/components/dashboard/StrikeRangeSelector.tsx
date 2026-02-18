import { useState, useMemo } from "react";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Play } from "lucide-react";

interface StrikeRangeSelectorProps {
  strikes: number[];
  onConfirm: (minStrike: number, maxStrike: number) => void;
  loading?: boolean;
}

export function StrikeRangeSelector({ strikes, onConfirm, loading }: StrikeRangeSelectorProps) {
  const sorted = useMemo(() => [...strikes].sort((a, b) => a - b), [strikes]);
  const min = sorted[0] ?? 0;
  const max = sorted[sorted.length - 1] ?? 100;

  const [range, setRange] = useState<[number, number]>([min, max]);

  const selectedCount = useMemo(
    () => sorted.filter((s) => s >= range[0] && s <= range[1]).length,
    [sorted, range]
  );

  const handleSliderChange = (values: number[]) => {
    const lo = sorted.reduce((prev, curr) =>
      Math.abs(curr - values[0]) < Math.abs(prev - values[0]) ? curr : prev
    );
    const hi = sorted.reduce((prev, curr) =>
      Math.abs(curr - values[1]) < Math.abs(prev - values[1]) ? curr : prev
    );
    setRange([Math.min(lo, hi), Math.max(lo, hi)]);
  };

  return (
    <div className="space-y-4 p-4 rounded-lg border border-border bg-muted/20">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Strike range</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {sorted.length} strikes available — {selectedCount} selected
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => onConfirm(range[0], range[1])}
          disabled={loading || selectedCount === 0}
          className="gap-1.5"
        >
          <Play className="w-3.5 h-3.5" />
          Build surface
        </Button>
      </div>

      <div className="px-2">
        <Slider
          min={min}
          max={max}
          step={(max - min) / 200 || 0.01}
          value={range}
          onValueChange={handleSliderChange}
          className="w-full"
        />
      </div>

      <div className="flex items-center justify-between text-xs font-mono">
        <Badge variant="outline" className="font-mono">
          Min: {range[0]}
        </Badge>
        <span className="text-muted-foreground">
          {selectedCount} / {sorted.length} strikes
        </span>
        <Badge variant="outline" className="font-mono">
          Max: {range[1]}
        </Badge>
      </div>

      <div className="flex flex-wrap gap-1 max-h-[120px] overflow-y-auto">
        {sorted.map((s) => {
          const inRange = s >= range[0] && s <= range[1];
          return (
            <span
              key={s}
              className={`text-[10px] font-mono px-1.5 py-0.5 rounded transition-colors ${
                inRange
                  ? "bg-primary/15 text-primary border border-primary/30"
                  : "bg-muted/30 text-muted-foreground/40 border border-transparent"
              }`}
            >
              {s}
            </span>
          );
        })}
      </div>
    </div>
  );
}
