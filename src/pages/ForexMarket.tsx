import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { 
  Search, RefreshCw, ChevronUp, ChevronDown, Globe, TrendingUp, TrendingDown, Minus, 
  Calculator, Star, StarOff, BarChart3, ArrowUpRight, ArrowDownRight, X, Plus,
  Activity, Zap, ArrowRight
} from 'lucide-react';
import ExchangeRateService from '@/services/ExchangeRateService';
import FinancialDataService from '@/services/FinancialDataService';
import { useTheme } from '@/hooks/useTheme';
import { useToast } from '@/hooks/use-toast';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import TradingViewForexHeatmap from '@/components/TradingViewForexHeatmap';
import '@/styles/forex-market.css';

interface CurrencyData {
  code: string;
  name: string;
  rate: number;
  previousRate?: number;
  change?: number;
  changePercent?: number;
}

interface CurrencyPair {
  symbol: string;
  name: string;
  base: string;
  quote: string;
  category: 'majors' | 'crosses' | 'others';
  defaultSpotRate: number;
}

interface HistoricalRate {
  timestamp: number;
  rate: number;
}

const ForexMarket: React.FC = () => {
  const navigate = useNavigate();
  const [currencies, setCurrencies] = useState<CurrencyData[]>([]);
  const [previousCurrencies, setPreviousCurrencies] = useState<CurrencyData[]>([]);
  const [filteredCurrencies, setFilteredCurrencies] = useState<CurrencyData[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [baseCurrency, setBaseCurrency] = useState('USD');
  const [sortField, setSortField] = useState<'code' | 'name' | 'rate' | 'change'>('code');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [activeTab, setActiveTab] = useState('market-data');
  const [widgetKey, setWidgetKey] = useState(0);
  const [showFavoritesDialog, setShowFavoritesDialog] = useState(false);
  
  // Calculator states
  const [showCalculator, setShowCalculator] = useState(false);
  const [calcFromCurrency, setCalcFromCurrency] = useState('USD');
  const [calcToCurrency, setCalcToCurrency] = useState('EUR');
  const [calcAmount, setCalcAmount] = useState('1');
  const [calcResult, setCalcResult] = useState<number | null>(null);
  
  // Favorites/Watchlist
  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('forexFavorites');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  
  // Historical data for charts
  const [historicalData, setHistoricalData] = useState<{ [key: string]: HistoricalRate[] }>({});
  const [selectedCurrencyForChart, setSelectedCurrencyForChart] = useState<string | null>(null);
  
  // États pour les paires de devises personnalisées
  const [customCurrencyPairs, setCustomCurrencyPairs] = useState<CurrencyPair[]>(() => {
    try {
      const savedPairs = localStorage.getItem('customCurrencyPairs');
      return savedPairs ? JSON.parse(savedPairs) : [];
    } catch (error) {
      console.warn('Error loading custom currency pairs:', error);
      return [];
    }
  });
  const [selectedCurrencyPair, setSelectedCurrencyPair] = useState<string>('EUR/USD');
  const [showAddPairDialog, setShowAddPairDialog] = useState(false);
  const [newPairSymbol, setNewPairSymbol] = useState('');
  const [newPairName, setNewPairName] = useState('');
  const [newPairRate, setNewPairRate] = useState('');

  const exchangeRateService = ExchangeRateService.getInstance();
  const financialDataService = new FinancialDataService();
  const { theme } = useTheme();
  const { toast } = useToast();

  // Save favorites to localStorage
  useEffect(() => {
    localStorage.setItem('forexFavorites', JSON.stringify(favorites));
  }, [favorites]);

  // Fonction pour sauvegarder les paires personnalisées
  const saveCustomCurrencyPairs = (pairs: CurrencyPair[]) => {
    try {
      localStorage.setItem('customCurrencyPairs', JSON.stringify(pairs));
      setCustomCurrencyPairs(pairs);
      console.log('✅ Custom currency pairs saved:', pairs);
    } catch (error) {
      console.error('❌ Error saving custom currency pairs:', error);
    }
  };

  // Function to add a custom currency pair
  const addCustomCurrencyPair = () => {
    if (!newPairSymbol || !newPairName || !newPairRate) {
      toast({
        title: "Validation Error",
        description: "Please fill in all fields",
        variant: "destructive"
      });
      return;
    }

    const symbol = newPairSymbol.toUpperCase();
    const rate = parseFloat(newPairRate);
    
    if (isNaN(rate) || rate <= 0) {
      toast({
        title: "Invalid Rate",
        description: "Rate must be a positive number",
        variant: "destructive"
      });
      return;
    }

    // Check if the pair already exists
    const allPairs = [...getDefaultCurrencyPairs(), ...customCurrencyPairs];
    if (allPairs.some(pair => pair.symbol === symbol)) {
      toast({
        title: "Pair Exists",
        description: `Currency pair ${symbol} already exists`,
        variant: "destructive"
      });
      return;
    }

    // Extract base and quote from symbol
    const [base, quote] = symbol.split('/');
    if (!base || !quote || base.length !== 3 || quote.length !== 3) {
      toast({
        title: "Invalid Format",
        description: "Symbol format must be XXX/YYY (e.g., EUR/USD)",
        variant: "destructive"
      });
      return;
    }

    const newPair: CurrencyPair = {
      symbol,
      name: newPairName,
      base,
      quote,
      category: 'others',
      defaultSpotRate: rate
    };

    const updated = [...customCurrencyPairs, newPair];
    saveCustomCurrencyPairs(updated);
    setSelectedCurrencyPair(symbol);
    setNewPairSymbol('');
    setNewPairName('');
    setNewPairRate('');
    setShowAddPairDialog(false);
    
    toast({
      title: "Success",
      description: `Pair ${symbol} added successfully!`,
    });
  };

  // Fonction pour obtenir les paires de devises par défaut
  const getDefaultCurrencyPairs = (): CurrencyPair[] => {
    return [
      { symbol: "EUR/USD", name: "Euro/US Dollar", base: "EUR", quote: "USD", category: "majors", defaultSpotRate: 1.0850 },
      { symbol: "GBP/USD", name: "British Pound/US Dollar", base: "GBP", quote: "USD", category: "majors", defaultSpotRate: 1.2650 },
      { symbol: "USD/JPY", name: "US Dollar/Japanese Yen", base: "USD", quote: "JPY", category: "majors", defaultSpotRate: 149.50 },
      { symbol: "USD/CHF", name: "US Dollar/Swiss Franc", base: "USD", quote: "CHF", category: "majors", defaultSpotRate: 0.8850 },
      { symbol: "AUD/USD", name: "Australian Dollar/US Dollar", base: "AUD", quote: "USD", category: "majors", defaultSpotRate: 0.6580 },
      { symbol: "USD/CAD", name: "US Dollar/Canadian Dollar", base: "USD", quote: "CAD", category: "majors", defaultSpotRate: 1.3650 },
      { symbol: "NZD/USD", name: "New Zealand Dollar/US Dollar", base: "NZD", quote: "USD", category: "majors", defaultSpotRate: 0.6020 },
      { symbol: "EUR/GBP", name: "Euro/British Pound", base: "EUR", quote: "GBP", category: "crosses", defaultSpotRate: 0.8580 },
      { symbol: "EUR/JPY", name: "Euro/Japanese Yen", base: "EUR", quote: "JPY", category: "crosses", defaultSpotRate: 162.25 },
      { symbol: "GBP/JPY", name: "British Pound/Japanese Yen", base: "GBP", quote: "JPY", category: "crosses", defaultSpotRate: 189.15 },
      { symbol: "EUR/CHF", name: "Euro/Swiss Franc", base: "EUR", quote: "CHF", category: "crosses", defaultSpotRate: 0.9605 },
      { symbol: "EUR/AUD", name: "Euro/Australian Dollar", base: "EUR", quote: "AUD", category: "crosses", defaultSpotRate: 1.6485 },
      { symbol: "GBP/CHF", name: "British Pound/Swiss Franc", base: "GBP", quote: "CHF", category: "crosses", defaultSpotRate: 1.1195 },
      { symbol: "AUD/JPY", name: "Australian Dollar/Japanese Yen", base: "AUD", quote: "JPY", category: "crosses", defaultSpotRate: 98.40 },
      { symbol: "CAD/JPY", name: "Canadian Dollar/Japanese Yen", base: "CAD", quote: "JPY", category: "crosses", defaultSpotRate: 109.52 },
      { symbol: "CHF/JPY", name: "Swiss Franc/Japanese Yen", base: "CHF", quote: "JPY", category: "crosses", defaultSpotRate: 169.01 },
    ];
  };

  // Fonction pour obtenir toutes les paires de devises (défaut + personnalisées)
  const getAllCurrencyPairs = (): CurrencyPair[] => {
    return [...getDefaultCurrencyPairs(), ...customCurrencyPairs];
  };

  // Load market data with proper conversion
  const loadMarketData = async () => {
    try {
      setLoading(true);
      
      // Save current rates as previous for change calculation
      setPreviousCurrencies([...currencies]);
      
      // Get exchange rates from ExchangeRateService
      const exchangeData = await exchangeRateService.getExchangeRates(baseCurrency);
      const formattedData = exchangeRateService.formatCurrencyData(exchangeData);
      
      // Transform to CurrencyData format with change calculation
      const apiCurrencies: CurrencyData[] = formattedData.map(currency => {
        const previous = previousCurrencies.find(c => c.code === currency.code);
        const change = previous ? currency.rate - previous.rate : 0;
        const changePercent = previous && previous.rate !== 0 
          ? (change / previous.rate) * 100 
          : 0;
        
        return {
          code: currency.code,
          name: currency.name,
          rate: currency.rate,
          previousRate: previous?.rate,
          change,
          changePercent
        };
      });

      // Convert custom pairs to match base currency
      const customCurrencies: CurrencyData[] = customCurrencyPairs.map(pair => {
        // If custom pair's quote matches base currency, use direct rate
        if (pair.quote === baseCurrency) {
          return {
            code: pair.base,
            name: `${pair.base} (from ${pair.symbol})`,
            rate: pair.defaultSpotRate
          };
        }
        // Otherwise, need to convert via base currency
        // For now, we'll use the default rate (this could be improved with proper cross-rate calculation)
        return {
          code: pair.base,
          name: `${pair.base} (from ${pair.symbol})`,
          rate: pair.defaultSpotRate
        };
      });

      // Combine API and custom currencies, removing duplicates (API takes priority)
      const allCurrencies = [...apiCurrencies, ...customCurrencies];
      const uniqueCurrencies = allCurrencies.filter((currency, index, self) => 
        index === self.findIndex(c => c.code === currency.code)
      );

      setCurrencies(uniqueCurrencies);
      setLastUpdated(new Date());
      
      // Update historical data
      updateHistoricalData(uniqueCurrencies);
    } catch (error) {
      console.error('Error loading market data:', error);
      toast({
        title: "Error",
        description: "Failed to load market data. Please try again.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  // Update historical data for charts
  const updateHistoricalData = (currencies: CurrencyData[]) => {
    const now = Date.now();
    const updated = { ...historicalData };
    
    currencies.forEach(currency => {
      if (!updated[currency.code]) {
        updated[currency.code] = [];
      }
      updated[currency.code].push({
        timestamp: now,
        rate: currency.rate
      });
      
      // Keep only last 50 data points
      if (updated[currency.code].length > 50) {
        updated[currency.code] = updated[currency.code].slice(-50);
      }
    });
    
    setHistoricalData(updated);
  };

  // Calculate conversion
  const calculateConversion = () => {
    if (!calcAmount || isNaN(parseFloat(calcAmount))) {
      setCalcResult(null);
      return;
    }

    const amount = parseFloat(calcAmount);
    if (amount <= 0) {
      setCalcResult(null);
      return;
    }

    // Find rates for both currencies
    const fromCurrencyData = currencies.find(c => c.code === calcFromCurrency);
    const toCurrencyData = currencies.find(c => c.code === calcToCurrency);

    if (!fromCurrencyData || !toCurrencyData) {
      setCalcResult(null);
      return;
    }

    // If both are relative to same base, convert directly
    if (calcFromCurrency === baseCurrency) {
      setCalcResult(amount * toCurrencyData.rate);
    } else if (calcToCurrency === baseCurrency) {
      setCalcResult(amount / fromCurrencyData.rate);
    } else {
      // Cross conversion: (amount / fromRate) * toRate
      setCalcResult((amount / fromCurrencyData.rate) * toCurrencyData.rate);
    }
  };

  // Toggle favorite
  const toggleFavorite = (code: string) => {
    setFavorites(prev => 
      prev.includes(code) 
        ? prev.filter(c => c !== code)
        : [...prev, code]
    );
  };

  // Navigate to Strategy Builder with a currency pair from favorites
  const navigateToStrategyBuilder = (favoriteCurrency: string) => {
    try {
      // Create currency pair symbol: BASE/FAVORITE or FAVORITE/BASE
      // We'll use BASE/FAVORITE format
      const pairSymbol = `${baseCurrency}/${favoriteCurrency}`;
      
      // Check if this pair exists in default or custom pairs
      const allPairs = [...getDefaultCurrencyPairs(), ...customCurrencyPairs];
      let selectedPair = allPairs.find(pair => pair.symbol === pairSymbol);
      
      // If not found, try reverse pair
      if (!selectedPair) {
        const reverseSymbol = `${favoriteCurrency}/${baseCurrency}`;
        selectedPair = allPairs.find(pair => pair.symbol === reverseSymbol);
        
        // If reverse pair exists, we need to invert the rate
        if (selectedPair) {
          const invertedRate = 1 / selectedPair.defaultSpotRate;
          selectedPair = {
            ...selectedPair,
            symbol: pairSymbol,
            base: baseCurrency,
            quote: favoriteCurrency,
            defaultSpotRate: invertedRate
          };
        }
      }
      
      // If still not found, create a new pair using current market rate
      if (!selectedPair) {
        const favoriteCurrencyData = currencies.find(c => c.code === favoriteCurrency);
        const rate = favoriteCurrencyData?.rate || 1.0;
        
        selectedPair = {
          symbol: pairSymbol,
          name: `${baseCurrency}/${favoriteCurrency}`,
          base: baseCurrency,
          quote: favoriteCurrency,
          category: 'others',
          defaultSpotRate: rate
        };
      }
      
      // Get current calculator state or create default
      const currentState = localStorage.getItem('calculatorState');
      let calculatorState: any = {};
      
      if (currentState) {
        try {
          calculatorState = JSON.parse(currentState);
        } catch (e) {
          console.warn('Error parsing calculator state:', e);
        }
      }
      
      // Update calculator state with the selected pair
      calculatorState.params = {
        ...calculatorState.params,
        currencyPair: selectedPair,
        spotPrice: selectedPair.defaultSpotRate,
        baseVolume: calculatorState.params?.baseVolume || 10000000,
        quoteVolume: (calculatorState.params?.baseVolume || 10000000) * selectedPair.defaultSpotRate
      };
      
      // Save to localStorage
      localStorage.setItem('calculatorState', JSON.stringify(calculatorState));
      
      // Navigate to Strategy Builder
      navigate('/strategy-builder');
      
      toast({
        title: "Pair Loaded",
        description: `Currency pair ${selectedPair.symbol} loaded in Strategy Builder`,
      });
    } catch (error) {
      console.error('Error navigating to Strategy Builder:', error);
      toast({
        title: "Error",
        description: "Failed to load currency pair. Please try again.",
        variant: "destructive"
      });
    }
  };

  useEffect(() => {
    loadMarketData();
    const interval = setInterval(loadMarketData, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, [baseCurrency, customCurrencyPairs]);

  useEffect(() => {
    const filtered = currencies.filter(currency =>
      currency.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      currency.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
    setFilteredCurrencies(filtered);
  }, [searchTerm, currencies]);

  useEffect(() => {
    if (showCalculator) {
      calculateConversion();
    }
  }, [calcAmount, calcFromCurrency, calcToCurrency, currencies, showCalculator]);

  useEffect(() => {
    // Force widget reload when theme changes
    if (activeTab === 'advanced-data') {
      setWidgetKey(prev => prev + 1);
    }
  }, [theme]);

  useEffect(() => {
    // Load TradingView widget when advanced-data tab is active
    if (activeTab === 'advanced-data') {
      const loadTradingViewWidget = () => {
        const existingWidget = document.querySelector('.tradingview-widget-container__widget');
        if (existingWidget) {
          existingWidget.innerHTML = '';
        }

        const existingScripts = document.querySelectorAll('script[src*="tradingview"]');
        existingScripts.forEach(script => script.remove());

        const script = document.createElement('script');
        script.type = 'text/javascript';
        script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-screener.js';
        script.async = true;
        script.innerHTML = JSON.stringify({
          "width": "100%",
          "height": "800",
          "defaultColumn": "overview",
          "defaultScreen": "top_gainers",
          "showToolbar": true,
          "locale": "en",
          "market": "forex",
          "colorTheme": theme === 'dark' ? "dark" : "light"
        });

        const widgetContainer = document.querySelector('.tradingview-widget-container__widget');
        if (widgetContainer) {
          widgetContainer.appendChild(script);
        }
      };

      setTimeout(loadTradingViewWidget, 100);
    }
  }, [activeTab, widgetKey, theme]);

  const formatRate = (rate: number): string => {
    if (rate > 100) return rate.toFixed(2);
    if (rate > 10) return rate.toFixed(3);
    return rate.toFixed(4);
  };

  const getMajorPairs = () => {
    const majorPairs = ['EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'NZD', 'CNY'];
    return filteredCurrencies.filter(c => majorPairs.includes(c.code));
  };

  const handleSort = (field: 'code' | 'name' | 'rate' | 'change') => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const getSortedCurrencies = () => {
    return [...filteredCurrencies].sort((a, b) => {
      let aValue: string | number;
      let bValue: string | number;

      switch (sortField) {
        case 'code':
          aValue = a.code;
          bValue = b.code;
          break;
        case 'name':
          aValue = a.name;
          bValue = b.name;
          break;
        case 'rate':
          aValue = a.rate;
          bValue = b.rate;
          break;
        case 'change':
          aValue = a.changePercent || 0;
          bValue = b.changePercent || 0;
          break;
        default:
          aValue = a.code;
          bValue = b.code;
      }

      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortDirection === 'asc' 
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      } else {
        return sortDirection === 'asc'
          ? (aValue as number) - (bValue as number)
          : (bValue as number) - (aValue as number);
      }
    });
  };

  // Get chart data for selected currency
  const getChartData = (currencyCode: string) => {
    const data = historicalData[currencyCode] || [];
    return data.map((point, index) => ({
      time: index,
      rate: point.rate,
      timestamp: new Date(point.timestamp).toLocaleTimeString()
    }));
  };

  // Get all unique currency codes for calculator
  const getAllCurrencyCodes = useMemo(() => {
    const codes = new Set<string>();
    codes.add(baseCurrency);
    currencies.forEach(c => codes.add(c.code));
    return Array.from(codes).sort();
  }, [currencies, baseCurrency]);

  return (
    <Layout title="Forex Market">
      <div className="space-y-6">
        {/* Status Bar */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Forex Market Data</h1>
            <p className="text-gray-600 dark:text-gray-400">
              Real-time currency exchange rates from global markets
            </p>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Activity className="h-4 w-4" />
              <span>Last updated:</span>
              <span className="font-mono">{lastUpdated.toLocaleTimeString()}</span>
            </div>
            
            <Button
              onClick={loadMarketData}
              disabled={loading}
              variant="outline"
              size="sm"
              className="flex items-center gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>

            <Dialog open={showCalculator} onOpenChange={setShowCalculator}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="flex items-center gap-2">
                  <Calculator className="h-4 w-4" />
                  Calculator
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Currency Converter</DialogTitle>
                  <DialogDescription>
                    Convert between any two currencies
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Amount</Label>
                    <Input
                      type="number"
                      value={calcAmount}
                      onChange={(e) => setCalcAmount(e.target.value)}
                      placeholder="1"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>From</Label>
                      <select
                        value={calcFromCurrency}
                        onChange={(e) => setCalcFromCurrency(e.target.value)}
                        className="w-full px-3 py-2 border rounded-md"
                      >
                        {getAllCurrencyCodes.map(code => (
                          <option key={code} value={code}>{code}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label>To</Label>
                      <select
                        value={calcToCurrency}
                        onChange={(e) => setCalcToCurrency(e.target.value)}
                        className="w-full px-3 py-2 border rounded-md"
                      >
                        {getAllCurrencyCodes.map(code => (
                          <option key={code} value={code}>{code}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  {calcResult !== null && (
                    <div className="p-4 bg-muted rounded-lg">
                      <div className="text-sm text-muted-foreground">Result</div>
                      <div className="text-2xl font-bold">
                        {formatRate(calcResult)} {calcToCurrency}
                      </div>
                    </div>
                  )}
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Quick Rate Sync */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" />
              Quick Rate Sync
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Selected Currency Pair
                  <span className="ml-2 text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
                    {getAllCurrencyPairs().length} total
                  </span>
                  {customCurrencyPairs.length > 0 && (
                    <span className="ml-2 text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
                      +{customCurrencyPairs.length} custom
                    </span>
                  )}
                </label>
                <select
                  key={`currency-select-${customCurrencyPairs.length}`}
                  value={selectedCurrencyPair}
                  onChange={(e) => setSelectedCurrencyPair(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-600"
                >
                  {getDefaultCurrencyPairs().map(pair => (
                    <option key={pair.symbol} value={pair.symbol}>
                      {pair.symbol} - {pair.name}
                    </option>
                  ))}
                  {customCurrencyPairs.length > 0 && (
                    <>
                      <option disabled>--- Custom Pairs ---</option>
                      {customCurrencyPairs.map(pair => (
                        <option key={`custom-${pair.symbol}`} value={pair.symbol}>
                          {pair.symbol} - {pair.name} (Custom)
                        </option>
                      ))}
                    </>
                  )}
                </select>
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Current Rate
                </label>
                <div className="px-3 py-2 border border-gray-300 rounded-md text-sm bg-gray-50 dark:bg-gray-800 dark:border-gray-600">
                  {(() => {
                    let selectedPair = getDefaultCurrencyPairs().find(pair => pair.symbol === selectedCurrencyPair);
                    if (!selectedPair) {
                      selectedPair = customCurrencyPairs.find(pair => pair.symbol === selectedCurrencyPair);
                    }
                    return selectedPair ? selectedPair.defaultSpotRate.toFixed(4) : 'N/A';
                  })()}
                </div>
              </div>
            </div>
            
            <div className="flex gap-2">
              <Button
                onClick={() => setShowAddPairDialog(true)}
                variant="outline"
                size="sm"
                className="flex items-center gap-2"
              >
                <Plus className="h-4 w-4" />
                Add Custom Pair
              </Button>
              
              {customCurrencyPairs.length > 0 && (
                <Button
                  onClick={() => {
                    if (confirm('Are you sure you want to delete all custom pairs?')) {
                      saveCustomCurrencyPairs([]);
                    }
                  }}
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-2 text-red-600 hover:text-red-700"
                >
                  <X className="h-4 w-4" />
                  Delete All Custom Pairs
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Add Custom Pair Dialog */}
        {showAddPairDialog && (
          <Card className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
            <Card className="w-full max-w-md mx-4">
              <CardHeader>
                <CardTitle>Add Custom Currency Pair</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Symbol (e.g., EUR/USD)</label>
                  <Input
                    value={newPairSymbol}
                    onChange={(e) => setNewPairSymbol(e.target.value.toUpperCase())}
                    placeholder="EUR/USD"
                    maxLength={7}
                  />
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium">Full Name</label>
                  <Input
                    value={newPairName}
                    onChange={(e) => setNewPairName(e.target.value)}
                    placeholder="Euro/US Dollar"
                  />
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium">Exchange Rate</label>
                  <Input
                    type="number"
                    step="0.0001"
                    value={newPairRate}
                    onChange={(e) => setNewPairRate(e.target.value)}
                    placeholder="1.0850"
                  />
                </div>
                
                <div className="flex gap-2 justify-end">
                  <Button
                    onClick={() => setShowAddPairDialog(false)}
                    variant="outline"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={addCustomCurrencyPair}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    Add
                  </Button>
                </div>
              </CardContent>
            </Card>
          </Card>
        )}

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="market-data">Market Data</TabsTrigger>
            <TabsTrigger value="heatmap">Forex Heatmap</TabsTrigger>
            <TabsTrigger value="advanced-data">Advanced Forex Data</TabsTrigger>
          </TabsList>

          {/* Market Data Tab */}
          <TabsContent value="market-data" className="space-y-6">
            {/* Search and Filters */}
            <Card>
              <CardContent className="p-6">
                <div className="flex flex-col lg:flex-row gap-4">
                  <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="Search currencies by code or name..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Base Currency:</span>
                    <select
                      value={baseCurrency}
                      onChange={(e) => setBaseCurrency(e.target.value)}
                      className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-600"
                    >
                      {(() => {
                        const allPairs = [...getDefaultCurrencyPairs(), ...customCurrencyPairs];
                        const allCurrencies = new Set<string>();
                        allPairs.forEach(pair => {
                          allCurrencies.add(pair.base);
                          allCurrencies.add(pair.quote);
                        });
                        return Array.from(allCurrencies).sort().map(currency => (
                          <option key={currency} value={currency}>
                            {currency}
                          </option>
                        ));
                      })()}
                    </select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Market Overview */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Currencies</p>
                      <p className="text-2xl font-bold text-gray-900 dark:text-white">
                        {filteredCurrencies.length}
                      </p>
                    </div>
                    <div className="h-8 w-8 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center">
                      <Globe className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Major Pairs</p>
                      <p className="text-2xl font-bold text-green-600">
                        {getMajorPairs().length}
                      </p>
                    </div>
                    <div className="h-8 w-8 bg-green-100 dark:bg-green-900 rounded-lg flex items-center justify-center">
                      <TrendingUp className="h-4 w-4 text-green-600 dark:text-green-400" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card 
                className="cursor-pointer hover:shadow-lg transition-shadow"
                onClick={() => {
                  if (favorites.length > 0) {
                    setShowFavoritesDialog(true);
                  } else {
                    toast({
                      title: "No Favorites",
                      description: "Please add currencies to favorites first.",
                      variant: "default"
                    });
                  }
                }}
              >
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Favorites</p>
                      <p className="text-2xl font-bold text-yellow-600">
                        {favorites.length}
                      </p>
                      {favorites.length > 0 && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-1">
                          Click to use in Strategy Builder <ArrowRight className="h-3 w-3" />
                        </p>
                      )}
                    </div>
                    <div className="h-8 w-8 bg-yellow-100 dark:bg-yellow-900 rounded-lg flex items-center justify-center">
                      <Star className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Currency Rates Table */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    Currency Exchange Rates
                    <Badge variant="secondary" className="text-sm">{filteredCurrencies.length}</Badge>
                  </CardTitle>
                  {selectedCurrencyForChart && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedCurrencyForChart(null)}
                    >
                      <X className="h-4 w-4 mr-2" />
                      Close Chart
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {/* Chart for selected currency */}
                {selectedCurrencyForChart && historicalData[selectedCurrencyForChart] && (
                  <div className="mb-6 p-4 bg-muted/30 rounded-lg">
                    <h3 className="text-lg font-semibold mb-2">
                      {selectedCurrencyForChart} Rate Trend
                    </h3>
                    <ResponsiveContainer width="100%" height={200}>
                      <LineChart data={getChartData(selectedCurrencyForChart)}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="time" />
                        <YAxis />
                        <Tooltip />
                        <Line type="monotone" dataKey="rate" stroke="#3b82f6" strokeWidth={2} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}

                <div className="rounded-md border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-50 dark:bg-gray-800">
                        <TableHead className="w-[50px]"></TableHead>
                        <TableHead 
                          className="w-[120px] cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                          onClick={() => handleSort('code')}
                        >
                          <div className="flex items-center gap-1 font-semibold">
                            Currency
                            {sortField === 'code' && (
                              sortDirection === 'asc' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
                            )}
                          </div>
                        </TableHead>
                        <TableHead 
                          className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                          onClick={() => handleSort('name')}
                        >
                          <div className="flex items-center gap-1 font-semibold">
                            Name
                            {sortField === 'name' && (
                              sortDirection === 'asc' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
                            )}
                          </div>
                        </TableHead>
                        <TableHead 
                          className="text-right cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                          onClick={() => handleSort('rate')}
                        >
                          <div className="flex items-center justify-end gap-1 font-semibold">
                            Rate ({baseCurrency})
                            {sortField === 'rate' && (
                              sortDirection === 'asc' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
                            )}
                          </div>
                        </TableHead>
                        <TableHead 
                          className="text-right cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                          onClick={() => handleSort('change')}
                        >
                          <div className="flex items-center justify-end gap-1 font-semibold">
                            Change %
                            {sortField === 'change' && (
                              sortDirection === 'asc' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
                            )}
                          </div>
                        </TableHead>
                        <TableHead className="w-[100px] text-center">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {getSortedCurrencies().map((currency) => (
                        <TableRow 
                          key={currency.code} 
                          className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                        >
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => toggleFavorite(currency.code)}
                              className="h-6 w-6 p-0"
                            >
                              {favorites.includes(currency.code) ? (
                                <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                              ) : (
                                <StarOff className="h-4 w-4" />
                              )}
                            </Button>
                          </TableCell>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-gray-900 dark:text-white">{currency.code}</span>
                              {getMajorPairs().some(p => p.code === currency.code) && (
                                <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">Major</Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-gray-600 dark:text-gray-400">
                            {currency.name}
                          </TableCell>
                          <TableCell className="text-right">
                            <span className="font-mono font-semibold text-gray-900 dark:text-white">
                              {formatRate(currency.rate)}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            {currency.changePercent !== undefined && currency.changePercent !== 0 && (
                              <div className={`flex items-center justify-end gap-1 ${
                                currency.changePercent > 0 ? 'text-green-600' : 'text-red-600'
                              }`}>
                                {currency.changePercent > 0 ? (
                                  <ArrowUpRight className="h-4 w-4" />
                                ) : (
                                  <ArrowDownRight className="h-4 w-4" />
                                )}
                                <span className="font-semibold">
                                  {currency.changePercent > 0 ? '+' : ''}{currency.changePercent.toFixed(2)}%
                                </span>
                              </div>
                            )}
                            {(!currency.changePercent || currency.changePercent === 0) && (
                              <span className="text-gray-400">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center justify-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setSelectedCurrencyForChart(
                                  selectedCurrencyForChart === currency.code ? null : currency.code
                                )}
                                title="View chart"
                              >
                                <BarChart3 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            {/* Loading State */}
            {loading && (
              <Card>
                <CardContent className="p-12">
                  <div className="flex items-center justify-center">
                    <RefreshCw className="h-8 w-8 animate-spin text-blue-600" />
                    <span className="ml-2 text-gray-600">Loading market data...</span>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* No Results */}
            {!loading && filteredCurrencies.length === 0 && (
              <Card>
                <CardContent className="p-12">
                  <div className="text-center">
                    <Search className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                      No currencies found
                    </h3>
                    <p className="text-gray-600 dark:text-gray-400">
                      Try adjusting your search terms or base currency.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Forex Heatmap Tab */}
          <TabsContent value="heatmap" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Globe className="h-5 w-5" />
                  Forex Heatmap
                </CardTitle>
                <CardDescription>
                  Visual representation of currency strength and weakness across major pairs
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between flex-wrap gap-4">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Activity className="h-4 w-4" />
                      <span>Real-time currency strength indicators</span>
                    </div>
                    <Button
                      onClick={() => setWidgetKey(prev => prev + 1)}
                      variant="outline"
                      size="sm"
                      className="flex items-center gap-2"
                    >
                      <RefreshCw className="h-4 w-4" />
                      Refresh
                    </Button>
                  </div>
                  
                  <div className="bg-muted/30 rounded-lg p-4 border">
                    <TradingViewForexHeatmap
                      key={widgetKey}
                      currencies={[
                        "EUR", "USD", "JPY", "GBP", "CHF", "AUD", "CAD", "NZD", "CNY",
                        "SEK", "NOK", "DKK", "PLN", "CZK", "HUF", "RON", "BGN", "HRK",
                        "RUB", "TRY", "BRL", "MXN", "ARS", "CLP", "COP", "PEN", "ZAR",
                        "EGP", "MAD", "NGN", "KES", "INR", "PKR", "IDR", "THB", "MYR",
                        "SGD", "PHP", "VND", "KRW", "HKD", "TWD"
                      ]}
                      width="100%"
                      height={600}
                      isTransparent={true}
                    />
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                    <Card>
                      <CardContent className="p-4">
                        <div className="flex items-center gap-2">
                          <div className="h-3 w-3 rounded-full bg-green-500"></div>
                          <span className="text-sm font-medium">Strong</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          Currency is gaining strength
                        </p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4">
                        <div className="flex items-center gap-2">
                          <div className="h-3 w-3 rounded-full bg-yellow-500"></div>
                          <span className="text-sm font-medium">Neutral</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          Currency is stable
                        </p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4">
                        <div className="flex items-center gap-2">
                          <div className="h-3 w-3 rounded-full bg-red-500"></div>
                          <span className="text-sm font-medium">Weak</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          Currency is losing strength
                        </p>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Advanced Forex Data Tab */}
          <TabsContent value="advanced-data" className="h-screen">
            <div key={widgetKey} className="tradingview-widget-container" style={{ height: '80vh', width: '100%', minHeight: '600px' }}>
              <div className="tradingview-widget-container__widget"></div>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Favorites Dialog */}
      <Dialog open={showFavoritesDialog} onOpenChange={setShowFavoritesDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Select Favorite Currency</DialogTitle>
            <DialogDescription>
              Choose a favorite currency to use in Strategy Builder with base currency: <strong>{baseCurrency}</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {favorites.length === 0 ? (
              <p className="text-center text-gray-500 py-4">No favorites yet. Add currencies to favorites first.</p>
            ) : (
              favorites.map((favoriteCode) => {
                const currencyData = currencies.find(c => c.code === favoriteCode);
                const pairSymbol = `${baseCurrency}/${favoriteCode}`;
                
                return (
                  <Button
                    key={favoriteCode}
                    variant="outline"
                    className="w-full justify-between p-4 h-auto"
                    onClick={() => {
                      navigateToStrategyBuilder(favoriteCode);
                      setShowFavoritesDialog(false);
                    }}
                  >
                    <div className="flex flex-col items-start">
                      <div className="flex items-center gap-2">
                        <Star className="h-4 w-4 text-yellow-600 fill-yellow-600" />
                        <span className="font-semibold">{pairSymbol}</span>
                      </div>
                      {currencyData && (
                        <span className="text-sm text-gray-500">
                          Rate: {currencyData.rate.toFixed(4)}
                        </span>
                      )}
                    </div>
                    <ArrowRight className="h-4 w-4 text-gray-400" />
                  </Button>
                );
              })
            )}
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setShowFavoritesDialog(false)}>
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Layout>
  );
};

export default ForexMarket;
