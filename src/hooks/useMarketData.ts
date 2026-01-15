import { useState, useEffect, useRef } from "react";
import { MarketRate, ForwardRate } from "@/types/forexChat";

const CURRENCY_PAIRS = [
  { base: "EUR", quote: "USD", invert: true },
  { base: "GBP", quote: "USD", invert: true },
  { base: "USD", quote: "JPY", invert: false },
  { base: "USD", quote: "CHF", invert: false },
  { base: "EUR", quote: "GBP", invert: false },
  { base: "AUD", quote: "USD", invert: true },
];

// Forward points (simulated - in production, get from a forward rates API)
const BASE_FORWARDS: ForwardRate[] = [
  { tenor: "1M", points: -12.5, outright: 0 },
  { tenor: "3M", points: -35.2, outright: 0 },
  { tenor: "6M", points: -68.4, outright: 0 },
  { tenor: "1Y", points: -125.8, outright: 0 },
];

export function useMarketData() {
  const [rates, setRates] = useState<MarketRate[]>([]);
  const [forwards, setForwards] = useState<ForwardRate[]>(BASE_FORWARDS);
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const previousRates = useRef<Map<string, number>>(new Map());

  const fetchRates = async () => {
    try {
      const response = await fetch("https://api.exchangerate-api.com/v4/latest/USD");
      if (!response.ok) throw new Error("Failed to fetch rates");
      
      const data = await response.json();
      const usdRates = data.rates;

      const newRates: MarketRate[] = CURRENCY_PAIRS.map(({ base, quote, invert }) => {
        let pair: string;
        let spotRate: number;

        if (invert) {
          // For pairs like EUR/USD, we need 1/rate since API gives USD/EUR
          pair = `${base}/${quote}`;
          spotRate = 1 / usdRates[base];
        } else if (base === "EUR" && quote === "GBP") {
          // Cross rate: EUR/GBP = USD/GBP / USD/EUR = (1/GBP) / (1/EUR)
          pair = `${base}/${quote}`;
          spotRate = usdRates[quote] / usdRates[base];
        } else {
          pair = `${base}/${quote}`;
          spotRate = usdRates[quote];
        }

        spotRate = parseFloat(spotRate.toFixed(4));

        // Calculate change from previous rate
        const prevRate = previousRates.current.get(pair) || spotRate;
        const change = parseFloat((spotRate - prevRate).toFixed(4));
        const changePercent = parseFloat(((change / prevRate) * 100).toFixed(2));

        // Store current rate for next comparison
        previousRates.current.set(pair, spotRate);

        // Simulate bid/ask spread (typical for major pairs)
        const spread = spotRate < 10 ? 0.0002 : 0.02;
        const bid = parseFloat((spotRate - spread / 2).toFixed(4));
        const ask = parseFloat((spotRate + spread / 2).toFixed(4));

        // Simulate 24h high/low (±0.5% from current)
        const variation = spotRate * 0.005;
        const high24h = parseFloat((spotRate + variation).toFixed(4));
        const low24h = parseFloat((spotRate - variation).toFixed(4));

        return {
          pair,
          spotRate,
          change,
          changePercent,
          bid,
          ask,
          high24h,
          low24h,
        };
      });

      // Update forward outrights based on EUR/USD spot
      const eurusdSpot = newRates.find(r => r.pair === "EUR/USD")?.spotRate || 1.0856;
      const updatedForwards = BASE_FORWARDS.map(f => ({
        ...f,
        outright: parseFloat((eurusdSpot + f.points / 10000).toFixed(4)),
      }));

      setRates(newRates);
      setForwards(updatedForwards);
      setLastUpdate(new Date());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch rates");
      console.error("Error fetching exchange rates:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRates();
    
    // Refresh every 30 seconds (API has rate limits)
    const interval = setInterval(fetchRates, 30000);
    return () => clearInterval(interval);
  }, []);

  return { rates, forwards, lastUpdate, isLoading, error, refetch: fetchRates };
}

