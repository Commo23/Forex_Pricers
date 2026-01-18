import { useMemo, useEffect } from "react";
import { useCountriesBonds } from "@/hooks/useBondsData";

// Currencies that have IRS/Futures data available
const IRS_FUTURES_CURRENCIES = ["USD", "EUR", "GBP", "CHF", "JPY"];

/**
 * Hook to get Bank Rates for all currencies from AllRates data
 * Returns a map of currency -> bankRate
 */
export function useBankRates(): Record<string, number | null> {
  // Fetch bonds data
  const countriesQuery = useCountriesBonds();
  
  // Auto-fetch countries on mount
  useEffect(() => {
    if (!countriesQuery.data && !countriesQuery.isFetching) {
      countriesQuery.refetch();
    }
  }, []);
  
  const countriesData = countriesQuery.data?.data || [];
  
  // Build bank rates map
  const bankRatesMap = useMemo(() => {
    const map: Record<string, number | null> = {};
    
    // For major currencies, get bank rate from countries data
    // For USD, specifically use United States
    const usdCountry = countriesData.find(c => 
      c.currency === "USD" && 
      (c.country.toLowerCase().includes("united states") || 
       c.country.toLowerCase().includes("usa") ||
       c.country.toLowerCase() === "united states")
    );
    if (usdCountry?.bankRate !== null && usdCountry?.bankRate !== undefined) {
      map["USD"] = usdCountry.bankRate;
    }
    
    // For other major currencies, get first country with that currency
    ["EUR", "GBP", "CHF", "JPY"].forEach(currency => {
      const country = countriesData.find(c => c.currency === currency);
      if (country?.bankRate !== null && country?.bankRate !== undefined) {
        map[currency] = country.bankRate;
      }
    });
    
    // For all other currencies, get from countries data
    countriesData.forEach(country => {
      if (!IRS_FUTURES_CURRENCIES.includes(country.currency)) {
        if (country.bankRate !== null && country.bankRate !== undefined) {
          // Use the first occurrence or best rated
          if (!map[country.currency]) {
            map[country.currency] = country.bankRate;
          }
        }
      }
    });
    
    return map;
  }, [countriesData]);
  
  return bankRatesMap;
}

