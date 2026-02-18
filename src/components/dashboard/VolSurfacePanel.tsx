import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { RefreshCw, Calculator } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { SurfacePoint } from "@/lib/api/barchart";
import { fetchVolSurface, fetchVolSurfaceStrikes } from "@/lib/api/barchart";
import { interpolateSurface } from "@/lib/volSurfaceInterpolation";
import { DataCard } from "./DataCard";
import { LoadingState, ErrorState, EmptyState } from "./DataStates";
import { StrikeRangeSelector } from "./StrikeRangeSelector";
import { setCache } from "@/lib/scrapeCache";

function usePlotly() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if ((window as any).Plotly) {
      setReady(true);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://cdn.plot.ly/plotly-gl3d-2.35.2.min.js";
    script.async = true;
    script.onload = () => setReady(true);
    document.head.appendChild(script);
  }, []);
  return ready;
}

interface VolSurfacePanelProps {
  futureSymbol: string;
  optionSymbol: string;
}

type Phase = "loading-strikes" | "select-strikes" | "loading-surface" | "done";

export function VolSurfacePanel({ futureSymbol, optionSymbol }: VolSurfacePanelProps) {
  const [phase, setPhase] = useState<Phase>("loading-strikes");
  const [availableStrikes, setAvailableStrikes] = useState<number[]>([]);
  const [strikeRange, setStrikeRange] = useState<[number, number] | null>(null);
  const [points, setPoints] = useState<SurfacePoint[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState("");
  const [activeType, setActiveType] = useState<"call" | "put">("call");
  const [showMatrix, setShowMatrix] = useState(false);
  const [useInterpolation, setUseInterpolation] = useState(true);
  const [queryStrike, setQueryStrike] = useState("");
  const [queryDte, setQueryDte] = useState("");
  const plotRef = useRef<HTMLDivElement>(null);
  const plotlyReady = usePlotly();

  useEffect(() => {
    setPhase("loading-strikes");
    setError(null);
    setAvailableStrikes([]);
    setPoints([]);
    setStrikeRange(null);

    fetchVolSurfaceStrikes(futureSymbol, optionSymbol, 50).then((res) => {
      if (res.success && res.strikes && res.strikes.length > 0) {
        setAvailableStrikes(res.strikes);
        setPhase("select-strikes");
      } else {
        setError(res.error || "Unable to load available strikes.");
        setPhase("done");
      }
    });
  }, [futureSymbol, optionSymbol]);

  const buildSurface = useCallback(
    async (minStrike: number, maxStrike: number, forceRefresh = false) => {
      setStrikeRange([minStrike, maxStrike]);
      setPhase("loading-surface");
      setError(null);
      setProgress("Scraping all maturities for the selected range…");

      const result = await fetchVolSurface(
        futureSymbol,
        optionSymbol,
        50,
        forceRefresh,
        minStrike,
        maxStrike
      );

      if (result.success && result.surfacePoints) {
        setPoints(result.surfacePoints);
        setProgress(
          `${result.totalMaturities ?? 0} maturities, ${result.surfacePoints.length} points`
        );
        const matrixKey = `ivmatrix:${futureSymbol}:${optionSymbol}:${minStrike}-${maxStrike}`;
        setCache(matrixKey, result.surfacePoints);
      } else {
        setError(result.error || "Failed to build surface.");
      }
      setPhase("done");
    },
    [futureSymbol, optionSymbol]
  );

  const surfaceData = useMemo(() => {
    const filtered = points.filter((p) => p.type === activeType);
    if (filtered.length === 0) return null;

    const strikes = [...new Set(filtered.map((p) => p.strike))].sort((a, b) => a - b);
    const dtes = [...new Set(filtered.map((p) => p.dte))].sort((a, b) => a - b);
    const maturityLabels = dtes.map((dte) => {
      const point = filtered.find((p) => p.dte === dte);
      return point?.maturityLabel ?? String(dte);
    });

    let z: (number | null)[][] = dtes.map((dte) =>
      strikes.map((strike) => {
        const point = filtered.find((p) => p.dte === dte && p.strike === strike);
        const iv = point?.iv ?? null;
        return iv !== null && iv > 0 ? iv : null;
      })
    );

    if (useInterpolation) {
      z = interpolateSurface(z, strikes, dtes);
    }

    return { strikes, dtes, maturityLabels, z };
  }, [points, activeType, useInterpolation]);

  const interpolatedIV = useMemo(() => {
    if (!surfaceData || !queryStrike || !queryDte) return null;
    const qs = parseFloat(queryStrike);
    const qd = parseFloat(queryDte);
    if (isNaN(qs) || isNaN(qd)) return null;

    const { strikes, dtes, z } = surfaceData;
    if (strikes.length < 2 || dtes.length < 2) return null;

    let si = strikes.findIndex((s) => s >= qs);
    let di = dtes.findIndex((d) => d >= qd);

    if (si <= 0) si = 1;
    if (si >= strikes.length) si = strikes.length - 1;
    if (di <= 0) di = 1;
    if (di >= dtes.length) di = dtes.length - 1;

    const s0 = strikes[si - 1], s1 = strikes[si];
    const d0 = dtes[di - 1], d1 = dtes[di];

    const z00 = z[di - 1]?.[si - 1];
    const z01 = z[di - 1]?.[si];
    const z10 = z[di]?.[si - 1];
    const z11 = z[di]?.[si];

    const vals = [z00, z01, z10, z11].filter((v) => v !== null) as number[];
    if (vals.length === 0) return null;
    if (vals.length < 4) {
      return vals.reduce((a, b) => a + b, 0) / vals.length;
    }

    const ts = s1 !== s0 ? (qs - s0) / (s1 - s0) : 0.5;
    const td = d1 !== d0 ? (qd - d0) / (d1 - d0) : 0.5;
    return (
      z00! * (1 - ts) * (1 - td) +
      z01! * ts * (1 - td) +
      z10! * (1 - ts) * td +
      z11! * ts * td
    );
  }, [surfaceData, queryStrike, queryDte]);

  useEffect(() => {
    if (!plotlyReady || !surfaceData || !plotRef.current) return;
    const Plotly = (window as any).Plotly;
    if (!Plotly) return;

    const trace = {
      type: "surface",
      x: surfaceData.strikes,
      y: surfaceData.dtes,
      z: surfaceData.z,
      colorscale:
        activeType === "call"
          ? [
              [0, "rgb(20, 40, 80)"],
              [0.25, "rgb(30, 80, 160)"],
              [0.5, "rgb(60, 140, 200)"],
              [0.75, "rgb(120, 200, 220)"],
              [1, "rgb(200, 240, 255)"],
            ]
          : [
              [0, "rgb(80, 20, 20)"],
              [0.25, "rgb(160, 40, 40)"],
              [0.5, "rgb(200, 80, 60)"],
              [0.75, "rgb(230, 140, 100)"],
              [1, "rgb(255, 220, 200)"],
            ],
      colorbar: {
        title: { text: "IV (%)", font: { color: "#a0a0a0", size: 12 } },
        tickfont: { color: "#a0a0a0" },
      },
      hovertemplate: "Strike: %{x}<br>DTE: %{y}<br>IV: %{z:.2f}%<extra></extra>",
      lighting: { ambient: 0.6, diffuse: 0.5, specular: 0.3, roughness: 0.5 },
    };

    const layout = {
      autosize: true,
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      margin: { l: 10, r: 10, t: 30, b: 10 },
      scene: {
        xaxis: {
          title: { text: "Strike", font: { color: "#a0a0a0" } },
          gridcolor: "rgba(100,100,100,0.3)",
          tickfont: { color: "#a0a0a0", size: 10 },
          backgroundcolor: "rgba(0,0,0,0)",
        },
        yaxis: {
          title: { text: "Days to Expiration", font: { color: "#a0a0a0" } },
          gridcolor: "rgba(100,100,100,0.3)",
          tickfont: { color: "#a0a0a0", size: 10 },
          backgroundcolor: "rgba(0,0,0,0)",
        },
        zaxis: {
          title: { text: "IV (%)", font: { color: "#a0a0a0" } },
          gridcolor: "rgba(100,100,100,0.3)",
          tickfont: { color: "#a0a0a0", size: 10 },
          backgroundcolor: "rgba(0,0,0,0)",
        },
        bgcolor: "rgba(15,15,25,0.8)",
        camera: { eye: { x: 1.8, y: -1.8, z: 1.2 } },
      },
      font: { color: "#d0d0d0" },
    };

    Plotly.newPlot(plotRef.current, [trace], layout, {
      displayModeBar: true,
      displaylogo: false,
      responsive: true,
    });

    return () => {
      if (plotRef.current) Plotly.purge(plotRef.current);
    };
  }, [plotlyReady, surfaceData, activeType]);

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Volatility Surface 3D</h2>
          <p className="text-sm text-muted-foreground font-mono">
            {optionSymbol} — Monthly Options
          </p>
        </div>
      </div>

      {phase === "loading-strikes" && (
        <LoadingState message="Loading available strikes…" />
      )}

      {phase === "select-strikes" && availableStrikes.length > 0 && (
        <StrikeRangeSelector
          strikes={availableStrikes}
          onConfirm={(min, max) => buildSurface(min, max)}
        />
      )}

      {(phase === "loading-surface" || phase === "done") && (
        <>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-1 bg-muted/30 rounded-lg p-1 w-fit">
              <button
                onClick={() => setActiveType("call")}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                  activeType === "call"
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Calls
              </button>
              <button
                onClick={() => setActiveType("put")}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                  activeType === "put"
                    ? "bg-destructive/15 text-destructive"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Puts
              </button>
            </div>

            {surfaceData && (
              <>
                <button
                  onClick={() => setShowMatrix(!showMatrix)}
                  className="px-3 py-1.5 rounded-md text-xs font-medium bg-muted/50 text-muted-foreground hover:text-foreground border border-border transition-colors"
                >
                  {showMatrix ? "Hide IV matrix" : "Show IV matrix"}
                </button>
                <button
                  onClick={() => setUseInterpolation(!useInterpolation)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                    useInterpolation
                      ? "bg-primary/10 text-primary border-primary/30"
                      : "bg-muted/50 text-muted-foreground border-border"
                  }`}
                >
                  Interpolation {useInterpolation ? "ON" : "OFF"}
                </button>
              </>
            )}

            {phase === "done" && (
              <button
                onClick={() => {
                  setPhase("select-strikes");
                  setPoints([]);
                }}
                className="px-3 py-1.5 rounded-md text-xs font-medium bg-muted/50 text-muted-foreground hover:text-foreground border border-border transition-colors"
              >
                Change range
              </button>
            )}

            {phase !== "loading-surface" && (
              <span className="text-xs text-muted-foreground">
                {strikeRange && `Strikes ${strikeRange[0]}–${strikeRange[1]} | `}
                {progress}
              </span>
            )}
          </div>

          {surfaceData && phase === "done" && (
            <DataCard title="IV interpolation">
              <div className="flex items-end gap-4 flex-wrap">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Strike</label>
                  <Input
                    type="number"
                    placeholder={`e.g. ${surfaceData.strikes[Math.floor(surfaceData.strikes.length / 2)]}`}
                    value={queryStrike}
                    onChange={(e) => setQueryStrike(e.target.value)}
                    className="w-32 h-8 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">DTE (days)</label>
                  <Input
                    type="number"
                    placeholder={`e.g. ${surfaceData.dtes[Math.floor(surfaceData.dtes.length / 2)]}`}
                    value={queryDte}
                    onChange={(e) => setQueryDte(e.target.value)}
                    className="w-32 h-8 text-sm"
                  />
                </div>
                <div className="flex items-center gap-2 h-8">
                  <Calculator className="w-4 h-4 text-muted-foreground" />
                  {interpolatedIV !== null ? (
                    <span className="text-lg font-bold text-warning">{interpolatedIV.toFixed(2)}%</span>
                  ) : queryStrike && queryDte ? (
                    <span className="text-sm text-muted-foreground">Insufficient data</span>
                  ) : (
                    <span className="text-sm text-muted-foreground">Enter strike & DTE</span>
                  )}
                </div>
              </div>
            </DataCard>
          )}

          {showMatrix && surfaceData && (
            <DataCard title="IV matrix (Strike × DTE)">
              <div className="overflow-x-auto max-h-[400px]">
                <table className="w-full text-xs font-mono">
                  <thead>
                    <tr className="bg-table-header border-b border-table">
                      <th className="px-2 py-1.5 text-left text-muted-foreground uppercase tracking-wider sticky left-0 bg-table-header z-10">
                        Strike \ DTE
                      </th>
                      {surfaceData.dtes.map((dte, i) => (
                        <th
                          key={dte}
                          className="px-2 py-1.5 text-center text-muted-foreground"
                          title={surfaceData.maturityLabels[i]}
                        >
                          {dte}d
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {surfaceData.strikes.map((strike, si) => (
                      <tr key={strike} className="hover:bg-table-row-hover transition-colors">
                        <td className="px-2 py-1 font-semibold text-foreground sticky left-0 bg-background z-10 border-r border-border">
                          {strike}
                        </td>
                        {surfaceData.dtes.map((_, di) => {
                          const val = surfaceData.z[di]?.[si];
                          return (
                            <td
                              key={di}
                              className={`px-2 py-1 text-center ${
                                val !== null ? "text-warning" : "text-muted-foreground/30"
                              }`}
                            >
                              {val !== null ? val.toFixed(2) : "—"}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </DataCard>
          )}

          <DataCard
            title={`${activeType === "call" ? "Call" : "Put"} IV surface`}
            actions={
              <button
                onClick={() => strikeRange && buildSurface(strikeRange[0], strikeRange[1], true)}
                disabled={phase === "loading-surface"}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-3 h-3 ${phase === "loading-surface" ? "animate-spin" : ""}`} />
                Refresh
              </button>
            }
          >
            {phase === "loading-surface" ? (
              <LoadingState message="Scraping all maturities… This may take a minute." />
            ) : error ? (
              <ErrorState message={error} onRetry={() => strikeRange && buildSurface(strikeRange[0], strikeRange[1])} />
            ) : !surfaceData || surfaceData.z.length === 0 ? (
              <EmptyState message="No IV data available for 3D surface." />
            ) : !plotlyReady ? (
              <LoadingState message="Loading 3D engine…" />
            ) : (
              <div ref={plotRef} className="w-full" style={{ height: 600 }} />
            )}
          </DataCard>
        </>
      )}

      {phase === "done" && error && points.length === 0 && !strikeRange && (
        <ErrorState message={error} onRetry={() => window.location.reload()} />
      )}
    </div>
  );
}
