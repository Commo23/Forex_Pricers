import React, { useState, useEffect, useRef, useMemo } from "react";
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
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { useBankRates } from "@/hooks/useBankRates";
import { useBaseCurrency } from "@/hooks/useBaseCurrency";
import { getAvailableCurrencies } from "@/utils/currencyList";
import { CURRENCY_PAIRS } from "@/pages/Index";
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
  Upload,
  FileText,
  AlertCircle,
  Calculator,
  RefreshCw,
  Percent,
  Hash
} from "lucide-react";
import StrategyImportService, { HedgingInstrument, HedgingPortfolio, HedgingCounterparty } from "@/services/StrategyImportService";
import {
  parseCsvText,
  parseHedgingInstrumentRows,
  buildHedgingInstrumentPayload,
  HEDGING_INSTRUMENT_CSV_TEMPLATE_HEADER,
  HEDGING_INSTRUMENT_CSV_TEMPLATE_SAMPLE,
  displayTypeToCsvType,
} from "@/utils/hedgingInstrumentCsv";
import { PricingService } from "@/services/PricingService";
import ExchangeRateService from "@/services/ExchangeRateService";
import { fetchCurrencies, fetchVolSurface } from "@/lib/api/barchart";
import type { SurfacePoint } from "@/lib/api/barchart";
import { getFuturesContractForPair, isPairMappableToFuturesInsights } from "@/lib/pricersFuturesMapping";
import { interpolateSurface, interpolateIVAtPoint } from "@/lib/volSurfaceInterpolation";
import { interpolateAtTenor } from "@/lib/rate-explorer/bootstrapping";
import { useRateExplorerDiscountFactors } from "@/hooks/useRateExplorerDiscountFactors";
import { useHedgingBootstrapCurveMap } from "@/hooks/useHedgingBootstrapCurveMap";
import { getBootstrappedRatesForInstrument } from "@/utils/hedgingBootstrapRates";
import { readPricingInterestRateSource } from "@/utils/pricingSettings";
import {
  computeSpotForCurrencyPair,
  readForexMarketRateSnapshot,
  writeForexMarketRateSnapshot,
  FOREX_MARKET_RATE_SNAPSHOT_KEY,
  FOREX_MARKET_RATE_SNAPSHOT_EVENT,
  type ForexMarketRateSnapshot,
} from "@/lib/forexMarketSpotSync";
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
  const navigate = useNavigate();
  const { toast } = useToast();
  const bankRates = useBankRates(); // ✅ Synchronisation avec AllRates
  const baseCurrency = useBaseCurrency(); // Get base currency from settings
  
  // Get ExchangeRateService instance for real-time rate fetching
  const exchangeRateService = React.useMemo(() => {
    return ExchangeRateService.getInstance();
  }, []);
  
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
  const [portfolios, setPortfolios] = useState<HedgingPortfolio[]>(() => importService.getPortfolios());
  const [counterparties, setCounterparties] = useState<HedgingCounterparty[]>(() => importService.getCounterparties());
  const [selectedPortfolioFilter, setSelectedPortfolioFilter] = useState<string>("__all__"); // "__all__" | "__none__" | portfolioId
  const [selectedCounterpartyFilter, setSelectedCounterpartyFilter] = useState<string>("__all__"); // "__all__" | counterparty name
  const [instrumentSearchTerm, setInstrumentSearchTerm] = useState("");

  const csvInputRef = useRef<HTMLInputElement>(null);
  const [csvImportReportOpen, setCsvImportReportOpen] = useState(false);
  const [csvImportReport, setCsvImportReport] = useState<{
    imported: number;
    headerErrors: string[];
    rowErrors: { row: number; msg: string }[];
  }>({ imported: 0, headerErrors: [], rowErrors: [] });

  // Custom currency pairs from Pricers/Strategy Builder (localStorage) - kept in sync
  const [customCurrencyPairs, setCustomCurrencyPairs] = useState<Array<{ symbol: string; name: string; base?: string; quote?: string; defaultSpotRate?: number }>>(() => {
    try {
      const saved = localStorage.getItem("customCurrencyPairs");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  useEffect(() => {
    const sync = () => {
      try {
        const saved = localStorage.getItem("customCurrencyPairs");
        if (saved) setCustomCurrencyPairs(JSON.parse(saved));
      } catch {}
    };
    window.addEventListener("storage", sync);
    const id = setInterval(sync, 1500);
    return () => {
      window.removeEventListener("storage", sync);
      clearInterval(id);
    };
  }, []);

  // Instrument types: exact same list as Pricers (value = internal, label = display)
  const INSTRUMENT_TYPES = useMemo(() => [
    { value: "call", label: "Vanilla Call", category: "vanilla" },
    { value: "put", label: "Vanilla Put", category: "vanilla" },
    { value: "swap", label: "Swap", category: "swap" },
    { value: "forward", label: "Forward", category: "forward" },
    { value: "call-knockout", label: "Call Knock-Out", category: "barrier" },
    { value: "call-reverse-knockout", label: "Call Reverse Knock-Out", category: "barrier" },
    { value: "call-double-knockout", label: "Call Double Knock-Out", category: "barrier" },
    { value: "put-knockout", label: "Put Knock-Out", category: "barrier" },
    { value: "put-reverse-knockout", label: "Put Reverse Knock-Out", category: "barrier" },
    { value: "put-double-knockout", label: "Put Double Knock-Out", category: "barrier" },
    { value: "call-knockin", label: "Call Knock-In", category: "barrier" },
    { value: "call-reverse-knockin", label: "Call Reverse Knock-In", category: "barrier" },
    { value: "call-double-knockin", label: "Call Double Knock-In", category: "barrier" },
    { value: "put-knockin", label: "Put Knock-In", category: "barrier" },
    { value: "put-reverse-knockin", label: "Put Reverse Knock-In", category: "barrier" },
    { value: "put-double-knockin", label: "Put Double Knock-In", category: "barrier" },
    { value: "one-touch", label: "One Touch (beta)", category: "digital" },
    { value: "double-touch", label: "Double Touch (beta)", category: "digital" },
    { value: "no-touch", label: "No Touch (beta)", category: "digital" },
    { value: "double-no-touch", label: "Double No Touch (beta)", category: "digital" },
    { value: "range-binary", label: "Range Binary (beta)", category: "digital" },
    { value: "outside-binary", label: "Outside Binary (beta)", category: "digital" },
  ], []);

  // Fetch real-time rate (same logic as Pricers)
  const fetchRealTimeRate = React.useCallback(async (pair: { symbol: string; base?: string; quote?: string; defaultSpotRate: number }) => {
    try {
      const base = pair.base || pair.symbol.split("/")[0];
      const quote = pair.quote || pair.symbol.split("/")[1];
      const exchangeData = await exchangeRateService.getExchangeRates("USD");
      const rates = exchangeData.rates || {};
      if (base === "USD") return rates[quote] ?? pair.defaultSpotRate;
      if (quote === "USD") return rates[base] ? 1 / rates[base] : pair.defaultSpotRate;
      return (rates[quote] || 1) / (rates[base] || 1);
    } catch {
      return null;
    }
  }, [exchangeRateService]);

  // Add Instrument form state (aligned with Pricers: spot, vol, rates, notional base/quote, quantity, strikeType, real price)
  const defaultSpot = CURRENCY_PAIRS[0]?.defaultSpotRate ?? 1.085;
  const [addForm, setAddForm] = useState(() => ({
    type: "forward",
    currencyPair: "",
    spotPrice: defaultSpot,
    domesticRate: 5.0,
    foreignRate: 3.0,
    volatility: 15.0,
    notionalBase: 1000000,
    notionalQuote: Math.round(1000000 * defaultSpot * 100) / 100,
    quantity: 100,
    strike: defaultSpot,
    strikeType: "absolute" as "percent" | "absolute",
    maturity: "",
    counterparty: "Manual",
    barrierType: "absolute" as "percent" | "absolute",
    barrier: "" as string | number,
    secondBarrier: "" as string | number,
    rebate: 100 as number | string,
    realPrice: "" as string | number, // optional: user-entered real traded price (overrides theoretical)
    portfolioId: undefined as string | undefined,
  }));
  const [addFormRateOverrides, setAddFormRateOverrides] = useState<{ domestic: boolean; foreign: boolean }>({
    domestic: false,
    foreign: false,
  });

  // Local editing state for table inputs (avoids recalc on every keystroke → prevents crash)
  const [editingTableCells, setEditingTableCells] = useState<Record<string, { spot?: string; vol?: string }>>({});
  const debounceTimeoutsRef = useRef<{ spot: Record<string, ReturnType<typeof setTimeout>>; vol: Record<string, ReturnType<typeof setTimeout>> }>({ spot: {}, vol: {} });
  const DEBOUNCE_MS = 450;

  useEffect(() => {
    return () => {
      Object.values(debounceTimeoutsRef.current.spot).forEach(clearTimeout);
      Object.values(debounceTimeoutsRef.current.vol).forEach(clearTimeout);
    };
  }, []);
  
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

  // Theoretical price from form inputs (same logic as Pricers / calculateTodayPrice) — after valuationDate
  const addFormTheoreticalPrice = useMemo(() => {
    const spot = Number(addForm.spotPrice);
    const maturity = addForm.maturity;
    if (!maturity || isNaN(spot) || spot <= 0) return null;
    const valDate = valuationDate || new Date().toISOString().split("T")[0];
    const t = PricingService.calculateTimeToMaturity(maturity, valDate);
    if (t <= 0) return null;
    const r_d = (Number(addForm.domesticRate) || 0) / 100;
    const r_f = (Number(addForm.foreignRate) || 0) / 100;
    const sigma = (Number(addForm.volatility) || 0) / 100;
    const K = addForm.strikeType === "percent" ? spot * (Number(addForm.strike) || 0) / 100 : (Number(addForm.strike) || spot);
    const S = PricingService.calculateFXForwardPrice(spot, r_d, r_f, t);
    const opt = addForm.type.toLowerCase();
    try {
      if (opt === "forward") return S - K;
      if (opt === "swap") return S - K;
      if (opt.includes("knockout") || opt.includes("knockin") || opt.includes("knock-out") || opt.includes("knock-in")) {
        const b = addForm.barrierType === "percent" && addForm.barrier !== "" ? spot * (Number(addForm.barrier) / 100) : (Number(addForm.barrier) || 0);
        const b2 = addForm.barrierType === "percent" && addForm.secondBarrier !== "" ? spot * (Number(addForm.secondBarrier) / 100) : (Number(addForm.secondBarrier) || undefined);
        let pricingType = "";
        if (opt.includes("double")) {
          if (opt.includes("call")) pricingType = opt.includes("knock-out") || opt.includes("knockout") ? "call-double-knockout" : "call-double-knockin";
          else if (opt.includes("put")) pricingType = opt.includes("knock-out") || opt.includes("knockout") ? "put-double-knockout" : "put-double-knockin";
        } else if (opt.includes("call")) pricingType = opt.includes("reverse") ? "call-reverse-knockout" : "call-knockout";
        else if (opt.includes("put")) pricingType = opt.includes("reverse") ? "put-reverse-knockout" : "put-knockout";
        if (pricingType) return PricingService.calculateBarrierOptionClosedForm(pricingType, S, K, r_d, t, sigma, b, b2, r_f);
      }
      if (opt.includes("touch") || opt.includes("binary") || opt.includes("digital")) {
        const barrier = addForm.barrierType === "percent" && addForm.barrier !== "" ? spot * (Number(addForm.barrier) / 100) : (Number(addForm.barrier) || K);
        const secondBarrier = addForm.barrierType === "percent" && addForm.secondBarrier !== "" ? spot * (Number(addForm.secondBarrier) / 100) : (Number(addForm.secondBarrier) || undefined);
        const rebatePct = Number(addForm.rebate) || 100;
        return PricingService.calculateDigitalOptionPrice(opt, S, K, r_d, r_f, t, sigma, barrier, secondBarrier, 2000, rebatePct, true);
      }
      if (opt === "vanilla call" || opt === "call") return PricingService.calculateGarmanKohlhagenPrice("call", spot, K, r_d, r_f, t, sigma);
      if (opt === "vanilla put" || opt === "put") return PricingService.calculateGarmanKohlhagenPrice("put", spot, K, r_d, r_f, t, sigma);
    } catch (_) {}
    return null;
  }, [addForm.spotPrice, addForm.maturity, addForm.domesticRate, addForm.foreignRate, addForm.volatility, addForm.strike, addForm.strikeType, addForm.type, addForm.barrier, addForm.secondBarrier, addForm.barrierType, addForm.rebate, valuationDate]);

  // Devises base/quote pour les libellés dynamiques du formulaire Add Instrument
  const addFormBaseCcy = useMemo(() => {
    if (!addForm.currencyPair) return "base";
    const pair = [...CURRENCY_PAIRS, ...customCurrencyPairs].find((p: { symbol: string; base?: string; quote?: string }) => p.symbol === addForm.currencyPair);
    return pair?.base ?? addForm.currencyPair.split("/")[0] ?? "base";
  }, [addForm.currencyPair, customCurrencyPairs]);
  const addFormQuoteCcy = useMemo(() => {
    if (!addForm.currencyPair) return "quote";
    const pair = [...CURRENCY_PAIRS, ...customCurrencyPairs].find((p: { symbol: string; base?: string; quote?: string }) => p.symbol === addForm.currencyPair);
    return pair?.quote ?? addForm.currencyPair.split("/")[1] ?? "quote";
  }, [addForm.currencyPair, customCurrencyPairs]);

  const addFormBaseForCurve = useMemo(
    () => (/^[A-Z]{3}$/.test(addFormBaseCcy) ? addFormBaseCcy : "EUR"),
    [addFormBaseCcy]
  );
  const addFormQuoteForCurve = useMemo(
    () => (/^[A-Z]{3}$/.test(addFormQuoteCcy) ? addFormQuoteCcy : "USD"),
    [addFormQuoteCcy]
  );

  const addDomesticCurve = useRateExplorerDiscountFactors(addFormQuoteForCurve, "cubic_spline");
  const addForeignCurve = useRateExplorerDiscountFactors(addFormBaseForCurve, "cubic_spline");

  const addFormTimeToMaturity = useMemo(() => {
    if (!addForm.maturity) return 0;
    return PricingService.calculateTimeToMaturity(addForm.maturity, valuationDate);
  }, [addForm.maturity, valuationDate]);

  const interpolatedAddDomestic = useMemo(() => {
    if (!addDomesticCurve.discountFactors || addFormTimeToMaturity <= 0) return null;
    return interpolateAtTenor(addDomesticCurve.discountFactors, addFormTimeToMaturity);
  }, [addDomesticCurve.discountFactors, addFormTimeToMaturity]);

  const interpolatedAddForeign = useMemo(() => {
    if (!addForeignCurve.discountFactors || addFormTimeToMaturity <= 0) return null;
    return interpolateAtTenor(addForeignCurve.discountFactors, addFormTimeToMaturity);
  }, [addForeignCurve.discountFactors, addFormTimeToMaturity]);

  useEffect(() => {
    if (readPricingInterestRateSource() !== "bootstrapping") return;

    const nextDomestic = interpolatedAddDomestic ? interpolatedAddDomestic.zeroRate * 100 : null;
    const nextForeign = interpolatedAddForeign ? interpolatedAddForeign.zeroRate * 100 : null;
    const eps = 1e-7;

    setAddForm((prev) => {
      let updated = prev;
      if (nextDomestic !== null && !addFormRateOverrides.domestic) {
        if (Math.abs((prev.domesticRate || 0) - nextDomestic) > eps) {
          updated = { ...updated, domesticRate: nextDomestic };
        }
      }
      if (nextForeign !== null && !addFormRateOverrides.foreign) {
        if (Math.abs((prev.foreignRate || 0) - nextForeign) > eps) {
          updated = { ...updated, foreignRate: nextForeign };
        }
      }
      return updated;
    });
  }, [
    interpolatedAddDomestic?.zeroRate,
    interpolatedAddForeign?.zeroRate,
    addFormRateOverrides.domestic,
    addFormRateOverrides.foreign,
  ]);

  /** Curves for bootstrapped rates (same engine as Rate Explorer / Add Instrument). */
  const hedgingBootstrapCurveMap = useHedgingBootstrapCurveMap();

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

  const [interestRateSource, setInterestRateSource] = useState(() => readPricingInterestRateSource());
  useEffect(() => {
    const sync = () => setInterestRateSource(readPricingInterestRateSource());
    window.addEventListener("storage", sync);
    window.addEventListener("fxRiskManagerSettingsSaved", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("fxRiskManagerSettingsSaved", sync);
    };
  }, []);

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

  const MARKET_DEFAULTS: CurrencyMarketData = { spot: 1.0, volatility: 20, domesticRate: 1.0, foreignRate: 1.0 };

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
      setPortfolios(service.getPortfolios());
      setCounterparties(service.getCounterparties());
      
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

  // Function to fetch real-time spot price from Market Data
  const fetchRealTimeSpotPrice = async (currencyPair: string): Promise<number | null> => {
    try {
      // Parser la paire de devises (ex: "EUR/USD" -> base: "EUR", quote: "USD")
      const parts = currencyPair.split('/');
      if (parts.length !== 2) return null;
      
      const base = parts[0];
      const quote = parts[1];
      
      // Get exchange rates from API using base currency from settings
      const exchangeData = await exchangeRateService.getExchangeRates(baseCurrency);
      const rates = exchangeData.rates;
      
      // Calculate the cross rate for the selected pair
      let rate: number;
      
      if (base === baseCurrency) {
        // Direct rate: BASE_CURRENCY/XXX
        rate = rates[quote] || null;
      } else if (quote === baseCurrency) {
        // Inverted rate: XXX/BASE_CURRENCY = 1 / (BASE_CURRENCY/XXX)
        rate = rates[base] ? 1 / rates[base] : null;
      } else {
        // Cross rate: BASE/QUOTE = (BASE_CURRENCY/QUOTE) / (BASE_CURRENCY/BASE)
        const baseRate = rates[base] || 1;
        const quoteRate = rates[quote] || 1;
        rate = quoteRate / baseRate;
      }
      
      return rate;
    } catch (error) {
      console.error('Error fetching real-time spot price:', error);
      return null;
    }
  };

  /** Align spots with the same rate snapshot as Forex Market (localStorage + custom event). */
  const applyForexMarketSnapshotToState = React.useCallback(
    (snap: ForexMarketRateSnapshot) => {
      if (snap.base !== baseCurrency) return;
      if (instruments.length === 0) return;

      const uniqueCurrencies = getUniqueCurrencies(instruments);
      if (uniqueCurrencies.length === 0) return;

      setCurrencyMarketData((prev) => {
        let changed = false;
        const next = { ...prev };
        for (const pair of uniqueCurrencies) {
          const spot = computeSpotForCurrencyPair(pair, snap.base, snap.rates);
          if (spot == null || !(spot > 0) || isNaN(spot)) continue;
          const cur = next[pair] || getMarketDataFromInstruments(pair) || MARKET_DEFAULTS;
          if (Math.abs((cur.spot ?? 0) - spot) < 1e-10) continue;
          next[pair] = { ...MARKET_DEFAULTS, ...cur, spot };
          changed = true;
        }
        if (!changed) return prev;
        try {
          localStorage.setItem("currencyMarketData", JSON.stringify(next));
        } catch {
          /* ignore */
        }
        queueMicrotask(() => {
          setEditingMarketCells((prev) => {
            const nxt = { ...prev };
            for (const pair of uniqueCurrencies) {
              if (!nxt[pair]?.spot) continue;
              const rest = { ...nxt[pair] };
              delete rest.spot;
              if (Object.keys(rest).length === 0) delete nxt[pair];
              else nxt[pair] = rest;
            }
            return nxt;
          });
          setInstruments((prev) => [...prev]);
        });
        return next;
      });
    },
    [baseCurrency, instruments]
  );

  // Live sync with Forex Market snapshot + refresh if stale (Forex page refreshes every 30s)
  React.useEffect(() => {
    const onSnap = (e: Event) => {
      const ce = e as CustomEvent<ForexMarketRateSnapshot>;
      if (ce.detail) applyForexMarketSnapshotToState(ce.detail);
      else {
        const s = readForexMarketRateSnapshot();
        if (s) applyForexMarketSnapshotToState(s);
      }
    };
    window.addEventListener(FOREX_MARKET_RATE_SNAPSHOT_EVENT, onSnap as EventListener);

    const onStorage = (ev: StorageEvent) => {
      if (ev.key !== FOREX_MARKET_RATE_SNAPSHOT_KEY || !ev.newValue) return;
      try {
        const s = JSON.parse(ev.newValue) as ForexMarketRateSnapshot;
        applyForexMarketSnapshotToState(s);
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("storage", onStorage);

    const refreshSnapshotIfNeeded = async (): Promise<ForexMarketRateSnapshot | null> => {
      let snap = readForexMarketRateSnapshot();
      const now = Date.now();
      const stale = !snap || snap.base !== baseCurrency || now - snap.updatedAt > 35000;
      if (stale) {
        try {
          const ex = await exchangeRateService.getExchangeRates(baseCurrency);
          snap = { base: ex.base, rates: ex.rates, updatedAt: Date.now() };
          writeForexMarketRateSnapshot(snap);
        } catch {
          return snap;
        }
      }
      return snap;
    };

    const id = setInterval(() => {
      void refreshSnapshotIfNeeded().then((s) => {
        if (s) applyForexMarketSnapshotToState(s);
      });
    }, 15000);

    void refreshSnapshotIfNeeded().then((s) => {
      if (s) applyForexMarketSnapshotToState(s);
    });

    return () => {
      window.removeEventListener(FOREX_MARKET_RATE_SNAPSHOT_EVENT, onSnap as EventListener);
      window.removeEventListener("storage", onStorage);
      clearInterval(id);
    };
  }, [baseCurrency, exchangeRateService, applyForexMarketSnapshotToState]);

  // Synchronize spot price and rates with market data on initial load
  const hasSyncedOnMount = React.useRef(false);
  React.useEffect(() => {
    // Only sync once on initial mount
    if (hasSyncedOnMount.current) return;
    if (instruments.length === 0) return;
    
    const syncMarketData = async () => {
      const uniqueCurrencies = getUniqueCurrencies(instruments);
      if (uniqueCurrencies.length === 0) return;
      
      try {
        const updates: { [currencyPair: string]: CurrencyMarketData } = {};
        
        // Process all currencies in parallel
        await Promise.all(uniqueCurrencies.map(async (currencyPair) => {
          // Parser la paire de devises
          const parts = currencyPair.split('/');
          if (parts.length !== 2) return;
          
          const pairBase = parts[0];
          const pairQuote = parts[1];
          
          // Get Bank Rates for base and quote currencies
          const baseRate = bankRates[pairBase] ?? null;
          const quoteRate = bankRates[pairQuote] ?? null;
          
          // Spot: même snapshot que Forex Market si disponible, sinon API
          const snap = readForexMarketRateSnapshot();
          let realTimeSpot: number | null = null;
          if (snap && snap.base === baseCurrency) {
            realTimeSpot = computeSpotForCurrencyPair(currencyPair, snap.base, snap.rates);
          }
          if (realTimeSpot == null || isNaN(realTimeSpot) || realTimeSpot <= 0) {
            realTimeSpot = await fetchRealTimeSpotPrice(currencyPair);
          }
          
          // Get current data from state or from instruments
          const currentData = getMarketDataFromInstruments(currencyPair) || {
            spot: 1.0000,
            volatility: 20,
            domesticRate: 1.0,
            foreignRate: 1.0
          };
          
          // Update with market data
          const updatedData = { ...currentData };
          let pairUpdated = false;
          
          if (realTimeSpot !== null && !isNaN(realTimeSpot) && realTimeSpot > 0) {
            updatedData.spot = realTimeSpot;
            pairUpdated = true;
          }
          
          const skipBankRatesForInterest = readPricingInterestRateSource() === "bootstrapping";
          if (!skipBankRatesForInterest && baseRate !== null && baseRate !== undefined) {
            updatedData.foreignRate = baseRate;
            pairUpdated = true;
          }
          
          if (!skipBankRatesForInterest && quoteRate !== null && quoteRate !== undefined) {
            updatedData.domesticRate = quoteRate;
            pairUpdated = true;
          }
          
          if (pairUpdated) {
            updates[currencyPair] = updatedData;
          }
        }));
        
        // Apply all updates at once
        if (Object.keys(updates).length > 0) {
          setCurrencyMarketData(prevData => {
            const newData = { ...prevData, ...updates };
            localStorage.setItem('currencyMarketData', JSON.stringify(newData));
            return newData;
          });
        }
        
        hasSyncedOnMount.current = true;
      } catch (error) {
        console.error('Error syncing market data on load:', error);
        hasSyncedOnMount.current = true; // Mark as synced even on error to avoid retries
      }
    };
    
    // Sync on mount - wait a bit for bankRates and exchangeRateService to be available
    const timeoutId = setTimeout(() => {
      syncMarketData();
    }, 500);
    
    return () => clearTimeout(timeoutId);
  }, []); // Only run once on mount

  // ✅ Synchronisation automatique des taux d'AllRates vers HedgingInstruments
  useEffect(() => {
    if (interestRateSource === "bootstrapping") return; // taux courants viennent du bootstrap (courbe × maturité restante)
    if (Object.keys(bankRates).length === 0) return; // Pas de taux disponibles encore
    if (instruments.length === 0) return; // Pas d'instruments à synchroniser
    
    const uniqueCurrencies = getUniqueCurrencies(instruments);
    if (uniqueCurrencies.length === 0) return;
    
    let hasUpdates = false;
    const updatedPairs: string[] = [];
    
    setCurrencyMarketData(prevData => {
      const newData = { ...prevData };
      
      uniqueCurrencies.forEach(currencyPair => {
        // Parser la paire de devises (ex: "EUR/USD" -> base: "EUR", quote: "USD")
        const parts = currencyPair.split('/');
        if (parts.length !== 2) return; // Format invalide
        
        const baseCurrency = parts[0];
        const quoteCurrency = parts[1];
        
        // Obtenir les taux depuis AllRates
        const baseRate = bankRates[baseCurrency];
        const quoteRate = bankRates[quoteCurrency];
        
        // Mettre à jour seulement si les taux sont disponibles
        if (baseRate !== null && baseRate !== undefined && quoteRate !== null && quoteRate !== undefined) {
          const currentData = newData[currencyPair] || getMarketDataFromInstruments(currencyPair) || {
            spot: 1.0000,
            volatility: 20,
            domesticRate: 1.0,
            foreignRate: 1.0
          };
          
          // Mettre à jour seulement si les taux ont changé de manière significative (> 0.01%)
          const rateChanged = 
            Math.abs(currentData.domesticRate - quoteRate) > 0.01 || 
            Math.abs(currentData.foreignRate - baseRate) > 0.01;
          
          if (rateChanged) {
            newData[currencyPair] = {
              ...currentData,
              domesticRate: quoteRate, // Quote currency = domestic rate
              foreignRate: baseRate    // Base currency = foreign rate
            };
            hasUpdates = true;
            updatedPairs.push(currencyPair);
            console.log(`[SYNC] Updated rates for ${currencyPair}: domesticRate=${quoteRate.toFixed(3)}%, foreignRate=${baseRate.toFixed(3)}%`);
          }
        }
      });
      
      if (hasUpdates) {
        localStorage.setItem('currencyMarketData', JSON.stringify(newData));
      }
      
      return newData;
    });
    
    // Afficher une notification seulement si des mises à jour significatives ont été faites
    if (hasUpdates && updatedPairs.length > 0) {
      toast({
        title: "Rates Synchronized",
        description: `Interest rates updated from All Rates for ${updatedPairs.length} currency pair(s)`,
      });
    }
  }, [bankRates, instruments, toast, interestRateSource]);

  // NOTE: No separate useEffect to force recalculation on currencyMarketData change.
  // calculateTodayPrice reads currencyMarketData directly from the closure,
  // and mtmByCurrency already depends on [instruments, currencyMarketData].
  // The commitCurrencyMarketField helper calls setInstruments(prev => [...prev])
  // for spot/vol changes, which is sufficient to trigger re-render.

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

  /** Current domestic/foreign rates for pricing & table: manual (market data) vs bootstrapping (curve @ remaining maturity). */
  const getEffectiveRatesForInstrument = (instrument: HedgingInstrument) => {
    const marketData =
      currencyMarketData[instrument.currency] ||
      getMarketDataFromInstruments(instrument.currency) ||
      MARKET_DEFAULTS;
    if (interestRateSource !== "bootstrapping") {
      // Per-period rates exported from Strategy Builder when bootstrap was used there
      if (
        instrument.exportUsedBootstrappedRates &&
        instrument.exportDomesticRate != null &&
        instrument.exportForeignRate != null &&
        Number.isFinite(instrument.exportDomesticRate) &&
        Number.isFinite(instrument.exportForeignRate)
      ) {
        const d = Number(instrument.exportDomesticRate);
        const f = Number(instrument.exportForeignRate);
        return {
          domesticPct: d,
          foreignPct: f,
          r_d: d / 100,
          r_f: f / 100,
        };
      }
      return {
        domesticPct: Number(marketData.domesticRate) || 0,
        foreignPct: Number(marketData.foreignRate) || 0,
        r_d: (Number(marketData.domesticRate) || 0) / 100,
        r_f: (Number(marketData.foreignRate) || 0) / 100,
      };
    }
    const b = getBootstrappedRatesForInstrument(
      instrument.currency,
      instrument.maturity,
      valuationDate,
      hedgingBootstrapCurveMap.curves
    );
    if (b) {
      return {
        domesticPct: b.domesticPct,
        foreignPct: b.foreignPct,
        r_d: b.r_d,
        r_f: b.r_f,
      };
    }
    return {
      domesticPct: Number(marketData.domesticRate) || 0,
      foreignPct: Number(marketData.foreignRate) || 0,
      r_d: (Number(marketData.domesticRate) || 0) / 100,
      r_f: (Number(marketData.foreignRate) || 0) / 100,
    };
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
      const er = getEffectiveRatesForInstrument(instrument);
      const r_d = er.r_d;
      const r_f = er.r_f;

      // ✅ Utiliser barrierPricingModel pour choisir entre closed-form et monte-carlo
      const useClosedForm = barrierPricingModel === 'closed-form';

      // ✅ Utiliser la MÊME FONCTION que Strategy Builder (exportée d'Index.tsx)
      return calculateDigitalOptionPrice(
        type, S, K, r_d, r_f, t, effectiveSigma, barrier, secondBarrier, numSimulations, rebate, useClosedForm
      );
    }

    // For vanilla options, use the selected pricing model - même logique que Strategy Builder
    const erVanilla = getEffectiveRatesForInstrument(instrument);
    const r_d = erVanilla.r_d;
    const r_f = erVanilla.r_f;
    
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

  const DEBUG_PRICING = false; // set true to enable pricing logs (expensive with many instruments)
  const calculateTodayPrice = (instrument: HedgingInstrument): number => {
   try {
    // ✅ STRATÉGIE : Utiliser les valeurs CURRENT affichées dans le tableau (modifiables par l'utilisateur)
    
    // ✅ 1. TIME TO MATURITY : Utiliser la Valuation Date pour le calcul MTM
    // Vérifier si l'option est expirée
    const valuationDateObj = new Date(valuationDate);
    const maturityDateObj = new Date(instrument.maturity);
    
    // Si la Valuation Date est après la Maturity Date, l'option est expirée
    if (valuationDateObj >= maturityDateObj) {
      if (DEBUG_PRICING) console.log(`[DEBUG] ${instrument.id}: Option expired - Valuation Date (${valuationDate}) >= Maturity Date (${instrument.maturity})`);
      // Pour les options expirées, retourner la valeur intrinsèque
      const marketData = currencyMarketData[instrument.currency] || getMarketDataFromInstruments(instrument.currency) || MARKET_DEFAULTS;
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
    
    // 2. PARAMÈTRES DE MARCHÉ : spot depuis données marché ; taux = manuel ou bootstrap (settings)
    const marketData = currencyMarketData[instrument.currency] || getMarketDataFromInstruments(instrument.currency) || MARKET_DEFAULTS;
    const effRates = getEffectiveRatesForInstrument(instrument);
    
    // Utiliser les paramètres CURRENT (modifiables par l'utilisateur)
    // Hiérarchie pour le spot price : individuel > global
    const spotRate = Number(instrument.impliedSpotPrice || marketData.spot) || 1;
    const r_d = effRates.r_d;
    const r_f = effRates.r_f;
    
    if (DEBUG_PRICING) console.log(`[DEBUG] ${instrument.id}: Using CURRENT parameters - spot=${spotRate}, r_d=${(r_d*100).toFixed(3)}%, r_f=${(r_f*100).toFixed(3)}%, t=${calculationTimeToMaturity.toFixed(6)} (valuationDate=${valuationDate})`);
    if (DEBUG_PRICING) console.log(`[DEBUG] ${instrument.id}: Export vs Current - Export spot: ${instrument.exportSpotPrice || 'N/A'}, Current: ${marketData.spot}`);
    if (DEBUG_PRICING) console.log(`[DEBUG] ${instrument.id}: Export vs Current - Export r_d: ${instrument.exportDomesticRate ? (instrument.exportDomesticRate).toFixed(3) + '%' : 'N/A'}, Current: ${effRates.domesticPct.toFixed(3)}%`);
    if (DEBUG_PRICING) console.log(`[DEBUG] ${instrument.id}: Export vs Current - Export r_f: ${instrument.exportForeignRate ? (instrument.exportForeignRate).toFixed(3) + '%' : 'N/A'}, Current: ${effRates.foreignPct.toFixed(3)}%`);
    
    // 3. VOLATILITÉ : Utiliser la volatilité CURRENT affichée dans le tableau (modifiable par l'utilisateur)
    let sigma;
    if (instrument.impliedVolatility) {
      // 1. Priorité : Volatilité implicite spécifique (éditable par l'utilisateur)
      sigma = instrument.impliedVolatility / 100;
      if (DEBUG_PRICING) console.log(`[DEBUG] ${instrument.id}: Using CURRENT IMPLIED volatility: ${(sigma*100).toFixed(3)}%`);
    } else if (instrument.volatility) {
      // 2. Priorité : Volatilité spécifique de l'instrument (éditable par l'utilisateur)
      sigma = instrument.volatility / 100;
      if (DEBUG_PRICING) console.log(`[DEBUG] ${instrument.id}: Using CURRENT instrument volatility: ${(sigma*100).toFixed(3)}%`);
         } else if (marketData.volatility) {
       // 3. Priorité : Volatilité globale de la devise (éditable par l'utilisateur)
       sigma = marketData.volatility / 100;
       if (DEBUG_PRICING) console.log(`[DEBUG] ${instrument.id}: Using CURRENT market volatility: ${(sigma*100).toFixed(3)}%`);
    } else {
      // 5. Fallback : Volatilité des données de marché
      const marketData = currencyMarketData[instrument.currency] || getMarketDataFromInstruments(instrument.currency) || MARKET_DEFAULTS;
      sigma = marketData.volatility / 100;
      if (DEBUG_PRICING) console.log(`[DEBUG] ${instrument.id}: Using CURRENT market volatility: ${(sigma*100).toFixed(3)}%`);
    }
    
    // Guard: avoid division-by-zero when user is mid-edit
    if (!sigma || sigma <= 0 || !isFinite(sigma)) return 0;

    // 4. FORWARD CALCULATION : Utiliser PricingService pour calculer le forward
    const S = PricingService.calculateFXForwardPrice(spotRate, r_d, r_f, calculationTimeToMaturity);
    
    if (DEBUG_PRICING) console.log(`[DEBUG] ${instrument.id}: Forward calculation - Current: ${S.toFixed(6)}, Export: ${instrument.exportForwardPrice || 'N/A'}`);
    if (DEBUG_PRICING) console.log(`[DEBUG] ${instrument.id}: PRICING PARAMETERS - Spot: ${spotRate.toFixed(6)}, Forward: ${S.toFixed(6)} - Using SPOT for vanilla options (Strategy Builder logic)`);
    
    // 5. STRIKE ANALYSIS : Vérifier la cohérence du strike
    if (DEBUG_PRICING) console.log(`[DEBUG] ${instrument.id}: Strike analysis - Strike: ${instrument.strike}, Type: ${instrument.originalComponent?.strikeType || 'unknown'}, Original Strike: ${instrument.originalComponent?.strike || 'N/A'}, Spot: ${spotRate}`);
    
    if (DEBUG_PRICING) console.log(`[DEBUG] ${instrument.id}: Time to maturity - Valuation Date: ${valuationDate}, TTM: ${calculationTimeToMaturity.toFixed(4)} years (Maturity: ${instrument.maturity})`);
    if (DEBUG_PRICING) console.log(`[DEBUG] ${instrument.id}: Using current spot ${spotRate.toFixed(4)} -> forward ${S.toFixed(4)} (r_d=${(r_d*100).toFixed(1)}%, r_f=${(r_f*100).toFixed(1)}%, t=${calculationTimeToMaturity.toFixed(4)})`);
    
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
         if (DEBUG_PRICING) console.log(`[DEBUG] ${instrument.id}: Barrier analysis - spot=${spotRate.toFixed(4)}, barrier=${barrier.toFixed(4)}`);
         
         if (secondBarrier) {
           const lowerBarrier = Math.min(barrier, secondBarrier);
           const upperBarrier = Math.max(barrier, secondBarrier);
           const spotOutsideRange = spotRate <= lowerBarrier || spotRate >= upperBarrier;
           if (DEBUG_PRICING) console.log(`[DEBUG] ${instrument.id}: Double barrier analysis - spot=${spotRate.toFixed(4)}, lower=${lowerBarrier.toFixed(4)}, upper=${upperBarrier.toFixed(4)}, outside=${spotOutsideRange}`);
           
           // Pour les double knock-out: si le spot est en dehors des barrières, l'option est déjà knockée
           if (optionType.includes('knock-out') && spotOutsideRange) {
             if (DEBUG_PRICING) console.log(`[DEBUG] ${instrument.id}: Double knock-out option already knocked out (spot outside barriers)`);
             return 0;
           }
           
           // Pour les double knock-in: si le spot est en dehors des barrières, l'option est activée
           if (optionType.includes('knock-in') && spotOutsideRange) {
             if (DEBUG_PRICING) console.log(`[DEBUG] ${instrument.id}: Double knock-in option activated (spot outside barriers)`);
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
           
           if (DEBUG_PRICING) console.log(`[DEBUG] ${instrument.id}: Single barrier analysis - barrierCrossed=${barrierCrossed}`);
           
           // Pour les knock-out: si barrière franchie, option knockée
           if (optionType.includes('knock-out') && barrierCrossed) {
             if (DEBUG_PRICING) console.log(`[DEBUG] ${instrument.id}: Knock-out option already knocked out`);
             return 0;
           }
           
           // Pour les knock-in: si barrière franchie, option activée
           if (optionType.includes('knock-in') && barrierCrossed) {
             if (DEBUG_PRICING) console.log(`[DEBUG] ${instrument.id}: Knock-in option activated`);
             // Continuer avec le pricing normal d'une option vanille
           }
         }
       }
     }
    // DEBUG: Log des paramètres pour diagnostiquer les écarts de pricing (disabled by default for perf)
    if (DEBUG_PRICING) {
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
    }
    
    // STRATÉGIE DE PRICING SELON LE TYPE D'INSTRUMENT
    // IMPORTANT: Ordre des conditions critique - les plus spécifiques d'abord !
    
    // 1. OPTIONS BARRIÈRES - PRIORITÉ ABSOLUE (avant les vanilles)
    if (optionType.includes('knock-out') || optionType.includes('knock-in') || 
        optionType.includes('barrier') || optionType.includes('ko ') || optionType.includes('ki ') ||
        optionType.includes('knockout') || optionType.includes('knockin') || optionType.includes('reverse')) {
      
      if (DEBUG_PRICING) console.log(`[DEBUG] ${instrument.id}: Detected as BARRIER option, using closed-form`);
      
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
            if (DEBUG_PRICING) console.log(`[DEBUG] ${instrument.id}: Call-double-knockout detected`);
          } else if (optionType.includes('put')) {
            pricingType = "put-double-knockout";
            if (DEBUG_PRICING) console.log(`[DEBUG] ${instrument.id}: Put-double-knockout detected`);
          }
        } else if (optionType.includes('knock-in') || optionType.includes('knockin')) {
          if (optionType.includes('call')) {
            pricingType = "call-double-knockin";
            if (DEBUG_PRICING) console.log(`[DEBUG] ${instrument.id}: Call-double-knockin detected`);
          } else if (optionType.includes('put')) {
            pricingType = "put-double-knockin";
            if (DEBUG_PRICING) console.log(`[DEBUG] ${instrument.id}: Put-double-knockin detected`);
          }
        }
      }
      // 2. OPTIONS À BARRIÈRE SIMPLE
      else if (optionType.includes('knock-out') || optionType.includes('knockout') || optionType.includes('reverse')) {
        if (optionType.includes('call')) {
          if (optionType.includes('reverse')) {
            pricingType = "call-reverse-knockout";
            if (DEBUG_PRICING) console.log(`[DEBUG] ${instrument.id}: Call-reverse-knockout mapped to call-reverse-knockout`);
          } else {
            pricingType = "call-knockout";
          }
        } else if (optionType.includes('put')) {
          if (optionType.includes('reverse')) {
            pricingType = "put-reverse-knockout";
            if (DEBUG_PRICING) console.log(`[DEBUG] ${instrument.id}: Put-reverse-knockout mapped to put-reverse-knockout (barrier=${barrier}, spot=${S})`);
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
      
      if (DEBUG_PRICING) console.log(`[DEBUG] ${instrument.id}: Mapped type to: "${pricingType}"`);
      if (DEBUG_PRICING) console.log(`[DEBUG] ${instrument.id}: Barrier params - barrier=${barrier}, strike=${K}, spot=${S}`);
      if (DEBUG_PRICING) console.log(`[DEBUG] ${instrument.id}: Barrier relationship - barrier < spot: ${barrier < S}, barrier > spot: ${barrier > S}`);
      
      if (pricingType) {
        // Pour les reverse-knockout, on peut avoir besoin d'ajuster les paramètres
        let adjustedBarrier = barrier;
        let adjustedStrike = K;
        
        if (optionType.includes('reverse')) {
          if (DEBUG_PRICING) console.log(`[DEBUG] ${instrument.id}: Reverse option detected, using original parameters`);
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
        if (DEBUG_PRICING) console.log(`[DEBUG] ${instrument.id}: BARRIER FINAL COMPARISON - Calculated: ${price.toFixed(6)}, Export: ${instrument.realOptionPrice || instrument.premium || 'N/A'}, Difference: ${price - (instrument.realOptionPrice || instrument.premium || 0)}`);
        return price;
      }
      
      // Fallback si le mapping échoue
      return 0;
    }
    
    // 2. OPTIONS DIGITALES - DEUXIÈME PRIORITÉ
    else if (optionType.includes('touch') || optionType.includes('binary') || 
             optionType.includes('digital')) {
      
      if (DEBUG_PRICING) console.log(`[DEBUG] ${instrument.id}: Detected as DIGITAL option, using Monte Carlo`);
      
      const barrier = instrument.barrier || K;
      const secondBarrier = instrument.secondBarrier;
      const rebate = instrument.rebate || 5; // Utiliser le rebate de l'instrument ou 5% par défaut
      
      if (DEBUG_PRICING) console.log(`[DEBUG] ${instrument.id}: Digital option params - barrier=${barrier}, secondBarrier=${secondBarrier}, rebate=${rebate}%`);
      
      // ✅ CORRIGÉ : Passer r_d et r_f pour Garman-Kohlhagen
      // ✅ Utiliser barrierPricingModel pour choisir entre closed-form et monte-carlo
      const useClosedForm = barrierPricingModel === 'closed-form';
      // Use fewer simulations for table display (2000) to avoid main-thread freeze on add instrument
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
        useClosedForm ? 0 : 2000, // 0 when closed-form; 2000 for Monte Carlo (table display)
        rebate,
        useClosedForm
      );
      
      if (DEBUG_PRICING) console.log(`[DEBUG] ${instrument.id}: DIGITAL FINAL COMPARISON - Calculated: ${digitalPrice.toFixed(6)}, Export: ${instrument.realOptionPrice || instrument.premium || 'N/A'}, Difference: ${digitalPrice - (instrument.realOptionPrice || instrument.premium || 0)}`);
      return digitalPrice;
    }
    
    // 3. OPTIONS VANILLES EXPLICITES - Utiliser EXACTEMENT la même logique que Strategy Builder
    else if (optionType === 'vanilla call') {
      if (DEBUG_PRICING) console.log(`[DEBUG] ${instrument.id}: Detected as VANILLA CALL, using Strategy Builder logic`);
      
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
      if (DEBUG_PRICING) console.log(`[DEBUG] ${instrument.id}: Detected as VANILLA PUT, using Strategy Builder logic`);
      
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
    if (DEBUG_PRICING) console.log(`[DEBUG] ${instrument.id}: Fallback pricing using ${underlyingResult.type} price: ${underlyingResult.price.toFixed(6)}`);
    const fallbackPrice = PricingService.calculateGarmanKohlhagenPrice(
      'call', // Default to call
      underlyingResult.price,  // ✅ Utiliser le prix sous-jacent selon les paramètres globaux
      K,
      r_d,
      r_f,
      calculationTimeToMaturity,
      sigma
    );
    
    if (DEBUG_PRICING) console.log(`[DEBUG] Instrument ${instrument.id}: FINAL COMPARISON - Calculated: ${fallbackPrice.toFixed(6)}, Export: ${instrument.realOptionPrice || instrument.premium || 'N/A'}, Difference: ${fallbackPrice - (instrument.realOptionPrice || instrument.premium || 0)}`);
    return fallbackPrice;
   } catch (err) {
    console.warn(`[calculateTodayPrice] Error for instrument ${instrument.id}:`, err);
    return 0;
   }
  };

  // Local editing state for currency market data inputs (prevents recalc on every keystroke)
  const [editingMarketCells, setEditingMarketCells] = useState<Record<string, Partial<Record<keyof CurrencyMarketData, string>>>>({});
  const marketDebounceRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const MARKET_DEBOUNCE_MS = 600;

  // Commit a single market-data field: validate, save, recalc once
  const commitCurrencyMarketField = (currency: string, field: keyof CurrencyMarketData, raw: string) => {
    const parsed = parseFloat(raw);
    if (isNaN(parsed)) return;
    if (field === 'volatility' && (parsed < 0.01 || parsed > 200)) return;
    if (field === 'spot' && parsed <= 0) return;

    setCurrencyMarketData(prev => {
      const base = prev[currency] || getMarketDataFromInstruments(currency) || MARKET_DEFAULTS;
      const newData = {
        ...prev,
        [currency]: { ...MARKET_DEFAULTS, ...base, [field]: parsed },
      };
      try { localStorage.setItem('currencyMarketData', JSON.stringify(newData)); } catch (_) {}
      return newData;
    });

    // Force re-render so calculateTodayPrice picks up the new market data
    setInstruments(prev => [...prev]);

    const labels: Record<string, string> = { volatility: 'Volatility', spot: 'Spot Rate', domesticRate: 'Domestic Rate', foreignRate: 'Foreign Rate' };
    const units: Record<string, string> = { volatility: '%', spot: '', domesticRate: '%', foreignRate: '%' };
    toast({ title: `${labels[field] || field} Updated`, description: `${labels[field] || field} → ${parsed}${units[field] || ''} for ${currency}. Prices recalculated.` });
  };

  // onChange handler for currency market inputs: local state + debounced commit
  const onMarketFieldChange = (currency: string, field: keyof CurrencyMarketData, raw: string) => {
    setEditingMarketCells(prev => ({ ...prev, [currency]: { ...prev[currency], [field]: raw } }));
    const dkey = `${currency}-${field}`;
    if (marketDebounceRef.current[dkey]) clearTimeout(marketDebounceRef.current[dkey]);
    marketDebounceRef.current[dkey] = setTimeout(() => {
      commitCurrencyMarketField(currency, field, raw);
      setEditingMarketCells(prev => {
        const next = { ...prev };
        if (next[currency]) { delete next[currency][field]; if (Object.keys(next[currency]).length === 0) delete next[currency]; }
        return next;
      });
      delete marketDebounceRef.current[dkey];
    }, MARKET_DEBOUNCE_MS);
  };

  // onBlur: commit immediately and clear local editing state
  const onMarketFieldBlur = (currency: string, field: keyof CurrencyMarketData) => {
    const dkey = `${currency}-${field}`;
    if (marketDebounceRef.current[dkey]) { clearTimeout(marketDebounceRef.current[dkey]); delete marketDebounceRef.current[dkey]; }
    const raw = editingMarketCells[currency]?.[field];
    if (raw !== undefined) commitCurrencyMarketField(currency, field, raw);
    setEditingMarketCells(prev => {
      const next = { ...prev };
      if (next[currency]) { delete next[currency][field]; if (Object.keys(next[currency]).length === 0) delete next[currency]; }
      return next;
    });
  };

  // Legacy wrapper (used by non-input callers like refresh, sync, etc.)
  const updateCurrencyMarketData = (currency: string, field: keyof CurrencyMarketData, value: number) => {
    commitCurrencyMarketField(currency, field, String(value));
  };

  // Fonction pour mettre à jour la volatilité d'un instrument spécifique
  const updateInstrumentVolatility = (instrumentId: string, volatility: number) => {
    setInstruments(prevInstruments => {
      const updated = prevInstruments.map(instrument =>
        instrument.id === instrumentId
          ? { ...instrument, impliedVolatility: volatility }
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
      title: "Individual Volatility Updated",
      description: `Updated volatility to ${volatility}% for instrument ${instrumentId}`,
    });
  };

  // ——— Apply IV from Futures Insights (strike × DTE), same logic as Pricers ———
  const [fetchingIvFromFi, setFetchingIvFromFi] = useState(false);
  const [fetchingIvInstrumentId, setFetchingIvInstrumentId] = useState<string | null>(null);
  const [fetchingIvCurrency, setFetchingIvCurrency] = useState<string | null>(null);

  const instrumentTypeUsesVolatility = (type: string) =>
    type !== "forward" && type !== "swap";

  const applyIvFromFuturesInsightsForAddForm = async () => {
    if (!addForm.currencyPair || !addForm.maturity || !isPairMappableToFuturesInsights(addForm.currencyPair)) return;
    if (!instrumentTypeUsesVolatility(addForm.type)) return;
    setFetchingIvFromFi(true);
    try {
      const currenciesRes = await fetchCurrencies(false);
      if (!currenciesRes.success || !currenciesRes.data?.length) {
        toast({ title: "Futures Insights", description: "Could not load futures list.", variant: "destructive" });
        return;
      }
      const contract = getFuturesContractForPair(addForm.currencyPair, currenciesRes.data);
      if (!contract) {
        toast({ title: "No mapping", description: `No Futures contract for ${addForm.currencyPair}.`, variant: "destructive" });
        return;
      }
      const surfaceRes = await fetchVolSurface(contract, contract, 50, false, undefined, undefined);
      if (!surfaceRes.success || !surfaceRes.surfacePoints?.length) {
        toast({ title: "Surface fetch failed", description: surfaceRes.error || "Could not load vol surface.", variant: "destructive" });
        return;
      }
      const points: SurfacePoint[] = surfaceRes.surfacePoints;
      const optionTypeForSurface: "call" | "put" =
        addForm.type === "put" || addForm.type.startsWith("put-") ? "put" : "call";
      const filtered = points.filter((p) => p.type === optionTypeForSurface);
      if (filtered.length === 0) {
        toast({ title: "No IV data", description: `No ${optionTypeForSurface} surface points.`, variant: "destructive" });
        return;
      }
      const strikes = [...new Set(filtered.map((p) => p.strike))].sort((a, b) => a - b);
      const dtes = [...new Set(filtered.map((p) => p.dte))].sort((a, b) => a - b);
      const key = (dte: number, strike: number) => `${dte}-${strike}`;
      const pointMap = new Map<string, SurfacePoint>();
      for (const p of filtered) pointMap.set(key(p.dte, p.strike), p);
      let z: (number | null)[][] = dtes.map((dte) =>
        strikes.map((strike) => {
          const point = pointMap.get(key(dte, strike));
          const iv = point?.iv ?? null;
          return iv !== null && iv > 0 ? iv : null;
        })
      );
      z = interpolateSurface(z, strikes, dtes);
      const strikeAbs =
        addForm.strikeType === "percent"
          ? (Number(addForm.spotPrice) || 0) * (Number(addForm.strike) || 0) / 100
          : Number(addForm.strike) || 0;
      const valDate = valuationDate || new Date().toISOString().split("T")[0];
      const dteDays = Math.round(
        PricingService.calculateTimeToMaturity(addForm.maturity, valDate) * 365.25
      );
      const iv = interpolateIVAtPoint(strikes, dtes, z, strikeAbs, dteDays);
      if (iv == null || iv <= 0) {
        toast({ title: "IV interpolation", description: "No interpolated IV for this strike & DTE. Check surface range.", variant: "destructive" });
        return;
      }
      setAddForm((f) => ({ ...f, volatility: Math.round(iv * 100) / 100 }));
      toast({
        title: "IV applied (Futures Insights)",
        description: `Volatility ${iv.toFixed(2)}% at strike ${strikeAbs.toFixed(4)}, DTE ${dteDays} (${contract}).`,
      });
    } catch (e) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "Failed to fetch IV.", variant: "destructive" });
    } finally {
      setFetchingIvFromFi(false);
    }
  };

  const applyIvFromFuturesInsightsForInstrument = async (instrument: HedgingInstrument): Promise<number | null> => {
    if (!isPairMappableToFuturesInsights(instrument.currency) || !instrumentTypeUsesVolatility(instrument.type)) return null;
    setFetchingIvInstrumentId(instrument.id);
    try {
      const currenciesRes = await fetchCurrencies(false);
      if (!currenciesRes.success || !currenciesRes.data?.length) return null;
      const contract = getFuturesContractForPair(instrument.currency, currenciesRes.data);
      if (!contract) return null;
      const surfaceRes = await fetchVolSurface(contract, contract, 50, false, undefined, undefined);
      if (!surfaceRes.success || !surfaceRes.surfacePoints?.length) return null;
      const points: SurfacePoint[] = surfaceRes.surfacePoints;
      const optionTypeForSurface: "call" | "put" =
        instrument.type === "put" || instrument.type.startsWith("put-") ? "put" : "call";
      const filtered = points.filter((p) => p.type === optionTypeForSurface);
      if (filtered.length === 0) return null;
      const strikes = [...new Set(filtered.map((p) => p.strike))].sort((a, b) => a - b);
      const dtes = [...new Set(filtered.map((p) => p.dte))].sort((a, b) => a - b);
      const key = (dte: number, strike: number) => `${dte}-${strike}`;
      const pointMap = new Map<string, SurfacePoint>();
      for (const p of filtered) pointMap.set(key(p.dte, p.strike), p);
      let z: (number | null)[][] = dtes.map((dte) =>
        strikes.map((strike) => {
          const point = pointMap.get(key(dte, strike));
          const iv = point?.iv ?? null;
          return iv !== null && iv > 0 ? iv : null;
        })
      );
      z = interpolateSurface(z, strikes, dtes);
      const spot = currencyMarketData[instrument.currency]?.spot ?? 1;
      const strikeAbs = instrument.strike ?? spot;
      const valDate = valuationDate || new Date().toISOString().split("T")[0];
      const dteDays = Math.round(
        PricingService.calculateTimeToMaturity(instrument.maturity, valDate) * 365.25
      );
      const iv = interpolateIVAtPoint(strikes, dtes, z, strikeAbs, dteDays);
      return iv != null && iv > 0 ? iv : null;
    } catch {
      return null;
    } finally {
      setFetchingIvInstrumentId(null);
    }
  };

  /** Update volatility from Futures Insights for all instruments of one currency (one surface fetch, then interpolate per instrument). */
  const applyIvFromFuturesInsightsForCurrency = async (currency: string) => {
    if (!isPairMappableToFuturesInsights(currency)) {
      toast({ title: "Not available", description: `${currency} is not mapped to Futures Insights.`, variant: "destructive" });
      return;
    }
    const list = instruments.filter((inst) => inst.currency === currency && instrumentTypeUsesVolatility(inst.type));
    if (list.length === 0) {
      toast({ title: "No instruments", description: `No option-type instruments for ${currency}.`, variant: "destructive" });
      return;
    }
    setFetchingIvCurrency(currency);
    try {
      const currenciesRes = await fetchCurrencies(false);
      if (!currenciesRes.success || !currenciesRes.data?.length) {
        toast({ title: "Futures Insights", description: "Could not load futures list.", variant: "destructive" });
        return;
      }
      const contract = getFuturesContractForPair(currency, currenciesRes.data);
      if (!contract) {
        toast({ title: "No mapping", description: `No Futures contract for ${currency}.`, variant: "destructive" });
        return;
      }
      const surfaceRes = await fetchVolSurface(contract, contract, 50, false, undefined, undefined);
      if (!surfaceRes.success || !surfaceRes.surfacePoints?.length) {
        toast({ title: "Surface fetch failed", description: surfaceRes.error || "Could not load vol surface.", variant: "destructive" });
        return;
      }
      const points: SurfacePoint[] = surfaceRes.surfacePoints;
      const valDate = valuationDate || new Date().toISOString().split("T")[0];
      const updates: { id: string; iv: number }[] = [];
      for (const inst of list) {
        const optionType: "call" | "put" = inst.type === "put" || inst.type.startsWith("put-") ? "put" : "call";
        const filtered = points.filter((p) => p.type === optionType);
        if (filtered.length === 0) continue;
        const strikes = [...new Set(filtered.map((p) => p.strike))].sort((a, b) => a - b);
        const dtes = [...new Set(filtered.map((p) => p.dte))].sort((a, b) => a - b);
        const key = (dte: number, strike: number) => `${dte}-${strike}`;
        const pointMap = new Map<string, SurfacePoint>();
        for (const p of filtered) pointMap.set(key(p.dte, p.strike), p);
        let z: (number | null)[][] = dtes.map((dte) =>
          strikes.map((strike) => {
            const point = pointMap.get(key(dte, strike));
            const iv = point?.iv ?? null;
            return iv !== null && iv > 0 ? iv : null;
          })
        );
        z = interpolateSurface(z, strikes, dtes);
        const spot = currencyMarketData[inst.currency]?.spot ?? 1;
        const strikeAbs = inst.strike ?? spot;
        const dteDays = Math.round(
          PricingService.calculateTimeToMaturity(inst.maturity, valDate) * 365.25
        );
        const iv = interpolateIVAtPoint(strikes, dtes, z, strikeAbs, dteDays);
        if (iv != null && iv > 0) updates.push({ id: inst.id, iv });
      }
      if (updates.length > 0) {
        const idToIv = new Map(updates.map((u) => [u.id, u.iv]));
        setInstruments((prev) => {
          const next = prev.map((i) =>
            idToIv.has(i.id) ? { ...i, impliedVolatility: idToIv.get(i.id)! } : i
          );
          try {
            localStorage.setItem("hedgingInstruments", JSON.stringify(next));
          } catch (_) {}
          return next;
        });
      }
      toast({
        title: "Vol updated from Futures",
        description: `${currency}: ${updates.length}/${list.length} instrument(s) updated.`,
      });
    } catch (e) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "Failed to fetch IV.", variant: "destructive" });
    } finally {
      setFetchingIvCurrency(null);
    }
  };

  // Fonction pour réinitialiser la volatilité individuelle (utiliser la volatilité globale)
  const resetInstrumentVolatility = (instrumentId: string) => {
    setInstruments(prevInstruments => {
      const updated = prevInstruments.map(instrument =>
        instrument.id === instrumentId
          ? { ...instrument, impliedVolatility: undefined }
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

  /** Refresh market data for one currency from instruments (export data) or keep current; safe number fallbacks to avoid crashes. */
  const refreshMarketDataForCurrency = (currency: string) => {
    const fromInstruments = getMarketDataFromInstruments(currency);
    const current = currencyMarketData[currency] || { spot: 1.0, volatility: 20, domesticRate: 1.0, foreignRate: 1.0 };
    const spot = Number(fromInstruments?.spot ?? current.spot) || 1.0;
    const volatility = Number(fromInstruments?.volatility ?? current.volatility) || 20;
    const domesticRate = Number(fromInstruments?.domesticRate ?? current.domesticRate) ?? 1.0;
    const foreignRate = Number(fromInstruments?.foreignRate ?? current.foreignRate) ?? 1.0;
    const nextData: CurrencyMarketData = { spot, volatility, domesticRate, foreignRate };

    setCurrencyMarketData((prev) => {
      const newData = { ...prev, [currency]: nextData };
      try {
        localStorage.setItem("currencyMarketData", JSON.stringify(newData));
      } catch (_) {}
      return newData;
    });
    toast({
      title: "Data refreshed",
      description: `${currency}: Spot ${spot.toFixed(6)}, Vol ${volatility}%`,
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

  // Format currency amount in specific currency
  const formatCurrency = (amount: number, currency: string = 'USD') => {
    const baseCurrency = currency.includes('/') ? currency.split('/')[0] : currency;
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: baseCurrency,
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
      }).format(amount);
    } catch {
      return `${baseCurrency} ${(amount || 0).toFixed(2)}`;
    }
  };

  // Get base currency from currency pair
  const getBaseCurrency = (currencyPair: string): string => {
    if (currencyPair.includes('/')) {
      return currencyPair.split('/')[0];
    }
    return currencyPair;
  };

  // Calculate instrument status based on maturity date and valuation date
  const calculateInstrumentStatus = (instrument: HedgingInstrument): string => {
    // If manually set to cancelled, keep it
    if (instrument.status && instrument.status.toLowerCase() === "cancelled") {
      return instrument.status;
    }
    
    // Check if instrument is expired based on maturity date
    if (instrument.maturity) {
      const valuationDateObj = new Date(valuationDate);
      const maturityDateObj = new Date(instrument.maturity);
      
      if (valuationDateObj >= maturityDateObj) {
        return "matured";
      }
    }
    
    // Default to active if not expired
    return "active";
  };

  const getStatusBadge = (status: string) => {
    switch (status.toLowerCase()) {
      case "active":
        return <Badge className="bg-green-100 text-green-800 border-green-200">Active</Badge>;
      case "matured":
      case "expired":
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
    // Clear any pending debounce timeouts for this instrument so callbacks don't run after delete
    if (debounceTimeoutsRef.current.spot[id]) {
      clearTimeout(debounceTimeoutsRef.current.spot[id]);
      delete debounceTimeoutsRef.current.spot[id];
    }
    if (debounceTimeoutsRef.current.vol[id]) {
      clearTimeout(debounceTimeoutsRef.current.vol[id]);
      delete debounceTimeoutsRef.current.vol[id];
    }
    setEditingTableCells(prev => {
      const next = { ...prev };
      if (next[id]) delete next[id];
      return next;
    });

    importService.deleteInstrument(id);
    const updatedInstruments = importService.getHedgingInstruments();
    setInstruments(updatedInstruments);

    toast({
      title: "Instrument Deleted",
      description: "The hedging instrument has been removed successfully.",
    });

    // Defer heavy sync (useFinancialData) to next tick so UI updates first and doesn't block/crash
    requestAnimationFrame(() => {
      try {
        window.dispatchEvent(new CustomEvent("hedgingInstrumentsUpdated"));
      } catch (e) {
        console.error("Error after delete instrument:", e);
      }
    });
  };

  const deleteAllInstruments = () => {
    // Clear all debounce timeouts and editing state before deleting
    Object.keys(debounceTimeoutsRef.current.spot).forEach(k => clearTimeout(debounceTimeoutsRef.current.spot[k]));
    Object.keys(debounceTimeoutsRef.current.vol).forEach(k => clearTimeout(debounceTimeoutsRef.current.vol[k]));
    debounceTimeoutsRef.current.spot = {};
    debounceTimeoutsRef.current.vol = {};
    setEditingTableCells({});

    instruments.forEach(instrument => {
      importService.deleteInstrument(instrument.id);
    });

    const updatedInstruments = importService.getHedgingInstruments();
    setInstruments(updatedInstruments);

    toast({
      title: "All Instruments Deleted",
      description: "All hedging instruments have been removed successfully.",
    });

    requestAnimationFrame(() => {
      try {
        window.dispatchEvent(new CustomEvent("hedgingInstrumentsUpdated"));
      } catch (e) {
        console.error("Error after delete all instruments:", e);
      }
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

    const matchesPortfolio = selectedPortfolioFilter === "__all__" ||
      (selectedPortfolioFilter === "__none__" && !instrument.portfolioId) ||
      (instrument.portfolioId === selectedPortfolioFilter);

    const matchesCounterparty = selectedCounterpartyFilter === "__all__" ||
      (instrument.counterparty === selectedCounterpartyFilter);

    const search = instrumentSearchTerm.trim().toLowerCase();
    const matchesSearch =
      search.length === 0 ||
      instrument.id.toLowerCase().includes(search) ||
      instrument.type.toLowerCase().includes(search) ||
      instrument.currency.toLowerCase().includes(search) ||
      (instrument.counterparty || "").toLowerCase().includes(search) ||
      (instrument.strategyName || "").toLowerCase().includes(search);
    
    return matchesTab && matchesPortfolio && matchesCounterparty && matchesSearch;
  });

  // Counterparties for filter and Add form: from Counterparties list + any present on instruments (legacy)
  const counterpartyOptions = useMemo(() => {
    const fromList = new Set(counterparties.map((c) => c.name));
    instruments.forEach((i) => { if (i.counterparty) fromList.add(i.counterparty); });
    return [...fromList].sort();
  }, [counterparties, instruments]);

  const escapeHedgingCsvCell = (value: string | number | undefined | null) => {
    if (value === undefined || value === null || value === "") return "";
    if (typeof value === "number" && isFinite(value)) return String(value);
    const s = String(value);
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const handleDownloadHedgingCsvTemplate = () => {
    const blob = new Blob([HEDGING_INSTRUMENT_CSV_TEMPLATE_SAMPLE], { type: "text/csv;charset=utf-8" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "hedging-instruments-import-template.csv";
    a.click();
    window.URL.revokeObjectURL(url);
    toast({
      title: "Template downloaded",
      description:
        "Required: type, currency_pair, maturity, notional, spot. Optional: rates, vol, quantity, strike, counterparty, portfolio, etc.",
    });
  };

  const handleExportHedgingInstrumentsCsv = () => {
    const lines = [
      HEDGING_INSTRUMENT_CSV_TEMPLATE_HEADER,
      ...instruments.map((inst) => {
        const portName = portfolios.find((p) => p.id === inst.portfolioId)?.name ?? "";
        const typeToken = displayTypeToCsvType(inst.type);
        const cells: (string | number)[] = [
          typeToken,
          inst.currency,
          inst.maturity,
          inst.notional,
          inst.exportSpotPrice ?? "",
          inst.exportDomesticRate ?? "",
          inst.exportForeignRate ?? "",
          inst.volatility ?? "",
          inst.quantity ?? 100,
          inst.strike ?? "",
          "false",
          inst.counterparty,
          portName,
          inst.realOptionPrice ?? inst.premium ?? "",
          inst.barrier ?? "",
          inst.secondBarrier ?? "",
          inst.rebate ?? "",
        ];
        return cells.map((c) => escapeHedgingCsvCell(c)).join(",");
      }),
    ].join("\n");
    const blob = new Blob([lines], { type: "text/csv;charset=utf-8" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hedging-instruments-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    toast({
      title: "Export complete",
      description: `${instruments.length} instrument(s) exported (re-importable template).`,
    });
  };

  const handleImportHedgingCsvClick = () => csvInputRef.current?.click();

  const handleHedgingCsvFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const input = e.target;
    const valDate = valuationDate || new Date().toISOString().split("T")[0];
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      const rows = parseCsvText(text);
      const { headerErrors, results } = parseHedgingInstrumentRows(rows, { valuationDate: valDate });

      if (headerErrors.length > 0) {
        setCsvImportReport({ imported: 0, headerErrors, rowErrors: [] });
        setCsvImportReportOpen(true);
        input.value = "";
        return;
      }

      const rowErrors: { row: number; msg: string }[] = results
        .filter((r): r is { ok: false; row: number; error: string } => !r.ok)
        .map((r) => ({ row: r.row, msg: r.error }));

      const payloads: Omit<HedgingInstrument, "id">[] = [];
      for (const r of results) {
        if (!r.ok) continue;
        const pName = r.data.portfolioName?.trim();
        let portfolioId: string | undefined;
        if (pName) {
          const p = portfolios.find((x) => x.name.trim().toLowerCase() === pName.toLowerCase());
          if (!p) {
            rowErrors.push({ row: r.row, msg: `Unknown portfolio "${r.data.portfolioName}"` });
            continue;
          }
          portfolioId = p.id;
        }
        payloads.push(
          buildHedgingInstrumentPayload(r.data, {
            valuationDate: valDate,
            portfolioId,
          })
        );
      }

      if (payloads.length > 0) {
        importService.addHedgingInstrumentsBatch(payloads);
      }
      requestAnimationFrame(() => {
        setInstruments(importService.getHedgingInstruments());
        window.dispatchEvent(new CustomEvent("hedgingInstrumentsUpdated"));
      });

      if (rowErrors.length > 0) {
        toast({
          title: payloads.length > 0 ? "Partial import" : "Import failed",
          description: `${payloads.length} row(s) imported, ${rowErrors.length} row(s) skipped. See details.`,
          variant: payloads.length > 0 ? "default" : "destructive",
        });
        setCsvImportReport({ imported: payloads.length, headerErrors: [], rowErrors });
        setCsvImportReportOpen(true);
      } else if (payloads.length > 0) {
        toast({
          title: "Import complete",
          description: `${payloads.length} hedging instrument(s) imported from CSV.`,
        });
      } else {
        toast({
          title: "No data imported",
          description: "Add at least one valid row under the header.",
          variant: "destructive",
        });
      }

      input.value = "";
    };
    reader.onerror = () => {
      toast({
        title: "Read error",
        description: "Could not read the CSV file.",
        variant: "destructive",
      });
      input.value = "";
    };
    reader.readAsText(file);
  };

  // Get base currency from settings
  const baseCurrencyFromSettings = useBaseCurrency();
  
  // State for reference currency for MTM total conversion (defaults to base currency)
  const [referenceCurrency, setReferenceCurrency] = useState<string>(baseCurrencyFromSettings);
  
  // Update reference currency when base currency changes
  useEffect(() => {
    setReferenceCurrency(baseCurrencyFromSettings);
  }, [baseCurrencyFromSettings]);
  
  // Get available currencies for reference currency selector (synchronized with Market Data)
  const uniqueCurrenciesForRef = React.useMemo(() => {
    // Get all available currencies from the centralized list
    const availableCurrencies = getAvailableCurrencies();
    const availableCodes = new Set(availableCurrencies.map(c => c.code));
    
    // Also include currencies from instruments (in case some are not in the main list)
    const instrumentCurrencies = getUniqueCurrencies(instruments);
    instrumentCurrencies.forEach(c => {
      const baseCurrency = c.split('/')[0];
      availableCodes.add(baseCurrency);
    });
    
    // Return sorted list of currency codes
    return Array.from(availableCodes).sort();
  }, [instruments]);

  // Calculate MTM by currency
  const mtmByCurrency = React.useMemo(() => {
    const mtmMap: { [currency: string]: number } = {};
    
    instruments.forEach(inst => {
      const marketData = currencyMarketData[inst.currency];
      if (!marketData) {
        console.warn(`No market data for currency ${inst.currency}, skipping MTM calculation`);
        return;
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
      
      const baseCurrency = getBaseCurrency(inst.currency);
      if (!mtmMap[baseCurrency]) {
        mtmMap[baseCurrency] = 0;
      }
      // Take into account quantity (%) in MTM calculation
      const quantityFactor = Math.abs(quantity) / 100;
      mtmMap[baseCurrency] += mtmValue * Math.abs(inst.notional) * quantityFactor;
    });
    
    return mtmMap;
  }, [instruments, currencyMarketData, interestRateSource, valuationDate, hedgingBootstrapCurveMap.curves]);

  // Convert MTM total to reference currency
  const [convertedTotalMTM, setConvertedTotalMTM] = React.useState<number>(0);
  
  React.useEffect(() => {
    const convertTotal = async () => {
      if (Object.keys(mtmByCurrency).length === 0) {
        setConvertedTotalMTM(0);
        return;
      }
      
      try {
        if (referenceCurrency === 'USD') {
          // If reference is USD, convert all MTM to USD
          let totalUSD = 0;
          
          for (const [currency, mtm] of Object.entries(mtmByCurrency)) {
            if (currency === 'USD') {
              totalUSD += mtm;
            } else {
              try {
                // Get exchange rate from currency to USD
                const exchangeData = await exchangeRateService.getExchangeRates('USD');
                const rates = exchangeData.rates;
                
                // Convert: if currency is EUR, we need EUR/USD rate
                // rates.EUR gives us USD/EUR, so EUR/USD = 1/rates.EUR
                let rateToUSD = 1;
                if (rates[currency]) {
                  // If currency is in rates, it's USD/currency, so currency/USD = 1/rates[currency]
                  rateToUSD = 1 / rates[currency];
                } else {
                  // Use spot price from market data as fallback
                  const currencyPair = Object.keys(currencyMarketData).find(cp => cp.startsWith(currency + '/'));
                  if (currencyPair && currencyMarketData[currencyPair]) {
                    const spot = currencyMarketData[currencyPair].spot;
                    rateToUSD = currencyPair.endsWith('/USD') ? spot : 1 / spot;
                  } else {
                    console.warn(`Rate not found for ${currency}, using 1`);
                  }
                }
                
                totalUSD += mtm * rateToUSD;
              } catch (error) {
                console.error(`Error converting ${currency} to USD:`, error);
                // Use spot price from market data as fallback
                const currencyPair = Object.keys(currencyMarketData).find(cp => cp.startsWith(currency + '/'));
                if (currencyPair && currencyMarketData[currencyPair]) {
                  const spot = currencyMarketData[currencyPair].spot;
                  totalUSD += mtm * (currencyPair.endsWith('/USD') ? spot : 1 / spot);
                }
              }
            }
          }
          
          setConvertedTotalMTM(totalUSD);
        } else {
          // Convert all to reference currency via USD
          let totalInRef = 0;
          
          for (const [currency, mtm] of Object.entries(mtmByCurrency)) {
            try {
              const exchangeData = await exchangeRateService.getExchangeRates('USD');
              const rates = exchangeData.rates;
              
              // Convert currency to USD first
              let rateToUSD = 1;
              if (currency === 'USD') {
                rateToUSD = 1;
              } else if (rates[currency]) {
                rateToUSD = 1 / rates[currency];
              } else {
                // Use spot price from market data as fallback
                const currencyPair = Object.keys(currencyMarketData).find(cp => cp.startsWith(currency + '/'));
                if (currencyPair && currencyMarketData[currencyPair]) {
                  const spot = currencyMarketData[currencyPair].spot;
                  rateToUSD = currencyPair.endsWith('/USD') ? spot : 1 / spot;
                }
              }
              
              // Convert USD to reference currency
              let rateFromUSD = 1;
              if (referenceCurrency === 'USD') {
                rateFromUSD = 1;
              } else if (rates[referenceCurrency]) {
                rateFromUSD = rates[referenceCurrency]; // USD/ref
              } else {
                // Use spot price from market data as fallback
                const currencyPair = Object.keys(currencyMarketData).find(cp => cp.endsWith('/' + referenceCurrency) || cp.startsWith(referenceCurrency + '/'));
                if (currencyPair && currencyMarketData[currencyPair]) {
                  const spot = currencyMarketData[currencyPair].spot;
                  rateFromUSD = currencyPair.endsWith('/' + referenceCurrency) ? spot : 1 / spot;
                }
              }
              
              totalInRef += mtm * rateToUSD * rateFromUSD;
            } catch (error) {
              console.error(`Error converting ${currency} to ${referenceCurrency}:`, error);
            }
          }
          
          setConvertedTotalMTM(totalInRef);
        }
      } catch (error) {
        console.error('Error converting MTM total:', error);
        setConvertedTotalMTM(0);
      }
    };
    
    convertTotal();
  }, [mtmByCurrency, referenceCurrency, currencyMarketData]);
  
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

            {/* Market Data per Currency - compact list */}
            {getUniqueCurrencies(instruments).length > 0 ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium text-muted-foreground">
                    Market Parameters by Currency ({getUniqueCurrencies(instruments).length} currencies)
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
                <div className="rounded-lg border bg-muted/10 overflow-hidden w-fit">
                  <div className="grid grid-cols-[7rem_10rem_auto] gap-x-3 items-center px-3 py-2 text-xs font-medium text-muted-foreground border-b bg-muted/20">
                    <span>Currency</span>
                    <span>Spot Rate</span>
                    <span className="text-center">IV</span>
                  </div>
                  {getUniqueCurrencies(instruments).map((currency) => {
                    const data = currencyMarketData[currency] || getMarketDataFromInstruments(currency) || MARKET_DEFAULTS;
                    const count = instruments.filter(inst => inst.currency === currency).length;
                    const mappable = isPairMappableToFuturesInsights(currency);
                    return (
                      <div
                        key={currency}
                        className="grid grid-cols-[7rem_10rem_auto] gap-x-3 items-center px-3 py-2 border-b border-muted/50 last:border-b-0 hover:bg-muted/10"
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          <Badge variant="outline" className="font-mono font-semibold text-xs shrink-0">
                            {currency}
                          </Badge>
                          <span className="text-muted-foreground text-xs shrink-0">({count})</span>
                        </div>
                        <div className="min-w-0">
                          <Input
                            id={`spot-${currency}`}
                            type="number"
                            step="0.0001"
                            value={editingMarketCells[currency]?.spot ?? data.spot}
                            onChange={(e) => onMarketFieldChange(currency, 'spot', e.target.value)}
                            onBlur={() => onMarketFieldBlur(currency, 'spot')}
                            className="font-mono text-sm h-8 w-full"
                            placeholder="1.0850"
                          />
                        </div>
                        <div className="flex justify-start shrink-0">
                          {mappable ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => applyIvFromFuturesInsightsForCurrency(currency)}
                              disabled={fetchingIvCurrency === currency}
                              className="text-xs h-8"
                            >
                              {fetchingIvCurrency === currency ? "…" : "Update from Futures"}
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => refreshMarketDataForCurrency(currency)}
                              className="text-xs h-8"
                            >
                              Update
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
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
            <div className="space-y-2">
              {(() => {
                // Calculate notional by currency, separated by long/short
                const notionalByCurrency: { [currency: string]: { long: number; short: number } } = {};
                instruments.forEach(inst => {
                  const quantityToHedge = inst.quantity || 0;
                  const unitPrice = inst.realOptionPrice || inst.premium || 0;
                  const volumeToHedge = inst.notional;
                  
                  // Calculate notional taking into account quantity (%)
                  // quantity is in percentage, so we multiply by (quantity / 100)
                  const quantityFactor = Math.abs(quantityToHedge) / 100;
                  const calculatedNotional = unitPrice * volumeToHedge * quantityFactor;
                  const displayedNotional = calculatedNotional > 0 ? calculatedNotional : inst.notional * quantityFactor;
                  
                  const baseCurrency = getBaseCurrency(inst.currency);
                  if (!notionalByCurrency[baseCurrency]) {
                    notionalByCurrency[baseCurrency] = { long: 0, short: 0 };
                  }
                  
                  // Separate long and short positions based on quantity sign
                  if (quantityToHedge > 0) {
                    // Long position
                    notionalByCurrency[baseCurrency].long += displayedNotional;
                  } else if (quantityToHedge < 0) {
                    // Short position
                    notionalByCurrency[baseCurrency].short += displayedNotional;
                  } else {
                    // If quantity is 0, consider as long by default
                    notionalByCurrency[baseCurrency].long += displayedNotional;
                  }
                });
                
                return Object.entries(notionalByCurrency).map(([currency, notional]) => (
                  <div key={currency} className="space-y-1 border-b pb-2 last:border-b-0 last:pb-0">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-muted-foreground">{currency}:</span>
                    </div>
                    <div className="flex justify-between items-center pl-2">
                      <span className="text-xs text-green-600">Long:</span>
                      <span className="text-sm font-bold text-green-700">{formatCurrency(notional.long, currency)}</span>
                    </div>
                    {notional.short > 0 && (
                      <div className="flex justify-between items-center pl-2">
                        <span className="text-xs text-red-600">Short:</span>
                        <span className="text-sm font-bold text-red-700">{formatCurrency(notional.short, currency)}</span>
                      </div>
                    )}
                    <div className="flex justify-between items-center pl-2 pt-1 border-t">
                      <span className="text-xs font-medium">Net:</span>
                      <span className="text-base font-bold">{formatCurrency(notional.long - notional.short, currency)}</span>
                    </div>
                  </div>
                ));
              })()}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
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
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Select value={referenceCurrency} onValueChange={setReferenceCurrency}>
                  <SelectTrigger className="h-7 text-xs w-20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    {uniqueCurrenciesForRef.map(currency => (
                      <SelectItem key={currency} value={currency}>
                        {currency}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className={`text-2xl font-bold ${getMTMColor(convertedTotalMTM)}`}>
                  {formatCurrency(convertedTotalMTM, referenceCurrency)}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Total Unrealized P&L
              </p>
              {/* MTM by currency breakdown */}
              <div className="space-y-1 pt-2 border-t">
                {Object.entries(mtmByCurrency).map(([currency, mtm]) => (
                  <div key={currency} className="flex justify-between text-xs">
                    <span className="text-muted-foreground">{currency}:</span>
                    <span className={getMTMColor(mtm)}>{formatCurrency(mtm, currency)}</span>
                  </div>
                ))}
              </div>
            </div>
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
            <div className="text-2xl font-bold">
              {(() => {
                // Calculate instruments maturing in the next 30 days from valuation date
                const valuationDateObj = new Date(valuationDate);
                const thirtyDaysFromNow = new Date(valuationDateObj);
                thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
                
                const nearMaturityCount = instruments.filter(inst => {
                  if (!inst.maturity) return false;
                  
                  const maturityDateObj = new Date(inst.maturity);
                  // Instrument must be active (not expired) and maturing within 30 days
                  return maturityDateObj >= valuationDateObj && maturityDateObj <= thirtyDaysFromNow;
                }).length;
                
                return nearMaturityCount;
              })()}
            </div>
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
            <div className="flex flex-wrap gap-2">
              {/* Toggle Export Columns */}
              <Button 
                onClick={() => setShowExportColumns(!showExportColumns)}
                variant={showExportColumns ? "default" : "outline"}
                size="sm"
                className="whitespace-nowrap"
              >
                {showExportColumns ? "Hide Export" : "Show Export"}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="whitespace-nowrap"
                onClick={handleExportHedgingInstrumentsCsv}
                disabled={instruments.length === 0}
                title="Export all instruments in CSV import format"
              >
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="whitespace-nowrap"
                onClick={handleDownloadHedgingCsvTemplate}
                title="Download CSV template for bulk import"
              >
                <FileText className="h-4 w-4 mr-2" />
                CSV template
              </Button>
              <input
                ref={csvInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={handleHedgingCsvFileChange}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="whitespace-nowrap"
                onClick={handleImportHedgingCsvClick}
                title="Import multiple instruments from CSV"
              >
                <Upload className="h-4 w-4 mr-2" />
                Import CSV
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
              <DialogContent className="sm:max-w-[640px] max-h-[90vh] flex flex-col overflow-hidden">
                <DialogHeader className="shrink-0">
                  <DialogTitle>Add New Hedging Instrument</DialogTitle>
                  <DialogDescription>
                    Create a new hedging instrument entry. Pairs and types are synced with Pricers and Strategy Builder.
                  </DialogDescription>
                </DialogHeader>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!addForm.currencyPair || !addForm.maturity) {
                      toast({
                        title: "Validation",
                        description: "Please select a currency pair and enter maturity date.",
                        variant: "destructive",
                      });
                      return;
                    }
                    const notionalBaseVal = Number(addForm.notionalBase) || 0;
                    if (notionalBaseVal <= 0) {
                      toast({
                        title: "Validation",
                        description: "Notional (base) must be greater than 0.",
                        variant: "destructive",
                      });
                      return;
                    }
                    const spotForBarrier = Number(addForm.spotPrice) || 1;
                    const isDigital = addForm.type.includes("touch") || addForm.type.includes("binary");
                    const strikeAbs = isDigital ? spotForBarrier : (addForm.strikeType === "percent" ? spotForBarrier * (Number(addForm.strike) || 0) / 100 : (Number(addForm.strike) || 0));
                    const maturityDate = new Date(addForm.maturity);
                    if (isNaN(maturityDate.getTime())) {
                      toast({
                        title: "Validation",
                        description: "Invalid maturity date.",
                        variant: "destructive",
                      });
                      return;
                    }
                    const barrierNum = addForm.barrier === "" ? undefined : Number(addForm.barrier);
                    const secondBarrierNum = addForm.secondBarrier === "" ? undefined : Number(addForm.secondBarrier);
                    const barrier = barrierNum == null ? undefined : addForm.barrierType === "percent" ? (spotForBarrier * (barrierNum / 100)) : barrierNum;
                    const secondBarrier = secondBarrierNum == null ? undefined : addForm.barrierType === "percent" ? (spotForBarrier * (secondBarrierNum / 100)) : secondBarrierNum;
                    const rebate = addForm.rebate === "" ? undefined : Number(addForm.rebate);
                    const displayType = INSTRUMENT_TYPES.find((t) => t.value === addForm.type)?.label ?? addForm.type;
                    const notionalBase = Number(addForm.notionalBase) || 0;
                    const quantity = Math.min(100, Math.max(0, Number(addForm.quantity) ?? 100));
                    const unitPrice = addForm.realPrice !== "" && addForm.realPrice !== undefined && !isNaN(Number(addForm.realPrice))
                      ? Number(addForm.realPrice)
                      : (addFormTheoreticalPrice ?? 0);
                    const ttm = addForm.maturity ? PricingService.calculateTimeToMaturity(addForm.maturity, valuationDate || new Date().toISOString().split("T")[0]) : 0;
                    importService.addHedgingInstrument({
                      type: displayType,
                      currency: addForm.currencyPair,
                      notional: notionalBase,
                      quantity,
                      strike: !isNaN(strikeAbs) ? strikeAbs : undefined,
                      premium: unitPrice,
                      realOptionPrice: unitPrice,
                      volatility: Number(addForm.volatility) || undefined,
                      maturity: addForm.maturity,
                      status: "active",
                      mtm: 0,
                      hedge_accounting: false,
                      counterparty: addForm.counterparty,
                      portfolioId: addForm.portfolioId || undefined,
                      barrier,
                      secondBarrier,
                      rebate,
                      exportSpotPrice: Number(addForm.spotPrice) || undefined,
                      exportDomesticRate: Number(addForm.domesticRate) || undefined,
                      exportForeignRate: Number(addForm.foreignRate) || undefined,
                      exportVolatility: Number(addForm.volatility) || undefined,
                      exportTimeToMaturity: ttm > 0 ? ttm : undefined,
                    });
                    // Close dialog and show toast immediately so UI doesn't freeze
                    setIsAddDialogOpen(false);
                    setAddFormRateOverrides({ domestic: false, foreign: false });
                    setAddForm({
                      type: "forward",
                      currencyPair: "",
                      spotPrice: defaultSpot,
                      domesticRate: 5.0,
                      foreignRate: 3.0,
                      volatility: 15.0,
                      notionalBase: 1000000,
                      notionalQuote: Math.round(1000000 * defaultSpot * 100) / 100,
                      quantity: 100,
                      strike: defaultSpot,
                      strikeType: "absolute",
                      maturity: "",
                      counterparty: "Manual",
                      barrierType: "absolute",
                      barrier: "",
                      secondBarrier: "",
                      rebate: 100,
                      realPrice: "",
                      portfolioId: undefined,
                    });
                    toast({ title: "Instrument added", description: `${displayType} ${addForm.currencyPair} has been added.` });
                    // Defer heavy work (table recalc + useFinancialData sync) to next tick to avoid "Page not responding"
                    requestAnimationFrame(() => {
                      setInstruments(importService.getHedgingInstruments());
                      window.dispatchEvent(new CustomEvent("hedgingInstrumentsUpdated"));
                    });
                  }}
                  className="flex flex-col gap-4 py-4 overflow-y-auto min-h-0"
                >
                  <div className="grid grid-cols-[minmax(0,160px)_1fr] gap-x-4 gap-y-1 items-center">
                    <Label htmlFor="instrument-type" className="text-right font-medium whitespace-nowrap">Type</Label>
                    <Select
                      value={addForm.type}
                      onValueChange={(value) => {
                        const spotVal = Number(addForm.spotPrice) || 1.085;
                        setAddForm((f) => {
                          const next = { ...f, type: value };
                          if (value.includes("touch") || value.includes("binary")) {
                            next.barrierType = "absolute";
                            next.barrier = (f.barrier === "" || f.barrier === undefined) ? spotVal * 1.05 : f.barrier;
                            next.secondBarrier = (value.includes("double") || value.includes("range") || value.includes("outside"))
                              ? ((f.secondBarrier === "" || f.secondBarrier === undefined) ? spotVal * 0.95 : f.secondBarrier)
                              : "";
                            next.rebate = (f.rebate === "" || f.rebate === undefined) ? 100 : f.rebate;
                          }
                          return next;
                        });
                      }}
                    >
                      <SelectTrigger className="w-full min-w-[180px]">
                        <SelectValue placeholder="Select instrument type" />
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
                  <div className="grid grid-cols-[minmax(0,160px)_1fr] gap-x-4 gap-y-1 items-center">
                    <Label htmlFor="currency-pair" className="text-right font-medium whitespace-nowrap">Currency Pair</Label>
                    <div className="flex flex-col gap-1">
                      <Select
                      value={addForm.currencyPair || undefined}
                      onValueChange={async (value) => {
                        const pair = [...CURRENCY_PAIRS, ...customCurrencyPairs].find((p) => p.symbol === value) as { symbol: string; base?: string; quote?: string; defaultSpotRate: number } | undefined;
                        const spot = pair?.defaultSpotRate ?? addForm.spotPrice;
                        const base = pair?.base || value?.split("/")[0];
                        const quote = pair?.quote || value?.split("/")[1];
                        const fromBootstrapSettings = readPricingInterestRateSource() === "bootstrapping";
                        const domesticRate = fromBootstrapSettings
                          ? undefined
                          : base && quote
                            ? (bankRates[quote as keyof typeof bankRates] ?? addForm.domesticRate)
                            : addForm.domesticRate;
                        const foreignRate = fromBootstrapSettings
                          ? undefined
                          : base && quote
                            ? (bankRates[base as keyof typeof bankRates] ?? addForm.foreignRate)
                            : addForm.foreignRate;
                        setAddForm((f) => ({
                          ...f,
                          currencyPair: value,
                          spotPrice: spot,
                          strike: spot,
                          ...(fromBootstrapSettings
                            ? {}
                            : {
                                domesticRate: typeof domesticRate === "number" ? domesticRate : f.domesticRate,
                                foreignRate: typeof foreignRate === "number" ? foreignRate : f.foreignRate,
                              }),
                          notionalQuote: Math.round((f.notionalBase || 0) * spot * 100) / 100,
                        }));
                        setAddFormRateOverrides({ domestic: false, foreign: false });
                        if (pair) {
                          try {
                            const realTimeRate = await fetchRealTimeRate(pair);
                            if (realTimeRate != null && !isNaN(realTimeRate) && realTimeRate > 0) {
                              setAddForm((f) => ({
                                ...f,
                                spotPrice: realTimeRate,
                                strike: f.strikeType === "absolute" ? f.strike : realTimeRate * (Number(f.strike) || 0) / 100,
                                notionalQuote: Math.round((f.notionalBase || 0) * realTimeRate * 100) / 100,
                              }));
                              toast({ title: "Rate updated", description: `${pair.symbol}: ${realTimeRate.toFixed(4)}` });
                            }
                          } catch (_) {}
                        }
                      }}
                    >
                      <SelectTrigger className="w-full min-w-[180px]">
                        <SelectValue placeholder="Select currency pair" />
                      </SelectTrigger>
                      <SelectContent>
                        <div className="p-2 text-xs font-medium text-muted-foreground border-b flex items-center gap-2">
                          <span>Major Pairs</span>
                          <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded">Live Rates</span>
                        </div>
                        {CURRENCY_PAIRS.filter((p) => p.category === "majors").map((pair) => (
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
                        {CURRENCY_PAIRS.filter((p) => p.category === "crosses").map((pair) => (
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
                        {CURRENCY_PAIRS.filter((p) => p.category === "others").map((pair) => (
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
                                  <span className="text-xs text-muted-foreground">{pair.name || "Custom"}</span>
                                </div>
                              </SelectItem>
                            ))}
                          </>
                        )}
                      </SelectContent>
                    </Select>
                      <span className="text-[10px] text-muted-foreground">Synced with Pricers</span>
                    </div>
                  </div>
                  {/* Market data (like Pricers) */}
                  <div className="grid grid-cols-[minmax(0,160px)_1fr] gap-x-4 gap-y-1 items-center">
                    <Label className="text-right font-medium whitespace-nowrap">Spot ({addForm.currencyPair || "—"})</Label>
                    <Input
                      type="number"
                      step="0.0001"
                      className="w-full"
                      value={addForm.spotPrice ?? ""}
                      onChange={(e) => setAddForm((f) => ({ ...f, spotPrice: parseFloat(e.target.value) || 0, notionalQuote: Math.round((f.notionalBase || 0) * (parseFloat(e.target.value) || 1) * 100) / 100 }))}
                    />
                  </div>
                  {!(addForm.type.includes("touch") || addForm.type.includes("binary")) && (
                    <div className="grid grid-cols-[minmax(0,160px)_1fr] gap-x-4 gap-y-1 items-center">
                      <Label className="text-right font-medium whitespace-nowrap">Strike</Label>
                      <div className="flex gap-2">
                        <Input
                          type="number"
                          step="0.01"
                          value={addForm.strike ?? ""}
                          onChange={(e) => setAddForm((f) => ({ ...f, strike: e.target.value === "" ? (Number(f.spotPrice) || 0) : (parseFloat(e.target.value) || 0) }))}
                          className="flex-1"
                        />
                        <Select value={addForm.strikeType} onValueChange={(v: "percent" | "absolute") => setAddForm((f) => ({ ...f, strikeType: v }))}>
                          <SelectTrigger className="w-20">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="percent"><span className="flex items-center gap-1"><Percent className="w-3 h-3" /> %</span></SelectItem>
                            <SelectItem value="absolute"><span className="flex items-center gap-1"><Hash className="w-3 h-3" /> Abs</span></SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <p className="col-span-2 text-xs text-muted-foreground">
                        {addForm.strikeType === "percent" ? `Absolute: ${((Number(addForm.spotPrice) || 0) * (Number(addForm.strike) || 0) / 100).toFixed(4)}` : `% of spot: ${((Number(addForm.strike) || 0) / (Number(addForm.spotPrice) || 1) * 100).toFixed(2)}%`}
                      </p>
                    </div>
                  )}
                  <div className="grid grid-cols-[minmax(0,160px)_1fr] gap-x-4 gap-y-1 items-center">
                    <Label className="text-right font-medium whitespace-nowrap">Maturity</Label>
                    <Input
                      type="date"
                      className="w-full"
                      value={addForm.maturity}
                      onChange={(e) => setAddForm((f) => ({ ...f, maturity: e.target.value }))}
                    />
                  </div>
                  {/* Notional (base/quote) vs Volume */}
                  <div className="grid grid-cols-[minmax(0,160px)_1fr] gap-x-4 gap-y-1 items-center">
                    <Label className="text-right font-medium whitespace-nowrap">Notional ({addFormBaseCcy})</Label>
                    <Input
                      type="number"
                      step="1000"
                      className="w-full"
                      value={addForm.notionalBase ?? ""}
                      onChange={(e) => {
                        const base = Number(e.target.value) || 0;
                        const spot = Number(addForm.spotPrice) || 1;
                        setAddForm((f) => ({ ...f, notionalBase: base, notionalQuote: Math.round(base * spot * 100) / 100 }));
                      }}
                    />
                  </div>
                  <div className="grid grid-cols-[minmax(0,160px)_1fr] gap-x-4 gap-y-1 items-center">
                    <Label className="text-right font-medium whitespace-nowrap">Notional ({addFormQuoteCcy})</Label>
                    <Input
                      type="number"
                      step="1000"
                      className="w-full"
                      value={addForm.notionalQuote ?? ""}
                      onChange={(e) => {
                        const quote = Number(e.target.value) || 0;
                        const spot = Number(addForm.spotPrice) || 1;
                        if (spot > 0) setAddForm((f) => ({ ...f, notionalQuote: quote, notionalBase: Math.round(quote / spot * 100) / 100 }));
                      }}
                    />
                  </div>
                  <div className="grid grid-cols-[minmax(0,160px)_1fr] gap-x-4 gap-y-1 items-center">
                    <Label className="text-right font-medium whitespace-nowrap">Quantity (%)</Label>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      className="w-full"
                      value={addForm.quantity ?? ""}
                      onChange={(e) => setAddForm((f) => ({ ...f, quantity: Math.min(100, Math.max(0, Number(e.target.value) || 0)) }))}
                    />
                  </div>
                  <div className="grid grid-cols-[minmax(0,160px)_1fr] gap-x-4"><span /><p className="text-xs text-muted-foreground">Volume hedged = Notional ({addFormBaseCcy}) × Quantity% = {(Number(addForm.notionalBase) || 0) * (Number(addForm.quantity) || 0) / 100} {addFormBaseCcy}</p></div>
                  <div className="grid grid-cols-[minmax(0,160px)_1fr] gap-x-4 gap-y-1 items-center">
                    <Label className="text-right font-medium whitespace-nowrap">Volatility (%)</Label>
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          step="0.1"
                          className="w-full"
                          value={addForm.volatility ?? ""}
                          onChange={(e) => setAddForm((f) => ({ ...f, volatility: parseFloat(e.target.value) || 0 }))}
                        />
                        {instrumentTypeUsesVolatility(addForm.type) && isPairMappableToFuturesInsights(addForm.currencyPair) && addForm.currencyPair && addForm.maturity && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={applyIvFromFuturesInsightsForAddForm}
                            disabled={fetchingIvFromFi}
                            className="shrink-0"
                          >
                            {fetchingIvFromFi ? "…" : "Apply IV from Futures"}
                          </Button>
                        )}
                      </div>
                      {instrumentTypeUsesVolatility(addForm.type) && isPairMappableToFuturesInsights(addForm.currencyPair) && (
                        <p className="text-xs text-muted-foreground">Strike × DTE → IV from Futures Insights (EUR/USD, GBP/USD, etc.)</p>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-[minmax(0,160px)_1fr] gap-x-4 gap-y-1 items-center">
                    <Label className="text-right font-medium whitespace-nowrap">{addFormQuoteCcy} rate (%)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      className="w-full"
                      value={addForm.domesticRate ?? ""}
                      onChange={(e) => {
                        setAddForm((f) => ({ ...f, domesticRate: parseFloat(e.target.value) ?? 0 }));
                        setAddFormRateOverrides((prev) => ({ ...prev, domestic: true }));
                      }}
                    />
                  </div>
                  <div className="grid grid-cols-[minmax(0,160px)_1fr] gap-x-4 gap-y-1 items-center">
                    <Label className="text-right font-medium whitespace-nowrap">{addFormBaseCcy} rate (%)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      className="w-full"
                      value={addForm.foreignRate ?? ""}
                      onChange={(e) => {
                        setAddForm((f) => ({ ...f, foreignRate: parseFloat(e.target.value) ?? 0 }));
                        setAddFormRateOverrides((prev) => ({ ...prev, foreign: true }));
                      }}
                    />
                  </div>
                  {/* Barrier - same logic as Pricers: show for knockout, knockin, touch */}
                  {(addForm.type.includes("knockout") || addForm.type.includes("knockin") || addForm.type.includes("touch")) && (
                    <div className="grid grid-cols-[minmax(0,160px)_1fr] gap-x-4 gap-y-1 items-center">
                      <Label htmlFor="barrier" className="text-right font-medium whitespace-nowrap">
                        {addForm.type.includes("touch") || addForm.type.includes("binary") ? "Barrier (trigger)" : "Barrier"}
                      </Label>
                      <div className="flex gap-2">
                        <Input
                          id="barrier"
                          type="number"
                          step="0.01"
                          value={addForm.barrier === "" ? "" : addForm.barrier}
                          onChange={(e) => setAddForm((f) => ({ ...f, barrier: e.target.value === "" ? "" : parseFloat(e.target.value) }))}
                          className="flex-1 min-w-0"
                        />
                        <Select value={addForm.barrierType} onValueChange={(v: "percent" | "absolute") => setAddForm((f) => ({ ...f, barrierType: v }))}>
                          <SelectTrigger className="w-20">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="percent">
                              <div className="flex items-center gap-1">
                                <Percent className="w-3 h-3" /> %
                              </div>
                            </SelectItem>
                            <SelectItem value="absolute">
                              <div className="flex items-center gap-1">
                                <Hash className="w-3 h-3" /> Abs
                              </div>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                  {/* Second Barrier - same as Pricers: show for double */}
                  {addForm.type.includes("double") && (
                    <div className="grid grid-cols-[minmax(0,160px)_1fr] gap-x-4 gap-y-1 items-center">
                      <Label htmlFor="secondBarrier" className="text-right font-medium whitespace-nowrap">
                        {addForm.type.includes("touch") || addForm.type.includes("binary") ? "Second Barrier (trigger)" : "Second Barrier"}
                      </Label>
                      <div className="flex gap-2">
                        <Input
                          id="secondBarrier"
                          type="number"
                          step="0.01"
                          value={addForm.secondBarrier === "" ? "" : addForm.secondBarrier}
                          onChange={(e) => setAddForm((f) => ({ ...f, secondBarrier: e.target.value === "" ? "" : parseFloat(e.target.value) }))}
                          className="flex-1 min-w-0"
                        />
                        <Select value={addForm.barrierType} onValueChange={(v: "percent" | "absolute") => setAddForm((f) => ({ ...f, barrierType: v }))}>
                          <SelectTrigger className="w-20">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="percent">
                              <div className="flex items-center gap-1">
                                <Percent className="w-3 h-3" /> %
                              </div>
                            </SelectItem>
                            <SelectItem value="absolute">
                              <div className="flex items-center gap-1">
                                <Hash className="w-3 h-3" /> Abs
                              </div>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                  {/* Rebate - same as Pricers: for touch and binary */}
                  {(addForm.type.includes("touch") || addForm.type.includes("binary")) && (
                    <>
                      <div className="grid grid-cols-[minmax(0,160px)_1fr] gap-x-4 gap-y-1 items-center">
                        <Label htmlFor="rebate" className="text-right font-medium whitespace-nowrap">Rebate (%)</Label>
                        <Input
                          id="rebate"
                          type="number"
                          step="0.1"
                          placeholder="100.0"
                          className="w-full"
                          value={addForm.rebate === "" ? "" : addForm.rebate}
                          onChange={(e) => setAddForm((f) => ({ ...f, rebate: e.target.value === "" ? "" : parseFloat(e.target.value) }))}
                        />
                      </div>
                      <div className="grid grid-cols-[minmax(0,160px)_1fr] gap-x-4"><span /><p className="text-xs text-muted-foreground">Rebate as % of notional (default 100%)</p></div>
                    </>
                  )}
                  {/* Pricing: theoretical + optional real price */}
                  <div className="border-t pt-4 mt-1 space-y-3">
                    <p className="text-xs font-medium text-muted-foreground">Pricing</p>
                  <div className="rounded-lg border bg-muted/40 p-3 space-y-1">
                    <div className="grid grid-cols-[minmax(0,160px)_1fr] gap-x-4 items-center">
                      <span className="text-sm font-medium text-muted-foreground text-right">Theoretical price</span>
                      <div className="font-mono font-semibold text-foreground break-all">
                        {addFormTheoreticalPrice != null ? `${addFormTheoreticalPrice.toFixed(6)} (quote/unit)` : "— Enter spot, maturity and params"}
                      </div>
                    </div>
                  </div>
                  </div>
                  <div className="grid grid-cols-[minmax(0,160px)_1fr] gap-x-4 gap-y-1 items-center">
                    <Label className="text-right font-medium whitespace-nowrap">Real price (optional)</Label>
                    <div>
                      <Input
                        type="number"
                        step="0.0001"
                        placeholder="Leave empty to use theoretical"
                        className="w-full"
                        value={addForm.realPrice === "" ? "" : addForm.realPrice}
                        onChange={(e) => setAddForm((f) => ({ ...f, realPrice: e.target.value === "" ? "" : parseFloat(e.target.value) }))}
                      />
                      <p className="text-xs text-muted-foreground mt-1">If filled, used for MTM (e.g. traded price). Otherwise theoretical.</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-[minmax(0,160px)_1fr] gap-x-4 gap-y-1 items-center">
                    <Label htmlFor="counterparty" className="text-right font-medium whitespace-nowrap">Counterparty</Label>
                    <Select value={addForm.counterparty} onValueChange={(v) => setAddForm((f) => ({ ...f, counterparty: v }))}>
                      <SelectTrigger className="w-full min-w-[180px]">
                        <SelectValue placeholder="Select counterparty" />
                      </SelectTrigger>
                      <SelectContent>
                        {counterpartyOptions.map((c) => (
                          <SelectItem key={c} value={c}>
                            {c}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-[minmax(0,160px)_1fr] gap-x-4 gap-y-1 items-center">
                    <Label htmlFor="portfolio" className="text-right font-medium whitespace-nowrap">Portfolio</Label>
                    <Select value={addForm.portfolioId ?? "__none__"} onValueChange={(v) => setAddForm((f) => ({ ...f, portfolioId: v === "__none__" ? undefined : v }))}>
                      <SelectTrigger className="w-full min-w-[180px]">
                        <SelectValue placeholder="No portfolio" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">No portfolio</SelectItem>
                        {portfolios.map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <DialogFooter>
                    <Button type="submit">Add Instrument</Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Display by portfolio and counterparty */}
          <div className="flex flex-wrap items-center gap-4 mb-4">
            <div className="flex items-center gap-2">
              <Label className="text-sm font-medium text-muted-foreground whitespace-nowrap">Search</Label>
              <Input
                value={instrumentSearchTerm}
                onChange={(e) => setInstrumentSearchTerm(e.target.value)}
                placeholder="ID, type, pair, counterparty..."
                className="w-[260px]"
              />
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-sm font-medium text-muted-foreground whitespace-nowrap">Display by portfolio</Label>
              <Select value={selectedPortfolioFilter} onValueChange={setSelectedPortfolioFilter}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All instruments</SelectItem>
                  <SelectItem value="__none__">No portfolio</SelectItem>
                  {portfolios.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-sm font-medium text-muted-foreground whitespace-nowrap">Display by counterparty</Label>
              <Select value={selectedCounterpartyFilter} onValueChange={setSelectedCounterpartyFilter}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All instruments</SelectItem>
                  {counterpartyOptions.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
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
                   <Table className="min-w-full border-collapse bg-background shadow-sm rounded-lg overflow-hidden [&_th]:whitespace-nowrap [&_td]:whitespace-nowrap">
                     <TableHeader className="bg-gradient-to-r from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
                       <TableRow className="border-b-2 border-slate-200 dark:border-slate-700">
                         {/* Fixed columns */}
                         <TableHead rowSpan={2} className="bg-slate-50 dark:bg-slate-900 font-semibold text-center border-r border-slate-200 dark:border-slate-700 min-w-[60px] sticky left-0 z-[5]">ID</TableHead>
                         <TableHead rowSpan={2} className="bg-slate-50 dark:bg-slate-900 font-semibold text-center border-r border-slate-200 dark:border-slate-700 min-w-[100px]">Type</TableHead>
                         <TableHead rowSpan={2} className="bg-slate-50 dark:bg-slate-900 font-semibold text-center border-r border-slate-200 dark:border-slate-700 min-w-[100px]">Currency Pair</TableHead>
                         <TableHead rowSpan={2} className="bg-slate-50 dark:bg-slate-900 font-semibold text-center border-r border-slate-200 dark:border-slate-700 min-w-[80px]">Quantity (%)</TableHead>
                         <TableHead rowSpan={2} className="bg-slate-50 dark:bg-slate-900 font-semibold text-center border-r border-slate-200 dark:border-slate-700 min-w-[100px]">Unit Price (Initial)</TableHead>
                         <TableHead rowSpan={2} className="bg-slate-50 dark:bg-slate-900 font-semibold text-center border-r border-slate-200 dark:border-slate-700 min-w-[100px]">Today Price</TableHead>
                         <TableHead rowSpan={2} className="bg-slate-50 dark:bg-slate-900 font-semibold text-center border-r border-slate-200 dark:border-slate-700 min-w-[100px]">MTM (Unit)</TableHead>
                         <TableHead rowSpan={2} className="bg-slate-50 dark:bg-slate-900 font-semibold text-center border-r border-slate-200 dark:border-slate-700 min-w-[100px]">MTM</TableHead>
                         
                         {/* Dynamic columns with conditional Export */}
                         <TableHead colSpan={showExportColumns ? 2 : 1} className="text-center border-b border-r border-slate-200 dark:border-slate-700 bg-blue-50 dark:bg-blue-900/20 font-semibold min-w-[120px]">Time to Maturity</TableHead>
                         <TableHead colSpan={showExportColumns ? 2 : 1} className="text-center border-b border-r border-slate-200 dark:border-slate-700 bg-green-50 dark:bg-green-900/20 font-semibold min-w-[100px]">Spot Price</TableHead>
                         <TableHead colSpan={showExportColumns ? 2 : 1} className="text-center border-b border-r border-slate-200 dark:border-slate-700 bg-yellow-50 dark:bg-yellow-900/20 font-semibold min-w-[100px]">Volatility (%)</TableHead>
                         <TableHead colSpan={showExportColumns ? 2 : 1} className="text-center border-b border-r border-slate-200 dark:border-slate-700 bg-purple-50 dark:bg-purple-900/20 font-semibold min-w-[120px]">Domestic Rate (%)</TableHead>
                         <TableHead colSpan={showExportColumns ? 2 : 1} className="text-center border-b border-r border-slate-200 dark:border-slate-700 bg-pink-50 dark:bg-pink-900/20 font-semibold min-w-[120px]">Foreign Rate (%)</TableHead>
                         <TableHead colSpan={showExportColumns ? 2 : 1} className="text-center border-b border-r border-slate-200 dark:border-slate-700 bg-indigo-50 dark:bg-indigo-900/20 font-semibold min-w-[120px]">Forward Price</TableHead>
                         <TableHead colSpan={showExportColumns ? 2 : 1} className="text-center border-b border-r border-slate-200 dark:border-slate-700 bg-orange-50 dark:bg-orange-900/20 font-semibold min-w-[120px]">Strike Analysis</TableHead>
                         
                         {/* Fixed end columns */}
                         <TableHead rowSpan={2} className="bg-slate-50 dark:bg-slate-900 font-semibold text-center border-r border-slate-200 dark:border-slate-700 min-w-[80px]">Barrier 1</TableHead>
                         <TableHead rowSpan={2} className="bg-slate-50 dark:bg-slate-900 font-semibold text-center border-r border-slate-200 dark:border-slate-700 min-w-[80px]">Barrier 2</TableHead>
                         <TableHead rowSpan={2} className="bg-slate-50 dark:bg-slate-900 font-semibold text-center border-r border-slate-200 dark:border-slate-700 min-w-[80px]">Rebate (%)</TableHead>
                         <TableHead rowSpan={2} className="bg-slate-50 dark:bg-slate-900 font-semibold text-center border-r border-slate-200 dark:border-slate-700 min-w-[80px]">Notional</TableHead>
                         <TableHead rowSpan={2} className="bg-slate-50 dark:bg-slate-900 font-semibold text-center border-r border-slate-200 dark:border-slate-700 min-w-[100px]">Total premium</TableHead>
                         <TableHead rowSpan={2} className="bg-slate-50 dark:bg-slate-900 font-semibold text-center border-r border-slate-200 dark:border-slate-700 min-w-[100px]">Maturity</TableHead>
                         <TableHead rowSpan={2} className="bg-slate-50 dark:bg-slate-900 font-semibold text-center border-r border-slate-200 dark:border-slate-700 min-w-[80px]">Status</TableHead>
                         <TableHead rowSpan={2} className="bg-slate-50 dark:bg-slate-900 font-semibold text-center min-w-[120px]">Actions</TableHead>
                    </TableRow>
                       <TableRow className="border-b border-slate-200 dark:border-slate-700">
                         {/* Sub-headers for dynamic columns */}
                         {showExportColumns && <TableHead className="text-xs text-blue-600 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/20 border-r border-slate-200 dark:border-slate-700 font-medium">Export</TableHead>}
                         <TableHead className="text-xs text-green-600 dark:text-green-300 bg-blue-50 dark:bg-blue-900/20 border-r border-slate-200 dark:border-slate-700 font-medium">Current</TableHead>
                         
                         {showExportColumns && <TableHead className="text-xs text-blue-600 dark:text-blue-300 bg-green-50 dark:bg-green-900/20 border-r border-slate-200 dark:border-slate-700 font-medium">Export</TableHead>}
                         <TableHead className="text-xs text-green-600 dark:text-green-300 bg-green-50 dark:bg-green-900/20 border-r border-slate-200 dark:border-slate-700 font-medium">Current</TableHead>
                         
                         {showExportColumns && <TableHead className="text-xs text-blue-600 dark:text-blue-300 bg-yellow-50 dark:bg-yellow-900/20 border-r border-slate-200 dark:border-slate-700 font-medium">Export</TableHead>}
                         <TableHead className="text-xs text-green-600 dark:text-green-300 bg-yellow-50 dark:bg-yellow-900/20 border-r border-slate-200 dark:border-slate-700 font-medium">Current</TableHead>
                         
                         {showExportColumns && <TableHead className="text-xs text-blue-600 dark:text-blue-300 bg-purple-50 dark:bg-purple-900/20 border-r border-slate-200 dark:border-slate-700 font-medium">Export</TableHead>}
                         <TableHead className="text-xs text-green-600 dark:text-green-300 bg-purple-50 dark:bg-purple-900/20 border-r border-slate-200 dark:border-slate-700 font-medium">Current</TableHead>
                         
                         {showExportColumns && <TableHead className="text-xs text-blue-600 dark:text-blue-300 bg-pink-50 dark:bg-pink-900/20 border-r border-slate-200 dark:border-slate-700 font-medium">Export</TableHead>}
                         <TableHead className="text-xs text-green-600 dark:text-green-300 bg-pink-50 dark:bg-pink-900/20 border-r border-slate-200 dark:border-slate-700 font-medium">Current</TableHead>
                         
                         {showExportColumns && <TableHead className="text-xs text-blue-600 dark:text-blue-300 bg-indigo-50 dark:bg-indigo-900/20 border-r border-slate-200 dark:border-slate-700 font-medium">Export</TableHead>}
                         <TableHead className="text-xs text-green-600 dark:text-green-300 bg-indigo-50 dark:bg-indigo-900/20 border-r border-slate-200 dark:border-slate-700 font-medium">Current</TableHead>
                         
                         {showExportColumns && <TableHead className="text-xs text-blue-600 dark:text-blue-300 bg-orange-50 dark:bg-orange-900/20 border-r border-slate-200 dark:border-slate-700 font-medium">Export</TableHead>}
                         <TableHead className="text-xs text-green-600 dark:text-green-400 bg-orange-50 dark:bg-orange-900/20 font-medium">Current</TableHead>
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
                          if (DEBUG_PRICING) console.log(`[DEBUG] ${instrument.id}: EXPIRED - Valuation Date (${valuationDate}) >= Maturity Date (${instrument.maturity}) - TTM = 0`);
                        } else {
                          // ✅ Calculer depuis la Valuation Date pour l'affichage Current
                          timeToMaturity = PricingService.calculateTimeToMaturity(instrument.maturity, valuationDate);
                          if (DEBUG_PRICING) console.log(`[DEBUG] ${instrument.id}: Time to Maturity - Display from Valuation Date ${valuationDate}: ${timeToMaturity.toFixed(4)}y, Export: ${instrument.exportTimeToMaturity ? instrument.exportTimeToMaturity.toFixed(4) + 'y' : 'N/A'}`);
                        }
                      } else {
                        console.warn(`No maturity date available for instrument ${instrument.id}`);
                        timeToMaturity = 0;
                      }
                      // Use implied volatility from Detailed Results if available, otherwise use component volatility
                      const volatility = instrument.impliedVolatility || instrument.volatility || 0;
                      // Calculate notional taking into account quantity (%)
                      // quantity is in percentage, so we multiply by (quantity / 100)
                      // For short positions (negative quantity), we use absolute value for notional calculation
                      const volumeToHedge = instrument.notional;
                      const quantityFactor = Math.abs(quantityToHedge) / 100;
                      const calculatedNotional = unitPrice * volumeToHedge * quantityFactor;
                      // Take into account quantity (%) in MTM calculation
                      const mtmWithQuantity = mtmValue * Math.abs(instrument.notional) * quantityFactor;
                      
                      return (
                         <TableRow
                           key={instrument.id}
                           className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 border-b border-slate-100 dark:border-slate-700 transition-all duration-200 group cursor-pointer"
                           onClick={(e) => {
                             const target = e.target as HTMLElement;
                             if (target.closest("button, input, a, [role='combobox']")) return;
                             navigate(`/hedging/${instrument.id}`);
                           }}
                         >
                           <TableCell className="font-semibold bg-slate-50/90 dark:bg-slate-900/90 border-r border-slate-200 dark:border-slate-700 text-center sticky left-0 z-[5] text-slate-700 dark:text-slate-200">
                             <div className="px-2 py-1 rounded-md bg-white dark:bg-slate-800 shadow-sm">
                               {instrument.id}
                             </div>
                           </TableCell>
                          <TableCell className="py-3">
                            <div className="flex items-center gap-3">
                              <div className="p-2 rounded-lg bg-slate-100/50 group-hover:bg-slate-200/50 transition-colors">
                              {getInstrumentIcon(instrument.type)}
                              </div>
                              <div className="font-medium text-slate-900 dark:text-slate-100">{instrument.type}</div>
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline" className="font-mono font-semibold px-3 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-700 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors">
                              {instrument.currency}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="inline-flex items-center justify-center px-3 py-1 rounded-full bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 font-mono font-semibold text-sm">
                            {quantityToHedge.toFixed(1)}%
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="font-mono text-slate-700 dark:text-slate-200 font-semibold">
                              {unitPrice > 0 ? unitPrice.toFixed(4) : 
                                <span className="text-slate-400 italic">N/A</span>
                              }
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className={`font-mono font-semibold ${todayPrice !== 0 ? "text-blue-600" : "text-slate-400"}`}>
                              {todayPrice !== 0 ? todayPrice.toFixed(4) : 'N/A'}
                            </div>
                          </TableCell>
                          {/* MTM (Unit) - MTM per unit price without quantity and notional */}
                          <TableCell className="text-right">
                            <div className={`inline-flex items-center justify-center px-3 py-1 rounded-lg font-mono font-semibold text-sm ${
                              mtmValue >= 0 
                                ? 'bg-green-50 text-green-700 border border-green-200 dark:bg-green-900/20 dark:text-green-300 dark:border-green-800/60'
                                : 'bg-red-50 text-red-700 border border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800/60'
                            }`}>
                              {Math.abs(mtmValue) > 0.0001 ? (mtmValue >= 0 ? '+' : '') + mtmValue.toFixed(4) : '0.0000'}
                            </div>
                          </TableCell>
                          {/* MTM (Total) - MTM with quantity and notional */}
                          <TableCell className="text-right">
                            <div className={`inline-flex items-center justify-center px-3 py-1 rounded-lg font-mono font-semibold ${
                              mtmWithQuantity >= 0 
                                ? 'bg-green-50 text-green-700 border border-green-200 dark:bg-green-900/20 dark:text-green-300 dark:border-green-800/60'
                                : 'bg-red-50 text-red-700 border border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800/60'
                            }`}>
                              {Math.abs(mtmWithQuantity) > 0.0001 ? (mtmWithQuantity >= 0 ? '+' : '') + formatCurrency(mtmWithQuantity, instrument.currency) : formatCurrency(0, instrument.currency)}
                            </div>
                          </TableCell>
                                                     {/* Time to Maturity - Export (conditional) */}
                           {showExportColumns && (
                             <TableCell className="font-mono text-center bg-blue-50 dark:bg-blue-900/20 border-r border-slate-200 dark:border-slate-700">
                              <div className="text-xs text-blue-600">
                              {instrument.exportTimeToMaturity ? 
                                `${instrument.exportTimeToMaturity.toFixed(4)}y` : 
                                'N/A'
                              }
                            </div>
                          </TableCell>
                           )}
                          
                          {/* Time to Maturity - Current */}
                           <TableCell className="text-center bg-green-50/80 dark:bg-green-900/20 border-r border-slate-200 dark:border-slate-700">
                            <div className={`text-sm font-mono font-semibold ${timeToMaturity === 0 ? 'text-red-600 dark:text-red-300' : 'text-green-700 dark:text-green-300'}`}>
                              {timeToMaturity.toFixed(4)}y
                            </div>
                          </TableCell>
                          
                                                     {/* Spot Price - Export (conditional) */}
                           {showExportColumns && (
                             <TableCell className="text-center bg-blue-50/80 dark:bg-blue-900/20 border-r border-slate-200 dark:border-slate-700">
                               <div className="text-sm font-mono font-semibold text-blue-700">
                              {instrument.exportSpotPrice ? 
                                instrument.exportSpotPrice.toFixed(6) : 
                                   <span className="text-blue-400 italic">N/A</span>
                              }
                            </div>
                          </TableCell>
                           )}
                          
                          {/* Spot Price - Current (debounced to avoid recalc on every keystroke) */}
                           <TableCell className="text-center bg-green-50/80 dark:bg-green-900/20 border-r border-slate-200 dark:border-slate-700">
                            {(() => {
                              const marketData = currencyMarketData[instrument.currency] || getMarketDataFromInstruments(instrument.currency) || MARKET_DEFAULTS;
                              const currentSpot = Number(instrument.impliedSpotPrice || marketData.spot) || 1;
                              const spotDisplayValue = editingTableCells[instrument.id]?.spot ?? (instrument.impliedSpotPrice != null ? String(instrument.impliedSpotPrice) : currentSpot.toFixed(6));
                              return (
                                <div className="space-y-1">
                                  <div className="flex items-center gap-1">
                                    <Input
                                      type="number"
                                      value={spotDisplayValue}
                                      onChange={(e) => {
                                        const raw = e.target.value;
                                        setEditingTableCells(prev => ({ ...prev, [instrument.id]: { ...prev[instrument.id], spot: raw } }));
                                        const id = instrument.id;
                                        if (debounceTimeoutsRef.current.spot[id]) clearTimeout(debounceTimeoutsRef.current.spot[id]);
                                        debounceTimeoutsRef.current.spot[id] = setTimeout(() => {
                                          const value = parseFloat(raw);
                                          if (!isNaN(value) && value > 0) {
                                            updateInstrumentSpotPrice(id, value);
                                            setEditingTableCells(prev => {
                                              const next = { ...prev };
                                              if (next[id]) { delete next[id].spot; if (Object.keys(next[id] || {}).length === 0) delete next[id]; }
                                              return next;
                                            });
                                          }
                                          delete debounceTimeoutsRef.current.spot[id];
                                        }, DEBOUNCE_MS);
                                      }}
                                      onBlur={() => {
                                        const id = instrument.id;
                                        if (debounceTimeoutsRef.current.spot[id]) {
                                          clearTimeout(debounceTimeoutsRef.current.spot[id]);
                                          delete debounceTimeoutsRef.current.spot[id];
                                        }
                                        const raw = editingTableCells[id]?.spot;
                                        if (raw !== undefined && raw !== '') {
                                          const value = parseFloat(raw);
                                          if (!isNaN(value) && value > 0) updateInstrumentSpotPrice(id, value);
                                        }
                                        setEditingTableCells(prev => {
                                          const next = { ...prev };
                                          if (next[id]) { delete next[id].spot; if (Object.keys(next[id] || {}).length === 0) delete next[id]; }
                                          return next;
                                        });
                                      }}
                                      placeholder={currentSpot.toFixed(6)}
                                      className="w-20 h-6 text-xs text-center bg-background border-green-200 dark:border-green-700 focus:border-green-400 focus:ring-green-400/20"
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
                                </div>
                              );
                            })()}
                          </TableCell>
                          
                                                     {/* Volatility - Export (conditional) */}
                           {showExportColumns && (
                             <TableCell className="text-center bg-blue-50/80 dark:bg-blue-900/20 border-r border-slate-200 dark:border-slate-700">
                               <div className="text-sm font-mono font-semibold text-blue-700">
                              {instrument.exportVolatility ? 
                                `${instrument.exportVolatility.toFixed(2)}%` : 
                                   <span className="text-blue-400 italic">N/A</span>
                              }
                            </div>
                          </TableCell>
                           )}
                          
                          {/* Volatility - Current (debounced to avoid recalc on every keystroke) */}
                           <TableCell className="text-center bg-green-50/80 dark:bg-green-900/20 border-r border-slate-200 dark:border-slate-700">
                            <div className="space-y-1">
                              <div className="flex items-center gap-1">
                                <Input
                                  type="number"
                                  value={editingTableCells[instrument.id]?.vol ?? (instrument.impliedVolatility != null ? String(instrument.impliedVolatility) : '')}
                                  onChange={(e) => {
                                    const raw = e.target.value;
                                    setEditingTableCells(prev => ({ ...prev, [instrument.id]: { ...prev[instrument.id], vol: raw } }));
                                    const id = instrument.id;
                                    if (debounceTimeoutsRef.current.vol[id]) clearTimeout(debounceTimeoutsRef.current.vol[id]);
                                    debounceTimeoutsRef.current.vol[id] = setTimeout(() => {
                                      const value = parseFloat(raw);
                                      if (!isNaN(value) && value >= 0 && value <= 100) {
                                        updateInstrumentVolatility(id, value);
                                        setEditingTableCells(prev => {
                                          const next = { ...prev };
                                          if (next[id]) { delete next[id].vol; if (Object.keys(next[id] || {}).length === 0) delete next[id]; }
                                          return next;
                                        });
                                      }
                                      delete debounceTimeoutsRef.current.vol[id];
                                    }, DEBOUNCE_MS);
                                  }}
                                  onBlur={() => {
                                    const id = instrument.id;
                                    if (debounceTimeoutsRef.current.vol[id]) {
                                      clearTimeout(debounceTimeoutsRef.current.vol[id]);
                                      delete debounceTimeoutsRef.current.vol[id];
                                    }
                                    const raw = editingTableCells[id]?.vol;
                                    if (raw !== undefined && raw !== '') {
                                      const value = parseFloat(raw);
                                      if (!isNaN(value) && value >= 0 && value <= 100) updateInstrumentVolatility(id, value);
                                    }
                                    setEditingTableCells(prev => {
                                      const next = { ...prev };
                                      if (next[id]) { delete next[id].vol; if (Object.keys(next[id] || {}).length === 0) delete next[id]; }
                                      return next;
                                    });
                                  }}
                                  placeholder={volatility.toFixed(1)}
                                  className="w-16 h-6 text-xs text-center bg-background border-green-200 dark:border-green-700 focus:border-green-400 focus:ring-green-400/20"
                                  step="0.1"
                                  min="0"
                                  max="100"
                                />
                                <span className="text-xs">%</span>
                                {instrumentTypeUsesVolatility(instrument.type) && isPairMappableToFuturesInsights(instrument.currency) && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-4 w-4 p-0 text-blue-600 hover:text-blue-700"
                                    onClick={async () => {
                                      const iv = await applyIvFromFuturesInsightsForInstrument(instrument);
                                      if (iv != null) {
                                        updateInstrumentVolatility(instrument.id, iv);
                                        setEditingTableCells(prev => ({ ...prev, [instrument.id]: { ...prev[instrument.id], vol: String(iv) } }));
                                        toast({ title: "IV applied", description: `Volatility ${iv.toFixed(2)}% from Futures Insights for ${instrument.currency}.` });
                                      } else {
                                        toast({ title: "IV unavailable", description: "Could not interpolate IV for this strike & DTE.", variant: "destructive" });
                                      }
                                    }}
                                    disabled={fetchingIvInstrumentId === instrument.id}
                                    title="Apply IV from Futures Insights (strike × DTE)"
                                  >
                                    {fetchingIvInstrumentId === instrument.id ? "…" : <BarChart3 className="w-3 h-3" />}
                                  </Button>
                                )}
                                {instrument.impliedVolatility != null && (
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
                            </div>
                          </TableCell>
                          
                                                     {/* Domestic Rate - Export (conditional) */}
                           {showExportColumns && (
                             <TableCell className="font-mono text-center bg-blue-50 dark:bg-blue-900/20 border-r border-slate-200 dark:border-slate-700">
                            <div className="text-xs text-blue-600">
                              {instrument.exportDomesticRate ? 
                                `${instrument.exportDomesticRate.toFixed(3)}%` : 
                                'N/A'
                              }
                                </div>
                          </TableCell>
                           )}
                          
                          {/* Domestic Rate - Current */}
                          <TableCell className="font-mono text-center bg-green-50 dark:bg-green-900/20">
                            {(() => {
                              const eff = getEffectiveRatesForInstrument(instrument);
                              return (
                                <div className="text-xs text-green-600 dark:text-green-300">{eff.domesticPct.toFixed(3)}%</div>
                              );
                            })()}
                          </TableCell>
                          
                                                     {/* Foreign Rate - Export (conditional) */}
                           {showExportColumns && (
                             <TableCell className="font-mono text-center bg-blue-50 dark:bg-blue-900/20 border-r border-slate-200 dark:border-slate-700">
                                <div className="text-xs text-blue-600">
                              {instrument.exportForeignRate ? 
                                `${instrument.exportForeignRate.toFixed(3)}%` : 
                                'N/A'
                              }
                                </div>
                          </TableCell>
                           )}
                          
                          {/* Foreign Rate - Current */}
                          <TableCell className="font-mono text-center bg-green-50 dark:bg-green-900/20">
                            {(() => {
                              const eff = getEffectiveRatesForInstrument(instrument);
                              return (
                                <div className="text-xs text-green-600 dark:text-green-300">{eff.foreignPct.toFixed(3)}%</div>
                              );
                            })()}
                          </TableCell>
                          
                                                     {/* Forward Price - Export (conditional) */}
                           {showExportColumns && (
                             <TableCell className="font-mono text-center bg-blue-50 dark:bg-blue-900/20 border-r border-slate-200 dark:border-slate-700">
                            <div className="text-xs text-blue-600">
                              {instrument.exportForwardPrice ? 
                                instrument.exportForwardPrice.toFixed(6) : 
                                'N/A'
                              }
                            </div>
                          </TableCell>
                           )}
                          
                          {/* Forward Price - Current */}
                          <TableCell className="font-mono text-center bg-green-50 dark:bg-green-900/20">
                            {(() => {
                              const marketData = currencyMarketData[instrument.currency] || getMarketDataFromInstruments(instrument.currency) || MARKET_DEFAULTS;
                              try {
                              const strategyStartDateObj = new Date(instrument.exportStrategyStartDate || strategyStartDate);
                              const calculationStartDate = new Date(strategyStartDateObj.getFullYear(), strategyStartDateObj.getMonth(), strategyStartDateObj.getDate());
                              const calculationStartDateStr = calculationStartDate.toISOString().split('T')[0];
                              const currentTimeToMat = PricingService.calculateTimeToMaturity(instrument.maturity, calculationStartDateStr);
                              const effFwd = getEffectiveRatesForInstrument(instrument);
                              const r_d = effFwd.r_d;
                              const r_f = effFwd.r_f;
                              const currentSpot = Number(instrument.impliedSpotPrice || marketData.spot) || 1;
                              const currentForward = PricingService.calculateFXForwardPrice(currentSpot, r_d, r_f, currentTimeToMat);
                              return (
                                <div className="text-xs text-green-600">
                                  {isFinite(currentForward) ? currentForward.toFixed(6) : 'N/A'}
                                </div>
                              );
                              } catch { return <div className="text-xs text-slate-400">N/A</div>; }
                            })()}
                          </TableCell>
                          
                                                     {/* Strike - Export (conditional) */}
                           {showExportColumns && (
                             <TableCell className="font-mono text-center bg-blue-50 dark:bg-blue-900/20 border-r border-slate-200 dark:border-slate-700">
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
                          </TableCell>
                           )}
                          
                          {/* Strike - Current */}
                          <TableCell className="font-mono text-center bg-green-50 dark:bg-green-900/20">
                            <div className="text-xs text-green-600">
                            {instrument.strike ? instrument.strike.toFixed(4) : 'N/A'}
                            </div>
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
                            {formatCurrency(volumeToHedge, instrument.currency)}
                          </TableCell>
                          <TableCell className="font-mono text-right">
                            {calculatedNotional > 0 ? formatCurrency(calculatedNotional, instrument.currency) : formatCurrency(instrument.notional * quantityFactor, instrument.currency)}
                          </TableCell>
                          <TableCell>{instrument.maturity}</TableCell>
                        <TableCell>{getStatusBadge(calculateInstrumentStatus(instrument))}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              title="View Details"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/hedging/${instrument.id}`);
                              }}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              title="Edit"
                              onClick={(e) => {
                                e.stopPropagation();
                                editInstrument(instrument);
                              }}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              title="Delete"
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteInstrument(instrument.id);
                              }}
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
                  <p className="text-sm text-muted-foreground">{formatCurrency(selectedInstrument.notional, selectedInstrument.currency)}</p>
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

      <Dialog open={csvImportReportOpen} onOpenChange={setCsvImportReportOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>CSV import report</DialogTitle>
            <DialogDescription>
              {csvImportReport.imported > 0
                ? `${csvImportReport.imported} instrument(s) imported.`
                : "No instruments were imported."}
              {(csvImportReport.headerErrors.length > 0 || csvImportReport.rowErrors.length > 0) &&
                " Fix the issues below and try again for skipped rows."}
            </DialogDescription>
          </DialogHeader>
          {csvImportReport.headerErrors.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-destructive">Header / file errors</p>
              <ul className="list-disc pl-5 text-sm text-muted-foreground">
                {csvImportReport.headerErrors.map((msg, i) => (
                  <li key={i}>{msg}</li>
                ))}
              </ul>
            </div>
          )}
          {csvImportReport.rowErrors.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Row errors</p>
              <div className="max-h-48 overflow-y-auto rounded-md border bg-muted/30 p-3 text-sm">
                <ul className="space-y-1">
                  {csvImportReport.rowErrors.map((err, i) => (
                    <li key={i}>
                      <span className="font-mono text-xs">Row {err.row}:</span> {err.msg}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button type="button" onClick={() => setCsvImportReportOpen(false)}>
              Close
            </Button>
          </DialogFooter>
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