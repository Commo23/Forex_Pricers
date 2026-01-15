import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { RefreshCw, ArrowLeft, LayoutGrid, FileText } from "lucide-react";
import { useCountriesBonds, useCountryYields } from "@/hooks/useBondsData";
import { CountryBondData } from "@/lib/rate-explorer/api/bonds";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

function getRatingColor(rating: string): string {
  if (rating.startsWith('AAA')) return 'bg-green-500';
  if (rating.startsWith('AA')) return 'bg-green-400';
  if (rating.startsWith('A')) return 'bg-blue-400';
  if (rating.startsWith('BBB')) return 'bg-yellow-400';
  if (rating.startsWith('BB')) return 'bg-orange-400';
  if (rating.startsWith('B')) return 'bg-orange-500';
  if (rating.startsWith('C')) return 'bg-red-500';
  return 'bg-muted';
}

function formatBps(value: number | null): React.ReactNode {
  if (value === null) return '-';
  const color = value > 0 ? 'text-red-500' : value < 0 ? 'text-green-500' : '';
  const sign = value > 0 ? '+' : '';
  return <span className={color}>{sign}{value.toFixed(1)} bp</span>;
}

function formatPercent(value: number | null): string {
  if (value === null) return '-';
  return `${value.toFixed(3)}%`;
}

type ViewMode = "dashboard" | "detail";

interface CurrencyGroup {
  currency: string;
  countries: CountryBondData[];
  avgYield10Y: number | null;
}

export function BondsDashboard() {
  const [viewMode, setViewMode] = useState<ViewMode>("dashboard");
  const [selectedCurrency, setSelectedCurrency] = useState<string>("");
  const [selectedCountry, setSelectedCountry] = useState<CountryBondData | null>(null);
  const [activeTab, setActiveTab] = useState<'table' | 'chart'>('table');
  
  const { data: countriesData, isLoading: isLoadingCountries, refetch: refetchCountries, isFetching } = useCountriesBonds();
  const { data: yieldsData, isLoading: isLoadingYields, refetch: refetchYields } = useCountryYields(selectedCountry?.countrySlug || '');

  // Group countries by currency
  const currencyGroups: CurrencyGroup[] = useMemo(() => {
    const countries = countriesData?.data || [];
    const groups: Record<string, CountryBondData[]> = {};
    
    countries.forEach(c => {
      if (!groups[c.currency]) {
        groups[c.currency] = [];
      }
      groups[c.currency].push(c);
    });
    
    return Object.entries(groups)
      .map(([currency, countries]) => {
        const yields = countries.filter(c => c.yield10Y !== null).map(c => c.yield10Y as number);
        const avgYield10Y = yields.length > 0 ? yields.reduce((a, b) => a + b, 0) / yields.length : null;
        return { currency, countries, avgYield10Y };
      })
      .sort((a, b) => a.currency.localeCompare(b.currency));
  }, [countriesData?.data]);

  // Get unique currencies
  const currencies = useMemo(() => 
    [...new Set((countriesData?.data || []).map(c => c.currency))].sort(),
  [countriesData?.data]);

  // Filter countries by selected currency
  const filteredCountries = useMemo(() => 
    selectedCurrency 
      ? (countriesData?.data || []).filter(c => c.currency === selectedCurrency)
      : (countriesData?.data || []),
  [countriesData?.data, selectedCurrency]);

  const handleLoadCountries = () => {
    refetchCountries();
  };

  const handleSelectCountry = (country: CountryBondData) => {
    setSelectedCountry(country);
    setViewMode("detail");
  };

  const handleBack = () => {
    setSelectedCountry(null);
    setViewMode("dashboard");
  };

  const chartData = yieldsData?.data?.map(d => ({
    maturity: d.maturity,
    years: d.maturityYears,
    yield: d.yield,
  })) || [];

  // Dashboard View
  if (viewMode === "dashboard" && !selectedCountry) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              🌍 World Government Bonds - Vue Dashboard
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setViewMode("detail")}>
                <FileText className="w-4 h-4 mr-2" />
                Vue Détail
              </Button>
              <Button 
                onClick={handleLoadCountries} 
                disabled={isFetching}
                variant="outline"
                size="sm"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
                {countriesData?.data ? 'Refresh' : 'Load Data'}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {/* Currency Filter */}
            <div className="mb-6">
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
            
            {isLoadingCountries || isFetching ? (
              <div className="flex items-center justify-center py-12">
                <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
                <span className="ml-3 text-muted-foreground">Scraping bond data...</span>
              </div>
            ) : countriesData?.data && countriesData.data.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {currencyGroups
                  .filter(g => !selectedCurrency || g.currency === selectedCurrency)
                  .map(({ currency, countries, avgYield10Y }) => (
                    <Card key={currency} className="hover:border-primary/50 transition-colors">
                      <CardHeader className="pb-2">
                        <CardTitle className="flex items-center justify-between">
                          <Badge variant="default" className="text-lg px-3">{currency}</Badge>
                          <span className="text-sm text-muted-foreground">
                            {countries.length} pays
                          </span>
                        </CardTitle>
                        {avgYield10Y !== null && (
                          <p className="text-sm text-muted-foreground">
                            10Y moyen: <span className="font-mono">{avgYield10Y.toFixed(2)}%</span>
                          </p>
                        )}
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-1">
                          {countries.slice(0, 4).map(c => (
                            <div 
                              key={c.countrySlug}
                              className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                              onClick={() => handleSelectCountry(c)}
                            >
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-sm truncate max-w-[100px]">{c.country}</span>
                                {c.rating && (
                                  <Badge className={`${getRatingColor(c.rating)} text-xs`}>
                                    {c.rating}
                                  </Badge>
                                )}
                              </div>
                              <span className="text-sm font-mono">
                                {c.yield10Y !== null ? `${c.yield10Y.toFixed(2)}%` : '-'}
                              </span>
                            </div>
                          ))}
                          {countries.length > 4 && (
                            <div className="text-xs text-muted-foreground text-center pt-2">
                              +{countries.length - 4} autres
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
              </div>
            ) : countriesData?.error ? (
              <div className="text-center py-12 text-destructive">
                Error: {countriesData.error}
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                Click "Load Data" to fetch government bond data from worldgovernmentbonds.com
              </div>
            )}
            
            {countriesData?.scrapedAt && (
              <div className="text-xs text-muted-foreground mt-4">
                Last updated: {new Date(countriesData.scrapedAt).toLocaleString()}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // Detail View - List mode
  if (viewMode === "detail" && !selectedCountry) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            🌍 World Government Bonds - Vue Détail
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setViewMode("dashboard")}>
              <LayoutGrid className="w-4 h-4 mr-2" />
              Vue Dashboard
            </Button>
            <Button 
              onClick={handleLoadCountries} 
              disabled={isFetching}
              variant="outline"
              size="sm"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Currency Filter */}
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
          
          {isLoadingCountries || isFetching ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
              <span className="ml-3 text-muted-foreground">Scraping bond data...</span>
            </div>
          ) : filteredCountries.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Country</TableHead>
                    <TableHead>Currency</TableHead>
                    <TableHead>Rating S&P</TableHead>
                    <TableHead className="text-right">10Y Yield</TableHead>
                    <TableHead className="text-right">Bank Rate</TableHead>
                    <TableHead className="text-right">Spread vs Bund</TableHead>
                    <TableHead className="text-right">Spread vs T-Note</TableHead>
                    <TableHead className="text-right">Spread vs Bank Rate</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCountries.map((country) => (
                    <TableRow 
                      key={country.countrySlug}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => handleSelectCountry(country)}
                    >
                      <TableCell className="font-medium">{country.country}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{country.currency}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={getRatingColor(country.rating)}>
                          {country.rating || 'NR'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatPercent(country.yield10Y)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatPercent(country.bankRate)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatBps(country.spreadVsBund)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatBps(country.spreadVsTNote)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatBps(country.spreadVsBankRate)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : countriesData?.error ? (
            <div className="text-center py-12 text-destructive">
              Error: {countriesData.error}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              No data available
            </div>
          )}
          
          {countriesData?.scrapedAt && (
            <div className="text-xs text-muted-foreground mt-4">
              Last updated: {new Date(countriesData.scrapedAt).toLocaleString()}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  // Country Detail View
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={handleBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <CardTitle className="flex items-center gap-2">
            {selectedCountry?.country} Yield Curve
            <Badge variant="outline">{selectedCountry?.currency}</Badge>
            <Badge className={getRatingColor(selectedCountry?.rating || '')}>
              {selectedCountry?.rating || 'NR'}
            </Badge>
          </CardTitle>
        </div>
        <Button 
          onClick={() => refetchYields()} 
          disabled={isLoadingYields}
          variant="outline"
          size="sm"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoadingYields ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'table' | 'chart')}>
          <TabsList className="mb-4">
            <TabsTrigger value="table">Table</TabsTrigger>
            <TabsTrigger value="chart">Chart</TabsTrigger>
          </TabsList>
          
          <TabsContent value="table">
            {isLoadingYields ? (
              <div className="flex items-center justify-center py-12">
                <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
                <span className="ml-3 text-muted-foreground">Loading yield curve...</span>
              </div>
            ) : yieldsData?.data && yieldsData.data.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Maturity</TableHead>
                      <TableHead className="text-right">Yield</TableHead>
                      <TableHead className="text-right">Chg 1M</TableHead>
                      <TableHead className="text-right">Chg 6M</TableHead>
                      <TableHead className="text-right">Chg 12M</TableHead>
                      <TableHead className="text-right">Price</TableHead>
                      <TableHead className="text-right">Capital Growth</TableHead>
                      <TableHead>Last Update</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {yieldsData.data.map((yieldData) => (
                      <TableRow key={yieldData.maturity}>
                        <TableCell className="font-medium">{yieldData.maturity}</TableCell>
                        <TableCell className="text-right font-mono">
                          {formatPercent(yieldData.yield)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatBps(yieldData.chg1M)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatBps(yieldData.chg6M)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatBps(yieldData.chg12M)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {yieldData.price?.toFixed(2) || '-'}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {yieldData.capitalGrowth?.toFixed(3) || '-'}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {yieldData.lastUpdate || '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : yieldsData?.error ? (
              <div className="text-center py-12 text-destructive">
                Error: {yieldsData.error}
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                No yield data available
              </div>
            )}
          </TabsContent>
          
          <TabsContent value="chart">
            {chartData.length > 0 ? (
              <div className="h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis 
                      dataKey="maturity" 
                      tick={{ fontSize: 12 }}
                      className="text-muted-foreground"
                    />
                    <YAxis 
                      tick={{ fontSize: 12 }}
                      tickFormatter={(v) => `${v}%`}
                      className="text-muted-foreground"
                      domain={['auto', 'auto']}
                    />
                    <Tooltip 
                      formatter={(value: number) => [`${value?.toFixed(3)}%`, 'Yield']}
                      labelFormatter={(label) => `Maturity: ${label}`}
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px'
                      }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="yield" 
                      stroke="hsl(var(--primary))" 
                      strokeWidth={2}
                      dot={{ fill: 'hsl(var(--primary))', strokeWidth: 2, r: 4 }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                No chart data available
              </div>
            )}
          </TabsContent>
        </Tabs>
        
        {yieldsData?.scrapedAt && (
          <div className="text-xs text-muted-foreground mt-4">
            Last updated: {new Date(yieldsData.scrapedAt).toLocaleString()}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

