import { useState, useMemo, useEffect } from "react";
import { useRateData } from "@/hooks/useRateData";
import { useIRSData } from "@/hooks/useIRSData";
import { useCountriesBonds, useCountryYields } from "@/hooks/useBondsData";
import {
  bootstrap,
  bootstrapBonds,
  BootstrapPoint,
  BootstrapMethod,
  BootstrapResult,
  maturityToYears,
  priceToRate,
  exportToCSV,
  getBasisConvention,
} from "@/lib/rate-explorer/bootstrapping";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { DiscountFactorTable } from "./DiscountFactorTable";
import { BootstrapCurveChart } from "./BootstrapCurveChart";
import { Download, Calculator, RefreshCw, TrendingUp, Info, LayoutGrid, FileText } from "lucide-react";
import { toast } from "sonner";

const BOOTSTRAP_METHODS: { id: BootstrapMethod; name: string }[] = [
  { id: "cubic_spline", name: "Cubic Spline" },
  { id: "linear", name: "Linear" },
  { id: "nelson_siegel", name: "Nelson-Siegel" },
  { id: "bloomberg", name: "Bloomberg" },
  { id: "quantlib_log_linear", name: "QL Log-Linear" },
  { id: "quantlib_log_cubic", name: "QL Log-Cubic" },
];

// Currencies that have IRS/Futures data available
const IRS_FUTURES_CURRENCIES = ["USD", "EUR", "GBP", "CHF", "JPY"];

interface CurrencyRate {
  currency: string;
  source: "irs_futures" | "bonds";
  sourceName: string;
  result: BootstrapResult | null;
  isLoading: boolean;
  inputPointsCount: number;
  bankRate: number | null;
}

type ViewMode = "dashboard" | "detail";

export function AllRates() {
  const [viewMode, setViewMode] = useState<ViewMode>("dashboard");
  const [selectedCurrency, setSelectedCurrency] = useState<string>("");
  const [selectedMethod, setSelectedMethod] = useState<BootstrapMethod>("cubic_spline");
  
  // Fetch IRS/Futures for major currencies
  const usdFutures = useRateData("sofr");
  const eurFutures = useRateData("estr3m");
  const gbpFutures = useRateData("sonia");
  const chfFutures = useRateData("saron3m");
  const jpyFutures = useRateData("tona3m");
  
  const usdIRS = useIRSData("usd");
  const eurIRS = useIRSData("eur");
  const gbpIRS = useIRSData("gbp");
  const chfIRS = useIRSData("chf");
  const jpyIRS = useIRSData("jpy");
  
  // Fetch bonds data
  const countriesQuery = useCountriesBonds();
  
  // Auto-fetch countries on mount
  useEffect(() => {
    if (!countriesQuery.data && !countriesQuery.isFetching) {
      countriesQuery.refetch();
    }
  }, []);
  
  const countriesData = countriesQuery.data?.data || [];
  
  // Get all bond currencies EXCEPT major ones (since they use IRS/Futures)
  const bondOnlyCurrencies = useMemo(() => {
    const currencies = [...new Set(countriesData.map(c => c.currency))];
    return currencies.filter(c => !IRS_FUTURES_CURRENCIES.includes(c)).sort();
  }, [countriesData]);
  
  // Get best country per bond currency (highest rated or most liquid)
  const bestCountryByCurrency = useMemo(() => {
    const result: Record<string, string> = {};
    bondOnlyCurrencies.forEach(currency => {
      const countries = countriesData.filter(c => c.currency === currency);
      const best = countries.sort((a, b) => {
        if (a.rating && !b.rating) return -1;
        if (!a.rating && b.rating) return 1;
        if (a.rating && b.rating) return a.rating.localeCompare(b.rating);
        return 0;
      })[0];
      if (best) {
        result[currency] = best.countrySlug;
      }
    });
    return result;
  }, [countriesData, bondOnlyCurrencies]);
  
  // Hooks for bond yields (non-major currencies)
  // Since React hooks must be called unconditionally, we create hooks for common currencies
  const audYields = useCountryYields(bestCountryByCurrency["AUD"] || "");
  const cadYields = useCountryYields(bestCountryByCurrency["CAD"] || "");
  const nzdYields = useCountryYields(bestCountryByCurrency["NZD"] || "");
  const nokYields = useCountryYields(bestCountryByCurrency["NOK"] || "");
  const sekYields = useCountryYields(bestCountryByCurrency["SEK"] || "");
  const dkkYields = useCountryYields(bestCountryByCurrency["DKK"] || "");
  const plnYields = useCountryYields(bestCountryByCurrency["PLN"] || "");
  const czkYields = useCountryYields(bestCountryByCurrency["CZK"] || "");
  const hufYields = useCountryYields(bestCountryByCurrency["HUF"] || "");
  const mxnYields = useCountryYields(bestCountryByCurrency["MXN"] || "");
  const brlYields = useCountryYields(bestCountryByCurrency["BRL"] || "");
  const zarYields = useCountryYields(bestCountryByCurrency["ZAR"] || "");
  const cnyYields = useCountryYields(bestCountryByCurrency["CNY"] || "");
  const inrYields = useCountryYields(bestCountryByCurrency["INR"] || "");
  const krwYields = useCountryYields(bestCountryByCurrency["KRW"] || "");
  const sgdYields = useCountryYields(bestCountryByCurrency["SGD"] || "");
  const hkdYields = useCountryYields(bestCountryByCurrency["HKD"] || "");
  const tryYields = useCountryYields(bestCountryByCurrency["TRY"] || "");
  const zarBonds = useCountryYields(bestCountryByCurrency["ZAR"] || "");
  const thbYields = useCountryYields(bestCountryByCurrency["THB"] || "");
  const myrYields = useCountryYields(bestCountryByCurrency["MYR"] || "");
  const phpYields = useCountryYields(bestCountryByCurrency["PHP"] || "");
  const idrYields = useCountryYields(bestCountryByCurrency["IDR"] || "");
  const copYields = useCountryYields(bestCountryByCurrency["COP"] || "");
  const clpYields = useCountryYields(bestCountryByCurrency["CLP"] || "");
  const penYields = useCountryYields(bestCountryByCurrency["PEN"] || "");
  const ilsYields = useCountryYields(bestCountryByCurrency["ILS"] || "");
  const ronYields = useCountryYields(bestCountryByCurrency["RON"] || "");
  const madYields = useCountryYields(bestCountryByCurrency["MAD"] || "");
  const egpYields = useCountryYields(bestCountryByCurrency["EGP"] || "");
  const arsBonds = useCountryYields(bestCountryByCurrency["ARS"] || "");
  
  const bondYieldsMap: Record<string, ReturnType<typeof useCountryYields>> = {
    "AUD": audYields, "CAD": cadYields, "NZD": nzdYields, "NOK": nokYields,
    "SEK": sekYields, "DKK": dkkYields, "PLN": plnYields, "CZK": czkYields,
    "HUF": hufYields, "MXN": mxnYields, "BRL": brlYields, "ZAR": zarYields,
    "CNY": cnyYields, "INR": inrYields, "KRW": krwYields, "SGD": sgdYields,
    "HKD": hkdYields, "TRY": tryYields, "THB": thbYields, "MYR": myrYields,
    "PHP": phpYields, "IDR": idrYields, "COP": copYields, "CLP": clpYields,
    "PEN": penYields, "ILS": ilsYields, "RON": ronYields, "MAD": madYields,
    "EGP": egpYields, "ARS": arsBonds,
  };
  
  // Build bonds curve
  const buildBondsCurve = (
    currency: string,
    yieldsQuery: ReturnType<typeof useCountryYields>,
    countrySlug: string
  ): CurrencyRate => {
    const yieldsData = yieldsQuery.data?.data || [];
    const country = countriesData.find(c => c.countrySlug === countrySlug);
    
    const bondPoints: BootstrapPoint[] = yieldsData
      .filter(y => y.yield !== null && y.maturityYears > 0)
      .map(y => ({
        tenor: y.maturityYears,
        rate: (y.yield as number) / 100,
        source: 'bond' as const,
        priority: 1,
      }));
    
    let result: BootstrapResult | null = null;
    if (bondPoints.length >= 2) {
      result = bootstrapBonds(bondPoints, selectedMethod, currency);
    }
    
    // Get bank rate from country data
    const bankRate = country?.bankRate ?? null;
    
    return {
      currency,
      source: "bonds",
      sourceName: `Gov Bonds (${country?.country || countrySlug})`,
      result,
      isLoading: yieldsQuery.isLoading,
      inputPointsCount: bondPoints.length,
      bankRate,
    };
  };
  
  // Build IRS/Futures curve
  const buildIRSFuturesCurve = (
    currency: string,
    futuresData: ReturnType<typeof useRateData>["data"],
    irsData: ReturnType<typeof useIRSData>["data"],
    isLoading: boolean,
    countriesData: any[]
  ): CurrencyRate => {
    const swapPoints: BootstrapPoint[] = [];
    const futuresPoints: BootstrapPoint[] = [];
    
    if (futuresData?.data) {
      futuresData.data.forEach((item) => {
        const latestPrice = parseFloat(item.latest.replace(/[^0-9.-]/g, ""));
        if (!isNaN(latestPrice)) {
          const tenor = maturityToYears(item.maturity);
          const rate = priceToRate(latestPrice);
          if (tenor > 0 && rate > 0 && rate < 0.5) {
            futuresPoints.push({ tenor, rate, source: "futures", priority: 2 });
          }
        }
      });
    }
    
    if (irsData?.data) {
      irsData.data.forEach((item) => {
        if (item.rateValue > 0 && item.rateValue < 50) {
          swapPoints.push({ tenor: item.tenor, rate: item.rateValue / 100, source: "swap", priority: 1 });
        }
      });
    }
    
    const totalPoints = swapPoints.length + futuresPoints.length;
    let result: BootstrapResult | null = null;
    
    if (totalPoints >= 2) {
      result = bootstrap(swapPoints, futuresPoints, selectedMethod, currency);
    }
    
    // Get bank rate for major currencies (from countries data if available)
    // For USD, specifically use United States
    let countryData;
    if (currency === "USD") {
      countryData = countriesData.find(c => 
        c.currency === currency && 
        (c.country.toLowerCase().includes("united states") || 
         c.country.toLowerCase().includes("usa") ||
         c.country.toLowerCase() === "united states")
      );
    } else {
      countryData = countriesData.find(c => c.currency === currency);
    }
    const bankRate = countryData?.bankRate ?? null;
    
    return {
      currency,
      source: "irs_futures",
      sourceName: "IRS + Futures",
      result,
      isLoading,
      inputPointsCount: totalPoints,
      bankRate,
    };
  };
  
  // Build all rates (one per currency)
  const allRates: CurrencyRate[] = useMemo(() => {
    const rates: CurrencyRate[] = [];
    
    // IRS/Futures curves for major currencies (5 curves)
    rates.push(buildIRSFuturesCurve("USD", usdFutures.data, usdIRS.data, usdFutures.isLoading || usdIRS.isLoading, countriesData));
    rates.push(buildIRSFuturesCurve("EUR", eurFutures.data, eurIRS.data, eurFutures.isLoading || eurIRS.isLoading, countriesData));
    rates.push(buildIRSFuturesCurve("GBP", gbpFutures.data, gbpIRS.data, gbpFutures.isLoading || gbpIRS.isLoading, countriesData));
    rates.push(buildIRSFuturesCurve("CHF", chfFutures.data, chfIRS.data, chfFutures.isLoading || chfIRS.isLoading, countriesData));
    rates.push(buildIRSFuturesCurve("JPY", jpyFutures.data, jpyIRS.data, jpyFutures.isLoading || jpyIRS.isLoading, countriesData));
    
    // Bond curves for non-major currencies (one per currency)
    bondOnlyCurrencies.forEach(currency => {
      const countrySlug = bestCountryByCurrency[currency];
      const yieldsQuery = bondYieldsMap[currency];
      if (countrySlug && yieldsQuery) {
        rates.push(buildBondsCurve(currency, yieldsQuery, countrySlug));
      }
    });
    
    return rates;
  }, [
    selectedMethod,
    usdFutures.data, eurFutures.data, gbpFutures.data, chfFutures.data, jpyFutures.data,
    usdIRS.data, eurIRS.data, gbpIRS.data, chfIRS.data, jpyIRS.data,
    countriesData, bondOnlyCurrencies, bestCountryByCurrency,
    audYields.data, cadYields.data, nzdYields.data, nokYields.data, sekYields.data,
    dkkYields.data, plnYields.data, czkYields.data, hufYields.data, mxnYields.data,
    brlYields.data, zarYields.data, cnyYields.data, inrYields.data, krwYields.data,
    sgdYields.data, hkdYields.data, tryYields.data, thbYields.data, myrYields.data,
    phpYields.data, idrYields.data, copYields.data, clpYields.data, penYields.data,
    ilsYields.data, ronYields.data, madYields.data, egpYields.data, arsBonds.data,
  ]);
  
  // Filter rates with data
  const ratesWithData = allRates.filter(r => r.result !== null);
  
  // Get selected rate for detail view
  const selectedRate = selectedCurrency 
    ? allRates.find(r => r.currency === selectedCurrency)
    : null;
  
  const handleRefresh = () => {
    countriesQuery.refetch();
    usdFutures.refetch();
    eurFutures.refetch();
    gbpFutures.refetch();
    chfFutures.refetch();
    jpyFutures.refetch();
    usdIRS.refetch();
    eurIRS.refetch();
    gbpIRS.refetch();
    chfIRS.refetch();
    jpyIRS.refetch();
    // Refresh all bond yields
    Object.values(bondYieldsMap).forEach(yieldsQuery => {
      yieldsQuery.refetch();
    });
    toast.success("Rafraîchissement en cours...");
  };
  
  const handleExportCSV = (result: BootstrapResult) => {
    const csv = exportToCSV(result);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rate_curve_${result.currency}_${result.method}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Courbe exportée en CSV");
  };
  
  // Dashboard View
  if (viewMode === "dashboard") {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              All Rates - Une courbe par devise
            </CardTitle>
            <div className="flex items-center gap-2">
              <Select value={selectedMethod} onValueChange={(v) => setSelectedMethod(v as BootstrapMethod)}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BOOTSTRAP_METHODS.map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={() => setViewMode("detail")}>
                <FileText className="w-4 h-4 mr-2" />
                Vue Détail
              </Button>
              <Button variant="outline" size="sm" onClick={handleRefresh}>
                <RefreshCw className="w-4 h-4 mr-2" />
                Rafraîchir
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <Alert className="mb-4 bg-primary/5 border-primary/20">
              <Info className="h-4 w-4" />
              <AlertDescription>
                <strong>Une courbe par devise</strong> : IRS + Futures pour les devises majeures (USD, EUR, GBP, CHF, JPY) 
                et Gov Bonds pour toutes les autres devises.
                Total: {allRates.length} devises ({ratesWithData.length} avec données).
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
        
        {/* Rates Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          {allRates.map((rate) => (
            <Card 
              key={rate.currency} 
              className={`hover:border-primary/50 transition-colors cursor-pointer ${
                rate.source === "irs_futures" ? "border-l-4 border-l-blue-500" : "border-l-4 border-l-green-500"
              }`}
              onClick={() => {
                setSelectedCurrency(rate.currency);
                setViewMode("detail");
              }}
            >
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center justify-between">
                  <Badge variant="default" className="text-xl px-4 py-1">{rate.currency}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {rate.isLoading ? (
                  <div className="h-16 flex items-center justify-center">
                    <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
                  </div>
                ) : rate.result ? (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Source:</span>
                      <Badge 
                        variant="outline" 
                        className={rate.source === "irs_futures" 
                          ? "bg-blue-500/10 text-blue-600 border-blue-500/30 text-xs" 
                          : "bg-green-500/10 text-green-600 border-green-500/30 text-xs"
                        }
                      >
                        {rate.source === "irs_futures" ? "IRS/Fut" : "Bonds"}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Points:</span>
                      <span className="font-mono font-semibold">{rate.inputPointsCount}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Max tenor:</span>
                      <span className="font-mono font-semibold">
                        {Math.max(...rate.result.discountFactors.map(d => d.tenor))}Y
                      </span>
                    </div>
                    {rate.bankRate !== null && (
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Bank Rate:</span>
                        <span className="font-mono font-bold text-primary">
                          {rate.bankRate.toFixed(3)}%
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="h-16 flex items-center justify-center text-muted-foreground text-xs">
                    Données insuffisantes
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
        
        {/* Combined Chart */}
        {ratesWithData.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5" />
                Comparaison des Courbes de Taux ({selectedMethod})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <BootstrapCurveChart
                results={ratesWithData.map(r => r.result!)}
                inputPoints={[]}
                showInputPoints={false}
              />
            </CardContent>
          </Card>
        )}
      </div>
    );
  }
  
  // Detail View
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Calculator className="w-5 h-5" />
            All Rates - Vue Détail
          </CardTitle>
          <div className="flex items-center gap-2">
            <Select value={selectedCurrency || "_select"} onValueChange={(v) => setSelectedCurrency(v === "_select" ? "" : v)}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Devise..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_select">Choisir...</SelectItem>
                {allRates.map((r) => (
                  <SelectItem key={r.currency} value={r.currency}>
                    {r.currency}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedMethod} onValueChange={(v) => setSelectedMethod(v as BootstrapMethod)}>
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BOOTSTRAP_METHODS.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => setViewMode("dashboard")}>
              <LayoutGrid className="w-4 h-4 mr-2" />
              Dashboard
            </Button>
            <Button variant="outline" size="sm" onClick={handleRefresh}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Rafraîchir
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {selectedRate ? (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Badge variant="default" className="text-lg px-3">{selectedRate.currency}</Badge>
                <Badge 
                  variant="outline" 
                  className={selectedRate.source === "irs_futures" 
                    ? "bg-blue-500/10 text-blue-600 border-blue-500/30" 
                    : "bg-green-500/10 text-green-600 border-green-500/30"
                  }
                >
                  Source: {selectedRate.sourceName}
                </Badge>
                <Badge variant="secondary">{selectedRate.inputPointsCount} points</Badge>
                <Badge variant="outline">Convention: {getBasisConvention(selectedRate.currency).dayCount}</Badge>
              </div>
            </div>
          ) : (
            <div className="text-center text-muted-foreground py-8">
              Sélectionnez une devise pour voir les détails
            </div>
          )}
        </CardContent>
      </Card>
      
      {selectedRate?.result && (
        <>
          {/* Chart */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Courbe de Taux - {selectedRate.currency}</CardTitle>
              <Button variant="outline" size="sm" onClick={() => handleExportCSV(selectedRate.result!)}>
                <Download className="w-4 h-4 mr-2" />
                Export CSV
              </Button>
            </CardHeader>
            <CardContent>
              <BootstrapCurveChart
                results={[selectedRate.result]}
                inputPoints={[]}
                showInputPoints={false}
              />
            </CardContent>
          </Card>
          
          {/* Table */}
          <Card>
            <CardHeader>
              <CardTitle>Discount Factors - {selectedRate.currency}</CardTitle>
            </CardHeader>
            <CardContent>
              <DiscountFactorTable discountFactors={selectedRate.result.discountFactors} />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

