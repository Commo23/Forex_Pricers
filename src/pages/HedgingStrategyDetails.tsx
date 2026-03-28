import React, { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, CalendarDays, ExternalLink, Sigma, Activity } from "lucide-react";
import StrategyImportService from "@/services/StrategyImportService";
import { CURRENCY_PAIRS } from "@/pages/Index";
import PayoffChart from "@/components/PayoffChart";
import { PricingService } from "@/services/PricingService";

function normalizeType(raw: string): string {
  return raw.toLowerCase().trim().replace(/\s+/g, "-");
}

function mapBarrierPricingType(type: string): string | null {
  const t = normalizeType(type);
  if (!t.includes("knock")) return null;
  if (t.includes("double")) {
    if (t.includes("call") && (t.includes("knock-out") || t.includes("knockout"))) return "call-double-knockout";
    if (t.includes("put") && (t.includes("knock-out") || t.includes("knockout"))) return "put-double-knockout";
    if (t.includes("call") && (t.includes("knock-in") || t.includes("knockin"))) return "call-double-knockin";
    if (t.includes("put") && (t.includes("knock-in") || t.includes("knockin"))) return "put-double-knockin";
    return null;
  }
  if (t.includes("call") && t.includes("reverse")) return "call-reverse-knockout";
  if (t.includes("put") && t.includes("reverse")) return "put-reverse-knockout";
  if (t.includes("call") && (t.includes("knock-out") || t.includes("knockout"))) return "call-knockout";
  if (t.includes("put") && (t.includes("knock-out") || t.includes("knockout"))) return "put-knockout";
  if (t.includes("call") && (t.includes("knock-in") || t.includes("knockin"))) return "call-knockin";
  if (t.includes("put") && (t.includes("knock-in") || t.includes("knockin"))) return "put-knockin";
  return null;
}

function isDigitalType(type: string): boolean {
  const t = normalizeType(type);
  return t.includes("touch") || t.includes("binary") || t.includes("digital");
}

function isVanillaType(type: string): "call" | "put" | null {
  const t = normalizeType(type);
  if (t.includes("knock") || isDigitalType(type)) return null;
  if (t.includes("call")) return "call";
  if (t.includes("put")) return "put";
  return null;
}

export default function HedgingStrategyDetails() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const service = useMemo(() => StrategyImportService.getInstance(), []);
  const [valuationDate, setValuationDate] = useState(new Date().toISOString().split("T")[0]);

  const hedgingStrategy = useMemo(() => service.getHedgingStrategies().find((s) => s.id === id), [service, id]);
  const importedStrategy = useMemo(() => service.getImportedStrategies().find((s) => s.id === id), [service, id]);
  const instruments = useMemo(
    () => service.getHedgingInstruments().filter((x) => (x.strategyId || "HSTRAT-UNASSIGNED") === id),
    [service, id]
  );

  const currencyPairObj = useMemo(() => {
    const symbol = importedStrategy?.currencyPair ?? hedgingStrategy?.currencyPair;
    if (!symbol) return null;
    // Prefer built-in list; Strategy Builder also supports custom pairs but this is enough for most cases.
    return CURRENCY_PAIRS.find((p) => p.symbol === symbol) ?? null;
  }, [importedStrategy?.currencyPair, hedgingStrategy?.currencyPair]);

  const valuation = useMemo(() => {
    // Build per-leg pricing snapshot (export vs valuation date) using same logic as instrument details.
    const legs = instruments
      .slice()
      .sort((a, b) => (a.optionIndex ?? 0) - (b.optionIndex ?? 0) || String(a.maturity).localeCompare(String(b.maturity)))
      .map((inst) => {
        const spot = Number(inst.impliedSpotPrice || inst.exportSpotPrice || importedStrategy?.spotPrice || 1);
        const r_d = Number(inst.exportDomesticRate ?? importedStrategy?.params.domesticRate ?? 0) / 100;
        const r_f = Number(inst.exportForeignRate ?? importedStrategy?.params.foreignRate ?? 0) / 100;
        const sigma = Number(inst.impliedVolatility ?? inst.volatility ?? inst.exportVolatility ?? 15) / 100;
        const K = Number(inst.strike || spot);
        const rebate = Number(inst.rebate ?? 100);
        const t = PricingService.calculateTimeToMaturity(inst.maturity, valuationDate);
        const exportPremium = Number(inst.realOptionPrice ?? inst.premium ?? 0);

        const tNorm = normalizeType(inst.type);
        let currentPrice = 0;
        if (t <= 0) {
          if (tNorm.includes("call")) currentPrice = Math.max(0, spot - K);
          else if (tNorm.includes("put")) currentPrice = Math.max(0, K - spot);
          else currentPrice = 0;
        } else if (tNorm === "forward" || tNorm === "swap") {
          const fwd = PricingService.calculateFXForwardPrice(spot, r_d, r_f, t);
          currentPrice = (fwd - K) * Math.exp(-r_d * t);
        } else {
          const barrierType = mapBarrierPricingType(inst.type);
          if (barrierType && inst.barrier != null) {
            currentPrice = PricingService.calculateBarrierOptionClosedForm(
              barrierType,
              PricingService.calculateFXForwardPrice(spot, r_d, r_f, t),
              K,
              r_d,
              t,
              sigma,
              inst.barrier,
              inst.secondBarrier,
              r_f
            );
          } else if (isDigitalType(inst.type)) {
            currentPrice = PricingService.calculateDigitalOptionPrice(
              tNorm,
              spot,
              K,
              r_d,
              r_f,
              t,
              sigma,
              inst.barrier,
              inst.secondBarrier,
              0,
              rebate,
              true
            );
          } else {
            const vanilla = isVanillaType(inst.type);
            if (vanilla) {
              currentPrice = PricingService.calculateGarmanKohlhagenPrice(vanilla, spot, K, r_d, r_f, t, sigma);
            }
          }
        }

        const greeksType =
          mapBarrierPricingType(inst.type) ||
          (isDigitalType(inst.type) ? normalizeType(inst.type) : isVanillaType(inst.type) || "call");
        const greeks = t > 0 && sigma > 0
          ? PricingService.calculateGreeks(greeksType, spot, K, r_d, r_f, t, sigma, inst.barrier, inst.secondBarrier, rebate)
          : { delta: 0, gamma: 0, theta: 0, vega: 0, rho: 0 };

        return {
          inst,
          spot,
          r_d,
          r_f,
          sigma,
          t,
          K,
          exportPremium,
          currentPrice,
          greeks,
        };
      });

    const exportSpot = Number(importedStrategy?.spotPrice ?? legs[0]?.spot ?? 1);
    const currentSpot = Number(legs[0]?.spot ?? exportSpot);
    const totalNotional = instruments.reduce((acc, x) => acc + Math.abs(Number(x.notional || 0)), 0);
    const maturities = instruments.map((x) => x.maturity).filter(Boolean).sort();
    const minMat = maturities[0] ?? "—";
    const maxMat = maturities[maturities.length - 1] ?? "—";

    return { legs, exportSpot, currentSpot, totalNotional, minMat, maxMat };
  }, [instruments, importedStrategy, valuationDate]);

  const payoffContext = useMemo(() => {
    if (!importedStrategy || !valuation) return null;
    const strategy = importedStrategy.components || [];
    const exportSpot = valuation.exportSpot || 1;
    const currentSpot = valuation.currentSpot || exportSpot;

    // Premium per leg: export uses stored premium; current uses repriced currentPrice.
    const premiumByIndexExport = new Map<number, number>();
    const premiumByIndexCurrent = new Map<number, number>();
    for (const l of valuation.legs) {
      const idx = l.inst.optionIndex;
      if (idx == null) continue;
      if (!premiumByIndexExport.has(idx)) premiumByIndexExport.set(idx, Number(l.exportPremium || 0));
      if (!premiumByIndexCurrent.has(idx)) premiumByIndexCurrent.set(idx, Number(l.currentPrice || 0));
    }

    const buildPayoffData = (refSpot: number, mode: "export" | "current") => {
      const minSpot = refSpot * 0.7;
      const maxSpot = refSpot * 1.3;
      const step = (maxSpot - minSpot) / 100;
      const rows: Array<{ price: number; payoff: number }> = [];
      for (let p = minSpot; p <= maxSpot; p += step) {
        let totalPayoff = PricingService.calculateStrategyPayoffAtPrice(strategy as any[], p, refSpot);
        // Align with Pricers: shift payoff by premium per leg based on long/short.
        strategy.forEach((leg: any, i: number) => {
          const qty = Number(leg.quantity || 0) / 100;
          const prem = mode === "export" ? (premiumByIndexExport.get(i) ?? 0) : (premiumByIndexCurrent.get(i) ?? 0);
          if (prem !== 0 && qty !== 0) {
            totalPayoff += qty > 0 ? -prem : prem;
          }
        });
        rows.push({ price: p, payoff: totalPayoff });
      }
      return rows;
    };

    // For FX Hedging tab, PayoffChart supports a single "realPremium" → use a weighted average.
    const avgPremium = (mode: "export" | "current") => {
      let w = 0;
      let s = 0;
      strategy.forEach((leg: any, i: number) => {
        const qtyAbs = Math.abs(Number(leg.quantity || 0) / 100);
        const prem = mode === "export" ? (premiumByIndexExport.get(i) ?? 0) : (premiumByIndexCurrent.get(i) ?? 0);
        if (qtyAbs > 0) {
          w += qtyAbs;
          s += prem * qtyAbs;
        }
      });
      return w > 0 ? s / w : 0;
    };

    return {
      strategy,
      exportSpot,
      currentSpot,
      exportData: buildPayoffData(exportSpot, "export"),
      currentData: buildPayoffData(currentSpot, "current"),
      exportAvgPremium: avgPremium("export"),
      currentAvgPremium: avgPremium("current"),
      currencyPair: currencyPairObj ?? { base: "BASE", quote: "QUOTE", symbol: importedStrategy.currencyPair },
    };
  }, [importedStrategy, valuation, currencyPairObj]);

  const handleOpenInStrategyBuilder = () => {
    if (!importedStrategy) {
      navigate("/strategy-builder");
      return;
    }
    const pair = currencyPairObj ?? {
      symbol: importedStrategy.currencyPair,
      name: importedStrategy.currencyPair,
      base: importedStrategy.currencyPair.split("/")[0] ?? "BASE",
      quote: importedStrategy.currencyPair.split("/")[1] ?? "QUOTE",
      category: "custom",
      defaultSpotRate: importedStrategy.spotPrice ?? 1,
    };

    const params = {
      startDate: importedStrategy.params.startDate,
      strategyStartDate: importedStrategy.params.strategyStartDate,
      monthsToHedge: importedStrategy.params.monthsToHedge,
      domesticRate: importedStrategy.params.domesticRate,
      foreignRate: importedStrategy.params.foreignRate,
      interestRate: importedStrategy.params.domesticRate,
      totalVolume: importedStrategy.params.baseVolume,
      baseVolume: importedStrategy.params.baseVolume,
      quoteVolume: importedStrategy.params.quoteVolume,
      spotPrice: importedStrategy.spotPrice,
      currencyPair: pair,
      useCustomPeriods: false,
      customPeriods: [],
      volumeType: importedStrategy.params.volumeType ?? "receivable",
    };

    localStorage.setItem(
      "calculatorState",
      JSON.stringify({
        params,
        strategy: importedStrategy.components,
        results: [],
        payoffData: [],
        manualForwards: {},
        realPrices: {},
        realPriceParams: { useSimulation: false, volatility: 0.3, drift: 0.01, numSimulations: 1000 },
        barrierOptionSimulations: 1000,
        useClosedFormBarrier: false,
        activeTab: "parameters",
        customScenario: null,
        stressTestScenarios: {},
        useImpliedVol: false,
        impliedVolatilities: {},
        customOptionPrices: {},
      })
    );
    navigate("/strategy-builder");
  };

  if (!id || !hedgingStrategy) {
    return (
      <Layout title="Strategy details" breadcrumbs={[{ label: "Hedging Instruments", href: "/hedging" }, { label: "Strategy details" }]}>
        <div className="space-y-4">
          <Button variant="outline" onClick={() => navigate("/hedging")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <Card>
            <CardContent className="pt-6">Strategy not found.</CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  return (
    <Layout
      title="Strategy details"
      breadcrumbs={[
        { label: "Hedging Instruments", href: "/hedging" },
        { label: hedgingStrategy.name },
      ]}
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button variant="outline" onClick={() => navigate("/hedging")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div className="flex items-center gap-2 rounded-md border bg-background px-3 py-2">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Valuation date</span>
            <Input type="date" value={valuationDate} onChange={(e) => setValuationDate(e.target.value)} className="h-8 w-[170px]" />
          </div>
          <div className="flex items-center gap-2">
            {importedStrategy && (
              <Button onClick={handleOpenInStrategyBuilder}>
                <ExternalLink className="h-4 w-4 mr-2" />
                Open in Strategy Builder
              </Button>
            )}
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">
              {hedgingStrategy.name}
              <Badge variant="outline">{hedgingStrategy.source}</Badge>
              {hedgingStrategy.currencyPair && <Badge variant="secondary">{hedgingStrategy.currencyPair}</Badge>}
            </CardTitle>
            <CardDescription>
              Strategy ID: <span className="font-mono">{hedgingStrategy.id}</span>
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-md border p-3">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Instruments</div>
              <div className="mt-1 text-sm font-medium">{instruments.length}</div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Maturity range</div>
              <div className="mt-1 text-sm font-medium font-mono">{valuation?.minMat ?? "—"} → {valuation?.maxMat ?? "—"}</div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Total notional</div>
              <div className="mt-1 text-sm font-medium font-mono">{Number(valuation?.totalNotional || 0).toLocaleString()}</div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Created</div>
              <div className="mt-1 text-sm font-medium">{new Date(hedgingStrategy.createdAt).toLocaleString()}</div>
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="payoff">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="payoff">Payoff</TabsTrigger>
            <TabsTrigger value="legs">Legs & Pricing</TabsTrigger>
            <TabsTrigger value="instruments">Instruments</TabsTrigger>
            <TabsTrigger value="greeks">Greeks</TabsTrigger>
          </TabsList>

          <TabsContent value="payoff" className="mt-4 space-y-4">
            {!payoffContext ? (
              <Card>
                <CardContent className="pt-6 text-sm text-muted-foreground">
                  Payoff is available for strategies imported from Strategy Builder.
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2"><Activity className="h-4 w-4" />Payoff analysis</CardTitle>
                  <CardDescription>Export vs valuation-date payoff, in P&amp;L and FX Hedging formats.</CardDescription>
                </CardHeader>
                <CardContent>
                  <Tabs defaultValue="current">
                    <TabsList className="mb-4">
                      <TabsTrigger value="current">Valuation date</TabsTrigger>
                      <TabsTrigger value="export">Export</TabsTrigger>
                    </TabsList>
                    <TabsContent value="current">
                      <PayoffChart
                        data={payoffContext.currentData}
                        strategy={payoffContext.strategy}
                        spot={payoffContext.currentSpot}
                        currencyPair={payoffContext.currencyPair}
                        includePremium
                        showPremiumToggle
                        realPremium={payoffContext.currentAvgPremium}
                      />
                    </TabsContent>
                    <TabsContent value="export">
                      <PayoffChart
                        data={payoffContext.exportData}
                        strategy={payoffContext.strategy}
                        spot={payoffContext.exportSpot}
                        currencyPair={payoffContext.currencyPair}
                        includePremium
                        showPremiumToggle
                        realPremium={payoffContext.exportAvgPremium}
                      />
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="legs" className="mt-4 space-y-4">
            {!valuation ? null : (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2"><Sigma className="h-4 w-4" />Legs & pricing snapshot</CardTitle>
                  <CardDescription>Per-leg export premium vs repriced premium at valuation date, plus Greeks.</CardDescription>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <Table className="[&_th]:whitespace-nowrap [&_td]:whitespace-nowrap">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Leg</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Maturity</TableHead>
                        <TableHead>Spot</TableHead>
                        <TableHead>Strike</TableHead>
                        <TableHead>Export premium</TableHead>
                        <TableHead>Current premium</TableHead>
                        <TableHead>Delta</TableHead>
                        <TableHead>Gamma</TableHead>
                        <TableHead>Vega</TableHead>
                        <TableHead>Theta</TableHead>
                        <TableHead>Rho</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {valuation.legs.map((l, idx) => (
                        <TableRow key={l.inst.id}>
                          <TableCell className="font-mono">{l.inst.optionIndex ?? idx}</TableCell>
                          <TableCell>{l.inst.type}</TableCell>
                          <TableCell className="font-mono">{l.inst.maturity}</TableCell>
                          <TableCell className="font-mono">{Number(l.spot).toFixed(6)}</TableCell>
                          <TableCell className="font-mono">{Number(l.K).toFixed(6)}</TableCell>
                          <TableCell className="font-mono">{Number(l.exportPremium).toFixed(6)}</TableCell>
                          <TableCell className="font-mono">{Number(l.currentPrice).toFixed(6)}</TableCell>
                          <TableCell className="font-mono">{Number(l.greeks.delta).toFixed(6)}</TableCell>
                          <TableCell className="font-mono">{Number(l.greeks.gamma).toFixed(6)}</TableCell>
                          <TableCell className="font-mono">{Number(l.greeks.vega).toFixed(6)}</TableCell>
                          <TableCell className="font-mono">{Number(l.greeks.theta).toFixed(6)}</TableCell>
                          <TableCell className="font-mono">{Number(l.greeks.rho).toFixed(6)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="greeks" className="mt-4 space-y-4">
            {!valuation ? null : (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2"><Sigma className="h-4 w-4" />Strategy Greeks</CardTitle>
                  <CardDescription>Unit greeks by leg and aggregated global greeks at valuation date.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {(() => {
                    // Aggregate global greeks with sign (buy/sell) and notional weight
                    const agg = valuation.legs.reduce(
                      (acc, l) => {
                        const notionalAbs = Math.abs(Number((l.inst as any).notional || 0));
                        const qtySign = Number((l.inst as any).quantity || 0) >= 0 ? 1 : -1;
                        const w = notionalAbs * qtySign;
                        acc.delta += (Number.isFinite(l.greeks.delta) ? l.greeks.delta : 0) * w;
                        acc.gamma += (Number.isFinite(l.greeks.gamma) ? l.greeks.gamma : 0) * w;
                        acc.vega += (Number.isFinite(l.greeks.vega) ? l.greeks.vega : 0) * w;
                        acc.theta += (Number.isFinite(l.greeks.theta) ? l.greeks.theta : 0) * w;
                        acc.rho += (Number.isFinite(l.greeks.rho) ? l.greeks.rho : 0) * w;
                        return acc;
                      },
                      { delta: 0, gamma: 0, vega: 0, theta: 0, rho: 0 }
                    );
                    return (
                      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                        <div className="rounded-md border p-3">
                          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Delta</div>
                          <div className="mt-1 font-mono text-sm">{agg.delta.toFixed(4)}</div>
                        </div>
                        <div className="rounded-md border p-3">
                          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Gamma</div>
                          <div className="mt-1 font-mono text-sm">{agg.gamma.toFixed(6)}</div>
                        </div>
                        <div className="rounded-md border p-3">
                          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Vega</div>
                          <div className="mt-1 font-mono text-sm">{agg.vega.toFixed(4)}</div>
                        </div>
                        <div className="rounded-md border p-3">
                          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Theta</div>
                          <div className="mt-1 font-mono text-sm">{agg.theta.toFixed(4)}</div>
                        </div>
                        <div className="rounded-md border p-3">
                          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Rho</div>
                          <div className="mt-1 font-mono text-sm">{agg.rho.toFixed(4)}</div>
                        </div>
                      </div>
                    );
                  })()}
                  <div className="overflow-x-auto">
                    <Table className="[&_th]:whitespace-nowrap [&_td]:whitespace-nowrap mt-2">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Leg</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Notional</TableHead>
                          <TableHead>Delta</TableHead>
                          <TableHead>Gamma</TableHead>
                          <TableHead>Vega</TableHead>
                          <TableHead>Theta</TableHead>
                          <TableHead>Rho</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {valuation.legs.map((l, idx) => (
                          <TableRow key={l.inst.id}>
                            <TableCell className="font-mono">{l.inst.optionIndex ?? idx}</TableCell>
                            <TableCell>{l.inst.type}</TableCell>
                            <TableCell className="font-mono">{Number((l.inst as any).notional || 0).toLocaleString()}</TableCell>
                            <TableCell className="font-mono">{Number(l.greeks.delta).toFixed(6)}</TableCell>
                            <TableCell className="font-mono">{Number(l.greeks.gamma).toFixed(6)}</TableCell>
                            <TableCell className="font-mono">{Number(l.greeks.vega).toFixed(6)}</TableCell>
                            <TableCell className="font-mono">{Number(l.greeks.theta).toFixed(6)}</TableCell>
                            <TableCell className="font-mono">{Number(l.greeks.rho).toFixed(6)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="instruments" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Instruments in this strategy</CardTitle>
                <CardDescription>Click a row to open instrument details.</CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table className="[&_th]:whitespace-nowrap [&_td]:whitespace-nowrap">
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Pair</TableHead>
                      <TableHead>Maturity</TableHead>
                      <TableHead>Notional</TableHead>
                      <TableHead>Counterparty</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {instruments
                      .slice()
                      .sort((a, b) => String(a.maturity).localeCompare(String(b.maturity)))
                      .map((inst) => (
                        <TableRow key={inst.id} className="cursor-pointer" onClick={() => navigate(`/hedging/${inst.id}`)}>
                          <TableCell className="font-mono">{inst.id}</TableCell>
                          <TableCell>{inst.type}</TableCell>
                          <TableCell className="font-mono">{inst.currency}</TableCell>
                          <TableCell className="font-mono">{inst.maturity}</TableCell>
                          <TableCell className="font-mono">{Number(inst.notional || 0).toLocaleString()}</TableCell>
                          <TableCell>{inst.counterparty || "—"}</TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

      </div>
    </Layout>
  );
}

