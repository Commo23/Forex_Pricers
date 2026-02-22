import type { CurrencyData } from "@/lib/api/barchart";

/**
 * Mapping from Pricers currency pair symbols to Futures Insights futures root symbols.
 * Only pairs that have a corresponding futures contract in Futures Insights (e.g. CME FX).
 * Other pairs are not mapped and keep manual volatility.
 */
export const PRICERS_TO_FUTURES_ROOT: Record<string, string> = {
  "EUR/USD": "E6",   // Euro FX
  "GBP/USD": "B6",   // British Pound
  "AUD/USD": "A6",   // Australian Dollar
  "USD/JPY": "J6",   // Japanese Yen
  "USD/CHF": "S6",   // Swiss Franc
  "USD/CAD": "D6",   // Canadian Dollar
  "USD/MXN": "M6",   // Mexican Peso
  // NZD/USD: no standard CME symbol in FI list
};

/** Pricer pair symbols that have a mapping to Futures Insights. */
export const MAPPABLE_PRICERS_PAIRS = Object.keys(PRICERS_TO_FUTURES_ROOT);

/**
 * Returns the Futures Insights contract symbol to use for a Pricers pair, or null if not mappable.
 * Picks the first available contract from the FI currencies list whose symbol starts with the root (e.g. E6M26 for E6).
 */
export function getFuturesContractForPair(
  pairSymbol: string,
  fiCurrencies: CurrencyData[]
): string | null {
  const root = PRICERS_TO_FUTURES_ROOT[pairSymbol];
  if (!root) return null;
  const contract = fiCurrencies.find((c) =>
    c.symbol.startsWith(root)
  );
  return contract?.symbol ?? null;
}

/**
 * Returns whether the given Pricers pair can use IV from Futures Insights.
 */
export function isPairMappableToFuturesInsights(pairSymbol: string): boolean {
  return pairSymbol in PRICERS_TO_FUTURES_ROOT;
}
