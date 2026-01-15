/**
 * Default data sources and conventions per currency/region
 * 
 * Professional conventions:
 * - EUR: ESTR 3M + EUR IRS (ACT/360, Annual)
 * - USD: SOFR 3M + USD IRS (ACT/360, Semi-Annual)
 * - GBP: SONIA 3M + GBP IRS (ACT/365, Semi-Annual)
 * - CHF: SARON 3M + CHF IRS (ACT/360, Annual)
 * - JPY: TONA 3M + JPY IRS (ACT/365, Semi-Annual)
 * - CAD: CORRA 3M + (no IRS configured, USD as fallback)
 * - SGD: SORA 3M + (no IRS configured, USD as fallback)
 */

export interface CurrencyConfig {
  currency: string;
  name: string;
  defaultFuturesIndex: string;
  defaultIRSCurrency: string;
  description: string;
}

export const CURRENCY_CONFIGS: CurrencyConfig[] = [
  {
    currency: "EUR",
    name: "Euro",
    defaultFuturesIndex: "estr3m",
    defaultIRSCurrency: "eur",
    description: "ESTR 3M + EUR IRS (ACT/360, Annual)",
  },
  {
    currency: "USD",
    name: "US Dollar",
    defaultFuturesIndex: "sofr",
    defaultIRSCurrency: "usd",
    description: "SOFR 3M + USD IRS (ACT/360, Semi-Annual)",
  },
  {
    currency: "GBP",
    name: "British Pound",
    defaultFuturesIndex: "sonia",
    defaultIRSCurrency: "gbp",
    description: "SONIA 3M + GBP IRS (ACT/365, Semi-Annual)",
  },
  {
    currency: "CHF",
    name: "Swiss Franc",
    defaultFuturesIndex: "saron3m",
    defaultIRSCurrency: "chf",
    description: "SARON 3M + CHF IRS (ACT/360, Annual)",
  },
  {
    currency: "JPY",
    name: "Japanese Yen",
    defaultFuturesIndex: "tona3m",
    defaultIRSCurrency: "jpy",
    description: "TONA 3M + JPY IRS (ACT/365, Semi-Annual)",
  },
  {
    currency: "CAD",
    name: "Canadian Dollar",
    defaultFuturesIndex: "corra3m",
    defaultIRSCurrency: "usd", // No CAD IRS configured, fallback to USD
    description: "CORRA 3M + USD IRS fallback (ACT/365, Semi-Annual)",
  },
  {
    currency: "SGD",
    name: "Singapore Dollar",
    defaultFuturesIndex: "sora3m",
    defaultIRSCurrency: "usd", // No SGD IRS configured, fallback to USD
    description: "SORA 3M + USD IRS fallback (ACT/365, Semi-Annual)",
  },
];

export function getCurrencyConfig(currency: string): CurrencyConfig | undefined {
  return CURRENCY_CONFIGS.find((c) => c.currency === currency);
}

export function getDefaultsForCurrency(currency: string): { futuresIndex: string; irsCurrency: string } {
  const config = getCurrencyConfig(currency);
  if (config) {
    return {
      futuresIndex: config.defaultFuturesIndex,
      irsCurrency: config.defaultIRSCurrency,
    };
  }
  // Default to EUR
  return {
    futuresIndex: "estr3m",
    irsCurrency: "eur",
  };
}

