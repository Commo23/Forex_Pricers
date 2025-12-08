import { useState, useEffect, useCallback, useRef } from 'react';
import FinancialDataService, { 
  MarketData, 
  ExposureData, 
  HedgingInstrument, 
  RiskMetrics, 
  CurrencyExposure 
} from '../services/FinancialDataService';
import StrategyImportService from '../services/StrategyImportService';

interface UseFinancialDataReturn {
  // Data
  marketData: MarketData;
  exposures: ExposureData[];
  instruments: HedgingInstrument[];
  riskMetrics: RiskMetrics;
  currencyExposures: CurrencyExposure[];
  
  // Actions
  addExposure: (exposure: Omit<ExposureData, 'id'>) => void;
  updateExposure: (id: string, updates: Partial<Omit<ExposureData, 'id'>>) => boolean;
  deleteExposure: (id: string) => boolean;
  addInstrument: (instrument: Omit<HedgingInstrument, 'id' | 'mtm'>) => void;
  updateInstrument: (id: string, updates: Partial<Omit<HedgingInstrument, 'id'>>) => boolean;
  deleteInstrument: (id: string) => boolean;
  updateMarketData: () => void;
  calculateForwardRate: (currencyPair: string, tenor: string) => number;
  calculateOptionPrice: (
    optionType: 'call' | 'put',
    currencyPair: string,
    strike: number,
    timeToMaturity: number,
    volatility?: number
  ) => number;
  generateStressScenarios: () => Array<{
    name: string;
    description: string;
    shocks: { [currencyPair: string]: number };
    impact: number;
  }>;
  calculateVarContributions: () => { [currency: string]: number };
  syncWithHedgingInstruments: () => void;
  autoGenerateExposures: () => void;
  
  // State
  isLoading: boolean;
  lastUpdate: Date;
  isLiveMode: boolean;
  setLiveMode: (enabled: boolean) => void;
}

export const useFinancialData = (): UseFinancialDataReturn => {
  const serviceRef = useRef<FinancialDataService>(new FinancialDataService());
  const strategyImportServiceRef = useRef<StrategyImportService>(StrategyImportService.getInstance());
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [isLiveMode, setIsLiveMode] = useState(false);
  
  // State for reactive data
  const [marketData, setMarketData] = useState<MarketData>(() => 
    serviceRef.current.getMarketData()
  );
  const [exposures, setExposures] = useState<ExposureData[]>(() => 
    serviceRef.current.getExposures()
  );
  const [instruments, setInstruments] = useState<HedgingInstrument[]>(() => 
    serviceRef.current.getInstruments()
  );
  const [riskMetrics, setRiskMetrics] = useState<RiskMetrics>(() => 
    serviceRef.current.calculateRiskMetrics()
  );
  const [currencyExposures, setCurrencyExposures] = useState<CurrencyExposure[]>(() => 
    serviceRef.current.getCurrencyExposures()
  );

  // Load data from localStorage and sync with other parts of the application
  useEffect(() => {
    const loadDataFromStorage = () => {
      try {
        // Load exposures from localStorage
        const savedExposures = localStorage.getItem('fxExposures');
        if (savedExposures) {
          const exposuresData = JSON.parse(savedExposures);
          exposuresData.forEach((exposure: any) => {
            // Convert date strings back to Date objects
            exposure.maturity = new Date(exposure.maturity);
            serviceRef.current.addExposure(exposure);
          });
        }

        // Sync with hedging instruments from StrategyImportService
        syncWithHedgingInstruments();
        
        // Auto-generate exposures if none exist but instruments do
        autoGenerateExposures();
        
        // Update all state
        refreshAllData();
      } catch (error) {
        console.error('Error loading data from storage:', error);
      }
    };

    loadDataFromStorage();

    // Listen for updates from other parts of the application
    const handleHedgingInstrumentsUpdate = () => {
      syncWithHedgingInstruments();
      autoGenerateExposures();
      refreshAllData();
    };

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'hedgingInstruments' || e.key === 'fxExposures') {
        loadDataFromStorage();
      }
    };

    // Add event listeners
    window.addEventListener('hedgingInstrumentsUpdated', handleHedgingInstrumentsUpdate);
    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('hedgingInstrumentsUpdated', handleHedgingInstrumentsUpdate);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  // Save exposures to localStorage whenever they change
  useEffect(() => {
    const saveExposuresToStorage = () => {
      try {
        const exposuresData = serviceRef.current.getExposures();
        localStorage.setItem('fxExposures', JSON.stringify(exposuresData));
      } catch (error) {
        console.error('Error saving exposures to storage:', error);
      }
    };

    saveExposuresToStorage();
  }, [exposures]);

  // Live mode updates
  useEffect(() => {
    if (!isLiveMode) return;

    const interval = setInterval(() => {
      serviceRef.current.updateMarketData();
      refreshAllData();
    }, 5000); // Update every 5 seconds

    return () => clearInterval(interval);
  }, [isLiveMode]);

  const syncWithHedgingInstruments = useCallback(() => {
    try {
      // Get hedging instruments from StrategyImportService
      const hedgingInstruments = strategyImportServiceRef.current.getHedgingInstruments();
      
      // Clear existing instruments in FinancialDataService (keep exposures)
      serviceRef.current.clearInstruments();
      
      // Convert and add hedging instruments to FinancialDataService
      hedgingInstruments.forEach(hedgingInstrument => {
        // Convert StrategyImportService HedgingInstrument to FinancialDataService HedgingInstrument
        const financialInstrument: Omit<HedgingInstrument, 'id' | 'mtm'> = {
          type: mapInstrumentType(hedgingInstrument.type),
          currencyPair: hedgingInstrument.currency,
          notional: hedgingInstrument.notional,
          strike: hedgingInstrument.strike,
          premium: hedgingInstrument.premium,
          maturity: new Date(hedgingInstrument.maturity),
          counterparty: hedgingInstrument.counterparty || 'Strategy Import',
          hedgeAccounting: hedgingInstrument.hedge_accounting || false,
          // ✅ CORRECTION : Utiliser la vraie quantité de couverture si disponible
          effectivenessRatio: hedgingInstrument.hedgeQuantity || hedgingInstrument.effectiveness_ratio || 95
        };
        
        serviceRef.current.addInstrument(financialInstrument);
      });
    } catch (error) {
      console.error('Error syncing with hedging instruments:', error);
    }
  }, []);

  // Auto-generate exposures based on hedging instruments
  const autoGenerateExposures = useCallback(() => {
    try {
      const currentExposures = serviceRef.current.getExposures();
      const currentInstruments = serviceRef.current.getInstruments();
      
      // ✅ AMÉLIORATION : Détecter les nouvelles devises et échéances même s'il y a déjà des expositions
      if (currentInstruments.length > 0) {
        console.log('Analyzing hedging instruments for new currencies and maturities...');
        
        // ✅ NOUVEAU : Accéder aux instruments originaux pour obtenir les vraies quantités
        const originalInstruments = strategyImportServiceRef.current.getHedgingInstruments();
        
        // ✅ NOUVEAU : Analyser les devises et échéances existantes
        const existingCurrencies = new Set(currentExposures.map(exp => exp.currency));
        const existingMaturities = new Set(currentExposures.map(exp => exp.maturity.toISOString().split('T')[0]));
        
        // ✅ NOUVEAU : Détecter les nouvelles devises et échéances
        const newCurrencies = new Set<string>();
        const newMaturities = new Set<string>();
        const newCurrencyMaturityPairs = new Set<string>();
        
        // Group instruments by currency to create consolidated exposures
        const currencyGroups: { [currency: string]: { 
          financialInstruments: HedgingInstrument[], 
          originalInstruments: any[],
          maturities: Set<string>
        } } = {};
        
        currentInstruments.forEach((instrument, index) => {
          const currency = extractBaseCurrency(instrument.currencyPair);
          const maturityStr = instrument.maturity.toISOString().split('T')[0];
          
          if (!currencyGroups[currency]) {
            currencyGroups[currency] = { 
              financialInstruments: [], 
              originalInstruments: [],
              maturities: new Set()
            };
          }
          currencyGroups[currency].financialInstruments.push(instrument);
          currencyGroups[currency].maturities.add(maturityStr);
          
          // ✅ NOUVEAU : Détecter les nouvelles devises
          if (!existingCurrencies.has(currency)) {
            newCurrencies.add(currency);
          }
          
          // ✅ NOUVEAU : Détecter les nouvelles échéances
          if (!existingMaturities.has(maturityStr)) {
            newMaturities.add(maturityStr);
          }
          
          // ✅ NOUVEAU : Détecter les nouvelles combinaisons devise-échéance
          const currencyMaturityPair = `${currency}-${maturityStr}`;
          const existingPair = currentExposures.find(exp => 
            exp.currency === currency && 
            exp.maturity.toISOString().split('T')[0] === maturityStr
          );
          if (!existingPair) {
            newCurrencyMaturityPairs.add(currencyMaturityPair);
          }
          
          // Trouver l'instrument original correspondant
          const originalInstrument = originalInstruments.find(orig => 
            orig.currency === instrument.currencyPair && 
            Math.abs(orig.notional - instrument.notional) < 0.01
          );
          if (originalInstrument) {
            currencyGroups[currency].originalInstruments.push(originalInstrument);
          }
        });
        
        // ✅ NOUVEAU : Créer des expositions pour les nouvelles combinaisons devise-échéance
        let expositionsCreated = 0;
        let expositionsUpdated = 0;
        let newCurrenciesDetected = Array.from(newCurrencies);
        let newMaturitiesDetected = Array.from(newMaturities);
        
        // Créer des expositions groupées par devise et échéance
        Object.entries(currencyGroups).forEach(([currency, instrumentGroup]) => {
          const instruments = instrumentGroup.financialInstruments;
          const originalInstruments = instrumentGroup.originalInstruments;
          
          // Grouper par échéance au sein de chaque devise
          const maturityGroups: { [maturity: string]: HedgingInstrument[] } = {};
          instruments.forEach(instrument => {
            const maturityStr = instrument.maturity.toISOString().split('T')[0];
            if (!maturityGroups[maturityStr]) {
              maturityGroups[maturityStr] = [];
            }
            maturityGroups[maturityStr].push(instrument);
          });
          
          // Créer une exposition pour chaque combinaison devise-échéance qui n'existe pas
          Object.entries(maturityGroups).forEach(([maturityStr, maturityInstruments]) => {
            const currencyMaturityPair = `${currency}-${maturityStr}`;
            
            // Vérifier si cette combinaison existe déjà
            const existingExposure = currentExposures.find(exp => 
              exp.currency === currency && 
              exp.maturity.toISOString().split('T')[0] === maturityStr
            );
            
            // ✅ CORRECTION : Traiter les expositions existantes ET nouvelles
            const totalNotional = maturityInstruments.reduce((sum, inst) => sum + inst.notional, 0);
            const maturityDate = new Date(maturityStr);
            
            // ✅ CORRECTION : Calculer le hedge ratio basé sur les vraies quantités des instruments originaux
            let maxHedgeQuantity = 95; // Default fallback
            
            if (originalInstruments.length > 0) {
              // ✅ CORRECTION : Prendre le maximum des quantités absolues des instruments originaux SANS plafonnement
              const maturityOriginalInstruments = originalInstruments.filter(orig => {
                const origMaturity = new Date(orig.maturity).toISOString().split('T')[0];
                return origMaturity === maturityStr;
              });
              
              if (maturityOriginalInstruments.length > 0) {
                // Utiliser les instruments de cette échéance spécifique
                maxHedgeQuantity = Math.max(...maturityOriginalInstruments.map(inst => {
                  const quantity = inst.hedgeQuantity !== undefined ? 
                    inst.hedgeQuantity : 
                    (inst.quantity !== undefined ? Math.abs(inst.quantity) : 95);
                  return quantity; // ✅ SUPPRESSION du plafonnement Math.min(100, quantity)
                }));
              } else {
                // Fallback: utiliser tous les instruments originaux
                maxHedgeQuantity = Math.max(...originalInstruments.map(inst => {
                  const quantity = inst.hedgeQuantity !== undefined ? 
                    inst.hedgeQuantity : 
                    (inst.quantity !== undefined ? Math.abs(inst.quantity) : 95);
                  return quantity; // ✅ SUPPRESSION du plafonnement Math.min(100, quantity)
                }));
              }
            }
            
            // ✅ CORRECTION : Calculer l'exposition sous-jacente réelle, pas la somme des instruments de couverture
            let underlyingExposureVolume = 0;
            
            if (originalInstruments.length > 0) {
              // Chercher le volume d'exposition original depuis les données de stratégie
              const maturityOriginalInstruments = originalInstruments.filter(orig => {
                const origMaturity = new Date(orig.maturity).toISOString().split('T')[0];
                return origMaturity === maturityStr;
              });
              
              if (maturityOriginalInstruments.length > 0) {
                // ✅ CORRECTION : Prendre le volume d'exposition brut (rawVolume ou exposureVolume) 
                // du premier instrument car ils représentent tous la même exposition sous-jacente
                const firstInstrument = maturityOriginalInstruments[0];
                underlyingExposureVolume = firstInstrument.rawVolume !== undefined ? firstInstrument.rawVolume : 
                                         firstInstrument.exposureVolume !== undefined ? firstInstrument.exposureVolume : 
                                         firstInstrument.baseVolume !== undefined ? firstInstrument.baseVolume :
                                         totalNotional; // Fallback sur totalNotional si pas d'info d'exposition
                
                console.log(`[FX EXPOSURE] ${currency}-${maturityStr}: Using underlying exposure volume ${underlyingExposureVolume} instead of sum of hedging instruments ${totalNotional}`);
              } else {
                // Pas d'instruments originaux pour cette maturité, utiliser totalNotional comme fallback
                underlyingExposureVolume = totalNotional;
              }
            } else {
              // Pas d'instruments originaux, utiliser totalNotional
              underlyingExposureVolume = totalNotional;
            }
            
            // Determine if this should be a receivable or payable based on instrument types
            // Prefer explicit volumeType coming from Strategy Builder export when present
            let exposureType: 'receivable' | 'payable';
            const explicitTypes = originalInstruments
              .filter(orig => new Date(orig.maturity).toISOString().split('T')[0] === maturityStr)
              .map(orig => orig.volumeType)
              .filter((t): t is 'receivable' | 'payable' => t === 'receivable' || t === 'payable');
            if (explicitTypes.length > 0) {
              // If mixed, default to payable only if all are payable; otherwise receivable
              const allPayable = explicitTypes.every(t => t === 'payable');
              const allReceivable = explicitTypes.every(t => t === 'receivable');
              exposureType = allPayable ? 'payable' : 'receivable';
            } else {
              // Fall back to a global volumeType if present on any original instrument
              const globalType = originalInstruments
                .map(orig => orig.volumeType)
                .find((t): t is 'receivable' | 'payable' => t === 'receivable' || t === 'payable');
              if (globalType) {
                exposureType = globalType;
              } else {
                const hasReceivableInstruments = maturityInstruments.some(inst => 
                  inst.type === 'vanilla-call' || inst.type === 'forward' || inst.type === 'collar'
                );
                exposureType = hasReceivableInstruments ? 'receivable' : 'payable';
              }
            }
            
            // ✅ CORRECTION : Utiliser la somme des notional des instruments de couverture
            const totalHedgingNotional = maturityInstruments.reduce((sum, inst) => sum + Math.abs(inst.notional), 0);
            const exposureAmount = exposureType === 'receivable' ? totalHedgingNotional : -totalHedgingNotional;
            
            // ✅ CORRECTION : Le montant couvert = somme des notional des instruments
            const hedgedAmount = totalHedgingNotional;
            const finalHedgedAmount = exposureType === 'receivable' ? hedgedAmount : -hedgedAmount;
            
            if (!existingExposure) {
              // ✅ CRÉER UNE NOUVELLE EXPOSITION
              const autoExposure: Omit<ExposureData, 'id'> = {
                currency: currency,
                amount: exposureAmount,
                type: exposureType,
                maturity: maturityDate,
                description: `Auto-generated from ${maturityInstruments.length} hedging instrument(s) - Maturity: ${maturityStr} - Total Notional: ${totalHedgingNotional.toLocaleString()}`,
                subsidiary: 'Auto-Generated',
                hedgeRatio: maxHedgeQuantity,
                hedgedAmount: finalHedgedAmount
              };
              
              serviceRef.current.addExposure(autoExposure);
              expositionsCreated++;
              console.log(`Created auto-exposure for ${currency} (${maturityStr}): ${exposureAmount}`);
            } else {
              // ✅ METTRE À JOUR L'EXPOSITION EXISTANTE
              const updatedExposure = {
                amount: exposureAmount,
                type: exposureType,
                description: `Auto-updated from ${maturityInstruments.length} hedging instrument(s) - Maturity: ${maturityStr} - Total Notional: ${totalHedgingNotional.toLocaleString()}`,
                hedgeRatio: maxHedgeQuantity,
                hedgedAmount: finalHedgedAmount
              };
              
              const updateSuccess = serviceRef.current.updateExposure(existingExposure.id, updatedExposure);
              if (updateSuccess) {
                expositionsUpdated++; // ✅ COMPTEUR SÉPARÉ pour les mises à jour
                console.log(`Updated existing exposure for ${currency} (${maturityStr}): ${exposureAmount} - Hedge Ratio: ${maxHedgeQuantity}%`);
              }
            }
          });
        });
        
        // ✅ NOUVEAU : Dispatch des événements pour notifier des nouvelles détections
        if (expositionsCreated > 0 || expositionsUpdated > 0) {
          window.dispatchEvent(new CustomEvent('exposuresAutoGenerated', {
            detail: { 
              count: expositionsCreated,
              updated: expositionsUpdated,
              newCurrencies: newCurrenciesDetected,
              newMaturities: newMaturitiesDetected,
              newCurrencyMaturityPairs: Array.from(newCurrencyMaturityPairs)
            }
          }));
        }
        
        // ✅ NOUVEAU : Dispatch des événements spécifiques pour les nouvelles devises et échéances
        if (newCurrenciesDetected.length > 0) {
          window.dispatchEvent(new CustomEvent('newCurrenciesDetected', {
            detail: { currencies: newCurrenciesDetected }
          }));
        }
        
        if (newMaturitiesDetected.length > 0) {
          window.dispatchEvent(new CustomEvent('newMaturitiesDetected', {
            detail: { maturities: newMaturitiesDetected }
          }));
        }
        
        console.log(`Auto-sync completed: ${expositionsCreated} exposures created, ${expositionsUpdated} exposures updated, ${newCurrenciesDetected.length} new currencies, ${newMaturitiesDetected.length} new maturities`);
      }
    } catch (error) {
      console.error('Error auto-generating exposures:', error);
    }
  }, []);

  // Helper function to extract base currency from currency pair
  const extractBaseCurrency = (currencyPair: string): string => {
    // Handle common currency pair formats
    if (currencyPair.includes('/')) {
      return currencyPair.split('/')[0];
    }
    if (currencyPair.length === 6) {
      return currencyPair.substring(0, 3);
    }
    // Fallback for other formats
    return currencyPair.substring(0, 3);
  };

  // Helper function to map instrument types
  const mapInstrumentType = (type: string): 'forward' | 'vanilla-call' | 'vanilla-put' | 'collar' | 'swap' | 'barrier' => {
    const typeMap: { [key: string]: 'forward' | 'vanilla-call' | 'vanilla-put' | 'collar' | 'swap' | 'barrier' } = {
      'Forward': 'forward',
      'Vanilla Call': 'vanilla-call',
      'Vanilla Put': 'vanilla-put',
      'Swap': 'swap',
      'Knock-Out Call': 'barrier',
      'Knock-Out Put': 'barrier',
      'Knock-In Call': 'barrier',
      'Knock-In Put': 'barrier',
      'Double Knock-Out Call': 'barrier',
      'Double Knock-Out Put': 'barrier',
      'One-Touch': 'barrier',
      'No-Touch': 'barrier',
      'Double-Touch': 'barrier',
      'Double-No-Touch': 'barrier',
      'Range Binary': 'barrier',
      'Outside Binary': 'barrier'
    };
    
    return typeMap[type] || 'barrier';
  };

  const refreshAllData = useCallback(() => {
    setMarketData(serviceRef.current.getMarketData());
    setExposures(serviceRef.current.getExposures());
    setInstruments(serviceRef.current.getInstruments());
    setRiskMetrics(serviceRef.current.calculateRiskMetrics());
    setCurrencyExposures(serviceRef.current.getCurrencyExposures());
    setLastUpdate(new Date());
  }, []);

  const addExposure = useCallback((exposure: Omit<ExposureData, 'id'>) => {
    setIsLoading(true);
    try {
      serviceRef.current.addExposure(exposure);
      refreshAllData();
    } finally {
      setIsLoading(false);
    }
  }, [refreshAllData]);

  const updateExposure = useCallback((id: string, updates: Partial<Omit<ExposureData, 'id'>>) => {
    setIsLoading(true);
    try {
      const result = serviceRef.current.updateExposure(id, updates);
      if (result) {
        refreshAllData();
      }
      return result;
    } finally {
      setIsLoading(false);
    }
  }, [refreshAllData]);

  const deleteExposure = useCallback((id: string) => {
    setIsLoading(true);
    try {
      const result = serviceRef.current.deleteExposure(id);
      if (result) {
        refreshAllData();
      }
      return result;
    } finally {
      setIsLoading(false);
    }
  }, [refreshAllData]);

  const addInstrument = useCallback((instrument: Omit<HedgingInstrument, 'id' | 'mtm'>) => {
    setIsLoading(true);
    try {
      serviceRef.current.addInstrument(instrument);
      refreshAllData();
    } finally {
      setIsLoading(false);
    }
  }, [refreshAllData]);

  const updateInstrument = useCallback((id: string, updates: Partial<Omit<HedgingInstrument, 'id'>>) => {
    setIsLoading(true);
    try {
      const result = serviceRef.current.updateInstrument(id, updates);
      if (result) {
        refreshAllData();
      }
      return result;
    } finally {
      setIsLoading(false);
    }
  }, [refreshAllData]);

  const deleteInstrument = useCallback((id: string) => {
    setIsLoading(true);
    try {
      const result = serviceRef.current.deleteInstrument(id);
      if (result) {
        refreshAllData();
      }
      return result;
    } finally {
      setIsLoading(false);
    }
  }, [refreshAllData]);

  const updateMarketData = useCallback(() => {
    serviceRef.current.updateMarketData();
    refreshAllData();
  }, [refreshAllData]);

  const calculateForwardRate = useCallback((currencyPair: string, tenor: string) => {
    return serviceRef.current.calculateForwardRate(currencyPair, tenor);
  }, []);

  const calculateOptionPrice = useCallback((
    optionType: 'call' | 'put',
    currencyPair: string,
    strike: number,
    timeToMaturity: number,
    volatility?: number
  ) => {
    return serviceRef.current.calculateOptionPrice(optionType, currencyPair, strike, timeToMaturity, volatility);
  }, []);

  const generateStressScenarios = useCallback(() => {
    return serviceRef.current.generateStressScenarios();
  }, []);

  const setLiveMode = useCallback((enabled: boolean) => {
    setIsLiveMode(enabled);
    if (enabled) {
      // Immediate update when enabling live mode
      updateMarketData();
    }
  }, [updateMarketData]);

  return {
    // Data
    marketData,
    exposures,
    instruments,
    riskMetrics,
    currencyExposures,
    
    // Actions
    addExposure,
    updateExposure,
    deleteExposure,
    addInstrument,
    updateInstrument,
    deleteInstrument,
    updateMarketData,
    calculateForwardRate,
    calculateOptionPrice,
    generateStressScenarios,
    calculateVarContributions: () => serviceRef.current.calculateVarContributions(),
    syncWithHedgingInstruments,
    autoGenerateExposures,
    
    // State
    isLoading,
    lastUpdate,
    isLiveMode,
    setLiveMode
  };
}; 