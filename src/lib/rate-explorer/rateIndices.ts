// Rate indices configuration
export interface RateIndex {
  id: string;
  name: string;
  currency: string;
  description: string;
}

export const RATE_INDICES: RateIndex[] = [
  {
    id: "euribor3m",
    name: "3-Month Euribor",
    currency: "EUR",
    description: "Euro Interbank Offered Rate - 3 Month"
  },
  {
    id: "sofr",
    name: "SOFR 3-Month",
    currency: "USD",
    description: "Secured Overnight Financing Rate - 3 Month"
  },
  {
    id: "sonia",
    name: "SONIA 3-Month",
    currency: "GBP",
    description: "Sterling Overnight Index Average - 3 Month"
  },
  {
    id: "estr3m",
    name: "3-Month ESTR",
    currency: "EUR",
    description: "Euro Short-Term Rate - 3 Month"
  },
  {
    id: "estr1m",
    name: "1-Month ESTR",
    currency: "EUR",
    description: "Euro Short-Term Rate - 1 Month"
  },
  {
    id: "estr3m_long",
    name: "3-Month ESTR (Long)",
    currency: "EUR",
    description: "Euro Short-Term Rate - 3 Month (Long Dated 2030+)"
  },
  {
    id: "tona3m",
    name: "3-Month TONA",
    currency: "JPY",
    description: "Tokyo Overnight Average Rate - 3 Month"
  },
  {
    id: "saron3m",
    name: "3-Month SARON",
    currency: "CHF",
    description: "Swiss Average Rate Overnight - 3 Month"
  },
  {
    id: "corra3m",
    name: "CORRA 3-Month",
    currency: "CAD",
    description: "Canadian Overnight Repo Rate Average - 3 Month"
  },
  {
    id: "sora3m",
    name: "3M SORA Futures",
    currency: "SGD",
    description: "Singapore Overnight Rate Average - 3 Month"
  }
];

export interface FuturesData {
  contract: string;
  maturity: string;
  latest: string;
  change: string;
  changeValue: number;
  open: string;
  high: string;
  low: string;
  previous: string;
}

export interface RateResponse {
  success: boolean;
  index?: string;
  name?: string;
  currency?: string;
  data?: FuturesData[];
  lastUpdated?: string;
  error?: string;
}

