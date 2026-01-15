import { rateExplorerSupabase } from "../supabaseClient";
import { RateResponse } from "../rateIndices";
import { getCachedRateData, setCachedRateData } from "../dataCache";

export async function fetchRateData(index: string, forceRefresh = false): Promise<RateResponse> {
  // Check cache first (unless force refresh)
  if (!forceRefresh) {
    const cached = getCachedRateData(index);
    if (cached) {
      console.log(`Using cached rate data for ${index}`);
      return cached;
    }
  }

  try {
    console.log(`Fetching fresh rate data for ${index}`);
    const { data, error } = await rateExplorerSupabase.functions.invoke("scrape-rates", {
      body: { index },
    });

    if (error) {
      console.error("Error fetching rate data:", error);
      return { success: false, error: error.message };
    }

    const response = data as RateResponse;
    
    // Cache successful responses
    if (response.success && response.data) {
      setCachedRateData(index, response);
    }

    return response;
  } catch (err) {
    console.error("Error calling edge function:", err);
    return { 
      success: false, 
      error: err instanceof Error ? err.message : "Unknown error" 
    };
  }
}

