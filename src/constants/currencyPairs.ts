export interface CurrencyPair {
  symbol: string;
  name: string;
  base: string;
  quote: string;
  category: "majors" | "crosses" | "others";
  defaultSpotRate: number;
}

// Currency Pairs Database with current market rates (approximate)
// Major Pairs: same convention as Futures Insights (all vs USD) — XXX/USD first, then USD/XXX
export const CURRENCY_PAIRS: CurrencyPair[] = [
  // Major Pairs (Futures Insights convention: devises vs USD)
  { symbol: "EUR/USD", name: "Euro/US Dollar", base: "EUR", quote: "USD", category: "majors", defaultSpotRate: 1.0850 },
  { symbol: "GBP/USD", name: "British Pound/US Dollar", base: "GBP", quote: "USD", category: "majors", defaultSpotRate: 1.2650 },
  { symbol: "AUD/USD", name: "Australian Dollar/US Dollar", base: "AUD", quote: "USD", category: "majors", defaultSpotRate: 0.6580 },
  { symbol: "NZD/USD", name: "New Zealand Dollar/US Dollar", base: "NZD", quote: "USD", category: "majors", defaultSpotRate: 0.6020 },
  { symbol: "USD/JPY", name: "US Dollar/Japanese Yen", base: "USD", quote: "JPY", category: "majors", defaultSpotRate: 149.50 },
  { symbol: "USD/CHF", name: "US Dollar/Swiss Franc", base: "USD", quote: "CHF", category: "majors", defaultSpotRate: 0.8850 },
  { symbol: "USD/CAD", name: "US Dollar/Canadian Dollar", base: "USD", quote: "CAD", category: "majors", defaultSpotRate: 1.3650 },
  { symbol: "USD/MXN", name: "US Dollar/Mexican Peso", base: "USD", quote: "MXN", category: "majors", defaultSpotRate: 17.25 },

  // Cross Rates (Non-USD pairs)
  { symbol: "EUR/GBP", name: "Euro/British Pound", base: "EUR", quote: "GBP", category: "crosses", defaultSpotRate: 0.8580 },
  { symbol: "EUR/JPY", name: "Euro/Japanese Yen", base: "EUR", quote: "JPY", category: "crosses", defaultSpotRate: 162.25 },
  { symbol: "GBP/JPY", name: "British Pound/Japanese Yen", base: "GBP", quote: "JPY", category: "crosses", defaultSpotRate: 189.15 },
  { symbol: "EUR/CHF", name: "Euro/Swiss Franc", base: "EUR", quote: "CHF", category: "crosses", defaultSpotRate: 0.9605 },
  { symbol: "EUR/AUD", name: "Euro/Australian Dollar", base: "EUR", quote: "AUD", category: "crosses", defaultSpotRate: 1.6485 },
  { symbol: "GBP/CHF", name: "British Pound/Swiss Franc", base: "GBP", quote: "CHF", category: "crosses", defaultSpotRate: 1.1195 },
  { symbol: "AUD/JPY", name: "Australian Dollar/Japanese Yen", base: "AUD", quote: "JPY", category: "crosses", defaultSpotRate: 98.40 },
  { symbol: "CAD/JPY", name: "Canadian Dollar/Japanese Yen", base: "CAD", quote: "JPY", category: "crosses", defaultSpotRate: 109.52 },
  { symbol: "CHF/JPY", name: "Swiss Franc/Japanese Yen", base: "CHF", quote: "JPY", category: "crosses", defaultSpotRate: 169.01 },
];

