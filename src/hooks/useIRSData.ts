import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchIRSRates } from '@/lib/rate-explorer/api/irs';
import { IRSResponse } from '@/lib/rate-explorer/irsIndices';
import { useCallback } from 'react';

export function useIRSData(currency: string) {
  const queryClient = useQueryClient();

  const query = useQuery<IRSResponse>({
    queryKey: ['irs-rates', currency],
    queryFn: () => fetchIRSRates(currency, false),
    staleTime: 1000 * 60 * 30, // 30 minutes (matches cache duration)
    refetchOnWindowFocus: false,
    refetchInterval: false, // Don't auto-refetch, use cache
    enabled: !!currency,
  });

  const forceRefresh = useCallback(() => {
    // Force refresh bypasses cache
    queryClient.fetchQuery({
      queryKey: ['irs-rates', currency],
      queryFn: () => fetchIRSRates(currency, true),
    });
  }, [queryClient, currency]);

  return {
    ...query,
    forceRefresh,
  };
}
