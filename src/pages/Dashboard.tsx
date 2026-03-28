import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useFinancialData } from "@/hooks/useFinancialData";
import { useTheme } from "@/hooks/useTheme";
import ExchangeRateService from "@/services/ExchangeRateService";
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Shield, 
  AlertTriangle,
  BarChart3,
  Globe,
  Target,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  Play,
  Pause
} from "lucide-react";

const Dashboard = () => {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const { 
    riskMetrics, 
    currencyExposures, 
    marketData, 
    isLiveMode, 
    setLiveMode, 
    lastUpdate,
    updateMarketData,
    generateStressScenarios
  } = useFinancialData();

  // Reference currency from settings
  const [refCurrency, setRefCurrency] = useState<string>(() => {
    try {
      const s = localStorage.getItem('fxRiskManagerSettings');
      if (s) return JSON.parse(s)?.company?.currency || 'USD';
    } catch { /* ignore */ }
    return 'USD';
  });

  useEffect(() => {
    const update = () => {
      try {
        const s = localStorage.getItem('fxRiskManagerSettings');
        if (s) setRefCurrency(JSON.parse(s)?.company?.currency || 'USD');
      } catch { /* ignore */ }
    };
    window.addEventListener('baseCurrencyChanged', update);
    window.addEventListener('storage', update);
    return () => {
      window.removeEventListener('baseCurrencyChanged', update);
      window.removeEventListener('storage', update);
    };
  }, []);

  // State for market overview data - Only real data from API
  const [marketOverviewData, setMarketOverviewData] = useState<{
    EUR_USD: { rate: number; change: number };
    GBP_USD: { rate: number; change: number };
    USD_JPY: { rate: number; change: number };
    USD_CHF: { rate: number; change: number };
    USD_CAD: { rate: number; change: number };
    AUD_USD: { rate: number; change: number };
    NZD_USD: { rate: number; change: number };
    USD_CNY: { rate: number; change: number };
    USD_INR: { rate: number; change: number };
    USD_BRL: { rate: number; change: number };
    USD_MXN: { rate: number; change: number };
    USD_TRY: { rate: number; change: number };
  } | null>(null);

  // State to track previous rates for change calculation
  const [previousRates, setPreviousRates] = useState<{
    EUR_USD: number;
    GBP_USD: number;
    USD_JPY: number;
    USD_CHF: number;
    USD_CAD: number;
    AUD_USD: number;
    NZD_USD: number;
    USD_CNY: number;
    USD_INR: number;
    USD_BRL: number;
    USD_MXN: number;
    USD_TRY: number;
  } | null>(null);

  const exchangeRateService = ExchangeRateService.getInstance();


  // Function to get theme-adaptive text colors using CSS classes
  const getTextColors = () => {
    return {
      rate: 'text-slate-700 group-hover:text-slate-600 dark:text-lime-300 dark:group-hover:text-lime-200 bloomberg-theme:text-orange-300 bloomberg-theme:group-hover:text-orange-200',
      pair: 'text-slate-500 dark:text-lime-400/80 bloomberg-theme:text-orange-400/80',
      change: 'text-emerald-600 dark:text-emerald-400 bloomberg-theme:text-emerald-400'
    };
  };

  const textColors = getTextColors();

  // Function to get theme-adaptive currency card colors using CSS classes
  const getCurrencyCardClasses = (baseColor: string) => {
    const colorMap = {
      blue: 'from-lime-100/80 to-lime-50/60 border-lime-300/40 hover:border-lime-400/60 hover:shadow-lime-400/20 dark:from-lime-900/30 dark:to-lime-800/20 dark:border-lime-500/30 dark:hover:border-lime-400/60 dark:hover:shadow-lime-500/20 bloomberg-theme:from-orange-800/30 bloomberg-theme:to-orange-700/20 bloomberg-theme:border-orange-500/30 bloomberg-theme:hover:border-orange-400/60 bloomberg-theme:hover:shadow-orange-500/20',
      purple: 'from-emerald-100/80 to-emerald-50/60 border-emerald-300/40 hover:border-emerald-400/60 hover:shadow-emerald-400/20 dark:from-emerald-900/30 dark:to-emerald-800/20 dark:border-emerald-500/30 dark:hover:border-emerald-400/60 dark:hover:shadow-emerald-500/20 bloomberg-theme:from-yellow-800/30 bloomberg-theme:to-yellow-700/20 bloomberg-theme:border-yellow-500/30 bloomberg-theme:hover:border-yellow-400/60 bloomberg-theme:hover:shadow-yellow-500/20',
      cyan: 'from-cyan-100/80 to-cyan-50/60 border-cyan-300/40 hover:border-cyan-400/60 hover:shadow-cyan-400/20 dark:from-cyan-900/30 dark:to-cyan-800/20 dark:border-cyan-500/30 dark:hover:border-cyan-400/60 dark:hover:shadow-cyan-500/20 bloomberg-theme:from-orange-700/30 bloomberg-theme:to-orange-600/20 bloomberg-theme:border-orange-400/30 bloomberg-theme:hover:border-orange-300/60 bloomberg-theme:hover:shadow-orange-400/20',
      emerald: 'from-emerald-100/80 to-emerald-50/60 border-emerald-300/40 hover:border-emerald-400/60 hover:shadow-emerald-400/20 dark:from-emerald-900/30 dark:to-emerald-800/20 dark:border-emerald-500/30 dark:hover:border-emerald-400/60 dark:hover:shadow-emerald-500/20 bloomberg-theme:from-yellow-700/30 bloomberg-theme:to-yellow-600/20 bloomberg-theme:border-yellow-400/30 bloomberg-theme:hover:border-yellow-300/60 bloomberg-theme:hover:shadow-yellow-400/20',
      orange: 'from-orange-100/80 to-orange-50/60 border-orange-300/40 hover:border-orange-400/60 hover:shadow-orange-400/20 dark:from-orange-900/30 dark:to-orange-800/20 dark:border-orange-500/30 dark:hover:border-orange-400/60 dark:hover:shadow-orange-500/20 bloomberg-theme:from-orange-600/30 bloomberg-theme:to-orange-500/20 bloomberg-theme:border-orange-300/30 bloomberg-theme:hover:border-orange-200/60 bloomberg-theme:hover:shadow-orange-300/20',
      rose: 'from-rose-100/80 to-rose-50/60 border-rose-300/40 hover:border-rose-400/60 hover:shadow-rose-400/20 dark:from-rose-900/30 dark:to-rose-800/20 dark:border-rose-500/30 dark:hover:border-rose-400/60 dark:hover:shadow-rose-500/20 bloomberg-theme:from-red-800/30 bloomberg-theme:to-red-700/20 bloomberg-theme:border-red-500/30 bloomberg-theme:hover:border-red-400/60 bloomberg-theme:hover:shadow-red-500/20',
      indigo: 'from-lime-100/80 to-lime-50/60 border-lime-300/40 hover:border-lime-400/60 hover:shadow-lime-400/20 dark:from-lime-900/30 dark:to-lime-800/20 dark:border-lime-500/30 dark:hover:border-lime-400/60 dark:hover:shadow-lime-500/20 bloomberg-theme:from-orange-900/30 bloomberg-theme:to-orange-800/20 bloomberg-theme:border-orange-600/30 bloomberg-theme:hover:border-orange-500/60 bloomberg-theme:hover:shadow-orange-600/20',
      yellow: 'from-yellow-100/80 to-yellow-50/60 border-yellow-300/40 hover:border-yellow-400/60 hover:shadow-yellow-400/20 dark:from-yellow-900/30 dark:to-yellow-800/20 dark:border-yellow-500/30 dark:hover:border-yellow-400/60 dark:hover:shadow-yellow-500/20 bloomberg-theme:from-yellow-600/30 bloomberg-theme:to-yellow-500/20 bloomberg-theme:border-yellow-300/30 bloomberg-theme:hover:border-yellow-200/60 bloomberg-theme:hover:shadow-yellow-300/20',
      teal: 'from-teal-100/80 to-teal-50/60 border-teal-300/40 hover:border-teal-400/60 hover:shadow-teal-400/20 dark:from-teal-900/30 dark:to-teal-800/20 dark:border-teal-500/30 dark:hover:border-teal-400/60 dark:hover:shadow-teal-500/20 bloomberg-theme:from-orange-800/30 bloomberg-theme:to-orange-700/20 bloomberg-theme:border-orange-500/30 bloomberg-theme:hover:border-orange-400/60 bloomberg-theme:hover:shadow-orange-500/20',
      pink: 'from-pink-100/80 to-pink-50/60 border-pink-300/40 hover:border-pink-400/60 hover:shadow-pink-400/20 dark:from-pink-900/30 dark:to-pink-800/20 dark:border-pink-500/30 dark:hover:border-pink-400/60 dark:hover:shadow-pink-500/20 bloomberg-theme:from-red-700/30 bloomberg-theme:to-red-600/20 bloomberg-theme:border-red-400/30 bloomberg-theme:hover:border-red-300/60 bloomberg-theme:hover:shadow-red-400/20',
      violet: 'from-emerald-100/80 to-emerald-50/60 border-emerald-300/40 hover:border-emerald-400/60 hover:shadow-emerald-400/20 dark:from-emerald-900/30 dark:to-emerald-800/20 dark:border-emerald-500/30 dark:hover:border-emerald-400/60 dark:hover:shadow-emerald-500/20 bloomberg-theme:from-orange-800/30 bloomberg-theme:to-orange-700/20 bloomberg-theme:border-orange-500/30 bloomberg-theme:hover:border-orange-400/60 bloomberg-theme:hover:shadow-orange-500/20',
      amber: 'from-amber-100/80 to-amber-50/60 border-amber-300/40 hover:border-amber-400/60 hover:shadow-amber-400/20 dark:from-amber-900/30 dark:to-amber-800/20 dark:border-amber-500/30 dark:hover:border-amber-400/60 dark:hover:shadow-amber-500/20 bloomberg-theme:from-yellow-700/30 bloomberg-theme:to-yellow-600/20 bloomberg-theme:border-yellow-400/30 bloomberg-theme:hover:border-yellow-300/60 bloomberg-theme:hover:shadow-yellow-400/20'
    };

    return colorMap[baseColor as keyof typeof colorMap] || colorMap.blue;
  };

  // Function to load market overview data from Forex Market
  const loadMarketOverviewData = async () => {
    try {
      const exchangeData = await exchangeRateService.getExchangeRates('USD');
      
      // Get current rates - CORRECTION: Invert EUR, GBP, AUD, NZD rates since API returns USD-based rates
      const currentRates = {
        EUR_USD: 1 / exchangeData.rates.EUR, // Invert: 1/EUR_rate = EUR/USD
        GBP_USD: 1 / exchangeData.rates.GBP, // Invert: 1/GBP_rate = GBP/USD
        USD_JPY: exchangeData.rates.JPY, // Direct: USD/JPY
        USD_CHF: exchangeData.rates.CHF, // Direct: USD/CHF
        USD_CAD: exchangeData.rates.CAD, // Direct: USD/CAD
        AUD_USD: 1 / exchangeData.rates.AUD, // Invert: 1/AUD_rate = AUD/USD
        NZD_USD: 1 / exchangeData.rates.NZD, // Invert: 1/NZD_rate = NZD/USD
        USD_CNY: exchangeData.rates.CNY, // Direct: USD/CNY
        USD_INR: exchangeData.rates.INR, // Direct: USD/INR
        USD_BRL: exchangeData.rates.BRL, // Direct: USD/BRL
        USD_MXN: exchangeData.rates.MXN, // Direct: USD/MXN
        USD_TRY: exchangeData.rates.TRY  // Direct: USD/TRY
      };
      
      // Calculate changes based on previous rates (only if we have previous data)
      const newMarketData = {
        EUR_USD: { 
          rate: currentRates.EUR_USD, 
          change: previousRates ? calculateChange(currentRates.EUR_USD, previousRates.EUR_USD) : 0
        },
        GBP_USD: { 
          rate: currentRates.GBP_USD, 
          change: previousRates ? calculateChange(currentRates.GBP_USD, previousRates.GBP_USD) : 0
        },
        USD_JPY: { 
          rate: currentRates.USD_JPY, 
          change: previousRates ? calculateChange(currentRates.USD_JPY, previousRates.USD_JPY) : 0
        },
        USD_CHF: { 
          rate: currentRates.USD_CHF, 
          change: previousRates ? calculateChange(currentRates.USD_CHF, previousRates.USD_CHF) : 0
        },
        USD_CAD: { 
          rate: currentRates.USD_CAD, 
          change: previousRates ? calculateChange(currentRates.USD_CAD, previousRates.USD_CAD) : 0
        },
        AUD_USD: { 
          rate: currentRates.AUD_USD, 
          change: previousRates ? calculateChange(currentRates.AUD_USD, previousRates.AUD_USD) : 0
        },
        NZD_USD: { 
          rate: currentRates.NZD_USD, 
          change: previousRates ? calculateChange(currentRates.NZD_USD, previousRates.NZD_USD) : 0
        },
        USD_CNY: { 
          rate: currentRates.USD_CNY, 
          change: previousRates ? calculateChange(currentRates.USD_CNY, previousRates.USD_CNY) : 0
        },
        USD_INR: { 
          rate: currentRates.USD_INR, 
          change: previousRates ? calculateChange(currentRates.USD_INR, previousRates.USD_INR) : 0
        },
        USD_BRL: { 
          rate: currentRates.USD_BRL, 
          change: previousRates ? calculateChange(currentRates.USD_BRL, previousRates.USD_BRL) : 0
        },
        USD_MXN: { 
          rate: currentRates.USD_MXN, 
          change: previousRates ? calculateChange(currentRates.USD_MXN, previousRates.USD_MXN) : 0
        },
        USD_TRY: { 
          rate: currentRates.USD_TRY, 
          change: previousRates ? calculateChange(currentRates.USD_TRY, previousRates.USD_TRY) : 0
        }
      };
      
      // Update states
      setMarketOverviewData(newMarketData);
      setPreviousRates(currentRates);
    } catch (error) {
      console.error('Error loading market overview data:', error);
    }
  };

  // Helper function to calculate percentage change
  const calculateChange = (currentRate: number, previousRate: number): number => {
    if (!previousRate || previousRate === 0) return 0;
    return ((currentRate - previousRate) / previousRate) * 100;
  };

  // Load market data on component mount and when live mode is enabled
  useEffect(() => {
    loadMarketOverviewData();
    
    if (isLiveMode) {
      const interval = setInterval(loadMarketOverviewData, 30000); // Update every 30 seconds
      return () => clearInterval(interval);
    }
  }, [isLiveMode]);

  // Generate real-time alerts based on actual data
  const generateAlerts = () => {
    const alerts = [];
    
    // Check volatility alerts
    Object.entries(marketData.volatilities).forEach(([pair, vol]) => {
      if (vol > 0.15) { // 15% volatility threshold
        alerts.push({
          type: "high",
          message: `${pair} volatility above ${(vol * 100).toFixed(1)}%`,
          time: "Real-time"
        });
      }
    });

    // Check hedge ratio alerts
    currencyExposures.forEach(exp => {
      if (exp.hedgeRatio < 60 && exp.grossExposure > 1000000) {
        alerts.push({
          type: "medium",
          message: `${exp.currency} hedge ratio below target (${exp.hedgeRatio.toFixed(1)}%)`,
          time: "Real-time"
        });
      }
    });

    // Check VaR alerts
    if (riskMetrics.var95 > 500000) {
      const varSym = refCurrency === "EUR" ? "€" : refCurrency === "GBP" ? "£" : refCurrency === "JPY" ? "¥" : "$";
      alerts.push({
        type: "high",
        message: `VaR exceeds ${varSym}${(riskMetrics.var95 / 1000).toFixed(0)}K threshold`,
        time: "Real-time"
      });
    }

    return alerts.slice(0, 3); // Show only top 3 alerts
  };

  const alerts = generateAlerts();

  const formatCurrency = (amount: number, currency: string) => {
    if (currency === "JPY") {
      return `¥${(amount / 1000000).toFixed(1)}M`;
    }
    const sym = currency === "USD" ? "$" : currency === "EUR" ? "€" : currency === "GBP" ? "£" : `${currency} `;
    return `${sym}${(amount / 1000000).toFixed(1)}M`;
  };

  /**
   * Format an amount in the reference currency.
   * useK: if true, show in K instead of M (for MTM which can be small).
   */
  const formatRefAmount = (amount: number, ccy: string, useK = false) => {
    const absAmt = Math.abs(amount);
    const sym = ccy === "USD" ? "$" : ccy === "EUR" ? "€" : ccy === "GBP" ? "£" : ccy === "JPY" ? "¥" : `${ccy} `;
    if (useK) {
      return `${sym}${(absAmt / 1000).toFixed(0)}K`;
    }
    if (absAmt >= 1_000_000) {
      return `${sym}${(absAmt / 1_000_000).toFixed(1)}M`;
    }
    return `${sym}${(absAmt / 1000).toFixed(0)}K`;
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case "up": return <TrendingUp className="h-4 w-4 text-green-500" />;
      case "down": return <TrendingDown className="h-4 w-4 text-red-500" />;
      default: return <Activity className="h-4 w-4 text-gray-500" />;
    }
  };

  const getAlertVariant = (type: string) => {
    switch (type) {
      case "high": return "destructive";
      case "medium": return "secondary";
      default: return "outline";
    }
  };

  return (
    <Layout 
      title="Dashboard"
      breadcrumbs={[
        { label: "Dashboard" }
      ]}
    >
      {/* Real-time Controls */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          <div className="text-sm text-muted-foreground">
            Last updated: {lastUpdate.toLocaleTimeString()}
          </div>
          <div className={`flex items-center gap-2 text-sm ${isLiveMode ? 'text-green-600' : 'text-gray-600'}`}>
            {isLiveMode ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
            {isLiveMode ? 'Live Mode' : 'Static Mode'}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={updateMarketData}
            className="flex items-center gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh Data
          </Button>
          <Button
            variant={isLiveMode ? "destructive" : "default"}
            size="sm"
            onClick={() => setLiveMode(!isLiveMode)}
            className="flex items-center gap-2"
          >
            {isLiveMode ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            {isLiveMode ? 'Stop Live' : 'Start Live'}
          </Button>
        </div>
      </div>
      {/* Key Metrics Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Exposure</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatRefAmount(riskMetrics.totalExposure, refCurrency)}
            </div>
            <p className="text-xs text-muted-foreground">
              <span className="text-green-600 flex items-center gap-1">
                <ArrowUpRight className="h-3 w-3" />
                Real-time calculation
              </span>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Hedged Amount</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatRefAmount(riskMetrics.hedgedAmount, refCurrency)}
            </div>
            <p className="text-xs text-muted-foreground">
              <span className={`flex items-center gap-1 ${riskMetrics.hedgeRatio > 70 ? 'text-green-600' : 'text-yellow-600'}`}>
                {riskMetrics.hedgeRatio > 70 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                {riskMetrics.hedgeRatio.toFixed(1)}% hedge ratio
              </span>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Unhedged Risk</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatRefAmount(riskMetrics.unhedgedRisk, refCurrency)}
            </div>
            <p className="text-xs text-muted-foreground">
              <span className={`flex items-center gap-1 ${riskMetrics.unhedgedRisk > 2000000 ? 'text-red-600' : 'text-yellow-600'}`}>
                <AlertTriangle className="h-3 w-3" />
                {riskMetrics.unhedgedRisk > 2000000 ? 'High' : 'Medium'} priority
              </span>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">MTM Impact</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${riskMetrics.mtmImpact >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {riskMetrics.mtmImpact >= 0 ? '+' : ''}{formatRefAmount(riskMetrics.mtmImpact, refCurrency, true)}
            </div>
            <p className="text-xs text-muted-foreground">
              <span className={`flex items-center gap-1 ${riskMetrics.mtmImpact >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {riskMetrics.mtmImpact >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                {riskMetrics.mtmImpact >= 0 ? 'Favorable' : 'Unfavorable'} movements
              </span>
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        {/* Currency Exposure Overview */}
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" />
              Currency Exposure Overview
            </CardTitle>
            <CardDescription>
              Breakdown of exposures and hedge ratios by currency
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {currencyExposures.map((item) => (
              <div key={item.currency} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="font-mono">
                        {item.currency}
                      </Badge>
                      {getTrendIcon(item.trend)}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {formatRefAmount(item.grossExposure, refCurrency)} exposure
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium">
                      {formatRefAmount(item.hedgedAmount, refCurrency)} hedged
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {item.hedgeRatio.toFixed(1)}% ratio
                    </div>
                  </div>
                </div>
                <Progress value={item.hedgeRatio} className="h-2" />
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Risk Alerts */}
        <Card className="col-span-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Risk Alerts
            </CardTitle>
            <CardDescription>
              Active alerts and notifications
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {alerts.map((alert, index) => (
              <div key={index} className="flex items-start gap-3 p-3 rounded-lg border bg-card">
                <div className={`h-2 w-2 rounded-full mt-2 ${
                  alert.type === "high" ? "bg-red-500" : 
                  alert.type === "medium" ? "bg-yellow-500" : "bg-lime-500"
                }`} />
                <div className="flex-1">
                  <p className="text-sm font-medium">{alert.message}</p>
                  <p className="text-xs text-muted-foreground mt-1">{alert.time}</p>
                </div>
              </div>
            ))}
            <Button variant="outline" className="w-full" size="sm" onClick={() => navigate('/risk-analysis')}>
              View All Alerts
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card
          className="hover:shadow-md transition-shadow cursor-pointer"
          onClick={() => navigate('/strategy-builder')}
        >
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Target className="h-5 w-5 text-primary" />
              Strategy Builder
            </CardTitle>
            <CardDescription>
              Build and test new hedging strategies
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" onClick={(e) => { e.stopPropagation(); navigate('/strategy-builder'); }}>
              Create New Strategy
            </Button>
          </CardContent>
        </Card>

        <Card
          className="hover:shadow-md transition-shadow cursor-pointer"
          onClick={() => navigate('/risk-analysis')}
        >
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="h-5 w-5 text-primary" />
              Risk Analysis
            </CardTitle>
            <CardDescription>
              Run scenario analysis and stress tests
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" className="w-full" onClick={(e) => { e.stopPropagation(); navigate('/risk-analysis'); }}>
              Run Analysis
            </Button>
          </CardContent>
        </Card>

        <Card
          className="hover:shadow-md transition-shadow cursor-pointer"
          onClick={() => navigate('/positions')}
        >
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-5 w-5 text-primary" />
              Live Positions
            </CardTitle>
            <CardDescription>
              Monitor real-time position changes
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" className="w-full" onClick={(e) => { e.stopPropagation(); navigate('/positions'); }}>
              View Positions
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Market Overview - Theme-Adaptive Futuristic Design */}
      <Card className="relative overflow-hidden bg-gradient-to-br from-slate-50 via-white to-slate-100 border-slate-200 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 dark:border-slate-700 bloomberg-theme:from-orange-950 bloomberg-theme:via-orange-900 bloomberg-theme:to-orange-950 bloomberg-theme:border-orange-800">
        {/* Animated background pattern - Theme adaptive */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute inset-0 bg-gradient-to-br from-lime-500/5 to-emerald-500/5 dark:from-lime-500/10 dark:to-emerald-500/10 bloomberg-theme:from-orange-500/15 bloomberg-theme:to-yellow-500/15 rounded-lg"></div>
          <div className="absolute top-0 left-0 w-full h-full bg-[linear-gradient(45deg,transparent_25%,rgba(196,216,46,0.07)_50%,transparent_75%)] bg-[length:20px_20px] animate-pulse"></div>
        </div>
        
        <CardHeader className="relative z-10">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-xl font-bold bg-gradient-to-r from-lime-600 via-emerald-600 to-teal-600 dark:from-lime-400 dark:via-emerald-400 dark:to-teal-400 bloomberg-theme:from-orange-400 bloomberg-theme:via-yellow-400 bloomberg-theme:to-orange-300 bg-clip-text text-transparent">
                Market Overview
              </CardTitle>
              <CardDescription className="text-slate-600 dark:text-slate-300 bloomberg-theme:text-orange-200">
                Real-time FX rates and market movements
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={loadMarketOverviewData}
              className="flex items-center gap-2 bg-slate-100/80 border-slate-300 text-slate-700 hover:bg-slate-200/80 hover:border-lime-500 dark:bg-slate-800/50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700/50 dark:hover:border-lime-400 bloomberg-theme:bg-orange-900/50 bloomberg-theme:border-orange-700 bloomberg-theme:text-orange-200 bloomberg-theme:hover:bg-orange-800/50 bloomberg-theme:hover:border-orange-500 transition-all duration-300"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
          </div>
        </CardHeader>
        
        <CardContent className="relative z-10">
          {marketOverviewData ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
              {/* Major Pairs */}
              <div className={`group relative p-4 rounded-xl bg-gradient-to-br ${getCurrencyCardClasses('blue')} transition-all duration-300 hover:shadow-lg`}>
                <div className="absolute inset-0 bg-gradient-to-br from-lime-500/10 to-transparent rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                <div className="relative">
                  <div className={`text-lg font-mono font-bold ${textColors.rate} transition-colors`}>
                    {marketOverviewData.EUR_USD.rate.toFixed(4)}
                  </div>
                  <div className={`text-sm ${textColors.pair} font-medium`}>EUR/USD</div>
                  <div className={`text-xs font-semibold ${marketOverviewData.EUR_USD.change >= 0 ? textColors.change : 'text-red-400'}`}>
                    {marketOverviewData.EUR_USD.change >= 0 ? '↗' : '↘'} {marketOverviewData.EUR_USD.change >= 0 ? '+' : ''}{marketOverviewData.EUR_USD.change.toFixed(2)}%
                  </div>
                </div>
              </div>

              <div className={`group relative p-4 rounded-xl bg-gradient-to-br ${getCurrencyCardClasses('purple')} transition-all duration-300 hover:shadow-lg`}>
                <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 to-transparent rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                <div className="relative">
                  <div className="text-lg font-mono font-bold text-emerald-300 group-hover:text-emerald-200 transition-colors">
                    {marketOverviewData.GBP_USD.rate.toFixed(4)}
                  </div>
                  <div className="text-sm text-emerald-400/80 font-medium">GBP/USD</div>
                  <div className={`text-xs font-semibold ${marketOverviewData.GBP_USD.change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {marketOverviewData.GBP_USD.change >= 0 ? '↗' : '↘'} {marketOverviewData.GBP_USD.change >= 0 ? '+' : ''}{marketOverviewData.GBP_USD.change.toFixed(2)}%
                  </div>
                </div>
              </div>

              <div className={`group relative p-4 rounded-xl bg-gradient-to-br ${getCurrencyCardClasses('cyan')} transition-all duration-300 hover:shadow-lg`}>
                <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 to-transparent rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                <div className="relative">
                  <div className="text-lg font-mono font-bold text-cyan-300 group-hover:text-cyan-200 transition-colors">
                    {marketOverviewData.USD_JPY.rate.toFixed(2)}
                  </div>
                  <div className="text-sm text-cyan-400/80 font-medium">USD/JPY</div>
                  <div className={`text-xs font-semibold ${marketOverviewData.USD_JPY.change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {marketOverviewData.USD_JPY.change >= 0 ? '↗' : '↘'} {marketOverviewData.USD_JPY.change >= 0 ? '+' : ''}{marketOverviewData.USD_JPY.change.toFixed(2)}%
                  </div>
                </div>
              </div>

              <div className={`group relative p-4 rounded-xl bg-gradient-to-br ${getCurrencyCardClasses('emerald')} transition-all duration-300 hover:shadow-lg`}>
                <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 to-transparent rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                <div className="relative">
                  <div className="text-lg font-mono font-bold text-emerald-300 group-hover:text-emerald-200 transition-colors">
                    {marketOverviewData.USD_CHF.rate.toFixed(4)}
                  </div>
                  <div className="text-sm text-emerald-400/80 font-medium">USD/CHF</div>
                  <div className={`text-xs font-semibold ${marketOverviewData.USD_CHF.change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {marketOverviewData.USD_CHF.change >= 0 ? '↗' : '↘'} {marketOverviewData.USD_CHF.change >= 0 ? '+' : ''}{marketOverviewData.USD_CHF.change.toFixed(2)}%
                  </div>
                </div>
              </div>

              <div className={`group relative p-4 rounded-xl bg-gradient-to-br ${getCurrencyCardClasses('orange')} transition-all duration-300 hover:shadow-lg`}>
                <div className="absolute inset-0 bg-gradient-to-br from-orange-500/10 to-transparent rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                <div className="relative">
                  <div className="text-lg font-mono font-bold text-orange-300 group-hover:text-orange-200 transition-colors">
                    {marketOverviewData.USD_CAD.rate.toFixed(4)}
                  </div>
                  <div className="text-sm text-orange-400/80 font-medium">USD/CAD</div>
                  <div className={`text-xs font-semibold ${marketOverviewData.USD_CAD.change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {marketOverviewData.USD_CAD.change >= 0 ? '↗' : '↘'} {marketOverviewData.USD_CAD.change >= 0 ? '+' : ''}{marketOverviewData.USD_CAD.change.toFixed(2)}%
                  </div>
                </div>
              </div>

              <div className={`group relative p-4 rounded-xl bg-gradient-to-br ${getCurrencyCardClasses('rose')} transition-all duration-300 hover:shadow-lg`}>
                <div className="absolute inset-0 bg-gradient-to-br from-rose-500/10 to-transparent rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                <div className="relative">
                  <div className="text-lg font-mono font-bold text-rose-300 group-hover:text-rose-200 transition-colors">
                    {marketOverviewData.AUD_USD.rate.toFixed(4)}
                  </div>
                  <div className="text-sm text-rose-400/80 font-medium">AUD/USD</div>
                  <div className={`text-xs font-semibold ${marketOverviewData.AUD_USD.change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {marketOverviewData.AUD_USD.change >= 0 ? '↗' : '↘'} {marketOverviewData.AUD_USD.change >= 0 ? '+' : ''}{marketOverviewData.AUD_USD.change.toFixed(2)}%
                  </div>
                </div>
              </div>

              <div className={`group relative p-4 rounded-xl bg-gradient-to-br ${getCurrencyCardClasses('indigo')} transition-all duration-300 hover:shadow-lg`}>
                <div className="absolute inset-0 bg-gradient-to-br from-lime-500/10 to-transparent rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                <div className="relative">
                  <div className="text-lg font-mono font-bold text-lime-300 group-hover:text-lime-200 transition-colors">
                    {marketOverviewData.NZD_USD.rate.toFixed(4)}
                  </div>
                  <div className="text-sm text-lime-400/80 font-medium">NZD/USD</div>
                  <div className={`text-xs font-semibold ${marketOverviewData.NZD_USD.change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {marketOverviewData.NZD_USD.change >= 0 ? '↗' : '↘'} {marketOverviewData.NZD_USD.change >= 0 ? '+' : ''}{marketOverviewData.NZD_USD.change.toFixed(2)}%
              </div>
            </div>
              </div>

              <div className={`group relative p-4 rounded-xl bg-gradient-to-br ${getCurrencyCardClasses('yellow')} transition-all duration-300 hover:shadow-lg`}>
                <div className="absolute inset-0 bg-gradient-to-br from-yellow-500/10 to-transparent rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                <div className="relative">
                  <div className="text-lg font-mono font-bold text-yellow-300 group-hover:text-yellow-200 transition-colors">
                    {marketOverviewData.USD_CNY.rate.toFixed(4)}
                  </div>
                  <div className="text-sm text-yellow-400/80 font-medium">USD/CNY</div>
                  <div className={`text-xs font-semibold ${marketOverviewData.USD_CNY.change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {marketOverviewData.USD_CNY.change >= 0 ? '↗' : '↘'} {marketOverviewData.USD_CNY.change >= 0 ? '+' : ''}{marketOverviewData.USD_CNY.change.toFixed(2)}%
                  </div>
                </div>
              </div>

              <div className={`group relative p-4 rounded-xl bg-gradient-to-br ${getCurrencyCardClasses('teal')} transition-all duration-300 hover:shadow-lg`}>
                <div className="absolute inset-0 bg-gradient-to-br from-teal-500/10 to-transparent rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                <div className="relative">
                  <div className="text-lg font-mono font-bold text-teal-300 group-hover:text-teal-200 transition-colors">
                    {marketOverviewData.USD_INR.rate.toFixed(2)}
                  </div>
                  <div className="text-sm text-teal-400/80 font-medium">USD/INR</div>
                  <div className={`text-xs font-semibold ${marketOverviewData.USD_INR.change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {marketOverviewData.USD_INR.change >= 0 ? '↗' : '↘'} {marketOverviewData.USD_INR.change >= 0 ? '+' : ''}{marketOverviewData.USD_INR.change.toFixed(2)}%
              </div>
            </div>
              </div>

              <div className={`group relative p-4 rounded-xl bg-gradient-to-br ${getCurrencyCardClasses('pink')} transition-all duration-300 hover:shadow-lg`}>
                <div className="absolute inset-0 bg-gradient-to-br from-pink-500/10 to-transparent rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                <div className="relative">
                  <div className="text-lg font-mono font-bold text-pink-300 group-hover:text-pink-200 transition-colors">
                    {marketOverviewData.USD_BRL.rate.toFixed(4)}
                  </div>
                  <div className="text-sm text-pink-400/80 font-medium">USD/BRL</div>
                  <div className={`text-xs font-semibold ${marketOverviewData.USD_BRL.change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {marketOverviewData.USD_BRL.change >= 0 ? '↗' : '↘'} {marketOverviewData.USD_BRL.change >= 0 ? '+' : ''}{marketOverviewData.USD_BRL.change.toFixed(2)}%
                  </div>
                </div>
              </div>

              <div className={`group relative p-4 rounded-xl bg-gradient-to-br ${getCurrencyCardClasses('violet')} transition-all duration-300 hover:shadow-lg`}>
                <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 to-transparent rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                <div className="relative">
                  <div className="text-lg font-mono font-bold text-emerald-300 group-hover:text-emerald-200 transition-colors">
                    {marketOverviewData.USD_MXN.rate.toFixed(4)}
                  </div>
                  <div className="text-sm text-emerald-400/80 font-medium">USD/MXN</div>
                  <div className={`text-xs font-semibold ${marketOverviewData.USD_MXN.change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {marketOverviewData.USD_MXN.change >= 0 ? '↗' : '↘'} {marketOverviewData.USD_MXN.change >= 0 ? '+' : ''}{marketOverviewData.USD_MXN.change.toFixed(2)}%
              </div>
            </div>
              </div>

              <div className={`group relative p-4 rounded-xl bg-gradient-to-br ${getCurrencyCardClasses('amber')} transition-all duration-300 hover:shadow-lg`}>
                <div className="absolute inset-0 bg-gradient-to-br from-amber-500/10 to-transparent rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                <div className="relative">
                  <div className="text-lg font-mono font-bold text-amber-300 group-hover:text-amber-200 transition-colors">
                    {marketOverviewData.USD_TRY.rate.toFixed(4)}
                  </div>
                  <div className="text-sm text-amber-400/80 font-medium">USD/TRY</div>
                  <div className={`text-xs font-semibold ${marketOverviewData.USD_TRY.change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {marketOverviewData.USD_TRY.change >= 0 ? '↗' : '↘'} {marketOverviewData.USD_TRY.change >= 0 ? '+' : ''}{marketOverviewData.USD_TRY.change.toFixed(2)}%
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-r from-lime-500/30 to-emerald-500/30 border-lime-500/40 dark:from-lime-500/20 dark:to-emerald-500/20 dark:border-lime-500/30 bloomberg-theme:from-orange-500/25 bloomberg-theme:to-yellow-500/25 bloomberg-theme:border-orange-500/40 mb-4">
                <Activity className="h-8 w-8 text-lime-400 animate-pulse" />
              </div>
              <div className="text-slate-600 dark:text-slate-300 bloomberg-theme:text-orange-200 text-lg font-medium mb-2">Loading Market Data</div>
              <div className="text-slate-500 dark:text-slate-400 bloomberg-theme:text-orange-300 text-sm mb-4">Fetching real-time FX rates...</div>
              <Button
                variant="outline"
                size="sm"
                onClick={loadMarketOverviewData}
                className="bg-slate-100/80 border-slate-300 text-slate-700 hover:bg-slate-200/80 hover:border-lime-500 dark:bg-slate-800/50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700/50 dark:hover:border-lime-400 bloomberg-theme:bg-orange-900/50 bloomberg-theme:border-orange-700 bloomberg-theme:text-orange-200 bloomberg-theme:hover:bg-orange-800/50 bloomberg-theme:hover:border-orange-500 transition-all duration-300"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Load Data
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </Layout>
  );
};

export default Dashboard; 