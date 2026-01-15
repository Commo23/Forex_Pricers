import { useState, useMemo, useEffect } from "react";
import { useRateData } from "@/hooks/useRateData";
import { useIRSData } from "@/hooks/useIRSData";
import { useCountriesBonds, useCountryYields } from "@/hooks/useBondsData";
import { CURRENCY_CONFIGS } from "@/lib/rate-explorer/currencyDefaults";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { DiscountFactorTable } from "./DiscountFactorTable";
import { BootstrapCurveChart } from "./BootstrapCurveChart";
import { Download, Calculator, RefreshCw, Layers, TrendingUp, Info, LayoutGrid, FileText } from "lucide-react";
import { toast } from "sonner";

const BOOTSTRAP_METHODS: { id: BootstrapMethod; name: string; description: string }[] = [
  { id: "linear", name: "Simple/Linéaire", description: "Interpolation linéaire" },
  { id: "cubic_spline", name: "Cubic Spline", description: "Splines cubiques naturelles" },
  { id: "nelson_siegel", name: "Nelson-Siegel", description: "Modèle paramétrique" },
  { id: "bloomberg", name: "Bloomberg", description: "Log-DF interpolation" },
  { id: "quantlib_log_linear", name: "QL Log-Linear", description: "Log(DF) linéaire" },
  { id: "quantlib_log_cubic", name: "QL Log-Cubic", description: "Log(DF) cubique" },
];

// Currencies that have IRS/Futures data available
const IRS_FUTURES_CURRENCIES = ["USD", "EUR", "GBP", "CHF", "JPY"];

interface CurrencyCurve {
  currency: string;
  source: "irs_futures" | "bonds";
  sourceName: string;
  result: BootstrapResult | null;
  isLoading: boolean;
  inputPointsCount: number;
}

type ViewMode = "dashboard" | "detail";

export function AllCurvesBootstrapping() {
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
  
  // Fetch bonds data for non-major currencies
  const countriesQuery = useCountriesBonds();
  
  // Auto-fetch countries on mount
  useEffect(() => {
    if (!countriesQuery.data && !countriesQuery.isFetching) {
      countriesQuery.refetch();
    }
  }, []);
  
  const countriesData = countriesQuery.data?.data || [];
  
  // Get ALL bond currencies (including major ones, so we can show both IRS/Futures and Bonds curves)
  const bondCurrencies = useMemo(() => {
    const currencies = [...new Set(countriesData.map(c => c.currency))];
    return currencies.sort();
  }, [countriesData]);
  
  // Get best country per bond currency (highest rated or most liquid)
  const bestCountryByCurrency = useMemo(() => {
    const result: Record<string, string> = {};
    bondCurrencies.forEach(currency => {
      const countries = countriesData.filter(c => c.currency === currency);
      // Pick by rating (AAA > AA+ > etc.) or by 10Y yield availability
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
  }, [countriesData, bondCurrencies]);
  
  // Dynamic hooks for bond yields - fetch for ALL currencies (including major ones)
  // Major currencies (also fetch bonds for comparison)
  const usdBonds = useCountryYields(bestCountryByCurrency["USD"] || "");
  const eurBonds = useCountryYields(bestCountryByCurrency["EUR"] || "");
  const gbpBonds = useCountryYields(bestCountryByCurrency["GBP"] || "");
  const chfBonds = useCountryYields(bestCountryByCurrency["CHF"] || "");
  const jpyBonds = useCountryYields(bestCountryByCurrency["JPY"] || "");
  
  // Other currencies
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
  
  // Build dynamic map for all currencies
  const bondYieldsMap: Record<string, ReturnType<typeof useCountryYields>> = useMemo(() => {
    const map: Record<string, ReturnType<typeof useCountryYields>> = {
      // Major currencies
      "USD": usdBonds, "EUR": eurBonds, "GBP": gbpBonds, "CHF": chfBonds, "JPY": jpyBonds,
      // Other currencies
      "AUD": audYields, "CAD": cadYields, "NZD": nzdYields, "NOK": nokYields,
      "SEK": sekYields, "DKK": dkkYields, "PLN": plnYields, "CZK": czkYields,
      "HUF": hufYields, "MXN": mxnYields, "BRL": brlYields, "ZAR": zarYields,
      "CNY": cnyYields, "INR": inrYields, "KRW": krwYields, "SGD": sgdYields,
      "HKD": hkdYields, "TRY": tryYields,
    };
    
    // Add all other currencies dynamically from bondCurrencies
    bondCurrencies.forEach(currency => {
      if (!map[currency] && bestCountryByCurrency[currency]) {
        // For currencies not in the static list, we'll need to fetch them
        // For now, we'll skip them or add them manually if needed
      }
    });
    
    return map;
  }, [
    usdBonds, eurBonds, gbpBonds, chfBonds, jpyBonds,
    audYields, cadYields, nzdYields, nokYields, sekYields,
    dkkYields, plnYields, czkYields, hufYields, mxnYields,
    brlYields, zarYields, cnyYields, inrYields, krwYields,
    sgdYields, hkdYields, tryYields,
    bondCurrencies, bestCountryByCurrency,
  ]);
  
  // Build IRS/Futures curves
  const buildIRSFuturesCurve = (
    currency: string,
    futuresData: ReturnType<typeof useRateData>["data"],
    irsData: ReturnType<typeof useIRSData>["data"],
    isLoading: boolean
  ): CurrencyCurve => {
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
    
    return {
      currency,
      source: "irs_futures",
      sourceName: "IRS + Futures",
      result,
      isLoading,
      inputPointsCount: totalPoints,
    };
  };
  
  // Build bonds curve
  const buildBondsCurve = (
    currency: string,
    yieldsQuery: ReturnType<typeof useCountryYields>,
    countrySlug: string
  ): CurrencyCurve => {
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
    
    return {
      currency,
      source: "bonds",
      sourceName: `Gov Bonds (${country?.country || countrySlug})`,
      result,
      isLoading: yieldsQuery.isLoading,
      inputPointsCount: bondPoints.length,
    };
  };
  
  // Build all curves
  const allCurves: CurrencyCurve[] = useMemo(() => {
    const curves: CurrencyCurve[] = [];
    
    // IRS/Futures curves for major currencies
    curves.push(buildIRSFuturesCurve("USD", usdFutures.data, usdIRS.data, usdFutures.isLoading || usdIRS.isLoading));
    curves.push(buildIRSFuturesCurve("EUR", eurFutures.data, eurIRS.data, eurFutures.isLoading || eurIRS.isLoading));
    curves.push(buildIRSFuturesCurve("GBP", gbpFutures.data, gbpIRS.data, gbpFutures.isLoading || gbpIRS.isLoading));
    curves.push(buildIRSFuturesCurve("CHF", chfFutures.data, chfIRS.data, chfFutures.isLoading || chfIRS.isLoading));
    curves.push(buildIRSFuturesCurve("JPY", jpyFutures.data, jpyIRS.data, jpyFutures.isLoading || jpyIRS.isLoading));
    
    // Bond curves for ALL currencies (including major ones, so we have both IRS/Futures and Bonds)
    // We'll build bonds curves for all currencies that have data available
    bondCurrencies.forEach(currency => {
      const countrySlug = bestCountryByCurrency[currency];
      const yieldsQuery = bondYieldsMap[currency];
      // Only add if we have a country slug and yields query (even if data is still loading)
      if (countrySlug && yieldsQuery) {
        curves.push(buildBondsCurve(currency, yieldsQuery, countrySlug));
      }
    });
    
    return curves;
  }, [
    selectedMethod,
    usdFutures.data, eurFutures.data, gbpFutures.data, chfFutures.data, jpyFutures.data,
    usdIRS.data, eurIRS.data, gbpIRS.data, chfIRS.data, jpyIRS.data,
    bondCurrencies, bestCountryByCurrency, bondYieldsMap,
    usdBonds.data, eurBonds.data, gbpBonds.data, chfBonds.data, jpyBonds.data,
    audYields.data, cadYields.data, nzdYields.data, nokYields.data, sekYields.data,
    dkkYields.data, plnYields.data, czkYields.data, hufYields.data, mxnYields.data,
    brlYields.data, zarYields.data, cnyYields.data, inrYields.data, krwYields.data,
    sgdYields.data, hkdYields.data, tryYields.data,
  ]);
  
  // Filter curves with data
  const curvesWithData = allCurves.filter(c => c.result !== null);
  
  // Get selected curve for detail view
  const selectedCurve = selectedCurrency 
    ? allCurves.find(c => c.currency === selectedCurrency)
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
    a.download = `all_curves_${result.currency}_${result.method}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Discount factors exportés");
  };
  
  // Dashboard View
  if (viewMode === "dashboard") {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Layers className="w-5 h-5" />
              All Curves - Vue Dashboard
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
                Cette vue affiche toutes les courbes bootstrappées : <strong>IRS + Futures</strong> pour les devises majeures (USD, EUR, GBP, CHF, JPY) 
                et <strong>Gov Bonds</strong> pour toutes les devises disponibles (y compris les devises majeures pour comparaison).
                Total: {allCurves.length} courbes ({curvesWithData.length} avec données).
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
        
        {/* Curves Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {allCurves.map((curve) => (
            <Card 
              key={curve.currency} 
              className={`hover:border-primary/50 transition-colors cursor-pointer ${
                curve.source === "irs_futures" ? "border-l-4 border-l-primary" : "border-l-4 border-l-amber-500"
              }`}
              onClick={() => {
                setSelectedCurrency(curve.currency);
                setViewMode("detail");
              }}
            >
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between">
                  <Badge variant="default" className="text-lg px-3">{curve.currency}</Badge>
                  <Badge 
                    variant="outline" 
                    className={curve.source === "irs_futures" 
                      ? "bg-primary/10 text-primary border-primary/30" 
                      : "bg-amber-500/10 text-amber-600 border-amber-500/30"
                    }
                  >
                    {curve.source === "irs_futures" ? "IRS/Futures" : "Gov Bonds"}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {curve.isLoading ? (
                  <div className="h-20 flex items-center justify-center">
                    <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : curve.result ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Points:</span>
                      <span className="font-mono">{curve.inputPointsCount}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Max tenor:</span>
                      <span className="font-mono">
                        {Math.max(...curve.result.discountFactors.map(d => d.tenor))}Y
                      </span>
                    </div>
                    {curve.result.discountFactors.length > 0 && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">10Y Zero:</span>
                        <span className="font-mono text-primary">
                          {(curve.result.discountFactors.find(d => d.tenor === 10)?.zeroRate ?? 
                            curve.result.discountFactors[Math.floor(curve.result.discountFactors.length / 2)]?.zeroRate ?? 0
                          ).toFixed(2)}%
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="h-20 flex items-center justify-center text-muted-foreground text-sm">
                    Données insuffisantes
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
        
        {/* Combined Chart */}
        {curvesWithData.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5" />
                Comparaison des Courbes ({selectedMethod})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <BootstrapCurveChart
                results={curvesWithData.map(c => c.result!)}
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
            All Curves - Vue Détail
          </CardTitle>
          <div className="flex items-center gap-2">
            <Select value={selectedCurrency || "_select"} onValueChange={(v) => setSelectedCurrency(v === "_select" ? "" : v)}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Devise..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_select">Choisir...</SelectItem>
                {allCurves.map((c) => (
                  <SelectItem key={c.currency} value={c.currency}>
                    <div className="flex items-center gap-2">
                      <span>{c.currency}</span>
                      <Badge variant="outline" className="text-xs">
                        {c.source === "irs_futures" ? "IRS" : "Bonds"}
                      </Badge>
                    </div>
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
          {selectedCurve ? (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Badge variant="default" className="text-lg px-3">{selectedCurve.currency}</Badge>
                <Badge 
                  variant="outline" 
                  className={selectedCurve.source === "irs_futures" 
                    ? "bg-primary/10 text-primary border-primary/30" 
                    : "bg-amber-500/10 text-amber-600 border-amber-500/30"
                  }
                >
                  Source: {selectedCurve.sourceName}
                </Badge>
                <Badge variant="secondary">{selectedCurve.inputPointsCount} points</Badge>
                <Badge variant="outline">Convention: {getBasisConvention(selectedCurve.currency).dayCount}</Badge>
              </div>
              
              {selectedCurve.source === "bonds" && (
                <Alert className="bg-amber-500/10 border-amber-500/30">
                  <Info className="h-4 w-4 text-amber-600" />
                  <AlertDescription className="text-amber-700 dark:text-amber-400">
                    Courbe construite à partir des <strong>obligations gouvernementales</strong>. 
                    Pour une meilleure précision sur les devises majeures, utilisez l'onglet "Bootstrapping".
                  </AlertDescription>
                </Alert>
              )}
            </div>
          ) : (
            <div className="text-center text-muted-foreground py-8">
              Sélectionnez une devise pour voir les détails
            </div>
          )}
        </CardContent>
      </Card>
      
      {selectedCurve?.result && (
        <>
          {/* Chart */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Courbe de Taux - {selectedCurve.currency}</CardTitle>
              <Button variant="outline" size="sm" onClick={() => handleExportCSV(selectedCurve.result!)}>
                <Download className="w-4 h-4 mr-2" />
                Export CSV
              </Button>
            </CardHeader>
            <CardContent>
              <BootstrapCurveChart
                results={[selectedCurve.result]}
                inputPoints={[]}
                showInputPoints={false}
              />
            </CardContent>
          </Card>
          
          {/* Table */}
          <Card>
            <CardHeader>
              <CardTitle>Discount Factors - {selectedCurve.currency}</CardTitle>
            </CardHeader>
            <CardContent>
              <DiscountFactorTable discountFactors={selectedCurve.result.discountFactors} />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

