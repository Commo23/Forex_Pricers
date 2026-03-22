import { useEffect, useMemo } from "react";
import { useCountriesBonds, useCountryYields } from "@/hooks/useBondsData";
import { useRateData } from "@/hooks/useRateData";
import { useIRSData } from "@/hooks/useIRSData";
import { getDefaultsForCurrency } from "@/lib/rate-explorer/currencyDefaults";
import {
  BootstrapMethod,
  BootstrapPoint,
  BootstrapResult,
  bootstrap,
  bootstrapBonds,
  maturityToYears,
  priceToRate,
} from "@/lib/rate-explorer/bootstrapping";

// Keep consistent with Rate Explorer "AllRates" major IRS/Futures currencies
const IRS_FUTURES_CURRENCIES = ["USD", "EUR", "GBP", "CHF", "JPY"] as const;

export function useRateExplorerDiscountFactors(
  currency: string,
  method: BootstrapMethod = "cubic_spline"
): {
  discountFactors: BootstrapResult["discountFactors"] | null;
  isLoading: boolean;
  error: string | null;
} {
  const normalized = currency.toUpperCase();
  const useIRSFutures = (IRS_FUTURES_CURRENCIES as readonly string[]).includes(normalized);

  const { futuresIndex, irsCurrency } = getDefaultsForCurrency(normalized);
  const futuresQuery = useRateData(useIRSFutures ? futuresIndex : "");
  const irsQuery = useIRSData(useIRSFutures ? irsCurrency : "");

  const countriesQuery = useCountriesBonds();
  const countriesData = countriesQuery.data?.data || [];

  // Bond-only curves: fetch all countries only when needed
  useEffect(() => {
    if (!useIRSFutures && !countriesQuery.data && !countriesQuery.isFetching) {
      countriesQuery.refetch();
    }
  }, [useIRSFutures, countriesQuery.data, countriesQuery.isFetching, countriesQuery.refetch]);

  const bestCountrySlug = useMemo(() => {
    if (useIRSFutures) return "";
    const candidates = countriesData.filter((c: any) => c.currency === normalized);
    if (candidates.length === 0) return "";

    // Same heuristic as AllRates: prefer entries with "rating" (best/lowest lexical).
    const sorted = [...candidates].sort((a: any, b: any) => {
      if (a.rating && !b.rating) return -1;
      if (!a.rating && b.rating) return 1;
      if (a.rating && b.rating) return String(a.rating).localeCompare(String(b.rating));
      return 0;
    });

    return sorted[0]?.countrySlug ?? "";
  }, [countriesData, normalized, useIRSFutures]);

  const yieldsQuery = useCountryYields(bestCountrySlug || "");

  const bootstrapResult = useMemo((): BootstrapResult | null => {
    try {
      if (useIRSFutures) {
        const swapPoints: BootstrapPoint[] = [];
        const futuresPoints: BootstrapPoint[] = [];

        const futuresData = futuresQuery.data?.data || [];
        futuresData.forEach((item: any) => {
          const latestPrice = parseFloat(String(item.latest).replace(/[^0-9.-]/g, ""));
          if (Number.isNaN(latestPrice)) return;

          const tenor = maturityToYears(item.maturity);
          const rate = priceToRate(latestPrice);
          if (tenor > 0 && rate > 0 && rate < 0.5) {
            futuresPoints.push({ tenor, rate, source: "futures", priority: 2 });
          }
        });

        const irsData = irsQuery.data?.data || [];
        irsData.forEach((item: any) => {
          if (item.rateValue > 0 && item.rateValue < 50) {
            swapPoints.push({
              tenor: item.tenor,
              rate: item.rateValue / 100,
              source: "swap",
              priority: 1,
            });
          }
        });

        const totalPoints = swapPoints.length + futuresPoints.length;
        if (totalPoints < 2) return null;

        return bootstrap(swapPoints, futuresPoints, method, normalized);
      }

      // Bond-only curves
      const yieldsData = yieldsQuery.data?.data || [];
      const bondPoints: BootstrapPoint[] = yieldsData
        .filter((y: any) => y.yield !== null && y.maturityYears > 0)
        .map((y: any) => ({
          tenor: y.maturityYears,
          rate: (y.yield as number) / 100,
          source: "bond" as const,
          priority: 1,
        }));

      if (bondPoints.length < 2) return null;
      return bootstrapBonds(bondPoints, method, normalized);
    } catch {
      return null;
    }
  }, [
    useIRSFutures,
    method,
    normalized,
    futuresQuery.data,
    irsQuery.data,
    yieldsQuery.data,
  ]);

  const error: string | null = useMemo(() => {
    if (useIRSFutures) {
      const err =
        (futuresQuery as any).error?.message ||
        (irsQuery as any).error?.message ||
        null;
      return err ? String(err) : null;
    }
    const err = (yieldsQuery as any).error?.message || null;
    return err ? String(err) : null;
  }, [useIRSFutures, futuresQuery, irsQuery, yieldsQuery]);

  const isLoading =
    useIRSFutures
      ? futuresQuery.isLoading || irsQuery.isLoading
      : countriesQuery.isFetching || yieldsQuery.isLoading;

  return {
    discountFactors: bootstrapResult?.discountFactors ?? null,
    isLoading,
    error,
  };
}

