import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchRateData } from "@/lib/rate-explorer/api/rates";
import { useCallback } from "react";

export function useRateData(index: string) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["rateData", index],
    queryFn: () => fetchRateData(index, false),
    staleTime: 1000 * 60 * 30, // 30 minutes (matches cache duration)
    refetchInterval: false, // Don't auto-refetch, use cache
    refetchOnWindowFocus: false,
    enabled: !!index, // Don't fetch if index is empty
  });

  const forceRefresh = useCallback(() => {
    // Force refresh bypasses cache
    queryClient.fetchQuery({
      queryKey: ["rateData", index],
      queryFn: () => fetchRateData(index, true),
    });
  }, [queryClient, index]);

  return {
    ...query,
    forceRefresh,
  };
}

