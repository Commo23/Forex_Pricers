import { rateExplorerSupabase } from "../supabaseClient";

export interface CountryBondData {
  country: string;
  countrySlug: string;
  currency: string;
  rating: string;
  yield10Y: number | null;
  bankRate: number | null;
  spreadVsBund: number | null;
  spreadVsTNote: number | null;
  spreadVsBankRate: number | null;
}

export interface BondYieldData {
  maturity: string;
  maturityYears: number;
  yield: number | null;
  chg1M: number | null;
  chg6M: number | null;
  chg12M: number | null;
  price: number | null;
  priceChg1M: number | null;
  priceChg6M: number | null;
  priceChg12M: number | null;
  capitalGrowth: number | null;
  lastUpdate: string;
}

export interface CountriesResponse {
  success: boolean;
  data?: CountryBondData[];
  error?: string;
  scrapedAt?: string;
}

export interface CountryYieldsResponse {
  success: boolean;
  country?: string;
  currency?: string;
  data?: BondYieldData[];
  error?: string;
  scrapedAt?: string;
}

export async function fetchAllCountries(): Promise<CountriesResponse> {
  try {
    const { data, error } = await rateExplorerSupabase.functions.invoke('scrape-bonds', {
      body: { type: 'countries' },
    });

    if (error) {
      console.error('Error fetching countries:', error);
      return { success: false, error: error.message };
    }

    return data;
  } catch (err) {
    console.error('Error fetching countries:', err);
    return { 
      success: false, 
      error: err instanceof Error ? err.message : 'Unknown error' 
    };
  }
}

export async function fetchCountryYields(countrySlug: string): Promise<CountryYieldsResponse> {
  try {
    const { data, error } = await rateExplorerSupabase.functions.invoke('scrape-bonds', {
      body: { type: 'country', country: countrySlug },
    });

    if (error) {
      console.error('Error fetching country yields:', error);
      return { success: false, error: error.message };
    }

    return data;
  } catch (err) {
    console.error('Error fetching country yields:', err);
    return { 
      success: false, 
      error: err instanceof Error ? err.message : 'Unknown error' 
    };
  }
}

