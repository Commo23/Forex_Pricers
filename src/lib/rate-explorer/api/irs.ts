import { rateExplorerSupabase } from '../supabaseClient';
import { IRSResponse } from '../irsIndices';
import { getCachedIRSData, setCachedIRSData } from '../dataCache';

export async function fetchIRSRates(currency: string, forceRefresh = false): Promise<IRSResponse> {
  // Check cache first (unless force refresh)
  if (!forceRefresh) {
    const cached = getCachedIRSData(currency);
    if (cached) {
      console.log(`Using cached IRS data for ${currency}`);
      return cached;
    }
  }

  try {
    console.log(`Fetching fresh IRS data for ${currency}`);
    const { data, error } = await rateExplorerSupabase.functions.invoke('scrape-irs', {
      body: { currency },
    });

    if (error) {
      console.error('Error fetching IRS rates:', error);
      return { success: false, error: error.message };
    }

    const response = data as IRSResponse;
    
    // Cache successful responses
    if (response.success && response.data) {
      setCachedIRSData(currency, response);
    }

    return response;
  } catch (error) {
    console.error('Error fetching IRS rates:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

