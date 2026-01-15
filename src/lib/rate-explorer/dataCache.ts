/**
 * Local storage cache for scraped data
 * Avoids re-scraping on every page load
 */

import { RateResponse } from "./rateIndices";
import { IRSResponse } from "./irsIndices";

const CACHE_PREFIX = "rate_explorer_cache_";
const CACHE_DURATION_MS = 30 * 60 * 1000; // 30 minutes

interface CachedData<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

export function getCachedRateData(index: string): RateResponse | null {
  try {
    const key = `${CACHE_PREFIX}rates_${index}`;
    const cached = localStorage.getItem(key);
    if (!cached) return null;

    const parsed: CachedData<RateResponse> = JSON.parse(cached);
    if (Date.now() > parsed.expiresAt) {
      localStorage.removeItem(key);
      return null;
    }

    return parsed.data;
  } catch (e) {
    console.warn("Failed to read rate cache:", e);
    return null;
  }
}

export function setCachedRateData(index: string, data: RateResponse): void {
  try {
    const key = `${CACHE_PREFIX}rates_${index}`;
    const cached: CachedData<RateResponse> = {
      data,
      timestamp: Date.now(),
      expiresAt: Date.now() + CACHE_DURATION_MS,
    };
    localStorage.setItem(key, JSON.stringify(cached));
  } catch (e) {
    console.warn("Failed to write rate cache:", e);
  }
}

export function getCachedIRSData(currency: string): IRSResponse | null {
  try {
    const key = `${CACHE_PREFIX}irs_${currency}`;
    const cached = localStorage.getItem(key);
    if (!cached) return null;

    const parsed: CachedData<IRSResponse> = JSON.parse(cached);
    if (Date.now() > parsed.expiresAt) {
      localStorage.removeItem(key);
      return null;
    }

    return parsed.data;
  } catch (e) {
    console.warn("Failed to read IRS cache:", e);
    return null;
  }
}

export function setCachedIRSData(currency: string, data: IRSResponse): void {
  try {
    const key = `${CACHE_PREFIX}irs_${currency}`;
    const cached: CachedData<IRSResponse> = {
      data,
      timestamp: Date.now(),
      expiresAt: Date.now() + CACHE_DURATION_MS,
    };
    localStorage.setItem(key, JSON.stringify(cached));
  } catch (e) {
    console.warn("Failed to write IRS cache:", e);
  }
}

export function clearAllCache(): void {
  try {
    const keys = Object.keys(localStorage).filter((k) =>
      k.startsWith(CACHE_PREFIX)
    );
    keys.forEach((k) => localStorage.removeItem(k));
  } catch (e) {
    console.warn("Failed to clear cache:", e);
  }
}

export function getCacheAge(index: string, type: "rates" | "irs"): string | null {
  try {
    const key = `${CACHE_PREFIX}${type}_${index}`;
    const cached = localStorage.getItem(key);
    if (!cached) return null;

    const parsed: CachedData<unknown> = JSON.parse(cached);
    const ageMs = Date.now() - parsed.timestamp;
    const ageMinutes = Math.floor(ageMs / 60000);
    
    if (ageMinutes < 1) return "< 1 min";
    if (ageMinutes < 60) return `${ageMinutes} min`;
    return `${Math.floor(ageMinutes / 60)}h ${ageMinutes % 60}min`;
  } catch (e) {
    return null;
  }
}

