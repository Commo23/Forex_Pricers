import type { DiscountFactor } from "@/lib/rate-explorer/bootstrapping";
import { interpolateAtTenor } from "@/lib/rate-explorer/bootstrapping";
import { PricingService } from "@/services/PricingService";

export type HedgingBootstrapCurveMap = Record<string, DiscountFactor[] | null | undefined>;

/**
 * Domestic = quote currency curve, foreign = base currency curve (FX convention).
 * Zero rates from bootstrap are decimals (e.g. 0.04); returns % for display and decimals for pricing.
 */
export function getBootstrappedRatesForInstrument(
  currencyPair: string,
  maturity: string,
  valuationDate: string,
  curves: HedgingBootstrapCurveMap
): { domesticPct: number; foreignPct: number; r_d: number; r_f: number } | null {
  const parts = currencyPair.split("/");
  if (parts.length !== 2) return null;
  const base = parts[0].toUpperCase();
  const quote = parts[1].toUpperCase();

  const t = PricingService.calculateTimeToMaturity(maturity, valuationDate);
  if (t <= 0 || !isFinite(t)) return null;

  const domDfs = curves[quote];
  const forDfs = curves[base];
  if (!domDfs?.length || !forDfs?.length) return null;

  const izDom = interpolateAtTenor(domDfs, t);
  const izFor = interpolateAtTenor(forDfs, t);
  if (!izDom || !izFor) return null;

  const r_d = izDom.zeroRate;
  const r_f = izFor.zeroRate;
  if (!isFinite(r_d) || !isFinite(r_f)) return null;

  return {
    domesticPct: r_d * 100,
    foreignPct: r_f * 100,
    r_d,
    r_f,
  };
}
