import { useQuery } from "@tanstack/react-query";
import { fetchAllCountries, fetchCountryYields } from "@/lib/rate-explorer/api/bonds";

export function useCountriesBonds() {
  return useQuery({
    queryKey: ['bonds', 'countries'],
    queryFn: fetchAllCountries,
    staleTime: 1000 * 60 * 30, // 30 minutes
    refetchOnWindowFocus: false,
    enabled: false, // Manual trigger only
  });
}

export function useCountryYields(countrySlug: string) {
  return useQuery({
    queryKey: ['bonds', 'country', countrySlug],
    queryFn: () => fetchCountryYields(countrySlug),
    staleTime: 1000 * 60 * 30, // 30 minutes
    refetchOnWindowFocus: false,
    enabled: !!countrySlug,
  });
}
