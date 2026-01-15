import { useState, useMemo, useCallback } from "react";
import { useRateData } from "@/hooks/useRateData";
import { useIRSData } from "@/hooks/useIRSData";
import { RATE_INDICES } from "@/lib/rate-explorer/rateIndices";
import { IRS_INDICES } from "@/lib/rate-explorer/irsIndices";
import { CURRENCY_CONFIGS, CurrencyConfig } from "@/lib/rate-explorer/currencyDefaults";
import { getCacheAge, clearAllCache } from "@/lib/rate-explorer/dataCache";
import {
  bootstrap,
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
import { DiscountFactorTable } from "./DiscountFactorTable";
import { BootstrapCurveChart } from "./BootstrapCurveChart";
import { BootstrappingDocumentation } from "./BootstrappingDocumentation";
import { Download, Calculator, TrendingUp, Settings2, RefreshCw, Plus, X, Clock, Layers, BookOpen } from "lucide-react";
import { toast } from "sonner";

const BOOTSTRAP_METHODS: { id: BootstrapMethod; name: string; description: string; category: 'standard' | 'bloomberg' | 'quantlib' }[] = [
  { id: "linear", name: "Simple/Linear", description: "Linear interpolation between points", category: 'standard' },
  { id: "cubic_spline", name: "Cubic Spline", description: "Natural cubic spline interpolation", category: 'standard' },
  { id: "nelson_siegel", name: "Nelson-Siegel", description: "4-parameter parametric model (β₀, β₁, β₂, λ)", category: 'standard' },
  { id: "bloomberg", name: "Bloomberg", description: "Log-DF interpolation + forward smoothing + monotonicity", category: 'bloomberg' },
  { id: "quantlib_log_linear", name: "QuantLib Log-Linear", description: "PiecewiseLogLinearDiscount - Linear on log(DF)", category: 'quantlib' },
  { id: "quantlib_log_cubic", name: "QuantLib Log-Cubic", description: "PiecewiseLogCubicDiscount - Cubic spline on log(DF)", category: 'quantlib' },
  { id: "quantlib_linear_forward", name: "QuantLib Linear Forward", description: "PiecewiseLinearForward - Linear on forwards", category: 'quantlib' },
  { id: "quantlib_monotonic_convex", name: "QuantLib Monotonic Convex", description: "Hagan-West monotonic convex - Preserves forward monotonicity", category: 'quantlib' },
];

interface CurveConfig {
  id: string;
  currency: string;
  futuresIndex: string;
  irsCurrency: string;
  useFutures: boolean;
  useIRS: boolean;
}

function generateCurveId(): string {
  return `curve_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function getDefaultCurveConfig(currencyConfig: CurrencyConfig): CurveConfig {
  return {
    id: generateCurveId(),
    currency: currencyConfig.currency,
    futuresIndex: currencyConfig.defaultFuturesIndex,
    irsCurrency: currencyConfig.defaultIRSCurrency,
    useFutures: true,
    useIRS: true,
  };
}

export function BootstrappingDashboard() {
  const [curves, setCurves] = useState<CurveConfig[]>([
    getDefaultCurveConfig(CURRENCY_CONFIGS[0]),
  ]);
  const [comparisonMode, setComparisonMode] = useState(false);
  const [selectedMethods, setSelectedMethods] = useState<BootstrapMethod[]>(["linear", "cubic_spline"]);

  const activeCurve = curves[0];

  const uniqueFuturesIndices = [...new Set(curves.map(c => c.futuresIndex))];
  const uniqueIRSCurrencies = [...new Set(curves.map(c => c.irsCurrency))];

  const futuresQueriesMap = new Map<string, ReturnType<typeof useRateData>>();
  const irsQueriesMap = new Map<string, ReturnType<typeof useIRSData>>();

  const futuresQuery0 = useRateData(uniqueFuturesIndices[0] || "");
  const futuresQuery1 = useRateData(uniqueFuturesIndices[1] || "");
  const futuresQuery2 = useRateData(uniqueFuturesIndices[2] || "");
  
  const irsQuery0 = useIRSData(uniqueIRSCurrencies[0] || "");
  const irsQuery1 = useIRSData(uniqueIRSCurrencies[1] || "");
  const irsQuery2 = useIRSData(uniqueIRSCurrencies[2] || "");

  if (uniqueFuturesIndices[0]) futuresQueriesMap.set(uniqueFuturesIndices[0], futuresQuery0);
  if (uniqueFuturesIndices[1]) futuresQueriesMap.set(uniqueFuturesIndices[1], futuresQuery1);
  if (uniqueFuturesIndices[2]) futuresQueriesMap.set(uniqueFuturesIndices[2], futuresQuery2);
  
  if (uniqueIRSCurrencies[0]) irsQueriesMap.set(uniqueIRSCurrencies[0], irsQuery0);
  if (uniqueIRSCurrencies[1]) irsQueriesMap.set(uniqueIRSCurrencies[1], irsQuery1);
  if (uniqueIRSCurrencies[2]) irsQueriesMap.set(uniqueIRSCurrencies[2], irsQuery2);

  const getFuturesQuery = (index: string) => futuresQueriesMap.get(index) || futuresQuery0;
  const getIRSQuery = (currency: string) => irsQueriesMap.get(currency) || irsQuery0;

  const curveResults = useMemo(() => {
    return curves.map((curve) => {
      const futuresQuery = getFuturesQuery(curve.futuresIndex);
      const irsQuery = getIRSQuery(curve.irsCurrency);
      const futuresData = futuresQuery.data;
      const irsData = irsQuery.data;
      const isLoading = futuresQuery.isLoading || irsQuery.isLoading;

      const swapPoints: BootstrapPoint[] = [];
      const futuresPoints: BootstrapPoint[] = [];

      if (curve.useFutures && futuresData?.data) {
        futuresData.data.forEach((item) => {
          const latestPrice = parseFloat(item.latest.replace(/[^0-9.-]/g, ""));
          if (!isNaN(latestPrice)) {
            const tenor = maturityToYears(item.maturity);
            const rate = priceToRate(latestPrice);
            if (tenor > 0 && rate > 0 && rate < 0.5) {
              futuresPoints.push({ 
                tenor, 
                rate, 
                source: "futures",
                priority: 2,
              });
            }
          }
        });
      }

      if (curve.useIRS && irsData?.data) {
        irsData.data.forEach((item) => {
          if (item.rateValue > 0 && item.rateValue < 50) {
            swapPoints.push({
              tenor: item.tenor,
              rate: item.rateValue / 100,
              source: "swap",
              priority: 1,
            });
          }
        });
      }

      const allInputPoints = [...swapPoints, ...futuresPoints].sort((a, b) => a.tenor - b.tenor);

      const results: BootstrapResult[] = 
        swapPoints.length === 0 && futuresPoints.length === 0 
          ? [] 
          : selectedMethods.map((method) => bootstrap(swapPoints, futuresPoints, method, curve.currency));

      return {
        curve,
        swapPoints,
        futuresPoints,
        allInputPoints,
        results,
        isLoading,
        basisConvention: getBasisConvention(curve.currency),
      };
    });
  }, [curves, selectedMethods]);

  const addCurve = () => {
    const usedCurrencies = new Set(curves.map(c => c.currency));
    const availableCurrency = CURRENCY_CONFIGS.find(cc => !usedCurrencies.has(cc.currency));
    
    if (availableCurrency) {
      setCurves([...curves, getDefaultCurveConfig(availableCurrency)]);
      setComparisonMode(true);
    } else {
      toast.error("All currencies already added");
    }
  };

  const removeCurve = (id: string) => {
    if (curves.length > 1) {
      setCurves(curves.filter(c => c.id !== id));
      if (curves.length === 2) {
        setComparisonMode(false);
      }
    }
  };

  const updateCurve = (id: string, updates: Partial<CurveConfig>) => {
    setCurves(curves.map(c => {
      if (c.id !== id) return c;
      
      if (updates.currency && updates.currency !== c.currency) {
        const config = CURRENCY_CONFIGS.find(cc => cc.currency === updates.currency);
        if (config) {
          return {
            ...c,
            currency: config.currency,
            futuresIndex: config.defaultFuturesIndex,
            irsCurrency: config.defaultIRSCurrency,
          };
        }
      }
      
      return { ...c, ...updates };
    }));
  };

  const toggleMethod = (method: BootstrapMethod) => {
    setSelectedMethods((prev) =>
      prev.includes(method)
        ? prev.filter((m) => m !== method)
        : [...prev, method]
    );
  };

  const handleExportCSV = (result: BootstrapResult) => {
    const csv = exportToCSV(result);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `discount_factors_${result.method}_${result.currency}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Discount factors exported to CSV");
  };

  const handleClearCache = () => {
    clearAllCache();
    toast.success("Cache cleared - data will be refreshed");
    Array.from(futuresQueriesMap.values()).forEach(q => q.refetch());
    Array.from(irsQueriesMap.values()).forEach(q => q.refetch());
  };

  const isLoading = curveResults.some(r => r.isLoading);
  const activeResult = curveResults[0];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Settings2 className="w-5 h-5" />
            Bootstrapping Configuration
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setComparisonMode(!comparisonMode)}
              className={comparisonMode ? "bg-primary/10" : ""}
            >
              <Layers className="w-4 h-4 mr-2" />
              {comparisonMode ? "Comparison Mode" : "Compare"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearCache}
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Clear Cache
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4 mb-6">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Rate Curves
              </h3>
              {curves.length < CURRENCY_CONFIGS.length && (
                <Button variant="outline" size="sm" onClick={addCurve}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Curve
                </Button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {curves.map((curve, idx) => {
                const currencyConfig = CURRENCY_CONFIGS.find(c => c.currency === curve.currency);
                const futuresCacheAge = getCacheAge(curve.futuresIndex, "rates");
                const irsCacheAge = getCacheAge(curve.irsCurrency, "irs");

                return (
                  <div
                    key={curve.id}
                    className="p-4 border rounded-lg bg-card relative"
                  >
                    {curves.length > 1 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="absolute top-2 right-2 h-6 w-6"
                        onClick={() => removeCurve(curve.id)}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    )}

                    <div className="space-y-3">
                      <Select
                        value={curve.currency}
                        onValueChange={(value) => updateCurve(curve.id, { currency: value })}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Currency" />
                        </SelectTrigger>
                        <SelectContent>
                          {CURRENCY_CONFIGS.map((config) => (
                            <SelectItem 
                              key={config.currency} 
                              value={config.currency}
                              disabled={curves.some(c => c.id !== curve.id && c.currency === config.currency)}
                            >
                              {config.currency} - {config.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {currencyConfig && (
                        <p className="text-xs text-muted-foreground">
                          {currencyConfig.description}
                        </p>
                      )}

                      <div className="space-y-3 pt-2 border-t">
                        <div className="space-y-1">
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id={`futures-${curve.id}`}
                              checked={curve.useFutures}
                              onCheckedChange={(checked) => 
                                updateCurve(curve.id, { useFutures: checked === true })
                              }
                            />
                            <Label htmlFor={`futures-${curve.id}`} className="text-xs text-muted-foreground">Futures</Label>
                          </div>
                          <Select
                            value={curve.futuresIndex}
                            onValueChange={(value) => updateCurve(curve.id, { futuresIndex: value })}
                          >
                            <SelectTrigger className="h-8 text-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {RATE_INDICES.map((idx) => (
                                <SelectItem key={idx.id} value={idx.id}>
                                  {idx.name} ({idx.currency})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {futuresCacheAge && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {futuresCacheAge}
                            </span>
                          )}
                        </div>

                        <div className="space-y-1">
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id={`irs-${curve.id}`}
                              checked={curve.useIRS}
                              onCheckedChange={(checked) => 
                                updateCurve(curve.id, { useIRS: checked === true })
                              }
                            />
                            <Label htmlFor={`irs-${curve.id}`} className="text-xs text-muted-foreground">IRS Swaps</Label>
                          </div>
                          <Select
                            value={curve.irsCurrency}
                            onValueChange={(value) => updateCurve(curve.id, { irsCurrency: value })}
                          >
                            <SelectTrigger className="h-8 text-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {IRS_INDICES.map((idx) => (
                                <SelectItem key={idx.id} value={idx.id}>
                                  {idx.name} ({idx.currency})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {irsCacheAge && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {irsCacheAge}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2 pt-2">
                        <Badge variant="default" className="text-xs">
                          {curveResults[idx]?.swapPoints.length || 0} swaps
                        </Badge>
                        <Badge variant="secondary" className="text-xs">
                          {curveResults[idx]?.futuresPoints.length || 0} futures
                        </Badge>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="space-y-4 pt-4 border-t">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Bootstrapping Methods
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-3">
                <h4 className="text-xs font-medium text-primary uppercase">Standard</h4>
                {BOOTSTRAP_METHODS.filter(m => m.category === 'standard').map((method) => (
                  <div key={method.id} className="flex items-start space-x-2">
                    <Checkbox
                      id={method.id}
                      checked={selectedMethods.includes(method.id)}
                      onCheckedChange={() => toggleMethod(method.id)}
                    />
                    <div className="grid gap-0.5">
                      <Label htmlFor={method.id} className="font-medium text-sm">
                        {method.name}
                      </Label>
                      <p className="text-xs text-muted-foreground leading-tight">
                        {method.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-3">
                <h4 className="text-xs font-medium text-blue-500 uppercase">Bloomberg</h4>
                {BOOTSTRAP_METHODS.filter(m => m.category === 'bloomberg').map((method) => (
                  <div key={method.id} className="flex items-start space-x-2">
                    <Checkbox
                      id={method.id}
                      checked={selectedMethods.includes(method.id)}
                      onCheckedChange={() => toggleMethod(method.id)}
                    />
                    <div className="grid gap-0.5">
                      <Label htmlFor={method.id} className="font-medium text-sm">
                        {method.name}
                      </Label>
                      <p className="text-xs text-muted-foreground leading-tight">
                        {method.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-3">
                <h4 className="text-xs font-medium text-green-500 uppercase">QuantLib</h4>
                {BOOTSTRAP_METHODS.filter(m => m.category === 'quantlib').map((method) => (
                  <div key={method.id} className="flex items-start space-x-2">
                    <Checkbox
                      id={method.id}
                      checked={selectedMethods.includes(method.id)}
                      onCheckedChange={() => toggleMethod(method.id)}
                    />
                    <div className="grid gap-0.5">
                      <Label htmlFor={method.id} className="font-medium text-sm">
                        {method.name}
                      </Label>
                      <p className="text-xs text-muted-foreground leading-tight">
                        {method.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {activeResult && (
            <div className="flex flex-wrap gap-4 mt-6 pt-6 border-t text-sm">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Convention ({activeCurve.currency}):</span>
                <Badge variant="outline">{activeResult.basisConvention.dayCount}</Badge>
                <Badge variant="outline">{activeResult.basisConvention.compounding}</Badge>
                <Badge variant="outline">{activeResult.basisConvention.paymentFrequency}x/year</Badge>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {isLoading ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Calculator className="w-12 h-12 mx-auto mb-4 text-muted-foreground animate-pulse" />
            <p className="text-muted-foreground">Loading data...</p>
          </CardContent>
        </Card>
      ) : activeResult && activeResult.allInputPoints.length < 2 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <TrendingUp className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">
              Select at least one data source to perform bootstrapping
            </p>
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="chart" className="space-y-4">
          <TabsList>
            <TabsTrigger value="chart">Curves</TabsTrigger>
            <TabsTrigger value="discount_factors">Discount Factors</TabsTrigger>
            <TabsTrigger value="input_data">Input Data</TabsTrigger>
            <TabsTrigger value="documentation">Documentation</TabsTrigger>
          </TabsList>

          <TabsContent value="chart">
            <Card>
              <CardHeader>
                <CardTitle>
                  Bootstrapped Rate Curves ({activeCurve.currency})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <BootstrapCurveChart
                  results={activeResult?.results || []}
                  inputPoints={activeResult?.allInputPoints || []}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="discount_factors" className="space-y-4">
            {(activeResult?.results || []).map((result, idx) => (
              <Card key={`${result.method}-${result.currency}-${idx}`}>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-base">
                      {BOOTSTRAP_METHODS.find((m) => m.id === result.method)?.name}
                      <Badge variant="outline" className="ml-2">{result.currency}</Badge>
                      <span className="ml-2 text-sm font-normal text-muted-foreground">
                        ({result.basisConvention.dayCount}, {result.basisConvention.compounding})
                      </span>
                    </CardTitle>
                    {result.parameters && (
                      <p className="text-xs text-muted-foreground mt-1">
                        β₀={result.parameters.beta0.toFixed(4)}, 
                        β₁={result.parameters.beta1.toFixed(4)}, 
                        β₂={result.parameters.beta2.toFixed(4)}, 
                        λ={result.parameters.lambda.toFixed(4)}
                      </p>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleExportCSV(result)}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Export CSV
                  </Button>
                </CardHeader>
                <CardContent>
                  <DiscountFactorTable discountFactors={result.discountFactors} />
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="input_data">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  Input Data Points
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="mb-4 p-3 bg-muted/50 rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    <strong>Swaps</strong> = Exact calibration points (forced) | 
                    <strong> Futures</strong> = Guides between swaps (adjusted if necessary)
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="py-3 px-4 text-left font-medium text-muted-foreground">Tenor (Y)</th>
                        <th className="py-3 px-4 text-right font-medium text-muted-foreground">Rate (%)</th>
                        <th className="py-3 px-4 text-center font-medium text-muted-foreground">Source</th>
                        <th className="py-3 px-4 text-center font-medium text-muted-foreground">Priority</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeResult?.allInputPoints.map((point, pidx) => (
                        <tr key={pidx} className="border-b border-border/50 hover:bg-muted/50">
                          <td className="py-2 px-4 font-mono">{point.tenor.toFixed(2)}</td>
                          <td className="py-2 px-4 text-right font-mono">{(point.rate * 100).toFixed(4)}%</td>
                          <td className="py-2 px-4 text-center">
                            <Badge 
                              variant={point.source === "swap" ? "default" : "secondary"}
                              className={point.adjusted ? "opacity-70" : ""}
                            >
                              {point.source === "swap" ? "Swap" : "Futures"}
                              {point.adjusted && " (adj)"}
                            </Badge>
                          </td>
                          <td className="py-2 px-4 text-center">
                            <span className={point.priority === 1 ? "font-bold text-primary" : "text-muted-foreground"}>
                              {point.priority === 1 ? "Calibration" : "Guide"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="documentation">
            <BootstrappingDocumentation />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

