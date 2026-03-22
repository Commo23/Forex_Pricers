import { useMemo } from "react";
import { useRateExplorerDiscountFactors } from "@/hooks/useRateExplorerDiscountFactors";
import type { DiscountFactor } from "@/lib/rate-explorer/bootstrapping";

/** Currencies commonly used in Hedging / Rate Explorer curves (fixed hook count). */
const HEDGING_BOOTSTRAP_CCY = [
  "USD",
  "EUR",
  "GBP",
  "CHF",
  "JPY",
  "AUD",
  "CAD",
  "NZD",
  "MXN",
] as const;

/**
 * Pre-load bootstrap discount-factor curves for major currencies (same method as Add Instrument form).
 */
export function useHedgingBootstrapCurveMap() {
  const u0 = useRateExplorerDiscountFactors(HEDGING_BOOTSTRAP_CCY[0], "cubic_spline");
  const u1 = useRateExplorerDiscountFactors(HEDGING_BOOTSTRAP_CCY[1], "cubic_spline");
  const u2 = useRateExplorerDiscountFactors(HEDGING_BOOTSTRAP_CCY[2], "cubic_spline");
  const u3 = useRateExplorerDiscountFactors(HEDGING_BOOTSTRAP_CCY[3], "cubic_spline");
  const u4 = useRateExplorerDiscountFactors(HEDGING_BOOTSTRAP_CCY[4], "cubic_spline");
  const u5 = useRateExplorerDiscountFactors(HEDGING_BOOTSTRAP_CCY[5], "cubic_spline");
  const u6 = useRateExplorerDiscountFactors(HEDGING_BOOTSTRAP_CCY[6], "cubic_spline");
  const u7 = useRateExplorerDiscountFactors(HEDGING_BOOTSTRAP_CCY[7], "cubic_spline");
  const u8 = useRateExplorerDiscountFactors(HEDGING_BOOTSTRAP_CCY[8], "cubic_spline");

  const rows = [u0, u1, u2, u3, u4, u5, u6, u7, u8];

  return useMemo(() => {
    const curves: Record<string, DiscountFactor[] | null> = {};
    HEDGING_BOOTSTRAP_CCY.forEach((code, i) => {
      curves[code] = rows[i].discountFactors ?? null;
    });
    const isLoading = rows.some((r) => r.isLoading);
    const errors = rows.map((r) => r.error).filter(Boolean) as string[];
    return { curves, isLoading, errors };
  }, [
    u0.discountFactors,
    u0.isLoading,
    u0.error,
    u1.discountFactors,
    u1.isLoading,
    u1.error,
    u2.discountFactors,
    u2.isLoading,
    u2.error,
    u3.discountFactors,
    u3.isLoading,
    u3.error,
    u4.discountFactors,
    u4.isLoading,
    u4.error,
    u5.discountFactors,
    u5.isLoading,
    u5.error,
    u6.discountFactors,
    u6.isLoading,
    u6.error,
    u7.discountFactors,
    u7.isLoading,
    u7.error,
    u8.discountFactors,
    u8.isLoading,
    u8.error,
  ]);
}
