import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { fetchVolatility, type FuturesContract, type VolatilityResponse, type GreekRow, type OptionsTypeOption } from "@/lib/api/barchart";
import { DataCard } from "./DataCard";
import { LoadingState, ErrorState, EmptyState } from "./DataStates";
import { PriceChange } from "./PriceChange";

interface Expiration {
  label: string;
  value: string;
}

interface VolatilityPanelProps {
  contract: FuturesContract;
  optionSymbol: string;
}

const DEFAULT_OPTIONS_TYPES: OptionsTypeOption[] = [
  { label: 'Monthly Options', value: 'monthly' },
  { label: 'Friday Weekly Options', value: 'weeklyFriday' },
  { label: 'Monday Weekly Options', value: 'weeklyMonday' },
  { label: 'Tuesday Weekly Options', value: 'weeklyTuesday' },
  { label: 'Wednesday Weekly Options', value: 'weeklyWednesday' },
  { label: 'Thursday Weekly Options', value: 'weeklyThursday' },
];

export function VolatilityPanel({ contract, optionSymbol }: VolatilityPanelProps) {
  const [data, setData] = useState<VolatilityResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rawPreview, setRawPreview] = useState("");
  const [activeTab, setActiveTab] = useState<"calls" | "puts">("calls");
  const [moneyness, setMoneyness] = useState(50);
  const [expirations, setExpirations] = useState<Expiration[]>([]);
  const [selectedMaturity, setSelectedMaturity] = useState<string>("");
  const [optionsTypes, setOptionsTypes] = useState<OptionsTypeOption[]>(DEFAULT_OPTIONS_TYPES);
  const [selectedOptionsType, setSelectedOptionsType] = useState<string>("monthly");

  const loadData = async (maturity?: string, optType?: string, forceRefresh = false) => {
    setLoading(true);
    setError(null);
    const result = await fetchVolatility(
      contract.contract,
      optionSymbol,
      moneyness,
      maturity,
      optType || selectedOptionsType,
      forceRefresh
    );
    if (result.success && result.data) {
      setData(result.data);
      setRawPreview(result.raw || "");
      if (result.expirations && result.expirations.length > 0) {
        setExpirations(result.expirations);
      } else {
        setExpirations([]);
      }
      if (result.optionsTypes && result.optionsTypes.length > 0) {
        setOptionsTypes(result.optionsTypes);
      }
    } else {
      setError(result.error || "Failed to fetch volatility data");
      setRawPreview(result.raw || "");
    }
    setLoading(false);
  };

  useEffect(() => {
    setSelectedMaturity("");
    setExpirations([]);
    setSelectedOptionsType("monthly");
    loadData();
  }, [contract.contract, optionSymbol]);

  useEffect(() => {
    loadData(selectedMaturity || undefined);
  }, [moneyness]);

  const handleMaturityChange = (maturity: string) => {
    setSelectedMaturity(maturity);
    loadData(maturity || undefined);
  };

  const handleOptionsTypeChange = (optType: string) => {
    setSelectedOptionsType(optType);
    setSelectedMaturity("");
    setExpirations([]);
    loadData(undefined, optType);
  };

  const columns = [
    { key: "strike", label: "Strike" },
    { key: "latest", label: "Latest" },
    { key: "iv", label: "IV" },
    { key: "delta", label: "Delta" },
    { key: "gamma", label: "Gamma" },
    { key: "theta", label: "Theta" },
    { key: "vega", label: "Vega" },
    { key: "ivSkew", label: "IV Skew" },
    { key: "lastTrade", label: "Last Trade" },
  ];

  const currentData = activeTab === "calls" ? data?.calls || [] : data?.puts || [];

  const formatGreekValue = (value: string, key: string) => {
    if (value === "N/A") return <span className="text-muted-foreground">N/A</span>;
    if (key === "iv" || key === "ivSkew") {
      const isPositive = value.startsWith("+");
      return (
        <span className={`font-mono text-xs ${key === "iv" ? "text-warning" : isPositive ? "text-primary" : "text-destructive"}`}>
          {value}
        </span>
      );
    }
    if (key === "delta") {
      const num = parseFloat(value);
      return <span className={`font-mono text-xs ${num >= 0 ? "text-primary" : "text-destructive"}`}>{value}</span>;
    }
    if (key === "theta") {
      return <span className="font-mono text-xs text-destructive">{value}</span>;
    }
    return <span className="font-mono text-xs">{value}</span>;
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h2 className="text-xl font-bold">Volatility & Greeks</h2>
            <span className="text-sm font-mono text-accent">{optionSymbol}</span>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="font-mono font-medium">{contract.last}</span>
            <PriceChange value={contract.change} />
            {data?.metadata?.daysToExpiration !== undefined && (
              <span className="text-muted-foreground">
                DTE: <span className="text-info font-mono">{data.metadata.daysToExpiration}</span>
              </span>
            )}
            {data?.metadata?.expirationDate && (
              <span className="text-muted-foreground">
                Exp: <span className="font-mono">{data.metadata.expirationDate}</span>
              </span>
            )}
            {data?.metadata?.pointValue && (
              <span className="text-muted-foreground">
                PV: <span className="font-mono">{data.metadata.pointValue}</span>
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        {/* Options Type selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground uppercase tracking-wider">Options Type:</span>
          <select
            value={selectedOptionsType}
            onChange={(e) => handleOptionsTypeChange(e.target.value)}
            className="bg-muted/50 border border-border rounded-md px-3 py-1.5 text-sm font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
          >
            {optionsTypes.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Maturity selector */}
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

        {/* Strikes selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground uppercase tracking-wider">Strikes:</span>
          <select
            value={moneyness}
            onChange={(e) => setMoneyness(Number(e.target.value))}
            className="bg-muted/50 border border-border rounded-md px-3 py-1.5 text-sm font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
          >
            <option value={5}>5 ±</option>
            <option value={20}>20 ±</option>
            <option value={50}>50 ±</option>
          </select>
        </div>

        {/* Calls / Puts toggle */}
        <div className="flex items-center gap-1 bg-muted/30 rounded-lg p-1 w-fit">
          <button
            onClick={() => setActiveTab("calls")}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
              activeTab === "calls"
                ? "bg-primary/15 text-primary glow-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Calls {data?.calls.length ? `(${data.calls.length})` : ""}
          </button>
          <button
            onClick={() => setActiveTab("puts")}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
              activeTab === "puts"
                ? "bg-destructive/15 text-destructive"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Puts {data?.puts.length ? `(${data.puts.length})` : ""}
          </button>
        </div>
      </div>

      <DataCard
        title={`${activeTab === "calls" ? "Call" : "Put"} Greeks`}
        actions={
          <button
            onClick={() => loadData(selectedMaturity || undefined, undefined, true)}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        }
      >
        {loading ? (
          <LoadingState message={`Scraping volatility for ${optionSymbol}...`} />
        ) : error ? (
          <ErrorState message={error} onRetry={() => loadData(selectedMaturity || undefined)} />
        ) : currentData.length === 0 ? (
          <div className="p-4 space-y-4">
            <EmptyState message={`No ${activeTab} Greeks parsed.`} />
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
                {currentData.map((row, idx) => (
                  <tr key={idx} className="hover:bg-table-row-hover transition-colors">
                    <td className="px-3 py-2.5">
                      <span className="data-cell font-semibold text-foreground">{row.strike}</span>
                    </td>
                    <td className="px-3 py-2.5 data-cell font-medium">{row.latest}</td>
                    <td className="px-3 py-2.5">{formatGreekValue(row.iv, "iv")}</td>
                    <td className="px-3 py-2.5">{formatGreekValue(row.delta, "delta")}</td>
                    <td className="px-3 py-2.5">{formatGreekValue(row.gamma, "gamma")}</td>
                    <td className="px-3 py-2.5">{formatGreekValue(row.theta, "theta")}</td>
                    <td className="px-3 py-2.5">{formatGreekValue(row.vega, "vega")}</td>
                    <td className="px-3 py-2.5">{formatGreekValue(row.ivSkew, "ivSkew")}</td>
                    <td className="px-3 py-2.5 data-cell text-muted-foreground text-xs">{row.lastTrade}</td>
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
