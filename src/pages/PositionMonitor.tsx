import React, { useState, useEffect, useMemo } from "react";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { 
  Activity, 
  TrendingUp,
  TrendingDown,
  Pause,
  Play,
  RefreshCw,
  CheckCircle,
  DollarSign,
  Clock,
  Search,
  Edit2
} from "lucide-react";
import ExchangeRateService from "@/services/ExchangeRateService";
import { useToast } from "@/hooks/use-toast";
import { HedgingInstrument } from "@/services/StrategyImportService";

interface Position {
  id: string;
  currencyPair: string;
  maturity: string; // Date format YYYY-MM-DD
  position: number; // Volume (positive = Long, negative = Short)
  marketPrice: number; // Current market rate
  entryPrice: number; // Entry rate (spot price at entry, same for all maturities)
  unrealizedPnL: number;
  dailyPnL: number;
  hedgeStatus: string; // "Full", "Partial", "None"
  hedgeRatio: number; // 0-100
  lastTrade: string; // Timestamp
  manualPrice?: number; // User-edited price
}

interface SavedScenario {
  id: string;
  name: string;
  params: any;
  strategy: any[];
  results: any[];
  timestamp: number;
}

const PositionMonitor = () => {
  const { toast } = useToast();
  const [isLiveMode, setIsLiveMode] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState("5");
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [positions, setPositions] = useState<Position[]>([]);
  const [manualPrices, setManualPrices] = useState<{[key: string]: number}>({});
  const [currencyFilter, setCurrencyFilter] = useState<string>("all");
  const [maturityFilter, setMaturityFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [nettingEnabled, setNettingEnabled] = useState(false);
  
  const exchangeService = ExchangeRateService.getInstance();

  // Synchronize market prices on initial load (after positions are loaded)
  const hasSyncedOnMount = React.useRef(false);
  React.useEffect(() => {
    // Only sync once when positions are first loaded
    if (hasSyncedOnMount.current) return;
    if (positions.length === 0) return; // Wait for positions to be loaded
    
    const syncMarketPrices = async () => {
      // Wait a bit for everything to be ready
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Update market prices
      await updateMarketPrices();
      hasSyncedOnMount.current = true;
    };
    
    syncMarketPrices();
  }, [positions.length]); // Run when positions are loaded

  // Load positions from hedging instruments (exported from Strategy Builder)
  useEffect(() => {
    loadPositionsFromInstruments();
    
    // Listen for updates when new strategies are exported
    const handleInstrumentsUpdate = () => {
      loadPositionsFromInstruments();
    };
    window.addEventListener('hedgingInstrumentsUpdated', handleInstrumentsUpdate);
    
    return () => {
      window.removeEventListener('hedgingInstrumentsUpdated', handleInstrumentsUpdate);
    };
  }, []);

  // Real-time price updates
  useEffect(() => {
    if (!isLiveMode) return;

    const interval = setInterval(() => {
      updateMarketPrices();
      setLastUpdate(new Date());
    }, parseInt(refreshInterval) * 1000);

    return () => clearInterval(interval);
  }, [isLiveMode, refreshInterval, positions]);

  // Load positions from hedging instruments exported from Strategy Builder
  const loadPositionsFromInstruments = () => {
    try {
      const savedInstruments = JSON.parse(localStorage.getItem('hedgingInstruments') || '[]') as HedgingInstrument[];
      
      if (savedInstruments.length === 0) {
        toast({
          title: "No Positions Found",
          description: "Please export a strategy from Strategy Builder first.",
          variant: "destructive"
        });
        setPositions([]);
        return;
      }

      const allPositions: Position[] = [];
      const positionMap = new Map<string, Position>();

      // Group instruments by currency and maturity to aggregate positions
      savedInstruments.forEach((instrument) => {
        if (!instrument.maturity || !instrument.currency) return;

        const currencyPair = instrument.currency;
        const maturity = instrument.maturity;
        const key = `${currencyPair}-${maturity}`;

        // Calculate position from notional and quantity
        // For Forex, position = notional * quantity (positive = Long, negative = Short)
        const quantity = instrument.quantity || 1;
        const notional = instrument.notional || 0;
        const position = notional * quantity;

        // Entry price is the spot price at export time (same for all maturities)
        const entryPrice = instrument.exportSpotPrice || instrument.impliedSpotPrice || 1.0;
        
        // Initial market price (will be updated in real-time)
        const marketPrice = entryPrice;

        // Check if we already have a position for this currency/maturity
        const existing = positionMap.get(key);
        
        if (existing) {
          // Aggregate positions (netting)
          existing.position += position;
          // Entry price remains the spot price (same for all maturities, no weighted average needed)
          // The spot price is the same for all positions of the same currency pair
        } else {
          // Calculate hedge status from instrument
          const hedgeStatus = instrument.effectiveness_ratio !== undefined 
            ? (instrument.effectiveness_ratio >= 95 ? "Full" : 
               instrument.effectiveness_ratio > 0 ? "Partial" : "None")
            : (instrument.status === "Active" ? "Partial" : "None");
          
          const hedgeRatio = instrument.effectiveness_ratio || 0;

          const positionId = instrument.id;
          
          const newPosition: Position = {
            id: positionId,
            currencyPair,
            maturity,
            position,
            marketPrice,
            entryPrice,
            unrealizedPnL: 0, // Will be calculated
            dailyPnL: 0, // Will be calculated
            hedgeStatus,
            hedgeRatio,
            lastTrade: instrument.importedAt 
              ? new Date(instrument.importedAt).toLocaleTimeString()
              : new Date().toLocaleTimeString(),
          };
          
          positionMap.set(key, newPosition);
        }
      });

      allPositions.push(...Array.from(positionMap.values()));
      setPositions(allPositions);
      
      // Update prices after loading
      if (allPositions.length > 0) {
        updateMarketPrices();
      }
    } catch (error) {
      console.error('Error loading positions from instruments:', error);
      toast({
        title: "Error",
        description: "Failed to load positions from exported strategies.",
        variant: "destructive"
      });
      setPositions([]);
    }
  };

  // Update market prices from ExchangeRateService
  const updateMarketPrices = async () => {
    if (positions.length === 0) return;

    // Get unique currency pairs
    const uniquePairs = Array.from(new Set(positions.map(p => p.currencyPair)));
    
    const priceUpdates: {[key: string]: number} = {};

    for (const pair of uniquePairs) {
      try {
        // Parse currency pair (e.g., "EUR/USD")
        const [base, quote] = pair.split('/');
        
        // Get rates from service
        const rates = await exchangeService.getExchangeRates('USD');
        const formatted = exchangeService.formatCurrencyData(rates);
        
        // Find the rate for this pair
        let rate = 1.0;
        if (base === 'USD') {
          const quoteCurrency = formatted.find(c => c.code === quote);
          if (quoteCurrency) rate = quoteCurrency.rate;
        } else if (quote === 'USD') {
          const baseCurrency = formatted.find(c => c.code === base);
          if (baseCurrency) rate = 1 / baseCurrency.rate;
        } else {
          // Cross rate calculation
          const baseCurrency = formatted.find(c => c.code === base);
          const quoteCurrency = formatted.find(c => c.code === quote);
          if (baseCurrency && quoteCurrency) {
            rate = quoteCurrency.rate / baseCurrency.rate;
          }
        }

        priceUpdates[pair] = rate;
      } catch (error) {
        console.error(`Error fetching rate for ${pair}:`, error);
        // Keep existing price if fetch fails
      }
    }

    // Update positions with new prices (preserve manual prices)
    setPositions(prevPositions => 
      prevPositions.map(pos => {
        const manualPrice = manualPrices[pos.id];
        const marketPrice = manualPrice !== undefined 
          ? manualPrice 
          : (priceUpdates[pos.currencyPair] || pos.marketPrice);
        
        // Calculate P&L
        const unrealizedPnL = calculateUnrealizedPnL(pos.position, marketPrice, pos.entryPrice);
        const dailyPnL = calculateDailyPnL(pos, unrealizedPnL);

        return {
          ...pos,
          marketPrice,
          unrealizedPnL,
          dailyPnL
        };
      })
    );
  };

  // Calculate unrealized P&L
  const calculateUnrealizedPnL = (position: number, marketPrice: number, entryPrice: number): number => {
    // P&L = position × (market_price - entry_price)
    // For long positions (positive), profit when market > entry
    // For short positions (negative), profit when market < entry
    return position * (marketPrice - entryPrice);
  };

  // Calculate daily P&L (simplified - based on unrealized P&L)
  const calculateDailyPnL = (position: Position, currentUnrealizedPnL: number): number => {
    // For simplicity, use a portion of unrealized P&L as daily P&L
    // In a real system, this would track P&L from start of day
    return currentUnrealizedPnL * 0.3; // Approximation
  };

  // Handle manual price edit
  const handlePriceEdit = (positionId: string, newPrice: number) => {
    setManualPrices(prev => ({
      ...prev,
      [positionId]: newPrice
    }));

    // Update position immediately
    setPositions(prevPositions =>
      prevPositions.map(pos => {
        if (pos.id === positionId) {
          const unrealizedPnL = calculateUnrealizedPnL(pos.position, newPrice, pos.entryPrice);
          const dailyPnL = calculateDailyPnL(pos, unrealizedPnL);
          return {
            ...pos,
            marketPrice: newPrice,
            unrealizedPnL,
            dailyPnL
          };
        }
        return pos;
      })
    );
  };

  // Filter and process positions
  const filteredPositions = useMemo(() => {
    let filtered = positions;

    // Currency filter
    if (currencyFilter !== "all") {
      filtered = filtered.filter(p => p.currencyPair === currencyFilter);
    }

    // Maturity filter
    if (maturityFilter !== "all") {
      filtered = filtered.filter(p => p.maturity === maturityFilter);
    }

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(p =>
        p.currencyPair.toLowerCase().includes(query) ||
        p.maturity.includes(query) ||
        p.id.toLowerCase().includes(query)
      );
    }

    // Netting: aggregate positions by currency and maturity
    if (nettingEnabled) {
      const nettedMap = new Map<string, Position>();
      
      filtered.forEach(pos => {
        const key = `${pos.currencyPair}-${pos.maturity}`;
        const existing = nettedMap.get(key);
        
        if (existing) {
          // Aggregate positions
          const netPosition = existing.position + pos.position;
          const avgEntryPrice = (existing.entryPrice * Math.abs(existing.position) + 
                                pos.entryPrice * Math.abs(pos.position)) / 
                               (Math.abs(existing.position) + Math.abs(pos.position));
          
          const unrealizedPnL = calculateUnrealizedPnL(netPosition, pos.marketPrice, avgEntryPrice);
          const dailyPnL = calculateDailyPnL(pos, unrealizedPnL);
          
          nettedMap.set(key, {
            ...existing,
            position: netPosition,
            entryPrice: avgEntryPrice,
            unrealizedPnL,
            dailyPnL,
            hedgeStatus: existing.hedgeRatio > pos.hedgeRatio ? existing.hedgeStatus : pos.hedgeStatus,
            hedgeRatio: Math.max(existing.hedgeRatio, pos.hedgeRatio)
          });
        } else {
          nettedMap.set(key, pos);
        }
      });
      
      filtered = Array.from(nettedMap.values());
    }

    return filtered;
  }, [positions, currencyFilter, maturityFilter, searchQuery, nettingEnabled]);

  // Get unique currencies and maturities for filters
  const uniqueCurrencies = useMemo(() => {
    return Array.from(new Set(positions.map(p => p.currencyPair))).sort();
  }, [positions]);

  const uniqueMaturities = useMemo(() => {
    return Array.from(new Set(positions.map(p => p.maturity))).sort();
  }, [positions]);

  // Get base currency from currency pair
  const getBaseCurrency = (currencyPair: string): string => {
    if (currencyPair.includes('/')) {
      return currencyPair.split('/')[0];
    }
    return currencyPair;
  };

  // State for reference currency for P&L total conversion
  const [referenceCurrency, setReferenceCurrency] = useState<string>('USD');
  
  // Get unique currencies for reference currency selector
  const uniqueCurrenciesForRef = useMemo(() => {
    const currencies = Array.from(new Set(positions.map(p => getBaseCurrency(p.currencyPair))));
    // Add common currencies if not present
    const commonCurrencies = ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'AUD', 'CAD'];
    const allCurrencies = new Set([...currencies, ...commonCurrencies]);
    return Array.from(allCurrencies).sort();
  }, [positions]);

  // Calculate P&L by currency
  const pnlByCurrency = useMemo(() => {
    const unrealizedMap: { [currency: string]: number } = {};
    const dailyMap: { [currency: string]: number } = {};
    
    filteredPositions.forEach(pos => {
      const baseCurrency = getBaseCurrency(pos.currencyPair);
      
      if (!unrealizedMap[baseCurrency]) {
        unrealizedMap[baseCurrency] = 0;
      }
      if (!dailyMap[baseCurrency]) {
        dailyMap[baseCurrency] = 0;
      }
      
      unrealizedMap[baseCurrency] += pos.unrealizedPnL;
      dailyMap[baseCurrency] += pos.dailyPnL;
    });
    
    return { unrealized: unrealizedMap, daily: dailyMap };
  }, [filteredPositions]);

  // Convert P&L total to reference currency
  const [convertedUnrealizedPnL, setConvertedUnrealizedPnL] = useState<number>(0);
  const [convertedDailyPnL, setConvertedDailyPnL] = useState<number>(0);
  
  useEffect(() => {
    const convertPnL = async () => {
      if (Object.keys(pnlByCurrency.unrealized).length === 0) {
        setConvertedUnrealizedPnL(0);
        setConvertedDailyPnL(0);
        return;
      }
      
      try {
        let totalUnrealized = 0;
        let totalDaily = 0;
        
        if (referenceCurrency === 'USD') {
          // If reference is USD, convert all P&L to USD
          for (const [currency, pnl] of Object.entries(pnlByCurrency.unrealized)) {
            if (currency === 'USD') {
              totalUnrealized += pnl;
            } else {
              try {
                const rates = await exchangeService.getExchangeRates('USD');
                const rateToUSD = rates.rates[currency] ? 1 / rates.rates[currency] : 1;
                totalUnrealized += pnl * rateToUSD;
              } catch (error) {
                console.error(`Error converting ${currency} to USD:`, error);
                totalUnrealized += pnl; // Fallback: assume 1:1
              }
            }
          }
          
          for (const [currency, pnl] of Object.entries(pnlByCurrency.daily)) {
            if (currency === 'USD') {
              totalDaily += pnl;
            } else {
              try {
                const rates = await exchangeService.getExchangeRates('USD');
                const rateToUSD = rates.rates[currency] ? 1 / rates.rates[currency] : 1;
                totalDaily += pnl * rateToUSD;
              } catch (error) {
                console.error(`Error converting ${currency} to USD:`, error);
                totalDaily += pnl; // Fallback: assume 1:1
              }
            }
          }
        } else {
          // Convert all to reference currency via USD
          for (const [currency, pnl] of Object.entries(pnlByCurrency.unrealized)) {
            try {
              const rates = await exchangeService.getExchangeRates('USD');
              
              // Convert currency to USD first
              let rateToUSD = 1;
              if (currency === 'USD') {
                rateToUSD = 1;
              } else if (rates.rates[currency]) {
                rateToUSD = 1 / rates.rates[currency];
              }
              
              // Convert USD to reference currency
              let rateFromUSD = 1;
              if (referenceCurrency === 'USD') {
                rateFromUSD = 1;
              } else if (rates.rates[referenceCurrency]) {
                rateFromUSD = rates.rates[referenceCurrency]; // USD/ref
              }
              
              totalUnrealized += pnl * rateToUSD * rateFromUSD;
            } catch (error) {
              console.error(`Error converting ${currency} to ${referenceCurrency}:`, error);
            }
          }
          
          for (const [currency, pnl] of Object.entries(pnlByCurrency.daily)) {
            try {
              const rates = await exchangeService.getExchangeRates('USD');
              
              // Convert currency to USD first
              let rateToUSD = 1;
              if (currency === 'USD') {
                rateToUSD = 1;
              } else if (rates.rates[currency]) {
                rateToUSD = 1 / rates.rates[currency];
              }
              
              // Convert USD to reference currency
              let rateFromUSD = 1;
              if (referenceCurrency === 'USD') {
                rateFromUSD = 1;
              } else if (rates.rates[referenceCurrency]) {
                rateFromUSD = rates.rates[referenceCurrency]; // USD/ref
              }
              
              totalDaily += pnl * rateToUSD * rateFromUSD;
            } catch (error) {
              console.error(`Error converting ${currency} to ${referenceCurrency}:`, error);
            }
          }
        }
        
        setConvertedUnrealizedPnL(totalUnrealized);
        setConvertedDailyPnL(totalDaily);
      } catch (error) {
        console.error('Error converting P&L total:', error);
        setConvertedUnrealizedPnL(0);
        setConvertedDailyPnL(0);
      }
    };
    
    convertPnL();
  }, [pnlByCurrency, referenceCurrency]);

  const activePositions = filteredPositions.length;
  const fullyHedgedCount = filteredPositions.filter(pos => pos.hedgeStatus === "Full").length;

  // Format functions
  const formatCurrency = (amount: number, currency: string = 'USD') => {
    // Extract base currency from currency pair (e.g., "EUR/USD" -> "EUR")
    const baseCurrency = currency.includes('/') ? currency.split('/')[0] : currency;
    
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: baseCurrency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    }).format(amount);
  };

  const formatRate = (rate: number, currencyPair: string) => {
    if (currencyPair.includes("JPY")) {
      return rate.toFixed(2);
    }
    return rate.toFixed(4);
  };

  const formatPosition = (position: number, currency: string = 'USD') => {
    const baseCurrency = currency.includes('/') ? currency.split('/')[0] : currency;
    
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: baseCurrency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(Math.abs(position));
  };

  const getPnLColor = (value: number) => {
    return value >= 0 ? "text-green-600" : "text-red-600";
  };

  const getHedgeStatusBadge = (status: string, ratio: number) => {
    switch (status) {
      case "Full":
        return <Badge className="bg-green-100 text-green-800 border-green-200">Full {ratio}%</Badge>;
      case "Partial":
        return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">Partial {ratio}%</Badge>;
      case "None":
        return <Badge variant="destructive">None</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getExposureIcon = (position: number) => {
    return position >= 0 ? 
      <TrendingUp className="h-4 w-4 text-green-600" /> : 
      <TrendingDown className="h-4 w-4 text-red-600" />;
  };

  return (
    <Layout 
      breadcrumbs={[
        { label: "Dashboard", href: "/" },
        { label: "Position Monitor" }
      ]}
    >
      {/* Header Control Panel */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Real-Time Position Monitor
              </CardTitle>
              <CardDescription>
                Live monitoring of Forex positions and market movements
              </CardDescription>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center space-x-2">
                <Switch
                  id="live-mode"
                  checked={isLiveMode}
                  onCheckedChange={setIsLiveMode}
                />
                <Label htmlFor="live-mode" className="flex items-center gap-2">
                  {isLiveMode ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                  Live Mode
                </Label>
              </div>
              <Select value={refreshInterval} onValueChange={setRefreshInterval}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 sec</SelectItem>
                  <SelectItem value="5">5 sec</SelectItem>
                  <SelectItem value="10">10 sec</SelectItem>
                  <SelectItem value="30">30 sec</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={updateMarketPrices}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <div className={`h-2 w-2 rounded-full ${isLiveMode ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
                <span className="text-sm font-medium">
                  {isLiveMode ? 'Live' : 'Paused'}
                </span>
              </div>
              <div className="text-sm text-muted-foreground">
                Last Update: {lastUpdate.toLocaleTimeString()}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">Market Hours: 24/7 (Forex Markets)</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Unrealized P&L</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Select value={referenceCurrency} onValueChange={setReferenceCurrency}>
                  <SelectTrigger className="h-7 text-xs w-20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {uniqueCurrenciesForRef.map(currency => (
                      <SelectItem key={currency} value={currency}>{currency}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className={`text-2xl font-bold ${getPnLColor(convertedUnrealizedPnL)}`}>
                  {formatCurrency(convertedUnrealizedPnL, referenceCurrency)}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Total Unrealized P&L
              </p>
              {/* P&L by currency breakdown */}
              <div className="space-y-1 pt-2 border-t">
                {Object.entries(pnlByCurrency.unrealized).map(([currency, pnl]) => (
                  <div key={currency} className="flex justify-between text-xs">
                    <span className="text-muted-foreground">{currency}:</span>
                    <span className={getPnLColor(pnl)}>{formatCurrency(pnl, currency)}</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Daily P&L</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Select value={referenceCurrency} onValueChange={setReferenceCurrency}>
                  <SelectTrigger className="h-7 text-xs w-20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {uniqueCurrenciesForRef.map(currency => (
                      <SelectItem key={currency} value={currency}>{currency}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className={`text-2xl font-bold ${getPnLColor(convertedDailyPnL)}`}>
                  {formatCurrency(convertedDailyPnL, referenceCurrency)}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Today's performance
              </p>
              {/* Daily P&L by currency breakdown */}
              <div className="space-y-1 pt-2 border-t">
                {Object.entries(pnlByCurrency.daily).map(([currency, pnl]) => (
                  <div key={currency} className="flex justify-between text-xs">
                    <span className="text-muted-foreground">{currency}:</span>
                    <span className={getPnLColor(pnl)}>{formatCurrency(pnl, currency)}</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Positions</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activePositions}</div>
            <p className="text-xs text-muted-foreground">
              Open positions
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Hedge Coverage</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fullyHedgedCount}/{activePositions}</div>
            <p className="text-xs text-muted-foreground">
              Fully hedged
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Live Positions Table */}
      <Card>
        <CardHeader>
          <CardTitle>Live Positions</CardTitle>
          <CardDescription>
            Real-time position updates and P&L - Detailed by Maturity - Synchronized with Forex Exposures.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-4 mb-4">
            <div className="flex items-center gap-2">
              <Label htmlFor="currency-filter">Currency:</Label>
              <Select value={currencyFilter} onValueChange={setCurrencyFilter}>
                <SelectTrigger id="currency-filter" className="w-48">
                  <SelectValue placeholder="All Currencies" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Currencies</SelectItem>
                  {uniqueCurrencies.map(currency => (
                    <SelectItem key={currency} value={currency}>{currency}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex items-center gap-2">
              <Label htmlFor="maturity-filter">Maturity:</Label>
              <Select value={maturityFilter} onValueChange={setMaturityFilter}>
                <SelectTrigger id="maturity-filter" className="w-48">
                  <SelectValue placeholder="All Maturities" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Maturities</SelectItem>
                  {uniqueMaturities.map(maturity => (
                    <SelectItem key={maturity} value={maturity}>{maturity}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2 flex-1">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="max-w-sm"
              />
            </div>

            <div className="flex items-center gap-2">
              <Label htmlFor="netting">Netting:</Label>
              <Switch
                id="netting"
                checked={nettingEnabled}
                onCheckedChange={setNettingEnabled}
              />
              <Label htmlFor="netting" className="text-sm">
                {nettingEnabled ? "Enabled" : "Disabled"}
              </Label>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Currency</TableHead>
                  <TableHead>Maturity</TableHead>
                  <TableHead>Position</TableHead>
                  <TableHead>Market Price</TableHead>
                  <TableHead>Entry Price</TableHead>
                  <TableHead>Unrealized P&L</TableHead>
                  <TableHead>Daily P&L</TableHead>
                  <TableHead>Hedge Status</TableHead>
                  <TableHead>Last Trade</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPositions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                      No positions found. Please export a strategy from Strategy Builder first.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredPositions.map((position) => (
                    <TableRow key={position.id}>
                      <TableCell>
                        <Badge variant="outline" className="font-mono">
                          {position.currencyPair}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono">
                        {new Date(position.maturity).toLocaleDateString('en-GB')}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getExposureIcon(position.position)}
                          <span className="font-mono">
                            {formatPosition(position.position, position.currencyPair)}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            value={position.marketPrice.toFixed(4)}
                            onChange={(e) => {
                              const newPrice = parseFloat(e.target.value) || position.marketPrice;
                              handlePriceEdit(position.id, newPrice);
                            }}
                            className="w-24 h-8 text-right font-mono text-sm"
                            step="0.0001"
                          />
                          <Edit2 className="h-3 w-3 text-muted-foreground" />
                        </div>
                      </TableCell>
                      <TableCell className="font-mono">
                        {formatRate(position.entryPrice, position.currencyPair)}
                      </TableCell>
                      <TableCell>
                        <span className={`font-mono font-medium ${getPnLColor(position.unrealizedPnL)}`}>
                          {formatCurrency(position.unrealizedPnL, position.currencyPair)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className={`font-mono font-medium ${getPnLColor(position.dailyPnL)}`}>
                          {formatCurrency(position.dailyPnL, position.currencyPair)}
                        </span>
                      </TableCell>
                      <TableCell>
                        {getHedgeStatusBadge(position.hedgeStatus, position.hedgeRatio)}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {position.lastTrade}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </Layout>
  );
};

export default PositionMonitor;
