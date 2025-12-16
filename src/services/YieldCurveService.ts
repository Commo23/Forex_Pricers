/**
 * Service pour scraper les données de yield curve depuis worldgovernmentbonds.com
 * Note: Le scraping direct depuis le navigateur peut avoir des problèmes CORS.
 * En production, cela devrait être fait via un backend proxy/API.
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

  private constructor() {}

  static getInstance(): YieldCurveService {
    if (!YieldCurveService.instance) {
      YieldCurveService.instance = new YieldCurveService();
    }
    return YieldCurveService.instance;
  }

  /**
   * Convert country name to URL format
   */
  private getCountryUrl(country: string): string {
    const countryMap: { [key: string]: string } = {
      "United States": "united-states",
      "United Kingdom": "united-kingdom",
      "South Korea": "south-korea",
      "South Africa": "south-africa",
      "Hong Kong": "hong-kong",
      "New Zealand": "new-zealand",
      "Czech Republic": "czech-republic",
      "Peru": "peru"
    };

    if (countryMap[country]) {
      return countryMap[country];
    }
    
    // Convert to lowercase and replace spaces with hyphens
    return country.toLowerCase().replace(/\s+/g, "-");
  }

  /**
   * Parse HTML to extract yield curve data
   */
  private parseYieldCurveData(html: string, country: string): YieldDataPoint[] {
    const yieldData: YieldDataPoint[] = [];
    
    try {
      // Create a temporary DOM element to parse HTML
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      
      // Try multiple selectors to find the yield curve table
      // The table structure may vary, so we try different approaches
      let table: HTMLTableElement | null = null;
      
      // Try to find table with yield curve data
      const tables = doc.querySelectorAll('table');
      for (const t of Array.from(tables)) {
        const text = t.textContent || '';
        // Look for table that contains maturity and yield information
        if (text.includes('month') || text.includes('year') || text.includes('Maturity')) {
          table = t as HTMLTableElement;
          break;
        }
      }

      if (!table) {
        // Try alternative: look for divs or other elements containing yield data
        const yieldElements = doc.querySelectorAll('[class*="yield"], [class*="maturity"], [id*="yield"]');
        console.warn(`No table found for ${country}, trying alternative parsing`);
      }

      if (table) {
        const rows = table.querySelectorAll('tr');
        
        rows.forEach((row, index) => {
          // Skip header row
          if (index === 0) return;
          
          const cells = row.querySelectorAll('td, th');
          if (cells.length >= 2) {
            // First cell should contain maturity
            const maturityCell = cells[0];
            const maturityText = maturityCell?.textContent?.trim() || '';
            
            // Look for yield in subsequent cells
            // Yield is usually in the "Last" column
            let yieldValue: number | null = null;
            
            for (let i = 1; i < cells.length; i++) {
              const cellText = cells[i]?.textContent?.trim() || '';
              // Try to extract percentage value
              const match = cellText.match(/([\d.]+)\s*%/);
              if (match) {
                yieldValue = parseFloat(match[1]);
                break;
              }
              // Also try without % sign
              const numMatch = cellText.match(/^([\d.]+)$/);
              if (numMatch && !isNaN(parseFloat(numMatch[1]))) {
                yieldValue = parseFloat(numMatch[1]);
                break;
              }
            }
            
            if (maturityText && yieldValue !== null && !isNaN(yieldValue)) {
              // Normalize maturity format
              const normalizedMaturity = this.normalizeMaturity(maturityText);
              if (normalizedMaturity) {
                yieldData.push({
                  maturity: normalizedMaturity,
                  yield: yieldValue
                });
              }
            }
          }
        });
      }
    } catch (error) {
      console.error(`Error parsing HTML for ${country}:`, error);
    }

    return yieldData;
  }

  /**
   * Normalize maturity string to standard format
   */
  private normalizeMaturity(maturity: string): string | null {
    const normalized = maturity.toLowerCase().trim();
    
    // Map common variations to standard format
    const maturityMap: { [key: string]: string } = {
      '1m': '1 month',
      '3m': '3 months',
      '6m': '6 months',
      '9m': '9 months',
      '1y': '1 year',
      '2y': '2 years',
      '3y': '3 years',
      '4y': '4 years',
      '5y': '5 years',
      '6y': '6 years',
      '7y': '7 years',
      '8y': '8 years',
      '9y': '9 years',
      '10y': '10 years'
    };

    // Check if it matches a known pattern
    for (const [key, value] of Object.entries(maturityMap)) {
      if (normalized.includes(key) || normalized.includes(value)) {
        return value;
      }
    }

    // Return original if it contains month or year
    if (normalized.includes('month') || normalized.includes('year')) {
      return maturity.trim();
    }

    return null;
  }

  /**
   * Scrape yield curve data for a specific country
   */
  async scrapeCountryData(country: string): Promise<CountryYieldData> {
    // Check cache first
    const cached = this.cache.get(country);
    if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
      return cached.data;
    }

    try {
      const countryUrl = this.getCountryUrl(country);
      const url = `https://www.worldgovernmentbonds.com/country/${countryUrl}/`;

      // Use a CORS proxy or backend API in production
      // For now, we'll try direct fetch (may fail due to CORS)
      const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
      
      const response = await fetch(proxyUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch data for ${country}: ${response.statusText}`);
      }

      const proxyData = await response.json();
      const html = proxyData.contents || '';

      if (!html) {
        throw new Error(`No HTML content received for ${country}`);
      }

      const yieldData = this.parseYieldCurveData(html, country);

      const result: CountryYieldData = {
        country,
        data: yieldData,
        lastUpdate: new Date().toISOString()
      };

      // Cache the result
      this.cache.set(country, {
        data: result,
        timestamp: Date.now()
      });

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
   * Scrape yield curve data for multiple countries
   */
  async scrapeMultipleCountries(countries: string[]): Promise<CountryYieldData[]> {
    const promises = countries.map(country => this.scrapeCountryData(country));
    return Promise.all(promises);
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}

export default YieldCurveService;

