/**
 * Single source of truth for FX spots used by Forex Market and Hedging Instruments.
 * Forex Market writes the latest API snapshot; Hedging reads it (same formula as Pricers/Hedging fetch).
 */

export const FOREX_MARKET_RATE_SNAPSHOT_KEY = 'forexMarketRateSnapshot';
export const FOREX_MARKET_RATE_SNAPSHOT_EVENT = 'forexMarketRateSnapshotUpdated';

export type ForexMarketRateSnapshot = {
  /** API base currency (e.g. USD) — rates are "quote per 1 base" per exchangerate-api v4 */
  base: string;
  rates: Record<string, number>;
  updatedAt: number;
};

/**
 * Spot for BASE/QUOTE using the same cross-rate logic as HedgingInstruments.fetchRealTimeSpotPrice.
 */
export function computeSpotForCurrencyPair(
  pairSymbol: string,
  ratesBase: string,
  rates: Record<string, number>
): number | null {
  const parts = pairSymbol.split('/');
  if (parts.length !== 2) return null;
  const base = parts[0];
  const quote = parts[1];

  let rate: number;
  if (base === ratesBase) {
    const v = rates[quote];
    if (v == null || isNaN(v) || v <= 0) return null;
    rate = v;
  } else if (quote === ratesBase) {
    const v = rates[base];
    if (v == null || isNaN(v) || v <= 0) return null;
    rate = 1 / v;
  } else {
    const br = rates[base];
    const qr = rates[quote];
    if (br == null || qr == null || isNaN(br) || isNaN(qr) || br <= 0 || qr <= 0) return null;
    rate = qr / br;
  }
  return rate;
}

export function writeForexMarketRateSnapshot(snapshot: ForexMarketRateSnapshot): void {
  try {
    localStorage.setItem(FOREX_MARKET_RATE_SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch {
    /* ignore quota / private mode */
  }
  window.dispatchEvent(new CustomEvent(FOREX_MARKET_RATE_SNAPSHOT_EVENT, { detail: snapshot }));
}

export function readForexMarketRateSnapshot(): ForexMarketRateSnapshot | null {
  try {
    const raw = localStorage.getItem(FOREX_MARKET_RATE_SNAPSHOT_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<ForexMarketRateSnapshot>;
    if (!p || typeof p.base !== 'string' || !p.rates || typeof p.updatedAt !== 'number') return null;
    return p as ForexMarketRateSnapshot;
  } catch {
    return null;
  }
}
