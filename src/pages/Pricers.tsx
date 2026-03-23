import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
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
import { useBankRates } from '@/hooks/useBankRates';
import { fetchCurrencies, fetchVolSurface } from '@/lib/api/barchart';
import type { SurfacePoint } from '@/lib/api/barchart';
import { getFuturesContractForPair, isPairMappableToFuturesInsights } from '@/lib/pricersFuturesMapping';
import { interpolateSurface, interpolateIVAtPoint } from '@/lib/volSurfaceInterpolation';
import { interpolateAtTenor } from "@/lib/rate-explorer/bootstrapping";
import { useRateExplorerDiscountFactors } from "@/hooks/useRateExplorerDiscountFactors";

// ─── Types ────────────────────────────────────────────────────────────────────

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

// ─── Constants ────────────────────────────────────────────────────────────────

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
  { value: 'outside-binary', label: 'Outside Binary (beta)', category: 'digital' },
];

// ─── Component ────────────────────────────────────────────────────────────────

const Pricers = () => {
  const { toast } = useToast();
  const bankRates = useBankRates();
  
  // Stable ExchangeRateService instance
  const exchangeRateService = useMemo(() => ExchangeRateService.getInstance(), []);

  // ── FIX BUG 6: stringify bankRates to detect actual value changes ──────────
  // useBankRates() may return a new object reference every render.
  // We memoize the specific values we need so dependent effects only fire when
  // the underlying numbers actually change.
  const bankRatesRef = useRef(bankRates);
  useEffect(() => { bankRatesRef.current = bankRates; });

  // ── Custom currency pairs ──────────────────────────────────────────────────
  const [customCurrencyPairs, setCustomCurrencyPairs] = useState<CurrencyPair[]>(() => {
    try {
      const saved = localStorage.getItem('customCurrencyPairs');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  
  // ── FIX BUG 4: stable storage listener — only update state when value actually changes ──
  useEffect(() => {
    // Serialise current value once so we can compare cheaply
    let lastSerialized = JSON.stringify(customCurrencyPairs);

    const sync = () => {
      try {
        const raw = localStorage.getItem('customCurrencyPairs');
        if (!raw || raw === lastSerialized) return; // no-op when identical
        lastSerialized = raw;
        setCustomCurrencyPairs(JSON.parse(raw));
      } catch {
        // ignore parse errors
      }
    };

    window.addEventListener('storage', sync);
    // Poll at 2 s instead of 1 s — still catches same-tab changes
    const interval = setInterval(sync, 2000);
    
    return () => {
      window.removeEventListener('storage', sync);
      clearInterval(interval);
    };
  }, []); // empty deps — intentional: we use a closure variable for comparison
  
  // ── Real-time rate fetch ───────────────────────────────────────────────────
  const fetchRealTimeRate = useCallback(async (currencyPair: CurrencyPair): Promise<number | null> => {
    try {
      const { base, quote } = currencyPair;
      const exchangeData = await exchangeRateService.getExchangeRates('USD');
      const rates = exchangeData.rates;
      
      let rate: number;
      if (base === 'USD') {
        rate = rates[quote] ?? currencyPair.defaultSpotRate;
      } else if (quote === 'USD') {
        rate = rates[base] ? 1 / rates[base] : currencyPair.defaultSpotRate;
      } else {
        const baseRate = rates[base] ?? 1;
        const quoteRate = rates[quote] ?? 1;
        rate = quoteRate / baseRate;
      }
      return rate;
    } catch {
      return null;
    }
  }, [exchangeRateService]);
  
  // ── Core state ────────────────────────────────────────────────────────────
  const [selectedInstrument, setSelectedInstrument] = useState('call');
  const [selectedCurrencyPair, setSelectedCurrencyPair] = useState('EUR/USD');
  const [barrierPricingModel, setBarrierPricingModel] = useState<'closed-form' | 'monte-carlo'>('closed-form');
  
  const [useFuturesInsightsIv, setUseFuturesInsightsIv] = useState(() => {
    try { return localStorage.getItem('pricersUseFuturesInsightsIv') === 'true'; }
    catch { return false; }
  });
  const [fetchingIvFromFi, setFetchingIvFromFi] = useState(false);

  const defaultMaturityDate = useMemo(() => {
    const today = new Date();
    const nextMonthRef = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    return PricingService.getMaturityDateForMonth(
      nextMonthRef.getFullYear(),
      nextMonthRef.getMonth() + 1
    ).toISOString().split('T')[0];
  }, []);

  const [pricingInputs, setPricingInputs] = useState({
    startDate: new Date().toISOString().split('T')[0],
    maturityDate: defaultMaturityDate,
    spotPrice: 1.1000,
    domesticRate: 5.0,
    foreignRate: 3.0,
    timeToMaturity: 1.0,
    volatility: 15.0,
    numSimulations: 1000,
  });

  // ── FIX BUG 1: Notional sync — no useEffect, handled directly in handlers ──
  // Previously two useEffects triggered each other in an infinite loop.
  // The correct pattern: update both values in the same handler call.
  const [notionalBase, setNotionalBase] = useState(1_000_000);
  const [notionalQuote, setNotionalQuote] = useState(1_000_000 * 1.1);

  const handleNotionalBaseChange = useCallback((value: number) => {
    const safe = isNaN(value) ? 0 : value;
    setNotionalBase(safe);
    setNotionalQuote(Number((safe * (pricingInputs.spotPrice || 1)).toFixed(2)));
  }, [pricingInputs.spotPrice]);

  const handleNotionalQuoteChange = useCallback((value: number) => {
    const safe = isNaN(value) ? 0 : value;
    setNotionalQuote(safe);
    setNotionalBase(Number((safe / (pricingInputs.spotPrice || 1)).toFixed(2)));
  }, [pricingInputs.spotPrice]);

  // Keep notionalQuote in sync when spot price changes (only from external source,
  // not from user editing — so we guard with a ref to avoid the old loop pattern)
  const prevSpotRef = useRef(pricingInputs.spotPrice);
  useEffect(() => {
    const newSpot = pricingInputs.spotPrice;
    if (newSpot !== prevSpotRef.current && prevSpotRef.current !== 0) {
      // Recalculate quote from the authoritative base value
      setNotionalQuote(Number((notionalBase * newSpot).toFixed(2)));
    }
    prevSpotRef.current = newSpot;
  }, [pricingInputs.spotPrice]); // notionalBase intentionally omitted — we only react to spot changes

  const [strategyComponent, setStrategyComponent] = useState<StrategyComponent>({
    type: 'call',
    strike: 110.0,
    strikeType: 'percent',
    volatility: 15.0,
    quantity: 100,
    barrier: undefined,
    barrierType: 'absolute',
    secondBarrier: undefined,
    rebate: 100.0,
    timeToPayoff: 1.0,
  });

  const [pricingResults, setPricingResults] = useState<PricingResult[]>([]);
  const [isCalculating, setIsCalculating] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showGreeks, setShowGreeks] = useState(true);

  // Guard to avoid overwriting user-edited rates with curve-derived rates
  const [rateOverrides, setRateOverrides] = useState<{ domestic: boolean; foreign: boolean }>({
    domestic: false,
    foreign: false,
  });

  // ── Maturity calculation ───────────────────────────────────────────────────
  const calculateTimeToMaturity = useCallback(() => {
    return PricingService.calculateTimeToMaturity(
      pricingInputs.maturityDate,
      pricingInputs.startDate
    );
  }, [pricingInputs.maturityDate, pricingInputs.startDate]);

  useEffect(() => {
    const t = calculateTimeToMaturity();
    setPricingInputs(prev => ({ ...prev, timeToMaturity: t }));
  }, [calculateTimeToMaturity]);

  // ── Initial market data sync (once on mount) ───────────────────────────────
  const hasSyncedOnMount = useRef(false);
  useEffect(() => {
    if (hasSyncedOnMount.current) return;

    const syncMarketData = async () => {
    const allPairs = [...CURRENCY_PAIRS, ...customCurrencyPairs];
    const pair = allPairs.find(p => p.symbol === selectedCurrencyPair);
      if (!pair) return;

      try {
        const domesticCurrency = pair.quote;
        const foreignCurrency = pair.base;
        const rates = bankRatesRef.current;
        const newDomesticRate = rates[domesticCurrency] ?? null;
        const newForeignRate = rates[foreignCurrency] ?? null;
        const realTimeRate = await fetchRealTimeRate(pair);

        setPricingInputs(prev => ({
          ...prev,
          ...(realTimeRate !== null && !isNaN(realTimeRate) && realTimeRate > 0
            ? { spotPrice: realTimeRate }
            : {}),
          ...(newDomesticRate !== null ? { domesticRate: newDomesticRate } : {}),
          ...(newForeignRate !== null ? { foreignRate: newForeignRate } : {}),
        }));
      } catch (err) {
        console.error('Error syncing market data on load:', err);
      } finally {
        hasSyncedOnMount.current = true;
      }
    };

    const id = setTimeout(syncMarketData, 500);
    return () => clearTimeout(id);
  }, []); // intentionally empty — runs once on mount

  // ── FIX BUG 6: currency pair change — read bankRates from ref to avoid dep instability ──
  useEffect(() => {
    const allPairs = [...CURRENCY_PAIRS, ...customCurrencyPairs];
    const pair = allPairs.find(p => p.symbol === selectedCurrencyPair);
    if (!pair) return;

    const rates = bankRatesRef.current;
    const newDomesticRate = rates[pair.quote] ?? null;
    const newForeignRate = rates[pair.base] ?? null;

    setPricingInputs(prev => ({
      ...prev,
      spotPrice: pair.defaultSpotRate,
      ...(newDomesticRate !== null ? { domesticRate: newDomesticRate } : {}),
      ...(newForeignRate !== null ? { foreignRate: newForeignRate } : {}),
    }));

    // Fetch live rate silently
    fetchRealTimeRate(pair).then(rate => {
      if (rate !== null && !isNaN(rate) && rate > 0) {
        setPricingInputs(prev => ({ ...prev, spotPrice: rate }));
      }
    }).catch(console.error);
  }, [selectedCurrencyPair, customCurrencyPairs, fetchRealTimeRate]);
  // bankRates deliberately excluded — we read from ref instead

  // ── Instrument type → strategy component sync ──────────────────────────────
  useEffect(() => {
    setStrategyComponent(prev => ({ ...prev, type: selectedInstrument as StrategyComponent['type'] }));
  }, [selectedInstrument]);

  // ── Persist IV preference ──────────────────────────────────────────────────
  useEffect(() => {
    try { localStorage.setItem('pricersUseFuturesInsightsIv', useFuturesInsightsIv ? 'true' : 'false'); }
    catch { /* ignore */ }
  }, [useFuturesInsightsIv]);

  // ── Futures Insights IV ────────────────────────────────────────────────────
  const applyIvFromFuturesInsights = useCallback(async () => {
    if (!isPairMappableToFuturesInsights(selectedCurrencyPair)) return;
    setFetchingIvFromFi(true);
    try {
      const currenciesRes = await fetchCurrencies(false);
      if (!currenciesRes.success || !currenciesRes.data?.length) {
        toast({ title: "Futures Insights", description: "Could not load futures list.", variant: "destructive" });
        return;
      }
      const contract = getFuturesContractForPair(selectedCurrencyPair, currenciesRes.data);
      if (!contract) {
        toast({ title: "No mapping", description: `No Futures Insights contract found for ${selectedCurrencyPair}.`, variant: "destructive" });
        return;
      }
      const surfaceRes = await fetchVolSurface(contract, contract, 50, false, undefined, undefined);
      if (!surfaceRes.success || !surfaceRes.surfacePoints?.length) {
        toast({ title: "Surface fetch failed", description: surfaceRes.error ?? "Could not load vol surface.", variant: "destructive" });
        return;
      }
      const points: SurfacePoint[] = surfaceRes.surfacePoints;
      const optionType: 'call' | 'put' =
        selectedInstrument === 'put' || selectedInstrument.startsWith('put-') ? 'put' : 'call';
      const filtered = points.filter(p => p.type === optionType);
      if (!filtered.length) {
        toast({ title: "No IV data", description: `No ${optionType} surface points.`, variant: "destructive" });
        return;
      }
      const strikes = [...new Set(filtered.map(p => p.strike))].sort((a, b) => a - b);
      const dtes = [...new Set(filtered.map(p => p.dte))].sort((a, b) => a - b);
      const pointMap = new Map(filtered.map(p => [`${p.dte}-${p.strike}`, p]));
      let z: (number | null)[][] = dtes.map(dte =>
        strikes.map(strike => {
          const iv = pointMap.get(`${dte}-${strike}`)?.iv ?? null;
          return iv !== null && iv > 0 ? iv : null;
        })
      );
      z = interpolateSurface(z, strikes, dtes);

      const strikeAbs = strategyComponent.strikeType === 'percent'
        ? pricingInputs.spotPrice * (strategyComponent.strike / 100)
        : strategyComponent.strike;
      const dteDays = Math.round(
        PricingService.calculateTimeToMaturity(pricingInputs.maturityDate, pricingInputs.startDate) * 365.25
      );
      const iv = interpolateIVAtPoint(strikes, dtes, z, strikeAbs, dteDays);
      if (iv == null || iv <= 0) {
        toast({ title: "IV interpolation", description: "No interpolated IV for this strike & DTE. Check surface range.", variant: "destructive" });
        return;
      }
      setStrategyComponent(prev => ({ ...prev, volatility: iv }));
      toast({
        title: "IV applied (interpolation)",
        description: `Volatility ${iv.toFixed(2)}% from ${optionType} surface at strike ${strikeAbs.toFixed(4)}, DTE ${dteDays} (${contract}).`,
      });
    } catch (e) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "Failed to fetch IV.", variant: "destructive" });
    } finally {
      setFetchingIvFromFi(false);
    }
  }, [selectedCurrencyPair, selectedInstrument, strategyComponent, pricingInputs, toast]);

  // ── Core pricing calculation ───────────────────────────────────────────────
  const calculatePrice = useCallback(async (showToastNotif: boolean = true) => {
    setIsCalculating(true);
    try {
      const strike = strategyComponent.strikeType === 'percent' 
        ? pricingInputs.spotPrice * (strategyComponent.strike / 100)
        : strategyComponent.strike;
        
      const barrier = strategyComponent.barrier !== undefined ? (
        strategyComponent.barrierType === 'percent'
          ? pricingInputs.spotPrice * (strategyComponent.barrier / 100)
          : strategyComponent.barrier
      ) : undefined;

      const secondBarrier = strategyComponent.secondBarrier !== undefined ? (
        strategyComponent.barrierType === 'percent'
          ? pricingInputs.spotPrice * (strategyComponent.secondBarrier / 100)
          : strategyComponent.secondBarrier
      ) : undefined;

      const underlying = pricingInputs.spotPrice;
      let price = 0;
      let methodName = '';
      
      if (strategyComponent.type === 'forward') {
        price = PricingService.calculateFXForwardPrice(
          underlying,
          pricingInputs.domesticRate / 100,
          pricingInputs.foreignRate / 100,
          pricingInputs.timeToMaturity
        ) - strike;
        methodName = 'Forward Pricing';
      } else if (strategyComponent.type === 'swap') {
        const fwd = PricingService.calculateFXForwardPrice(
          underlying,
          pricingInputs.domesticRate / 100,
          pricingInputs.foreignRate / 100,
          pricingInputs.timeToMaturity
        );
        price = PricingService.calculateSwapPrice([fwd], [pricingInputs.timeToMaturity], pricingInputs.domesticRate / 100);
        methodName = 'Swap Pricing';
      } else if (strategyComponent.type === 'call' || strategyComponent.type === 'put') {
        price = PricingService.calculateGarmanKohlhagenPrice(
          strategyComponent.type, underlying, strike,
          pricingInputs.domesticRate / 100, pricingInputs.foreignRate / 100,
          pricingInputs.timeToMaturity, strategyComponent.volatility / 100
        );
        methodName = 'Garman-Kohlhagen (Spot)';
      } else if (strategyComponent.type.includes('knockout') || strategyComponent.type.includes('knockin')) {
        if (barrierPricingModel === 'closed-form') {
          price = PricingService.calculateBarrierOptionClosedForm(
            strategyComponent.type, underlying, strike,
            pricingInputs.domesticRate / 100, pricingInputs.timeToMaturity,
            strategyComponent.volatility / 100, barrier ?? 0, secondBarrier
          );
          methodName = 'Barrier Closed-Form (Spot)';
        } else {
          price = PricingService.calculateBarrierOptionPrice(
            strategyComponent.type, underlying, strike,
            pricingInputs.domesticRate / 100, pricingInputs.timeToMaturity,
            strategyComponent.volatility / 100, barrier ?? 0, secondBarrier, 1000
          );
          methodName = 'Barrier Monte Carlo (Spot)';
        }
      } else {
        const useClosedForm = barrierPricingModel === 'closed-form';
        price = PricingService.calculateDigitalOptionPrice(
          strategyComponent.type, underlying, strike,
          pricingInputs.domesticRate / 100, pricingInputs.foreignRate / 100,
          pricingInputs.timeToMaturity, strategyComponent.volatility / 100,
          barrier, secondBarrier,
          pricingInputs.numSimulations, strategyComponent.rebate ?? 1, useClosedForm
        );
        methodName = useClosedForm
          ? 'Digital Closed-Form (Garman-Kohlhagen)'
          : 'Digital Monte Carlo (Garman-Kohlhagen)';
      }

      let greeks: Greeks | undefined;
      if (showGreeks && strategyComponent.type !== 'forward' && strategyComponent.type !== 'swap') {
        try {
          greeks = PricingService.calculateGreeks(
            strategyComponent.type, underlying, strike,
            pricingInputs.domesticRate / 100, pricingInputs.foreignRate / 100,
            pricingInputs.timeToMaturity, strategyComponent.volatility / 100,
            barrier, secondBarrier, strategyComponent.rebate ?? 1
          );
        } catch (err) {
          console.warn('Greeks calculation error:', err);
        }
      }

      const results: PricingResult[] = [];
      if (price !== undefined && !isNaN(price)) {
        results.push({ price: price * strategyComponent.quantity / 100, method: methodName, greeks });
      }
      setPricingResults(results);
      
      if (showToastNotif) {
        toast({ title: "Calculation completed", description: `${results.length} pricing method(s) applied` });
      }
    } catch (err) {
      console.error('Pricing error:', err);
      if (showToastNotif) {
        toast({ title: "Calculation Error", description: "An error occurred during price calculation", variant: "destructive" });
      }
    } finally {
      setIsCalculating(false);
    }
  }, [strategyComponent, pricingInputs, barrierPricingModel, showGreeks, toast]);

  // ── FIX BUG 5: Auto-recalculate — pricingResults removed from deps ─────────
  // The previous version had pricingResults in its dependency array, which caused:
  //   calculatePrice → setPricingResults → effect fires → calculatePrice → loop
  // Solution: track "has calculated at least once" with a ref, and never include
  // pricingResults itself in the deps of the effect that calls calculatePrice.
  const hasCalculatedOnce = useRef(false);
  useEffect(() => {
    if (!hasCalculatedOnce.current) return;

    const id = setTimeout(() => {
      calculatePrice(false);
    }, 500);
    return () => clearTimeout(id);
  }, [
    // All meaningful inputs — but NOT pricingResults
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
    barrierPricingModel,
    notionalBase,
    notionalQuote,
    showGreeks,
    calculatePrice,
  ]);

  const handleCalculateClick = () => {
    hasCalculatedOnce.current = true;
    calculatePrice(true);
  };

  // ── Input helpers ──────────────────────────────────────────────────────────
  const updatePricingInput = useCallback(<K extends keyof typeof pricingInputs>(
    field: K, value: typeof pricingInputs[K]
  ) => {
    setPricingInputs(prev => ({ ...prev, [field]: value }));
  }, []);

  const updateStrategyComponent = useCallback(<K extends keyof StrategyComponent>(
    field: K, value: StrategyComponent[K]
  ) => {
    setStrategyComponent(prev => ({ ...prev, [field]: value }));
  }, []);

  // ── Derived display values ─────────────────────────────────────────────────
  const allPairs = useMemo(
    () => [...CURRENCY_PAIRS, ...customCurrencyPairs],
    [customCurrencyPairs]
  );
  const selectedPair = useMemo(
    () => allPairs.find(p => p.symbol === selectedCurrencyPair),
    [allPairs, selectedCurrencyPair]
  );

  const spot = pricingInputs.spotPrice;
  const base = selectedPair?.base ?? 'EUR';
  const quote = selectedPair?.quote ?? 'USD';

  // ── Rate Explorer curve-derived rates (used to price) ────────────────
  const bootstrapMethod: any = "cubic_spline";
  const domesticCurve = useRateExplorerDiscountFactors(quote, bootstrapMethod);
  const foreignCurve = useRateExplorerDiscountFactors(base, bootstrapMethod);

  const interpolatedDomestic = useMemo(() => {
    if (!domesticCurve.discountFactors) return null;
    if (pricingInputs.timeToMaturity <= 0) return null;
    return interpolateAtTenor(domesticCurve.discountFactors, pricingInputs.timeToMaturity);
  }, [domesticCurve.discountFactors, pricingInputs.timeToMaturity]);

  const interpolatedForeign = useMemo(() => {
    if (!foreignCurve.discountFactors) return null;
    if (pricingInputs.timeToMaturity <= 0) return null;
    return interpolateAtTenor(foreignCurve.discountFactors, pricingInputs.timeToMaturity);
  }, [foreignCurve.discountFactors, pricingInputs.timeToMaturity]);

  // When curve values are available, update rates used by pricing inputs.
  useEffect(() => {
    const nextDomestic =
      interpolatedDomestic ? interpolatedDomestic.zeroRate * 100 : null;
    const nextForeign =
      interpolatedForeign ? interpolatedForeign.zeroRate * 100 : null;

    setPricingInputs((prev) => {
      let updated = prev;
      const eps = 1e-7;

      if (nextDomestic !== null && !rateOverrides.domestic) {
        if (Math.abs(prev.domesticRate - nextDomestic) > eps) {
          updated = { ...updated, domesticRate: nextDomestic };
        }
      }
      if (nextForeign !== null && !rateOverrides.foreign) {
        if (Math.abs(prev.foreignRate - nextForeign) > eps) {
          updated = { ...updated, foreignRate: nextForeign };
        }
      }
      return updated;
    });
  }, [
    interpolatedDomestic?.zeroRate,
    interpolatedForeign?.zeroRate,
    rateOverrides.domestic,
    rateOverrides.foreign,
  ]);

  // Reset manual overrides when user changes the currency pair
  useEffect(() => {
    setRateOverrides({ domestic: false, foreign: false });
  }, [selectedCurrencyPair]);

  const strikeAbs = strategyComponent.strikeType === 'percent'
    ? spot * (strategyComponent.strike / 100)
    : strategyComponent.strike;

  const barrierAbs = strategyComponent.barrier !== undefined
    ? (strategyComponent.barrierType === 'percent'
        ? spot * strategyComponent.barrier / 100
        : strategyComponent.barrier)
    : undefined;

  const secondBarrierAbs = strategyComponent.secondBarrier !== undefined
    ? (strategyComponent.barrierType === 'percent'
        ? spot * strategyComponent.secondBarrier / 100
        : strategyComponent.secondBarrier)
    : undefined;

  const premiumQuote = pricingResults.length > 0 ? pricingResults[0].price * notionalBase : 0;
  const premiumBase = premiumQuote / spot;

  // ── FIX BUG 2 & 3: memoize heavy chart computations ───────────────────────
  // Previously these were called inline at render time — every re-render triggered
  // 101 full option price computations (and another 101 for payoff), blocking the
  // JS thread. useMemo ensures they only recompute when their inputs actually change.

  const payoffData = useMemo(() => {
    const priceRange = Array.from({ length: 101 }, (_, i) => spot * (0.7 + i * 0.006));
    const premium = pricingResults.length > 0 ? pricingResults[0].price : 0;
    return priceRange.map(price => {
      let totalPayoff = PricingService.calculateStrategyPayoffAtPrice([strategyComponent], price, spot);
      if (premium !== 0 && strategyComponent.quantity !== 0) {
        const qty = strategyComponent.quantity / 100;
        totalPayoff += qty > 0 ? -premium : premium;
      }
      return { price, payoff: totalPayoff };
    });
  }, [strategyComponent, spot, pricingResults]);

  const priceData = useMemo(() => {
    const currentSpot = pricingInputs.spotPrice;
    const spotRange = Array.from({ length: 101 }, (_, i) => currentSpot * (0.7 + i * 0.006));
    
    return spotRange.map(s => {
      try {
        const strike = strategyComponent.strikeType === 'percent' 
          ? currentSpot * (strategyComponent.strike / 100)
          : strategyComponent.strike;
          
        const barrier = strategyComponent.barrier !== undefined
          ? (strategyComponent.barrierType === 'percent'
            ? currentSpot * (strategyComponent.barrier / 100)
              : strategyComponent.barrier)
          : undefined;

        const secondBarrier = strategyComponent.secondBarrier !== undefined
          ? (strategyComponent.barrierType === 'percent'
            ? currentSpot * (strategyComponent.secondBarrier / 100)
              : strategyComponent.secondBarrier)
          : undefined;
        
        let price = 0;
        let greeks: Greeks | undefined;
        
        if (strategyComponent.type === 'forward') {
          price = PricingService.calculateFXForwardPrice(
            s, pricingInputs.domesticRate / 100, pricingInputs.foreignRate / 100, pricingInputs.timeToMaturity
          ) - strike;
        } else if (strategyComponent.type === 'swap') {
          const fwd = PricingService.calculateFXForwardPrice(
            s, pricingInputs.domesticRate / 100, pricingInputs.foreignRate / 100, pricingInputs.timeToMaturity
          );
          price = PricingService.calculateSwapPrice([fwd], [pricingInputs.timeToMaturity], pricingInputs.domesticRate / 100);
        } else if (strategyComponent.type === 'call' || strategyComponent.type === 'put') {
          price = PricingService.calculateGarmanKohlhagenPrice(
            strategyComponent.type, s, strike,
            pricingInputs.domesticRate / 100, pricingInputs.foreignRate / 100,
            pricingInputs.timeToMaturity, strategyComponent.volatility / 100
          );
          if (showGreeks) {
            try {
            greeks = PricingService.calculateGreeks(
                strategyComponent.type, s, strike,
                pricingInputs.domesticRate / 100, pricingInputs.foreignRate / 100,
                pricingInputs.timeToMaturity, strategyComponent.volatility / 100,
                barrier, secondBarrier, strategyComponent.rebate ?? 1
              );
            } catch { /* ignore */ }
          }
        } else if (strategyComponent.type.includes('knockout') || strategyComponent.type.includes('knockin')) {
          price = barrierPricingModel === 'closed-form'
            ? PricingService.calculateBarrierOptionClosedForm(
                strategyComponent.type, s, strike,
                pricingInputs.domesticRate / 100, pricingInputs.timeToMaturity,
                strategyComponent.volatility / 100, barrier ?? 0, secondBarrier
              )
            : PricingService.calculateBarrierOptionPrice(
                strategyComponent.type, s, strike,
                pricingInputs.domesticRate / 100, pricingInputs.timeToMaturity,
                strategyComponent.volatility / 100, barrier ?? 0, secondBarrier, 1000
              );
          if (showGreeks) {
            try {
              greeks = PricingService.calculateGreeks(
                strategyComponent.type, s, strike,
                pricingInputs.domesticRate / 100, pricingInputs.foreignRate / 100,
                pricingInputs.timeToMaturity, strategyComponent.volatility / 100,
                barrier, secondBarrier, strategyComponent.rebate ?? 1
              );
            } catch { /* ignore */ }
          }
        } else {
          const useClosedForm = barrierPricingModel === 'closed-form';
          price = PricingService.calculateDigitalOptionPrice(
            strategyComponent.type, s, strike,
            pricingInputs.domesticRate / 100, pricingInputs.foreignRate / 100,
            pricingInputs.timeToMaturity, strategyComponent.volatility / 100,
            barrier, secondBarrier,
            pricingInputs.numSimulations, strategyComponent.rebate ?? 1, useClosedForm
          );
        }
        
        return { 
          spot: parseFloat(s.toFixed(4)),
          price: price * strategyComponent.quantity / 100,
          delta: greeks?.delta ?? 0,
          gamma: greeks?.gamma ?? 0,
          theta: greeks?.theta ?? 0,
          vega: greeks?.vega ?? 0,
          rho: greeks?.rho ?? 0,
        };
      } catch {
        return { spot: parseFloat(s.toFixed(4)), price: 0, delta: 0, gamma: 0, theta: 0, vega: 0, rho: 0 };
      }
    });
  }, [
    strategyComponent,
    pricingInputs.spotPrice,
    pricingInputs.domesticRate,
    pricingInputs.foreignRate,
    pricingInputs.timeToMaturity,
    pricingInputs.numSimulations,
    barrierPricingModel,
    showGreeks,
  ]);

  // ── Formatting helpers ─────────────────────────────────────────────────────
  const formatPrice = (p: number) =>
    new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 4, maximumFractionDigits: 6 }).format(p);

  const formatGreek = (v: number) =>
    new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 4, maximumFractionDigits: 6 }).format(v);

  const getMethodIcon = (method: string) => {
    if (method.includes('Closed-Form') || method.includes('Garman-Kohlhagen')) return <CheckCircle className="h-4 w-4" />;
    if (method.includes('Monte Carlo')) return <BarChart3 className="h-4 w-4" />;
    if (method.includes('Forward') || method.includes('Swap')) return <TrendingUp className="h-4 w-4" />;
    return <Calculator className="h-4 w-4" />;
  };

  const getMethodColor = (method: string) => {
    if (method.includes('Garman-Kohlhagen') || method.includes('Closed-Form'))
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
    if (method.includes('Monte Carlo') || method.includes('Digital'))
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
    if (method.includes('Forward') || method.includes('Swap'))
      return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200';
    return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
  };

  const getGreekColor = (value: number, type: 'delta' | 'gamma' | 'theta' | 'vega' | 'rho') => {
    if (type === 'theta') return value < 0 ? 'text-red-600' : 'text-green-600';
    if (type === 'gamma') return value > 0 ? 'text-green-600' : 'text-red-600';
    return 'text-gray-900 dark:text-gray-100';
  };

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <Layout>
      <div className="w-full px-4 md:px-6 xl:px-8 py-6">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Calculator className="h-8 w-8" />
              FX Pricers
            </h1>
            <p className="text-muted-foreground mt-1">
              Advanced pricing engine for options, swaps and forwards
            </p>
          </div>
          <Button onClick={handleCalculateClick} disabled={isCalculating} size="lg">
            {isCalculating ? (
              <><Clock className="h-4 w-4 mr-2 animate-spin" />Calculating...</>
            ) : (
              <><Calculator className="h-4 w-4 mr-2" />Calculate</>
            )}
          </Button>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

          {/* ── Left panel: configuration ── */}
          <div className="xl:col-span-1 space-y-4">

            {/* Instrument selection */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Settings className="h-4 w-4" />
                  Configuration
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">

                {/* Instrument type */}
                <div className="space-y-1.5">
                  <Label>Instrument Type</Label>
                  <Select
                    value={selectedInstrument}
                    onValueChange={value => {
                      setSelectedInstrument(value);
                    if (value.includes('touch') || value.includes('binary')) {
                        const s = pricingInputs.spotPrice;
                        setStrategyComponent(prev => ({
                          ...prev,
                          type: value as StrategyComponent['type'],
                          rebate: prev.rebate ?? 100.0,
                          barrierType: prev.barrierType ?? 'absolute',
                          barrier: prev.barrier ?? s * 1.05,
                        secondBarrier: (value.includes('double') || value.includes('range') || value.includes('outside')) 
                            ? (prev.secondBarrier ?? s * 0.95)
                            : prev.secondBarrier,
                        }));
                      }
                    }}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {INSTRUMENT_TYPES.map(inst => (
                        <SelectItem key={inst.value} value={inst.value}>{inst.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Pricing model (barriers / digitals) */}
                {((selectedInstrument.includes('knockout') || selectedInstrument.includes('knockin') ||
                   selectedInstrument.includes('one-touch') || selectedInstrument.includes('no-touch') ||
                   selectedInstrument.includes('double-touch') || selectedInstrument.includes('double-no-touch') ||
                   selectedInstrument.includes('range-binary') || selectedInstrument.includes('outside-binary'))) && (
                  <div className="space-y-1.5">
                    <Label>Pricing Method</Label>
                    <Select value={barrierPricingModel} onValueChange={v => setBarrierPricingModel(v as typeof barrierPricingModel)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="closed-form">
                          <div className="flex items-center gap-2"><CheckCircle className="h-3 w-3" />Closed-Form (Analytical)</div>
                        </SelectItem>
                        <SelectItem value="monte-carlo">
                          <div className="flex items-center gap-2"><BarChart3 className="h-3 w-3" />Monte Carlo (Simulation)</div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      {barrierPricingModel === 'closed-form' 
                        ? 'Uses exact analytical formulas for barrier and digital options'
                        : 'Uses Monte Carlo simulations for barrier and digital options'}
                    </p>
                  </div>
                )}

                {/* Greeks toggle */}
                {selectedInstrument !== 'forward' && selectedInstrument !== 'swap' && (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <Switch checked={showGreeks} onCheckedChange={setShowGreeks} id="greeks-toggle" />
                      <Label htmlFor="greeks-toggle">Calculate Greeks</Label>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {showGreeks 
                        ? 'Delta, Gamma, Theta, Vega and Rho will be calculated with analytical formulas'
                        : 'Greeks will not be calculated (performance gain)'}
                    </p>
                  </div>
                )}

                {/* Currency pair */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label>Currency Pair</Label>
                    <Badge variant="outline" className="text-xs">Synced with Market Data</Badge>
                  </div>
                  <Select 
                    value={selectedCurrencyPair} 
                    onValueChange={async value => {
                      setSelectedCurrencyPair(value);
                      const pair = allPairs.find(p => p.symbol === value);
                      if (!pair) return;

                      const rates = bankRatesRef.current;
                      const newDom = rates[pair.quote] ?? null;
                      const newFor = rates[pair.base] ?? null;

                        setPricingInputs(prev => ({
                          ...prev,
                        spotPrice: pair.defaultSpotRate,
                        ...(newDom !== null ? { domesticRate: newDom } : {}),
                        ...(newFor !== null ? { foreignRate: newFor } : {}),
                      }));

                      toast({ title: "Fetching Rate…", description: `Loading real-time rate for ${pair.symbol}…` });

                      try {
                        const rate = await fetchRealTimeRate(pair);
                        if (rate !== null && !isNaN(rate) && rate > 0) {
                          setPricingInputs(prev => ({ ...prev, spotPrice: rate }));
                          toast({ title: "Rate Updated", description: `${pair.symbol}: ${rate.toFixed(4)}` });
                          } else {
                          toast({ title: "Rate Fetch Failed", description: `Using default rate for ${pair.symbol}` });
                        }
                      } catch {
                        toast({ title: "Rate Fetch Error", description: "Could not fetch rate. Using default value.", variant: "destructive" });
                      }

                      if (newDom !== null) {
                        toast({ title: "Bank Rates Updated", description: `${pair.quote}: ${newDom?.toFixed(2)}% / ${pair.base}: ${newFor?.toFixed(2)}%` });
                      }
                    }}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <div className="px-2 py-1 text-xs font-medium text-muted-foreground">Major Pairs</div>
                      {CURRENCY_PAIRS.filter(p => p.category === 'majors').map(pair => (
                        <SelectItem key={pair.symbol} value={pair.symbol}>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-medium">{pair.symbol}</span>
                            <span className="text-muted-foreground text-xs">{pair.name}</span>
                          </div>
                        </SelectItem>
                      ))}
                      <div className="px-2 py-1 text-xs font-medium text-muted-foreground">Cross Rates</div>
                      {CURRENCY_PAIRS.filter(p => p.category === 'crosses').map(pair => (
                        <SelectItem key={pair.symbol} value={pair.symbol}>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-medium">{pair.symbol}</span>
                            <span className="text-muted-foreground text-xs">{pair.name}</span>
                          </div>
                        </SelectItem>
                      ))}
                      <div className="px-2 py-1 text-xs font-medium text-muted-foreground">Other Currencies</div>
                      {CURRENCY_PAIRS.filter(p => p.category === 'others').map(pair => (
                        <SelectItem key={pair.symbol} value={pair.symbol}>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-medium">{pair.symbol}</span>
                            <span className="text-muted-foreground text-xs">{pair.name}</span>
                          </div>
                        </SelectItem>
                      ))}
                      {customCurrencyPairs.length > 0 && (
                        <>
                          <div className="px-2 py-1 text-xs font-medium text-muted-foreground">Custom Pairs</div>
                          {customCurrencyPairs.map(pair => (
                            <SelectItem key={pair.symbol} value={pair.symbol}>
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-medium">{pair.symbol}</span>
                                <span className="text-muted-foreground text-xs">{pair.name}</span>
                              </div>
                            </SelectItem>
                          ))}
                        </>
                      )}
                    </SelectContent>
                  </Select>
                </div>

                {/* Futures Insights IV toggle */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={useFuturesInsightsIv}
                      onCheckedChange={setUseFuturesInsightsIv}
                      id="fi-toggle"
                    />
                    <Label htmlFor="fi-toggle">Use IV from Futures Insights</Label>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    When enabled, you can apply implied volatility from Futures Insights for:
                    EUR/USD, GBP/USD, AUD/USD, USD/JPY, USD/CHF, USD/CAD, USD/MXN.
                  </p>
                </div>

              </CardContent>
            </Card>

            {/* Dates */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Calendar className="h-4 w-4" />
                  Dates
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Start Date</Label>
                  <Input
                    type="date"
                    value={pricingInputs.startDate}
                    onChange={e => updatePricingInput('startDate', e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Maturity Date</Label>
                  <Input
                    type="date"
                    value={pricingInputs.maturityDate}
                    onChange={e => updatePricingInput('maturityDate', e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Maturity (years)</Label>
                  <Input value={pricingInputs.timeToMaturity.toFixed(4)} readOnly className="bg-muted" />
                </div>
              </CardContent>
            </Card>

            {/* Basic parameters */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Basic Parameters</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">

                {/* Spot */}
                <div className="space-y-1.5">
                  <Label>Spot Price ({selectedPair?.symbol ?? 'EUR/USD'})</Label>
                  <Input
                    type="number"
                    value={pricingInputs.spotPrice}
                    onChange={e => updatePricingInput('spotPrice', parseFloat(e.target.value))}
                  />
                </div>

                {/* Strike */}
                  {!(selectedInstrument.includes('touch') || selectedInstrument.includes('binary')) && (
                  <div className="space-y-1.5">
                  <Label>Strike Price</Label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      value={strategyComponent.strike}
                        onChange={e => updateStrategyComponent('strike', parseFloat(e.target.value))}
                      className="flex-1"
                    />
                      <Select
                        value={strategyComponent.strikeType}
                        onValueChange={v => updateStrategyComponent('strikeType', v as 'percent' | 'absolute')}
                      >
                        <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                      <SelectContent>
                          <SelectItem value="percent"><div className="flex items-center gap-1"><Percent className="h-3 w-3" />%</div></SelectItem>
                          <SelectItem value="absolute"><div className="flex items-center gap-1"><Hash className="h-3 w-3" />Abs</div></SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                    <p className="text-xs text-muted-foreground">
                    {strategyComponent.strikeType === 'percent' 
                      ? `Absolute value: ${(pricingInputs.spotPrice * strategyComponent.strike / 100).toFixed(4)}`
                        : `Percentage: ${((strategyComponent.strike / pricingInputs.spotPrice) * 100).toFixed(2)}%`}
                    </p>
                  </div>
                  )}

                {/* Quantity */}
                <div className="space-y-1.5">
                  <Label>Quantity</Label>
                  <Input
                    type="number"
                    value={strategyComponent.quantity}
                    onChange={e => updateStrategyComponent('quantity', parseInt(e.target.value))}
                  />
                </div>

                {/* Notionals */}
                  <div className="space-y-2">
                  <Label>Notionnels</Label>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Notional {selectedPair?.base ?? 'EUR'}</Label>
                    <Input
                      type="number"
                      value={notionalBase}
                      onChange={e => handleNotionalBaseChange(parseFloat(e.target.value) || 0)}
                      className="text-right"
                    />
                  </div>
                  <Separator />
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Notional {selectedPair?.quote ?? 'USD'}</Label>
                    <Input
                      type="number"
                      value={notionalQuote}
                      onChange={e => handleNotionalQuoteChange(parseFloat(e.target.value) || 0)}
                      className="text-right"
                    />
                  </div>
                  <div className="text-xs text-muted-foreground space-y-0.5">
                    <div>📊 Rate: {pricingInputs.spotPrice} {selectedPair?.quote ?? 'USD'}/{selectedPair?.base ?? 'EUR'}</div>
                  </div>
                </div>

                {/* Volatility */}
                <div className="space-y-1.5">
                  <Label>Volatility (%)</Label>
                  <div className="flex gap-2">
                  <Input
                    type="number"
                    value={strategyComponent.volatility}
                      onChange={e => updateStrategyComponent('volatility', parseFloat(e.target.value))}
                      className="flex-1 min-w-[100px]"
                    />
                    {useFuturesInsightsIv && isPairMappableToFuturesInsights(selectedCurrencyPair) && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={applyIvFromFuturesInsights}
                        disabled={fetchingIvFromFi}
                      >
                        {fetchingIvFromFi ? 'Loading…' : 'Apply IV from Futures Insights'}
                      </Button>
                    )}
                  </div>
                </div>

                {/* Domestic rate */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1">
                    <Label>{selectedPair?.quote ?? 'USD'} Rate (%)</Label>
                    <Info className="h-3 w-3 text-muted-foreground" />
                  </div>
                  <Input
                    type="number"
                    value={pricingInputs.domesticRate}
                    onChange={(e) => {
                      updatePricingInput('domesticRate', parseFloat(e.target.value));
                      setRateOverrides((prev) => ({ ...prev, domestic: true }));
                    }}
                  />
                </div>

                {/* Foreign rate */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1">
                    <Label>{selectedPair?.base ?? 'EUR'} Rate (%)</Label>
                    <Info className="h-3 w-3 text-muted-foreground" />
                  </div>
                  <Input
                    type="number"
                    value={pricingInputs.foreignRate}
                    onChange={(e) => {
                      updatePricingInput('foreignRate', parseFloat(e.target.value));
                      setRateOverrides((prev) => ({ ...prev, foreign: true }));
                    }}
                  />
                </div>

                {/* Barrier 1 */}
                {(selectedInstrument.includes('knockout') || selectedInstrument.includes('knockin') || selectedInstrument.includes('touch')) && (
                  <div className="space-y-1.5">
                    <Label>{selectedInstrument.includes('touch') || selectedInstrument.includes('binary') ? 'Barrier (trigger)' : 'Barrier'}</Label>
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        value={strategyComponent.barrier ?? ''}
                        onChange={e => updateStrategyComponent('barrier', e.target.value === '' ? undefined : parseFloat(e.target.value))}
                        className="flex-1"
                      />
                      <Select
                        value={strategyComponent.barrierType ?? 'absolute'}
                        onValueChange={v => updateStrategyComponent('barrierType', v as 'percent' | 'absolute')}
                      >
                        <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="percent"><div className="flex items-center gap-1"><Percent className="h-3 w-3" />%</div></SelectItem>
                          <SelectItem value="absolute"><div className="flex items-center gap-1"><Hash className="h-3 w-3" />Abs</div></SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {strategyComponent.barrier !== undefined && (
                      <p className="text-xs text-muted-foreground">
                        {strategyComponent.barrierType === 'percent' 
                          ? `Absolute value: ${(spot * strategyComponent.barrier / 100).toFixed(4)}`
                          : `Percentage: ${((strategyComponent.barrier / spot) * 100).toFixed(2)}%`}
                      </p>
                    )}
                  </div>
                )}

                {/* Barrier 2 */}
                {selectedInstrument.includes('double') && (
                  <div className="space-y-1.5">
                    <Label>{selectedInstrument.includes('touch') || selectedInstrument.includes('binary') ? 'Second Barrier (trigger)' : 'Second Barrier'}</Label>
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        value={strategyComponent.secondBarrier ?? ''}
                        onChange={e => updateStrategyComponent('secondBarrier', e.target.value === '' ? undefined : parseFloat(e.target.value))}
                        className="flex-1"
                      />
                      <Select
                        value={strategyComponent.barrierType ?? 'absolute'}
                        onValueChange={v => updateStrategyComponent('barrierType', v as 'percent' | 'absolute')}
                      >
                        <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="percent"><div className="flex items-center gap-1"><Percent className="h-3 w-3" />%</div></SelectItem>
                          <SelectItem value="absolute"><div className="flex items-center gap-1"><Hash className="h-3 w-3" />Abs</div></SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {strategyComponent.secondBarrier !== undefined && (
                      <p className="text-xs text-muted-foreground">
                        {strategyComponent.barrierType === 'percent' 
                          ? `Absolute value: ${(spot * strategyComponent.secondBarrier / 100).toFixed(4)}`
                          : `Percentage: ${((strategyComponent.secondBarrier / spot) * 100).toFixed(2)}%`}
                      </p>
                    )}
                  </div>
                )}

                {/* Digital-specific params */}
                {(selectedInstrument.includes('touch') || selectedInstrument.includes('binary')) && (
                  <>
                    <div className="space-y-1.5">
                      <Label>Rebate (%)</Label>
                      <Input
                        type="number"
                        value={strategyComponent.rebate ?? 100}
                        onChange={e => updateStrategyComponent('rebate', parseFloat(e.target.value))}
                        placeholder="100.0"
                      />
                      <p className="text-xs text-muted-foreground">Rebate amount as percentage of notional (default: 100%)</p>
                      </div>
                    {selectedInstrument === 'one-touch' && (
                      <div className="space-y-1.5">
                        <Label>Time to Payoff (years)</Label>
                        <Input
                          type="number"
                          value={strategyComponent.timeToPayoff ?? 1}
                          onChange={e => updateStrategyComponent('timeToPayoff', parseFloat(e.target.value))}
                          placeholder="1.0"
                        />
                        <p className="text-xs text-muted-foreground">Time to payoff for one-touch options (default: 1 year)</p>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            {/* Advanced */}
            <Card>
              <CardHeader className="pb-3 cursor-pointer" onClick={() => setShowAdvanced(p => !p)}>
                <CardTitle className="flex items-center justify-between text-base">
                  <span className="flex items-center gap-2"><Settings className="h-4 w-4" />Advanced Parameters</span>
                  <span className="text-xs text-muted-foreground">{showAdvanced ? '▲ hide' : '▼ show'}</span>
                </CardTitle>
              </CardHeader>
              {showAdvanced && (
                <CardContent>
                  <div className="space-y-1.5">
                    <Label>Number of Simulations</Label>
                    <Input
                      type="number"
                      value={pricingInputs.numSimulations}
                      onChange={e => updatePricingInput('numSimulations', parseInt(e.target.value))}
                    />
                    <p className="text-xs text-muted-foreground">Used for Monte Carlo simulations (default: 1000)</p>
                  </div>
                </CardContent>
              )}
            </Card>
          </div>

          {/* ── Right panel: results ── */}
          <div className="xl:col-span-2 space-y-4">

            {/* Pricing results */}
            {pricingResults.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <TrendingUp className="h-4 w-4" />
                    Pricing Results
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {pricingResults.map((result, idx) => (
                    <div key={idx} className="border rounded-lg p-4 space-y-3">
                      <div className="flex items-center justify-between">
                          <Badge className={getMethodColor(result.method)}>
                            <div className="flex items-center gap-1">
                              {getMethodIcon(result.method)}
                              {result.method}
                            </div>
                          </Badge>
                        </div>
                      <Separator />
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <span className="text-muted-foreground">Prix ({quote}):</span>
                        <span className="font-mono font-medium text-right">{formatPrice(result.price)} {quote}</span>
                        <span className="text-muted-foreground">Prix ({base}):</span>
                        <span className="font-mono font-medium text-right">{formatPrice(result.price / spot)} {base}</span>
                          </div>
                      {result.greeks && (
                        <div className="space-y-2 pt-2 border-t">
                          <p className="text-xs font-medium text-muted-foreground">Analytical Greeks:</p>
                          <div className="grid grid-cols-2 gap-1 text-sm">
                            {(['delta', 'gamma', 'theta', 'vega', 'rho'] as const).map(g => (
                              <React.Fragment key={g}>
                                <span className="text-muted-foreground capitalize">
                                  {g === 'delta' ? 'Δ' : g === 'gamma' ? 'Γ' : g === 'theta' ? 'Θ' : g === 'rho' ? 'ρ' : ''} {g}:
                            </span>
                                <span className={`font-mono text-right ${getGreekColor(result.greeks![g], g)}`}>
                                  {formatGreek(result.greeks![g])}
                                </span>
                              </React.Fragment>
                            ))}
                              </div>
                            </div>
                          )}
                        </div>
                    ))}
                </CardContent>
              </Card>
            )}

            {/* Transaction summary */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Transaction Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {[
                    [`Notional ${base}`, `${notionalBase.toLocaleString()} ${base}`],
                    [`Notional ${quote}`, `${notionalQuote.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${quote}`],
                    ['Spot Price', `${spot} ${quote}/${base}`],
                    ['Absolute Strike', `${strikeAbs.toFixed(4)} ${quote}`],
                    ...(barrierAbs !== undefined ? [['Barrier 1', `${barrierAbs.toFixed(4)} ${quote}`]] : []),
                    ...(secondBarrierAbs !== undefined ? [['Barrier 2', `${secondBarrierAbs.toFixed(4)} ${quote}`]] : []),
                    [`${quote} Rate`, `${pricingInputs.domesticRate}%`],
                    [`${base} Rate`, `${pricingInputs.foreignRate}%`],
                    ['Volatility', `${strategyComponent.volatility}%`],
                    ['Maturity', `${pricingInputs.timeToMaturity.toFixed(2)} years`],
                  ].map(([label, value]) => (
                    <React.Fragment key={label}>
                      <span className="text-muted-foreground">{label}</span>
                      <span className="font-mono text-right">{value}</span>
                    </React.Fragment>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Total premium */}
            {pricingResults.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Total Premium</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <span className="text-muted-foreground">Premium ({base}):</span>
                    <span className="font-mono font-medium text-right">
                      {premiumBase.toLocaleString(undefined, { maximumFractionDigits: 2 })} {base}
                    </span>
                    <span className="text-muted-foreground">Premium ({quote}):</span>
                    <span className="font-mono font-medium text-right">
                      {premiumQuote.toLocaleString(undefined, { maximumFractionDigits: 2 })} {quote}
                    </span>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Payoff chart */}
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
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Pricers;