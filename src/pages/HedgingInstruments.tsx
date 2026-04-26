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
import { CURRENCY_PAIRS } from "@/constants/currencyPairs";
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
  Hash,
  Lock,
  Unlock
} from "lucide-react";
import StrategyImportService, { HedgingInstrument, HedgingPortfolio, HedgingCounterparty, HedgingStrategy, type HedgeRequest } from "@/services/StrategyImportService";
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
import { ExcelColumnFilter } from "@/components/ExcelColumnFilter";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ReferenceLine } from "recharts";
// ✅ IMPORT EXACT DES FONCTIONS EXPORTÉES D'INDEX.TSX UTILISÉES PAR STRATEGY BUILDER
import {
  calculateBarrierOptionPrice,
  calculateBarrierOptionClosedForm,
  calculateDigitalOptionPrice,
  calculateGarmanKohlhagenPrice,
  calculateVanillaOptionMonteCarlo,
  calculateStrategyPayoffAtPrice,
  erf
} from "@/pages/Index";

// Interface pour les paramètres de marché par devise
interface CurrencyMarketData {
  spot: number;
  volatility: number;
  domesticRate: number;
  foreignRate: number;
}

function normalizeOptionType(raw: string): string {
  return String(raw || "").toLowerCase().trim().replace(/\s+/g, "-");
}

function mapBarrierGreeksType(type: string): string | null {
  const t = normalizeOptionType(type);
  if (!t.includes("knock")) return null;
  if (t.includes("double")) {
    if (t.includes("call") && (t.includes("knock-out") || t.includes("knockout"))) return "call-double-knockout";
    if (t.includes("put") && (t.includes("knock-out") || t.includes("knockout"))) return "put-double-knockout";
    if (t.includes("call") && (t.includes("knock-in") || t.includes("knockin"))) return "call-double-knockin";
    if (t.includes("put") && (t.includes("knock-in") || t.includes("knockin"))) return "put-double-knockin";
    return null;
  }
  if (t.includes("call") && t.includes("reverse")) return "call-reverse-knockout";
  if (t.includes("put") && t.includes("reverse")) return "put-reverse-knockout";
  if (t.includes("call") && (t.includes("knock-out") || t.includes("knockout"))) return "call-knockout";
  if (t.includes("put") && (t.includes("knock-out") || t.includes("knockout"))) return "put-knockout";
  if (t.includes("call") && (t.includes("knock-in") || t.includes("knockin"))) return "call-knockin";
  if (t.includes("put") && (t.includes("knock-in") || t.includes("knockin"))) return "put-knockin";
  return null;
}

function isDigitalOptionType(type: string): boolean {
  const t = normalizeOptionType(type);
  return t.includes("touch") || t.includes("binary") || t.includes("digital");
}

function mapVanillaGreeksType(type: string): "call" | "put" | null {
  const t = normalizeOptionType(type);
  if (t.includes("knock") || isDigitalOptionType(type)) return null;
  if (t.includes("call")) return "call";
  if (t.includes("put")) return "put";
  return null;
}

export default function HedgingInstruments() {
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
  const [viewMode, setViewMode] = useState<"instrument" | "strategy" | "exposure">("instrument");
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
  const [strategies, setStrategies] = useState<HedgingStrategy[]>(() => importService.getHedgingStrategies());
  const [hedgeRequests, setHedgeRequests] = useState<HedgeRequest[]>(() => importService.getHedgeRequests());
  const [portfolios, setPortfolios] = useState<HedgingPortfolio[]>(() => importService.getPortfolios());
  const [counterparties, setCounterparties] = useState<HedgingCounterparty[]>(() => importService.getCounterparties());
  const [selectedPortfolioFilter, setSelectedPortfolioFilter] = useState<string>("__all__"); // "__all__" | "__none__" | portfolioId
  const [selectedCounterpartyFilter, setSelectedCounterpartyFilter] = useState<string>("__all__"); // "__all__" | counterparty name
  const [selectedStrategyFilter, setSelectedStrategyFilter] = useState<string>("__all__"); // "__all__" | strategyId
  const [instrumentSearchTerm, setInstrumentSearchTerm] = useState("");

  const [columnFilters, setColumnFilters] = useState<{
    type: string[];
    pair: string[];
    counterparty: string[];
    portfolioId: string[];
    status: string[];
  }>({ type: [], pair: [], counterparty: [], portfolioId: [], status: [] });
  const [expandedStrategies, setExpandedStrategies] = useState<Record<string, boolean>>({});
  const [showPayoffByStrategy, setShowPayoffByStrategy] = useState<Record<string, boolean>>({});
  // Strategy options filtered to avoid deleted/matured duplicates
  const strategyOptions = React.useMemo(() => {
    const todayYmd = new Date().toISOString().split("T")[0];
    const hasActiveInstrumentByStrategy: Record<string, { hasActive: boolean; latestMaturity: string }> = {};
    for (const inst of instruments) {
      const sid = inst.strategyId || "HSTRAT-UNASSIGNED";
      const mat = String(inst.maturity || "");
      const latest = hasActiveInstrumentByStrategy[sid]?.latestMaturity || "";
      const isActive = mat >= todayYmd;
      if (!hasActiveInstrumentByStrategy[sid]) {
        hasActiveInstrumentByStrategy[sid] = { hasActive: isActive, latestMaturity: mat };
      } else {
        if (mat > latest) hasActiveInstrumentByStrategy[sid].latestMaturity = mat;
        hasActiveInstrumentByStrategy[sid].hasActive ||= isActive;
      }
    }
    // Keep unassigned sentinel
    const baseList = strategies.filter((s) => s.id === "HSTRAT-UNASSIGNED" || hasActiveInstrumentByStrategy[s.id]?.hasActive);
    // De-duplicate by name, keep the one with most recent maturity
    const byName = new Map<string, HedgingStrategy>();
    for (const s of baseList) {
      const key = (s.name || "").trim().toLowerCase();
      const prev = byName.get(key);
      if (!prev) {
        byName.set(key, s);
      } else {
        const prevLatest = hasActiveInstrumentByStrategy[prev.id]?.latestMaturity || "";
        const curLatest = hasActiveInstrumentByStrategy[s.id]?.latestMaturity || "";
        if (curLatest > prevLatest) byName.set(key, s);
      }
    }
    return Array.from(byName.values()).sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }, [strategies, instruments]);

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

  // Exposures for "By exposure" view
  type FxExposure = {
    id?: string;
    date?: string | Date;
    currency: string;
    hedgeCurrency?: string;
    amount: number;
    type: "receivable" | "payable";
    maturity: string | Date;
    description?: string;
    subsidiary?: string;
  };
  const [exposures, setExposures] = useState<FxExposure[]>(() => {
    try {
      const raw = localStorage.getItem("fxExposures");
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  useEffect(() => {
    const reload = () => {
      try {
        const raw = localStorage.getItem("fxExposures");
        setExposures(raw ? JSON.parse(raw) : []);
      } catch {}
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === "fxExposures") reload();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("hedgingInstrumentsUpdated", reload as EventListener);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("hedgingInstrumentsUpdated", reload as EventListener);
    };
  }, []);
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

  // Keep HedgeRequests in sync (used by "By exposure" view)
  useEffect(() => {
    const sync = () => {
      try {
        setHedgeRequests(importService.getHedgeRequests());
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("storage", sync);
    window.addEventListener("hedgingInstrumentsUpdated", sync as EventListener);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("hedgingInstrumentsUpdated", sync as EventListener);
    };
  }, [importService]);

  // Helper to persist custom currency pairs
  const saveCustomPairs = React.useCallback((
    pairs: Array<{ symbol: string; name: string; base?: string; quote?: string; defaultSpotRate?: number }>
  ) => {
    setCustomCurrencyPairs(pairs);
    try {
      localStorage.setItem("customCurrencyPairs", JSON.stringify(pairs));
    } catch {
      /* ignore */
    }
  }, []);

  // Ensure a pair exists (create custom if missing), infer spot from reverse when available
  const ensurePairExists = React.useCallback((
    base: string,
    quote: string,
    fallbackSpot: number
  ): { symbol: string; name: string; base?: string; quote?: string; defaultSpotRate: number } => {
    const b = String(base || "").toUpperCase();
    const q = String(quote || "").toUpperCase();
    const all = [...CURRENCY_PAIRS, ...customCurrencyPairs];
    const directSymbol = `${b}/${q}`;
    const direct = all.find(p => p.symbol === directSymbol) as any;
    if (direct) {
      const ds = Number((direct as any).defaultSpotRate ?? fallbackSpot ?? 1);
      return { ...direct, defaultSpotRate: isFinite(ds) && ds > 0 ? ds : 1 };
    }
    const reverseSymbol = `${q}/${b}`;
    const reverse = all.find(p => p.symbol === reverseSymbol) as any;
    const inferred = reverse?.defaultSpotRate && reverse.defaultSpotRate > 0
      ? 1 / reverse.defaultSpotRate
      : (isFinite(fallbackSpot) && fallbackSpot > 0 ? fallbackSpot : 1);
    const synthetic = { symbol: directSymbol, name: `${b}/${q}`, base: b, quote: q, defaultSpotRate: inferred, category: "others" as const };
    saveCustomPairs([...customCurrencyPairs, synthetic]);
    return synthetic as any;
  }, [customCurrencyPairs, saveCustomPairs]);

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
    rebate: "" as number | string,
    realPrice: "" as string | number, // optional: user-entered real traded price (overrides theoretical)
    portfolioId: undefined as string | undefined,
    strategyMode: "new" as "existing" | "new",
    strategyId: "HSTRAT-UNASSIGNED" as string,
    newStrategyName: "" as string,
    // Link to exposure hedge campaign (HedgeRequest)
    exposureId: "" as string,
    hedgeRequestId: "" as string,
  }));
  const [addFormRateOverrides, setAddFormRateOverrides] = useState<{ domestic: boolean; foreign: boolean }>({
    domestic: false,
    foreign: false,
  });

  // Edit Instrument form state (same UI/logic as Add Instrument)
  const [editForm, setEditForm] = useState(() => ({
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
    rebate: "" as number | string,
    realPrice: "" as string | number,
    portfolioId: undefined as string | undefined,
    strategyMode: "existing" as "existing" | "new",
    strategyId: "HSTRAT-UNASSIGNED" as string,
    newStrategyName: "" as string,
    exposureId: "" as string,
    hedgeRequestId: "" as string,
  }));
  const [editFormRateOverrides, setEditFormRateOverrides] = useState<{ domestic: boolean; foreign: boolean }>({
    domestic: false,
    foreign: false,
  });

  // Sync strategies from service (migration runs there).
  useEffect(() => {
    setStrategies(importService.getHedgingStrategies());
    setHedgeRequests(importService.getHedgeRequests());
  }, [importService]);

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

  const editFormTheoreticalPrice = useMemo(() => {
    const spot = Number(editForm.spotPrice);
    const maturity = editForm.maturity;
    if (!maturity || isNaN(spot) || spot <= 0) return null;
    const valDate = valuationDate || new Date().toISOString().split("T")[0];
    const t = PricingService.calculateTimeToMaturity(maturity, valDate);
    if (t <= 0) return null;
    const r_d = (Number(editForm.domesticRate) || 0) / 100;
    const r_f = (Number(editForm.foreignRate) || 0) / 100;
    const sigma = (Number(editForm.volatility) || 0) / 100;
    const K = editForm.strikeType === "percent" ? spot * (Number(editForm.strike) || 0) / 100 : (Number(editForm.strike) || spot);
    const S = PricingService.calculateFXForwardPrice(spot, r_d, r_f, t);
    const opt = editForm.type.toLowerCase();
    try {
      if (opt === "forward") return S - K;
      if (opt === "swap") return S - K;
      if (opt.includes("knockout") || opt.includes("knockin") || opt.includes("knock-out") || opt.includes("knock-in")) {
        const b = editForm.barrierType === "percent" && editForm.barrier !== "" ? spot * (Number(editForm.barrier) / 100) : (Number(editForm.barrier) || 0);
        const b2 = editForm.barrierType === "percent" && editForm.secondBarrier !== "" ? spot * (Number(editForm.secondBarrier) / 100) : (Number(editForm.secondBarrier) || undefined);
        let pricingType = "";
        if (opt.includes("double")) {
          if (opt.includes("call")) pricingType = opt.includes("knock-out") || opt.includes("knockout") ? "call-double-knockout" : "call-double-knockin";
          else if (opt.includes("put")) pricingType = opt.includes("knock-out") || opt.includes("knockout") ? "put-double-knockout" : "put-double-knockin";
        } else if (opt.includes("call")) pricingType = opt.includes("reverse") ? "call-reverse-knockout" : "call-knockout";
        else if (opt.includes("put")) pricingType = opt.includes("reverse") ? "put-reverse-knockout" : "put-knockout";
        if (pricingType) return PricingService.calculateBarrierOptionClosedForm(pricingType, S, K, r_d, t, sigma, b, b2, r_f);
      }
      if (opt.includes("touch") || opt.includes("binary") || opt.includes("digital")) {
        const barrier = editForm.barrierType === "percent" && editForm.barrier !== "" ? spot * (Number(editForm.barrier) / 100) : (Number(editForm.barrier) || K);
        const secondBarrier = editForm.barrierType === "percent" && editForm.secondBarrier !== "" ? spot * (Number(editForm.secondBarrier) / 100) : (Number(editForm.secondBarrier) || undefined);
        const rebatePct = Number(editForm.rebate) || 100;
        return PricingService.calculateDigitalOptionPrice(opt, S, K, r_d, r_f, t, sigma, barrier, secondBarrier, 2000, rebatePct, true);
      }
      if (opt === "vanilla call" || opt === "call") return PricingService.calculateGarmanKohlhagenPrice("call", spot, K, r_d, r_f, t, sigma);
      if (opt === "vanilla put" || opt === "put") return PricingService.calculateGarmanKohlhagenPrice("put", spot, K, r_d, r_f, t, sigma);
    } catch (_) {}
    return null;
  }, [editForm.spotPrice, editForm.maturity, editForm.domesticRate, editForm.foreignRate, editForm.volatility, editForm.strike, editForm.strikeType, editForm.type, editForm.barrier, editForm.secondBarrier, editForm.barrierType, editForm.rebate, valuationDate]);

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

  const editFormBaseCcy = useMemo(() => {
    if (!editForm.currencyPair) return "base";
    const pair = [...CURRENCY_PAIRS, ...customCurrencyPairs].find((p: { symbol: string; base?: string; quote?: string }) => p.symbol === editForm.currencyPair);
    return pair?.base ?? editForm.currencyPair.split("/")[0] ?? "base";
  }, [editForm.currencyPair, customCurrencyPairs]);
  const editFormQuoteCcy = useMemo(() => {
    if (!editForm.currencyPair) return "quote";
    const pair = [...CURRENCY_PAIRS, ...customCurrencyPairs].find((p: { symbol: string; base?: string; quote?: string }) => p.symbol === editForm.currencyPair);
    return pair?.quote ?? editForm.currencyPair.split("/")[1] ?? "quote";
  }, [editForm.currencyPair, customCurrencyPairs]);

  const editFormBaseForCurve = useMemo(
    () => (/^[A-Z]{3}$/.test(editFormBaseCcy) ? editFormBaseCcy : "EUR"),
    [editFormBaseCcy]
  );
  const editFormQuoteForCurve = useMemo(
    () => (/^[A-Z]{3}$/.test(editFormQuoteCcy) ? editFormQuoteCcy : "USD"),
    [editFormQuoteCcy]
  );

  const editDomesticCurve = useRateExplorerDiscountFactors(editFormQuoteForCurve, "cubic_spline");
  const editForeignCurve = useRateExplorerDiscountFactors(editFormBaseForCurve, "cubic_spline");

  const editFormTimeToMaturity = useMemo(() => {
    if (!editForm.maturity) return 0;
    return PricingService.calculateTimeToMaturity(editForm.maturity, valuationDate);
  }, [editForm.maturity, valuationDate]);

  const interpolatedEditDomestic = useMemo(() => {
    if (!editDomesticCurve.discountFactors || editFormTimeToMaturity <= 0) return null;
    return interpolateAtTenor(editDomesticCurve.discountFactors, editFormTimeToMaturity);
  }, [editDomesticCurve.discountFactors, editFormTimeToMaturity]);

  const interpolatedEditForeign = useMemo(() => {
    if (!editForeignCurve.discountFactors || editFormTimeToMaturity <= 0) return null;
    return interpolateAtTenor(editForeignCurve.discountFactors, editFormTimeToMaturity);
  }, [editForeignCurve.discountFactors, editFormTimeToMaturity]);

  useEffect(() => {
    if (readPricingInterestRateSource() !== "bootstrapping") return;

    const nextDomestic = interpolatedEditDomestic ? interpolatedEditDomestic.zeroRate * 100 : null;
    const nextForeign = interpolatedEditForeign ? interpolatedEditForeign.zeroRate * 100 : null;
    const eps = 1e-7;

    setEditForm((prev) => {
      let updated = prev;
      if (nextDomestic !== null && !editFormRateOverrides.domestic) {
        if (Math.abs((prev.domesticRate || 0) - nextDomestic) > eps) {
          updated = { ...updated, domesticRate: nextDomestic };
        }
      }
      if (nextForeign !== null && !editFormRateOverrides.foreign) {
        if (Math.abs((prev.foreignRate || 0) - nextForeign) > eps) {
          updated = { ...updated, foreignRate: nextForeign };
        }
      }
      return updated;
    });
  }, [
    interpolatedEditDomestic?.zeroRate,
    interpolatedEditForeign?.zeroRate,
    editFormRateOverrides.domestic,
    editFormRateOverrides.foreign,
  ]);

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

  // Manual spot override locks (simulation): when locked, auto-sync won't overwrite spot.
  const [marketSpotLocks, setMarketSpotLocks] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem("currencyMarketSpotLocks");
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const setSpotLock = (currency: string, locked: boolean) => {
    setMarketSpotLocks((prev) => {
      const next = { ...prev, [currency]: locked };
      try {
        localStorage.setItem("currencyMarketSpotLocks", JSON.stringify(next));
      } catch {}
      return next;
    });
  };

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
  const [hasComputedMTM, setHasComputedMTM] = useState(false);
  const [mtmLastUpdatedAt, setMtmLastUpdatedAt] = useState<number | null>(() => {
    try {
      const raw = localStorage.getItem("hedgingMTMTotal");
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const ts = Number(parsed?.updatedAt);
      return Number.isFinite(ts) && ts > 0 ? ts : null;
    } catch {
      return null;
    }
  });

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
      
      // Initialize non-spot market params (vol/rates) from export.
      // Spot should follow Strategy Builder (snapshot/API) and must not be overwritten by export implicitly.
      const uniqueCurrencies = getUniqueCurrencies(loadedInstruments);
      setCurrencyMarketData(prevData => {
        const newData = { ...prevData };
        let hasUpdates = false;
        
        uniqueCurrencies.forEach(currency => {
          const exportData = getMarketDataFromInstruments(currency);
          if (exportData) {
            const currentData = newData[currency];
            const next: CurrencyMarketData = {
              ...MARKET_DEFAULTS,
              ...(currentData || {}),
              volatility: exportData.volatility,
              domesticRate: exportData.domesticRate,
              foreignRate: exportData.foreignRate,
            };
            const changed =
              !currentData ||
              currentData.volatility !== next.volatility ||
              currentData.domesticRate !== next.domesticRate ||
              currentData.foreignRate !== next.foreignRate;
            if (!changed) return;

            console.log(`[DEBUG] Updating market data (non-spot) for ${currency} with export data:`, exportData);
            newData[currency] = next;
            hasUpdates = true;
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
          if (marketSpotLocks[pair]) continue;
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
    [baseCurrency, instruments, marketSpotLocks]
  );

  // Live sync with Forex Market snapshot + refresh if stale (Forex page refreshes every 30s)
  React.useEffect(() => {
    // Do not do any automatic market sync until the user explicitly triggers a valuation.
    if (!hasComputedMTM) return;
    if (instruments.length === 0) return;
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
  }, [hasComputedMTM, instruments.length, baseCurrency, exchangeRateService, applyForexMarketSnapshotToState]);

  // Synchronize spot price and rates with market data on initial load
  const hasSyncedOnMount = React.useRef(false);
  React.useEffect(() => {
    // Only sync once on initial mount
    if (hasSyncedOnMount.current) return;
    // Do not auto-sync at mount; wait for a manual valuation.
    if (!hasComputedMTM) return;
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
          
          if (!marketSpotLocks[currencyPair] && realTimeSpot !== null && !isNaN(realTimeSpot) && realTimeSpot > 0) {
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
  }, [hasComputedMTM, instruments.length]); // Run only after first manual valuation

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

    if (field === "spot") {
      // Manual simulation override: lock this spot against auto-sync.
      setSpotLock(currency, true);
    }

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

  const applyIvFromFuturesInsightsForEditForm = async () => {
    if (!editForm.currencyPair || !editForm.maturity || !isPairMappableToFuturesInsights(editForm.currencyPair)) return;
    if (!instrumentTypeUsesVolatility(editForm.type)) return;
    setFetchingIvFromFi(true);
    try {
      const currenciesRes = await fetchCurrencies(false);
      if (!currenciesRes.success || !currenciesRes.data?.length) {
        toast({ title: "Futures Insights", description: "Could not load futures list.", variant: "destructive" });
        return;
      }
      const contract = getFuturesContractForPair(editForm.currencyPair, currenciesRes.data);
      if (!contract) {
        toast({ title: "No mapping", description: `No Futures contract for ${editForm.currencyPair}.`, variant: "destructive" });
        return;
      }
      const surfaceRes = await fetchVolSurface(contract, contract, 50, false, undefined, undefined);
      if (!surfaceRes.success || !surfaceRes.surfacePoints?.length) {
        toast({ title: "Surface fetch failed", description: surfaceRes.error || "Could not load vol surface.", variant: "destructive" });
        return;
      }
      const points: SurfacePoint[] = surfaceRes.surfacePoints;
      const optionTypeForSurface: "call" | "put" =
        editForm.type === "put" || editForm.type.startsWith("put-") ? "put" : "call";
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
        editForm.strikeType === "percent"
          ? (Number(editForm.spotPrice) || 0) * (Number(editForm.strike) || 0) / 100
          : Number(editForm.strike) || 0;
      const valDate = valuationDate || new Date().toISOString().split("T")[0];
      const dte = Math.max(0, Math.round(PricingService.calculateTimeToMaturity(editForm.maturity, valDate) * 365));
      const interpolated = interpolateVolSurfacePoint(strikes, dtes, z, strikeAbs, dte);
      if (!interpolated || !Number.isFinite(interpolated) || interpolated <= 0) {
        toast({ title: "IV not found", description: "Could not interpolate implied volatility.", variant: "destructive" });
        return;
      }
      setEditForm((f) => ({ ...f, volatility: interpolated }));
      toast({ title: "IV applied", description: `Volatility updated to ${interpolated.toFixed(2)}%` });
    } catch (err) {
      console.error("Futures Insights IV (edit) failed:", err);
      toast({ title: "Futures Insights", description: "IV fetch failed.", variant: "destructive" });
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

  const getDefaultSpotLikeStrategyBuilder = React.useCallback(
    async (pairSymbol: string): Promise<number | null> => {
      try {
        const snap = readForexMarketRateSnapshot();
        if (snap && snap.base === baseCurrency && snap.rates) {
          const s = computeSpotForCurrencyPair(pairSymbol, snap.base, snap.rates);
          if (s != null && Number.isFinite(Number(s)) && Number(s) > 0) return Number(s);
        }

        const exchangeData = await exchangeRateService.getExchangeRates(baseCurrency);
        const rates = exchangeData?.rates || {};
        const [base, quote] = String(pairSymbol || "").split("/");
        if (!base || !quote) return null;
        if (base === baseCurrency) return Number(rates[quote] ?? null);
        if (quote === baseCurrency) return rates[base] ? 1 / Number(rates[base]) : null;
        const baseRate = Number(rates[base] ?? 1);
        const quoteRate = Number(rates[quote] ?? 1);
        const cross = quoteRate / baseRate;
        return Number.isFinite(cross) && cross > 0 ? cross : null;
      } catch {
        return null;
      }
    },
    [baseCurrency, exchangeRateService]
  );

  // Seed global market spot defaults to match Strategy Builder behavior (live snapshot / FX rates).
  // This avoids showing "exportSpotPrice" as the default global spot unless explicitly refreshed from export.
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const pairs = getUniqueCurrencies(instruments);
      if (pairs.length === 0) return;

      // Determine which pairs need a seeded spot.
      const needs = pairs.filter((p) => {
        if (marketSpotLocks[p]) return false;
        const cur = currencyMarketData[p];
        const s = Number(cur?.spot);
        return !(Number.isFinite(s) && s > 0);
      });
      if (needs.length === 0) return;

      // Prefer snapshot if present (same as Forex Market).
      const snap = readForexMarketRateSnapshot();
      const fromSnap: Record<string, number> = {};
      if (snap && snap.base && snap.rates) {
        for (const p of needs) {
          const s = computeSpotForCurrencyPair(p, snap.base, snap.rates);
          if (s != null && Number.isFinite(Number(s)) && Number(s) > 0) fromSnap[p] = Number(s);
        }
      }

      // For any missing, fall back to Strategy Builder style API rate.
      const fromApi: Record<string, number> = {};
      const remaining = needs.filter((p) => fromSnap[p] == null);
      if (remaining.length > 0) {
        try {
          const exchangeData = await exchangeRateService.getExchangeRates(baseCurrency);
          const rates = exchangeData?.rates || {};
          for (const pairSymbol of remaining) {
            const [base, quote] = String(pairSymbol || "").split("/");
            if (!base || !quote) continue;
            let spot: number | null = null;
            if (base === baseCurrency) spot = Number(rates[quote] ?? null);
            else if (quote === baseCurrency) spot = rates[base] ? 1 / Number(rates[base]) : null;
            else {
              const baseRate = Number(rates[base] ?? 1);
              const quoteRate = Number(rates[quote] ?? 1);
              const cross = quoteRate / baseRate;
              spot = Number.isFinite(cross) && cross > 0 ? cross : null;
            }
            if (spot != null && Number.isFinite(spot) && spot > 0) fromApi[pairSymbol] = spot;
          }
        } catch {
          // ignore
        }
      }

      if (cancelled) return;
      setCurrencyMarketData((prev) => {
        let changed = false;
        const next = { ...prev };
        for (const p of needs) {
          const spot =
            fromSnap[p] ??
            fromApi[p] ??
            (() => {
              const pair = [...CURRENCY_PAIRS, ...customCurrencyPairs].find((x) => x.symbol === p) as any;
              const d = Number(pair?.defaultSpotRate);
              return Number.isFinite(d) && d > 0 ? d : null;
            })();
          if (spot == null) continue;
          const cur = next[p] || MARKET_DEFAULTS;
          const curSpot = Number(cur.spot);
          if (Number.isFinite(curSpot) && Math.abs(curSpot - spot) < 1e-12) continue;
          next[p] = { ...MARKET_DEFAULTS, ...cur, spot };
          changed = true;
        }
        if (!changed) return prev;
        try {
          localStorage.setItem("currencyMarketData", JSON.stringify(next));
        } catch {}
        return next;
      });
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [baseCurrency, customCurrencyPairs, currencyMarketData, exchangeRateService, instruments, marketSpotLocks]);

  /** Refresh market data for one currency (default = Strategy Builder spot; does not overwrite locked spots). */
  const refreshMarketDataForCurrency = async (currency: string) => {
    const fromInstruments = getMarketDataFromInstruments(currency);
    const current = currencyMarketData[currency] || { spot: 1.0, volatility: 20, domesticRate: 1.0, foreignRate: 1.0 };
    const spot =
      marketSpotLocks[currency]
        ? (Number(current.spot) || 1.0)
        : (await getDefaultSpotLikeStrategyBuilder(currency)) ??
          (Number(fromInstruments?.spot ?? current.spot) || 1.0);
    const volatilityRaw = Number(fromInstruments?.volatility ?? current.volatility);
    const domesticRaw = Number(fromInstruments?.domesticRate ?? current.domesticRate);
    const foreignRaw = Number(fromInstruments?.foreignRate ?? current.foreignRate);
    const volatility = Number.isFinite(volatilityRaw) && volatilityRaw > 0 ? volatilityRaw : 20;
    const domesticRate = Number.isFinite(domesticRaw) ? domesticRaw : 1.0;
    const foreignRate = Number.isFinite(foreignRaw) ? foreignRaw : 1.0;
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
          // Keep spot stable (Strategy Builder spot). Only refresh vol/rates from export snapshot.
          const cur = newData[currency] || MARKET_DEFAULTS;
          newData[currency] = {
            ...MARKET_DEFAULTS,
            ...cur,
            volatility: exportData.volatility,
            domesticRate: exportData.domesticRate,
            foreignRate: exportData.foreignRate,
          };
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
      setHasComputedMTM(true);
      setMtmLastUpdatedAt(Date.now());
      
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
      const safeAmount = Number(amount);
      return `${baseCurrency} ${Number.isFinite(safeAmount) ? safeAmount.toFixed(2) : "0.00"}`;
    }
  };

  const formatSafeNumber = (value: unknown, digits = 2, fallback = "N/A"): string => {
    const n = Number(value);
    return Number.isFinite(n) ? n.toFixed(digits) : fallback;
  };

  /**
   * Compute MTM total for a list of instruments using the same logic as the table:
   * MTM(unit) = (today - original) for long, (original - today) for short
   * MTM(total) = MTM(unit) * |notional| * (|quantity|/100)
   *
   * Returns amount in QUOTE currency of the pair (e.g. USD for EUR/USD).
   */
  const computeMtmTotalQuote = (items: HedgingInstrument[]): number => {
    let total = 0;
    for (const inst of items) {
      const status = String((inst as any).status || "").toLowerCase();
      if (status === "cancelled") continue;
      // ignore matured instruments for "today" effective rate
      const mat = (inst as any).maturity ? new Date(String((inst as any).maturity)) : null;
      if (mat && !isNaN(mat.getTime()) && mat <= new Date()) continue;

      const originalPrice = Number((inst as any).realOptionPrice ?? (inst as any).premium ?? 0) || 0;
      const todayPrice = Number(calculateTodayPrice(inst)) || 0;
      const quantity = Number((inst as any).quantity ?? 0) || 0;
      const isShort = quantity < 0;
      const mtmUnit = isShort ? (originalPrice - todayPrice) : (todayPrice - originalPrice);

      // Avoid double counting quantity: for exported instruments, notional may already be scaled.
      // Prefer rawVolume * hedgeQuantity% when available; otherwise use notional * quantity%.
      const rawVol = Number((inst as any).rawVolume ?? (inst as any).exposureVolume ?? NaN);
      const hedgeQty = Number((inst as any).hedgeQuantity ?? NaN);
      const effectiveNotionalBase =
        Number.isFinite(rawVol) && rawVol > 0 && Number.isFinite(hedgeQty)
          ? Math.abs(rawVol) * (Math.abs(hedgeQty) / 100)
          : Math.abs(Number((inst as any).notional || 0)) * (Math.abs(quantity) / 100);

      total += mtmUnit * effectiveNotionalBase;
    }
    return Number.isFinite(total) ? total : 0;
  };

  /** Effective base notional for a leg (avoids double counting). */
  const getEffectiveNotionalBase = (inst: HedgingInstrument): number => {
    const qty = Number((inst as any).quantity ?? 0) || 0;
    const rawVol = Number((inst as any).rawVolume ?? (inst as any).exposureVolume ?? NaN);
    const hedgeQty = Number((inst as any).hedgeQuantity ?? NaN);
    if (Number.isFinite(rawVol) && rawVol > 0 && Number.isFinite(hedgeQty)) {
      return Math.abs(rawVol) * (Math.abs(hedgeQty) / 100);
    }
    return Math.abs(Number((inst as any).notional || 0)) * (Math.abs(qty) / 100);
  };

  /** Payoff per 1 base unit in QUOTE currency at a given spot (intrinsic-style, Strategy Builder style). */
  const payoffUnitQuoteAtSpot = (inst: HedgingInstrument, spot: number, refSpot: number): number => {
    const t = String((inst as any).type || "").toLowerCase();
    // Try to use originalComponent.type for internal mapping
    const compType = String((inst as any).originalComponent?.type || "").toLowerCase();
    const kind =
      compType ||
      (t.includes("put") ? "put" : t.includes("forward") ? "forward" : t.includes("swap") ? "swap" : t.includes("call") ? "call" : "");
    const strikeType = (inst as any).originalComponent?.strikeType || "absolute";
    const strikeRaw = Number((inst as any).originalComponent?.strike ?? (inst as any).strike ?? spot) || spot;
    const strike = strikeType === "percent" ? refSpot * (strikeRaw / 100) : strikeRaw;

    // Barrier/digital fields are already absolute in instruments; but originalComponent may be percent.
    const barrierType = (inst as any).originalComponent?.barrierType || "absolute";
    const barrierRaw = Number((inst as any).originalComponent?.barrier ?? (inst as any).barrier ?? 0) || 0;
    const secondBarrierRaw = Number((inst as any).originalComponent?.secondBarrier ?? (inst as any).secondBarrier ?? 0) || 0;
    const barrier = barrierType === "percent" ? refSpot * (barrierRaw / 100) : barrierRaw;
    const secondBarrier = barrierType === "percent" ? refSpot * (secondBarrierRaw / 100) : secondBarrierRaw;
    const rebate = Number((inst as any).originalComponent?.rebate ?? (inst as any).rebate ?? 0) || 0;
    const rebateUnit = rebate / 100;

    // Barrier & digital detection similar to Strategy Builder
    const isBarrier = kind.includes("knockout") || kind.includes("knockin") || t.includes("knock") || t.includes("barrier");
    const isDigital = t.includes("touch") || t.includes("binary") || t.includes("digital") || ["one-touch","no-touch","double-touch","double-no-touch","range-binary","outside-binary"].includes(kind);

    if (kind === "swap") return spot - strike;
    if (kind === "forward") return spot - strike;
    if (kind === "call") return Math.max(0, spot - strike);
    if (kind === "put") return Math.max(0, strike - spot);

    // Best-effort for digitals (if type is a known digital label)
    const digitalKey = kind || compType || "";
    if (isDigital) {
      let conditionMet = false;
      switch (digitalKey) {
        case "one-touch":
          conditionMet = spot >= barrier;
          break;
        case "no-touch":
          conditionMet = spot < barrier;
          break;
        case "double-touch":
          conditionMet = spot >= barrier || spot <= secondBarrier;
          break;
        case "double-no-touch":
          conditionMet = spot < barrier && spot > secondBarrier;
          break;
        case "range-binary":
          conditionMet = spot <= barrier && spot >= strike;
          break;
        case "outside-binary":
          conditionMet = spot > barrier || spot < strike;
          break;
        default:
          // fallback: treat as one-touch style
          conditionMet = spot >= barrier;
      }
      return conditionMet ? rebateUnit : 0;
    }

    // Best-effort barrier: use Strategy Builder knockout/knockin logic if original type exists
    if (isBarrier) {
      const basePayoff = kind.includes("put") ? Math.max(0, strike - spot) : Math.max(0, spot - strike);
      // Can't reliably infer barrier direction for all variants here; fall back to base payoff when unknown.
      return basePayoff;
    }

    return 0;
  };

  /** Net hedge value in QUOTE currency at a given spot, including premiums, scaled by effective notional. */
  const computeNetHedgeValueQuoteAtSpot = (items: HedgingInstrument[], spot: number, refSpot: number): number => {
    let total = 0;
    for (const inst of items) {
      const qty = Number((inst as any).quantity ?? 0) || 0;
      if (!Number.isFinite(qty) || qty === 0) continue;
      const sign = qty >= 0 ? 1 : -1; // long vs short
      const effectiveNotionalBase = getEffectiveNotionalBase(inst);
      if (!Number.isFinite(effectiveNotionalBase) || effectiveNotionalBase <= 0) continue;

      const payoffUnit = payoffUnitQuoteAtSpot(inst, spot, refSpot);
      const premiumUnit = Number((inst as any).realOptionPrice ?? (inst as any).premium ?? 0) || 0;
      total += sign * (payoffUnit - premiumUnit) * effectiveNotionalBase;
    }
    return Number.isFinite(total) ? total : 0;
  };

  /**
   * Effective FX rate / "target strike" for an exposure given spot and MTM (quote currency).
   * Payable (buy base): S_eff = S - MTM/N
   * Receivable (sell base): S_eff = S + MTM/N
   */
  const computeEffectiveRate = (args: { spot: number; mtmQuote: number; exposureNotionalBase: number; exposureType: "receivable" | "payable" }): number | null => {
    const S = Number(args.spot);
    const MTM = Number(args.mtmQuote);
    const N = Math.abs(Number(args.exposureNotionalBase));
    if (!Number.isFinite(S) || S <= 0 || !Number.isFinite(MTM) || !Number.isFinite(N) || N <= 0) return null;
    const adj = MTM / N;
    const eff = args.exposureType === "payable" ? (S - adj) : (S + adj);
    return Number.isFinite(eff) ? eff : null;
  };

  // Get base currency from currency pair
  const getBaseCurrency = (currencyPair: string): string => {
    if (currencyPair.includes('/')) {
      return currencyPair.split('/')[0];
    }
    return currencyPair;
  };

  type RiskSeverity = "info" | "warning" | "critical";
  type RiskAlert = { key: string; severity: RiskSeverity; short: string; detail: string };

  const barrierAlertThresholds = React.useMemo(() => {
    // Percent distances to barrier, in % (e.g. 0.5 means 0.5%)
    const defaults = { criticalPct: 0.5, warningPct: 2 };
    try {
      const raw = localStorage.getItem("fxRiskManagerSettings");
      if (!raw) return defaults;
      const parsed = JSON.parse(raw);
      const t = parsed?.notifications?.alertThresholds || {};
      const criticalPct = Number(t.barrierCriticalPct);
      const warningPct = Number(t.barrierWarningPct);
      return {
        criticalPct: Number.isFinite(criticalPct) && criticalPct >= 0 ? criticalPct : defaults.criticalPct,
        warningPct: Number.isFinite(warningPct) && warningPct >= 0 ? warningPct : defaults.warningPct,
      };
    } catch {
      return defaults;
    }
  }, []);

  const computeInstantBadges = (instrument: HedgingInstrument): { main: React.ReactNode; risks: RiskAlert[]; dte: number | null } => {
    const statusRaw = String(instrument.status || "").toLowerCase();
    const valuationDateObj = new Date(valuationDate);
    const maturityDateObj = instrument.maturity ? new Date(instrument.maturity) : null;
    const matured = maturityDateObj ? valuationDateObj >= maturityDateObj : false;
    const cancelled = statusRaw === "cancelled";
    const dte = maturityDateObj ? Math.max(0, Math.ceil((maturityDateObj.getTime() - valuationDateObj.getTime()) / (24 * 3600 * 1000))) : null;

    const risks: RiskAlert[] = [];
    if (!cancelled && !matured && dte != null) {
      if (dte <= 2) risks.push({ key: "near-expiry-critical", severity: "critical", short: `EXP≤2d`, detail: `Expiry in ${dte} day(s)` });
      else if (dte <= 7) risks.push({ key: "near-expiry-warning", severity: "warning", short: `EXP≤7d`, detail: `Expiry in ${dte} day(s)` });
    }

    // Barrier proximity: only if instrument has barrier levels
    const spot = currencyMarketData[instrument.currency]?.spot;
    const barriers: number[] = [];
    if (instrument.barrier != null && isFinite(Number(instrument.barrier))) barriers.push(Number(instrument.barrier));
    if (instrument.secondBarrier != null && isFinite(Number(instrument.secondBarrier))) barriers.push(Number(instrument.secondBarrier));
    if (!cancelled && !matured && spot != null && isFinite(spot) && spot > 0 && barriers.length > 0) {
      const ds = barriers.map((b) => Math.abs(spot - b) / spot);
      const d = Math.min(...ds);
      const pct = d * 100;
      const criticalDec = barrierAlertThresholds.criticalPct / 100;
      const warningDec = barrierAlertThresholds.warningPct / 100;
      if (criticalDec > 0 && d < criticalDec) {
        risks.push({
          key: "barrier-critical",
          severity: "critical",
          short: `BARR<${barrierAlertThresholds.criticalPct}%`,
          detail: `Barrier within ${pct.toFixed(2)}% (S=${spot.toFixed(6)}, B=${barriers.map((x) => x.toFixed(6)).join(" / ")})`,
        });
      } else if (warningDec > 0 && d < warningDec) {
        risks.push({
          key: "barrier-warning",
          severity: "warning",
          short: `BARR<${barrierAlertThresholds.warningPct}%`,
          detail: `Barrier within ${pct.toFixed(2)}% (S=${spot.toFixed(6)}, B=${barriers.map((x) => x.toFixed(6)).join(" / ")})`,
        });
      }

      // Digital jump risk near trigger
      const t = String(instrument.type || "").toLowerCase();
      const isDigital = t.includes("touch") || t.includes("binary") || t.includes("digital");
      if (isDigital && d < 0.02) {
        risks.push({
          key: "jumpy",
          severity: d < 0.005 ? "critical" : "warning",
          short: "JUMP",
          detail: "Discontinuous payoff: near trigger",
        });
      }
    }

    const hasCritical = risks.some((r) => r.severity === "critical");
    const mainLabel = cancelled ? "CANCELLED" : matured ? "MATURED" : hasCritical ? "ACTION REQUIRED" : "LIVE";
    const mainBadge =
      mainLabel === "CANCELLED" ? (
        <Badge variant="destructive">CANCELLED</Badge>
      ) : mainLabel === "MATURED" ? (
        <Badge variant="secondary">MATURED</Badge>
      ) : mainLabel === "ACTION REQUIRED" ? (
        <Badge className="bg-red-600 text-white">ACTION REQUIRED</Badge>
      ) : (
        <Badge className="bg-emerald-600 text-white">LIVE</Badge>
      );

    return { main: mainBadge, risks, dte };
  };

  const renderStatusCell = (instrument: HedgingInstrument) => {
    const { main, risks } = computeInstantBadges(instrument);
    const top = risks.slice().sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "critical" ? -1 : a.severity === "warning" && b.severity === "info" ? -1 : 1));
    const shown = top.slice(0, 2);
    const extra = Math.max(0, top.length - shown.length);
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        {main}
        {shown.map((r) => {
          const cls =
            r.severity === "critical"
              ? "bg-red-100 text-red-800 border-red-200"
              : r.severity === "warning"
                ? "bg-yellow-100 text-yellow-800 border-yellow-200"
                : "bg-slate-100 text-slate-800 border-slate-200";
          return (
            <Tooltip key={r.key}>
              <TooltipTrigger asChild>
                <span>
                  <Badge variant="outline" className={cls}>{r.short}</Badge>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <div className="text-xs">{r.detail}</div>
              </TooltipContent>
            </Tooltip>
          );
        })}
        {extra > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Badge variant="outline">+{extra}</Badge>
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <div className="text-xs space-y-1">
                {top.slice(2).map((r) => (
                  <div key={r.key}>{r.detail}</div>
                ))}
              </div>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    );
  };

  const getInstrumentIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case "forward":
        return <ArrowUpDown className="h-4 w-4 text-primary" />;
      case "vanilla call":
      case "vanilla put":
        return <TrendingUp className="h-4 w-4 text-green-600" />;
      case "swap":
        return <BarChart3 className="h-4 w-4 text-emerald-600" />;
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
    const typeValue =
      INSTRUMENT_TYPES.find((t) => t.label === instrument.type)?.value ||
      INSTRUMENT_TYPES.find((t) => t.value === String(instrument.type || "").toLowerCase())?.value ||
      "forward";
    const currencyPair = String(instrument.currency || "");
    const spot =
      Number((instrument as any).exportSpotPrice) ||
      Number((instrument as any).impliedSpotPrice) ||
      Number((instrument as any).spotPrice) ||
      defaultSpot;
    const notionalBase = Number(instrument.notional || 0) || 0;
    const strikeAbs = Number((instrument as any).strike) || spot;
    const isDigital = String(typeValue).includes("touch") || String(typeValue).includes("binary");
    const maturity = String(instrument.maturity || "");

    setEditForm({
      type: typeValue,
      currencyPair,
      spotPrice: spot,
      domesticRate: Number((instrument as any).exportDomesticRate ?? (instrument as any).domesticRate ?? 5.0) || 0,
      foreignRate: Number((instrument as any).exportForeignRate ?? (instrument as any).foreignRate ?? 3.0) || 0,
      volatility: Number((instrument as any).exportVolatility ?? instrument.volatility ?? (instrument as any).impliedVolatility ?? 15.0) || 0,
      notionalBase,
      notionalQuote: Math.round(notionalBase * (Number.isFinite(spot) && spot > 0 ? spot : 1) * 100) / 100,
      quantity: Number(instrument.quantity ?? 100) || 0,
      strike: isDigital ? spot : strikeAbs,
      strikeType: "absolute",
      maturity,
      counterparty: String(instrument.counterparty || "Manual"),
      barrierType: "absolute",
      barrier: instrument.barrier == null ? "" : Number(instrument.barrier),
      secondBarrier: instrument.secondBarrier == null ? "" : Number(instrument.secondBarrier),
      rebate: instrument.rebate == null ? "" : Number(instrument.rebate),
      realPrice: (instrument as any).realOptionPrice == null ? "" : Number((instrument as any).realOptionPrice),
      portfolioId: (instrument as any).portfolioId || undefined,
      strategyMode: "existing",
      strategyId: (instrument as any).strategyId || "HSTRAT-UNASSIGNED",
      newStrategyName: "",
      exposureId: String((instrument as any).exposureId || ""),
      hedgeRequestId: String((instrument as any).hedgeRequestId || ""),
    });
    setEditFormRateOverrides({ domestic: false, foreign: false });
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

    const matchesStrategy =
      selectedStrategyFilter === "__all__" ||
      (instrument.strategyId || "HSTRAT-UNASSIGNED") === selectedStrategyFilter;

    const matchesColType = columnFilters.type.length === 0 || columnFilters.type.includes(instrument.type);
    const matchesColPair = columnFilters.pair.length === 0 || columnFilters.pair.includes(instrument.currency);
    const matchesColCounterparty = columnFilters.counterparty.length === 0 || columnFilters.counterparty.includes(instrument.counterparty);
    const matchesColPortfolio =
      columnFilters.portfolioId.length === 0 ||
      columnFilters.portfolioId.includes(instrument.portfolioId ?? "__none__");
    const matchesColStatus = columnFilters.status.length === 0 || columnFilters.status.includes(instrument.status);

    const search = instrumentSearchTerm.trim().toLowerCase();
    const matchesSearch =
      search.length === 0 ||
      instrument.id.toLowerCase().includes(search) ||
      instrument.type.toLowerCase().includes(search) ||
      instrument.currency.toLowerCase().includes(search) ||
      (instrument.counterparty || "").toLowerCase().includes(search) ||
      (instrument.strategyName || "").toLowerCase().includes(search);
    
    return (
      matchesTab &&
      matchesPortfolio &&
      matchesCounterparty &&
      matchesStrategy &&
      matchesColType &&
      matchesColPair &&
      matchesColCounterparty &&
      matchesColPortfolio &&
      matchesColStatus &&
      matchesSearch
    );
  });

  const columnFilterOptions = useMemo(() => {
    const uniq = <T,>(arr: T[]) => Array.from(new Set(arr));
    const type = uniq(instruments.map((i) => i.type)).sort();
    const pair = uniq(instruments.map((i) => i.currency)).sort();
    const counterparty = uniq(instruments.map((i) => i.counterparty).filter(Boolean)).sort();
    const status = uniq(instruments.map((i) => i.status).filter(Boolean)).sort();
    const portfolioId = uniq(instruments.map((i) => i.portfolioId ?? "__none__")).sort();
    const portfolioLabel = (id: string) =>
      id === "__none__" ? "No portfolio" : portfolios.find((p) => p.id === id)?.name ?? id;

    return {
      type: type.map((v) => ({ value: v })),
      pair: pair.map((v) => ({ value: v })),
      counterparty: counterparty.map((v) => ({ value: v })),
      status: status.map((v) => ({ value: v })),
      portfolioId: portfolioId.map((v) => ({ value: v, label: portfolioLabel(v) })),
    };
  }, [instruments, portfolios]);

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

      // Always attach CSV batch to a strategy container (create one per import)
      const importStrategyName = `CSV Import ${new Date().toLocaleDateString()}`;
      const importStrategy = importService.addHedgingStrategy({
        name: importStrategyName,
        source: "manual",
        currencyPair: undefined,
      });

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
        const payload = buildHedgingInstrumentPayload(r.data, {
          valuationDate: valDate,
          portfolioId,
        });
        payloads.push({
          ...payload,
          strategyId: importStrategy.id,
          strategyName: importStrategy.name,
        });
      }

      if (payloads.length > 0) {
        importService.addHedgingInstrumentsBatch(payloads);
      }
      requestAnimationFrame(() => {
        setInstruments(importService.getHedgingInstruments());
        setStrategies(importService.getHedgingStrategies());
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
    const instrumentCurrencies = getUniqueCurrencies(filteredInstruments);
    instrumentCurrencies.forEach(c => {
      const baseCurrency = c.split('/')[0];
      availableCodes.add(baseCurrency);
    });
    
    // Return sorted list of currency codes
    return Array.from(availableCodes).sort();
  }, [filteredInstruments]);

  // Calculate MTM by currency
  const mtmByCurrency = React.useMemo(() => {
    const mtmMap: { [currency: string]: number } = {};
    
    filteredInstruments.forEach(inst => {
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
  }, [filteredInstruments, currencyMarketData, interestRateSource, valuationDate, hedgingBootstrapCurveMap.curves]);

  // Convert MTM total to reference currency
  const [convertedTotalMTM, setConvertedTotalMTM] = React.useState<number>(0);
  
  React.useEffect(() => {
    if (!hasComputedMTM) return;
    let cancelled = false;
    const convertTotal = async () => {
      if (Object.keys(mtmByCurrency).length === 0) {
        if (!cancelled) setConvertedTotalMTM(0);
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
          
          if (!cancelled) setConvertedTotalMTM(totalUSD);
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
          
          if (!cancelled) setConvertedTotalMTM(totalInRef);
        }
      } catch (error) {
        console.error('Error converting MTM total:', error);
        if (!cancelled) setConvertedTotalMTM(0);
      }
    };
    
    convertTotal();
    return () => {
      cancelled = true;
    };
  }, [hasComputedMTM, mtmByCurrency, referenceCurrency, currencyMarketData]);

  // Persist the converted MTM total to localStorage so the Dashboard can read it
  React.useEffect(() => {
    try {
      localStorage.setItem('hedgingMTMTotal', JSON.stringify({
        value: convertedTotalMTM,
        currency: referenceCurrency,
        updatedAt: Date.now()
      }));
      // Notify other components (e.g. Dashboard)
      window.dispatchEvent(new CustomEvent('hedgingMTMUpdated'));
    } catch (_) { /* ignore */ }
  }, [convertedTotalMTM, referenceCurrency]);
  
  const hedgeAccountingCount = filteredInstruments.filter(inst => inst.hedge_accounting).length;

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

                <div className="flex flex-col justify-center px-2">
                  <div className="text-xs text-muted-foreground whitespace-nowrap">
                    Last update:{" "}
                    <span className="font-mono">
                      {mtmLastUpdatedAt ? new Date(mtmLastUpdatedAt).toLocaleString() : "—"}
                    </span>
                  </div>
                </div>
                

                
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
                    // Default spot should match Strategy Builder (live snapshot / exchange rates),
                    // not necessarily the export snapshot, unless user explicitly refreshes from export.
                    const data = currencyMarketData[currency] || { ...MARKET_DEFAULTS, ...(getMarketDataFromInstruments(currency) || {} as any) };
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
                          <div className="flex items-center gap-1">
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
                            <Button
                              type="button"
                              variant={marketSpotLocks[currency] ? "default" : "outline"}
                              size="sm"
                              className="h-8 px-2"
                              onClick={() => {
                                if (marketSpotLocks[currency]) {
                                  setSpotLock(currency, false);
                                  // trigger a refresh from snapshot/export next interval; keep current spot for now
                                  toast({ title: "Spot unlocked", description: `${currency}: auto spot sync is enabled again.` });
                                } else {
                                  setSpotLock(currency, true);
                                  toast({ title: "Spot locked", description: `${currency}: spot will stay manual for simulation.` });
                                }
                              }}
                              title={marketSpotLocks[currency] ? "Unlock (allow auto-sync)" : "Lock (manual simulation)"}
                            >
                              {marketSpotLocks[currency] ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
                            </Button>
                          </div>
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
        <Card className="mb-4 border-primary/40 bg-primary/10">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-primary flex items-center gap-2">
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
                  <Badge key={inst.id} variant="secondary" className="text-xs bg-primary/15 text-primary">
                    {inst.id}: {inst.impliedSpotPrice?.toFixed(6)}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-3 w-3 p-0 ml-1 text-primary hover:text-red-500"
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
        {(() => {
          const scopeLabel = (() => {
            const parts: string[] = [];
            if (selectedPortfolioFilter !== "__all__") {
              const name = selectedPortfolioFilter === "__none__"
                ? "No portfolio"
                : portfolios.find(p => p.id === selectedPortfolioFilter)?.name || selectedPortfolioFilter;
              parts.push(`Portfolio: ${name}`);
            }
            if (selectedCounterpartyFilter !== "__all__") {
              parts.push(`Counterparty: ${selectedCounterpartyFilter}`);
            }
            if (selectedStrategyFilter !== "__all__") {
              const sname = strategies.find(s => s.id === selectedStrategyFilter)?.name || selectedStrategyFilter;
              parts.push(`Strategy: ${sname}`);
            }
            return parts.length ? parts.join(" • ") : "All instruments";
          })();
          return (
            <div className="md:col-span-4 -mt-2">
              <p className="text-xs text-muted-foreground">Scope: {scopeLabel}</p>
            </div>
          );
        })()}
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
                filteredInstruments.forEach(inst => {
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
              Across {filteredInstruments.length} instruments
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
                
                const nearMaturityCount = filteredInstruments.filter(inst => {
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
                    const quantity = Number(addForm.quantity) || 0;
                    const unitPrice = addForm.realPrice !== "" && addForm.realPrice !== undefined && !isNaN(Number(addForm.realPrice))
                      ? Number(addForm.realPrice)
                      : (addFormTheoreticalPrice ?? 0);
                    const ttm = addForm.maturity ? PricingService.calculateTimeToMaturity(addForm.maturity, valuationDate || new Date().toISOString().split("T")[0]) : 0;

                    // Resolve strategy association (existing or create new)
                    let strategyId = addForm.strategyId || "HSTRAT-UNASSIGNED";
                    let strategyName = strategies.find((s) => s.id === strategyId)?.name ?? "Unassigned";
                    if (addForm.strategyMode === "new") {
                      const name = addForm.newStrategyName.trim();
                      const created = importService.addHedgingStrategy({
                        name: name || `New Strategy ${new Date().toLocaleDateString()}`,
                        source: "manual",
                        currencyPair: addForm.currencyPair || undefined,
                        portfolioId: addForm.portfolioId || undefined,
                        counterparty: addForm.counterparty,
                      });
                      strategyId = created.id;
                      strategyName = created.name;
                    }

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
                      strategyId,
                      strategyName,
                      hedgeRequestId: addForm.hedgeRequestId || undefined,
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
                        rebate: "",
                      realPrice: "",
                        portfolioId: undefined,
                        strategyMode: "new",
                        strategyId: "HSTRAT-UNASSIGNED",
                        newStrategyName: "",
                        exposureId: "",
                        hedgeRequestId: "",
                    });
                    toast({ title: "Instrument added", description: `${displayType} ${addForm.currencyPair} has been added.` });
                    // Defer heavy work (table recalc + useFinancialData sync) to next tick to avoid "Page not responding"
                    requestAnimationFrame(() => {
                      setInstruments(importService.getHedgingInstruments());
                      setStrategies(importService.getHedgingStrategies());
                      window.dispatchEvent(new CustomEvent("hedgingInstrumentsUpdated"));
                    });
                  }}
                  className="flex flex-col gap-4 py-4 overflow-y-auto min-h-0"
                >
                  <div className="grid grid-cols-[minmax(0,160px)_1fr] gap-x-4 gap-y-1 items-center">
                    <Label className="text-right font-medium whitespace-nowrap">Strategy</Label>
                    <div className="flex flex-col gap-2">
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <Select
                          value={addForm.strategyMode}
                          onValueChange={(v) => setAddForm((f) => ({ ...f, strategyMode: v as "existing" | "new" }))}
                        >
                          <SelectTrigger className="w-full sm:w-[180px]">
                            <SelectValue placeholder="Mode" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="existing">Use existing</SelectItem>
                            <SelectItem value="new">Create new</SelectItem>
                          </SelectContent>
                        </Select>

                        {addForm.strategyMode === "existing" ? (
                          <Select value={addForm.strategyId} onValueChange={(v) => setAddForm((f) => ({ ...f, strategyId: v }))}>
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Select strategy" />
                            </SelectTrigger>
                            <SelectContent>
                              {strategyOptions.map((s) => (
                                <SelectItem key={s.id} value={s.id}>
                                  {s.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input
                            value={addForm.newStrategyName}
                            onChange={(e) => setAddForm((f) => ({ ...f, newStrategyName: e.target.value }))}
                            placeholder="New strategy name"
                          />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        A strategy groups one or more instruments. New instruments must be associated to a strategy.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-[minmax(0,160px)_1fr] gap-x-4 gap-y-1 items-center">
                    <Label className="text-right font-medium whitespace-nowrap">Load exposure</Label>
                    <div className="flex gap-2 items-center">
                      <Select
                        onValueChange={async (val) => {
                          if (val === "__none__") return;
                          const exp = exposures.find((e) => (e.id || "") === val) || exposures[Number(val)] || undefined;
                          if (!exp) return;
                          const exposureId = String(exp.id || "");
                          const base = String(exp.currency || "").toUpperCase();
                          const hedge = String(exp.hedgeCurrency || (base === "USD" ? "EUR" : "USD")).toUpperCase();
                          const pairSymbol = `${base}/${hedge}`;
                          // Create custom pair if missing (aligned with Strategy Builder behavior)
                          const ensuredPair = ensurePairExists(base, hedge, Number(addForm.spotPrice) || 1);
                          // Try live rate
                          let spot = ensuredPair && "defaultSpotRate" in ensuredPair ? (ensuredPair as any).defaultSpotRate : (Number(addForm.spotPrice) || 1);
                          try {
                            const live = await fetchRealTimeRate(ensuredPair as any);
                            if (live && isFinite(live) && live > 0) spot = live;
                          } catch {}
                          const amountAbs = Math.abs(Number(exp.amount || 0));
                          const maturityYmd = (() => {
                            const d = typeof exp.maturity === "string" ? new Date(exp.maturity) : (exp.maturity as Date);
                            return isNaN(d?.getTime?.() || NaN) ? "" : d.toISOString().split("T")[0];
                          })();
                          const fromBootstrapSettings = readPricingInterestRateSource() === "bootstrapping";
                          const domesticRate = fromBootstrapSettings ? undefined : (bankRates[hedge as keyof typeof bankRates] ?? addForm.domesticRate);
                          const foreignRate = fromBootstrapSettings ? undefined : (bankRates[base as keyof typeof bankRates] ?? addForm.foreignRate);

                          // Create or reuse a hedge request linked to this exposure
                          let hedgeRequestId = "";
                          if (exposureId) {
                            try {
                              const req = importService.getOrCreateHedgeRequest({
                                exposureId,
                                source: "manual",
                                exposureSnapshot: {
                                  currency: base,
                                  hedgeCurrency: hedge,
                                  amount: Number(exp.amount || 0),
                                  type: exp.type,
                                  maturity: typeof exp.maturity === "string" ? exp.maturity : new Date(exp.maturity as any).toISOString(),
                                  date: (exp as any).date
                                    ? (typeof (exp as any).date === "string" ? (exp as any).date : new Date((exp as any).date).toISOString())
                                    : undefined,
                                  description: exp.description,
                                },
                              });
                              hedgeRequestId = req.id;
                            } catch {}
                          }

                          setAddForm((f) => ({
                            ...f,
                            exposureId,
                            hedgeRequestId,
                            currencyPair: ensuredPair.symbol,
                            spotPrice: spot,
                            strike: f.strikeType === "absolute" ? spot : (Number(f.strike) || 0),
                            maturity: maturityYmd || f.maturity,
                            notionalBase: amountAbs,
                            notionalQuote: Math.round(amountAbs * spot * 100) / 100,
                            ...(fromBootstrapSettings ? {} : { domesticRate: typeof domesticRate === "number" ? domesticRate : f.domesticRate, foreignRate: typeof foreignRate === "number" ? foreignRate : f.foreignRate }),
                          }));
                          setAddFormRateOverrides({ domestic: false, foreign: false });
                          toast({
                            title: "Exposure loaded",
                            description: `${pairSymbol} • ${amountAbs.toLocaleString()} ${base} • ${maturityYmd || "no maturity"}`,
                          });
                        }}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder={exposures.length > 0 ? "Select an exposure" : "No exposures available"} />
                        </SelectTrigger>
                        <SelectContent>
                          {exposures.length === 0 ? (
                            <SelectItem value="__none__" disabled>No exposures</SelectItem>
                          ) : (
                            exposures.map((e, idx) => {
                              const base = String(e.currency || "").toUpperCase();
                              const hedge = String(e.hedgeCurrency || (base === "USD" ? "EUR" : "USD")).toUpperCase();
                              const key = (e.id as string) || String(idx);
                              const maturity = typeof e.maturity === "string" ? e.maturity : (e.maturity as Date)?.toISOString?.().split?.("T")[0];
                              const label = `${base}/${hedge} • ${e.type || ""} • ${Math.abs(Number(e.amount||0)).toLocaleString()} • ${maturity || ""}`;
                              return (
                                <SelectItem key={key} value={key}>{label}</SelectItem>
                              );
                            })
                          )}
                        </SelectContent>
                      </Select>
                      <span className="text-[10px] text-muted-foreground">Fill pair, maturity, notional, rates</span>
                    </div>
                  </div>
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
                          } else {
                            // Clear digital-only fields when switching back to vanilla/forward/swap
                            next.barrier = "";
                            next.secondBarrier = "";
                            next.rebate = "";
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
                        try {
                          const safeValue = String(value || "");
                          const pair = [...CURRENCY_PAIRS, ...customCurrencyPairs].find((p) => p.symbol === safeValue) as { symbol: string; base?: string; quote?: string; defaultSpotRate: number } | undefined;
                          const initialSpot = Number(pair?.defaultSpotRate ?? addForm.spotPrice ?? 1);
                          const [base, quote] = (pair?.base && pair?.quote)
                            ? [pair.base, pair.quote]
                            : safeValue.includes("/") ? safeValue.split("/") : ["", ""];
                          const fromBootstrapSettings = readPricingInterestRateSource() === "bootstrapping";
                          // bankRates can be an empty object while loading; guard all accesses
                          const domesticRate = fromBootstrapSettings
                            ? undefined
                            : (quote ? (bankRates?.[quote as keyof typeof bankRates] as number | null | undefined) : undefined) ?? addForm.domesticRate;
                          const foreignRate = fromBootstrapSettings
                            ? undefined
                            : (base ? (bankRates?.[base as keyof typeof bankRates] as number | null | undefined) : undefined) ?? addForm.foreignRate;

                          // Prime UI with known/default spot
                          setAddForm((f) => {
                            const safeSpot = isFinite(initialSpot) && initialSpot > 0 ? initialSpot : (Number(f.spotPrice) || 1);
                            return {
                              ...f,
                              currencyPair: safeValue,
                              spotPrice: safeSpot,
                              strike: safeSpot,
                              ...(fromBootstrapSettings
                                ? {}
                                : {
                                    domesticRate: typeof domesticRate === "number" ? domesticRate : f.domesticRate,
                                    foreignRate: typeof foreignRate === "number" ? foreignRate : f.foreignRate,
                                  }),
                              notionalQuote: Math.round((f.notionalBase || 0) * safeSpot * 100) / 100,
                            };
                          });
                          setAddFormRateOverrides({ domestic: false, foreign: false });

                          // Try to upgrade with live rate (non-blocking)
                          if (pair) {
                            try {
                              const realTimeRate = await fetchRealTimeRate(pair);
                              if (realTimeRate != null && isFinite(realTimeRate) && realTimeRate > 0) {
                                setAddForm((f) => ({
                                  ...f,
                                  spotPrice: realTimeRate,
                                  strike: f.strikeType === "absolute" ? f.strike : realTimeRate * ((Number(f.strike) || 0) / 100),
                                  notionalQuote: Math.round((f.notionalBase || 0) * realTimeRate * 100) / 100,
                                }));
                                // Use safe formatting
                                const formatted = (Math.abs(realTimeRate) > 10 ? realTimeRate.toFixed(3) : realTimeRate.toFixed(4));
                                toast({ title: "Rate updated", description: `${pair.symbol}: ${formatted}` });
                              }
                            } catch (err) {
                              // Silent fallback to default spot
                              console.warn("Live rate fetch failed:", err);
                            }
                          }
                        } catch (err) {
                          console.error("Error while applying live rates to form:", err);
                          toast({ title: "Live rates unavailable", description: "Using default rates for now.", variant: "destructive" as any });
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
                      step="1"
                      className="w-full"
                      value={addForm.quantity ?? ""}
                      onChange={(e) => setAddForm((f) => ({ ...f, quantity: Number(e.target.value) || 0 }))}
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
            <div className="flex items-center gap-2">
              <Label className="text-sm font-medium text-muted-foreground whitespace-nowrap">Display by strategy</Label>
              <Select value={selectedStrategyFilter} onValueChange={setSelectedStrategyFilter}>
                <SelectTrigger className="w-[240px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All strategies</SelectItem>
                  {strategyOptions.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name || s.id}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {/* Tabs */}
          <div className="flex items-center justify-between gap-2">
            <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as "instrument" | "strategy" | "exposure")}>
              <TabsList>
                <TabsTrigger value="instrument">By instrument</TabsTrigger>
                <TabsTrigger value="strategy">By strategy</TabsTrigger>
                <TabsTrigger value="exposure">By exposure</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {viewMode === "instrument" ? (
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
                  <>
                    {/* Mobile-only layout: cards for readability */}
                    <div className="md:hidden space-y-2">
                      {filteredInstruments.map((instrument) => {
                        const quantityToHedge = instrument.quantity || 0;
                        const unitPrice = instrument.realOptionPrice || instrument.premium || 0;
                        const todayPrice = calculateTodayPrice(instrument);

                        const isShort = quantityToHedge < 0;
                        const mtmUnit = isShort ? unitPrice - todayPrice : todayPrice - unitPrice;
                        const volumeToHedge = instrument.notional;
                        const quantityFactor = Math.abs(quantityToHedge) / 100;
                        const mtmTotal = mtmUnit * Math.abs(instrument.notional) * quantityFactor;

                        let timeToMaturity = 0;
                        if (instrument.maturity) {
                          const valuationDateObj = new Date(valuationDate);
                          const maturityDateObj = new Date(instrument.maturity);
                          timeToMaturity =
                            valuationDateObj >= maturityDateObj
                              ? 0
                              : PricingService.calculateTimeToMaturity(instrument.maturity, valuationDate);
                        }

                        const marketData =
                          currencyMarketData[instrument.currency] ||
                          getMarketDataFromInstruments(instrument.currency) ||
                          MARKET_DEFAULTS;
                        const currentSpot = Number(instrument.impliedSpotPrice || marketData.spot) || 1;
                        const volatility = instrument.impliedVolatility || instrument.volatility || 0;

                        const spotDisplayValue =
                          editingTableCells[instrument.id]?.spot ??
                          (instrument.impliedSpotPrice != null
                            ? String(instrument.impliedSpotPrice)
                            : currentSpot.toFixed(6));
                        const volDisplayValue =
                          editingTableCells[instrument.id]?.vol ??
                          (instrument.impliedVolatility != null ? String(instrument.impliedVolatility) : "");

                        return (
                          <div
                            key={instrument.id}
                            className="rounded-lg border bg-background p-3 shadow-sm active:scale-[0.99] transition-transform"
                            onClick={() => navigate(`/hedging/${instrument.id}`)}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 space-y-1">
                                <div className="flex items-center gap-2 min-w-0">
                                  <div className="font-mono font-semibold text-sm truncate">{instrument.id}</div>
                                  <Badge
                                    variant="outline"
                                    className="font-mono text-[11px] px-2 py-0.5 bg-primary/10 dark:bg-primary/15 text-primary border-primary/40"
                                  >
                                    {instrument.currency}
                                  </Badge>
                                </div>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  <span className="truncate">{instrument.type}</span>
                                  <span>•</span>
                                  <span className={timeToMaturity === 0 ? "text-red-600" : ""}>
                                    {instrument.maturity || "—"}
                                  </span>
                                </div>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0"
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
                                  className="h-8 w-8 p-0"
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
                                  className="h-8 w-8 p-0"
                                  title="Delete"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    deleteInstrument(instrument.id);
                                  }}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>

                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              {renderStatusCell(instrument)}
                              <Badge variant="secondary" className="font-mono text-xs">
                                Qty {formatSafeNumber(quantityToHedge, 1, "0.0")}%
                              </Badge>
                              <Badge variant="outline" className="font-mono text-xs">
                                Notional {formatCurrency(volumeToHedge, instrument.currency)}
                              </Badge>
                            </div>

                            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                              <div className="rounded-md border bg-muted/20 p-2">
                                <div className="text-muted-foreground">Today</div>
                                <div className="font-mono font-semibold">{Number(todayPrice) !== 0 ? formatSafeNumber(todayPrice, 4) : "N/A"}</div>
                              </div>
                              <div className="rounded-md border bg-muted/20 p-2">
                                <div className="text-muted-foreground">MTM</div>
                                <div className={`font-mono font-semibold ${mtmTotal >= 0 ? "text-green-700 dark:text-green-300" : "text-red-700 dark:text-red-300"}`}>
                                  {Math.abs(mtmTotal) > 0.0001 ? (mtmTotal >= 0 ? "+" : "") + formatCurrency(mtmTotal, instrument.currency) : formatCurrency(0, instrument.currency)}
                                </div>
                              </div>
                              <div className="rounded-md border bg-muted/20 p-2">
                                <div className="text-muted-foreground">TTM</div>
                                <div className={`font-mono font-semibold ${timeToMaturity === 0 ? "text-red-600 dark:text-red-300" : ""}`}>
                                  {formatSafeNumber(timeToMaturity, 4, "0.0000")}y
                                </div>
                              </div>
                              <div className="rounded-md border bg-muted/20 p-2">
                                <div className="text-muted-foreground">Unit</div>
                                <div className={`font-mono font-semibold ${mtmUnit >= 0 ? "text-green-700 dark:text-green-300" : "text-red-700 dark:text-red-300"}`}>
                                  {Math.abs(Number(mtmUnit) || 0) > 0.0001 ? (mtmUnit >= 0 ? "+" : "") + formatSafeNumber(mtmUnit, 4, "0.0000") : "0.0000"}
                                </div>
                              </div>
                            </div>

                            <details className="mt-3">
                              <summary className="text-xs text-muted-foreground cursor-pointer select-none">
                                Market inputs (spot / vol)
                              </summary>
                              <div className="mt-2 grid grid-cols-2 gap-2">
                                <div className="space-y-1">
                                  <div className="text-[11px] text-muted-foreground">Spot</div>
                                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                    <Input
                                      type="number"
                                      value={spotDisplayValue}
                                      onChange={(e) => {
                                        const raw = e.target.value;
                                        setEditingTableCells((prev) => ({ ...prev, [instrument.id]: { ...prev[instrument.id], spot: raw } }));
                                        const id = instrument.id;
                                        if (debounceTimeoutsRef.current.spot[id]) clearTimeout(debounceTimeoutsRef.current.spot[id]);
                                        debounceTimeoutsRef.current.spot[id] = setTimeout(() => {
                                          const value = parseFloat(raw);
                                          if (!isNaN(value) && value > 0) {
                                            updateInstrumentSpotPrice(id, value);
                                            setEditingTableCells((prev) => {
                                              const next = { ...prev };
                                              if (next[id]) {
                                                delete next[id].spot;
                                                if (Object.keys(next[id] || {}).length === 0) delete next[id];
                                              }
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
                                        if (raw !== undefined && raw !== "") {
                                          const value = parseFloat(raw);
                                          if (!isNaN(value) && value > 0) updateInstrumentSpotPrice(id, value);
                                        }
                                        setEditingTableCells((prev) => {
                                          const next = { ...prev };
                                          if (next[id]) {
                                            delete next[id].spot;
                                            if (Object.keys(next[id] || {}).length === 0) delete next[id];
                                          }
                                          return next;
                                        });
                                      }}
                                      placeholder={currentSpot.toFixed(6)}
                                      className="h-8 text-xs font-mono"
                                      step="0.0001"
                                      min="0"
                                    />
                                    {instrument.impliedSpotPrice && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 w-8 p-0 text-gray-400 hover:text-red-500"
                                        onClick={() => resetInstrumentSpotPrice(instrument.id)}
                                        title="Reset to global spot price"
                                      >
                                        ×
                                      </Button>
                                    )}
                                  </div>
                                </div>
                                <div className="space-y-1">
                                  <div className="text-[11px] text-muted-foreground">Vol (%)</div>
                                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                    <Input
                                      type="number"
                                      value={volDisplayValue}
                                      onChange={(e) => {
                                        const raw = e.target.value;
                                        setEditingTableCells((prev) => ({ ...prev, [instrument.id]: { ...prev[instrument.id], vol: raw } }));
                                        const id = instrument.id;
                                        if (debounceTimeoutsRef.current.vol[id]) clearTimeout(debounceTimeoutsRef.current.vol[id]);
                                        debounceTimeoutsRef.current.vol[id] = setTimeout(() => {
                                          const value = parseFloat(raw);
                                          if (!isNaN(value) && value >= 0 && value <= 100) {
                                            updateInstrumentVolatility(id, value);
                                            setEditingTableCells((prev) => {
                                              const next = { ...prev };
                                              if (next[id]) {
                                                delete next[id].vol;
                                                if (Object.keys(next[id] || {}).length === 0) delete next[id];
                                              }
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
                                        if (raw !== undefined && raw !== "") {
                                          const value = parseFloat(raw);
                                          if (!isNaN(value) && value >= 0 && value <= 100) updateInstrumentVolatility(id, value);
                                        }
                                        setEditingTableCells((prev) => {
                                          const next = { ...prev };
                                          if (next[id]) {
                                            delete next[id].vol;
                                            if (Object.keys(next[id] || {}).length === 0) delete next[id];
                                          }
                                          return next;
                                        });
                                      }}
                                      placeholder={Number(volatility || 0).toFixed(1)}
                                      className="h-8 text-xs font-mono"
                                      step="0.1"
                                      min="0"
                                      max="100"
                                    />
                                    {instrument.impliedVolatility != null && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 w-8 p-0 text-gray-400 hover:text-red-500"
                                        onClick={() => resetInstrumentVolatility(instrument.id)}
                                        title="Reset to global volatility"
                                      >
                                        ×
                                      </Button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </details>
                          </div>
                        );
                      })}
                    </div>

                    {/* Desktop/tablet layout (unchanged) */}
                    <div className="hidden md:block overflow-x-auto" style={{ maxWidth: 'calc(100vw - 280px)' }}>
                   <Table className="min-w-full border-collapse bg-background shadow-sm rounded-lg overflow-hidden [&_th]:whitespace-nowrap [&_td]:whitespace-nowrap">
                     <TableHeader className="bg-gradient-to-r from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
                       <TableRow className="border-b-2 border-slate-200 dark:border-slate-700">
                         {/* Fixed columns */}
                         <TableHead rowSpan={2} className="bg-slate-50 dark:bg-slate-900 font-semibold text-center border-r border-slate-200 dark:border-slate-700 min-w-[60px] sticky left-0 z-[5]">ID</TableHead>
                        <TableHead rowSpan={2} className="bg-slate-50 dark:bg-slate-900 font-semibold text-center border-r border-slate-200 dark:border-slate-700 min-w-[140px]">
                          <div className="flex items-center justify-center gap-1">
                            <span>Type</span>
                            <ExcelColumnFilter
                              title="Type"
                              options={columnFilterOptions.type}
                              selected={columnFilters.type}
                              onChange={(next) => setColumnFilters((p) => ({ ...p, type: next }))}
                            />
                          </div>
                        </TableHead>
                        <TableHead rowSpan={2} className="bg-slate-50 dark:bg-slate-900 font-semibold text-center border-r border-slate-200 dark:border-slate-700 min-w-[160px]">
                          <div className="flex items-center justify-center gap-1">
                            <span>Currency Pair</span>
                            <ExcelColumnFilter
                              title="Currency Pair"
                              options={columnFilterOptions.pair}
                              selected={columnFilters.pair}
                              onChange={(next) => setColumnFilters((p) => ({ ...p, pair: next }))}
                            />
                          </div>
                        </TableHead>
                         <TableHead rowSpan={2} className="bg-slate-50 dark:bg-slate-900 font-semibold text-center border-r border-slate-200 dark:border-slate-700 min-w-[80px]">Quantity (%)</TableHead>
                         <TableHead rowSpan={2} className="bg-slate-50 dark:bg-slate-900 font-semibold text-center border-r border-slate-200 dark:border-slate-700 min-w-[100px]">Unit Price (Initial)</TableHead>
                         <TableHead rowSpan={2} className="bg-slate-50 dark:bg-slate-900 font-semibold text-center border-r border-slate-200 dark:border-slate-700 min-w-[100px]">Today Price</TableHead>
                         <TableHead rowSpan={2} className="bg-slate-50 dark:bg-slate-900 font-semibold text-center border-r border-slate-200 dark:border-slate-700 min-w-[100px]">MTM (Unit)</TableHead>
                         <TableHead rowSpan={2} className="bg-slate-50 dark:bg-slate-900 font-semibold text-center border-r border-slate-200 dark:border-slate-700 min-w-[100px]">MTM</TableHead>
                         
                         {/* Dynamic columns with conditional Export */}
                         <TableHead colSpan={showExportColumns ? 2 : 1} className="text-center border-b border-r border-slate-200 dark:border-slate-700 bg-primary/10 dark:bg-primary/15 font-semibold min-w-[120px]">Time to Maturity</TableHead>
                         <TableHead colSpan={showExportColumns ? 2 : 1} className="text-center border-b border-r border-slate-200 dark:border-slate-700 bg-green-50 dark:bg-green-900/20 font-semibold min-w-[100px]">Spot Price</TableHead>
                         <TableHead colSpan={showExportColumns ? 2 : 1} className="text-center border-b border-r border-slate-200 dark:border-slate-700 bg-yellow-50 dark:bg-yellow-900/20 font-semibold min-w-[100px]">Volatility (%)</TableHead>
                         <TableHead colSpan={showExportColumns ? 2 : 1} className="text-center border-b border-r border-slate-200 dark:border-slate-700 bg-emerald-50 dark:bg-emerald-900/20 font-semibold min-w-[120px]">Domestic Rate (%)</TableHead>
                         <TableHead colSpan={showExportColumns ? 2 : 1} className="text-center border-b border-r border-slate-200 dark:border-slate-700 bg-pink-50 dark:bg-pink-900/20 font-semibold min-w-[120px]">Foreign Rate (%)</TableHead>
                         <TableHead colSpan={showExportColumns ? 2 : 1} className="text-center border-b border-r border-slate-200 dark:border-slate-700 bg-primary/10 dark:bg-primary/15 font-semibold min-w-[120px]">Forward Price</TableHead>
                         <TableHead colSpan={showExportColumns ? 2 : 1} className="text-center border-b border-r border-slate-200 dark:border-slate-700 bg-orange-50 dark:bg-orange-900/20 font-semibold min-w-[120px]">Strike Analysis</TableHead>
                         
                         {/* Fixed end columns */}
                         <TableHead rowSpan={2} className="bg-slate-50 dark:bg-slate-900 font-semibold text-center border-r border-slate-200 dark:border-slate-700 min-w-[80px]">Barrier 1</TableHead>
                         <TableHead rowSpan={2} className="bg-slate-50 dark:bg-slate-900 font-semibold text-center border-r border-slate-200 dark:border-slate-700 min-w-[80px]">Barrier 2</TableHead>
                         <TableHead rowSpan={2} className="bg-slate-50 dark:bg-slate-900 font-semibold text-center border-r border-slate-200 dark:border-slate-700 min-w-[80px]">Rebate (%)</TableHead>
                         <TableHead rowSpan={2} className="bg-slate-50 dark:bg-slate-900 font-semibold text-center border-r border-slate-200 dark:border-slate-700 min-w-[80px]">Notional</TableHead>
                         <TableHead rowSpan={2} className="bg-slate-50 dark:bg-slate-900 font-semibold text-center border-r border-slate-200 dark:border-slate-700 min-w-[100px]">Total premium</TableHead>
                         <TableHead rowSpan={2} className="bg-slate-50 dark:bg-slate-900 font-semibold text-center border-r border-slate-200 dark:border-slate-700 min-w-[100px]">Maturity</TableHead>
                        <TableHead rowSpan={2} className="bg-slate-50 dark:bg-slate-900 font-semibold text-center border-r border-slate-200 dark:border-slate-700 min-w-[140px]">
                          <div className="flex items-center justify-center gap-1">
                            <span>Status</span>
                            <ExcelColumnFilter
                              title="Status"
                              options={columnFilterOptions.status}
                              selected={columnFilters.status}
                              onChange={(next) => setColumnFilters((p) => ({ ...p, status: next }))}
                            />
                          </div>
                        </TableHead>
                         <TableHead rowSpan={2} className="bg-slate-50 dark:bg-slate-900 font-semibold text-center min-w-[120px]">Actions</TableHead>
                    </TableRow>
                       <TableRow className="border-b border-slate-200 dark:border-slate-700">
                         {/* Sub-headers for dynamic columns */}
                         {showExportColumns && <TableHead className="text-xs text-primary dark:text-primary bg-primary/10 dark:bg-primary/15 border-r border-slate-200 dark:border-slate-700 font-medium">Export</TableHead>}
                         <TableHead className="text-xs text-green-600 dark:text-green-300 bg-primary/10 dark:bg-primary/15 border-r border-slate-200 dark:border-slate-700 font-medium">Current</TableHead>
                         
                         {showExportColumns && <TableHead className="text-xs text-primary dark:text-primary bg-green-50 dark:bg-green-900/20 border-r border-slate-200 dark:border-slate-700 font-medium">Export</TableHead>}
                         <TableHead className="text-xs text-green-600 dark:text-green-300 bg-green-50 dark:bg-green-900/20 border-r border-slate-200 dark:border-slate-700 font-medium">Current</TableHead>
                         
                         {showExportColumns && <TableHead className="text-xs text-primary dark:text-primary bg-yellow-50 dark:bg-yellow-900/20 border-r border-slate-200 dark:border-slate-700 font-medium">Export</TableHead>}
                         <TableHead className="text-xs text-green-600 dark:text-green-300 bg-yellow-50 dark:bg-yellow-900/20 border-r border-slate-200 dark:border-slate-700 font-medium">Current</TableHead>
                         
                         {showExportColumns && <TableHead className="text-xs text-primary dark:text-primary bg-emerald-50 dark:bg-emerald-900/20 border-r border-slate-200 dark:border-slate-700 font-medium">Export</TableHead>}
                         <TableHead className="text-xs text-green-600 dark:text-green-300 bg-emerald-50 dark:bg-emerald-900/20 border-r border-slate-200 dark:border-slate-700 font-medium">Current</TableHead>
                         
                         {showExportColumns && <TableHead className="text-xs text-primary dark:text-primary bg-pink-50 dark:bg-pink-900/20 border-r border-slate-200 dark:border-slate-700 font-medium">Export</TableHead>}
                         <TableHead className="text-xs text-green-600 dark:text-green-300 bg-pink-50 dark:bg-pink-900/20 border-r border-slate-200 dark:border-slate-700 font-medium">Current</TableHead>
                         
                         {showExportColumns && <TableHead className="text-xs text-primary dark:text-primary bg-primary/10 dark:bg-primary/15 border-r border-slate-200 dark:border-slate-700 font-medium">Export</TableHead>}
                         <TableHead className="text-xs text-green-600 dark:text-green-300 bg-primary/10 dark:bg-primary/15 border-r border-slate-200 dark:border-slate-700 font-medium">Current</TableHead>
                         
                         {showExportColumns && <TableHead className="text-xs text-primary dark:text-primary bg-orange-50 dark:bg-orange-900/20 border-r border-slate-200 dark:border-slate-700 font-medium">Export</TableHead>}
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
                            <Badge variant="outline" className="font-mono font-semibold px-3 py-1 bg-primary/10 dark:bg-primary/15 text-primary dark:text-primary border-primary/40 dark:border-primary/50 hover:bg-primary/15 dark:hover:bg-primary/20 transition-colors">
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
                            <div className={`font-mono font-semibold ${todayPrice !== 0 ? "text-primary" : "text-slate-400"}`}>
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
                             <TableCell className="font-mono text-center bg-primary/10 dark:bg-primary/15 border-r border-slate-200 dark:border-slate-700">
                              <div className="text-xs text-primary">
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
                             <TableCell className="text-center bg-primary/10 dark:bg-primary/15 border-r border-slate-200 dark:border-slate-700">
                               <div className="text-sm font-mono font-semibold text-primary">
                              {instrument.exportSpotPrice ? 
                                instrument.exportSpotPrice.toFixed(6) : 
                                   <span className="text-primary/60 italic">N/A</span>
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
                             <TableCell className="text-center bg-primary/10 dark:bg-primary/15 border-r border-slate-200 dark:border-slate-700">
                               <div className="text-sm font-mono font-semibold text-primary">
                              {instrument.exportVolatility ? 
                                `${instrument.exportVolatility.toFixed(2)}%` : 
                                   <span className="text-primary/60 italic">N/A</span>
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
                                    className="h-4 w-4 p-0 text-primary hover:text-primary/80"
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
                             <TableCell className="font-mono text-center bg-primary/10 dark:bg-primary/15 border-r border-slate-200 dark:border-slate-700">
                            <div className="text-xs text-primary">
                              {Number.isFinite(Number(instrument.exportDomesticRate))
                                ? `${Number(instrument.exportDomesticRate).toFixed(3)}%`
                                : 
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
                                <div className="text-xs text-green-600 dark:text-green-300">{formatSafeNumber(eff.domesticPct, 3)}%</div>
                              );
                            })()}
                          </TableCell>
                          
                                                     {/* Foreign Rate - Export (conditional) */}
                           {showExportColumns && (
                             <TableCell className="font-mono text-center bg-primary/10 dark:bg-primary/15 border-r border-slate-200 dark:border-slate-700">
                                <div className="text-xs text-primary">
                              {Number.isFinite(Number(instrument.exportForeignRate))
                                ? `${Number(instrument.exportForeignRate).toFixed(3)}%`
                                : 
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
                                <div className="text-xs text-green-600 dark:text-green-300">{formatSafeNumber(eff.foreignPct, 3)}%</div>
                              );
                            })()}
                          </TableCell>
                          
                                                     {/* Forward Price - Export (conditional) */}
                           {showExportColumns && (
                             <TableCell className="font-mono text-center bg-primary/10 dark:bg-primary/15 border-r border-slate-200 dark:border-slate-700">
                            <div className="text-xs text-primary">
                              {Number.isFinite(Number(instrument.exportForwardPrice))
                                ? Number(instrument.exportForwardPrice).toFixed(6)
                                : 
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
                             <TableCell className="font-mono text-center bg-primary/10 dark:bg-primary/15 border-r border-slate-200 dark:border-slate-700">
                            <div className="text-xs text-primary">
                              {(() => {
                                // Calculer le strike d'export basé sur les paramètres d'export
                                if (instrument.originalComponent && instrument.exportSpotPrice) {
                                  const exportStrike = instrument.originalComponent.strikeType === 'percent' 
                                    ? instrument.exportSpotPrice * (instrument.originalComponent.strike / 100)
                                    : instrument.originalComponent.strike;
                                  return formatSafeNumber(exportStrike, 4);
                                }
                                return 'N/A';
                              })()}
                            </div>
                          </TableCell>
                           )}
                          
                          {/* Strike - Current */}
                          <TableCell className="font-mono text-center bg-green-50 dark:bg-green-900/20">
                            <div className="text-xs text-green-600">
                            {formatSafeNumber(instrument.strike, 4)}
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-right">
                            {formatSafeNumber(instrument.barrier, 4)}
                          </TableCell>
                          <TableCell className="font-mono text-right">
                            {formatSafeNumber(instrument.secondBarrier, 4)}
                          </TableCell>
                          <TableCell className="font-mono text-right">
                            {formatSafeNumber(instrument.rebate, 2)}
                          </TableCell>
                          <TableCell className="font-mono text-right">
                            {formatCurrency(volumeToHedge, instrument.currency)}
                          </TableCell>
                          <TableCell className="font-mono text-right">
                            {calculatedNotional > 0 ? formatCurrency(calculatedNotional, instrument.currency) : formatCurrency(instrument.notional * quantityFactor, instrument.currency)}
                          </TableCell>
                          <TableCell>{instrument.maturity}</TableCell>
                        <TableCell>{renderStatusCell(instrument)}</TableCell>
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
                  </>
                )}
              </TabsContent>
            </Tabs>
          ) : (
            <Card className="mt-4">
              <CardHeader>
                <CardTitle className="text-base">
                  {viewMode === "strategy" ? "Strategies" : "Exposures"}
                </CardTitle>
                <CardDescription>
                  {viewMode === "strategy"
                    ? "Group instruments by hedging strategy."
                    : "Show hedging strategies and instruments grouped by FX exposure (currency, hedge currency, maturity)."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {viewMode === "strategy" ? (() => {
                  const byStrategy = new Map<string, HedgingInstrument[]>();
                  // Apply the same filters as the instrument view (search, portfolio, counterparty, strategy, column filters).
                  for (const inst of filteredInstruments) {
                    const sid = inst.strategyId || "HSTRAT-UNASSIGNED";
                    const arr = byStrategy.get(sid) ?? [];
                    arr.push(inst);
                    byStrategy.set(sid, arr);
                  }
                  const list = strategies
                    .filter((s) => byStrategy.has(s.id))
                    .sort((a, b) => a.name.localeCompare(b.name));

                  if (list.length === 0) {
                    return <div className="text-sm text-muted-foreground">No strategies yet.</div>;
                  }

                  return list.map((s) => {
                    const items = byStrategy.get(s.id) ?? [];
                    const totalNotional = items.reduce((acc, x) => acc + Math.abs(Number(x.notional || 0)), 0);
                    const totalMtm = items.reduce((acc, x) => acc + Number(x.mtm || 0), 0);
                    const maturities = items.map((x) => x.maturity).filter(Boolean).sort();
                    const minMat = maturities[0] ?? "—";
                    const maxMat = maturities[maturities.length - 1] ?? "—";
                    const isExpanded = !!expandedStrategies[s.id];
                    const refSpot = (() => {
                      const first = items[0];
                      if (!first) return 1;
                      const marketData = currencyMarketData[first.currency] || getMarketDataFromInstruments(first.currency) || MARKET_DEFAULTS;
                      return Number(first.impliedSpotPrice || marketData.spot) || 1;
                    })();

                    // Payoff (incl. premium) evaluated at today's spot (refSpot) for global readability.
                    // IMPORTANT: This is the REAL payoff/cashflow in QUOTE currency for the full hedged notional
                    // (avoids double counting quantity using rawVolume/hedgeQuantity when available).
                    const totalPayoff = computeNetHedgeValueQuoteAtSpot(items, refSpot, refSpot);
                    // Exposure label (via hedgeRequest -> exposure). If multiple exposures, show a generic label.
                    const exposureLabel = (() => {
                      const ids = Array.from(
                        new Set(items.map((i) => String((i as any).hedgeRequestId || "")).filter(Boolean))
                      );
                      if (ids.length === 0) return "Exposure —";
                      const expIds = Array.from(
                        new Set(
                          ids
                            .map((rid) => hedgeRequests.find((r) => r.id === rid)?.exposureId)
                            .filter(Boolean)
                            .map(String)
                        )
                      );
                      if (expIds.length !== 1) return "Exposure: multiple";
                      const expId = expIds[0];
                      const exp = exposures.find((e: any) => String(e.id || "") === expId);
                      if (!exp) {
                        const snap = hedgeRequests.find((r) => r.exposureId === expId)?.exposureSnapshot;
                        if (snap?.currency && snap?.hedgeCurrency && snap?.maturity) {
                          const ymd = String(snap.maturity).split("T")[0];
                          return `Exposure ${snap.currency}/${snap.hedgeCurrency} • ${ymd} • ${(snap.type || "").toUpperCase() || "—"}`;
                        }
                        return `Exposure ${expId}`;
                      }
                      const base = String(exp.currency || "").toUpperCase();
                      const hedge = String(exp.hedgeCurrency || (base === "USD" ? "EUR" : "USD")).toUpperCase();
                      const ymd = (() => {
                        const d = typeof exp.maturity === "string" ? new Date(exp.maturity) : (exp.maturity as Date);
                        return isNaN(d.getTime()) ? "—" : d.toISOString().split("T")[0];
                      })();
                      return `Exposure ${base}/${hedge} • ${ymd} • ${(exp.type || "").toUpperCase()}`;
                    })();
                    const targetRateLabel = (() => {
                      // Derive target rate only when we can resolve a single linked exposure
                      const reqIds = Array.from(new Set(items.map((i) => String((i as any).hedgeRequestId || "")).filter(Boolean)));
                      if (reqIds.length === 0) return null;
                      const expIds = Array.from(new Set(reqIds.map((rid) => hedgeRequests.find((r) => r.id === rid)?.exposureId).filter(Boolean).map(String)));
                      if (expIds.length !== 1) return null;
                      const expId = expIds[0];
                      const exp = exposures.find((e: any) => String(e.id || "") === expId);
                      const expType = (exp?.type || hedgeRequests.find((r) => r.exposureId === expId)?.exposureSnapshot?.type) as ("receivable" | "payable" | undefined);
                      const expAmount = Number(exp?.amount ?? hedgeRequests.find((r) => r.exposureId === expId)?.exposureSnapshot?.amount ?? 0);
                      if (!expType || !Number.isFinite(expAmount) || Math.abs(expAmount) <= 0) return null;
                      const mtmQuote = computeMtmTotalQuote(items);
                      const eff = computeEffectiveRate({
                        spot: refSpot,
                        mtmQuote,
                        exposureNotionalBase: Math.abs(expAmount),
                        exposureType: expType,
                      });
                      if (eff == null) return null;
                      const payoffNow = computeNetHedgeValueQuoteAtSpot(items, refSpot, refSpot);
                      const effPayoff =
                        Number.isFinite(payoffNow) && Math.abs(Number(expAmount)) > 0
                          ? computeEffectiveRate({
                              spot: refSpot,
                              mtmQuote: payoffNow,
                              exposureNotionalBase: Math.abs(expAmount),
                              exposureType: expType,
                            })
                          : null;
                      return effPayoff != null
                        ? `Target ${formatSafeNumber(eff, 4)} • P&L-rate ${formatSafeNumber(effPayoff, 4)} (S ${formatSafeNumber(refSpot, 4)})`
                        : `Target ${formatSafeNumber(eff, 4)} (S ${formatSafeNumber(refSpot, 4)} • MTM ${formatSafeNumber(mtmQuote, 0)})`;
                    })();
                    const showPayoff = !!showPayoffByStrategy[s.id];
                    const payoffCurve = (() => {
                      if (!showPayoff) return [];
                      const minSpot = refSpot * 0.7;
                      const maxSpot = refSpot * 1.3;
                      const points = 100;
                      const step = (maxSpot - minSpot) / points;
                      const rows: Array<{ spot: number; payoff: number }> = [];
                      for (let spot = minSpot; spot <= maxSpot + step / 2; spot += step) {
                        const total = computeNetHedgeValueQuoteAtSpot(items, spot, refSpot);
                        rows.push({ spot, payoff: Number.isFinite(total) ? total : 0 });
                      }
                      return rows;
                    })();

                    return (
                      <div key={s.id} className="rounded-lg border p-3">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div className="space-y-0.5">
                            <button
                              className="text-left text-sm font-semibold hover:underline"
                              onClick={() => navigate(`/hedging-strategy/${s.id}`)}
                              title="Open strategy details"
                            >
                              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                <span>{s.name}</span>
                                <Badge variant="outline" className="font-mono text-[11px]">
                                  {exposureLabel}
                                </Badge>
                                {targetRateLabel && (
                                  <Badge variant="secondary" className="font-mono text-[11px]">
                                    {targetRateLabel}
                                  </Badge>
                                )}
                              </span>
                            </button>
                            <div className="text-xs text-muted-foreground">
                              {items.length} instrument(s) • Maturity {minMat} → {maxMat}
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <Badge variant="outline">Notional {totalNotional.toLocaleString()}</Badge>
                            <Badge variant="secondary">MTM {Number.isFinite(totalMtm) ? totalMtm.toFixed(2) : "0.00"}</Badge>
                            <Badge variant="outline">Payoff global {Number.isFinite(totalPayoff) ? totalPayoff.toFixed(2) : "0.00"}</Badge>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                setShowPayoffByStrategy((prev) => ({ ...prev, [s.id]: !prev[s.id] }))
                              }
                            >
                              {showPayoff ? "Hide payoff" : "Show payoff"}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                setExpandedStrategies((prev) => ({ ...prev, [s.id]: !prev[s.id] }))
                              }
                            >
                              {isExpanded ? "Hide legs" : "Show legs"}
                            </Button>
                          </div>
                        </div>
                        {showPayoff && (
                        <div className="mt-3 rounded-md border bg-muted/10 p-3">
                          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                              Global payoff graph
                            </div>
                            <div className="text-xs text-muted-foreground font-mono">
                              Spot range {formatSafeNumber(refSpot * 0.7, 4)} → {formatSafeNumber(refSpot * 1.3, 4)}
                            </div>
                          </div>
                          <div className="h-48 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart data={payoffCurve} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis
                                  dataKey="spot"
                                  type="number"
                                  domain={["dataMin", "dataMax"]}
                                  tickFormatter={(v) => formatSafeNumber(v, 3)}
                                />
                                <YAxis tickFormatter={(v) => formatSafeNumber(v, 0)} />
                                <RechartsTooltip
                                  formatter={(v: number) => [formatSafeNumber(v, 2), "Payoff"]}
                                  labelFormatter={(v: number) => `Spot ${formatSafeNumber(v, 6)}`}
                                />
                                <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" />
                                <ReferenceLine x={refSpot} stroke="hsl(var(--primary))" strokeDasharray="4 4" />
                                <Line type="monotone" dataKey="payoff" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                        )}

                        {isExpanded && (
                        <div className="mt-3 overflow-x-auto">
                          <Table className="[&_th]:whitespace-nowrap [&_td]:whitespace-nowrap">
                            <TableHeader>
                              <TableRow>
                                <TableHead>ID</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead>Pair</TableHead>
                                <TableHead>Maturity</TableHead>
                                <TableHead>Notional</TableHead>
                                <TableHead>Payoff</TableHead>
                                <TableHead>Counterparty</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {items
                                .slice()
                                .sort((a, b) => String(a.maturity).localeCompare(String(b.maturity)))
                                .map((inst) => {
                                  const unitPrice = calculateTodayPrice(inst);
                                  const notionalAbs = Math.abs(Number(inst.notional || 0));
                                  const qtySign = Number(inst.quantity || 0) >= 0 ? 1 : -1;
                                  const legPayoff = (Number.isFinite(unitPrice) ? unitPrice : 0) * notionalAbs * qtySign;
                                  return (
                                    <TableRow
                                      key={inst.id}
                                      className="cursor-pointer"
                                      onClick={() => navigate(`/hedging/${inst.id}`)}
                                    >
                                      <TableCell className="font-mono">{inst.id}</TableCell>
                                      <TableCell>{inst.type}</TableCell>
                                      <TableCell className="font-mono">{inst.currency}</TableCell>
                                      <TableCell className="font-mono">{inst.maturity}</TableCell>
                                      <TableCell className="font-mono">{Number(inst.notional || 0).toLocaleString()}</TableCell>
                                      <TableCell className={`font-mono ${legPayoff >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                                        {Number.isFinite(legPayoff) ? legPayoff.toFixed(2) : "0.00"}
                                      </TableCell>
                                      <TableCell>{inst.counterparty || "—"}</TableCell>
                                    </TableRow>
                                  );
                                })}
                            </TableBody>
                          </Table>
                        </div>
                        )}
                      </div>
                    );
                  });
                })()
                : (() => {
                  if (!exposures || exposures.length === 0) {
                    return <div className="text-sm text-muted-foreground">No exposures found. Add some in FX Exposures.</div>;
                  }
                  const parseYmd = (d: string | Date | undefined) => {
                    if (!d) return "N/A";
                    const dt = typeof d === "string" ? new Date(d) : d;
                    return isNaN(dt.getTime()) ? "N/A" : dt.toISOString().split("T")[0];
                  };
                  const exposureCards = exposures.map((exp, idx) => {
                    const exposureId = String((exp as any).id || "");
                    const base = String(exp.currency || "").toUpperCase();
                    const hedge = String(exp.hedgeCurrency || base === "USD" ? "EUR" : "USD").toUpperCase();
                    const pair = `${base}/${hedge}`;
                    const maturityYmd = parseYmd(exp.maturity);
                    // Preferred: link via HedgeRequest -> exposureId
                    const reqIds = new Set(
                      hedgeRequests
                        .filter((r) => exposureId && r.exposureId === exposureId)
                        .map((r) => r.id)
                    );
                    const matchedLinked = filteredInstruments.filter((inst) => inst.hedgeRequestId && reqIds.has(inst.hedgeRequestId));
                    // Fallback for legacy instruments (no hedgeRequestId yet): old heuristic match by pair+maturity
                    const matchedLegacy = filteredInstruments.filter(inst => {
                      if (inst.currency !== pair) return false;
                      const instMat = String(inst.maturity || "").split("T")[0];
                      return instMat === maturityYmd;
                    });
                    const matched = matchedLinked.length > 0 ? matchedLinked : matchedLegacy;
                    const byStrat = new Map<string, HedgingInstrument[]>();
                    matched.forEach(m => {
                      const sid = m.strategyId || "HSTRAT-UNASSIGNED";
                      const arr = byStrat.get(sid) ?? [];
                      arr.push(m);
                      byStrat.set(sid, arr);
                    });
                    const totalNotional = matched.reduce((s, m) => s + Math.abs(Number(m.notional || 0)), 0);
                    const strategyCount = byStrat.size;
                    const reqCount = exposureId ? hedgeRequests.filter(r => r.exposureId === exposureId).length : 0;
                    const spot = (() => {
                      const md = currencyMarketData[pair] || getMarketDataFromInstruments(pair) || MARKET_DEFAULTS;
                      return Number(md.spot) || 0;
                    })();
                    const mtmQuote = computeMtmTotalQuote(matched);
                    const eff = computeEffectiveRate({
                      spot,
                      mtmQuote,
                      exposureNotionalBase: Math.abs(Number(exp.amount || 0)),
                      exposureType: exp.type,
                    });
                    const payoffNow = computeNetHedgeValueQuoteAtSpot(matched, spot, spot);
                    const effPayoff = eff != null
                      ? computeEffectiveRate({
                          spot,
                          mtmQuote: payoffNow,
                          exposureNotionalBase: Math.abs(Number(exp.amount || 0)),
                          exposureType: exp.type,
                        })
                      : null;
                    return (
                      <div key={`${pair}-${maturityYmd}-${idx}`} className="rounded-lg border p-3">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div className="space-y-0.5">
                            <div className="text-sm font-semibold">
                              Exposure {pair} • {maturityYmd} • {exp.type?.toUpperCase()}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Amount {Math.abs(Number(exp.amount || 0)).toLocaleString()} {base} • Hedge requests {reqCount} • Strategies {strategyCount}
                              {matchedLinked.length === 0 && matchedLegacy.length > 0 && (
                                <span className="ml-2 text-amber-600">• Legacy match (no link)</span>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <Badge variant="outline">Notional {totalNotional.toLocaleString()}</Badge>
                            {eff != null && spot > 0 && (
                              <Badge variant="secondary" className="font-mono">
                                {effPayoff != null
                                  ? `Target ${formatSafeNumber(eff, 4)} • P&L-rate ${formatSafeNumber(effPayoff, 4)} (S ${formatSafeNumber(spot, 4)})`
                                  : `Target ${formatSafeNumber(eff, 4)} (S ${formatSafeNumber(spot, 4)} • MTM ${formatSafeNumber(mtmQuote, 0)})`}
                              </Badge>
                            )}
                          </div>
                        </div>
                        {matched.length > 0 ? (
                          <div className="mt-3 overflow-x-auto">
                            <Table className="[&_th]:whitespace-nowrap [&_td]:whitespace-nowrap">
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Hedge Request</TableHead>
                                  <TableHead>Strategy</TableHead>
                                  <TableHead>ID</TableHead>
                                  <TableHead>Type</TableHead>
                                  <TableHead>Maturity</TableHead>
                                  <TableHead>Notional</TableHead>
                                  <TableHead>Counterparty</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {Array.from(byStrat.entries()).map(([sid, items]) =>
                                  items
                                    .slice()
                                    .sort((a, b) => String(a.maturity).localeCompare(String(b.maturity)))
                                    .map(inst => (
                                      <TableRow key={inst.id} className="cursor-pointer" onClick={() => navigate(`/hedging/${inst.id}`)}>
                                        <TableCell className="font-mono text-xs">{inst.hedgeRequestId || "—"}</TableCell>
                                        <TableCell className="font-mono">{strategies.find(s => s.id === sid)?.name || "Unassigned"}</TableCell>
                                        <TableCell className="font-mono">{inst.id}</TableCell>
                                        <TableCell>{inst.type}</TableCell>
                                        <TableCell className="font-mono">{inst.maturity}</TableCell>
                                        <TableCell className="font-mono">{Number(inst.notional || 0).toLocaleString()}</TableCell>
                                        <TableCell>{inst.counterparty || "—"}</TableCell>
                                      </TableRow>
                                    ))
                                )}
                              </TableBody>
                            </Table>
                          </div>
                        ) : (
                          <div className="mt-2 text-sm text-muted-foreground">No hedging instruments matched this exposure yet.</div>
                        )}
                      </div>
                    );
                  });
                  return exposureCards;
                })()}
              </CardContent>
            </Card>
          )}
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
                  <p className="text-sm text-muted-foreground">{formatSafeNumber(selectedInstrument.quantity, 1)}%</p>
                </div>
                <div>
                  <Label className="text-sm font-medium">Strike</Label>
                  <p className="text-sm text-muted-foreground">{formatSafeNumber(selectedInstrument.strike, 4)}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium">Maturity</Label>
                  <p className="text-sm text-muted-foreground">{selectedInstrument.maturity}</p>
                </div>
                {selectedInstrument.barrier && (
                  <div>
                    <Label className="text-sm font-medium">Barrier 1</Label>
                    <p className="text-sm text-muted-foreground">{formatSafeNumber(selectedInstrument.barrier, 4)}</p>
                  </div>
                )}
                {selectedInstrument.secondBarrier && (
                  <div>
                    <Label className="text-sm font-medium">Barrier 2</Label>
                    <p className="text-sm text-muted-foreground">{formatSafeNumber(selectedInstrument.secondBarrier, 4)}</p>
                  </div>
                )}
                {selectedInstrument.rebate && (
                  <div>
                    <Label className="text-sm font-medium">Rebate (%)</Label>
                    <p className="text-sm text-muted-foreground">{formatSafeNumber(selectedInstrument.rebate, 2)}%</p>
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
              {(() => {
                const [baseCcy, quoteCcy] = String(selectedInstrument.currency || "BASE/QUOTE").split("/");
                const marketData = currencyMarketData[selectedInstrument.currency] || getMarketDataFromInstruments(selectedInstrument.currency) || MARKET_DEFAULTS;
                const spot = Number(selectedInstrument.impliedSpotPrice || marketData.spot) || 1;
                const unitPriceQuote = calculateTodayPrice(selectedInstrument); // quote per base
                const unitPriceBase = spot > 0 && Number.isFinite(unitPriceQuote) ? unitPriceQuote / spot : 0;
                const notionalBase = Number(selectedInstrument.notional || 0);
                const notionalQuote = notionalBase * spot;
                const eff = getEffectiveRatesForInstrument(selectedInstrument);
                return (
                  <div className="grid grid-cols-1 gap-3">
                    <div className="rounded-md border p-3">
                      <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">Sizing</div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <div className="text-xs text-muted-foreground">{baseCcy} notional</div>
                          <div className="font-mono text-sm">{formatSafeNumber(notionalBase, 0)} {baseCcy}</div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">{quoteCcy} notional (at spot)</div>
                          <div className="font-mono text-sm">{formatSafeNumber(notionalQuote, 0)} {quoteCcy}</div>
                        </div>
                      </div>
                    </div>
                    <div className="rounded-md border p-3">
                      <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">Unit price</div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <div className="text-xs text-muted-foreground">{quoteCcy} per {baseCcy}</div>
                          <div className="font-mono text-sm">{formatSafeNumber(unitPriceQuote, 6)} {quoteCcy}/{baseCcy}</div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">{baseCcy} per {baseCcy}</div>
                          <div className="font-mono text-sm">{formatSafeNumber(unitPriceBase, 6)} {baseCcy}/{baseCcy}</div>
                        </div>
                      </div>
                    </div>
                    <div className="rounded-md border p-3">
                      <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">Market</div>
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <div className="text-xs text-muted-foreground">Spot {baseCcy}/{quoteCcy}</div>
                          <div className="font-mono text-sm">{formatSafeNumber(spot, 6)}</div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">{baseCcy} rate (%)</div>
                          <div className="font-mono text-sm">{formatSafeNumber(eff.domesticPct, 3)}%</div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">{quoteCcy} rate (%)</div>
                          <div className="font-mono text-sm">{formatSafeNumber(eff.foreignPct, 3)}%</div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}
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
        <DialogContent className="sm:max-w-[640px] max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader className="shrink-0">
            <DialogTitle>Edit Hedging Instrument</DialogTitle>
            <DialogDescription>
              Modify the instrument entry. Fields and behavior match the “Add New Hedging Instrument” form.
            </DialogDescription>
          </DialogHeader>

          {selectedInstrument && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!editForm.currencyPair || !editForm.maturity) {
                  toast({
                    title: "Validation",
                    description: "Please select a currency pair and enter maturity date.",
                    variant: "destructive",
                  });
                  return;
                }
                const notionalBaseVal = Number(editForm.notionalBase) || 0;
                if (notionalBaseVal <= 0) {
                  toast({
                    title: "Validation",
                    description: "Notional (base) must be greater than 0.",
                    variant: "destructive",
                  });
                  return;
                }
                const spotForBarrier = Number(editForm.spotPrice) || 1;
                const isDigital = editForm.type.includes("touch") || editForm.type.includes("binary");
                const strikeAbs = isDigital
                  ? spotForBarrier
                  : (editForm.strikeType === "percent"
                      ? spotForBarrier * (Number(editForm.strike) || 0) / 100
                      : (Number(editForm.strike) || 0));
                const maturityDate = new Date(editForm.maturity);
                if (isNaN(maturityDate.getTime())) {
                  toast({
                    title: "Validation",
                    description: "Invalid maturity date.",
                    variant: "destructive",
                  });
                  return;
                }
                const barrierNum = editForm.barrier === "" ? undefined : Number(editForm.barrier);
                const secondBarrierNum = editForm.secondBarrier === "" ? undefined : Number(editForm.secondBarrier);
                const barrier = barrierNum == null ? undefined : editForm.barrierType === "percent" ? (spotForBarrier * (barrierNum / 100)) : barrierNum;
                const secondBarrier = secondBarrierNum == null ? undefined : editForm.barrierType === "percent" ? (spotForBarrier * (secondBarrierNum / 100)) : secondBarrierNum;
                const rebate = editForm.rebate === "" ? undefined : Number(editForm.rebate);
                const displayType = INSTRUMENT_TYPES.find((t) => t.value === editForm.type)?.label ?? editForm.type;
                const notionalBase = Number(editForm.notionalBase) || 0;
                const quantity = Number(editForm.quantity) || 0;
                const unitPrice =
                  editForm.realPrice !== "" && editForm.realPrice !== undefined && !isNaN(Number(editForm.realPrice))
                    ? Number(editForm.realPrice)
                    : (editFormTheoreticalPrice ?? 0);
                const ttm = editForm.maturity
                  ? PricingService.calculateTimeToMaturity(editForm.maturity, valuationDate || new Date().toISOString().split("T")[0])
                  : 0;

                // Resolve strategy association (existing or create new)
                let strategyId = editForm.strategyId || "HSTRAT-UNASSIGNED";
                let strategyName = strategies.find((s) => s.id === strategyId)?.name ?? "Unassigned";
                if (editForm.strategyMode === "new") {
                  const name = editForm.newStrategyName.trim();
                  const created = importService.addHedgingStrategy({
                    name: name || `New Strategy ${new Date().toLocaleDateString()}`,
                    source: "manual",
                    currencyPair: editForm.currencyPair || undefined,
                    portfolioId: editForm.portfolioId || undefined,
                    counterparty: editForm.counterparty,
                  });
                  strategyId = created.id;
                  strategyName = created.name;
                }

                saveInstrumentChanges({
                  ...selectedInstrument,
                  type: displayType,
                  currency: editForm.currencyPair,
                  notional: notionalBase,
                  quantity,
                  strike: !isNaN(strikeAbs) ? strikeAbs : undefined,
                  maturity: editForm.maturity,
                  counterparty: editForm.counterparty,
                  portfolioId: editForm.portfolioId || undefined,
                  barrier,
                  secondBarrier,
                  rebate,
                  // Pricing / export fields (same as Add)
                  premium: unitPrice,
                  realOptionPrice: unitPrice,
                  volatility: Number(editForm.volatility) || undefined,
                  exportSpotPrice: Number(editForm.spotPrice) || undefined,
                  exportDomesticRate: Number(editForm.domesticRate) || undefined,
                  exportForeignRate: Number(editForm.foreignRate) || undefined,
                  exportVolatility: Number(editForm.volatility) || undefined,
                  exportTimeToMaturity: ttm > 0 ? ttm : undefined,
                  // Do not force an individual "current" spot override on edit.
                  // Keep any existing impliedSpotPrice as-is; exportSpotPrice captures the edited snapshot.
                  impliedSpotPrice: (selectedInstrument as any).impliedSpotPrice,
                  strategyId,
                  strategyName,
                  exposureId: editForm.exposureId || undefined,
                  hedgeRequestId: editForm.hedgeRequestId || undefined,
                } as any);
              }}
              className="flex flex-col gap-4 py-4 overflow-y-auto min-h-0"
            >
              <div className="grid grid-cols-[minmax(0,160px)_1fr] gap-x-4 gap-y-1 items-center">
                <Label className="text-right font-medium whitespace-nowrap">Strategy</Label>
                <div className="flex flex-col gap-2">
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Select value={editForm.strategyMode} onValueChange={(v) => setEditForm((f) => ({ ...f, strategyMode: v as "existing" | "new" }))}>
                      <SelectTrigger className="w-full sm:w-[180px]">
                        <SelectValue placeholder="Mode" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="existing">Use existing</SelectItem>
                        <SelectItem value="new">Create new</SelectItem>
                      </SelectContent>
                    </Select>

                    {editForm.strategyMode === "existing" ? (
                      <Select value={editForm.strategyId} onValueChange={(v) => setEditForm((f) => ({ ...f, strategyId: v }))}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select strategy" />
                        </SelectTrigger>
                        <SelectContent>
                          {strategyOptions.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        value={editForm.newStrategyName}
                        onChange={(e) => setEditForm((f) => ({ ...f, newStrategyName: e.target.value }))}
                        placeholder="New strategy name"
                      />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">A strategy groups one or more instruments. New instruments must be associated to a strategy.</p>
                </div>
              </div>

              <div className="grid grid-cols-[minmax(0,160px)_1fr] gap-x-4 gap-y-1 items-center">
                <Label className="text-right font-medium whitespace-nowrap">Load exposure</Label>
                <div className="flex gap-2 items-center">
                  <Select
                    onValueChange={async (val) => {
                      if (val === "__none__") return;
                      const exp = exposures.find((e) => (e.id || "") === val) || exposures[Number(val)] || undefined;
                      if (!exp) return;
                      const exposureId = String(exp.id || "");
                      const base = String(exp.currency || "").toUpperCase();
                      const hedge = String(exp.hedgeCurrency || (base === "USD" ? "EUR" : "USD")).toUpperCase();
                      const pairSymbol = `${base}/${hedge}`;
                      const ensuredPair = ensurePairExists(base, hedge, Number(editForm.spotPrice) || 1);
                      let spot = ensuredPair && "defaultSpotRate" in ensuredPair ? (ensuredPair as any).defaultSpotRate : (Number(editForm.spotPrice) || 1);
                      try {
                        const live = await fetchRealTimeRate(ensuredPair as any);
                        if (live && isFinite(live) && live > 0) spot = live;
                      } catch {}
                      const amountAbs = Math.abs(Number(exp.amount || 0));
                      const maturityYmd = (() => {
                        const d = typeof exp.maturity === "string" ? new Date(exp.maturity) : (exp.maturity as Date);
                        return isNaN(d?.getTime?.() || NaN) ? "" : d.toISOString().split("T")[0];
                      })();
                      const fromBootstrapSettings = readPricingInterestRateSource() === "bootstrapping";
                      const domesticRate = fromBootstrapSettings ? undefined : (bankRates[hedge as keyof typeof bankRates] ?? editForm.domesticRate);
                      const foreignRate = fromBootstrapSettings ? undefined : (bankRates[base as keyof typeof bankRates] ?? editForm.foreignRate);

                      let hedgeRequestId = "";
                      if (exposureId) {
                        try {
                          const req = importService.getOrCreateHedgeRequest({
                            exposureId,
                            source: "manual",
                            exposureSnapshot: {
                              currency: base,
                              hedgeCurrency: hedge,
                              amount: Number(exp.amount || 0),
                              type: exp.type,
                              maturity: typeof exp.maturity === "string" ? exp.maturity : new Date(exp.maturity as any).toISOString(),
                              date: (exp as any).date ? (typeof (exp as any).date === "string" ? (exp as any).date : new Date((exp as any).date).toISOString()) : undefined,
                              description: exp.description,
                            },
                          });
                          hedgeRequestId = req.id;
                        } catch {}
                      }

                      setEditForm((f) => ({
                        ...f,
                        exposureId,
                        hedgeRequestId,
                        currencyPair: ensuredPair.symbol,
                        spotPrice: spot,
                        strike: f.strikeType === "absolute" ? spot : (Number(f.strike) || 0),
                        maturity: maturityYmd || f.maturity,
                        notionalBase: amountAbs,
                        notionalQuote: Math.round(amountAbs * spot * 100) / 100,
                        ...(fromBootstrapSettings ? {} : { domesticRate: typeof domesticRate === "number" ? domesticRate : f.domesticRate, foreignRate: typeof foreignRate === "number" ? foreignRate : f.foreignRate }),
                      }));
                      setEditFormRateOverrides({ domestic: false, foreign: false });
                      toast({
                        title: "Exposure loaded",
                        description: `${pairSymbol} • ${amountAbs.toLocaleString()} ${base} • ${maturityYmd || "no maturity"}`,
                      });
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={exposures.length > 0 ? "Select an exposure" : "No exposures available"} />
                    </SelectTrigger>
                    <SelectContent>
                      {exposures.length === 0 ? (
                        <SelectItem value="__none__" disabled>
                          No exposures
                        </SelectItem>
                      ) : (
                        exposures.map((e, idx) => {
                          const base = String(e.currency || "").toUpperCase();
                          const hedge = String(e.hedgeCurrency || (base === "USD" ? "EUR" : "USD")).toUpperCase();
                          const key = (e.id as string) || String(idx);
                          const maturity = typeof e.maturity === "string" ? e.maturity : (e.maturity as Date)?.toISOString?.().split?.("T")[0];
                          const label = `${base}/${hedge} • ${e.type || ""} • ${Math.abs(Number(e.amount || 0)).toLocaleString()} • ${maturity || ""}`;
                          return (
                            <SelectItem key={key} value={key}>
                              {label}
                            </SelectItem>
                          );
                        })
                      )}
                    </SelectContent>
                  </Select>
                  <span className="text-[10px] text-muted-foreground">Fill pair, maturity, notional, rates</span>
                </div>
              </div>

              <div className="grid grid-cols-[minmax(0,160px)_1fr] gap-x-4 gap-y-1 items-center">
                <Label htmlFor="edit-instrument-type" className="text-right font-medium whitespace-nowrap">Type</Label>
                <Select
                  value={editForm.type}
                  onValueChange={(value) => {
                    const spotVal = Number(editForm.spotPrice) || 1.085;
                    setEditForm((f) => {
                      const next = { ...f, type: value };
                      if (value.includes("touch") || value.includes("binary")) {
                        next.barrierType = "absolute";
                        (next as any).barrier = (f.barrier === "" || f.barrier === undefined) ? spotVal * 1.05 : f.barrier;
                        (next as any).secondBarrier = (value.includes("double") || value.includes("range") || value.includes("outside"))
                          ? ((f.secondBarrier === "" || f.secondBarrier === undefined) ? spotVal * 0.95 : f.secondBarrier)
                          : "";
                        (next as any).rebate = (f.rebate === "" || f.rebate === undefined) ? 100 : f.rebate;
                      } else {
                        (next as any).barrier = "";
                        (next as any).secondBarrier = "";
                        (next as any).rebate = "";
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
                <Label htmlFor="edit-currency-pair" className="text-right font-medium whitespace-nowrap">Currency Pair</Label>
                <div className="flex flex-col gap-1">
                  <Select
                    value={editForm.currencyPair || undefined}
                    onValueChange={async (value) => {
                      try {
                        const safeValue = String(value || "");
                        const pair = [...CURRENCY_PAIRS, ...customCurrencyPairs].find((p) => p.symbol === safeValue) as
                          | { symbol: string; base?: string; quote?: string; defaultSpotRate: number }
                          | undefined;
                        const initialSpot = Number(pair?.defaultSpotRate ?? editForm.spotPrice ?? 1);
                        const [base, quote] = (pair?.base && pair?.quote) ? [pair.base, pair.quote] : safeValue.includes("/") ? safeValue.split("/") : ["", ""];
                        const fromBootstrapSettings = readPricingInterestRateSource() === "bootstrapping";
                        const domesticRate = fromBootstrapSettings
                          ? undefined
                          : (quote ? (bankRates?.[quote as keyof typeof bankRates] as number | null | undefined) : undefined) ?? editForm.domesticRate;
                        const foreignRate = fromBootstrapSettings
                          ? undefined
                          : (base ? (bankRates?.[base as keyof typeof bankRates] as number | null | undefined) : undefined) ?? editForm.foreignRate;

                        setEditForm((f) => {
                          const safeSpot = isFinite(initialSpot) && initialSpot > 0 ? initialSpot : (Number(f.spotPrice) || 1);
                          return {
                            ...f,
                            currencyPair: safeValue,
                            spotPrice: safeSpot,
                            strike: safeSpot,
                            ...(fromBootstrapSettings ? {} : { domesticRate: typeof domesticRate === "number" ? domesticRate : f.domesticRate, foreignRate: typeof foreignRate === "number" ? foreignRate : f.foreignRate }),
                            notionalQuote: Math.round((f.notionalBase || 0) * safeSpot * 100) / 100,
                          };
                        });
                        setEditFormRateOverrides({ domestic: false, foreign: false });

                        if (pair) {
                          try {
                            const realTimeRate = await fetchRealTimeRate(pair);
                            if (realTimeRate != null && isFinite(realTimeRate) && realTimeRate > 0) {
                              setEditForm((f) => ({
                                ...f,
                                spotPrice: realTimeRate,
                                strike: f.strikeType === "absolute" ? f.strike : realTimeRate * ((Number(f.strike) || 0) / 100),
                                notionalQuote: Math.round((f.notionalBase || 0) * realTimeRate * 100) / 100,
                              }));
                              const formatted = (Math.abs(realTimeRate) > 10 ? realTimeRate.toFixed(3) : realTimeRate.toFixed(4));
                              toast({ title: "Rate updated", description: `${pair.symbol}: ${formatted}` });
                            }
                          } catch (err) {
                            console.warn("Live rate fetch failed:", err);
                          }
                        }
                      } catch (err) {
                        console.error("Error while applying live rates to form:", err);
                        toast({ title: "Live rates unavailable", description: "Using default rates for now.", variant: "destructive" as any });
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

              <div className="grid grid-cols-[minmax(0,160px)_1fr] gap-x-4 gap-y-1 items-center">
                <Label className="text-right font-medium whitespace-nowrap">Spot ({editForm.currencyPair || "—"})</Label>
                <Input
                  type="number"
                  step="0.0001"
                  className="w-full"
                  value={editForm.spotPrice ?? ""}
                  onChange={(e) =>
                    setEditForm((f) => ({
                      ...f,
                      spotPrice: parseFloat(e.target.value) || 0,
                      notionalQuote: Math.round((f.notionalBase || 0) * (parseFloat(e.target.value) || 1) * 100) / 100,
                    }))
                  }
                />
              </div>

              {!(editForm.type.includes("touch") || editForm.type.includes("binary")) && (
                <div className="grid grid-cols-[minmax(0,160px)_1fr] gap-x-4 gap-y-1 items-center">
                  <Label className="text-right font-medium whitespace-nowrap">Strike</Label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      step="0.01"
                      value={editForm.strike ?? ""}
                      onChange={(e) => setEditForm((f) => ({ ...f, strike: e.target.value === "" ? (Number(f.spotPrice) || 0) : (parseFloat(e.target.value) || 0) }))}
                      className="flex-1"
                    />
                    <Select value={editForm.strikeType} onValueChange={(v: "percent" | "absolute") => setEditForm((f) => ({ ...f, strikeType: v }))}>
                      <SelectTrigger className="w-20">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="percent">
                          <span className="flex items-center gap-1">
                            <Percent className="w-3 h-3" /> %
                          </span>
                        </SelectItem>
                        <SelectItem value="absolute">
                          <span className="flex items-center gap-1">
                            <Hash className="w-3 h-3" /> Abs
                          </span>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <p className="col-span-2 text-xs text-muted-foreground">
                    {editForm.strikeType === "percent"
                      ? `Absolute: ${((Number(editForm.spotPrice) || 0) * (Number(editForm.strike) || 0) / 100).toFixed(4)}`
                      : `% of spot: ${((Number(editForm.strike) || 0) / (Number(editForm.spotPrice) || 1) * 100).toFixed(2)}%`}
                  </p>
                </div>
              )}

              <div className="grid grid-cols-[minmax(0,160px)_1fr] gap-x-4 gap-y-1 items-center">
                <Label className="text-right font-medium whitespace-nowrap">Maturity</Label>
                <Input type="date" className="w-full" value={editForm.maturity} onChange={(e) => setEditForm((f) => ({ ...f, maturity: e.target.value }))} />
              </div>

              <div className="grid grid-cols-[minmax(0,160px)_1fr] gap-x-4 gap-y-1 items-center">
                <Label className="text-right font-medium whitespace-nowrap">Notional ({editFormBaseCcy})</Label>
                <Input
                  type="number"
                  step="1000"
                  className="w-full"
                  value={editForm.notionalBase ?? ""}
                  onChange={(e) => {
                    const base = Number(e.target.value) || 0;
                    const spot = Number(editForm.spotPrice) || 1;
                    setEditForm((f) => ({ ...f, notionalBase: base, notionalQuote: Math.round(base * spot * 100) / 100 }));
                  }}
                />
              </div>
              <div className="grid grid-cols-[minmax(0,160px)_1fr] gap-x-4 gap-y-1 items-center">
                <Label className="text-right font-medium whitespace-nowrap">Notional ({editFormQuoteCcy})</Label>
                <Input
                  type="number"
                  step="1000"
                  className="w-full"
                  value={editForm.notionalQuote ?? ""}
                  onChange={(e) => {
                    const quote = Number(e.target.value) || 0;
                    const spot = Number(editForm.spotPrice) || 1;
                    if (spot > 0) setEditForm((f) => ({ ...f, notionalQuote: quote, notionalBase: Math.round(quote / spot * 100) / 100 }));
                  }}
                />
              </div>
              <div className="grid grid-cols-[minmax(0,160px)_1fr] gap-x-4 gap-y-1 items-center">
                <Label className="text-right font-medium whitespace-nowrap">Quantity (%)</Label>
                <Input type="number" step="1" className="w-full" value={editForm.quantity ?? ""} onChange={(e) => setEditForm((f) => ({ ...f, quantity: Number(e.target.value) || 0 }))} />
              </div>
              <div className="grid grid-cols-[minmax(0,160px)_1fr] gap-x-4">
                <span />
                <p className="text-xs text-muted-foreground">
                  Volume hedged = Notional ({editFormBaseCcy}) × Quantity% = {(Number(editForm.notionalBase) || 0) * (Number(editForm.quantity) || 0) / 100} {editFormBaseCcy}
                </p>
              </div>

              <div className="grid grid-cols-[minmax(0,160px)_1fr] gap-x-4 gap-y-1 items-center">
                <Label className="text-right font-medium whitespace-nowrap">Volatility (%)</Label>
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <Input type="number" step="0.1" className="w-full" value={editForm.volatility ?? ""} onChange={(e) => setEditForm((f) => ({ ...f, volatility: parseFloat(e.target.value) || 0 }))} />
                    {instrumentTypeUsesVolatility(editForm.type) && isPairMappableToFuturesInsights(editForm.currencyPair) && editForm.currencyPair && editForm.maturity && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={applyIvFromFuturesInsightsForEditForm}
                        disabled={fetchingIvFromFi}
                        className="shrink-0"
                      >
                        {fetchingIvFromFi ? "…" : "Apply IV from Futures"}
                      </Button>
                    )}
                  </div>
                  {instrumentTypeUsesVolatility(editForm.type) && isPairMappableToFuturesInsights(editForm.currencyPair) && (
                    <p className="text-xs text-muted-foreground">Strike × DTE → IV from Futures Insights (EUR/USD, GBP/USD, etc.)</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-[minmax(0,160px)_1fr] gap-x-4 gap-y-1 items-center">
                <Label className="text-right font-medium whitespace-nowrap">{editFormQuoteCcy} rate (%)</Label>
                <Input
                  type="number"
                  step="0.01"
                  className="w-full"
                  value={editForm.domesticRate ?? ""}
                  onChange={(e) => {
                    setEditForm((f) => ({ ...f, domesticRate: parseFloat(e.target.value) ?? 0 }));
                    setEditFormRateOverrides((prev) => ({ ...prev, domestic: true }));
                  }}
                />
              </div>
              <div className="grid grid-cols-[minmax(0,160px)_1fr] gap-x-4 gap-y-1 items-center">
                <Label className="text-right font-medium whitespace-nowrap">{editFormBaseCcy} rate (%)</Label>
                <Input
                  type="number"
                  step="0.01"
                  className="w-full"
                  value={editForm.foreignRate ?? ""}
                  onChange={(e) => {
                    setEditForm((f) => ({ ...f, foreignRate: parseFloat(e.target.value) ?? 0 }));
                    setEditFormRateOverrides((prev) => ({ ...prev, foreign: true }));
                  }}
                />
              </div>

              {(editForm.type.includes("knockout") || editForm.type.includes("knockin") || editForm.type.includes("touch")) && (
                <div className="grid grid-cols-[minmax(0,160px)_1fr] gap-x-4 gap-y-1 items-center">
                  <Label className="text-right font-medium whitespace-nowrap">{editForm.type.includes("touch") || editForm.type.includes("binary") ? "Barrier (trigger)" : "Barrier"}</Label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      step="0.01"
                      value={editForm.barrier === "" ? "" : editForm.barrier}
                      onChange={(e) => setEditForm((f) => ({ ...f, barrier: e.target.value === "" ? "" : parseFloat(e.target.value) }))}
                      className="flex-1 min-w-0"
                    />
                    <Select value={editForm.barrierType} onValueChange={(v: "percent" | "absolute") => setEditForm((f) => ({ ...f, barrierType: v }))}>
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

              {editForm.type.includes("double") && (
                <div className="grid grid-cols-[minmax(0,160px)_1fr] gap-x-4 gap-y-1 items-center">
                  <Label className="text-right font-medium whitespace-nowrap">{editForm.type.includes("touch") || editForm.type.includes("binary") ? "Second Barrier (trigger)" : "Second Barrier"}</Label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      step="0.01"
                      value={editForm.secondBarrier === "" ? "" : editForm.secondBarrier}
                      onChange={(e) => setEditForm((f) => ({ ...f, secondBarrier: e.target.value === "" ? "" : parseFloat(e.target.value) }))}
                      className="flex-1 min-w-0"
                    />
                    <Select value={editForm.barrierType} onValueChange={(v: "percent" | "absolute") => setEditForm((f) => ({ ...f, barrierType: v }))}>
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

              {(editForm.type.includes("touch") || editForm.type.includes("binary")) && (
                <>
                  <div className="grid grid-cols-[minmax(0,160px)_1fr] gap-x-4 gap-y-1 items-center">
                    <Label className="text-right font-medium whitespace-nowrap">Rebate (%)</Label>
                    <Input
                      type="number"
                      step="0.1"
                      placeholder="100.0"
                      className="w-full"
                      value={editForm.rebate === "" ? "" : editForm.rebate}
                      onChange={(e) => setEditForm((f) => ({ ...f, rebate: e.target.value === "" ? "" : parseFloat(e.target.value) }))}
                    />
                  </div>
                  <div className="grid grid-cols-[minmax(0,160px)_1fr] gap-x-4">
                    <span />
                    <p className="text-xs text-muted-foreground">Rebate as % of notional (default 100%)</p>
                  </div>
                </>
              )}

              <div className="border-t pt-4 mt-1 space-y-3">
                <p className="text-xs font-medium text-muted-foreground">Pricing</p>
                <div className="rounded-lg border bg-muted/40 p-3 space-y-1">
                  <div className="grid grid-cols-[minmax(0,160px)_1fr] gap-x-4 items-center">
                    <span className="text-sm font-medium text-muted-foreground text-right">Theoretical price</span>
                    <div className="font-mono font-semibold text-foreground break-all">
                      {editFormTheoreticalPrice != null ? `${editFormTheoreticalPrice.toFixed(6)} (quote/unit)` : "— Enter spot, maturity and params"}
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
                    value={editForm.realPrice === "" ? "" : editForm.realPrice}
                    onChange={(e) => setEditForm((f) => ({ ...f, realPrice: e.target.value === "" ? "" : parseFloat(e.target.value) }))}
                  />
                  <p className="text-xs text-muted-foreground mt-1">If filled, used for MTM (e.g. traded price). Otherwise theoretical.</p>
                </div>
              </div>

              <div className="grid grid-cols-[minmax(0,160px)_1fr] gap-x-4 gap-y-1 items-center">
                <Label className="text-right font-medium whitespace-nowrap">Counterparty</Label>
                <Select value={editForm.counterparty} onValueChange={(v) => setEditForm((f) => ({ ...f, counterparty: v }))}>
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
                <Label className="text-right font-medium whitespace-nowrap">Portfolio</Label>
                <Select value={editForm.portfolioId ?? "__none__"} onValueChange={(v) => setEditForm((f) => ({ ...f, portfolioId: v === "__none__" ? undefined : v }))}>
                  <SelectTrigger className="w-full min-w-[180px]">
                    <SelectValue placeholder="No portfolio" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">No portfolio</SelectItem>
                    {portfolios.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">Save Changes</Button>
              </DialogFooter>
            </form>
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

// (InstrumentEditForm removed: edit dialog now reuses the Add form UI/behavior.)