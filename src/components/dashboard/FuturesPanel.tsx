import { useEffect, useState } from "react";
import { RefreshCw, ArrowLeft, ArrowRight } from "lucide-react";
import { fetchFutures, type CurrencyData, type FuturesContract } from "@/lib/api/barchart";
import { DataCard } from "./DataCard";
import { LoadingState, ErrorState, EmptyState } from "./DataStates";
import { PriceChange } from "./PriceChange";

interface FuturesPanelProps {
  currency: CurrencyData;
  onSelect: (future: FuturesContract) => void;
}

export function FuturesPanel({ currency, onSelect }: FuturesPanelProps) {
  const [futures, setFutures] = useState<FuturesContract[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rawPreview, setRawPreview] = useState<string>("");

  const loadData = async (forceRefresh = false) => {
    setLoading(true);
    setError(null);
    const result = await fetchFutures(currency.symbol, forceRefresh);
    if (result.success && result.data) {
      setFutures(result.data);
      setRawPreview(result.raw || "");
    } else {
      setError(result.error || "Failed to fetch futures");
      setRawPreview(result.raw || "");
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, [currency.symbol]);

  const columns = [
    { key: "contract", label: "Contract" },
    { key: "month", label: "Month" },
    { key: "last", label: "Last" },
    { key: "change", label: "Change" },
    { key: "percentChange", label: "%" },
    { key: "open", label: "Open" },
    { key: "high", label: "High" },
    { key: "low", label: "Low" },
    { key: "volume", label: "Volume" },
    { key: "openInterest", label: "Open Int" },
  ];

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h2 className="text-xl font-bold">{currency.name}</h2>
            <span className="text-sm font-mono text-accent">{currency.symbol}</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="font-mono font-medium">{currency.last}</span>
            <PriceChange value={currency.change} />
            <PriceChange value={currency.percentChange} />
          </div>
        </div>
      </div>

      <DataCard
        title={`Futures Contracts (${futures.length})`}
        actions={
          <button
            onClick={() => loadData(true)}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        }
      >
        {loading ? (
          <LoadingState message={`Scraping futures for ${currency.symbol}...`} />
        ) : error ? (
          <ErrorState message={error} onRetry={loadData} />
        ) : futures.length === 0 ? (
          <div className="p-4 space-y-4">
            <EmptyState message="No futures contracts parsed. Raw data shown below." />
            {rawPreview && (
              <pre className="text-xs text-muted-foreground bg-muted/30 p-3 rounded overflow-auto max-h-60 font-mono">
                {rawPreview}
              </pre>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-table-header border-b border-table">
                  {columns.map((col) => (
                    <th
                      key={col.key}
                      className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
                    >
                      {col.label}
                    </th>
                  ))}
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {futures.map((future, idx) => (
                  <tr
                    key={idx}
                    onClick={() => onSelect(future)}
                    className="hover:bg-table-row-hover cursor-pointer transition-colors group"
                  >
                    <td className="px-3 py-2.5">
                      <span className="data-cell font-semibold text-accent">{future.contract}</span>
                    </td>
                    <td className="px-3 py-2.5 text-sm">{future.month}</td>
                    <td className="px-3 py-2.5 data-cell font-medium">{future.last || "N/A"}</td>
                    <td className="px-3 py-2.5">
                      <PriceChange value={future.change} />
                    </td>
                    <td className="px-3 py-2.5">
                      <PriceChange value={future.percentChange} />
                    </td>
                    <td className="px-3 py-2.5 data-cell text-muted-foreground">{future.open || "N/A"}</td>
                    <td className="px-3 py-2.5 data-cell text-muted-foreground">{future.high || "N/A"}</td>
                    <td className="px-3 py-2.5 data-cell text-muted-foreground">{future.low || "N/A"}</td>
                    <td className="px-3 py-2.5 data-cell text-muted-foreground">{future.volume || "N/A"}</td>
                    <td className="px-3 py-2.5 data-cell text-muted-foreground">{future.openInterest || "N/A"}</td>
                    <td className="px-3 py-2.5">
                      <ArrowRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DataCard>
    </div>
  );
}
