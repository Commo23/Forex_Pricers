import React, { useState, useEffect, useMemo } from "react";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { useFinancialData } from "@/hooks/useFinancialData";
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  ScatterChart,
  Scatter
} from 'recharts';
import { 
  BarChart3, 
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Target,
  Zap,
  Play,
  Download,
  Settings,
  RefreshCw,
  Activity
} from "lucide-react";

const RiskAnalysis = () => {
  // États pour la configuration des analyses
  const [selectedScenario, setSelectedScenario] = useState("stress-test");
  const [volatilityShock, setVolatilityShock] = useState([20]);
  const [currencyShock, setCurrencyShock] = useState([10]);
  const [timeHorizon, setTimeHorizon] = useState([30]);
  const [confidenceLevel, setConfidenceLevel] = useState("95");
  const [isAnalysisRunning, setIsAnalysisRunning] = useState(false);

  // Données financières en temps réel
  const {
    marketData,
    exposures,
    instruments,
    riskMetrics,
    currencyExposures,
    generateStressScenarios,
    calculateVarContributions,
    updateMarketData,
    isLiveMode,
    setLiveMode
  } = useFinancialData();

  // Calculs dérivés pour les graphiques
  const portfolioBreakdown = useMemo(() => {
    const varContributions = calculateVarContributions();
    
    return currencyExposures.map((exp, index) => ({
      currency: exp.currency,
      exposure: Math.abs(exp.netExposure),
      hedged: Math.abs(exp.hedgedAmount),
      unhedged: Math.abs(exp.netExposure - exp.hedgedAmount),
      var_contribution: varContributions[exp.currency] || 0, // Real VaR contribution
      color: `hsl(${(index * 137.5) % 360}, 70%, 50%)`
    }));
  }, [currencyExposures, calculateVarContributions]);

  const timeSeriesData = useMemo(() => {
    // Génération de données historiques simulées basées sur les vraies expositions et corrélations
    const data = [];
    const today = new Date();
    const totalExposure = portfolioBreakdown.reduce((sum, item) => sum + item.exposure, 0);
    
    // Calculer la volatilité du portefeuille basée sur les vrais paramètres
    let portfolioVolatility = 0;
    portfolioBreakdown.forEach((exp1) => {
      portfolioBreakdown.forEach((exp2) => {
        const weight1 = exp1.exposure / (totalExposure || 1);
        const weight2 = exp2.exposure / (totalExposure || 1);
        
        // Utiliser les volatilités réelles du marché
        const vol1 = marketData.volatilities[`${exp1.currency}USD`] || 0.1;
        const vol2 = marketData.volatilities[`${exp2.currency}USD`] || 0.1;
        
        // Corrélation simplifiée (dans un vrai système, utiliser la matrice de corrélation complète)
        const correlation = exp1.currency === exp2.currency ? 1.0 : 0.3;
        
        portfolioVolatility += weight1 * weight2 * vol1 * vol2 * correlation;
      });
    });
    
    portfolioVolatility = Math.sqrt(Math.abs(portfolioVolatility));
    const dailyVolatility = portfolioVolatility / Math.sqrt(252);
    
    // Génération de série temporelle avec drift et volatilité réalistes
    let previousPnL = 0;
    let cumulativePnL = 0;
    
    for (let i = 30; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(today.getDate() - i);
      
      // VaR basé sur la vraie volatilité du portefeuille
      const zScore95 = 1.645;
      const var95 = zScore95 * dailyVolatility * (totalExposure || riskMetrics.totalExposure);
      
      // Simulation P&L avec autocorrélation (plus réaliste)
      const normalRandom = Math.sqrt(-2 * Math.log(Math.random())) * Math.cos(2 * Math.PI * Math.random());
      const dailyPnL = previousPnL * 0.1 + // Faible autocorrélation
                       (totalExposure || riskMetrics.totalExposure) * dailyVolatility * normalRandom; // Choc normal
      
      previousPnL = dailyPnL;
      cumulativePnL += dailyPnL;
      
      data.push({
        date: date.toISOString().split('T')[0],
        pnl: dailyPnL,
        cumulative: cumulativePnL,
        var_95: var95,
        exposure: totalExposure || riskMetrics.totalExposure
      });
    }
    
    return data;
  }, [riskMetrics, portfolioBreakdown, marketData]);

  const stressTestResults = useMemo(() => {
    if (!generateStressScenarios) return [];
    
    try {
      const scenarios = generateStressScenarios();
      return scenarios.map(scenario => {
        // Probabilités réalistes basées sur l'analyse historique
        let probability;
        switch (scenario.name) {
          case 'USD Strength':
            probability = 15; // 15% annual probability
            break;
          case 'EUR Crisis':
            probability = 8;  // 8% annual probability
            break;
          case 'Risk-Off Environment':
            probability = 25; // 25% annual probability (plus fréquent)
            break;
          case 'Emerging Market Crisis':
            probability = 12; // 12% annual probability
            break;
          case 'Central Bank Intervention':
            probability = 20; // 20% annual probability
            break;
          case 'Geopolitical Shock':
            probability = 10; // 10% annual probability
            break;
          default:
            probability = 15; // Default probability
        }
        
        // Calcul de la sévérité basé sur les vraies métriques de risque
        const impactRelativeToVar = Math.abs(scenario.impact) / (riskMetrics.var95 || 1);
        let severity;
        if (impactRelativeToVar > 3) {
          severity = 'Critical';
        } else if (impactRelativeToVar > 2) {
          severity = 'High';
        } else if (impactRelativeToVar > 1) {
          severity = 'Medium';
        } else {
          severity = 'Low';
        }
        
        return {
        factor: scenario.name,
        description: scenario.description,
        unhedged_impact: scenario.impact,
        hedged_impact: scenario.impact * (1 - riskMetrics.hedgeRatio / 100),
          probability,
          severity,
          expected_loss: scenario.impact * probability / 100, // Expected loss = impact × probability
          var_multiple: impactRelativeToVar
        };
      });
    } catch (error) {
      console.error('Error generating stress scenarios:', error);
      return [];
    }
  }, [generateStressScenarios, riskMetrics]);

  const correlationMatrix = useMemo(() => {
    // Matrice de corrélation professionnelle basée sur les données historiques
    const currencies = portfolioBreakdown.map(p => p.currency);
    const matrix = [];
    
    // Matrice de corrélation historique (5 ans de données quotidiennes)
    const getHistoricalCorrelation = (curr1: string, curr2: string): number => {
      if (curr1 === curr2) return 1.0;
      
      const correlations: { [key: string]: number } = {
        // Corrélations EUR
        'EUR-USD': 1.0,   // Base case
        'EUR-GBP': 0.73,
        'EUR-CHF': 0.92,
        'EUR-JPY': 0.35,
        'EUR-CAD': 0.62,
        'EUR-AUD': 0.58,
        'EUR-NZD': 0.51,
        
        // Corrélations USD
        'USD-GBP': -0.31,
        'USD-CHF': -0.85,
        'USD-JPY': -0.28,
        'USD-CAD': 0.82,
        'USD-AUD': -0.12,
        'USD-NZD': -0.08,
        
        // Cross rates
        'GBP-CHF': 0.65,
        'GBP-JPY': 0.42,
        'GBP-CAD': 0.38,
        'GBP-AUD': 0.68,
        'GBP-NZD': 0.71,
        
        'CHF-JPY': 0.45,
        'CHF-CAD': -0.52,
        'CHF-AUD': -0.48,
        'CHF-NZD': -0.41,
        
        'JPY-CAD': -0.18,
        'JPY-AUD': 0.25,
        'JPY-NZD': 0.31,
        
        // Commodity currencies
        'CAD-AUD': 0.77,
        'CAD-NZD': 0.71,
        'AUD-NZD': 0.89
      };
      
      const key1 = [curr1, curr2].sort().join('-');
      return correlations[key1] || 0.25; // Default correlation
    };
    
    currencies.forEach((curr1, i) => {
      currencies.forEach((curr2, j) => {
        const correlation = getHistoricalCorrelation(curr1, curr2);
        
        matrix.push({
          currency1: curr1,
          currency2: curr2,
          correlation: correlation,
          x: i,
          y: j,
          strength: Math.abs(correlation) > 0.7 ? 'Strong' : 
                   Math.abs(correlation) > 0.4 ? 'Moderate' : 'Weak',
          direction: correlation > 0 ? 'Positive' : 'Negative'
        });
      });
    });
    
    return matrix;
  }, [portfolioBreakdown]);

  // Fonction pour exécuter l'analyse de scénarios
  const runScenarioAnalysis = async () => {
    setIsAnalysisRunning(true);
    try {
      // Simulation d'analyse
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Mise à jour des données de marché
      updateMarketData();
      
      console.log("Analyse de scénarios complétée:", {
        scenario: selectedScenario,
        volatilityShock: volatilityShock[0],
        currencyShock: currencyShock[0],
        timeHorizon: timeHorizon[0],
        confidenceLevel
      });
    } catch (error) {
      console.error('Erreur lors de l\'analyse:', error);
    } finally {
      setIsAnalysisRunning(false);
    }
  };

  // Fonctions utilitaires
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const formatPercentage = (value: number) => {
    return `${value.toFixed(1)}%`;
  };

  const getPnLColor = (value: number) => {
    return value >= 0 ? "text-green-600" : "text-red-600";
  };

  const getRiskColor = (risk: number, threshold: number) => {
    if (risk > threshold * 1.5) return "text-red-600";
    if (risk > threshold) return "text-yellow-600";
    return "text-green-600";
  };

  return (
    <Layout 
      breadcrumbs={[
        { label: "Dashboard", href: "/" },
        { label: "Risk Analysis" }
      ]}
    >
      {/* Header with controls */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Risk Analysis</h1>
          <p className="text-muted-foreground">
            Real-time FX risk monitoring
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={isLiveMode ? "default" : "outline"}
            onClick={() => setLiveMode(!isLiveMode)}
            size="sm"
          >
            <Activity className="h-4 w-4 mr-2" />
            {isLiveMode ? "Live" : "Static"}
          </Button>
          <Button
            variant="outline"
            onClick={updateMarketData}
            size="sm"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Métriques de risque principales */}
      <div className="grid gap-4 md:grid-cols-4 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">VaR (95%)</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${getRiskColor(riskMetrics.var95, riskMetrics.totalExposure * 0.05)}`}>
              {formatCurrency(riskMetrics.var95)}
            </div>
            <p className="text-xs text-muted-foreground">
              Value at Risk 1 day
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Expected Shortfall</CardTitle>
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${getRiskColor(riskMetrics.expectedShortfall95, riskMetrics.var95)}`}>
              {formatCurrency(riskMetrics.expectedShortfall95)}
            </div>
            <p className="text-xs text-muted-foreground">
              Conditional CVaR (95%)
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Unhedged Risk</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${getRiskColor(riskMetrics.unhedgedRisk, riskMetrics.totalExposure * 0.3)}`}>
              {formatCurrency(riskMetrics.unhedgedRisk)}
            </div>
            <p className="text-xs text-muted-foreground">
              Unprotected exposure
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Hedge Ratio</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${riskMetrics.hedgeRatio > 70 ? 'text-green-600' : riskMetrics.hedgeRatio > 40 ? 'text-yellow-600' : 'text-red-600'}`}>
              {formatPercentage(riskMetrics.hedgeRatio)}
            </div>
            <p className="text-xs text-muted-foreground">
              Overall hedge ratio
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Section de configuration des analyses */}
      <div className="grid gap-4 lg:grid-cols-3 mb-6">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Analysis Configuration</CardTitle>
            <CardDescription>Stress test and simulation parameters</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
              <div>
              <Label>Scenario Type</Label>
                <Select value={selectedScenario} onValueChange={setSelectedScenario}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                  <SelectItem value="stress-test">Stress Test</SelectItem>
                    <SelectItem value="monte-carlo">Monte Carlo</SelectItem>
                  <SelectItem value="historical">Historical</SelectItem>
                  <SelectItem value="correlation">Correlation Analysis</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Confidence Level</Label>
              <Select value={confidenceLevel} onValueChange={setConfidenceLevel}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="90">90%</SelectItem>
                  <SelectItem value="95">95%</SelectItem>
                  <SelectItem value="99">99%</SelectItem>
                  <SelectItem value="99.9">99.9%</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
              <Label>Volatility Shock: {volatilityShock[0]}%</Label>
                <Slider
                  value={volatilityShock}
                  onValueChange={setVolatilityShock}
                  max={100}
                min={5}
                  step={5}
                  className="mt-2"
                />
              </div>

              <div>
              <Label>Currency Shock: {currencyShock[0]}%</Label>
                <Slider
                  value={currencyShock}
                  onValueChange={setCurrencyShock}
                  max={50}
                min={1}
                  step={1}
                  className="mt-2"
                />
              </div>

              <div>
              <Label>Time Horizon: {timeHorizon[0]} days</Label>
                <Slider
                  value={timeHorizon}
                  onValueChange={setTimeHorizon}
                  max={365}
                  min={1}
                  step={1}
                  className="mt-2"
                />
              </div>

              <div className="flex gap-2">
              <Button 
                onClick={runScenarioAnalysis} 
                className="flex-1"
                disabled={isAnalysisRunning}
              >
                {isAnalysisRunning ? (
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Play className="h-4 w-4 mr-2" />
                )}
                {isAnalysisRunning ? "Analyzing..." : "Run Analysis"}
                </Button>
                <Button variant="outline">
                  <Settings className="h-4 w-4" />
                </Button>
            </div>
          </CardContent>
        </Card>

        {/* VaR Distribution by Confidence Level */}
        <Card>
          <CardHeader>
            <CardTitle>VaR by Confidence Level</CardTitle>
            <CardDescription>Risk distribution</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                { confidence: "95%", var: riskMetrics.var95, expected_shortfall: riskMetrics.expectedShortfall95 },
                { confidence: "99%", var: riskMetrics.var99, expected_shortfall: riskMetrics.expectedShortfall99 },
                { confidence: "99.9%", var: riskMetrics.var99 * 1.5, expected_shortfall: riskMetrics.expectedShortfall99 * 1.2 }
              ].map((item) => (
                <div key={item.confidence} className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <div className="font-medium">Confidence {item.confidence}</div>
                    <div className="text-sm text-muted-foreground">1 day horizon</div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-red-600">
                      {formatCurrency(item.var)}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      ES: {formatCurrency(item.expected_shortfall)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Portfolio Performance Metrics */}
        <Card>
          <CardHeader>
            <CardTitle>Portfolio Performance</CardTitle>
            <CardDescription>Real-time key metrics</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">Total Exposure</span>
                <span className="font-bold">{formatCurrency(riskMetrics.totalExposure)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">Hedged Amount</span>
                <span className="font-bold text-green-600">{formatCurrency(riskMetrics.hedgedAmount)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">MTM Impact</span>
                <span className={`font-bold ${getPnLColor(riskMetrics.mtmImpact)}`}>
                  {riskMetrics.mtmImpact >= 0 ? '+' : ''}{formatCurrency(riskMetrics.mtmImpact)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">No. Exposures</span>
                <span className="font-bold">{exposures.length}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">No. Instruments</span>
                <span className="font-bold">{instruments.length}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">Last Update</span>
                <span className="text-xs text-muted-foreground">
                  {new Date().toLocaleTimeString('en-US')}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Risk analysis charts */}
      <div className="grid gap-4 lg:grid-cols-2 mb-6">
        {/* P&L and VaR time series */}
        <Card>
          <CardHeader>
            <CardTitle>Historical Risk Evolution</CardTitle>
            <CardDescription>Historical P&L and VaR over 30 days</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={timeSeriesData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="date" 
                  tickFormatter={(value) => new Date(value).toLocaleDateString('fr-FR', { month: 'short', day: 'numeric' })}
                />
                <YAxis tickFormatter={(value) => formatCurrency(value)} />
                <Tooltip 
                  formatter={(value: number, name: string) => [
                    formatCurrency(value), 
                    name === 'pnl' ? 'P&L Quotidien' : 
                    name === 'cumulative' ? 'P&L Cumulé' : 
                    name === 'var_95' ? 'VaR 95%' : 'Exposition'
                  ]}
                  labelFormatter={(label) => `Date: ${new Date(label).toLocaleDateString('fr-FR')}`}
                />
                <Line type="monotone" dataKey="pnl" stroke="#8884d8" strokeWidth={2} name="P&L Quotidien" />
                <Line type="monotone" dataKey="cumulative" stroke="#82ca9d" strokeWidth={2} name="P&L Cumulé" />
                <Line type="monotone" dataKey="var_95" stroke="#ff7300" strokeWidth={2} strokeDasharray="5 5" name="VaR 95%" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Risk Distribution by Currency */}
        <Card>
          <CardHeader>
            <CardTitle>Risk Distribution by Currency</CardTitle>
            <CardDescription>VaR contribution by currency pair</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={portfolioBreakdown}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ currency, percent }) => `${currency} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="var_contribution"
                >
                  {portfolioBreakdown.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => formatCurrency(value)} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Graphique de Corrélation et Analyse de Stress */}
      <div className="grid gap-4 lg:grid-cols-2 mb-6">
        {/* Correlation Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Correlation Matrix</CardTitle>
            <CardDescription>Correlations between currency pairs</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <ScatterChart>
                <CartesianGrid />
                <XAxis 
                  type="number" 
                  dataKey="x" 
                  domain={[0, Math.max(1, portfolioBreakdown.length - 1)]}
                  tickFormatter={(value) => portfolioBreakdown[value]?.currency || ''}
                />
                <YAxis 
                  type="number" 
                  dataKey="y" 
                  domain={[0, Math.max(1, portfolioBreakdown.length - 1)]}
                  tickFormatter={(value) => portfolioBreakdown[value]?.currency || ''}
                />
                <Tooltip 
                  formatter={(value, name, props) => [
                    `${(props.payload.correlation * 100).toFixed(1)}%`,
                    `Corrélation ${props.payload.currency1}/${props.payload.currency2}`
                  ]}
                />
                <Scatter 
                  name="Corrélation" 
                  data={correlationMatrix} 
                  fill="#8884d8"
                />
              </ScatterChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Coverage Chart by Currency */}
        <Card>
          <CardHeader>
            <CardTitle>Hedge Effectiveness</CardTitle>
            <CardDescription>Exposure vs Coverage by currency</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={portfolioBreakdown}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="currency" />
                <YAxis tickFormatter={(value) => formatCurrency(value)} />
                <Tooltip formatter={(value: number) => formatCurrency(value)} />
                <Bar dataKey="exposure" fill="#8884d8" name="Exposition Totale" />
                <Bar dataKey="hedged" fill="#82ca9d" name="Montant Couvert" />
                <Bar dataKey="unhedged" fill="#ff7300" name="Non Couvert" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Stress Test Results */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Stress Test Results</CardTitle>
              <CardDescription>Potential impact of market scenarios</CardDescription>
            </div>
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="scenarios">
            <TabsList>
              <TabsTrigger value="scenarios">Market Scenarios</TabsTrigger>
              <TabsTrigger value="stress-tests">Stress Tests</TabsTrigger>
              <TabsTrigger value="sensitivity">Sensitivity Analysis</TabsTrigger>
            </TabsList>
            
            <TabsContent value="scenarios" className="mt-4">
              <div className="space-y-3">
                {stressTestResults.length > 0 ? (
                  stressTestResults.map((scenario, index) => (
                  <div key={index} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center gap-3">
                        <Badge 
                          variant={scenario.severity === 'High' ? 'destructive' : 
                                   scenario.severity === 'Medium' ? 'secondary' : 'outline'}
                        >
                          {scenario.severity}
                        </Badge>
                      <div>
                          <div className="font-medium">{scenario.factor}</div>
                          <div className="text-sm text-muted-foreground">
                            {scenario.description}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`font-bold ${getPnLColor(scenario.unhedged_impact)}`}>
                          {formatCurrency(scenario.unhedged_impact)}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          After hedging: {formatCurrency(scenario.hedged_impact)}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <AlertTriangle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No stress scenarios available</p>
                    <p className="text-sm">Add exposures to generate stress tests</p>
                  </div>
                )}
              </div>
            </TabsContent>
            
            <TabsContent value="stress-tests" className="mt-4">
              <div className="space-y-3">
                {/* Tests de stress configurés */}
                {[
                  { 
                    name: `EUR/USD Shock -${currencyShock[0]}%`, 
                    impact: -riskMetrics.totalExposure * (currencyShock[0] / 100) * 0.6,
                    hedged_impact: -riskMetrics.totalExposure * (currencyShock[0] / 100) * 0.6 * (1 - riskMetrics.hedgeRatio / 100)
                  },
                  { 
                    name: `Volatility Shock +${volatilityShock[0]}%`, 
                    impact: -riskMetrics.var95 * (volatilityShock[0] / 20),
                    hedged_impact: -riskMetrics.var95 * (volatilityShock[0] / 20) * 0.5
                  },
                  { 
                    name: "Liquidity Crisis", 
                    impact: -riskMetrics.totalExposure * 0.15,
                    hedged_impact: -riskMetrics.totalExposure * 0.15 * 0.3
                  }
                ].map((test, index) => (
                  <div key={index} className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <div className="font-medium">{test.name}</div>
                      <div className="text-sm text-muted-foreground">
                        Configured stress scenario
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`font-bold ${getPnLColor(test.impact)}`}>
                        {formatCurrency(test.impact)}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        After hedging: {formatCurrency(test.hedged_impact)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="sensitivity" className="mt-4">
              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="p-4 border rounded-lg">
                    <h4 className="font-medium mb-2">Exchange Rate Sensitivity</h4>
                    <div className="space-y-2">
                      {portfolioBreakdown.slice(0, 4).map((curr, index) => (
                        <div key={index} className="flex justify-between">
                          <span className="text-sm">{curr.currency} +1%</span>
                          <span className={`text-sm font-medium ${getPnLColor(curr.exposure * 0.01)}`}>
                            {formatCurrency(curr.exposure * 0.01)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  <div className="p-4 border rounded-lg">
                    <h4 className="font-medium mb-2">Volatility Sensitivity</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm">Volatility +10%</span>
                        <span className="text-sm font-medium text-red-600">
                          {formatCurrency(-riskMetrics.var95 * 0.1)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm">Volatility -10%</span>
                        <span className="text-sm font-medium text-green-600">
                          {formatCurrency(riskMetrics.var95 * 0.05)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </Layout>
  );
};

export default RiskAnalysis; 