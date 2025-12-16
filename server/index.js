import express from 'express';
import cors from 'cors';
import puppeteer from 'puppeteer';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Map country names to URL slugs
const getCountryUrl = (country) => {
  const countryMap = {
    "United States": "united-states",
    "United Kingdom": "united-kingdom",
    "South Korea": "south-korea",
    "South Africa": "south-africa",
    "Hong Kong": "hong-kong",
    "New Zealand": "new-zealand",
    "Czech Republic": "czech-republic",
    "Peru": "peru",
    "Bulgaria": "bulgaria",
    "Qatar": "qatar",
    "Bahrain": "bahrain",
    "Botswana": "botswana",
    "Ukraine": "ukraine"
  };

  if (countryMap[country]) {
    return countryMap[country];
  }
  
  return country.toLowerCase().replace(/\s+/g, "-");
};

// Normalize maturity string
const normalizeMaturity = (maturity) => {
  const normalized = maturity.toLowerCase().trim();
  
  // Map common variations to standard format
  const maturityMap = {
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
    '10y': '10 years',
    '15y': '15 years',
    '20y': '20 years',
    '30y': '30 years'
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
};

// Scrape yield curve data for a country
app.post('/api/yield-curve/scrape', async (req, res) => {
  const { country } = req.body;

  if (!country) {
    return res.status(400).json({ error: 'Country is required' });
  }

  let browser = null;
  try {
    const countryUrl = getCountryUrl(country);
    const url = `https://www.worldgovernmentbonds.com/country/${countryUrl}/`;

    console.log(`Scraping ${country} from ${url}`);

    // Launch Puppeteer
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu'
      ]
    });

    const page = await browser.newPage();
    
    // Set viewport and user agent
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // Navigate to the page
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    // Wait for the table to load
    await page.waitForSelector('table', { timeout: 10000 });

    // Extract yield curve data from the table
    const yieldData = await page.evaluate(() => {
      const data = [];
      
      // Find the table containing yield curve data
      const tables = Array.from(document.querySelectorAll('table'));
      
      for (const table of tables) {
        const rows = Array.from(table.querySelectorAll('tr'));
        
        // Find header row to identify column indices
        let headerRow = null;
        let maturityColIndex = -1;
        let lastColIndex = -1;
        
        for (const row of rows) {
          const cells = Array.from(row.querySelectorAll('th, td'));
          const cellTexts = cells.map(cell => cell.textContent?.trim().toLowerCase() || '');
          
          // Look for "Residual Maturity" and "Last" columns
          const maturityIndex = cellTexts.findIndex(text => 
            text.includes('residual') && text.includes('maturity')
          );
          const lastIndex = cellTexts.findIndex(text => 
            text.includes('last') && !text.includes('update')
          );
          
          if (maturityIndex !== -1 && lastIndex !== -1) {
            headerRow = row;
            maturityColIndex = maturityIndex;
            lastColIndex = lastIndex;
            break;
          }
        }
        
        if (maturityColIndex === -1 || lastColIndex === -1) {
          continue; // Skip this table if columns not found
        }
        
        // Extract data from data rows
        for (const row of rows) {
          if (row === headerRow) continue; // Skip header row
          
          const cells = Array.from(row.querySelectorAll('td'));
          
          if (cells.length > Math.max(maturityColIndex, lastColIndex)) {
            const maturityCell = cells[maturityColIndex];
            const lastCell = cells[lastColIndex];
            
            const maturityText = maturityCell?.textContent?.trim() || '';
            const lastText = lastCell?.textContent?.trim() || '';
            
            // Extract yield value (percentage)
            const yieldMatch = lastText.match(/([\d.]+)\s*%/);
            if (yieldMatch && maturityText) {
              const yieldValue = parseFloat(yieldMatch[1]);
              if (!isNaN(yieldValue)) {
                data.push({
                  maturity: maturityText,
                  yield: yieldValue
                });
              }
            }
          }
        }
        
        // If we found data, break (assume first matching table is correct)
        if (data.length > 0) {
          break;
        }
      }
      
      return data;
    });

    // Normalize maturities
    const normalizedData = yieldData
      .map(item => ({
        ...item,
        maturity: normalizeMaturity(item.maturity) || item.maturity
      }))
      .filter(item => item.maturity !== null);

    await browser.close();

    res.json({
      country,
      data: normalizedData,
      lastUpdate: new Date().toISOString()
    });

  } catch (error) {
    console.error(`Error scraping ${country}:`, error);
    
    if (browser) {
      await browser.close();
    }
    
    res.status(500).json({
      country,
      data: [],
      error: error.message || `Failed to scrape data for ${country}`
    });
  }
});

// Scrape multiple countries
app.post('/api/yield-curve/scrape-multiple', async (req, res) => {
  const { countries } = req.body;

  if (!Array.isArray(countries) || countries.length === 0) {
    return res.status(400).json({ error: 'Countries array is required' });
  }

  const results = [];
  
  for (const country of countries) {
    try {
      const countryUrl = getCountryUrl(country);
      const url = `https://www.worldgovernmentbonds.com/country/${countryUrl}/`;

      console.log(`Scraping ${country} from ${url}`);

      let browser = null;
      try {
        browser = await puppeteer.launch({
          headless: true,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--disable-gpu'
          ]
        });

        const page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        await page.goto(url, {
          waitUntil: 'networkidle2',
          timeout: 30000
        });

        await page.waitForSelector('table', { timeout: 10000 });

        const yieldData = await page.evaluate(() => {
          const data = [];
          const tables = Array.from(document.querySelectorAll('table'));
          
          for (const table of tables) {
            const rows = Array.from(table.querySelectorAll('tr'));
            let maturityColIndex = -1;
            let lastColIndex = -1;
            
            for (const row of rows) {
              const cells = Array.from(row.querySelectorAll('th, td'));
              const cellTexts = cells.map(cell => cell.textContent?.trim().toLowerCase() || '');
              
              const maturityIndex = cellTexts.findIndex(text => 
                text.includes('residual') && text.includes('maturity')
              );
              const lastIndex = cellTexts.findIndex(text => 
                text.includes('last') && !text.includes('update')
              );
              
              if (maturityIndex !== -1 && lastIndex !== -1) {
                maturityColIndex = maturityIndex;
                lastColIndex = lastIndex;
                break;
              }
            }
            
            if (maturityColIndex === -1 || lastColIndex === -1) continue;
            
            for (const row of rows) {
              const cells = Array.from(row.querySelectorAll('td'));
              
              if (cells.length > Math.max(maturityColIndex, lastColIndex)) {
                const maturityCell = cells[maturityColIndex];
                const lastCell = cells[lastColIndex];
                
                const maturityText = maturityCell?.textContent?.trim() || '';
                const lastText = lastCell?.textContent?.trim() || '';
                
                const yieldMatch = lastText.match(/([\d.]+)\s*%/);
                if (yieldMatch && maturityText) {
                  const yieldValue = parseFloat(yieldMatch[1]);
                  if (!isNaN(yieldValue)) {
                    data.push({
                      maturity: maturityText,
                      yield: yieldValue
                    });
                  }
                }
              }
            }
            
            if (data.length > 0) break;
          }
          
          return data;
        });

        const normalizedData = yieldData
          .map(item => ({
            ...item,
            maturity: normalizeMaturity(item.maturity) || item.maturity
          }))
          .filter(item => item.maturity !== null);

        await browser.close();

        results.push({
          country,
          data: normalizedData,
          lastUpdate: new Date().toISOString()
        });

      } catch (error) {
        if (browser) await browser.close();
        results.push({
          country,
          data: [],
          error: error.message || `Failed to scrape data for ${country}`
        });
      }
    } catch (error) {
      results.push({
        country,
        data: [],
        error: error.message || `Failed to scrape data for ${country}`
      });
    }
  }

  res.json(results);
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`🚀 Yield Curve Scraper Server running on http://localhost:${PORT}`);
});

