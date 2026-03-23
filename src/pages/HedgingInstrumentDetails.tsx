import React, { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, CalendarDays, Activity, Sigma } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import StrategyImportService, { HedgingInstrument } from "@/services/StrategyImportService";
import { PricingService } from "@/services/PricingService";
import PayoffChart from "@/components/PayoffChart";

const formatNum = (v: number | undefined, d = 4) => (v === undefined || !isFinite(v) ? "N/A" : v.toFixed(d));
const formatMoney = (v: number | undefined) =>
  v === undefined || !isFinite(v)
    ? "N/A"
    : new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

const DataField = ({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) => (
  <div className="rounded-md border bg-background/60 p-3">
    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
    <div className={`mt-1 text-sm font-medium ${mono ? "font-mono" : ""}`}>{value}</div>
  </div>
);

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

function toStrategyType(rawType: string): string {
  const t = normalizeType(rawType);
  if (t.includes("double") && t.includes("call") && (t.includes("knock-out") || t.includes("knockout"))) return "call-double-knockout";
  if (t.includes("double") && t.includes("put") && (t.includes("knock-out") || t.includes("knockout"))) return "put-double-knockout";
  if (t.includes("double") && t.includes("call") && (t.includes("knock-in") || t.includes("knockin"))) return "call-double-knockin";
  if (t.includes("double") && t.includes("put") && (t.includes("knock-in") || t.includes("knockin"))) return "put-double-knockin";
  if (t.includes("call") && t.includes("reverse") && (t.includes("knock-out") || t.includes("knockout"))) return "call-reverse-knockout";
  if (t.includes("put") && t.includes("reverse") && (t.includes("knock-out") || t.includes("knockout"))) return "put-reverse-knockout";
  if (t.includes("call") && (t.includes("knock-out") || t.includes("knockout"))) return "call-knockout";
  if (t.includes("put") && (t.includes("knock-out") || t.includes("knockout"))) return "put-knockout";
  if (t.includes("call") && (t.includes("knock-in") || t.includes("knockin"))) return "call-knockin";
  if (t.includes("put") && (t.includes("knock-in") || t.includes("knockin"))) return "put-knockin";
  if (t.includes("one-touch")) return "one-touch";
  if (t.includes("double-touch")) return "double-touch";
  if (t.includes("double-no-touch")) return "double-no-touch";
  if (t.includes("no-touch")) return "no-touch";
  if (t.includes("range-binary")) return "range-binary";
  if (t.includes("outside-binary")) return "outside-binary";
  if (t.includes("swap")) return "swap";
  if (t.includes("forward")) return "forward";
  if (t.includes("put")) return "put";
  return "call";
}

const HedgingInstrumentDetails = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const service = useMemo(() => StrategyImportService.getInstance(), []);
  const instrument = useMemo(
    () => service.getHedgingInstruments().find((x) => x.id === id),
    [service, id]
  );
  const portfolioName = useMemo(() => {
    if (!instrument?.portfolioId) return "N/A";
    return service.getPortfolios().find((p) => p.id === instrument.portfolioId)?.name ?? instrument.portfolioId;
  }, [instrument, service]);

  const [valuationDate, setValuationDate] = useState(new Date().toISOString().split("T")[0]);

  const valuation = useMemo(() => {
    if (!instrument) return null;
    const spot = Number(instrument.impliedSpotPrice || instrument.exportSpotPrice || 1);
    const r_d = Number(instrument.exportDomesticRate ?? 0) / 100;
    const r_f = Number(instrument.exportForeignRate ?? 0) / 100;
    const sigma = Number(instrument.impliedVolatility ?? instrument.volatility ?? instrument.exportVolatility ?? 15) / 100;
    const t = PricingService.calculateTimeToMaturity(instrument.maturity, valuationDate);
    const daysRemaining = Math.max(0, Math.round(t * 365.25));
    const K = Number(instrument.strike || spot);
    const rebate = Number(instrument.rebate ?? 100);
    const exportPrice = Number(instrument.realOptionPrice ?? instrument.premium ?? 0);
    const tNorm = normalizeType(instrument.type);
    let currentPrice = 0;

    if (t <= 0) {
      if (tNorm.includes("call")) currentPrice = Math.max(0, spot - K);
      else if (tNorm.includes("put")) currentPrice = Math.max(0, K - spot);
      else currentPrice = 0;
    } else if (tNorm === "forward" || tNorm === "swap") {
      const fwd = PricingService.calculateFXForwardPrice(spot, r_d, r_f, t);
      currentPrice = (fwd - K) * Math.exp(-r_d * t);
    } else {
      const barrierType = mapBarrierPricingType(instrument.type);
      if (barrierType && instrument.barrier != null) {
        currentPrice = PricingService.calculateBarrierOptionClosedForm(
          barrierType,
          PricingService.calculateFXForwardPrice(spot, r_d, r_f, t),
          K,
          r_d,
          t,
          sigma,
          instrument.barrier,
          instrument.secondBarrier,
          r_f
        );
      } else if (isDigitalType(instrument.type)) {
        currentPrice = PricingService.calculateDigitalOptionPrice(
          tNorm,
          spot,
          K,
          r_d,
          r_f,
          t,
          sigma,
          instrument.barrier,
          instrument.secondBarrier,
          0,
          rebate,
          true
        );
      } else {
        const vanilla = isVanillaType(instrument.type);
        if (vanilla) {
          currentPrice = PricingService.calculateGarmanKohlhagenPrice(vanilla, spot, K, r_d, r_f, t, sigma);
        }
      }
    }

    const mtmUnit = currentPrice - exportPrice;
    const quantityPct = Math.abs(Number(instrument.quantity ?? 100)) / 100;
    const mtmTotal = mtmUnit * Math.abs(Number(instrument.notional || 0)) * quantityPct;

    const greeksType =
      mapBarrierPricingType(instrument.type) ||
      (isDigitalType(instrument.type) ? normalizeType(instrument.type) : isVanillaType(instrument.type) || "call");
    const greeks = t > 0 && sigma > 0
      ? PricingService.calculateGreeks(greeksType, spot, K, r_d, r_f, t, sigma, instrument.barrier, instrument.secondBarrier, rebate)
      : { delta: 0, gamma: 0, theta: 0, vega: 0, rho: 0 };

    return { spot, r_d, r_f, sigma, t, daysRemaining, K, exportPrice, currentPrice, mtmUnit, mtmTotal, greeks };
  }, [instrument, valuationDate]);

  const chartCurrencyPair = useMemo(() => {
    if (!instrument?.currency) return { base: "BASE", quote: "QUOTE", symbol: "BASE/QUOTE" };
    const parts = instrument.currency.split("/");
    if (parts.length === 2) return { base: parts[0], quote: parts[1], symbol: instrument.currency };
    if (instrument.currency.length === 6) {
      return { base: instrument.currency.slice(0, 3), quote: instrument.currency.slice(3), symbol: `${instrument.currency.slice(0, 3)}/${instrument.currency.slice(3)}` };
    }
    return { base: "BASE", quote: "QUOTE", symbol: instrument.currency };
  }, [instrument?.currency]);

  const payoffContext = useMemo(() => {
    if (!instrument || !valuation) return null;
    const strategyLeg = {
      type: toStrategyType(instrument.type),
      strike: Number(instrument.strike || valuation.K || valuation.spot),
      strikeType: "absolute" as const,
      quantity: Number(instrument.quantity ?? 100),
      barrier: instrument.barrier,
      secondBarrier: instrument.secondBarrier,
      barrierType: "absolute" as const,
      rebate: Number(instrument.rebate ?? 100),
    };

    const buildPayoffData = (refSpot: number, premium: number) => {
      const minSpot = refSpot * 0.7;
      const maxSpot = refSpot * 1.3;
      const step = (maxSpot - minSpot) / 100;
      const rows: Array<{ price: number; payoff: number }> = [];
      const qty = Number(strategyLeg.quantity || 0) / 100;
      for (let p = minSpot; p <= maxSpot; p += step) {
        let payoff = PricingService.calculateStrategyPayoffAtPrice([strategyLeg], p, refSpot);
        // Align with Pricers: premium shifts P&L based on long/short direction.
        if (premium !== 0 && qty !== 0) {
          payoff += qty > 0 ? -premium : premium;
        }
        rows.push({ price: p, payoff });
      }
      return rows;
    };

    const buildPriceData = (ctx: { refSpot: number; r_d: number; r_f: number; sigma: number; t: number }) => {
      const minSpot = ctx.refSpot * 0.7;
      const maxSpot = ctx.refSpot * 1.3;
      const step = (maxSpot - minSpot) / 100;
      const rows: Array<{ spot: number; price: number; delta: number; gamma: number; theta: number; vega: number; rho: number }> = [];
      const t = Math.max(0, Number(ctx.t || 0));
      const sigma = Math.max(0, Number(ctx.sigma || 0));
      const r_d = Number(ctx.r_d || 0);
      const r_f = Number(ctx.r_f || 0);
      const strike = Number(strategyLeg.strike || ctx.refSpot);
      const rebate = Number(strategyLeg.rebate ?? 100);
      const qty = Number(strategyLeg.quantity || 0) / 100;
      const greeksType =
        mapBarrierPricingType(instrument.type) ||
        (isDigitalType(instrument.type) ? normalizeType(instrument.type) : isVanillaType(instrument.type) || "call");

      for (let s = minSpot; s <= maxSpot; s += step) {
        let price = 0;
        if (t > 0 && sigma > 0) {
          const barrierType = mapBarrierPricingType(instrument.type);
          if (strategyLeg.type === "forward" || strategyLeg.type === "swap") {
            const fwd = PricingService.calculateFXForwardPrice(s, r_d, r_f, t);
            price = strategyLeg.type === "forward" ? (fwd - strike) * Math.exp(-r_d * t) : fwd - strike;
          } else if (barrierType && instrument.barrier != null) {
            price = PricingService.calculateBarrierOptionClosedForm(
              barrierType,
              PricingService.calculateFXForwardPrice(s, r_d, r_f, t),
              strike,
              r_d,
              t,
              sigma,
              instrument.barrier,
              instrument.secondBarrier,
              r_f
            );
          } else if (isDigitalType(instrument.type)) {
            price = PricingService.calculateDigitalOptionPrice(
              normalizeType(instrument.type),
              s,
              strike,
              r_d,
              r_f,
              t,
              sigma,
              instrument.barrier,
              instrument.secondBarrier,
              0,
              rebate,
              true
            );
          } else {
            const vanilla = isVanillaType(instrument.type);
            if (vanilla) {
              price = PricingService.calculateGarmanKohlhagenPrice(vanilla, s, strike, r_d, r_f, t, sigma);
            }
          }
        }

        const greeks =
          t > 0 && sigma > 0
            ? PricingService.calculateGreeks(greeksType, s, strike, r_d, r_f, t, sigma, instrument.barrier, instrument.secondBarrier, rebate)
            : { delta: 0, gamma: 0, theta: 0, vega: 0, rho: 0 };

        rows.push({
          spot: Number(s.toFixed(6)),
          price: price * qty,
          delta: greeks.delta ?? 0,
          gamma: greeks.gamma ?? 0,
          theta: greeks.theta ?? 0,
          vega: greeks.vega ?? 0,
          rho: greeks.rho ?? 0,
        });
      }

      return rows;
    };

    const exportSpot = Number(instrument.exportSpotPrice || valuation.spot || 1);
    const currentSpot = Number(valuation.spot || 1);
    const exportPremium = Number(instrument.realOptionPrice ?? instrument.premium ?? 0);
    const currentPremium = Number(valuation.currentPrice || 0);
    const exportRd = Number(instrument.exportDomesticRate ?? valuation.r_d * 100) / 100;
    const exportRf = Number(instrument.exportForeignRate ?? valuation.r_f * 100) / 100;
    const exportSigma = Number(instrument.exportVolatility ?? valuation.sigma * 100) / 100;
    const exportT = Number(instrument.exportTimeToMaturity ?? valuation.t);

    return {
      strategy: [strategyLeg],
      exportSpot,
      currentSpot,
      exportPremium,
      currentPremium,
      exportData: buildPayoffData(exportSpot, exportPremium),
      currentData: buildPayoffData(currentSpot, currentPremium),
      exportPriceData: buildPriceData({ refSpot: exportSpot, r_d: exportRd, r_f: exportRf, sigma: exportSigma, t: exportT }),
      currentPriceData: buildPriceData({ refSpot: currentSpot, r_d: valuation.r_d, r_f: valuation.r_f, sigma: valuation.sigma, t: valuation.t }),
    };
  }, [instrument, valuation]);

  if (!instrument) {
    return (
      <Layout title="Instrument details" breadcrumbs={[{ label: "Hedging Instruments", href: "/hedging" }, { label: "Details" }]}>
        <div className="space-y-4">
          <Button variant="outline" onClick={() => navigate("/hedging")}><ArrowLeft className="h-4 w-4 mr-2" />Back</Button>
          <Card><CardContent className="pt-6">Instrument not found.</CardContent></Card>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Instrument details" breadcrumbs={[{ label: "Hedging Instruments", href: "/hedging" }, { label: instrument.id }]}>
      <div className="space-y-5">
        <div className="flex flex-col gap-3 rounded-lg border bg-gradient-to-r from-slate-50/80 to-background p-4 sm:flex-row sm:items-center sm:justify-between dark:from-slate-900/40">
          <Button variant="outline" onClick={() => navigate("/hedging")} className="w-fit">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div className="flex items-center gap-2 rounded-md border bg-background px-3 py-2">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Valuation date</span>
            <Input type="date" value={valuationDate} onChange={(e) => setValuationDate(e.target.value)} className="h-8 w-[170px]" />
          </div>
        </div>

        <Card className="overflow-hidden">
          <CardHeader className="border-b bg-muted/30">
            <CardTitle className="flex flex-wrap items-center gap-2 text-xl">
              {instrument.type}
              <Badge variant="outline">{instrument.currency}</Badge>
              {valuation && valuation.daysRemaining <= 0 ? (
                <Badge variant="destructive">Expired</Badge>
              ) : (
                <Badge className="bg-emerald-600">{valuation?.daysRemaining ?? 0} days left</Badge>
              )}
            </CardTitle>
            <CardDescription>{instrument.id}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
            <DataField label="Counterparty" value={instrument.counterparty || "N/A"} />
            <DataField label="Portfolio" value={portfolioName} />
            <DataField label="Maturity" value={instrument.maturity} mono />
            <DataField label="Days to maturity" value={valuation?.daysRemaining ?? "N/A"} mono />
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-4">
          <Card className="lg:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2"><Activity className="h-4 w-4" />Pricing snapshot</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <DataField label="Export price" value={formatNum(valuation?.exportPrice, 6)} mono />
              <DataField label="Current price" value={formatNum(valuation?.currentPrice, 6)} mono />
              <DataField label="MTM (unit)" value={formatNum(valuation?.mtmUnit, 6)} mono />
              <DataField label="MTM (total)" value={formatMoney(valuation?.mtmTotal)} mono />
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2"><Sigma className="h-4 w-4" />Greeks</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <DataField label="Delta" value={formatNum(valuation?.greeks.delta, 6)} mono />
              <DataField label="Gamma" value={formatNum(valuation?.greeks.gamma, 6)} mono />
              <DataField label="Vega" value={formatNum(valuation?.greeks.vega, 6)} mono />
              <DataField label="Theta" value={formatNum(valuation?.greeks.theta, 6)} mono />
              <DataField label="Rho" value={formatNum(valuation?.greeks.rho, 6)} mono />
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Current inputs used</CardTitle>
            <CardDescription>Inputs used for the live valuation and Greeks at selected date.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <DataField label="Spot" value={formatNum(valuation?.spot, 6)} mono />
            <DataField label="Domestic rate (%)" value={formatNum((valuation?.r_d ?? 0) * 100, 4)} mono />
            <DataField label="Foreign rate (%)" value={formatNum((valuation?.r_f ?? 0) * 100, 4)} mono />
            <DataField label="Volatility (%)" value={formatNum((valuation?.sigma ?? 0) * 100, 4)} mono />
            <DataField label="Strike" value={formatNum(valuation?.K, 6)} mono />
            <DataField label="TTM (years)" value={formatNum(valuation?.t, 6)} mono />
            <DataField label="Barrier 1" value={formatNum(instrument.barrier, 6)} mono />
            <DataField label="Barrier 2" value={formatNum(instrument.secondBarrier, 6)} mono />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Export / import metadata</CardTitle>
            <CardDescription>Traceability and source parameters from Strategy Builder import/export.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <DataField label="Export spot" value={formatNum(instrument.exportSpotPrice, 6)} mono />
            <DataField label="Export domestic rate (%)" value={formatNum(instrument.exportDomesticRate, 4)} mono />
            <DataField label="Export foreign rate (%)" value={formatNum(instrument.exportForeignRate, 4)} mono />
            <DataField label="Export volatility (%)" value={formatNum(instrument.exportVolatility, 4)} mono />
            <DataField label="Export TTM (years)" value={formatNum(instrument.exportTimeToMaturity, 6)} mono />
            <DataField label="Export forward" value={formatNum(instrument.exportForwardPrice, 6)} mono />
            <DataField label="Strategy start (export)" value={instrument.exportStrategyStartDate || "N/A"} mono />
            <DataField label="Hedging start (export)" value={instrument.exportHedgingStartDate || "N/A"} mono />
            <DataField label="Imported at" value={instrument.importedAt ? new Date(instrument.importedAt).toLocaleString() : "N/A"} />
            <DataField label="Strategy name" value={instrument.strategyName || "N/A"} />
            <DataField label="Quantity (%)" value={formatNum(instrument.quantity, 2)} mono />
            <DataField label="Notional" value={formatMoney(instrument.notional)} mono />
          </CardContent>
        </Card>

        {payoffContext && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Payoff analysis</CardTitle>
              <CardDescription>
                Compare old payoff (export) vs valuation-date payoff, in P&amp;L and FX Hedging formats.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="current">
                <TabsList className="mb-4">
                  <TabsTrigger value="current">Valuation date payoff</TabsTrigger>
                  <TabsTrigger value="export">Export payoff (old)</TabsTrigger>
                </TabsList>
                <TabsContent value="current">
                  <PayoffChart
                    data={payoffContext.currentData}
                    strategy={payoffContext.strategy}
                    spot={payoffContext.currentSpot}
                    currencyPair={chartCurrencyPair}
                    includePremium
                    showPremiumToggle
                    realPremium={payoffContext.currentPremium}
                    priceData={payoffContext.currentPriceData}
                  />
                </TabsContent>
                <TabsContent value="export">
                  <PayoffChart
                    data={payoffContext.exportData}
                    strategy={payoffContext.strategy}
                    spot={payoffContext.exportSpot}
                    currencyPair={chartCurrencyPair}
                    includePremium
                    showPremiumToggle
                    realPremium={payoffContext.exportPremium}
                    priceData={payoffContext.exportPriceData}
                  />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
};

export default HedgingInstrumentDetails;

