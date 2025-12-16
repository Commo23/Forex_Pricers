/**
 * Service pour scraper les données de yield curve depuis worldgovernmentbonds.com
 * Utilise Puppeteer via le backend API pour le scraping réel
 */

export interface YieldDataPoint {
  maturity: string;
  yield: number;
}

export interface CountryYieldData {
  country: string;
  data: YieldDataPoint[];
  lastUpdate?: string;
  error?: string;
}

class YieldCurveService {
  private static instance: YieldCurveService;
  private cache: Map<string, { data: CountryYieldData; timestamp: number }> = new Map();
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
  private readonly API_BASE_URL = 'http://localhost:3001';

  private constructor() {}

  static getInstance(): YieldCurveService {
    if (!YieldCurveService.instance) {
      YieldCurveService.instance = new YieldCurveService();
    }
    return YieldCurveService.instance;
  }

  /**
   * Scrape yield curve data for a specific country using Puppeteer backend
   */
  async scrapeCountryData(country: string): Promise<CountryYieldData> {
    // Check cache first
    const cached = this.cache.get(country);
    if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
      return cached.data;
    }

    try {
      const response = await fetch(`${this.API_BASE_URL}/api/yield-curve/scrape`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ country })
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch data for ${country}: ${response.statusText}`);
      }

      const result: CountryYieldData = await response.json();

      // Cache the result
      if (!result.error) {
        this.cache.set(country, {
          data: result,
          timestamp: Date.now()
        });
      }

      return result;
    } catch (error) {
      console.error(`Error scraping ${country}:`, error);
      return {
        country,
        data: [],
        error: error instanceof Error ? error.message : `Failed to load data for ${country}`
      };
    }
  }

  /**
   * Scrape yield curve data for multiple countries using Puppeteer backend
   */
  async scrapeMultipleCountries(countries: string[]): Promise<CountryYieldData[]> {
    try {
      const response = await fetch(`${this.API_BASE_URL}/api/yield-curve/scrape-multiple`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ countries })
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch data: ${response.statusText}`);
      }

      const results: CountryYieldData[] = await response.json();

      // Cache successful results
      results.forEach(result => {
        if (!result.error) {
          this.cache.set(result.country, {
            data: result,
            timestamp: Date.now()
          });
        }
      });

      return results;
    } catch (error) {
      console.error('Error scraping multiple countries:', error);
      // Return error for all countries if the request fails
      return countries.map(country => ({
        country,
        data: [],
        error: error instanceof Error ? error.message : 'Failed to load data'
      }));
    }
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}

export default YieldCurveService;

