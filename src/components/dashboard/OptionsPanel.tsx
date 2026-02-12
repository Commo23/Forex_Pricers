import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { fetchOptions, type FuturesContract, type OptionsResponse } from "@/lib/api/barchart";
import { DataCard } from "./DataCard";
import { LoadingState, ErrorState, EmptyState } from "./DataStates";
import { PriceChange } from "./PriceChange";

interface Expiration {
  label: string;
  value: string;
}

interface OptionsPanelProps {
  contract: FuturesContract;
  onViewVolatility?: (optionSymbol: string) => void;
}

export function OptionsPanel({ contract, onViewVolatility }: OptionsPanelProps) {
  const [options, setOptions] = useState<OptionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rawPreview, setRawPreview] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"calls" | "puts">("calls");
  const [expirations, setExpirations] = useState<Expiration[]>([]);
  const [selectedMaturity, setSelectedMaturity] = useState<string>("");

  const loadData = async (maturity?: string, forceRefresh = false) => {
    setLoading(true);
    setError(null);
    const result = await fetchOptions(contract.contract, maturity, forceRefresh);
    if (result.success && result.data) {
      setOptions(result.data);
      setRawPreview(result.raw || "");
      if (result.expirations && result.expirations.length > 0) {
        setExpirations(result.expirations);
      }
    } else {
      setError(result.error || "Failed to fetch options");
      setRawPreview(result.raw || "");
    }
    setLoading(false);
  };

  useEffect(() => {
    setSelectedMaturity("");
    setExpirations([]);
    loadData();
  }, [contract.contract]);

  const handleMaturityChange = (maturity: string) => {
    setSelectedMaturity(maturity);
    loadData(maturity);
  };

  const columns = [
    { key: "strike", label: "Strike" },
    { key: "open", label: "Open" },
    { key: "high", label: "High" },
    { key: "low", label: "Low" },
    { key: "last", label: "Latest" },
    { key: "change", label: "Change" },
    { key: "bid", label: "Bid" },
    { key: "ask", label: "Ask" },
    { key: "volume", label: "Volume" },
    { key: "openInterest", label: "Open Int" },
  ];

  const currentData = activeTab === "calls" ? options?.calls || [] : options?.puts || [];

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h2 className="text-xl font-bold">{contract.contract} Options</h2>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="font-mono font-medium">{contract.last}</span>
            <PriceChange value={contract.change} />
            {options?.metadata?.impliedVolatility && (
              <span className="text-muted-foreground">
                IV: <span className="text-warning font-mono">{options.metadata.impliedVolatility}</span>
              </span>
            )}
            {options?.metadata?.daysToExpiration !== undefined && (
              <span className="text-muted-foreground">
                DTE: <span className="text-info font-mono">{options.metadata.daysToExpiration}</span>
              </span>
            )}
          </div>
        </div>
        {onViewVolatility && (
          <button
            onClick={() => onViewVolatility(contract.contract)}
            className="flex items-center gap-2 px-4 py-2 rounded-md bg-accent/10 text-accent hover:bg-accent/20 text-sm font-medium transition-colors"
          >
            Vol & Greeks
          </button>
        )}
      </div>
      {/* Maturity selector + Tabs */}
      <div className="flex items-center gap-4 flex-wrap">
        {expirations.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground uppercase tracking-wider">Maturity:</span>
            <select
              value={selectedMaturity}
              onChange={(e) => handleMaturityChange(e.target.value)}
              className="bg-muted/50 border border-border rounded-md px-3 py-1.5 text-sm font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
            >
              <option value="">Default</option>
              {expirations.map((exp, idx) => (
                <option key={idx} value={exp.value}>
                  {exp.label}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex items-center gap-1 bg-muted/30 rounded-lg p-1 w-fit">
          <button
            onClick={() => setActiveTab("calls")}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
              activeTab === "calls"
                ? "bg-primary/15 text-primary glow-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Calls {options?.calls.length ? `(${options.calls.length})` : ""}
          </button>
          <button
            onClick={() => setActiveTab("puts")}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
              activeTab === "puts"
                ? "bg-destructive/15 text-destructive"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Puts {options?.puts.length ? `(${options.puts.length})` : ""}
          </button>
        </div>
      </div>

      <DataCard
        title={`${activeTab === "calls" ? "Call" : "Put"} Options`}
        actions={
          <button
            onClick={() => loadData(selectedMaturity || undefined, true)}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        }
      >
        {loading ? (
          <LoadingState message={`Scraping options for ${contract.contract}...`} />
        ) : error ? (
          <ErrorState message={error} onRetry={() => loadData(selectedMaturity || undefined)} />
        ) : currentData.length === 0 ? (
          <div className="p-4 space-y-4">
            <EmptyState message={`No ${activeTab} parsed. Raw data shown below.`} />
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
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {currentData.map((option, idx) => (
                  <tr key={idx} className="hover:bg-table-row-hover transition-colors">
                    <td className="px-3 py-2.5">
                      <span className="data-cell font-semibold text-foreground">{option.strike}</span>
                    </td>
                    <td className="px-3 py-2.5 data-cell text-muted-foreground">{option.open}</td>
                    <td className="px-3 py-2.5 data-cell text-muted-foreground">{option.high}</td>
                    <td className="px-3 py-2.5 data-cell text-muted-foreground">{option.low}</td>
                    <td className="px-3 py-2.5 data-cell font-medium">{option.last}</td>
                    <td className="px-3 py-2.5">
                      <PriceChange value={option.change} />
                    </td>
                    <td className="px-3 py-2.5 data-cell text-info">{option.bid}</td>
                    <td className="px-3 py-2.5 data-cell text-warning">{option.ask}</td>
                    <td className="px-3 py-2.5 data-cell text-muted-foreground">{option.volume}</td>
                    <td className="px-3 py-2.5 data-cell text-muted-foreground">{option.openInterest}</td>
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
