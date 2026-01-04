import React, { useState, useEffect } from 'react';
import { Layout } from "@/components/Layout";
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  Calculator, 
  TrendingUp, 
  BarChart3, 
  Settings, 
  Info,
  CheckCircle,
  Clock,
  Calendar,
  Percent,
  Hash
} from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import { CURRENCY_PAIRS } from '@/pages/Index';
import PayoffChart from '@/components/PayoffChart';
import { PricingService, Greeks } from '@/services/PricingService';
import ExchangeRateService from '@/services/ExchangeRateService';

// Réutiliser les types du Strategy Builder
interface CurrencyPair {
  symbol: string;
  name: string;
  base: string;
  quote: string;
  category: 'majors' | 'crosses' | 'others';
  defaultSpotRate: number;
}

interface StrategyComponent {
  type: 'call' | 'put' | 'swap' | 'forward' | 
         'call-knockout' | 'call-reverse-knockout' | 'call-double-knockout' | 
         'put-knockout' | 'put-reverse-knockout' | 'put-double-knockout' |
         'call-knockin' | 'call-reverse-knockin' | 'call-double-knockin' |
         'put-knockin' | 'put-reverse-knockin' | 'put-double-knockin' |
         'one-touch' | 'double-touch' | 'no-touch' | 'double-no-touch' |
         'range-binary' | 'outside-binary';
  strike: number;
  strikeType: 'percent' | 'absolute';
  volatility: number;
  quantity: number;
  barrier?: number;
  secondBarrier?: number;
  barrierType?: 'percent' | 'absolute';
  rebate?: number;
  timeToPayoff?: number;
}

interface PricingResult {
  price: number;
  method: string;
  greeks?: Greeks;
}

// Types d'instruments supportés (même que Strategy Builder)
const INSTRUMENT_TYPES = [
  { value: 'call', label: 'Call', category: 'vanilla' },
  { value: 'put', label: 'Put', category: 'vanilla' },
  { value: 'swap', label: 'Swap', category: 'swap' },
  { value: 'forward', label: 'Forward', category: 'forward' },
  { value: 'call-knockout', label: 'Call Knock-Out', category: 'barrier' },
  { value: 'call-reverse-knockout', label: 'Call Reverse Knock-Out', category: 'barrier' },
  { value: 'call-double-knockout', label: 'Call Double Knock-Out', category: 'barrier' },
  { value: 'put-knockout', label: 'Put Knock-Out', category: 'barrier' },
  { value: 'put-reverse-knockout', label: 'Put Reverse Knock-Out', category: 'barrier' },
  { value: 'put-double-knockout', label: 'Put Double Knock-Out', category: 'barrier' },
  { value: 'call-knockin', label: 'Call Knock-In', category: 'barrier' },
  { value: 'call-reverse-knockin', label: 'Call Reverse Knock-In', category: 'barrier' },
  { value: 'call-double-knockin', label: 'Call Double Knock-In', category: 'barrier' },
  { value: 'put-knockin', label: 'Put Knock-In', category: 'barrier' },
  { value: 'put-reverse-knockin', label: 'Put Reverse Knock-In', category: 'barrier' },
  { value: 'put-double-knockin', label: 'Put Double Knock-In', category: 'barrier' },
  { value: 'one-touch', label: 'One Touch (beta)', category: 'digital' },
  { value: 'double-touch', label: 'Double Touch (beta)', category: 'digital' },
  { value: 'no-touch', label: 'No Touch (beta)', category: 'digital' },
  { value: 'double-no-touch', label: 'Double No Touch (beta)', category: 'digital' },
  { value: 'range-binary', label: 'Range Binary (beta)', category: 'digital' },
  { value: 'outside-binary', label: 'Outside Binary (beta)', category: 'digital' }
];

const Pricers = () => {
  const { toast } = useToast();
  
  // Get ExchangeRateService instance for real-time rate fetching
  const exchangeRateService = React.useMemo(() => {
    return ExchangeRateService.getInstance();
  }, []);
  
  // Sync custom pairs from localStorage (shared with ForexMarket and Strategy Builder)
  const [customCurrencyPairs, setCustomCurrencyPairs] = React.useState<CurrencyPair[]>(() => {
    try {
      const savedPairs = localStorage.getItem('customCurrencyPairs');
      return savedPairs ? JSON.parse(savedPairs) : [];
    } catch (error) {
      console.warn('Error loading custom currency pairs:', error);
      return [];
    }
  });
  
  // Sync custom pairs from localStorage
  React.useEffect(() => {
    const handleStorageChange = () => {
      try {
        const savedPairs = localStorage.getItem('customCurrencyPairs');
        if (savedPairs) {
          const pairs = JSON.parse(savedPairs);
          setCustomCurrencyPairs(pairs);
        }
      } catch (error) {
        console.warn('Error syncing custom currency pairs:', error);
      }
    };
    
    // Listen for storage changes
    window.addEventListener('storage', handleStorageChange);
    
    // Also check periodically (in case changes are made in same window)
    const interval = setInterval(handleStorageChange, 1000);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(interval);
    };
  }, []);
  
  // Function to fetch real-time rate from Market Data
  const fetchRealTimeRate = async (currencyPair: CurrencyPair): Promise<number | null> => {
    try {
      const { base, quote } = currencyPair;
      
      // Get exchange rates from API
      const exchangeData = await exchangeRateService.getExchangeRates('USD');
      const rates = exchangeData.rates;
      
      // Calculate the cross rate for the selected pair
      let rate: number;
      
      if (base === 'USD') {
        // Direct rate: USD/XXX
        rate = rates[quote] || currencyPair.defaultSpotRate;
      } else if (quote === 'USD') {
        // Inverted rate: XXX/USD = 1 / (USD/XXX)
        rate = rates[base] ? 1 / rates[base] : currencyPair.defaultSpotRate;
      } else {
        // Cross rate: BASE/QUOTE = (USD/QUOTE) / (USD/BASE)
        const baseRate = rates[base] || 1;
        const quoteRate = rates[quote] || 1;
        rate = quoteRate / baseRate;
      }
      
      return rate;
    } catch (error) {
      console.error('Error fetching real-time rate:', error);
      return null;
    }
  };
  
  // État principal
  const [selectedInstrument, setSelectedInstrument] = useState('call');
  const [selectedCurrencyPair, setSelectedCurrencyPair] = useState('EUR/USD');
  
  // ✅ AJOUT: Sélection du modèle de pricing pour les barrières
  const [barrierPricingModel, setBarrierPricingModel] = useState<'closed-form' | 'monte-carlo'>('closed-form');
  
  // Inputs de pricing (cohérents avec Strategy Builder)
  const [pricingInputs, setPricingInputs] = useState({
    startDate: new Date().toISOString().split('T')[0],
    maturityDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 1 an par défaut
    spotPrice: 1.1000,
    domesticRate: 5.0, // En pourcentage
    foreignRate: 3.0, // En pourcentage
    timeToMaturity: 1.0,
    volatility: 15.0, // En pourcentage
    numSimulations: 1000 // ✅ 1000 comme Strategy Builder
  });

  // Notional bidirectionnel (base et quote)
  const [notionalBase, setNotionalBase] = useState(1000000);
  const [notionalQuote, setNotionalQuote] = useState(1000000 * (pricingInputs.spotPrice || 1));
  const [lastChanged, setLastChanged] = useState<'base' | 'quote'>('base');

  // Correction de la synchronisation du notional pour éviter la boucle infinie
  useEffect(() => {
    if (lastChanged === 'base') {
      setNotionalQuote(Number((notionalBase * (pricingInputs.spotPrice || 1)).toFixed(2)));
    }
    // eslint-disable-next-line
  }, [notionalBase, pricingInputs.spotPrice]);
  useEffect(() => {
    if (lastChanged === 'quote') {
      setNotionalBase(Number((notionalQuote / (pricingInputs.spotPrice || 1)).toFixed(2)));
    }
    // eslint-disable-next-line
  }, [notionalQuote, pricingInputs.spotPrice]);

  // Composant stratégie (comme dans Strategy Builder)
  const [strategyComponent, setStrategyComponent] = useState<StrategyComponent>({
    type: 'call',
    strike: 110.0, // En pourcentage par défaut
    strikeType: 'percent',
    volatility: 15.0, // En pourcentage
    quantity: 100,
    barrier: undefined,
    barrierType: 'percent',
    secondBarrier: undefined,
    rebate: 1.0,
    timeToPayoff: 1.0 // Temps jusqu'au payoff pour les options one-touch (en années)
  });

  // Résultats
  const [pricingResults, setPricingResults] = useState<PricingResult[]>([]);
  const [isCalculating, setIsCalculating] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showGreeks, setShowGreeks] = useState(true);

  // Utiliser la même fonction de calcul de maturité que Strategy Builder
  const calculateTimeToMaturity = () => {
    return PricingService.calculateTimeToMaturity(
      pricingInputs.maturityDate,
      pricingInputs.startDate
    );
  };

  // Mettre à jour la maturité quand les dates changent
  useEffect(() => {
    const timeToMaturity = calculateTimeToMaturity();
    setPricingInputs(prev => ({ ...prev, timeToMaturity }));
  }, [pricingInputs.startDate, pricingInputs.maturityDate]);

  // Mettre à jour le spot price quand la paire de devises change
  useEffect(() => {
    const allPairs = [...CURRENCY_PAIRS, ...customCurrencyPairs];
    const pair = allPairs.find(p => p.symbol === selectedCurrencyPair);
    if (pair) {
      // First set with default rate
      setPricingInputs(prev => ({ ...prev, spotPrice: pair.defaultSpotRate }));
      
      // Then fetch real-time rate from Market Data
      fetchRealTimeRate(pair).then(realTimeRate => {
        if (realTimeRate !== null && !isNaN(realTimeRate) && realTimeRate > 0) {
          setPricingInputs(prev => ({ ...prev, spotPrice: realTimeRate }));
          toast({
            title: "Rate Updated",
            description: `Real-time rate for ${pair.symbol}: ${realTimeRate.toFixed(4)}`,
          });
        }
      }).catch(error => {
        console.error('Error fetching rate:', error);
      });
    }
  }, [selectedCurrencyPair, customCurrencyPairs]);

  // Mettre à jour le type d'instrument dans le composant stratégie
  useEffect(() => {
    setStrategyComponent(prev => ({ ...prev, type: selectedInstrument as any }));
  }, [selectedInstrument]);

  // Calcul du prix - UTILISE UNIQUEMENT PricingService.calculateOptionPrice
  const calculatePrice = async (showToast: boolean = true) => {
    setIsCalculating(true);
    
    try {
      const results: PricingResult[] = [];
      
      // Calculer le strike selon le type
      const strike = strategyComponent.strikeType === 'percent' 
        ? pricingInputs.spotPrice * (strategyComponent.strike / 100)
        : strategyComponent.strike;
        
      // Calculer les barrières selon le type
      const barrier = strategyComponent.barrier ? (
        strategyComponent.barrierType === 'percent'
          ? pricingInputs.spotPrice * (strategyComponent.barrier / 100)
          : strategyComponent.barrier
      ) : undefined;

      const secondBarrier = strategyComponent.secondBarrier ? (
        strategyComponent.barrierType === 'percent'
          ? pricingInputs.spotPrice * (strategyComponent.secondBarrier / 100)
          : strategyComponent.secondBarrier
      ) : undefined;

      console.log('Calculated values:', {
        strike,
        barrier,
        secondBarrier,
        spotPrice: pricingInputs.spotPrice,
        type: strategyComponent.type
      });

      // ✅ UTILISATION STRICTE DE PricingService.calculateOptionPrice
      // Cette fonction gère TOUS les types d'options automatiquement
      let price = 0;
      let methodName = '';
      
      // ✅ UTILISATION DU SPOT PRICE PAR DÉFAUT
      const underlyingPrice = pricingInputs.spotPrice;
      
      if (strategyComponent.type === 'forward') {
        // Pour les forwards, utiliser directement la fonction forward
        price = PricingService.calculateFXForwardPrice(
          pricingInputs.spotPrice,
          pricingInputs.domesticRate / 100,
          pricingInputs.foreignRate / 100,
          pricingInputs.timeToMaturity
        ) - strike;
        methodName = 'Forward Pricing';
      } else if (strategyComponent.type === 'swap') {
        // Pour les swaps, calculer le forward puis utiliser swap pricing
        const forward = PricingService.calculateFXForwardPrice(
          pricingInputs.spotPrice,
          pricingInputs.domesticRate / 100,
          pricingInputs.foreignRate / 100,
          pricingInputs.timeToMaturity
        );
        price = PricingService.calculateSwapPrice(
          [forward],
          [pricingInputs.timeToMaturity],
          pricingInputs.domesticRate / 100
        );
        methodName = 'Swap Pricing';
      } else if (strategyComponent.type === 'call' || strategyComponent.type === 'put') {
        // ✅ VANILLA OPTIONS - Garman-Kohlhagen (utilise spot price)
        price = PricingService.calculateGarmanKohlhagenPrice(
          strategyComponent.type,
          underlyingPrice, // ✅ Spot price
          strike,
          pricingInputs.domesticRate / 100,
          pricingInputs.foreignRate / 100,
          pricingInputs.timeToMaturity,
          strategyComponent.volatility / 100
        );
        methodName = 'Garman-Kohlhagen (Spot)';
      } else if (strategyComponent.type.includes('knockout') || strategyComponent.type.includes('knockin')) {
        // ✅ BARRIER OPTIONS - UTILISE LE SPOT PRICE
        if (barrierPricingModel === 'closed-form') {
          price = PricingService.calculateBarrierOptionClosedForm(
            strategyComponent.type,
            underlyingPrice, // ✅ Spot price
            strike,
            pricingInputs.domesticRate / 100,
            pricingInputs.timeToMaturity,
            strategyComponent.volatility / 100,
            barrier || 0,
            secondBarrier
            // Note: pas de r_f selon Index.tsx
          );
          methodName = 'Barrier Closed-Form (Spot)';
        } else {
          price = PricingService.calculateBarrierOptionPrice(
            strategyComponent.type,
            underlyingPrice, // ✅ Spot price
            strike,
            pricingInputs.domesticRate / 100,
            pricingInputs.timeToMaturity,
            strategyComponent.volatility / 100,
            barrier || 0,
            secondBarrier,
            1000 // ✅ 1000 simulations comme Strategy Builder
          );
          methodName = 'Barrier Monte Carlo (Spot)';
        }
      } else {
        // ✅ DIGITAL OPTIONS - Utilise formules fermées ou Monte Carlo selon barrierPricingModel
        const useClosedForm = barrierPricingModel === 'closed-form';
        price = PricingService.calculateDigitalOptionPrice(
          strategyComponent.type,
          underlyingPrice, // ✅ Spot price
          strike,
          pricingInputs.domesticRate / 100,
          pricingInputs.foreignRate / 100,  // ✅ CORRIGÉ : Ajouter r_f
          pricingInputs.timeToMaturity,
          strategyComponent.volatility / 100,
          barrier,
          secondBarrier,
          pricingInputs.numSimulations,
          strategyComponent.rebate || 1,
          useClosedForm
        );
        methodName = useClosedForm ? 'Digital Closed-Form (Garman-Kohlhagen)' : 'Digital Monte Carlo (Garman-Kohlhagen)';
      }
      
      // Calculer les grecques si demandé
      let greeks: Greeks | undefined;
      if (showGreeks && strategyComponent.type !== 'forward' && strategyComponent.type !== 'swap') {
        try {
          greeks = PricingService.calculateGreeks(
            strategyComponent.type,
            underlyingPrice,
            strike,
            pricingInputs.domesticRate / 100,
            pricingInputs.foreignRate / 100,
            pricingInputs.timeToMaturity,
            strategyComponent.volatility / 100,
            barrier,
            secondBarrier,
            strategyComponent.rebate || 1
          );
        } catch (error) {
          console.warn('Error calculating Greeks:', error);
        }
      }
      
      // Ajouter le résultat
      if (price !== undefined && price !== null && !isNaN(price)) {
        results.push({
          price: price * strategyComponent.quantity / 100,
          method: methodName,
          greeks: greeks
        });
      }
      
      setPricingResults(results);
      
      if (showToast) {
        toast({
          title: "Calculation completed",
          description: `${results.length} pricing method(s) applied`,
        });
      }
      
    } catch (error) {
      console.error('Erreur lors du calcul:', error);
      if (showToast) {
        toast({
          title: "Calculation Error",
          description: "An error occurred during price calculation",
          variant: "destructive"
        });
      }
    } finally {
      setIsCalculating(false);
    }
  };

  // Fonction pour le bouton Calculer
  const handleCalculateClick = () => {
    calculatePrice(true);
  };

  // Mise à jour des inputs
  const updatePricingInput = (field: string, value: any) => {
    setPricingInputs(prev => ({ ...prev, [field]: value }));
  };

  const updateStrategyComponent = (field: keyof StrategyComponent, value: any) => {
    setStrategyComponent(prev => ({ ...prev, [field]: value }));
  };

  // ✅ AJOUT: Fonctions de gestion des notionnels
  const handleNotionalBaseChange = (value: number) => {
    setLastChanged('base');
    setNotionalBase(value);
  };

  const handleNotionalQuoteChange = (value: number) => {
    setLastChanged('quote');
    setNotionalQuote(value);
  };

  // Recalculer automatiquement le prix quand les paramètres changent
  useEffect(() => {
    // Ne recalculer que si on a déjà des résultats (utilisateur a cliqué sur Calculer au moins une fois)
    if (pricingResults.length > 0) {
      const timeoutId = setTimeout(() => {
        calculatePrice(false); // false = ne pas afficher le toast
      }, 500); // 500ms de délai
      
      return () => clearTimeout(timeoutId);
    }
  }, [
    strategyComponent.type,
    strategyComponent.strike,
    strategyComponent.strikeType,
    strategyComponent.barrier,
    strategyComponent.secondBarrier,
    strategyComponent.barrierType,
    strategyComponent.volatility,
    strategyComponent.quantity,
    strategyComponent.rebate,
    strategyComponent.timeToPayoff,
    pricingInputs.spotPrice,
    pricingInputs.domesticRate,
    pricingInputs.foreignRate,
    pricingInputs.timeToMaturity,
    barrierPricingModel, // ✅ Recalculer quand le modèle change
    notionalBase,
    notionalQuote, // ✅ Recalculer quand les notionnels changent
    showGreeks // ✅ Recalculer quand l'affichage des grecques change
  ]);

  // ✅ AJOUT: Recalculer les données de prix automatiquement quand les paramètres changent
  useEffect(() => {
    // Recalculer les données de prix seulement si on a déjà calculé au moins une fois
    if (pricingResults.length > 0) {
      // Les données se mettent à jour automatiquement via generatePriceData()
      // car elles dépendent des mêmes paramètres que le prix principal
      console.log('Price data updated automatically');
    }
  }, [
    strategyComponent,
    pricingInputs,
    barrierPricingModel,
    showGreeks,
    pricingResults // ✅ Recalculer quand les résultats de pricing changent
  ]);

  // Formatage des résultats
  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('fr-FR', {
      minimumFractionDigits: 4,
      maximumFractionDigits: 6
    }).format(price);
  };

  const getMethodIcon = (method: string) => {
    if (method.includes('Closed-Form') || method.includes('Garman-Kohlhagen')) return <Calculator className="w-4 h-4" />;
    if (method.includes('Monte Carlo')) return <BarChart3 className="w-4 h-4" />;
    if (method.includes('Forward') || method.includes('Swap')) return <TrendingUp className="w-4 h-4" />;
    return <Settings className="w-4 h-4" />;
  };

  const getMethodColor = (method: string) => {
    if (method.includes('Garman-Kohlhagen') || method.includes('Closed-Form')) {
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
    }
    if (method.includes('Monte Carlo') || method.includes('Digital')) {
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
    }
    if (method.includes('Forward') || method.includes('Swap')) {
      return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200';
    }
    return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
  };

  // Formatage des grecques
  const formatGreek = (value: number) => {
    return new Intl.NumberFormat('fr-FR', {
      minimumFractionDigits: 4,
      maximumFractionDigits: 6
    }).format(value);
  };

  const getGreekColor = (value: number, type: 'delta' | 'gamma' | 'theta' | 'vega' | 'rho') => {
    if (type === 'theta') {
      // Theta est généralement négatif (décroissance temporelle)
      return value < 0 ? 'text-red-600' : 'text-green-600';
    }
    if (type === 'gamma') {
      // Gamma est généralement positif
      return value > 0 ? 'text-green-600' : 'text-red-600';
    }
    return 'text-gray-900 dark:text-gray-100';
  };

  // Obtenir la paire de devises sélectionnée
  const allPairs = [...CURRENCY_PAIRS, ...customCurrencyPairs];
  const selectedPair = allPairs.find(p => p.symbol === selectedCurrencyPair);

  // Calculs complémentaires pour l'affichage des résultats
  const notional = notionalBase;
  const spot = pricingInputs.spotPrice;
  const base = selectedPair?.base || 'EUR';
  const quote = selectedPair?.quote || 'USD';
  const premiumBase = pricingResults.length > 0 ? pricingResults[0].price * notional : 0;
  const premiumQuote = premiumBase * spot;
  const strikeAbs = strategyComponent.strikeType === 'percent' ? spot * (strategyComponent.strike / 100) : strategyComponent.strike;
  const barrierAbs = strategyComponent.barrierType === 'percent' && strategyComponent.barrier ? spot * strategyComponent.barrier / 100 : (strategyComponent.barrier || undefined);
  const secondBarrierAbs = strategyComponent.barrierType === 'percent' && strategyComponent.secondBarrier ? spot * strategyComponent.secondBarrier / 100 : (strategyComponent.secondBarrier || undefined);

  // Génération des données de payoff pour le graphique - UTILISE STRICTEMENT PricingService
  const generatePayoffData = () => {
    const spot = pricingInputs.spotPrice;
    const priceRange = Array.from({length: 101}, (_, i) => spot * (0.7 + i * 0.006)); // -30% à +30%
    const premium = pricingResults.length > 0 ? pricingResults[0].price : 0; // ✅ Vraie prime calculée
    
    return priceRange.map(price => {
      // ✅ UTILISER STRICTEMENT PricingService.calculateStrategyPayoffAtPrice
      let totalPayoff = PricingService.calculateStrategyPayoffAtPrice([strategyComponent], price, spot);
      
      // ✅ Intégrer la vraie prime dans le payoff
      // Pour un achat d'option (quantity > 0), on soustrait la prime payée
      // Pour une vente d'option (quantity < 0), on ajoute la prime reçue
      if (premium !== 0 && strategyComponent.quantity !== 0) {
        const quantity = strategyComponent.quantity / 100;
        if (quantity > 0) {
          totalPayoff -= premium; // Achat: on paie la prime
        } else if (quantity < 0) {
          totalPayoff += premium; // Vente: on reçoit la prime
        }
      }
      
      return { price, payoff: totalPayoff };
    });
  };

  const payoffData = generatePayoffData();

  // ✅ AJOUT: Génération des données de prix et grecques en fonction du spot
  const generatePriceData = () => {
    const currentSpot = pricingInputs.spotPrice;
    const spotRange = Array.from({length: 101}, (_, i) => currentSpot * (0.7 + i * 0.006)); // -30% à +30%
    
    return spotRange.map(spot => {
      try {
        // Calculer le strike selon le type
        const strike = strategyComponent.strikeType === 'percent' 
          ? currentSpot * (strategyComponent.strike / 100)  // Utiliser le spot original pour le strike
          : strategyComponent.strike;
          
        // Calculer les barrières selon le type
        const barrier = strategyComponent.barrier ? (
          strategyComponent.barrierType === 'percent'
            ? currentSpot * (strategyComponent.barrier / 100)
            : strategyComponent.barrier
        ) : undefined;

        const secondBarrier = strategyComponent.secondBarrier ? (
          strategyComponent.barrierType === 'percent'
            ? currentSpot * (strategyComponent.secondBarrier / 100)
            : strategyComponent.secondBarrier
        ) : undefined;

        // ✅ UTILISATION DU SPOT PRICE PAR DÉFAUT
        const underlyingPrice = spot;
        
        let price = 0;
        let greeks: Greeks | undefined;
        
        if (strategyComponent.type === 'forward') {
          price = PricingService.calculateFXForwardPrice(
            spot,
            pricingInputs.domesticRate / 100,
            pricingInputs.foreignRate / 100,
            pricingInputs.timeToMaturity
          ) - strike;
        } else if (strategyComponent.type === 'swap') {
          const forward = PricingService.calculateFXForwardPrice(
            spot,
            pricingInputs.domesticRate / 100,
            pricingInputs.foreignRate / 100,
            pricingInputs.timeToMaturity
          );
          price = PricingService.calculateSwapPrice(
            [forward],
            [pricingInputs.timeToMaturity],
            pricingInputs.domesticRate / 100
          );
        } else if (strategyComponent.type === 'call' || strategyComponent.type === 'put') {
          // ✅ VANILLA OPTIONS
          price = PricingService.calculateGarmanKohlhagenPrice(
            strategyComponent.type,
            underlyingPrice,
            strike,
            pricingInputs.domesticRate / 100,
            pricingInputs.foreignRate / 100,
            pricingInputs.timeToMaturity,
            strategyComponent.volatility / 100
          );
          
          // Calculer les grecques
          if (showGreeks) {
            greeks = PricingService.calculateGreeks(
              strategyComponent.type,
              underlyingPrice,
              strike,
              pricingInputs.domesticRate / 100,
              pricingInputs.foreignRate / 100,
              pricingInputs.timeToMaturity,
              strategyComponent.volatility / 100,
              barrier,
              secondBarrier,
              strategyComponent.rebate || 1
            );
          }
        } else if (strategyComponent.type.includes('knockout') || strategyComponent.type.includes('knockin')) {
          // ✅ BARRIER OPTIONS
          if (barrierPricingModel === 'closed-form') {
            price = PricingService.calculateBarrierOptionClosedForm(
              strategyComponent.type,
              underlyingPrice,
              strike,
              pricingInputs.domesticRate / 100,
              pricingInputs.timeToMaturity,
              strategyComponent.volatility / 100,
              barrier || 0,
              secondBarrier
            );
          } else {
            price = PricingService.calculateBarrierOptionPrice(
              strategyComponent.type,
              underlyingPrice,
              strike,
              pricingInputs.domesticRate / 100,
              pricingInputs.timeToMaturity,
              strategyComponent.volatility / 100,
              barrier || 0,
              secondBarrier,
              1000
            );
          }
          
          // Calculer les grecques pour les barrières
          if (showGreeks) {
            try {
              greeks = PricingService.calculateGreeks(
                strategyComponent.type,
                underlyingPrice,
                strike,
                pricingInputs.domesticRate / 100,
                pricingInputs.foreignRate / 100,
                pricingInputs.timeToMaturity,
                strategyComponent.volatility / 100,
                barrier,
                secondBarrier,
                strategyComponent.rebate || 1
              );
            } catch (error) {
              console.warn('Error calculating Greeks for barrier option at spot', spot, error);
            }
          }
        } else {
          // ✅ DIGITAL OPTIONS - Utilise formules fermées ou Monte Carlo selon barrierPricingModel
          const useClosedForm = barrierPricingModel === 'closed-form';
          price = PricingService.calculateDigitalOptionPrice(
            strategyComponent.type,
            underlyingPrice,
            strike,
            pricingInputs.domesticRate / 100,
            pricingInputs.foreignRate / 100,  // ✅ CORRIGÉ : Ajouter r_f
            pricingInputs.timeToMaturity,
            strategyComponent.volatility / 100,
            barrier,
            secondBarrier,
            pricingInputs.numSimulations,
            strategyComponent.rebate || 1,
            useClosedForm
          );
        }
        
        // Ajuster le prix par la quantité
        const adjustedPrice = price * strategyComponent.quantity / 100;
        
        return { 
          spot: parseFloat(spot.toFixed(4)), 
          price: adjustedPrice,
          delta: greeks?.delta || 0,
          gamma: greeks?.gamma || 0,
          theta: greeks?.theta || 0,
          vega: greeks?.vega || 0,
          rho: greeks?.rho || 0
        };
      } catch (error) {
        console.warn('Error calculating price/greeks at spot', spot, error);
        return { 
          spot: parseFloat(spot.toFixed(4)), 
          price: 0,
          delta: 0,
          gamma: 0,
          theta: 0,
          vega: 0,
          rho: 0
        };
      }
    });
  };

  // Calculer les données de prix et grecques
  const priceData = generatePriceData();

  return (
    <Layout 
      title="Pricers"
      breadcrumbs={[
        { label: "Dashboard", href: "/" },
        { label: "Pricers" }
      ]}
    >
      <div className="space-y-8">
        {/* En-tête moderne */}
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <h1 className="text-4xl font-bold tracking-tight">FX Pricers</h1>
            <p className="text-lg text-muted-foreground">
              Advanced pricing engine for options, swaps and forwards
            </p>
          </div>
          <Button 
            onClick={handleCalculateClick} 
            disabled={isCalculating}
            size="lg"
            className="flex items-center gap-3 px-8 py-3 text-base font-medium"
          >
            {isCalculating ? (
              <>
                <Clock className="w-5 h-5 animate-spin" />
                Calculating...
              </>
            ) : (
              <>
                <Calculator className="w-5 h-5" />
                Calculate
              </>
            )}
          </Button>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-4 gap-8">
          {/* Panneau de configuration */}
          <div className="xl:col-span-1 space-y-6">
            {/* Sélection de l'instrument */}
            <Card className="border-0 shadow-lg">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-3 text-xl">
                  <Settings className="w-6 h-6 text-primary" />
                  Configuration
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Type d'instrument */}
                <div className="space-y-2">
                  <Label>Instrument Type</Label>
                  <Select value={selectedInstrument} onValueChange={setSelectedInstrument}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {INSTRUMENT_TYPES.map((instrument) => (
                        <SelectItem key={instrument.value} value={instrument.value}>
                          {instrument.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* ✅ AJOUT: Modèle de pricing pour les barrières et options digitales */}
                {((selectedInstrument.includes('knockout') || selectedInstrument.includes('knockin')) ||
                  (selectedInstrument.includes('one-touch') || selectedInstrument.includes('no-touch') ||
                   selectedInstrument.includes('double-touch') || selectedInstrument.includes('double-no-touch') ||
                   selectedInstrument.includes('range-binary') || selectedInstrument.includes('outside-binary'))) && (
                  <div className="space-y-2">
                    <Label>Pricing Method</Label>
                    <Select value={barrierPricingModel} onValueChange={(value: 'closed-form' | 'monte-carlo') => setBarrierPricingModel(value)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="closed-form">
                          <div className="flex items-center gap-2">
                            <Calculator className="w-4 h-4" />
                            Closed-Form (Analytical)
                          </div>
                        </SelectItem>
                        <SelectItem value="monte-carlo">
                          <div className="flex items-center gap-2">
                            <BarChart3 className="w-4 h-4" />
                            Monte Carlo (Simulation)
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <div className="text-xs text-muted-foreground">
                      {barrierPricingModel === 'closed-form' 
                        ? 'Uses exact analytical formulas for barrier and digital options'
                        : 'Uses Monte Carlo simulations for barrier and digital options'
                      }
                    </div>
                  </div>
                )}

                {/* ✅ AJOUT: Affichage des grecques */}
                {(selectedInstrument !== 'forward' && selectedInstrument !== 'swap') && (
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <Switch
                        id="greeks-toggle"
                        checked={showGreeks}
                        onCheckedChange={setShowGreeks}
                      />
                      <Label htmlFor="greeks-toggle" className="text-sm">
                        Calculate Greeks
                      </Label>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {showGreeks 
                        ? 'Delta, Gamma, Theta, Vega and Rho will be calculated with analytical formulas'
                        : 'Greeks will not be calculated (performance gain)'
                      }
                    </div>
                  </div>
                )}

                {/* Paire de devises */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    Currency Pair
                    <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded">Synced with Market Data</span>
                  </Label>
                  <Select 
                    value={selectedCurrencyPair} 
                    onValueChange={async (value) => {
                      setSelectedCurrencyPair(value);
                      const allPairs = [...CURRENCY_PAIRS, ...customCurrencyPairs];
                      const selectedPair = allPairs.find(p => p.symbol === value);
                      if (selectedPair) {
                        // First set with default rate
                        setPricingInputs(prev => ({ ...prev, spotPrice: selectedPair.defaultSpotRate }));
                        
                        // Show loading toast
                        toast({
                          title: "Fetching Rate...",
                          description: `Loading real-time rate for ${selectedPair.symbol} from Market Data...`,
                        });
                        
                        // Then fetch real-time rate from Market Data
                        try {
                          const realTimeRate = await fetchRealTimeRate(selectedPair);
                          if (realTimeRate !== null && !isNaN(realTimeRate) && realTimeRate > 0) {
                            setPricingInputs(prev => ({ ...prev, spotPrice: realTimeRate }));
                            toast({
                              title: "Rate Updated",
                              description: `Real-time rate for ${selectedPair.symbol}: ${realTimeRate.toFixed(4)}`,
                            });
                          } else {
                            toast({
                              title: "Rate Fetch Failed",
                              description: `Using default rate for ${selectedPair.symbol}`,
                              variant: "default"
                            });
                          }
                        } catch (error) {
                          console.error('Error fetching rate:', error);
                          toast({
                            title: "Rate Fetch Error",
                            description: `Could not fetch rate. Using default value.`,
                            variant: "destructive"
                          });
                        }
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <div className="p-2 text-xs font-medium text-muted-foreground border-b flex items-center gap-2">
                        <span>Major Pairs</span>
                        <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded">Live Rates</span>
                      </div>
                      {CURRENCY_PAIRS.filter(pair => pair.category === 'majors').map((pair) => (
                        <SelectItem key={pair.symbol} value={pair.symbol}>
                          <div className="flex flex-col">
                            <span className="font-medium">{pair.symbol}</span>
                            <span className="text-xs text-muted-foreground">{pair.name}</span>
                          </div>
                        </SelectItem>
                      ))}
                      <div className="p-2 text-xs font-medium text-muted-foreground border-b border-t flex items-center gap-2">
                        <span>Cross Rates</span>
                        <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded">Live Rates</span>
                      </div>
                      {CURRENCY_PAIRS.filter(pair => pair.category === 'crosses').map((pair) => (
                        <SelectItem key={pair.symbol} value={pair.symbol}>
                          <div className="flex flex-col">
                            <span className="font-medium">{pair.symbol}</span>
                            <span className="text-xs text-muted-foreground">{pair.name}</span>
                          </div>
                        </SelectItem>
                      ))}
                      <div className="p-2 text-xs font-medium text-muted-foreground border-b border-t flex items-center gap-2">
                        <span>Other Currencies</span>
                        <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded">Live Rates</span>
                      </div>
                      {CURRENCY_PAIRS.filter(pair => pair.category === 'others').map((pair) => (
                        <SelectItem key={pair.symbol} value={pair.symbol}>
                          <div className="flex flex-col">
                            <span className="font-medium">{pair.symbol}</span>
                            <span className="text-xs text-muted-foreground">{pair.name}</span>
                          </div>
                        </SelectItem>
                      ))}
                      {customCurrencyPairs.length > 0 && (
                        <>
                          <div className="p-2 text-xs font-medium text-muted-foreground border-b border-t flex items-center gap-2">
                            <span>Custom Pairs</span>
                            <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded">Live Rates</span>
                          </div>
                          {customCurrencyPairs.map((pair) => (
                            <SelectItem key={pair.symbol} value={pair.symbol}>
                              <div className="flex flex-col">
                                <span className="font-medium">{pair.symbol}</span>
                                <span className="text-xs text-muted-foreground">{pair.name}</span>
                              </div>
                            </SelectItem>
                          ))}
                        </>
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Dates (cohérent avec Strategy Builder) */}
            <Card className="border-0 shadow-lg">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-3 text-xl">
                  <Calendar className="w-6 h-6 text-primary" />
                  Dates
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Date de début */}
                <div className="space-y-2">
                  <Label>Start Date</Label>
                  <Input
                    type="date"
                    value={pricingInputs.startDate}
                    onChange={(e) => updatePricingInput('startDate', e.target.value)}
                  />
                </div>

                {/* Date de maturité */}
                <div className="space-y-2">
                  <Label>Maturity Date</Label>
                  <Input
                    type="date"
                    value={pricingInputs.maturityDate}
                    onChange={(e) => updatePricingInput('maturityDate', e.target.value)}
                  />
                </div>

                {/* Maturité calculée */}
                <div className="space-y-2">
                  <Label>Maturity (years)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={pricingInputs.timeToMaturity.toFixed(2)}
                    disabled
                    className="bg-muted"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Paramètres de base */}
            <Card className="border-0 shadow-lg">
              <CardHeader className="pb-4">
                <CardTitle className="text-xl">Basic Parameters</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Prix spot */}
                <div className="space-y-2">
                  <Label>Spot Price ({selectedPair?.symbol || 'EUR/USD'})</Label>
                  <Input
                    type="number"
                    step="0.0001"
                    value={pricingInputs.spotPrice}
                    onChange={(e) => updatePricingInput('spotPrice', parseFloat(e.target.value))}
                  />
                </div>

                {/* Prix d'exercice */}
                <div className="space-y-2">
                  <Label>Strike Price</Label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      step="0.01"
                      value={strategyComponent.strike}
                      onChange={(e) => updateStrategyComponent('strike', parseFloat(e.target.value))}
                      className="flex-1"
                    />
                    <Select value={strategyComponent.strikeType} onValueChange={(value: 'percent' | 'absolute') => updateStrategyComponent('strikeType', value)}>
                      <SelectTrigger className="w-20">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="percent">
                          <div className="flex items-center gap-1">
                            <Percent className="w-3 h-3" />
                            %
                          </div>
                        </SelectItem>
                        <SelectItem value="absolute">
                          <div className="flex items-center gap-1">
                            <Hash className="w-3 h-3" />
                            Abs
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {strategyComponent.strikeType === 'percent' 
                      ? `Absolute value: ${(pricingInputs.spotPrice * strategyComponent.strike / 100).toFixed(4)}`
                      : `Percentage: ${((strategyComponent.strike / pricingInputs.spotPrice) * 100).toFixed(2)}%`
                    }
                  </div>
                </div>

                {/* Quantité */}
                <div className="space-y-2">
                  <Label>Quantity</Label>
                  <Input
                    type="number"
                    step="1"
                    value={strategyComponent.quantity}
                    onChange={(e) => updateStrategyComponent('quantity', parseInt(e.target.value))}
                  />
                </div>

                {/* ✅ AJOUT: Notionnels bidirectionnels */}
                <div className="space-y-3">
                  <Label className="text-sm font-medium">Notionnels</Label>
                  
                  {/* Notionnel devise de base */}
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">
                      Notional {selectedPair?.base || 'EUR'}
                    </Label>
                    <Input
                      type="number"
                      step="1000"
                      value={notionalBase}
                      onChange={(e) => handleNotionalBaseChange(parseFloat(e.target.value) || 0)}
                      className="text-right"
                    />
                  </div>
                  
                  {/* Notionnel devise de contrepartie */}
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">
                      Notional {selectedPair?.quote || 'USD'}
                    </Label>
                    <Input
                      type="number"
                      step="1000"
                      value={notionalQuote}
                      onChange={(e) => handleNotionalQuoteChange(parseFloat(e.target.value) || 0)}
                      className="text-right"
                    />
                  </div>
                  
                  {/* Indicateur de synchronisation */}
                  <div className="text-xs text-muted-foreground text-center">
                    📊 Rate: {pricingInputs.spotPrice} {selectedPair?.quote || 'USD'}/{selectedPair?.base || 'EUR'}
                    <br />
                    🔄 Last modified: {lastChanged === 'base' ? selectedPair?.base || 'EUR' : selectedPair?.quote || 'USD'}
                  </div>
                </div>

                {/* Volatilité */}
                <div className="space-y-2">
                  <Label>Volatility (%)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={strategyComponent.volatility}
                    onChange={(e) => updateStrategyComponent('volatility', parseFloat(e.target.value))}
                  />
                </div>

                {/* Taux domestique */}
                <div className="space-y-2">
                  <Label>
                    {selectedPair?.quote || 'USD'} Rate (%)
                    <span className="ml-1 text-xs text-muted-foreground" title="Interest rate of the quote currency. Used as domestic rate in FX formula.">?</span>
                  </Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={pricingInputs.domesticRate}
                    onChange={(e) => updatePricingInput('domesticRate', parseFloat(e.target.value))}
                  />
                </div>

                {/* Taux étranger */}
                <div className="space-y-2">
                  <Label>
                    {selectedPair?.base || 'EUR'} Rate (%)
                    <span className="ml-1 text-xs text-muted-foreground" title="Interest rate of the base currency. Used as foreign rate in FX formula.">?</span>
                  </Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={pricingInputs.foreignRate}
                    onChange={(e) => updatePricingInput('foreignRate', parseFloat(e.target.value))}
                  />
                </div>

                {/* Barrière - visible par défaut pour les options avec barrières */}
                {(selectedInstrument.includes('knockout') || selectedInstrument.includes('knockin') || selectedInstrument.includes('touch')) && (
                  <div className="space-y-2">
                    <Label>Barrier</Label>
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        step="0.01"
                        value={strategyComponent.barrier ?? ''}
                        onChange={(e) => updateStrategyComponent('barrier', e.target.value === '' ? undefined : parseFloat(e.target.value))}
                        className="flex-1"
                      />
                      <Select value={strategyComponent.barrierType || 'percent'} onValueChange={(value: 'percent' | 'absolute') => updateStrategyComponent('barrierType', value)}>
                        <SelectTrigger className="w-20">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="percent">
                            <div className="flex items-center gap-1">
                              <Percent className="w-3 h-3" />
                              %
                            </div>
                          </SelectItem>
                          <SelectItem value="absolute">
                            <div className="flex items-center gap-1">
                              <Hash className="w-3 h-3" />
                              Abs
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {strategyComponent.barrier !== undefined && (
                      <div className="text-xs text-muted-foreground">
                        {strategyComponent.barrierType === 'percent' 
                          ? `Absolute value: ${(spot * strategyComponent.barrier / 100).toFixed(4)}`
                          : `Percentage: ${((strategyComponent.barrier / spot) * 100).toFixed(2)}%`
                        }
                      </div>
                    )}
                  </div>
                )}

                {/* Deuxième barrière - visible par défaut pour les options double */}
                {selectedInstrument.includes('double') && (
                  <div className="space-y-2">
                    <Label>Second Barrier</Label>
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        step="0.01"
                        value={strategyComponent.secondBarrier ?? ''}
                        onChange={(e) => updateStrategyComponent('secondBarrier', e.target.value === '' ? undefined : parseFloat(e.target.value))}
                        className="flex-1"
                      />
                      <Select value={strategyComponent.barrierType || 'percent'} onValueChange={(value: 'percent' | 'absolute') => updateStrategyComponent('barrierType', value)}>
                        <SelectTrigger className="w-20">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="percent">
                            <div className="flex items-center gap-1">
                              <Percent className="w-3 h-3" />
                              %
                            </div>
                          </SelectItem>
                          <SelectItem value="absolute">
                            <div className="flex items-center gap-1">
                              <Hash className="w-3 h-3" />
                              Abs
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {strategyComponent.secondBarrier !== undefined && (
                      <div className="text-xs text-muted-foreground">
                        {strategyComponent.barrierType === 'percent' 
                          ? `Absolute value: ${(spot * strategyComponent.secondBarrier / 100).toFixed(4)}`
                          : `Percentage: ${((strategyComponent.secondBarrier / spot) * 100).toFixed(2)}%`
                        }
                      </div>
                    )}
                  </div>
                )}

                {/* Paramètres spécifiques aux options digitales */}
                {(selectedInstrument.includes('touch') || selectedInstrument.includes('binary')) && (
                  <>
                    {/* Rebate - pour toutes les options digitales */}
                    <div className="space-y-2">
                      <Label>Rebate (%)</Label>
                      <Input
                        type="number"
                        step="0.1"
                        value={strategyComponent.rebate || 1.0}
                        onChange={(e) => updateStrategyComponent('rebate', parseFloat(e.target.value))}
                        placeholder="1.0"
                      />
                      <div className="text-xs text-muted-foreground">
                        Rebate amount as percentage of notional (default: 1%)
                      </div>
                    </div>

                    {/* Time to Payoff - spécifique aux one-touch */}
                    {selectedInstrument === 'one-touch' && (
                      <div className="space-y-2">
                        <Label>Time to Payoff (years)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={strategyComponent.timeToPayoff || 1.0}
                          onChange={(e) => updateStrategyComponent('timeToPayoff', parseFloat(e.target.value))}
                          placeholder="1.0"
                        />
                        <div className="text-xs text-muted-foreground">
                          Time to payoff for one-touch options (default: 1 year)
                        </div>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            {/* Paramètres avancés */}
            <Card className="border-0 shadow-lg">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center justify-between text-xl">
                  Advanced Parameters
                  <Switch
                    checked={showAdvanced}
                    onCheckedChange={setShowAdvanced}
                  />
                </CardTitle>
              </CardHeader>
              {showAdvanced && (
                <CardContent className="space-y-4">
                  {/* Nombre de simulations */}
                  <div className="space-y-2">
                    <Label>Number of Simulations</Label>
                    <Input
                      type="number"
                      step="100"
                      value={pricingInputs.numSimulations}
                      onChange={(e) => updatePricingInput('numSimulations', parseInt(e.target.value))}
                    />
                    <div className="text-xs text-muted-foreground">
                      Used for Monte Carlo simulations (default: 1000 like Strategy Builder)
                    </div>
                  </div>
                </CardContent>
              )}
            </Card>
          </div>

          {/* Résultats */}
          <div className="xl:col-span-3 space-y-8">
            {/* Résultats de pricing */}
            {pricingResults.length > 0 && (
              <Card className="border-0 shadow-lg">
                <CardHeader className="pb-4">
                  <CardTitle className="flex items-center gap-3 text-xl">
                    <CheckCircle className="w-6 h-6 text-green-600" />
                    Pricing Results
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-2">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {pricingResults.map((result, index) => (
                      <Card key={index} className="p-6 border-0 shadow-md">
                        <div className="flex items-center justify-between mb-3">
                          <Badge className={getMethodColor(result.method)}>
                            <div className="flex items-center gap-1">
                              {getMethodIcon(result.method)}
                              {result.method}
                            </div>
                          </Badge>
                        </div>
                        
                        <div className="space-y-2">
                          <div className="flex justify-between">
                            <span className="text-sm text-muted-foreground">Prix:</span>
                            <span className="font-mono font-bold text-lg">
                              {formatPrice(result.price)}
                            </span>
                          </div>

                          {result.greeks && (
                            <div className="pt-2 border-t">
                              <div className="text-xs font-medium text-muted-foreground mb-2">Analytical Greeks:</div>
                              <div className="grid grid-cols-2 gap-2 text-xs">
                                <div className={`${getGreekColor(result.greeks.delta, 'delta')}`}>
                                  <span className="font-medium">Δ (Delta):</span><br/>
                                  {formatGreek(result.greeks.delta)}
                                </div>
                                <div className={`${getGreekColor(result.greeks.gamma, 'gamma')}`}>
                                  <span className="font-medium">Γ (Gamma):</span><br/>
                                  {formatGreek(result.greeks.gamma)}
                                </div>
                                <div className={`${getGreekColor(result.greeks.theta, 'theta')}`}>
                                  <span className="font-medium">Θ (Theta):</span><br/>
                                  {formatGreek(result.greeks.theta)}
                                </div>
                                <div className={`${getGreekColor(result.greeks.vega, 'vega')}`}>
                                  <span className="font-medium">Vega:</span><br/>
                                  {formatGreek(result.greeks.vega)}
                                </div>
                                <div className={`${getGreekColor(result.greeks.rho, 'rho')}`}>
                                  <span className="font-medium">ρ (Rho):</span><br/>
                                  {formatGreek(result.greeks.rho)}
                                </div>
                              </div>
                              <div className="text-xs text-muted-foreground mt-2">
                                <strong>Interpretation:</strong><br/>
                                Δ: Sensitivity to underlying price<br/>
                                Γ: Delta sensitivity to price<br/>
                                Θ: Time decay<br/>
                                Vega: Sensitivity to volatility<br/>
                                ρ: Sensitivity to interest rates
                              </div>
                            </div>
                          )}
                        </div>
                      </Card>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Résumé de la transaction */}
            <Card className="border-0 shadow-lg">
              <CardHeader className="pb-4">
                <CardTitle className="text-xl">Transaction Summary</CardTitle>
              </CardHeader>
              <CardContent className="pt-2">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 text-sm">
                  <div className="p-4 bg-muted/30 rounded-lg">
                    <span className="font-semibold text-sm text-muted-foreground">Notional {base}</span><br/>
                    <span className="text-lg font-semibold">{notional.toLocaleString()} {base}</span>
                  </div>
                  <div className="p-4 bg-muted/30 rounded-lg">
                    <span className="font-semibold text-sm text-muted-foreground">Notional {quote}</span><br/>
                    <span className="text-lg font-semibold">{notionalQuote.toLocaleString(undefined, {maximumFractionDigits:2})} {quote}</span>
                  </div>
                  <div className="p-4 bg-muted/30 rounded-lg">
                    <span className="font-semibold text-sm text-muted-foreground">Spot Price</span><br/>
                    <span className="text-lg font-semibold">{spot} {quote}/{base}</span>
                  </div>
                  <div className="p-4 bg-muted/30 rounded-lg">
                    <span className="font-semibold text-sm text-muted-foreground">Absolute Strike</span><br/>
                    <span className="text-lg font-semibold">{strikeAbs.toFixed(4)} {quote}</span>
                  </div>
                  {/* ✅ Afficher les barrières selon le type d'option */}
                  {(selectedInstrument.includes('knockout') || selectedInstrument.includes('knockin') || selectedInstrument.includes('touch') || selectedInstrument.includes('binary')) && (
                    <>
                      {/* ✅ Barrier 1 - toujours affiché pour les options avec barrières */}
                      <div className="p-4 bg-muted/30 rounded-lg">
                        <span className="font-semibold text-sm text-muted-foreground">Barrier 1</span><br/>
                        <span className="text-lg font-semibold">{barrierAbs ? barrierAbs.toFixed(4) + ' ' + quote : '-'}</span>
                      </div>
                      
                      {/* ✅ Barrier 2 - seulement pour les options double barrière */}
                      {selectedInstrument.includes('double') && (
                        <div className="p-4 bg-muted/30 rounded-lg">
                          <span className="font-semibold text-sm text-muted-foreground">Barrier 2</span><br/>
                          <span className="text-lg font-semibold">{secondBarrierAbs ? secondBarrierAbs.toFixed(4) + ' ' + quote : '-'}</span>
                        </div>
                      )}
                    </>
                  )}
                  <div className="p-4 bg-muted/30 rounded-lg">
                    <span className="font-semibold text-sm text-muted-foreground">{quote} Rate</span><br/>
                    <span className="text-lg font-semibold">{pricingInputs.domesticRate}%</span>
                  </div>
                  <div className="p-4 bg-muted/30 rounded-lg">
                    <span className="font-semibold text-sm text-muted-foreground">{base} Rate</span><br/>
                    <span className="text-lg font-semibold">{pricingInputs.foreignRate}%</span>
                  </div>
                  <div className="p-4 bg-muted/30 rounded-lg">
                    <span className="font-semibold text-sm text-muted-foreground">Volatility</span><br/>
                    <span className="text-lg font-semibold">{strategyComponent.volatility}%</span>
                  </div>
                  <div className="p-4 bg-muted/30 rounded-lg">
                    <span className="font-semibold text-sm text-muted-foreground">Maturity</span><br/>
                    <span className="text-lg font-semibold">{pricingInputs.timeToMaturity.toFixed(2)} years</span>
                  </div>
                </div>
              </CardContent>
            </Card>



            {/* Prime totale */}
            {pricingResults.length > 0 && (
              <Card className="border-0 shadow-lg">
                <CardHeader className="pb-4">
                  <CardTitle className="text-xl">Total Premium</CardTitle>
                </CardHeader>
                <CardContent className="pt-2">
                  <div className="flex flex-col gap-3 text-lg">
                    <div className="flex justify-between items-center p-4 bg-muted/50 rounded-lg">
                      <span className="font-semibold">Premium ({base}):</span>
                      <span className="font-mono text-xl">{premiumBase.toLocaleString(undefined, {maximumFractionDigits:2})} {base}</span>
                    </div>
                    <div className="flex justify-between items-center p-4 bg-muted/50 rounded-lg">
                      <span className="font-semibold">Premium ({quote}):</span>
                      <span className="font-mono text-xl">{premiumQuote.toLocaleString(undefined, {maximumFractionDigits:2})} {quote}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Affichage du graphique Payoff/FX Hedging/Price/Greeks */}
            <Card className="border-0 shadow-lg">
              <PayoffChart
                data={payoffData}
                strategy={[strategyComponent]}
                spot={pricingInputs.spotPrice}
                currencyPair={selectedPair}
                includePremium={true}
                showPremiumToggle={true}
                realPremium={pricingResults.length > 0 ? pricingResults[0].price : undefined}
                priceData={priceData}
              />
            </Card>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Pricers;