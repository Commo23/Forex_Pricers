import React, { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, RefreshCcw, Globe, Clock } from 'lucide-react';
import { CURRENCY_PAIRS } from '@/pages/Index';
import CurrencyTable from './CurrencyTable';
import ExchangeRateService, { ExchangeRateData, CurrencyInfo } from '@/services/ExchangeRateService';
import { toast } from '@/hooks/use-toast';

interface ForexDashboardProps {
  onRateSelected?: (pair: string, rate: number) => void;
  currentPair?: string;
}

const ForexDashboard: React.FC<ForexDashboardProps> = ({ onRateSelected, currentPair }) => {
  const [selectedPair, setSelectedPair] = useState<string>(currentPair || "EUR/USD");
  const [currentRate, setCurrentRate] = useState<number>(
    CURRENCY_PAIRS.find(p => p.symbol === (currentPair || "EUR/USD"))?.defaultSpotRate || 1.085
  );
  const [autoSync, setAutoSync] = useState<boolean>(false);
  
  // Nouveaux états pour l'API Exchange Rate
  const [baseCurrency, setBaseCurrency] = useState<string>('USD');
  const [currencies, setCurrencies] = useState<CurrencyInfo[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [exchangeService] = useState(() => ExchangeRateService.getInstance());

  // Charger les données initiales
  useEffect(() => {
    loadExchangeRates();
  }, [baseCurrency]);

  // Auto-refresh
  useEffect(() => {
    if (autoSync) {
      const interval = setInterval(() => {
        loadExchangeRates();
        if (onRateSelected && selectedPair && currentRate) {
          onRateSelected(selectedPair, currentRate);
        }
      }, 30000); // Mise à jour toutes les 30 secondes
      return () => clearInterval(interval);
    }
  }, [autoSync, selectedPair, currentRate, onRateSelected]);

  // Fonction pour charger les taux de change
  const loadExchangeRates = async () => {
    setLoading(true);
    try {
      const data: ExchangeRateData = await exchangeService.getExchangeRates(baseCurrency);
      const formattedCurrencies = exchangeService.formatCurrencyData(data);
      setCurrencies(formattedCurrencies);
      setLastUpdated(new Date());
      
      // Mettre à jour le taux actuel si la paire correspond
      updateCurrentRateFromApi(formattedCurrencies);
      
    } catch (error) {
      console.error('Error loading rates:', error);
      toast({
        title: "Loading Error",
        description: "Unable to load exchange rates. Using default values.",
        variant: "destructive"
      });
      
      // Fallback avec les données par défaut
      const fallbackCurrencies = generateFallbackCurrencies();
      setCurrencies(fallbackCurrencies);
      setLastUpdated(new Date());
    } finally {
      setLoading(false);
    }
  };

  // Mettre à jour le taux actuel basé sur les données API
  const updateCurrentRateFromApi = (currenciesData: CurrencyInfo[]) => {
    if (!selectedPair) return;

    // Parse la paire sélectionnée (ex: "USD/EUR" ou "EUR/GBP")
    const [base, quote] = selectedPair.split('/');
    
    if (base === baseCurrency) {
      // Recherche directe - le taux dans le tableau
      const currency = currenciesData.find(c => c.code === quote);
      if (currency) {
        setCurrentRate(currency.rate);
      }
    } else if (quote === baseCurrency) {
      // Ce cas ne devrait plus se produire avec la nouvelle logique
      const currency = currenciesData.find(c => c.code === base);
      if (currency) {
        setCurrentRate(1 / currency.rate);
      }
    } else {
      // Calcul croisé via la devise de base
      const baseCurr = currenciesData.find(c => c.code === base);
      const quoteCurr = currenciesData.find(c => c.code === quote);
      if (baseCurr && quoteCurr) {
        setCurrentRate(quoteCurr.rate / baseCurr.rate);
      }
    }
  };

  // Générer des données de fallback
  const generateFallbackCurrencies = (): CurrencyInfo[] => {
    const fallbackRates: { [key: string]: number } = {
      'EUR': 0.8560,
      'GBP': 0.7850,
      'JPY': 147.50,
      'AUD': 1.5250,
      'CAD': 1.3450,
      'CHF': 0.8970,
      'CNY': 7.1200,
      'NZD': 1.6700
    };

    return Object.entries(fallbackRates).map(([code, rate]) => ({
      code,
      name: exchangeService.formatCurrencyData({ 
        provider: 'fallback', 
        base: 'USD', 
        date: new Date().toISOString(), 
        time_last_updated: Date.now(),
        rates: fallbackRates 
      }).find(c => c.code === code)?.name || code,
      rate
    }));
  };

  // Fonction de rafraîchissement manuel
  const handleRefresh = () => {
    exchangeService.clearCache();
    loadExchangeRates();
  };

  // Appliquer le taux sélectionné aux paramètres
  const applyRate = () => {
    if (onRateSelected) {
      onRateSelected(selectedPair, currentRate);
      toast({
        title: "Rate Applied",
        description: `Rate ${currentRate} applied for ${selectedPair}`,
      });
    }
  };

  // Gérer la sélection d'une devise dans le tableau
  const handleCurrencySelect = (currency: CurrencyInfo) => {
    // Le taux affiché dans le tableau est toujours par rapport à la devise de base
    // On utilise ce même taux dans "Taux Actuel"
    const newRate = currency.rate;
    
    // Créer la paire correspondante 
    let newPair: string;
    if (baseCurrency === 'USD') {
      newPair = `USD/${currency.code}`;
    } else {
      newPair = `${baseCurrency}/${currency.code}`;
    }

    setSelectedPair(newPair);
    setCurrentRate(newRate);

    if (onRateSelected) {
      onRateSelected(newPair, newRate);
      toast({
        title: "Paire mise à jour",
        description: `${newPair} sélectionnée avec le taux ${newRate.toFixed(4)}`,
      });
    }
  };

  // Gérer le changement de devise de base
  const handleBaseCurrencyChange = (newBaseCurrency: string) => {
    setBaseCurrency(newBaseCurrency);
    // Le useEffect se chargera de recharger les données
  };

  return (
    <Card className="shadow-md w-full">
      <CardHeader className="pb-2 border-b">
        <CardTitle className="text-xl font-bold text-primary flex items-center gap-2">
          <Globe className="h-5 w-5" />
          Forex Market Dashboard
          <Badge variant="secondary" className="ml-auto">
            API Exchange Rate
          </Badge>
        </CardTitle>
      </CardHeader>
      
      <CardContent className="py-4">
        {/* Section de contrôle rapide */}
        <div className="mb-6 p-4 bg-muted/30 rounded-md border">
          <h3 className="text-lg font-medium mb-3">Quick Rate Sync</h3>
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <Label htmlFor="pair-select">Selected Currency Pair</Label>
              <Select 
                value={selectedPair} 
                onValueChange={setSelectedPair}
              >
                <SelectTrigger id="pair-select" className="w-full">
                  <SelectValue placeholder="Select a pair" />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCY_PAIRS.map(pair => (
                    <SelectItem key={pair.symbol} value={pair.symbol}>
                      {pair.symbol} - {pair.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label htmlFor="current-rate">Taux Actuel</Label>
              <div className="flex items-center space-x-2">
                <Input 
                  id="current-rate"
                  type="number"
                  value={currentRate} 
                  onChange={(e) => setCurrentRate(Number(e.target.value))}
                  className="flex-1 font-mono"
                  step="0.00001"
                />
                <Button 
                  size="icon"
                  variant="outline"
                  onClick={handleRefresh}
                  title="Actualiser les taux"
                  disabled={loading}
                >
                  <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                </Button>
              </div>
            </div>
            
            <div className="flex flex-col justify-end">
              <Button onClick={applyRate} className="w-full mb-2">
                Appliquer aux Paramètres
              </Button>
              
              <div className="flex items-center space-x-2">
                <Switch
                  id="auto-sync"
                  checked={autoSync}
                  onCheckedChange={setAutoSync}
                />
                <Label htmlFor="auto-sync" className="text-sm">
                  Auto-sync (30s)
                </Label>
              </div>
            </div>
          </div>
          
          {autoSync && (
            <div className="mt-3 flex items-center text-sm text-amber-600">
              <AlertCircle className="h-4 w-4 mr-1" />
              <span>Synchronisation automatique activée (mise à jour toutes les 30 secondes)</span>
            </div>
          )}

          {lastUpdated && (
            <div className="mt-2 flex items-center text-xs text-muted-foreground">
              <Clock className="h-3 w-3 mr-1" />
              <span>Last update: {lastUpdated.toLocaleString('en-US')}</span>
            </div>
          )}
        </div>
        
        {/* Tableau des taux de change */}
        <CurrencyTable
          currencies={currencies}
          baseCurrency={baseCurrency}
          onCurrencySelect={handleCurrencySelect}
          onBaseCurrencyChange={handleBaseCurrencyChange}
          loading={loading}
          lastUpdated={lastUpdated || undefined}
          onRefresh={handleRefresh}
        />
      </CardContent>
    </Card>
  );
};

export default ForexDashboard; 