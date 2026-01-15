// IRS (Interest Rate Swap) indices configuration
export interface IRSIndex {
  id: string;
  name: string;
  currency: string;
  description: string;
  maturities: number[];
}

export const IRS_INDICES: IRSIndex[] = [
  {
    id: "usd",
    name: "USD IRS",
    currency: "USD",
    description: "US Dollar Interest Rate Swap",
    maturities: [1, 2, 3, 4, 5, 6, 7, 8, 10, 30]
  },
  {
    id: "eur",
    name: "EUR IRS",
    currency: "EUR",
    description: "Euro Interest Rate Swap",
    maturities: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 15, 25, 30]
  },
  {
    id: "gbp",
    name: "GBP IRS",
    currency: "GBP",
    description: "British Pound Interest Rate Swap",
    maturities: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 20, 25, 30]
  },
  {
    id: "chf",
    name: "CHF IRS",
    currency: "CHF",
    description: "Swiss Franc Interest Rate Swap",
    maturities: [1, 2, 3, 4, 5, 7, 8, 9, 10]
  },
  {
    id: "jpy",
    name: "JPY IRS",
    currency: "JPY",
    description: "Japanese Yen Interest Rate Swap",
    maturities: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 20, 25, 30]
  }
];

export interface IRSData {
  maturity: string;
  tenor: number;
  rate: string;
  rateValue: number;
  change: string;
  changeValue: number;
  prevClose: string;
  dayLow: string;
  dayHigh: string;
  yearLow: string;
  yearHigh: string;
}

export interface IRSResponse {
  success: boolean;
  currency?: string;
  name?: string;
  data?: IRSData[];
  lastUpdated?: string;
  error?: string;
}

