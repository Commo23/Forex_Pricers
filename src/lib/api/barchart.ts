import { futuresSupabase, isFuturesSupabaseAvailable } from "@/lib/supabase-futures";
import { getCached, setCache } from "@/lib/scrapeCache";

export interface CurrencyData {
  symbol: string;
  name: string;
  last: string;
  change: string;
  percentChange: string;
  high: string;
  low: string;
  volume: string;
  time: string;
}

export interface FuturesContract {
  contract: string;
  month: string;
  last: string;
  change: string;
  percentChange: string;
  open: string;
  high: string;
  low: string;
  volume: string;
  openInterest: string;
  time: string;
}

export interface OptionData {
  strike: string;
  open: string;
  high: string;
  low: string;
  last: string;
  change: string;
  bid: string;
  ask: string;
  volume: string;
  openInterest: string;
}

export interface OptionsResponse {
  calls: OptionData[];
  puts: OptionData[];
  metadata: {
    impliedVolatility?: string;
    daysToExpiration?: number;
    expirationDate?: string;
  };
}

export interface GreekRow {
  strike: string;
  type: string;
  latest: string;
  iv: string;
  delta: string;
  gamma: string;
  theta: string;
  vega: string;
  ivSkew: string;
  lastTrade: string;
}

export interface VolatilityResponse {
  calls: GreekRow[];
  puts: GreekRow[];
  metadata: {
    daysToExpiration?: number;
    expirationDate?: string;
    pointValue?: string;
  };
}

export interface OptionsTypeOption {
  label: string;
  value: string;
}

/** Surface point for 3D volatility surface (strike × DTE × IV). */
export interface SurfacePoint {
  strike: number;
  dte: number;
  iv: number;
  maturityLabel: string;
  type: 'call' | 'put';
}

/** Fetch currencies (FX only: category 'currencies'). */
export async function fetchCurrencies(forceRefresh = false): Promise<{ success: boolean; data?: CurrencyData[]; raw?: string; error?: string }> {
  if (!isFuturesSupabaseAvailable()) {
    return { success: false, error: 'Futures Insights Supabase credentials not configured. Please configure VITE_FUTURES_SUPABASE_URL and VITE_FUTURES_SUPABASE_PUBLISHABLE_KEY in your environment variables.' };
  }
  
  const cacheKey = 'currencies';
  if (!forceRefresh) {
    const cached = getCached<{ success: boolean; data?: CurrencyData[]; raw?: string }>(cacheKey);
    if (cached) return cached;
  }
  try {
    const { data, error } = await futuresSupabase!.functions.invoke('scrape-currencies', {
      body: { category: 'currencies' },
    });
    if (error) return { success: false, error: error.message };
    if (data?.success) setCache(cacheKey, data);
    return data;
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

export async function fetchFutures(symbol: string, forceRefresh = false): Promise<{ success: boolean; data?: FuturesContract[]; raw?: string; error?: string }> {
  if (!isFuturesSupabaseAvailable()) {
    return { success: false, error: 'Futures Insights Supabase credentials not configured. Please configure VITE_FUTURES_SUPABASE_URL and VITE_FUTURES_SUPABASE_PUBLISHABLE_KEY in your environment variables.' };
  }
  
  const cacheKey = `futures:${symbol}`;
  if (!forceRefresh) {
    const cached = getCached<{ success: boolean; data?: FuturesContract[]; raw?: string }>(cacheKey);
    if (cached) return cached;
  }
  const { data, error } = await futuresSupabase!.functions.invoke('scrape-futures', {
    body: { symbol },
  });
  if (error) return { success: false, error: error.message };
  if (data?.success) setCache(cacheKey, data);
  return data;
}

export async function fetchOptions(symbol: string, maturity?: string, forceRefresh = false): Promise<{ success: boolean; data?: OptionsResponse; expirations?: any[]; raw?: string; error?: string }> {
  if (!isFuturesSupabaseAvailable()) {
    return { success: false, error: 'Futures Insights Supabase credentials not configured. Please configure VITE_FUTURES_SUPABASE_URL and VITE_FUTURES_SUPABASE_PUBLISHABLE_KEY in your environment variables.' };
  }
  
  const cacheKey = `options:${symbol}:${maturity || 'default'}`;
  if (!forceRefresh) {
    const cached = getCached<any>(cacheKey);
    if (cached) return cached;
  }
  const { data, error } = await futuresSupabase!.functions.invoke('scrape-options', {
    body: { symbol, maturity },
  });
  if (error) return { success: false, error: error.message };
  if (data?.success) setCache(cacheKey, data);
  return data;
}

export async function fetchVolatility(
  futureSymbol: string,
  optionSymbol: string,
  moneyness?: number,
  maturity?: string,
  optionsType?: string,
  forceRefresh = false
): Promise<{ success: boolean; data?: VolatilityResponse; expirations?: Array<{ label: string; value: string }>; optionsTypes?: OptionsTypeOption[]; raw?: string; error?: string }> {
  if (!isFuturesSupabaseAvailable()) {
    return { success: false, error: 'Futures Insights Supabase credentials not configured. Please configure VITE_FUTURES_SUPABASE_URL and VITE_FUTURES_SUPABASE_PUBLISHABLE_KEY in your environment variables.' };
  }
  
  const cacheKey = `volatility:${futureSymbol}:${optionSymbol}:${moneyness || 50}:${maturity || 'default'}:${optionsType || 'monthly'}`;
  if (!forceRefresh) {
    const cached = getCached<any>(cacheKey);
    if (cached) return cached;
  }
  const { data, error } = await futuresSupabase!.functions.invoke('scrape-volatility', {
    body: { futureSymbol, optionSymbol, moneyness, maturity, optionsType },
  });
  if (error) return { success: false, error: error.message };
  if (data?.success) setCache(cacheKey, data);
  return data;
}

export async function fetchVolSurfaceStrikes(
  futureSymbol: string,
  optionSymbol: string,
  moneyness = 50,
  forceRefresh = false
): Promise<{ success: boolean; strikes?: number[]; error?: string }> {
  if (!isFuturesSupabaseAvailable()) {
    return { success: false, error: 'Futures Insights Supabase credentials not configured. Please configure VITE_FUTURES_SUPABASE_URL and VITE_FUTURES_SUPABASE_PUBLISHABLE_KEY in your environment variables.' };
  }
  const cacheKey = `volsurface-strikes:${futureSymbol}:${optionSymbol}:${moneyness}`;
  if (!forceRefresh) {
    const cached = getCached<{ success: boolean; strikes?: number[] }>(cacheKey);
    if (cached) return cached;
  }
  const { data, error } = await futuresSupabase!.functions.invoke('scrape-vol-surface', {
    body: { futureSymbol, optionSymbol, moneyness, strikesOnly: true },
  });
  if (error) return { success: false, error: error.message };
  if (data?.success) setCache(cacheKey, data);
  return data;
}

export async function fetchVolSurface(
  futureSymbol: string,
  optionSymbol: string,
  moneyness?: number,
  forceRefresh = false,
  strikeMin?: number,
  strikeMax?: number
): Promise<{ success: boolean; surfacePoints?: SurfacePoint[]; totalMaturities?: number; error?: string }> {
  if (!isFuturesSupabaseAvailable()) {
    return { success: false, error: 'Futures Insights Supabase credentials not configured. Please configure VITE_FUTURES_SUPABASE_URL and VITE_FUTURES_SUPABASE_PUBLISHABLE_KEY in your environment variables.' };
  }
  const cacheKey = `volsurface:${futureSymbol}:${optionSymbol}:${moneyness ?? 50}:${strikeMin ?? 'all'}-${strikeMax ?? 'all'}`;
  if (!forceRefresh) {
    const cached = getCached<{ success: boolean; surfacePoints?: SurfacePoint[]; totalMaturities?: number }>(cacheKey);
    if (cached) return cached;
  }
  const { data, error } = await futuresSupabase!.functions.invoke('scrape-vol-surface', {
    body: { futureSymbol, optionSymbol, moneyness, strikeMin, strikeMax },
  });
  if (error) return { success: false, error: error.message };
  if (data?.success) setCache(cacheKey, data);
  return data;
}
