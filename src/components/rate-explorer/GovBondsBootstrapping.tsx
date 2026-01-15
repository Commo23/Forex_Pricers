import { useState, useMemo, useEffect } from "react";
import { useCountriesBonds, useCountryYields } from "@/hooks/useBondsData";
import { CountryBondData, BondYieldData } from "@/lib/rate-explorer/api/bonds";
import {
  bootstrapBonds,
  BootstrapPoint,
  BootstrapMethod,
  BootstrapResult,
  getBasisConvention,
  exportToCSV,
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
import { Download, Calculator, TrendingUp, RefreshCw, Landmark, LayoutGrid, FileText, Info } from "lucide-react";
import { toast } from "sonner";

const BOOTSTRAP_METHODS: { id: BootstrapMethod; name: string; description: string }[] = [
  { id: "linear", name: "Simple/Linéaire", description: "Interpolation linéaire" },
  { id: "cubic_spline", name: "Cubic Spline", description: "Splines cubiques naturelles" },
  { id: "nelson_siegel", name: "Nelson-Siegel", description: "Modèle paramétrique" },
  { id: "bloomberg", name: "Bloomberg", description: "Log-DF interpolation" },
  { id: "quantlib_log_linear", name: "QL Log-Linear", description: "Log(DF) linéaire" },
  { id: "quantlib_log_cubic", name: "QL Log-Cubic", description: "Log(DF) cubique" },
];

const MAJOR_CURRENCIES = ["USD", "EUR", "GBP", "CHF", "JPY"];

type ViewMode = "dashboard" | "detail";

interface CurrencyGroup {
  currency: string;
  countries: CountryBondData[];
}

export function GovBondsBootstrapping() {
  const [viewMode, setViewMode] = useState<ViewMode>("dashboard");
  const [selectedCurrency, setSelectedCurrency] = useState<string>("");
  const [selectedCountry, setSelectedCountry] = useState<string>("");
  const [selectedMethods, setSelectedMethods] = useState<BootstrapMethod[]>(["linear", "cubic_spline"]);
  
  const countriesQuery = useCountriesBonds();
  const yieldsQuery = useCountryYields(selectedCountry);
  
  useEffect(() => {
    if (!countriesQuery.data && !countriesQuery.isFetching) {
      countriesQuery.refetch();
    }
  }, []);
  
  const countriesData = countriesQuery.data?.data || [];
  
  const currencyGroups: CurrencyGroup[] = useMemo(() => {
    const groups: Record<string, CountryBondData[]> = {};
    countriesData.forEach(c => {
      if (!groups[c.currency]) {
        groups[c.currency] = [];
      }
      groups[c.currency].push(c);
    });
    
    return Object.entries(groups)
      .map(([currency, countries]) => ({ currency, countries }))
      .sort((a, b) => {
        const aIsMajor = MAJOR_CURRENCIES.includes(a.currency);
        const bIsMajor = MAJOR_CURRENCIES.includes(b.currency);
        if (aIsMajor && !bIsMajor) return -1;
        if (!aIsMajor && bIsMajor) return 1;
        return a.currency.localeCompare(b.currency);
      });
  }, [countriesData]);
  
  const currencies = useMemo(() => 
    [...new Set(countriesData.map(c => c.currency))].sort((a, b) => {
      const aIsMajor = MAJOR_CURRENCIES.includes(a);
      const bIsMajor = MAJOR_CURRENCIES.includes(b);
      if (aIsMajor && !bIsMajor) return -1;
      if (!aIsMajor && bIsMajor) return 1;
      return a.localeCompare(b);
    }), 
  [countriesData]);
  
  const filteredCountries = useMemo(() => 
    selectedCurrency 
      ? countriesData.filter(c => c.currency === selectedCurrency)
      : countriesData,
  [countriesData, selectedCurrency]);
  
  const selectedCountryData = countriesData.find(c => c.countrySlug === selectedCountry);
  const currency = selectedCountryData?.currency || selectedCurrency || "USD";
  const yieldsData = yieldsQuery.data?.data || [];
  
  const isMajorCurrency = MAJOR_CURRENCIES.includes(currency);
  
  const bondPoints: BootstrapPoint[] = useMemo(() => {
    if (!yieldsData.length) return [];
    
    return yieldsData
      .filter(y => y.yield !== null && y.maturityYears > 0)
      .map(y => ({
        tenor: y.maturityYears,
        rate: (y.yield as number) / 100,
        source: 'bond' as const,
        priority: 1,
      }));
  }, [yieldsData]);
  
  const results: BootstrapResult[] = useMemo(() => {
    if (bondPoints.length < 2) return [];
    
    return selectedMethods.map(method => 
      bootstrapBonds(bondPoints, method, currency)
    );
  }, [bondPoints, selectedMethods, currency]);
  
  const basisConvention = getBasisConvention(currency);
  
  const toggleMethod = (method: BootstrapMethod) => {
    setSelectedMethods(prev =>
      prev.includes(method)
        ? prev.filter(m => m !== method)
        : [...prev, method]
    );
  };
  
  const handleExportCSV = (result: BootstrapResult) => {
    const csv = exportToCSV(result);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `gov_bonds_${selectedCountry}_${result.method}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Discount factors exportés en CSV");
  };

  const handleLoadCountries = () => {
    countriesQuery.refetch();
  };

  const handleSelectCountry = (country: CountryBondData) => {
    setSelectedCountry(country.countrySlug);
    setViewMode("detail");
  };

  if (viewMode === "dashboard") {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Landmark className="h-5 w-5 text-primary" />
              Government Bonds Bootstrapping
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setViewMode("detail")}>
                <FileText className="w-4 h-4 mr-2" />
                Vue Détail
              </Button>
              <Button 
                onClick={handleLoadCountries} 
                disabled={countriesQuery.isLoading || countriesQuery.isFetching}
                variant="outline"
                size="sm"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${countriesQuery.isLoading || countriesQuery.isFetching ? 'animate-spin' : ''}`} />
                {countriesData.length > 0 ? 'Refresh' : 'Load Data'}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <Alert className="mb-4">
              <Info className="h-4 w-4" />
              <AlertDescription>
                Sélectionnez un pays pour bootstrapper sa courbe de taux à partir des données de bonds gouvernementaux.
              </AlertDescription>
            </Alert>

            <div className="mb-4">
              <Label className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
                Filtrer par Devise
              </Label>
              <Select value={selectedCurrency || "_all"} onValueChange={(v) => setSelectedCurrency(v === "_all" ? "" : v)}>
                <SelectTrigger className="w-full max-w-xs">
                  <SelectValue placeholder="Toutes les devises" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">Toutes les devises</SelectItem>
                  {currencies.map((curr) => (
                    <SelectItem key={curr} value={curr}>{curr}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {countriesQuery.isLoading || countriesQuery.isFetching ? (
              <div className="flex items-center justify-center py-12">
                <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
                <span className="ml-3 text-muted-foreground">Chargement des données...</span>
              </div>
            ) : filteredCountries.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredCountries.map((country) => (
                  <Card 
                    key={country.countrySlug}
                    className="cursor-pointer hover:border-primary/50 transition-colors"
                    onClick={() => handleSelectCountry(country)}
                  >
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between">
                        <span>{country.country}</span>
                        <Badge variant="outline">{country.currency}</Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {country.yield10Y !== null && (
                          <div>
                            <span className="text-xs text-muted-foreground">10Y Yield: </span>
                            <span className="font-mono font-semibold">{(country.yield10Y).toFixed(3)}%</span>
                          </div>
                        )}
                        {country.rating && (
                          <Badge variant="secondary" className="text-xs">
                            {country.rating}
                          </Badge>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                Aucune donnée disponible. Cliquez sur "Load Data" pour charger les données.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // Detail view with bootstrapping
  if (!selectedCountry || !selectedCountryData) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Landmark className="w-12 h-12 mx-auto mb-4" />
        <p>Sélectionnez un pays pour commencer</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => setViewMode("dashboard")}>
              <LayoutGrid className="h-4 w-4 mr-2" />
              Retour
            </Button>
            <CardTitle className="flex items-center gap-2">
              {selectedCountryData.country} - Bootstrapping
              <Badge variant="outline">{selectedCountryData.currency}</Badge>
            </CardTitle>
          </div>
          <Button 
            onClick={() => yieldsQuery.refetch()} 
            disabled={yieldsQuery.isLoading}
            variant="outline"
            size="sm"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${yieldsQuery.isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {/* Method Selection */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Méthodes de Bootstrapping
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {BOOTSTRAP_METHODS.map((method) => (
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

            {/* Convention Info */}
            <div className="flex flex-wrap gap-4 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Convention ({currency}):</span>
                <Badge variant="outline">{basisConvention.dayCount}</Badge>
                <Badge variant="outline">{basisConvention.compounding}</Badge>
                <Badge variant="outline">{basisConvention.paymentFrequency}x/an</Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {yieldsQuery.isLoading ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Calculator className="w-12 h-12 mx-auto mb-4 text-muted-foreground animate-pulse" />
            <p className="text-muted-foreground">Chargement des données de bonds...</p>
          </CardContent>
        </Card>
      ) : bondPoints.length < 2 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <TrendingUp className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">
              Pas assez de points de données pour le bootstrapping (minimum 2 requis)
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              Points disponibles: {bondPoints.length}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="chart" className="space-y-4">
          <TabsList>
            <TabsTrigger value="chart">Courbes</TabsTrigger>
            <TabsTrigger value="discount_factors">Discount Factors</TabsTrigger>
            <TabsTrigger value="input_data">Données d'entrée</TabsTrigger>
          </TabsList>

          <TabsContent value="chart">
            <Card>
              <CardHeader>
                <CardTitle>
                  Courbes de Taux Bootstrappées ({currency})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <BootstrapCurveChart
                  results={results}
                  inputPoints={bondPoints}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="discount_factors" className="space-y-4">
            {results.map((result, idx) => (
              <Card key={`${result.method}-${idx}`}>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-base">
                      {BOOTSTRAP_METHODS.find((m) => m.id === result.method)?.name}
                      <Badge variant="outline" className="ml-2">{result.currency}</Badge>
                    </CardTitle>
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
                <CardTitle>Points de Données d'Entrée</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="py-3 px-4 text-left font-medium text-muted-foreground">Maturité</th>
                        <th className="py-3 px-4 text-right font-medium text-muted-foreground">Tenor (Y)</th>
                        <th className="py-3 px-4 text-right font-medium text-muted-foreground">Yield (%)</th>
                        <th className="py-3 px-4 text-center font-medium text-muted-foreground">Source</th>
                      </tr>
                    </thead>
                    <tbody>
                      {yieldsData
                        .filter(y => y.yield !== null && y.maturityYears > 0)
                        .map((yieldData, pidx) => (
                          <tr key={pidx} className="border-b border-border/50 hover:bg-muted/50">
                            <td className="py-2 px-4 font-medium">{yieldData.maturity}</td>
                            <td className="py-2 px-4 text-right font-mono">{yieldData.maturityYears.toFixed(2)}</td>
                            <td className="py-2 px-4 text-right font-mono">{(yieldData.yield as number).toFixed(4)}%</td>
                            <td className="py-2 px-4 text-center">
                              <Badge variant="default">Bond</Badge>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

