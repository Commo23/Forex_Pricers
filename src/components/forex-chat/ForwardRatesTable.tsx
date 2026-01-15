import { ForwardRate } from "@/types/forexChat";

interface ForwardRatesTableProps {
  forwards: ForwardRate[];
  basePair?: string;
}

export function ForwardRatesTable({ forwards, basePair = "EUR/USD" }: ForwardRatesTableProps) {
  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-border bg-secondary/50">
        <h3 className="text-sm font-semibold text-foreground">
          Forward Points - {basePair}
        </h3>
      </div>
      <div className="divide-y divide-border">
        {forwards.map((fwd) => (
          <div
            key={fwd.tenor}
            className="flex items-center justify-between px-4 py-2 hover:bg-secondary/30 transition-colors"
          >
            <span className="text-sm font-medium text-foreground">{fwd.tenor}</span>
            <div className="flex items-center gap-4">
              <span className={`font-mono text-sm ${fwd.points < 0 ? "text-destructive" : "text-success"}`}>
                {fwd.points > 0 ? "+" : ""}{fwd.points.toFixed(1)}
              </span>
              <span className="font-mono text-sm text-foreground w-20 text-right">
                {fwd.outright.toFixed(4)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

