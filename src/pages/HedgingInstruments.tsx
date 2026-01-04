import React, { useState, useEffect } from "react";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { 
  Plus, 
  Shield, 
  TrendingUp,
  TrendingDown,
  Clock,
  Target,
  ArrowUpDown,
  BarChart3,
  Edit,
  Trash2,
  Eye,
  Download,
  AlertCircle,
  Calculator,
  RefreshCw
} from "lucide-react";
import StrategyImportService, { HedgingInstrument } from "@/services/StrategyImportService";
import { PricingService } from "@/services/PricingService";
// ✅ IMPORT EXACT DES FONCTIONS EXPORTÉES D'INDEX.TSX UTILISÉES PAR STRATEGY BUILDER
import {
  calculateBarrierOptionPrice,
  calculateBarrierOptionClosedForm,
  calculateDigitalOptionPrice,
  calculateGarmanKohlhagenPrice,
  calculateVanillaOptionMonteCarlo,
  erf
} from "@/pages/Index";

// Interface pour les paramètres de marché par devise
interface CurrencyMarketData {
  spot: number;
  volatility: number;
  domesticRate: number;
  foreignRate: number;
}

const HedgingInstruments = () => {
  const { toast } = useToast();
  const [selectedTab, setSelectedTab] = useState("all");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [showExportColumns, setShowExportColumns] = useState(false);
  const [instruments, setInstruments] = useState<HedgingInstrument[]>(() => {
    try {
      const saved = localStorage.getItem('hedgingInstruments');
      return saved ? JSON.parse(saved) : [];
    } catch (error) {
      console.error('Error loading instruments from localStorage:', error);
      return [];
    }
  });
  const [importService] = useState(() => StrategyImportService.getInstance());
  
  // ✅ MTM Calculation states - maintenant par devise avec logique Strategy Builder
  const [strategyStartDate, setStrategyStartDate] = useState(() => {
    // Récupérer depuis Strategy Builder si disponible
    try {
      const savedState = localStorage.getItem('calculatorState');
      if (savedState) {
        const state = JSON.parse(savedState);
        return state.strategyStartDate || new Date().toISOString().split('T')[0];
      }
    } catch (error) {
      console.warn('Error loading strategy start date from Strategy Builder:', error);
    }
    return new Date().toISOString().split('T')[0];
  });
  
  const [hedgingStartDate, setHedgingStartDate] = useState(() => {
    // Récupérer depuis Strategy Builder si disponible
    try {
      const savedState = localStorage.getItem('calculatorState');
      if (savedState) {
        const state = JSON.parse(savedState);
        return state.startDate || new Date().toISOString().split('T')[0];
      }
    } catch (error) {
      console.warn('Error loading hedging start date from Strategy Builder:', error);
    }
    return new Date().toISOString().split('T')[0];
  });

  // ✅ Fonction pour récupérer les dates depuis les instruments exportés
  const getExportDatesFromInstruments = () => {
    if (instruments.length === 0) return null;
    
    // Chercher un instrument avec des dates d'export
    const instrumentWithDates = instruments.find(inst => 
      inst.exportStrategyStartDate && inst.exportHedgingStartDate
    );
    
    if (instrumentWithDates) {
      return {
        strategyStartDate: instrumentWithDates.exportStrategyStartDate,
        hedgingStartDate: instrumentWithDates.exportHedgingStartDate
      };
    }
    
    return null;
  };
  
  const [valuationDate, setValuationDate] = useState(new Date().toISOString().split('T')[0]);
  const [currencyMarketData, setCurrencyMarketData] = useState<{ [currency: string]: CurrencyMarketData }>(() => {
    // Charger les données de marché depuis localStorage
    try {
      const saved = localStorage.getItem('currencyMarketData');
      return saved ? JSON.parse(saved) : {};
    } catch (error) {
      console.error('Error loading currency market data:', error);
      return {};
    }
  });
  const [isRecalculating, setIsRecalculating] = useState(false);

  // Dialog states for view and edit actions
  const [selectedInstrument, setSelectedInstrument] = useState<HedgingInstrument | null>(null);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  // Pricing model states - récupérer depuis le localStorage pour utiliser les mêmes paramètres que Strategy Builder
  const [optionPricingModel, setOptionPricingModel] = useState<'black-scholes' | 'garman-kohlhagen' | 'monte-carlo'>(() => {
    const savedState = localStorage.getItem('calculatorState');
    if (savedState) {
      const state = JSON.parse(savedState);
      // Chercher optionPricingModel dans les paramètres sauvegardés
      return state.optionPricingModel || 'garman-kohlhagen';
    }
    return 'garman-kohlhagen';
  });
  
  const [barrierPricingModel, setBarrierPricingModel] = useState<'monte-carlo' | 'closed-form'>(() => {
    const savedState = localStorage.getItem('calculatorState');
    if (savedState) {
      const state = JSON.parse(savedState);
      return state.barrierPricingModel || 'closed-form';
    }
    return 'closed-form';
  });
  
  const [barrierOptionSimulations, setBarrierOptionSimulations] = useState<number>(() => {
    const savedState = localStorage.getItem('calculatorState');
    if (savedState) {
      const state = JSON.parse(savedState);
      return state.barrierOptionSimulations || 1000;
    }
    return 1000;
  });
  
  const [useImpliedVol, setUseImpliedVol] = useState<boolean>(() => {
    const savedState = localStorage.getItem('calculatorState');
    if (savedState) {
      const state = JSON.parse(savedState);
      return state.useImpliedVol || false;
    }
    return false;
  });
  
  const [impliedVolatilities, setImpliedVolatilities] = useState(() => {
    const savedState = localStorage.getItem('calculatorState');
    if (savedState) {
      const state = JSON.parse(savedState);
      return state.impliedVolatilities || {};
    }
    return {};
  });

  // Fonction pour extraire les devises uniques des instruments
  const getUniqueCurrencies = (instruments: HedgingInstrument[]): string[] => {
    const currencies = new Set<string>();
    instruments.forEach(instrument => {
      if (instrument.currency) {
        currencies.add(instrument.currency);
      }
    });
    return Array.from(currencies).sort();
  };

  // Fonction pour extraire les données de marché depuis les instruments exportés du Strategy Builder
  const getMarketDataFromInstruments = (currency: string): CurrencyMarketData | null => {
    const currencyInstruments = instruments.filter(inst => inst.currency === currency);
    if (currencyInstruments.length === 0) return null;
    
    // Prendre les données du premier instrument de cette devise
    const firstInstrument = currencyInstruments[0];
    
    return {
      spot: firstInstrument.exportSpotPrice || 1.0000,
      volatility: firstInstrument.exportVolatility || 20,
      domesticRate: firstInstrument.exportDomesticRate || 1.0,
      foreignRate: firstInstrument.exportForeignRate || 1.0
    };
  };

  // Charger les instruments depuis le service
  useEffect(() => {
    const loadInstruments = () => {
      const service = StrategyImportService.getInstance();
      const loadedInstruments = service.getHedgingInstruments();
      
      // LOG DE DIAGNOSTIC : Vérifier les données d'export
      console.log('[DEBUG] Instruments chargés depuis le service:', loadedInstruments);
      if (loadedInstruments.length > 0) {
        const firstInstrument = loadedInstruments[0];
        console.log('[DEBUG] Premier instrument - Données d\'export:');
        console.log('  - exportSpotPrice:', firstInstrument.exportSpotPrice);
        console.log('  - exportDomesticRate:', firstInstrument.exportDomesticRate);
        console.log('  - exportForeignRate:', firstInstrument.exportForeignRate);
        console.log('  - exportVolatility:', firstInstrument.exportVolatility);
        console.log('  - exportTimeToMaturity:', firstInstrument.exportTimeToMaturity);
        console.log('  - exportForwardPrice:', firstInstrument.exportForwardPrice);
      }
      
      setInstruments(loadedInstruments);
      
      // Initialiser les données de marché pour les nouvelles devises depuis les instruments exportés
      const uniqueCurrencies = getUniqueCurrencies(loadedInstruments);
      setCurrencyMarketData(prevData => {
        const newData = { ...prevData };
        let hasUpdates = false;
        
        uniqueCurrencies.forEach(currency => {
          const exportData = getMarketDataFromInstruments(currency);
          if (exportData) {
            // TOUJOURS mettre à jour avec les données d'export (pas seulement si absent)
            const currentData = newData[currency];
            if (!currentData || 
                currentData.spot !== exportData.spot ||
                currentData.domesticRate !== exportData.domesticRate ||
                currentData.foreignRate !== exportData.foreignRate) {
              
              console.log(`[DEBUG] Updating market data for ${currency} with export data:`, exportData);
              newData[currency] = exportData;
              hasUpdates = true;
            }
          }
        });
        
        // Sauvegarder dans localStorage seulement si des mises à jour
        if (hasUpdates) {
          try {
            localStorage.setItem('currencyMarketData', JSON.stringify(newData));
          } catch (error) {
            console.error('Error saving currency market data:', error);
          }
        }
        
        return newData;
      });
    };

    loadInstruments();
    
    // Listen for updates from Strategy Builder
    const handleUpdate = () => {
        loadInstruments();
    };

    window.addEventListener('hedgingInstrumentsUpdated', handleUpdate);
    return () => window.removeEventListener('hedgingInstrumentsUpdated', handleUpdate);
  }, []);

  // Force re-calculation when valuation date changes
  useEffect(() => {
    if (instruments.length > 0) {
      console.log(`[🔄 VALUATION DATE CHANGE] New date: ${valuationDate} - Forcing recalculation of ${instruments.length} instruments`);
      
      // Force re-render to recalculate all Today Prices with new valuation date
      const updatedInstruments = instruments.map(instrument => ({ ...instrument }));
      setInstruments(updatedInstruments);
      
      // Force update of currency market data state to trigger re-renders
      setCurrencyMarketData(prev => ({ ...prev }));
      
      // Show toast to confirm recalculation
      toast({
        title: "Valuation Date Updated",
        description: `Recalculating prices and MTM for ${instruments.length} instruments as of ${valuationDate}`,
      });
    } else {
      console.log(`[🔄 VALUATION DATE CHANGE] New date: ${valuationDate} - No instruments to recalculate`);
    }
  }, [valuationDate, toast]);

  // Force re-calculation when market parameters change (spot, volatility, rates)
  useEffect(() => {
    if (instruments.length > 0) {
      console.log(`[DEBUG] Market parameters changed, forcing recalculation of Today Prices and MTM`);
      // Force re-render to recalculate all Today Prices and MTM with new market parameters
      const updatedInstruments = instruments.map(instrument => ({ ...instrument }));
      setInstruments(updatedInstruments);
    }
  }, [currencyMarketData]);

  // ✅ Synchroniser les dates avec Strategy Builder et instruments exportés
  useEffect(() => {
    const handleStrategyBuilderUpdate = () => {
      try {
        const savedState = localStorage.getItem('calculatorState');
        if (savedState) {
          const state = JSON.parse(savedState);
          if (state.strategyStartDate) {
            setStrategyStartDate(state.strategyStartDate);
          }
          if (state.startDate) {
            setHedgingStartDate(state.startDate);
          }
        }
      } catch (error) {
        console.warn('Error syncing dates with Strategy Builder:', error);
      }
    };

    // ✅ Synchroniser avec les dates d'export des instruments
    const handleExportDatesSync = () => {
      const exportDates = getExportDatesFromInstruments();
      if (exportDates) {
        console.log('[HEDGING] Syncing with export dates:', exportDates);
        setStrategyStartDate(exportDates.strategyStartDate);
        setHedgingStartDate(exportDates.hedgingStartDate);
      }
    };

    // Écouter les changements dans Strategy Builder
    window.addEventListener('storage', handleStrategyBuilderUpdate);
    
    // Vérifier au chargement
    handleStrategyBuilderUpdate();
    handleExportDatesSync();

    return () => {
      window.removeEventListener('storage', handleStrategyBuilderUpdate);
    };
  }, [instruments]); // ✅ Ajouter instruments comme dépendance

  // ✅ Recalculer automatiquement quand les dates changent
  useEffect(() => {
    if (instruments.length > 0) {
      console.log('[HEDGING] Dates changed - Strategy Start:', strategyStartDate, 'Hedging Start:', hedgingStartDate);
      // Force re-render pour recalculer les MTM
      setInstruments([...instruments]);
    }
  }, [strategyStartDate, hedgingStartDate]);

  // ✅ Utiliser exactement la même logique de pricing que Strategy Builder

  // ✅ Calcul de maturité avec logique Strategy Builder
  const calculateTimeToMaturity = (maturityDate: string, valuationDate: string): number => {
    const result = PricingService.calculateTimeToMaturity(maturityDate, valuationDate);
    console.log('[HEDGING] maturity:', maturityDate, 'valuation:', valuationDate, 'result:', result.toFixed(6), 'years');
    return result;
  };

  // ✅ Calcul de maturité depuis Strategy Start Date (comme Strategy Builder)
  const calculateTimeToMaturityFromStrategyStart = (maturityDate: string): number => {
    return PricingService.calculateTimeToMaturity(maturityDate, strategyStartDate);
  };

  // ✅ Calcul de maturité depuis Hedging Start Date (pour affichage)
  const calculateTimeToMaturityFromHedgingStart = (maturityDate: string): number => {
    return PricingService.calculateTimeToMaturity(maturityDate, hedgingStartDate);
  };

  // Utiliser le PricingService centralisé au lieu de redéfinir erf
  // const erf = (x: number): number => { ... } - SUPPRIMÉ, utilise PricingService.erf()

  // Function to get implied volatility - identique à Index.tsx
  const getImpliedVolatility = (monthKey: string, optionKey?: string) => {
    if (!useImpliedVol) return null;
    
    if (optionKey && impliedVolatilities[monthKey] && impliedVolatilities[monthKey][optionKey] !== undefined) {
      return impliedVolatilities[monthKey][optionKey];
    }
    
    if (impliedVolatilities[monthKey] && impliedVolatilities[monthKey].global !== undefined) {
      return impliedVolatilities[monthKey].global;
    }
    
    return null;
  };

    // ✅ CORRECTION : Utiliser exactement les MÊMES FONCTIONS que Strategy Builder (exportées d'Index.tsx)
  const calculateOptionPrice = (type: string, S: number, K: number, r: number, t: number, sigma: number, instrument: HedgingInstrument, date?: Date, optionIndex?: number) => {
    // ✅ UTILISATION STRICTE DES FONCTIONS EXPORTÉES D'INDEX.TSX - MÊME LOGIQUE QUE STRATEGY BUILDER
    
    // 1. Gestion de la volatilité implicite (même logique que Strategy Builder)
    let effectiveSigma = sigma;
    if (date && useImpliedVol) {
      const monthKey = `${date.getFullYear()}-${date.getMonth() + 1}`;
      const optionKey = optionIndex !== undefined ? `${type}-${optionIndex}` : undefined;
      const iv = getImpliedVolatility(monthKey, optionKey);
      
      if (iv !== null) {
        effectiveSigma = iv / 100;
      }
    }

    // If it's a barrier option, use Monte Carlo simulation or closed-form solution based on flag
    if (type.includes('knockout') || type.includes('knockin')) {
      // Récupérer les paramètres depuis l'originalComponent de l'instrument
      const originalComponent = instrument.originalComponent;
      if (!originalComponent) {
        console.warn('Missing originalComponent for barrier option:', instrument.id);
        return 0;
      }

      // Calculate barrier values - même logique que Strategy Builder
      const barrier = originalComponent.barrierType === 'percent' ? 
        S * (originalComponent.barrier / 100) : 
        originalComponent.barrier;
        
      const secondBarrier = originalComponent.type.includes('double') ? 
        (originalComponent.barrierType === 'percent' ? 
          S * (originalComponent.secondBarrier / 100) : 
          originalComponent.secondBarrier) : 
        undefined;

      // ✅ Utiliser les MÊMES FONCTIONS que Strategy Builder (exportées d'Index.tsx)
      if (barrierPricingModel === 'closed-form') {
        return Math.max(0, calculateBarrierOptionClosedForm(
          type, S, K, r, t, effectiveSigma, barrier, secondBarrier
        ));
      } else {
        return Math.max(0, calculateBarrierOptionPrice(
          type, S, K, r, t, effectiveSigma, barrier, secondBarrier, barrierOptionSimulations
        ));
      }
    }

    // If it's a digital option, use Monte Carlo simulation
    if (type.includes('one-touch') || type.includes('no-touch') || type.includes('double-touch') || 
        type.includes('double-no-touch') || type.includes('range-binary') || type.includes('outside-binary')) {
      
      const originalComponent = instrument.originalComponent;
      if (!originalComponent) {
        console.warn('Missing originalComponent for digital option:', instrument.id);
        return 0;
      }

      const barrier = originalComponent.barrierType === 'percent' ? 
        S * (originalComponent.barrier / 100) : 
        originalComponent.barrier;
        
      const secondBarrier = originalComponent.type.includes('double') ? 
        (originalComponent.barrierType === 'percent' ? 
          S * (originalComponent.secondBarrier / 100) : 
          originalComponent.secondBarrier) : 
        undefined;

      const rebate = originalComponent.rebate !== undefined ? originalComponent.rebate : 1;
      const numSimulations = barrierOptionSimulations || 10000;

      // ✅ CORRIGÉ : Utiliser r_d et r_f pour Garman-Kohlhagen
      const marketData = currencyMarketData[instrument.currency] || getMarketDataFromInstruments(instrument.currency);
      const r_d = marketData ? marketData.domesticRate / 100 : r;
      const r_f = marketData ? marketData.foreignRate / 100 : 0;

      // ✅ Utiliser barrierPricingModel pour choisir entre closed-form et monte-carlo
      const useClosedForm = barrierPricingModel === 'closed-form';

      // ✅ Utiliser la MÊME FONCTION que Strategy Builder (exportée d'Index.tsx)
      return calculateDigitalOptionPrice(
        type, S, K, r_d, r_f, t, effectiveSigma, barrier, secondBarrier, numSimulations, rebate, useClosedForm
      );
    }

    // For vanilla options, use the selected pricing model - même logique que Strategy Builder
    const marketData = currencyMarketData[instrument.currency] || getMarketDataFromInstruments(instrument.currency);
    const r_d = marketData ? marketData.domesticRate / 100 : r;
    const r_f = marketData ? marketData.foreignRate / 100 : 0;
    
    // For standard options, use appropriate pricing model
    let price = 0;
    if (optionPricingModel === 'garman-kohlhagen') {
      // ✅ Utiliser la MÊME FONCTION que Strategy Builder (exportée d'Index.tsx)
      price = calculateGarmanKohlhagenPrice(type, S, K, r_d, r_f, t, effectiveSigma);
    } else if (optionPricingModel === 'monte-carlo') {
      // ✅ Utiliser la MÊME FONCTION que Strategy Builder (exportée d'Index.tsx)
      price = calculateVanillaOptionMonteCarlo(
        type, S, K, r_d, r_f, t, effectiveSigma, 1000 // Number of simulations for vanilla options
      );
    } else {
      // Use traditional Black-Scholes - même implémentation que Strategy Builder
      const d1 = (Math.log(S/K) + (r + effectiveSigma**2/2)*t) / (effectiveSigma*Math.sqrt(t));
      const d2 = d1 - effectiveSigma*Math.sqrt(t);
      
      const Nd1 = (1 + erf(d1/Math.sqrt(2)))/2;
      const Nd2 = (1 + erf(d2/Math.sqrt(2)))/2;
      
      if (type === 'call') {
        price = S*Nd1 - K*Math.exp(-r*t)*Nd2;
      } else { // put
        price = K*Math.exp(-r*t)*(1-Nd2) - S*(1-Nd1);
      }
    }
    
    // S'assurer que le prix de l'option n'est jamais négatif - même logique que Strategy Builder
    return Math.max(0, price);
  };

  // Fonction calculateTodayPrice améliorée pour utiliser les données enrichies d'export
  // Note: La fonction calculateBarrierOptionClosedForm a été déplacée vers PricingService
  // avec une implémentation complète pour les options à double barrière

  const calculateTodayPrice = (instrument: HedgingInstrument): number => {
    // ✅ STRATÉGIE : Utiliser les valeurs CURRENT affichées dans le tableau (modifiables par l'utilisateur)
    
    // ✅ 1. TIME TO MATURITY : Utiliser la Valuation Date pour le calcul MTM
    // Vérifier si l'option est expirée
    const valuationDateObj = new Date(valuationDate);
    const maturityDateObj = new Date(instrument.maturity);
    
    // Si la Valuation Date est après la Maturity Date, l'option est expirée
    if (valuationDateObj >= maturityDateObj) {
      console.log(`[DEBUG] ${instrument.id}: Option expired - Valuation Date (${valuationDate}) >= Maturity Date (${instrument.maturity})`);
      // Pour les options expirées, retourner la valeur intrinsèque
      const marketData = currencyMarketData[instrument.currency] || getMarketDataFromInstruments(instrument.currency) || { spot: 1.0000, volatility: 20, domesticRate: 1.0, foreignRate: 1.0 };
      const spotRate = instrument.impliedSpotPrice || marketData.spot;
      const K = instrument.strike || spotRate;
      
      if (instrument.type.toLowerCase().includes('call')) {
        return Math.max(0, spotRate - K);
      } else if (instrument.type.toLowerCase().includes('put')) {
        return Math.max(0, K - spotRate);
      } else if (instrument.type.toLowerCase() === 'forward') {
        return spotRate - K;
      }
      return 0;
    }
    
    // Pour le MTM, on calcule depuis la Valuation Date jusqu'à la maturité
    const calculationTimeToMaturity = PricingService.calculateTimeToMaturity(instrument.maturity, valuationDate);
    
    // Utiliser la même base de calcul pour l'affichage et le pricing
    const displayTimeToMaturity = calculationTimeToMaturity;
    
    // 2. PARAMÈTRES DE MARCHÉ : Utiliser les valeurs CURRENT des données de marché
    const marketData = currencyMarketData[instrument.currency] || getMarketDataFromInstruments(instrument.currency) || { spot: 1.0000, volatility: 20, domesticRate: 1.0, foreignRate: 1.0 };
    
    // Utiliser les paramètres CURRENT (modifiables par l'utilisateur)
    // Hiérarchie pour le spot price : individuel > global
    const spotRate = instrument.impliedSpotPrice || marketData.spot;  // Current spot price
    const r_d = marketData.domesticRate / 100;  // Current domestic rate
    const r_f = marketData.foreignRate / 100;  // Current foreign rate
    
    console.log(`[DEBUG] ${instrument.id}: Using CURRENT parameters - spot=${spotRate}, r_d=${(r_d*100).toFixed(3)}%, r_f=${(r_f*100).toFixed(3)}%, t=${calculationTimeToMaturity.toFixed(6)} (valuationDate=${valuationDate})`);
    console.log(`[DEBUG] ${instrument.id}: Export vs Current - Export spot: ${instrument.exportSpotPrice || 'N/A'}, Current: ${marketData.spot}`);
    console.log(`[DEBUG] ${instrument.id}: Export vs Current - Export r_d: ${instrument.exportDomesticRate ? (instrument.exportDomesticRate).toFixed(3) + '%' : 'N/A'}, Current: ${marketData.domesticRate.toFixed(3)}%`);
    console.log(`[DEBUG] ${instrument.id}: Export vs Current - Export r_f: ${instrument.exportForeignRate ? (instrument.exportForeignRate).toFixed(3) + '%' : 'N/A'}, Current: ${marketData.foreignRate.toFixed(3)}%`);
    
    // 3. VOLATILITÉ : Utiliser la volatilité CURRENT affichée dans le tableau (modifiable par l'utilisateur)
    let sigma;
    if (instrument.impliedVolatility) {
      // 1. Priorité : Volatilité implicite spécifique (éditable par l'utilisateur)
      sigma = instrument.impliedVolatility / 100;
      console.log(`[DEBUG] ${instrument.id}: Using CURRENT IMPLIED volatility: ${(sigma*100).toFixed(3)}%`);
    } else if (instrument.volatility) {
      // 2. Priorité : Volatilité spécifique de l'instrument (éditable par l'utilisateur)
      sigma = instrument.volatility / 100;
      console.log(`[DEBUG] ${instrument.id}: Using CURRENT instrument volatility: ${(sigma*100).toFixed(3)}%`);
         } else if (marketData.volatility) {
       // 3. Priorité : Volatilité globale de la devise (éditable par l'utilisateur)
       sigma = marketData.volatility / 100;
       console.log(`[DEBUG] ${instrument.id}: Using CURRENT market volatility: ${(sigma*100).toFixed(3)}%`);
    } else {
      // 5. Fallback : Volatilité des données de marché
      const marketData = currencyMarketData[instrument.currency] || getMarketDataFromInstruments(instrument.currency) || { spot: 1.0000, volatility: 20, domesticRate: 1.0, foreignRate: 1.0 };
      sigma = marketData.volatility / 100;
      console.log(`[DEBUG] ${instrument.id}: Using CURRENT market volatility: ${(sigma*100).toFixed(3)}%`);
    }
    
    // 4. FORWARD CALCULATION : Utiliser PricingService pour calculer le forward
    const S = PricingService.calculateFXForwardPrice(spotRate, r_d, r_f, calculationTimeToMaturity);
    
    console.log(`[DEBUG] ${instrument.id}: Forward calculation - Current: ${S.toFixed(6)}, Export: ${instrument.exportForwardPrice || 'N/A'}`);
    console.log(`[DEBUG] ${instrument.id}: PRICING PARAMETERS - Spot: ${spotRate.toFixed(6)}, Forward: ${S.toFixed(6)} - Using SPOT for vanilla options (Strategy Builder logic)`);
    
    // 5. STRIKE ANALYSIS : Vérifier la cohérence du strike
    console.log(`[DEBUG] ${instrument.id}: Strike analysis - Strike: ${instrument.strike}, Type: ${instrument.originalComponent?.strikeType || 'unknown'}, Original Strike: ${instrument.originalComponent?.strike || 'N/A'}, Spot: ${spotRate}`);
    
         console.log(`[DEBUG] ${instrument.id}: Time to maturity - Valuation Date: ${valuationDate}, TTM: ${calculationTimeToMaturity.toFixed(4)} years (Maturity: ${instrument.maturity})`);
     console.log(`[DEBUG] ${instrument.id}: Using current spot ${spotRate.toFixed(4)} -> forward ${S.toFixed(4)} (r_d=${(r_d*100).toFixed(1)}%, r_f=${(r_f*100).toFixed(1)}%, t=${calculationTimeToMaturity.toFixed(4)})`);
    
    // Vérifier l'expiration
     if (calculationTimeToMaturity <= 0) {
      return 0;
    }

    // Utiliser le strike en valeur absolue de l'instrument
    const K = instrument.strike || S;
    
    // Map instrument type to option type pour pricing
    const optionType = instrument.type.toLowerCase();
     
     // Pour les options à barrière, vérifier si le spot actuel a franchi les barrières
     if (optionType.includes('knock') || optionType.includes('barrier')) {
       const barrier = instrument.barrier;
       const secondBarrier = instrument.secondBarrier;
       
       if (barrier) {
         console.log(`[DEBUG] ${instrument.id}: Barrier analysis - spot=${spotRate.toFixed(4)}, barrier=${barrier.toFixed(4)}`);
         
         if (secondBarrier) {
           const lowerBarrier = Math.min(barrier, secondBarrier);
           const upperBarrier = Math.max(barrier, secondBarrier);
           const spotOutsideRange = spotRate <= lowerBarrier || spotRate >= upperBarrier;
           console.log(`[DEBUG] ${instrument.id}: Double barrier analysis - spot=${spotRate.toFixed(4)}, lower=${lowerBarrier.toFixed(4)}, upper=${upperBarrier.toFixed(4)}, outside=${spotOutsideRange}`);
           
           // Pour les double knock-out: si le spot est en dehors des barrières, l'option est déjà knockée
           if (optionType.includes('knock-out') && spotOutsideRange) {
             console.log(`[DEBUG] ${instrument.id}: Double knock-out option already knocked out (spot outside barriers)`);
             return 0;
           }
           
           // Pour les double knock-in: si le spot est en dehors des barrières, l'option est activée
           if (optionType.includes('knock-in') && spotOutsideRange) {
             console.log(`[DEBUG] ${instrument.id}: Double knock-in option activated (spot outside barriers)`);
             // Continuer avec le pricing normal d'une option vanille
           }
         } else {
           // Barrière simple
           let barrierCrossed = false;
           
           if (optionType.includes('reverse')) {
             // Pour les reverse barriers, la logique est inversée
             if (optionType.includes('call')) {
               barrierCrossed = spotRate <= barrier; // Call reverse: knocked si spot en dessous
             } else {
               barrierCrossed = spotRate >= barrier; // Put reverse: knocked si spot au dessus
             }
           } else {
             // Barrières normales
             if (optionType.includes('call')) {
               barrierCrossed = spotRate >= barrier; // Call: knocked si spot au dessus
             } else {
               barrierCrossed = spotRate <= barrier; // Put: knocked si spot en dessous
             }
           }
           
           console.log(`[DEBUG] ${instrument.id}: Single barrier analysis - barrierCrossed=${barrierCrossed}`);
           
           // Pour les knock-out: si barrière franchie, option knockée
           if (optionType.includes('knock-out') && barrierCrossed) {
             console.log(`[DEBUG] ${instrument.id}: Knock-out option already knocked out`);
             return 0;
           }
           
           // Pour les knock-in: si barrière franchie, option activée
           if (optionType.includes('knock-in') && barrierCrossed) {
             console.log(`[DEBUG] ${instrument.id}: Knock-in option activated`);
             // Continuer avec le pricing normal d'une option vanille
           }
         }
       }
     }
    // DEBUG: Log des paramètres pour diagnostiquer les écarts de pricing
    console.log(`[DEBUG] Instrument ${instrument.id}: ==================== PRICING COMPARISON ====================`);
    console.log(`[DEBUG] Instrument ${instrument.id}: Type: ${instrument.type}`);
    console.log(`[DEBUG] Instrument ${instrument.id}: Original/Export Price: ${instrument.realOptionPrice || instrument.premium || 'N/A'}`);
         console.log(`[DEBUG] Instrument ${instrument.id}: Current Spot: ${spotRate.toFixed(6)}, Forward: ${S.toFixed(6)}`);
     console.log(`[DEBUG] Instrument ${instrument.id}: Strike: ${K.toFixed(6)}`);
     console.log(`[DEBUG] Instrument ${instrument.id}: Barrier: ${instrument.barrier?.toFixed(6) || 'N/A'}, SecondBarrier: ${instrument.secondBarrier?.toFixed(6) || 'N/A'}`);
     console.log(`[DEBUG] Instrument ${instrument.id}: Rebate: ${instrument.rebate || 'N/A'}%`);
     console.log(`[DEBUG] Instrument ${instrument.id}: Rates - Domestic: ${(r_d*100).toFixed(3)}%, Foreign: ${(r_f*100).toFixed(3)}%`);
     console.log(`[DEBUG] Instrument ${instrument.id}: Time to Maturity - Strategy: ${instrument.timeToMaturity?.toFixed(6) || 'N/A'}, Calculated: ${calculationTimeToMaturity.toFixed(6)}`);
     console.log(`[DEBUG] Instrument ${instrument.id}: Volatility - Implied: ${instrument.impliedVolatility || 'N/A'}%, Component: ${instrument.originalComponent?.volatility || 'N/A'}%, Instrument: ${instrument.volatility || 'N/A'}%, Market: ${marketData.volatility}%, Used: ${(sigma*100).toFixed(3)}%`);
     console.log(`[DEBUG] Instrument ${instrument.id}: Using timeToMaturity for calculation: ${calculationTimeToMaturity.toFixed(6)} (source: ${instrument.timeToMaturity ? 'Strategy' : 'Calculated'})`);
    
    // STRATÉGIE DE PRICING SELON LE TYPE D'INSTRUMENT
    // IMPORTANT: Ordre des conditions critique - les plus spécifiques d'abord !
    
    // 1. OPTIONS BARRIÈRES - PRIORITÉ ABSOLUE (avant les vanilles)
    if (optionType.includes('knock-out') || optionType.includes('knock-in') || 
        optionType.includes('barrier') || optionType.includes('ko ') || optionType.includes('ki ') ||
        optionType.includes('knockout') || optionType.includes('knockin') || optionType.includes('reverse')) {
      
      console.log(`[DEBUG] ${instrument.id}: Detected as BARRIER option, using closed-form`);
      
      // Utiliser les barrières en valeur absolue de l'instrument
      const barrier = instrument.barrier;
      const secondBarrier = instrument.secondBarrier;
      
      if (!barrier) {
        console.warn(`Barrier missing for ${instrument.type} instrument ${instrument.id}`);
        return 0;
      }
      
      // MAPPING CORRECT DES TYPES POUR LE PRICING SERVICE
      let pricingType = "";
      
      // 1. OPTIONS À DOUBLE BARRIÈRE - PRIORITÉ ABSOLUE
      if (optionType.includes('double')) {
        if (optionType.includes('knock-out') || optionType.includes('knockout')) {
          if (optionType.includes('call')) {
            pricingType = "call-double-knockout";
            console.log(`[DEBUG] ${instrument.id}: Call-double-knockout detected`);
          } else if (optionType.includes('put')) {
            pricingType = "put-double-knockout";
            console.log(`[DEBUG] ${instrument.id}: Put-double-knockout detected`);
          }
        } else if (optionType.includes('knock-in') || optionType.includes('knockin')) {
          if (optionType.includes('call')) {
            pricingType = "call-double-knockin";
            console.log(`[DEBUG] ${instrument.id}: Call-double-knockin detected`);
          } else if (optionType.includes('put')) {
            pricingType = "put-double-knockin";
            console.log(`[DEBUG] ${instrument.id}: Put-double-knockin detected`);
          }
        }
      }
      // 2. OPTIONS À BARRIÈRE SIMPLE
      else if (optionType.includes('knock-out') || optionType.includes('knockout') || optionType.includes('reverse')) {
        if (optionType.includes('call')) {
          if (optionType.includes('reverse')) {
            pricingType = "call-reverse-knockout";
            console.log(`[DEBUG] ${instrument.id}: Call-reverse-knockout mapped to call-reverse-knockout`);
          } else {
            pricingType = "call-knockout";
          }
        } else if (optionType.includes('put')) {
          if (optionType.includes('reverse')) {
            pricingType = "put-reverse-knockout";
            console.log(`[DEBUG] ${instrument.id}: Put-reverse-knockout mapped to put-reverse-knockout (barrier=${barrier}, spot=${S})`);
          } else {
            pricingType = "put-knockout";
          }
        }
      } else if (optionType.includes('knock-in') || optionType.includes('knockin')) {
        if (optionType.includes('call')) {
          pricingType = "call-knockin";
        } else if (optionType.includes('put')) {
          pricingType = "put-knockin";
        }
      }
      
      console.log(`[DEBUG] ${instrument.id}: Mapped type to: "${pricingType}"`);
      console.log(`[DEBUG] ${instrument.id}: Barrier params - barrier=${barrier}, strike=${K}, spot=${S}`);
      console.log(`[DEBUG] ${instrument.id}: Barrier relationship - barrier < spot: ${barrier < S}, barrier > spot: ${barrier > S}`);
      
      if (pricingType) {
        // Pour les reverse-knockout, on peut avoir besoin d'ajuster les paramètres
        let adjustedBarrier = barrier;
        let adjustedStrike = K;
        
        if (optionType.includes('reverse')) {
          console.log(`[DEBUG] ${instrument.id}: Reverse option detected, using original parameters`);
          // Pour les reverse, on garde les paramètres originaux mais on change le type de pricing
        }
        
        // Utiliser le PricingService mis à jour avec support des options à double barrière
        const price = PricingService.calculateBarrierOptionClosedForm(
          pricingType,
          S,
          adjustedStrike,
          r_d, // Utiliser seulement le taux domestique comme dans Strategy Builder
          calculationTimeToMaturity,
          sigma,
          adjustedBarrier,
          secondBarrier,
          r_f // Ajouter le taux étranger pour FX options
        );
        console.log(`[DEBUG] ${instrument.id}: BARRIER FINAL COMPARISON - Calculated: ${price.toFixed(6)}, Export: ${instrument.realOptionPrice || instrument.premium || 'N/A'}, Difference: ${price - (instrument.realOptionPrice || instrument.premium || 0)}`);
        return price;
      }
      
      // Fallback si le mapping échoue
      return 0;
    }
    
    // 2. OPTIONS DIGITALES - DEUXIÈME PRIORITÉ
    else if (optionType.includes('touch') || optionType.includes('binary') || 
             optionType.includes('digital')) {
      
      console.log(`[DEBUG] ${instrument.id}: Detected as DIGITAL option, using Monte Carlo`);
      
      const barrier = instrument.barrier || K;
      const secondBarrier = instrument.secondBarrier;
      const rebate = instrument.rebate || 5; // Utiliser le rebate de l'instrument ou 5% par défaut
      
      console.log(`[DEBUG] ${instrument.id}: Digital option params - barrier=${barrier}, secondBarrier=${secondBarrier}, rebate=${rebate}%`);
      
      // ✅ CORRIGÉ : Passer r_d et r_f pour Garman-Kohlhagen
      // ✅ Utiliser barrierPricingModel pour choisir entre closed-form et monte-carlo
      const useClosedForm = barrierPricingModel === 'closed-form';
      const digitalPrice = PricingService.calculateDigitalOptionPrice(
        instrument.type.toLowerCase(),
        S,
        K,
        r_d,
        r_f,  // ✅ Ajouter r_f
        calculationTimeToMaturity,
        sigma,
        barrier,
        secondBarrier,
        10000, // Nombre de simulations pour les digitales
        rebate,
        useClosedForm
      );
      
      console.log(`[DEBUG] ${instrument.id}: DIGITAL FINAL COMPARISON - Calculated: ${digitalPrice.toFixed(6)}, Export: ${instrument.realOptionPrice || instrument.premium || 'N/A'}, Difference: ${digitalPrice - (instrument.realOptionPrice || instrument.premium || 0)}`);
      return digitalPrice;
    }
    
    // 3. OPTIONS VANILLES EXPLICITES - Utiliser EXACTEMENT la même logique que Strategy Builder
    else if (optionType === 'vanilla call') {
      console.log(`[DEBUG] ${instrument.id}: Detected as VANILLA CALL, using Strategy Builder logic`);
      
      return PricingService.calculateGarmanKohlhagenPrice(
        'call',
        spotRate,  // ✅ CORRECTION : Utiliser spotRate comme Strategy Builder (pas le forward S)
        K,
        r_d,
        r_f,
        calculationTimeToMaturity,
        sigma
      );
    } else if (optionType === 'vanilla put') {
      console.log(`[DEBUG] ${instrument.id}: Detected as VANILLA PUT, using Strategy Builder logic`);
      
      return PricingService.calculateGarmanKohlhagenPrice(
        'put',
        spotRate,  // ✅ CORRECTION : Utiliser spotRate comme Strategy Builder (pas le forward S)
        K,
        r_d,
        r_f,
        calculationTimeToMaturity,
        sigma
      );
    }
    
    // 4. FORWARDS
    else if (optionType === 'forward') {
      console.log(`[DEBUG] ${instrument.id}: Detected as FORWARD`);
      
      const forward = PricingService.calculateFXForwardPrice(S, r_d, r_f, calculationTimeToMaturity);
      return (forward - K) * Math.exp(-r_d * calculationTimeToMaturity);
    }
    
    // 5. SWAPS
    else if (optionType === 'swap') {
      console.log(`[DEBUG] ${instrument.id}: Detected as SWAP`);
      
      const forward = PricingService.calculateFXForwardPrice(S, r_d, r_f, calculationTimeToMaturity);
      return forward;
    }
    
    // 6. OPTIONS VANILLES GÉNÉRIQUES - SEULEMENT si pas déjà traité
    else if (optionType.includes('call') && !optionType.includes('knock')) {
      const underlyingResult = PricingService.calculateUnderlyingPrice(spotRate, r_d, r_f, calculationTimeToMaturity);
      console.log(`[DEBUG] ${instrument.id}: Fallback to VANILLA CALL using ${underlyingResult.type} price: ${underlyingResult.price.toFixed(6)}`);
      
      return PricingService.calculateGarmanKohlhagenPrice(
        'call',
        underlyingResult.price,  // ✅ Utiliser le prix sous-jacent selon les paramètres globaux
        K,
        r_d,
        r_f,
        calculationTimeToMaturity,
        sigma
      );
    } else if (optionType.includes('put') && !optionType.includes('knock')) {
      const underlyingResult = PricingService.calculateUnderlyingPrice(spotRate, r_d, r_f, calculationTimeToMaturity);
      console.log(`[DEBUG] ${instrument.id}: Fallback to VANILLA PUT using ${underlyingResult.type} price: ${underlyingResult.price.toFixed(6)}`);
      
      return PricingService.calculateGarmanKohlhagenPrice(
        'put',
        underlyingResult.price,  // ✅ Utiliser le prix sous-jacent selon les paramètres globaux
        K,
        r_d,
        r_f,
        calculationTimeToMaturity,
        sigma
      );
    }

    // Fallback pour types inconnus
    console.warn(`Unknown instrument type: ${instrument.type} for instrument ${instrument.id}`);
    const underlyingResult = PricingService.calculateUnderlyingPrice(spotRate, r_d, r_f, calculationTimeToMaturity);
    console.log(`[DEBUG] ${instrument.id}: Fallback pricing using ${underlyingResult.type} price: ${underlyingResult.price.toFixed(6)}`);
    const fallbackPrice = PricingService.calculateGarmanKohlhagenPrice(
      'call', // Default to call
      underlyingResult.price,  // ✅ Utiliser le prix sous-jacent selon les paramètres globaux
      K,
      r_d,
      r_f,
      calculationTimeToMaturity,
      sigma
    );
    
    console.log(`[DEBUG] Instrument ${instrument.id}: FINAL COMPARISON - Calculated: ${fallbackPrice.toFixed(6)}, Export: ${instrument.realOptionPrice || instrument.premium || 'N/A'}, Difference: ${fallbackPrice - (instrument.realOptionPrice || instrument.premium || 0)}`);
    return fallbackPrice;
  };

  // Fonction pour mettre à jour les données de marché d'une devise spécifique
  const updateCurrencyMarketData = (currency: string, field: keyof CurrencyMarketData, value: number) => {
    setCurrencyMarketData(prev => {
      const newData = {
      ...prev,
      [currency]: {
        ...prev[currency],
        [field]: value
      }
      };
      
      // Sauvegarder dans localStorage
      try {
        localStorage.setItem('currencyMarketData', JSON.stringify(newData));
      } catch (error) {
        console.error('Error saving currency market data:', error);
      }
      
      return newData;
    });
    
    // Si c'est la volatilité ou le spot rate qui change, recalculer automatiquement les prix
    if (field === 'volatility' || field === 'spot') {
      // Force re-render pour recalculer les Today Price
      setInstruments(prevInstruments => [...prevInstruments]);
      
      const fieldName = field === 'volatility' ? 'volatility' : 'spot rate';
      const unit = field === 'volatility' ? '%' : '';
      
      toast({
        title: `${fieldName === 'volatility' ? 'Volatility' : 'Spot Rate'} Updated`,
        description: `Updated ${fieldName} to ${value}${unit} for ${currency}. Today Prices recalculated.`,
      });
    }
  };

  // Fonction pour mettre à jour la volatilité d'un instrument spécifique
  const updateInstrumentVolatility = (instrumentId: string, volatility: number) => {
    setInstruments(prevInstruments => 
      prevInstruments.map(instrument => 
        instrument.id === instrumentId 
          ? { ...instrument, impliedVolatility: volatility }
          : instrument
      )
    );
    
    toast({
      title: "Individual Volatility Updated",
      description: `Updated volatility to ${volatility}% for instrument ${instrumentId}`,
    });
  };

  // Fonction pour réinitialiser la volatilité individuelle (utiliser la volatilité globale)
  const resetInstrumentVolatility = (instrumentId: string) => {
    setInstruments(prevInstruments => 
      prevInstruments.map(instrument => 
        instrument.id === instrumentId 
          ? { ...instrument, impliedVolatility: undefined }
          : instrument
      )
    );
    
    toast({
      title: "Individual Volatility Reset",
      description: `Reset to global volatility for instrument ${instrumentId}`,
    });
  };

  // Fonction pour mettre à jour le spot price d'un instrument spécifique
  const updateInstrumentSpotPrice = (instrumentId: string, spotPrice: number) => {
    setInstruments(prevInstruments => {
      const updated = prevInstruments.map(instrument =>
        instrument.id === instrumentId
          ? { ...instrument, impliedSpotPrice: spotPrice }
          : instrument
      );
      // Sauvegarde dans le localStorage
      try {
        localStorage.setItem('hedgingInstruments', JSON.stringify(updated));
      } catch (error) {
        console.error('Error saving instruments:', error);
      }
      return updated;
    });

    toast({
      title: "Individual Spot Price Updated",
      description: `Updated spot price to ${spotPrice.toFixed(6)} for instrument ${instrumentId}`,
    });
  };

  // Fonction pour réinitialiser le spot price individuel (utiliser le spot price global)
  const resetInstrumentSpotPrice = (instrumentId: string) => {
    setInstruments(prevInstruments => {
      const updated = prevInstruments.map(instrument =>
        instrument.id === instrumentId
          ? { ...instrument, impliedSpotPrice: undefined }
          : instrument
      );
      try {
        localStorage.setItem('hedgingInstruments', JSON.stringify(updated));
      } catch (error) {
        console.error('Error saving instruments:', error);
      }
      return updated;
    });

    toast({
      title: "Individual Spot Price Reset",
      description: `Reset to global spot price for instrument ${instrumentId}`,
    });
  };

  // Fonction pour appliquer les données par défaut d'une paire de devises
  const applyDefaultDataForCurrency = (currency: string) => {
    const defaultData = getMarketDataFromInstruments(currency) || { spot: 1.0000, volatility: 20, domesticRate: 1.0, foreignRate: 1.0 };
    
    console.log(`[DEBUG] Applying default data for ${currency}:`, defaultData);
    console.log(`[DEBUG] Source instrument exportSpotPrice:`, instruments.find(inst => inst.currency === currency)?.exportSpotPrice);
    
    setCurrencyMarketData(prev => {
      const newData = {
      ...prev,
      [currency]: defaultData
      };
      
      // Sauvegarder dans localStorage
      try {
        localStorage.setItem('currencyMarketData', JSON.stringify(newData));
      } catch (error) {
        console.error('Error saving currency market data:', error);
      }
      
      return newData;
    });
    
    toast({
      title: "Market Data Updated",
      description: `Applied export parameters for ${currency}: Spot ${defaultData.spot.toFixed(6)}`,
    });
  };

  // NOUVELLE FONCTION : Forcer la mise à jour depuis les données d'export
  const refreshMarketDataFromExport = () => {
    const uniqueCurrencies = getUniqueCurrencies(instruments);
    
    setCurrencyMarketData(prevData => {
      const newData = { ...prevData };
      let updatedCount = 0;
      
      uniqueCurrencies.forEach(currency => {
        const exportData = getMarketDataFromInstruments(currency);
        if (exportData) {
          console.log(`[DEBUG] Refreshing ${currency} with export data:`, exportData);
          newData[currency] = exportData;
          updatedCount++;
        }
      });
      
      // Sauvegarder dans localStorage
      try {
        localStorage.setItem('currencyMarketData', JSON.stringify(newData));
      } catch (error) {
        console.error('Error saving currency market data:', error);
      }
      
      if (updatedCount > 0) {
        toast({
          title: "Market Data Refreshed",
          description: `Updated ${updatedCount} currencies with export parameters`,
        });
      }
      
      return newData;
    });
  };

  const recalculateAllMTM = async () => {
    setIsRecalculating(true);
    
    try {
      // Small delay to show loading state
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Force re-render by updating state
      setInstruments([...instruments]);
      
      toast({
        title: "MTM Recalculated",
        description: `Updated prices for ${instruments.length} instruments using Strategy Start Date ${strategyStartDate} and Hedging Start Date ${hedgingStartDate}`,
      });
    } catch (error) {
      toast({
        title: "Calculation Error",
        description: "Failed to recalculate MTM. Please check your parameters.",
        variant: "destructive"
      });
    } finally {
      setIsRecalculating(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0
    }).format(amount);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge className="bg-green-100 text-green-800 border-green-200">Active</Badge>;
      case "matured":
        return <Badge variant="secondary">Matured</Badge>;
      case "cancelled":
        return <Badge variant="destructive">Cancelled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getInstrumentIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case "forward":
        return <ArrowUpDown className="h-4 w-4 text-blue-600" />;
      case "vanilla call":
      case "vanilla put":
        return <TrendingUp className="h-4 w-4 text-green-600" />;
      case "swap":
        return <BarChart3 className="h-4 w-4 text-purple-600" />;
      case "collar":
        return <Shield className="h-4 w-4 text-orange-600" />;
      default:
        return <Target className="h-4 w-4 text-gray-600" />;
    }
  };

  const getMTMColor = (mtm: number) => {
    return mtm >= 0 ? "text-green-600" : "text-red-600";
  };

  // Delete instrument function
  const deleteInstrument = (id: string) => {
    importService.deleteInstrument(id);
    const updatedInstruments = importService.getHedgingInstruments();
    setInstruments(updatedInstruments);
    
    // Dispatch custom event to notify other components
    window.dispatchEvent(new CustomEvent('hedgingInstrumentsUpdated'));
    
    toast({
      title: "Instrument Deleted",
      description: "The hedging instrument has been removed successfully.",
    });
  };

  const deleteAllInstruments = () => {
    // Delete all instruments using the same service method
    instruments.forEach(instrument => {
      importService.deleteInstrument(instrument.id);
    });
    
    const updatedInstruments = importService.getHedgingInstruments();
    setInstruments(updatedInstruments);
    
    // Dispatch custom event to notify other components
    window.dispatchEvent(new CustomEvent('hedgingInstrumentsUpdated'));
    
    toast({
      title: "All Instruments Deleted",
      description: "All hedging instruments have been removed successfully.",
    });
  };

  // View instrument function
  const viewInstrument = (instrument: HedgingInstrument) => {
    setSelectedInstrument(instrument);
    setIsViewDialogOpen(true);
  };

  // Edit instrument function
  const editInstrument = (instrument: HedgingInstrument) => {
    setSelectedInstrument(instrument);
    setIsEditDialogOpen(true);
  };

  // Save instrument changes function
  const saveInstrumentChanges = (updatedInstrument: HedgingInstrument) => {
    importService.updateInstrument(updatedInstrument.id, updatedInstrument);
    const updatedInstruments = importService.getHedgingInstruments();
    setInstruments(updatedInstruments);
    setIsEditDialogOpen(false);
    setSelectedInstrument(null);
    
    // Dispatch custom event to notify other components
    window.dispatchEvent(new CustomEvent('hedgingInstrumentsUpdated'));
    
    toast({
      title: "Instrument Updated",
      description: "The hedging instrument has been updated successfully.",
    });
  };

  const filteredInstruments = instruments.filter(instrument => {
    const isOption = instrument.type.includes("Call") || 
                    instrument.type.includes("Put") || 
                    instrument.type === "Collar" ||
                    instrument.type.includes("Touch") ||
                    instrument.type.includes("Binary") ||
                    instrument.type.includes("Digital") ||
                    instrument.type.includes("Knock");
    
    const matchesTab = selectedTab === "all" || 
                      (selectedTab === "forwards" && instrument.type === "Forward") ||
                      (selectedTab === "options" && isOption) ||
                      (selectedTab === "swaps" && instrument.type === "Swap") ||
                      (selectedTab === "hedge-accounting" && instrument.hedge_accounting);
    
    return matchesTab;
  });

  // Summary calculations
  const totalNotional = instruments.reduce((sum, inst) => {
    // Calculate the same way as displayed in the table
    const quantityToHedge = inst.quantity || 0;
    const unitPrice = inst.realOptionPrice || inst.premium || 0;
    const volumeToHedge = inst.notional;
    const calculatedNotional = unitPrice * volumeToHedge;
    
    // Use the same logic as in the table display
    const displayedNotional = calculatedNotional > 0 ? calculatedNotional : inst.notional;
    return sum + displayedNotional;
  }, 0);
  
  // Calculate total MTM using our pricing functions with currency-specific data
  const totalMTM = instruments.reduce((sum, inst) => {
    const marketData = currencyMarketData[inst.currency];
    if (!marketData) {
      console.warn(`No market data for currency ${inst.currency}, skipping MTM calculation`);
      return sum;
    }
    
    // Use the original premium paid/received for the instrument
    const originalPrice = inst.realOptionPrice || inst.premium || 0;
    
    // Calculate today's theoretical price using the same logic as Strategy Builder
    const todayPrice = calculateTodayPrice(inst);
    
    // MTM = (Today's Price - Original Price) * Notional
    // For sold options (negative quantity), the MTM calculation is inverted
    const quantity = inst.quantity || 1;
    const isShort = quantity < 0;
    
    let mtmValue;
    if (isShort) {
      // For short positions: MTM = Original Price - Today's Price
      mtmValue = originalPrice - todayPrice;
    } else {
      // For long positions: MTM = Today's Price - Original Price  
      mtmValue = todayPrice - originalPrice;
    }
    
    return sum + (mtmValue * Math.abs(inst.notional));
  }, 0);
  
  const hedgeAccountingCount = instruments.filter(inst => inst.hedge_accounting).length;

  return (
    <Layout 
      breadcrumbs={[
        { label: "Dashboard", href: "/" },
        { label: "Hedging Instruments" }
      ]}
    >
      {/* MTM Calculation Controls */}
      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5" />
            MTM Valuation Parameters
          </CardTitle>
          <CardDescription>
            Configure market parameters for Mark-to-Market calculations using Strategy Builder date logic
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* ✅ Strategy Builder Date Logic */}
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="strategy-start-date">Strategy Start Date</Label>
                <div className="flex items-center gap-2">
                <Input
                  id="strategy-start-date"
                  type="date"
                  value={strategyStartDate}
                    disabled
                    className="font-mono bg-gray-50 dark:bg-gray-800"
                />
                  <Badge variant="outline" className="text-xs">Fixed</Badge>
                </div>
                <p className="text-xs text-muted-foreground">Fixed from Strategy Builder</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="hedging-start-date">Hedging Start Date</Label>
                <div className="flex items-center gap-2">
                <Input
                  id="hedging-start-date"
                  type="date"
                  value={hedgingStartDate}
                    disabled
                    className="font-mono bg-gray-50 dark:bg-gray-800"
                />
                  <Badge variant="outline" className="text-xs">Fixed</Badge>
                </div>
                <p className="text-xs text-muted-foreground">Fixed from Strategy Builder</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="valuation-date">Valuation Date</Label>
                <Input
                  id="valuation-date"
                  type="date"
                  value={valuationDate}
                  onChange={(e) => setValuationDate(e.target.value)}
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">Track strategies over time</p>
              </div>
            </div>
            <div className="space-y-2 md:col-span-3">
              <Label>&nbsp;</Label>
              <div className="flex gap-2">
                <Button 
                  onClick={recalculateAllMTM}
                  disabled={isRecalculating}
                  className="flex-1"
                >
                  {isRecalculating ? (
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Calculator className="h-4 w-4 mr-2" />
                  )}
                  {isRecalculating ? "Calculating..." : "Recalculate All MTM"}
                </Button>
                

                
                {/* BOUTON DE TEST POUR DIAGNOSTIC */}
                <Button 
                  onClick={() => {
                    console.log('[DEBUG TEST] localStorage hedgingInstruments:', 
                      JSON.parse(localStorage.getItem('hedgingInstruments') || '[]'));
                    console.log('[DEBUG TEST] instruments state:', instruments);
                  }} 
                  variant="outline" 
                  size="sm"
                  className="px-3"
                >
                  🔍
                </Button>
              </div>
            </div>

            {/* Market Data per Currency */}
            {getUniqueCurrencies(instruments).length > 0 ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium text-muted-foreground">
                    Market Parameters by Currency ({getUniqueCurrencies(instruments).length} currencies found)
                  </Label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={refreshMarketDataFromExport}
                    className="text-xs"
                  >
                    <RefreshCw className="h-3 w-3 mr-1" />
                    Refresh from Export
                  </Button>
                </div>
                {getUniqueCurrencies(instruments).map((currency) => {
                  const data = currencyMarketData[currency] || getMarketDataFromInstruments(currency) || { spot: 1.0000, volatility: 20, domesticRate: 1.0, foreignRate: 1.0 };
                  return (
                    <div key={currency} className="border rounded-lg p-4 bg-muted/20">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="font-mono font-semibold">
                            {currency}
                          </Badge>
                          <span className="text-sm text-muted-foreground">
                            {instruments.filter(inst => inst.currency === currency).length} instrument(s)
                          </span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => applyDefaultDataForCurrency(currency)}
                          className="text-xs"
                        >
                          Reset to Default
                        </Button>
                      </div>
                      <div className="grid gap-3 md:grid-cols-4">
                        <div className="space-y-1">
                          <Label htmlFor={`spot-${currency}`} className="text-xs">Spot Rate</Label>
                          <Input
                            id={`spot-${currency}`}
                            type="number"
                            step="0.0001"
                            value={data.spot}
                            onChange={(e) => updateCurrencyMarketData(currency, 'spot', parseFloat(e.target.value) || data.spot)}
                            className="font-mono text-sm"
                            placeholder="1.0850"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor={`vol-${currency}`} className="text-xs">Volatility (%)</Label>
                          <Input
                            id={`vol-${currency}`}
                            type="number"
                            step="0.1"
                            min="0"
                            max="100"
                            value={data.volatility}
                            onChange={(e) => updateCurrencyMarketData(currency, 'volatility', parseFloat(e.target.value) || data.volatility)}
                            className="font-mono text-sm"
                            placeholder="20"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor={`dom-${currency}`} className="text-xs">Domestic Rate (%)</Label>
                          <Input
                            id={`dom-${currency}`}
                            type="number"
                            step="0.01"
                            min="0"
                            max="20"
                            value={data.domesticRate}
                            onChange={(e) => updateCurrencyMarketData(currency, 'domesticRate', parseFloat(e.target.value) || data.domesticRate)}
                            className="font-mono text-sm"
                            placeholder="1.0"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor={`for-${currency}`} className="text-xs">Foreign Rate (%)</Label>
                          <Input
                            id={`for-${currency}`}
                            type="number"
                            step="0.01"
                            min="0"
                            max="20"
                            value={data.foreignRate}
                            onChange={(e) => updateCurrencyMarketData(currency, 'foreignRate', parseFloat(e.target.value) || data.foreignRate)}
                            className="font-mono text-sm"
                            placeholder="0.5"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <AlertCircle className="h-8 w-8 mx-auto mb-2" />
                <p>No instruments found. Import strategies from Strategy Builder to see market parameters.</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Individual Volatility Overrides Summary */}
      {instruments.some(inst => inst.impliedVolatility) && (
        <Card className="mb-4 border-purple-200 bg-purple-50/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-purple-700 flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Individual Volatility Overrides
            </CardTitle>
            <CardDescription className="text-xs">
              Instruments using custom volatility instead of global market parameters
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex flex-wrap gap-2">
              {instruments
                .filter(inst => inst.impliedVolatility)
                .map(inst => (
                  <Badge key={inst.id} variant="secondary" className="text-xs bg-purple-100 text-purple-700">
                    {inst.id}: {inst.impliedVolatility?.toFixed(1)}%
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-3 w-3 p-0 ml-1 text-purple-500 hover:text-red-500"
                      onClick={() => resetInstrumentVolatility(inst.id)}
                      title="Reset to global volatility"
                    >
                      ×
                    </Button>
                  </Badge>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Individual Spot Price Overrides Summary */}
      {instruments.some(inst => inst.impliedSpotPrice) && (
        <Card className="mb-4 border-blue-200 bg-blue-50/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-blue-700 flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Individual Spot Price Overrides
            </CardTitle>
            <CardDescription className="text-xs">
              Instruments using custom spot price instead of global market parameters
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex flex-wrap gap-2">
              {instruments
                .filter(inst => inst.impliedSpotPrice)
                .map(inst => (
                  <Badge key={inst.id} variant="secondary" className="text-xs bg-blue-100 text-blue-700">
                    {inst.id}: {inst.impliedSpotPrice?.toFixed(6)}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-3 w-3 p-0 ml-1 text-blue-500 hover:text-red-500"
                      onClick={() => resetInstrumentSpotPrice(inst.id)}
                      title="Reset to global spot price"
                    >
                      ×
                    </Button>
                  </Badge>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Notional</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalNotional)}</div>
            <p className="text-xs text-muted-foreground">
              Across {instruments.length} instruments
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Mark-to-Market</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${getMTMColor(totalMTM)}`}>
              {formatCurrency(totalMTM)}
            </div>
            <p className="text-xs text-muted-foreground">
              Unrealized P&L
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Hedge Accounting</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{hedgeAccountingCount}</div>
            <p className="text-xs text-muted-foreground">
              Qualifying instruments
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Near Maturity</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">2</div>
            <p className="text-xs text-muted-foreground">
              Next 30 days
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Hedging Instruments</CardTitle>
              <CardDescription>
                Manage forwards, options, swaps and other hedging instruments
              </CardDescription>
            </div>
            <div className="flex gap-2">
              {/* Toggle Export Columns */}
              <Button 
                onClick={() => setShowExportColumns(!showExportColumns)}
                variant={showExportColumns ? "default" : "outline"}
                size="sm"
                className="whitespace-nowrap"
              >
                {showExportColumns ? "Hide Export" : "Show Export"}
              </Button>
              
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Instrument
                </Button>
              </DialogTrigger>
              <Button
                variant="destructive"
                onClick={deleteAllInstruments}
                disabled={instruments.length === 0}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete All
              </Button>
              <DialogContent className="sm:max-w-[600px]">
                <DialogHeader>
                  <DialogTitle>Add New Hedging Instrument</DialogTitle>
                  <DialogDescription>
                    Create a new hedging instrument entry.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="instrument-type" className="text-right">
                      Type
                    </Label>
                    <Select>
                      <SelectTrigger className="col-span-3">
                        <SelectValue placeholder="Select instrument type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="forward">Forward Contract</SelectItem>
                        <SelectItem value="vanilla-call">Vanilla Call</SelectItem>
                        <SelectItem value="vanilla-put">Vanilla Put</SelectItem>
                        <SelectItem value="collar">Collar</SelectItem>
                        <SelectItem value="swap">Currency Swap</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="currency-pair" className="text-right">
                      Currency Pair
                    </Label>
                    <Select>
                      <SelectTrigger className="col-span-3">
                        <SelectValue placeholder="Select currency pair" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="EURUSD">EUR/USD</SelectItem>
                        <SelectItem value="GBPUSD">GBP/USD</SelectItem>
                        <SelectItem value="USDJPY">USD/JPY</SelectItem>
                        <SelectItem value="USDCHF">USD/CHF</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="notional" className="text-right">
                      Notional
                    </Label>
                    <Input
                      id="notional"
                      type="number"
                      placeholder="1000000"
                      className="col-span-3"
                    />
                  </div>
                  
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="rate" className="text-right">
                      Rate/Strike
                    </Label>
                    <Input
                      id="rate"
                      type="number"
                      step="0.0001"
                      placeholder="1.0850"
                      className="col-span-3"
                    />
                  </div>
                  
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="maturity" className="text-right">
                      Maturity
                    </Label>
                    <Input
                      id="maturity"
                      type="date"
                      className="col-span-3"
                    />
                  </div>
                  
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="counterparty" className="text-right">
                      Counterparty
                    </Label>
                    <Select>
                      <SelectTrigger className="col-span-3">
                        <SelectValue placeholder="Select counterparty" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="deutsche-bank">Deutsche Bank</SelectItem>
                        <SelectItem value="hsbc">HSBC</SelectItem>
                        <SelectItem value="jpmorgan">JPMorgan</SelectItem>
                        <SelectItem value="bnp-paribas">BNP Paribas</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit">Add Instrument</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Tabs */}
          <Tabs value={selectedTab} onValueChange={setSelectedTab}>
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="forwards">Forwards</TabsTrigger>
              <TabsTrigger value="options">Options</TabsTrigger>
              <TabsTrigger value="swaps">Swaps</TabsTrigger>
              <TabsTrigger value="hedge-accounting">Hedge Accounting</TabsTrigger>
            </TabsList>
            
            <TabsContent value={selectedTab} className="mt-4">
              {filteredInstruments.length === 0 ? (
                <div className="text-center py-12">
                  <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No Hedging Instruments</h3>
                  <p className="text-muted-foreground mb-4">
                    You haven't imported any strategies yet. Create and import strategies from the Strategy Builder.
                  </p>
                  <div className="flex gap-2 justify-center">
                    <Button asChild>
                      <a href="/strategy-builder">
                        <Target className="h-4 w-4 mr-2" />
                        Go to Strategy Builder
                      </a>
                    </Button>
                    <Button variant="outline" onClick={() => setIsAddDialogOpen(true)}>
                      <Plus className="h-4 w-4 mr-2" />
                      Add Manual Instrument
                    </Button>
                  </div>
                </div>
              ) : (
                                 <div className="overflow-x-auto" style={{ maxWidth: 'calc(100vw - 280px)' }}>
                   <Table className="min-w-full border-collapse bg-white shadow-sm rounded-lg overflow-hidden">
                     <TableHeader className="bg-gradient-to-r from-slate-50 to-slate-100">
                       <TableRow className="border-b-2 border-slate-200">
                         {/* Fixed columns */}
                         <TableHead rowSpan={2} className="bg-slate-50 font-semibold text-center border-r border-slate-200 min-w-[60px] sticky left-0 z-[5]">ID</TableHead>
                         <TableHead rowSpan={2} className="bg-slate-50 font-semibold text-center border-r border-slate-200 min-w-[100px]">Type</TableHead>
                         <TableHead rowSpan={2} className="bg-slate-50 font-semibold text-center border-r border-slate-200 min-w-[100px]">Currency Pair</TableHead>
                         <TableHead rowSpan={2} className="bg-slate-50 font-semibold text-center border-r border-slate-200 min-w-[80px]">Quantity (%)</TableHead>
                         <TableHead rowSpan={2} className="bg-slate-50 font-semibold text-center border-r border-slate-200 min-w-[100px]">Unit Price (Initial)</TableHead>
                         <TableHead rowSpan={2} className="bg-slate-50 font-semibold text-center border-r border-slate-200 min-w-[100px]">Today Price</TableHead>
                         <TableHead rowSpan={2} className="bg-slate-50 font-semibold text-center border-r border-slate-200 min-w-[100px]">MTM</TableHead>
                         
                         {/* Dynamic columns with conditional Export */}
                         <TableHead colSpan={showExportColumns ? 2 : 1} className="text-center border-b border-r border-slate-200 bg-blue-50 font-semibold min-w-[120px]">Time to Maturity</TableHead>
                         <TableHead colSpan={showExportColumns ? 2 : 1} className="text-center border-b border-r border-slate-200 bg-green-50 font-semibold min-w-[100px]">Spot Price</TableHead>
                         <TableHead colSpan={showExportColumns ? 2 : 1} className="text-center border-b border-r border-slate-200 bg-yellow-50 font-semibold min-w-[100px]">Volatility (%)</TableHead>
                         <TableHead colSpan={showExportColumns ? 2 : 1} className="text-center border-b border-r border-slate-200 bg-purple-50 font-semibold min-w-[120px]">Domestic Rate (%)</TableHead>
                         <TableHead colSpan={showExportColumns ? 2 : 1} className="text-center border-b border-r border-slate-200 bg-pink-50 font-semibold min-w-[120px]">Foreign Rate (%)</TableHead>
                         <TableHead colSpan={showExportColumns ? 2 : 1} className="text-center border-b border-r border-slate-200 bg-indigo-50 font-semibold min-w-[120px]">Forward Price</TableHead>
                         <TableHead colSpan={showExportColumns ? 2 : 1} className="text-center border-b border-r border-slate-200 bg-orange-50 font-semibold min-w-[120px]">Strike Analysis</TableHead>
                         
                         {/* Fixed end columns */}
                         <TableHead rowSpan={2} className="bg-slate-50 font-semibold text-center border-r border-slate-200 min-w-[80px]">Barrier 1</TableHead>
                         <TableHead rowSpan={2} className="bg-slate-50 font-semibold text-center border-r border-slate-200 min-w-[80px]">Barrier 2</TableHead>
                         <TableHead rowSpan={2} className="bg-slate-50 font-semibold text-center border-r border-slate-200 min-w-[80px]">Rebate (%)</TableHead>
                         <TableHead rowSpan={2} className="bg-slate-50 font-semibold text-center border-r border-slate-200 min-w-[80px]">Volume</TableHead>
                         <TableHead rowSpan={2} className="bg-slate-50 font-semibold text-center border-r border-slate-200 min-w-[100px]">Notional</TableHead>
                         <TableHead rowSpan={2} className="bg-slate-50 font-semibold text-center border-r border-slate-200 min-w-[100px]">Maturity</TableHead>
                         <TableHead rowSpan={2} className="bg-slate-50 font-semibold text-center border-r border-slate-200 min-w-[80px]">Status</TableHead>
                         <TableHead rowSpan={2} className="bg-slate-50 font-semibold text-center min-w-[120px]">Actions</TableHead>
                    </TableRow>
                       <TableRow className="border-b border-slate-200">
                         {/* Sub-headers for dynamic columns */}
                         {showExportColumns && <TableHead className="text-xs text-blue-600 bg-blue-50 border-r border-slate-200 font-medium">Export</TableHead>}
                         <TableHead className="text-xs text-green-600 bg-blue-50 border-r border-slate-200 font-medium">Current</TableHead>
                         
                         {showExportColumns && <TableHead className="text-xs text-blue-600 bg-green-50 border-r border-slate-200 font-medium">Export</TableHead>}
                         <TableHead className="text-xs text-green-600 bg-green-50 border-r border-slate-200 font-medium">Current</TableHead>
                         
                         {showExportColumns && <TableHead className="text-xs text-blue-600 bg-yellow-50 border-r border-slate-200 font-medium">Export</TableHead>}
                         <TableHead className="text-xs text-green-600 bg-yellow-50 border-r border-slate-200 font-medium">Current</TableHead>
                         
                         {showExportColumns && <TableHead className="text-xs text-blue-600 bg-purple-50 border-r border-slate-200 font-medium">Export</TableHead>}
                         <TableHead className="text-xs text-green-600 bg-purple-50 border-r border-slate-200 font-medium">Current</TableHead>
                         
                         {showExportColumns && <TableHead className="text-xs text-blue-600 bg-pink-50 border-r border-slate-200 font-medium">Export</TableHead>}
                         <TableHead className="text-xs text-green-600 bg-pink-50 border-r border-slate-200 font-medium">Current</TableHead>
                         
                         {showExportColumns && <TableHead className="text-xs text-blue-600 bg-indigo-50 border-r border-slate-200 font-medium">Export</TableHead>}
                         <TableHead className="text-xs text-green-600 bg-indigo-50 border-r border-slate-200 font-medium">Current</TableHead>
                         
                         {showExportColumns && <TableHead className="text-xs text-blue-600 bg-orange-50 border-r border-slate-200 font-medium">Export</TableHead>}
                         <TableHead className="text-xs text-green-600 bg-orange-50 font-medium">Current</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredInstruments.map((instrument) => {
                      // Calculate derived values
                      const quantityToHedge = instrument.quantity || 0;
                      // Use real option price from Detailed Results if available, otherwise use premium
                      const unitPrice = instrument.realOptionPrice || instrument.premium || 0;
                      // Calculate today's price using current market parameters
                      const todayPrice = calculateTodayPrice(instrument);
                      
                      // Calculate MTM with proper long/short logic (same as total MTM calculation)
                      const isShort = quantityToHedge < 0;
                      let mtmValue;
                      if (isShort) {
                        // For short positions: MTM = Original Price - Today's Price
                        mtmValue = unitPrice - todayPrice;
                      } else {
                        // For long positions: MTM = Today's Price - Original Price  
                        mtmValue = todayPrice - unitPrice;
                      }
                                              // Calculate time to maturity - Utiliser la Valuation Date
                        let timeToMaturity = 0;
                        if (instrument.maturity) {
                          // ✅ Vérifier si l'option est expirée
                          const valuationDateObj = new Date(valuationDate);
                          const maturityDateObj = new Date(instrument.maturity);
                          
                          if (valuationDateObj >= maturityDateObj) {
                            // Option expirée, Time to Maturity = 0
                            timeToMaturity = 0;
                            console.log(`[DEBUG] ${instrument.id}: EXPIRED - Valuation Date (${valuationDate}) >= Maturity Date (${instrument.maturity}) - TTM = 0`);
                          } else {
                            // ✅ Calculer depuis la Valuation Date pour l'affichage Current
                            timeToMaturity = PricingService.calculateTimeToMaturity(instrument.maturity, valuationDate);
                            console.log(`[DEBUG] ${instrument.id}: Time to Maturity - Display from Valuation Date ${valuationDate}: ${timeToMaturity.toFixed(4)}y, Export: ${instrument.exportTimeToMaturity ? instrument.exportTimeToMaturity.toFixed(4) + 'y' : 'N/A'}`);
                          }
                        } else {
                          console.warn(`No maturity date available for instrument ${instrument.id}`);
                          timeToMaturity = 0;
                        }
                      // Use implied volatility from Detailed Results if available, otherwise use component volatility
                      const volatility = instrument.impliedVolatility || instrument.volatility || 0;
                      // FIX: Le notional contient déjà la quantité appliquée, donc volumeToHedge = notional
                      const volumeToHedge = instrument.notional; // Plus de double multiplication
                      const calculatedNotional = unitPrice * volumeToHedge;
                      
                      return (
                         <TableRow key={instrument.id} className="hover:bg-slate-50/80 border-b border-slate-100 transition-all duration-200 group">
                           <TableCell className="font-semibold bg-slate-50/90 border-r border-slate-200 text-center sticky left-0 z-[5] text-slate-700">
                             <div className="px-2 py-1 rounded-md bg-white shadow-sm">
                               {instrument.id}
                             </div>
                           </TableCell>
                          <TableCell className="py-3">
                            <div className="flex items-center gap-3">
                              <div className="p-2 rounded-lg bg-slate-100/50 group-hover:bg-slate-200/50 transition-colors">
                              {getInstrumentIcon(instrument.type)}
                              </div>
                              <div className="space-y-1">
                                <div className="font-medium text-slate-900">{instrument.type}</div>
                                {instrument.strategyName && (
                                  <div className="text-xs text-slate-500 flex items-center gap-1">
                                    <span className="w-1 h-1 bg-slate-400 rounded-full"></span>
                                    From: {instrument.strategyName}
                                  </div>
                                )}
                                {instrument.repricingData && (
                                  <div className="text-xs text-blue-600 flex items-center gap-1">
                                    <span className="w-1 h-1 bg-blue-400 rounded-full"></span>
                                    Period Data ✓
                                  </div>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline" className="font-mono font-semibold px-3 py-1 bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 transition-colors">
                              {instrument.currency}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="inline-flex items-center justify-center px-3 py-1 rounded-full bg-green-50 text-green-700 font-mono font-semibold text-sm">
                            {quantityToHedge.toFixed(1)}%
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="font-mono text-slate-700 font-semibold">
                              {unitPrice > 0 ? unitPrice.toFixed(4) : 
                                <span className="text-slate-400 italic">N/A</span>
                              }
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="space-y-1">
                              <div className={`font-mono font-semibold ${todayPrice !== 0 ? "text-blue-600" : "text-slate-400"}`}>
                              {todayPrice !== 0 ? todayPrice.toFixed(4) : 'N/A'}
                              </div>
                            {(() => {
                              // Détecter le modèle de pricing utilisé (EXACTEMENT la même logique que calculateTodayPrice)
                              const optionType = instrument.type.toLowerCase();
                              let modelName = "unknown";
                              
                              // 1. OPTIONS BARRIÈRES - PRIORITÉ ABSOLUE (avant les vanilles)
                              if (optionType.includes('knock-out') || optionType.includes('knock-in') || 
                                  optionType.includes('barrier') || optionType.includes('ko ') || optionType.includes('ki ') ||
                                  optionType.includes('knockout') || optionType.includes('knockin') || optionType.includes('reverse')) {
                                modelName = "closed-form";
                              }
                              // 2. OPTIONS DIGITALES - DEUXIÈME PRIORITÉ
                              else if (optionType.includes('touch') || optionType.includes('binary') || 
                                       optionType.includes('digital')) {
                                modelName = "monte-carlo";
                              }
                              // 3. OPTIONS VANILLES EXPLICITES
                              else if (optionType === 'vanilla call' || optionType === 'vanilla put') {
                                modelName = "garman-kohlhagen";
                              }
                              // 4. FORWARDS
                              else if (optionType === 'forward') {
                                modelName = "forward-pricing";
                              }
                              // 5. SWAPS
                              else if (optionType === 'swap') {
                                modelName = "swap-pricing";
                              }
                              // 6. OPTIONS VANILLES GÉNÉRIQUES - SEULEMENT si pas déjà traité
                              else if (optionType.includes('call') && !optionType.includes('knock')) {
                                modelName = "garman-kohlhagen";
                              } else if (optionType.includes('put') && !optionType.includes('knock')) {
                                modelName = "garman-kohlhagen";
                              }
                              
                              return (
                                <div className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded-md">
                                  Model: {modelName}
                                </div>
                              );
                            })()}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className={`inline-flex items-center justify-center px-3 py-1 rounded-lg font-mono font-semibold ${
                              mtmValue >= 0 
                                ? 'bg-green-50 text-green-700 border border-green-200' 
                                : 'bg-red-50 text-red-700 border border-red-200'
                            }`}>
                              {Math.abs(mtmValue) > 0.0001 ? (mtmValue >= 0 ? '+' : '') + mtmValue.toFixed(4) : '0.0000'}
                            </div>
                          </TableCell>
                                                     {/* Time to Maturity - Export (conditional) */}
                           {showExportColumns && (
                             <TableCell className="font-mono text-center bg-blue-50 border-r border-slate-200">
                              <div className="text-xs text-blue-600">
                              {instrument.exportTimeToMaturity ? 
                                `${instrument.exportTimeToMaturity.toFixed(4)}y` : 
                                'N/A'
                              }
                            </div>
                            {instrument.exportTimeToMaturity && (
                              <div className="text-xs text-gray-500">
                                {(instrument.exportTimeToMaturity * 365).toFixed(0)}d
                              </div>
                            )}
                          </TableCell>
                           )}
                          
                          {/* Time to Maturity - Current */}
                           <TableCell className="text-center bg-green-50/80 border-r border-slate-200">
                            <div className="space-y-1">
                              <div className={`text-sm font-mono font-semibold ${timeToMaturity === 0 ? 'text-red-600' : 'text-green-700'}`}>
                              {timeToMaturity.toFixed(4)}y
                            </div>
                              <div className={`text-xs px-2 py-1 rounded-md ${timeToMaturity === 0 ? 'text-red-600 bg-red-100/50' : 'text-green-600 bg-green-100/50'}`}>
                              {timeToMaturity === 0 ? 'EXPIRED' : `${(timeToMaturity * 365).toFixed(0)}d`}
                              </div>
                              <div className={`text-xs px-2 py-1 rounded-md ${timeToMaturity === 0 ? 'text-red-500 bg-red-50' : 'text-green-500 bg-green-50'}`}>
                                {timeToMaturity === 0 ? `Expired on ${instrument.maturity}` : `From ${valuationDate} to ${instrument.maturity}`}
                              </div>
                            </div>
                          </TableCell>
                          
                                                     {/* Spot Price - Export (conditional) */}
                           {showExportColumns && (
                             <TableCell className="text-center bg-blue-50/80 border-r border-slate-200">
                               <div className="text-sm font-mono font-semibold text-blue-700">
                              {instrument.exportSpotPrice ? 
                                instrument.exportSpotPrice.toFixed(6) : 
                                   <span className="text-blue-400 italic">N/A</span>
                              }
                            </div>
                          </TableCell>
                           )}
                          
                          {/* Spot Price - Current */}
                           <TableCell className="text-center bg-green-50/80 border-r border-slate-200">
                            {(() => {
                              const marketData = currencyMarketData[instrument.currency] || getMarketDataFromInstruments(instrument.currency) || { spot: 1.0000, volatility: 20, domesticRate: 1.0, foreignRate: 1.0 };
                              const currentSpot = instrument.impliedSpotPrice || marketData.spot;
                              return (
                                <div className="space-y-1">
                                  <div className="flex items-center gap-1">
                                    <Input
                                      type="number"
                                      value={instrument.impliedSpotPrice ?? currentSpot}
                                      onChange={(e) => {
                                        const value = parseFloat(e.target.value);
                                        if (!isNaN(value) && value > 0) {
                                          updateInstrumentSpotPrice(instrument.id, value);
                                        }
                                      }}
                                      placeholder={currentSpot.toFixed(6)}
                                      className="w-20 h-6 text-xs text-center bg-white border-green-200 focus:border-green-400 focus:ring-green-400/20"
                                      step="0.0001"
                                      min="0"
                                    />
                                    {instrument.impliedSpotPrice && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-4 w-4 p-0 text-gray-400 hover:text-red-500"
                                        onClick={() => resetInstrumentSpotPrice(instrument.id)}
                                        title="Reset to global spot price"
                                      >
                                        ×
                                      </Button>
                                    )}
                                  </div>
                                <div className="text-xs text-green-600 bg-green-100/50 px-2 py-1 rounded-md">
                                    Using: {currentSpot.toFixed(6)}
                                  </div>
                                </div>
                              );
                            })()}
                          </TableCell>
                          
                                                     {/* Volatility - Export (conditional) */}
                           {showExportColumns && (
                             <TableCell className="text-center bg-blue-50/80 border-r border-slate-200">
                               <div className="text-sm font-mono font-semibold text-blue-700">
                              {instrument.exportVolatility ? 
                                `${instrument.exportVolatility.toFixed(2)}%` : 
                                   <span className="text-blue-400 italic">N/A</span>
                              }
                            </div>
                          </TableCell>
                           )}
                          
                          {/* Volatility - Current */}
                           <TableCell className="text-center bg-green-50/80 border-r border-slate-200">
                            <div className="space-y-1">
                              <div className="flex items-center gap-1">
                                <Input
                                  type="number"
                                  value={instrument.impliedVolatility || ''}
                                  onChange={(e) => {
                                    const value = parseFloat(e.target.value);
                                    if (!isNaN(value) && value >= 0 && value <= 100) {
                                      updateInstrumentVolatility(instrument.id, value);
                                    }
                                  }}
                                  placeholder={volatility.toFixed(1)}
                                  className="w-16 h-6 text-xs text-center bg-white border-green-200 focus:border-green-400 focus:ring-green-400/20"
                                  step="0.1"
                                  min="0"
                                  max="100"
                                />
                                <span className="text-xs">%</span>
                                {instrument.impliedVolatility && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-4 w-4 p-0 text-gray-400 hover:text-red-500"
                                    onClick={() => resetInstrumentVolatility(instrument.id)}
                                    title="Reset to global volatility"
                                  >
                                    ×
                                  </Button>
                                )}
                              </div>
                                                              <div className="text-xs text-green-600 bg-green-100/50 px-2 py-1 rounded-md">
                                Using: {instrument.impliedVolatility || volatility}%
                              </div>
                            </div>
                          </TableCell>
                          
                                                     {/* Domestic Rate - Export (conditional) */}
                           {showExportColumns && (
                             <TableCell className="font-mono text-center bg-blue-50 border-r border-slate-200">
                            <div className="text-xs text-blue-600">
                              {instrument.exportDomesticRate ? 
                                `${instrument.exportDomesticRate.toFixed(3)}%` : 
                                'N/A'
                              }
                                </div>
                          </TableCell>
                           )}
                          
                          {/* Domestic Rate - Current */}
                          <TableCell className="font-mono text-center bg-green-50">
                            {(() => {
                              const marketData = currencyMarketData[instrument.currency] || getMarketDataFromInstruments(instrument.currency) || { spot: 1.0000, volatility: 20, domesticRate: 1.0, foreignRate: 1.0 };
                              return (
                                <div className="text-xs text-green-600">
                                  {marketData.domesticRate.toFixed(3)}%
                                </div>
                              );
                            })()}
                          </TableCell>
                          
                                                     {/* Foreign Rate - Export (conditional) */}
                           {showExportColumns && (
                             <TableCell className="font-mono text-center bg-blue-50 border-r border-slate-200">
                                <div className="text-xs text-blue-600">
                              {instrument.exportForeignRate ? 
                                `${instrument.exportForeignRate.toFixed(3)}%` : 
                                'N/A'
                              }
                                </div>
                          </TableCell>
                           )}
                          
                          {/* Foreign Rate - Current */}
                          <TableCell className="font-mono text-center bg-green-50">
                            {(() => {
                              const marketData = currencyMarketData[instrument.currency] || getMarketDataFromInstruments(instrument.currency) || { spot: 1.0000, volatility: 20, domesticRate: 1.0, foreignRate: 1.0 };
                              return (
                                <div className="text-xs text-green-600">
                                  {marketData.foreignRate.toFixed(3)}%
                            </div>
                              );
                            })()}
                          </TableCell>
                          
                                                     {/* Forward Price - Export (conditional) */}
                           {showExportColumns && (
                             <TableCell className="font-mono text-center bg-blue-50 border-r border-slate-200">
                            <div className="text-xs text-blue-600">
                              {instrument.exportForwardPrice ? 
                                instrument.exportForwardPrice.toFixed(6) : 
                                'N/A'
                              }
                            </div>
                          </TableCell>
                           )}
                          
                          {/* Forward Price - Current */}
                          <TableCell className="font-mono text-center bg-green-50">
                            {(() => {
                              const marketData = currencyMarketData[instrument.currency] || getMarketDataFromInstruments(instrument.currency) || { spot: 1.0000, volatility: 20, domesticRate: 1.0, foreignRate: 1.0 };
                              // ✅ CORRECTION : Utiliser la même logique que Strategy Builder pour cohérence
                              const strategyStartDateObj = new Date(instrument.exportStrategyStartDate || strategyStartDate);
                              const calculationStartDate = new Date(strategyStartDateObj.getFullYear(), strategyStartDateObj.getMonth(), strategyStartDateObj.getDate());
                              const calculationStartDateStr = calculationStartDate.toISOString().split('T')[0];
                              const currentTimeToMat = PricingService.calculateTimeToMaturity(instrument.maturity, calculationStartDateStr);
                              const r_d = marketData.domesticRate / 100;
                              const r_f = marketData.foreignRate / 100;
                              const currentSpot = instrument.impliedSpotPrice || marketData.spot;
                              const currentForward = PricingService.calculateFXForwardPrice(currentSpot, r_d, r_f, currentTimeToMat);
                              console.log(`[DEBUG] ${instrument.id}: Forward Price - Current using Strategy Logic (${calculationStartDateStr}), TTM: ${currentTimeToMat.toFixed(4)}y, Forward: ${currentForward.toFixed(6)}`);
                              return (
                                <div className="text-xs text-green-600">
                                  {currentForward.toFixed(6)}
                                </div>
                              );
                            })()}
                          </TableCell>
                          
                                                     {/* Strike - Export (conditional) */}
                           {showExportColumns && (
                             <TableCell className="font-mono text-center bg-blue-50 border-r border-slate-200">
                            <div className="text-xs text-blue-600">
                              {(() => {
                                // Calculer le strike d'export basé sur les paramètres d'export
                                if (instrument.originalComponent && instrument.exportSpotPrice) {
                                  const exportStrike = instrument.originalComponent.strikeType === 'percent' 
                                    ? instrument.exportSpotPrice * (instrument.originalComponent.strike / 100)
                                    : instrument.originalComponent.strike;
                                  return exportStrike.toFixed(4);
                                }
                                return 'N/A';
                              })()}
                            </div>
                            {instrument.originalComponent && (
                              <div className="text-xs text-gray-500">
                                {instrument.originalComponent.strikeType}: {instrument.originalComponent.strike}
                              </div>
                            )}
                          </TableCell>
                           )}
                          
                          {/* Strike - Current */}
                          <TableCell className="font-mono text-center bg-green-50">
                            <div className="text-xs text-green-600">
                            {instrument.strike ? instrument.strike.toFixed(4) : 'N/A'}
                            </div>
                            {instrument.originalComponent && (
                              <div className="text-xs text-gray-500">
                                Current calculation
                              </div>
                            )}
                            {instrument.dynamicStrikeInfo && (
                              <div className="text-xs text-orange-600">
                                Dyn: {instrument.dynamicStrikeInfo.calculatedStrikePercent}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="font-mono text-right">
                            {instrument.barrier ? instrument.barrier.toFixed(4) : 'N/A'}
                          </TableCell>
                          <TableCell className="font-mono text-right">
                            {instrument.secondBarrier ? instrument.secondBarrier.toFixed(4) : 'N/A'}
                          </TableCell>
                          <TableCell className="font-mono text-right">
                            {instrument.rebate ? instrument.rebate.toFixed(2) : 'N/A'}
                          </TableCell>
                          <TableCell className="font-mono text-right">
                            {formatCurrency(volumeToHedge)}
                          </TableCell>
                          <TableCell className="font-mono text-right">
                            {calculatedNotional > 0 ? formatCurrency(calculatedNotional) : formatCurrency(instrument.notional)}
                          </TableCell>
                          <TableCell>{instrument.maturity}</TableCell>
                        <TableCell>
                          {instrument.effectiveness_ratio ? (
                            <div className="flex items-center gap-2">
                              <Progress 
                                value={instrument.effectiveness_ratio} 
                                className="w-16 h-2" 
                              />
                              <span className="text-sm font-medium">
                                {instrument.effectiveness_ratio}%
                              </span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">N/A</span>
                          )}
                        </TableCell>
                        <TableCell>{getStatusBadge(instrument.status)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              title="View Details"
                              onClick={() => viewInstrument(instrument)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              title="Edit"
                              onClick={() => editInstrument(instrument)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              title="Delete"
                              onClick={() => deleteInstrument(instrument.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Hedge Effectiveness Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Hedge Effectiveness Summary</CardTitle>
          <CardDescription>
            Overview of hedge accounting qualifying instruments
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {instruments.filter(inst => inst.hedge_accounting).map((instrument) => (
              <div key={instrument.id} className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center gap-4">
                  {getInstrumentIcon(instrument.type)}
                  <div>
                    <div className="font-medium">{instrument.id} - {instrument.type}</div>
                    <div className="text-sm text-muted-foreground">
                      {instrument.currency} • {formatCurrency(instrument.notional)}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="text-sm font-medium">Effectiveness Ratio</div>
                    <div className="text-lg font-bold">
                      {instrument.effectiveness_ratio}%
                    </div>
                  </div>
                  <Progress 
                    value={instrument.effectiveness_ratio || 0} 
                    className="w-24 h-3" 
                  />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* View Instrument Dialog */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Instrument Details</DialogTitle>
            <DialogDescription>
              View detailed information about this hedging instrument
            </DialogDescription>
          </DialogHeader>
          {selectedInstrument && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium">ID</Label>
                  <p className="text-sm text-muted-foreground">{selectedInstrument.id}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium">Type</Label>
                  <p className="text-sm text-muted-foreground">{selectedInstrument.type}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium">Currency Pair</Label>
                  <p className="text-sm text-muted-foreground">{selectedInstrument.currency}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium">Quantity</Label>
                  <p className="text-sm text-muted-foreground">{selectedInstrument.quantity?.toFixed(1)}%</p>
                </div>
                <div>
                  <Label className="text-sm font-medium">Strike</Label>
                  <p className="text-sm text-muted-foreground">{selectedInstrument.strike?.toFixed(4) || 'N/A'}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium">Maturity</Label>
                  <p className="text-sm text-muted-foreground">{selectedInstrument.maturity}</p>
                </div>
                {selectedInstrument.barrier && (
                  <div>
                    <Label className="text-sm font-medium">Barrier 1</Label>
                    <p className="text-sm text-muted-foreground">{selectedInstrument.barrier.toFixed(4)}</p>
                  </div>
                )}
                {selectedInstrument.secondBarrier && (
                  <div>
                    <Label className="text-sm font-medium">Barrier 2</Label>
                    <p className="text-sm text-muted-foreground">{selectedInstrument.secondBarrier.toFixed(4)}</p>
                  </div>
                )}
                {selectedInstrument.rebate && (
                  <div>
                    <Label className="text-sm font-medium">Rebate (%)</Label>
                    <p className="text-sm text-muted-foreground">{selectedInstrument.rebate.toFixed(2)}%</p>
                  </div>
                )}
                <div>
                  <Label className="text-sm font-medium">Notional</Label>
                  <p className="text-sm text-muted-foreground">{formatCurrency(selectedInstrument.notional)}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium">Status</Label>
                  <p className="text-sm text-muted-foreground">{selectedInstrument.status}</p>
                </div>
              </div>
              {selectedInstrument.strategyName && (
                <div>
                  <Label className="text-sm font-medium">Strategy Source</Label>
                  <p className="text-sm text-muted-foreground">{selectedInstrument.strategyName}</p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsViewDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Instrument Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Edit Instrument</DialogTitle>
            <DialogDescription>
              Modify the parameters of this hedging instrument
            </DialogDescription>
          </DialogHeader>
          {selectedInstrument && (
            <InstrumentEditForm 
              instrument={selectedInstrument}
              onSave={saveInstrumentChanges}
              onCancel={() => setIsEditDialogOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </Layout>
  );
};

// Component for editing instrument details
const InstrumentEditForm: React.FC<{
  instrument: HedgingInstrument;
  onSave: (instrument: HedgingInstrument) => void;
  onCancel: () => void;
}> = ({ instrument, onSave, onCancel }) => {
  const [editedInstrument, setEditedInstrument] = useState<HedgingInstrument>({ ...instrument });

  const handleSave = () => {
    onSave(editedInstrument);
  };

  const updateField = (field: keyof HedgingInstrument, value: any) => {
    setEditedInstrument(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="edit-quantity">Quantity (%)</Label>
          <Input
            id="edit-quantity"
            type="number"
            step="0.1"
            value={editedInstrument.quantity || 0}
            onChange={(e) => updateField('quantity', parseFloat(e.target.value) || 0)}
          />
        </div>
        <div>
          <Label htmlFor="edit-strike">Strike</Label>
          <Input
            id="edit-strike"
            type="number"
            step="0.0001"
            value={editedInstrument.strike || 0}
            onChange={(e) => updateField('strike', parseFloat(e.target.value) || 0)}
          />
        </div>
        {editedInstrument.barrier !== undefined && (
          <div>
            <Label htmlFor="edit-barrier">Barrier 1</Label>
            <Input
              id="edit-barrier"
              type="number"
              step="0.0001"
              value={editedInstrument.barrier || 0}
              onChange={(e) => updateField('barrier', parseFloat(e.target.value) || 0)}
            />
          </div>
        )}
        {editedInstrument.secondBarrier !== undefined && (
          <div>
            <Label htmlFor="edit-second-barrier">Barrier 2</Label>
            <Input
              id="edit-second-barrier"
              type="number"
              step="0.0001"
              value={editedInstrument.secondBarrier || 0}
              onChange={(e) => updateField('secondBarrier', parseFloat(e.target.value) || 0)}
            />
          </div>
        )}
        {editedInstrument.rebate !== undefined && (
          <div>
            <Label htmlFor="edit-rebate">Rebate (%)</Label>
            <Input
              id="edit-rebate"
              type="number"
              step="0.01"
              value={editedInstrument.rebate || 0}
              onChange={(e) => updateField('rebate', parseFloat(e.target.value) || 0)}
            />
          </div>
        )}
        <div>
          <Label htmlFor="edit-notional">Notional</Label>
          <Input
            id="edit-notional"
            type="number"
            step="1000"
            value={editedInstrument.notional || 0}
            onChange={(e) => updateField('notional', parseFloat(e.target.value) || 0)}
          />
        </div>
        <div>
          <Label htmlFor="edit-maturity">Maturity Date</Label>
          <Input
            id="edit-maturity"
            type="date"
            value={editedInstrument.maturity}
            onChange={(e) => updateField('maturity', e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="edit-status">Status</Label>
          <Select value={editedInstrument.status} onValueChange={(value) => updateField('status', value)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Active">Active</SelectItem>
              <SelectItem value="Inactive">Inactive</SelectItem>
              <SelectItem value="Expired">Expired</SelectItem>
              <SelectItem value="Settled">Settled</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={handleSave}>
          Save Changes
        </Button>
      </DialogFooter>
    </div>
  );
};

export default HedgingInstruments; 