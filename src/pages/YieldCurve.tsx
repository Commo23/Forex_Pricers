import React, { useState, useEffect } from "react";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Search, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import YieldCurveService, { CountryYieldData } from "@/services/YieldCurveService";

const COUNTRIES = [
  "Switzerland", "Taiwan", "Thailand", "China", "Japan", "Singapore",
  "Denmark", "Sweden", "Germany", "Netherlands", "Hong Kong", "Ireland",
  "Morocco", "Austria", "Portugal", "Cyprus", "Finland", "Slovenia",
  "Croatia", "South Korea", "Spain", "Belgium", "Canada", "Greece",
  "Italy", "Slovakia", "France", "Malta", "Malaysia", "Lithuania",
  "Bulgaria", "Israel", "Vietnam", "Norway", "United States", "Qatar",
  "United Kingdom", "New Zealand", "Czech Republic", "Australia", "Serbia",
  "Peru", "Poland", "Chile", "Mauritius", "Philippines", "Indonesia",
  "Bahrain", "Iceland", "India", "Romania", "Hungary", "South Africa",
  "Jordan", "Mexico", "Namibia", "Bangladesh", "Sri Lanka", "Botswana",
  "Pakistan", "Colombia", "Kenya", "Brazil", "Ukraine", "Kazakhstan",
  "Nigeria", "Uganda", "Zambia", "Egypt", "Turkey"
];

const MATURITIES = [
  "1 month", "3 months", "6 months", "9 months", "1 year",
  "2 years", "3 years", "4 years", "5 years", "6 years",
  "7 years", "8 years", "9 years", "10 years"
];

const YieldCurve: React.FC = () => {
  const { toast } = useToast();
  const [selectedCountries, setSelectedCountries] = useState<string[]>(["United States", "Germany", "France"]);
  const [yieldData, setYieldData] = useState<CountryYieldData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const yieldCurveService = YieldCurveService.getInstance();

  // Load yield curve data for selected countries
  const loadYieldData = async () => {
    if (selectedCountries.length === 0) {
      toast({
        title: "No countries selected",
        description: "Please select at least one country",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);
    setYieldData([]);

    try {
      const results = await yieldCurveService.scrapeMultipleCountries(selectedCountries);
      setYieldData(results);

      const successCount = results.filter(r => !r.error && r.data.length > 0).length;
      const errorCount = results.filter(r => r.error || r.data.length === 0).length;

      toast({
        title: "Data loaded",
        description: `Loaded data for ${successCount} countries${errorCount > 0 ? `, ${errorCount} failed` : ''}`,
      });
    } catch (error) {
      console.error('Error loading yield data:', error);
      toast({
        title: "Error",
        description: "Failed to load yield curve data",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Filter countries based on search term
  const filteredCountries = COUNTRIES.filter(country =>
    country.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Toggle country selection
  const toggleCountry = (country: string) => {
    setSelectedCountries(prev =>
      prev.includes(country)
        ? prev.filter(c => c !== country)
        : [...prev, country]
    );
  };

  // Get yield for a specific country and maturity
  const getYield = (country: string, maturity: string): number | null => {
    const countryData = yieldData.find(d => d.country === country);
    if (!countryData || countryData.error) return null;

    // Try to match maturity (flexible matching)
    const maturityLower = maturity.toLowerCase();
    const maturityData = countryData.data.find(d => {
      const dMaturity = d.maturity.toLowerCase();
      // Check if maturities match (e.g., "1 month" matches "1m" or "1 month")
      return dMaturity.includes(maturityLower) || maturityLower.includes(dMaturity.split(' ')[0]);
    });
    
    return maturityData?.yield || null;
  };

  return (
    <Layout>
      <div className="container mx-auto p-6 space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Yield Curve Data</CardTitle>
                <CardDescription>
                  Government bond yields by country and maturity
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={loadYieldData}
                  disabled={isLoading || selectedCountries.length === 0}
                  variant="outline"
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                  {isLoading ? 'Loading...' : 'Load Data'}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/* Country Selection */}
            <div className="mb-6 space-y-4">
              <div className="flex items-center gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search countries..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Badge variant="outline">
                  {selectedCountries.length} selected
                </Badge>
              </div>

              <div className="max-h-48 overflow-y-auto border rounded-md p-4">
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                  {filteredCountries.map(country => (
                    <div
                      key={country}
                      onClick={() => toggleCountry(country)}
                      className={`flex items-center gap-2 p-2 rounded cursor-pointer transition-colors ${
                        selectedCountries.includes(country)
                          ? 'bg-primary/10 border border-primary'
                          : 'hover:bg-muted'
                      }`}
                    >
                      {selectedCountries.includes(country) ? (
                        <CheckCircle2 className="h-4 w-4 text-primary" />
                      ) : (
                        <XCircle className="h-4 w-4 text-muted-foreground" />
                      )}
                      <span className="text-sm">{country}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Yield Curve Table */}
            {yieldData.length > 0 && (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="sticky left-0 bg-background z-10">Country</TableHead>
                      {MATURITIES.map(maturity => (
                        <TableHead key={maturity} className="text-center min-w-[100px]">
                          {maturity}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {yieldData.map((countryData) => (
                      <TableRow key={countryData.country}>
                        <TableCell className="sticky left-0 bg-background font-medium z-10">
                          <div className="flex items-center gap-2">
                            {countryData.country}
                            {countryData.error && (
                              <Badge variant="destructive" className="ml-2">
                                <AlertCircle className="h-3 w-3 mr-1" />
                                Error
                              </Badge>
                            )}
                            {!countryData.error && countryData.data.length === 0 && (
                              <Badge variant="outline" className="ml-2">No data</Badge>
                            )}
                          </div>
                        </TableCell>
                        {MATURITIES.map(maturity => {
                          const yieldValue = getYield(countryData.country, maturity);
                          return (
                            <TableCell key={maturity} className="text-center">
                              {yieldValue !== null ? (
                                <span className="font-mono">{yieldValue.toFixed(2)}%</span>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {yieldData.length === 0 && !isLoading && (
              <div className="text-center py-12 text-muted-foreground">
                Select countries and click "Load Data" to view yield curve data
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default YieldCurve;
