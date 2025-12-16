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
    "Perù": "peru",
    "Bulgaria": "bulgaria",
    "Bulgaria (*)": "bulgaria",
    "Qatar": "qatar",
    "Qatar (*)": "qatar",
    "Bahrain": "bahrain",
    "Bahrain (*)": "bahrain",
    "Botswana": "botswana",
    "Botswana (*)": "botswana",
    "Ukraine": "ukraine",
    "Ukraine (*)": "ukraine"
  };

  if (countryMap[country]) {
    return countryMap[country];
  }
  
  // Remove (*) markers and normalize
  const cleaned = country.replace(/\s*\(\*\)\s*$/, '');
  return cleaned.toLowerCase().replace(/\s+/g, "-");
};

// Normalize maturity string to standard format
const normalizeMaturity = (maturity) => {
  if (!maturity || typeof maturity !== 'string') {
    return null;
  }

  const normalized = maturity.toLowerCase().trim();
  
  // Extract number and unit
  const match = normalized.match(/(\d+(?:\.\d+)?)\s*(month|months|year|years|m|y|mo|yr)/i);
  
  if (!match) {
    // Try to return original if it looks like a maturity
    if (normalized.includes('month') || normalized.includes('year') || normalized.includes('m') || normalized.includes('y')) {
      return maturity.trim();
    }
    return null;
  }

  const number = parseFloat(match[1]);
  const unit = match[2].toLowerCase();

  // Convert to standard format
  if (unit.includes('month') || unit === 'm' || unit === 'mo') {
    if (number === 1) {
      return '1 month';
    }
    return `${number} months`;
  } else if (unit.includes('year') || unit === 'y' || unit === 'yr') {
    if (number === 1) {
      return '1 year';
    }
    return `${number} years`;
  }

  // Fallback: return original if it contains month or year
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
      headless: 'new',
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

    // Wait for dynamic content to load - the page loads data via JavaScript
    // Wait for "Loading data" indicators to disappear
    try {
      // Wait for loading indicators to disappear (they contain "Loading data" text)
      await page.waitForFunction(() => {
        const loadingElements = Array.from(document.querySelectorAll('*')).filter(el => 
          el.textContent && el.textContent.includes('Loading data')
        );
        return loadingElements.length === 0;
      }, { timeout: 15000 });
      
      console.log(`Loading indicators disappeared for ${country}`);
    } catch (e) {
      console.log(`Still waiting for data to load for ${country}, continuing anyway...`);
    }

    // Additional wait to ensure tables are populated
    await page.waitForTimeout(3000);

    // Wait for the table to load
    try {
      await page.waitForSelector('table', { timeout: 10000 });
    } catch (e) {
      console.log(`No table found for ${country}, trying to continue...`);
    }

    // Extract yield curve data from the table
    // The page has multiple tables, we need to find the one with yield curve data
    const yieldData = await page.evaluate(() => {
      const data = [];
      const tables = Array.from(document.querySelectorAll('table'));
      
      console.log(`Found ${tables.length} tables on page`);
      
      for (let tableIndex = 0; tableIndex < tables.length; tableIndex++) {
        const table = tables[tableIndex];
        const rows = Array.from(table.querySelectorAll('tr'));
        
        // Skip tables with too few rows (likely not the yield curve table)
        if (rows.length < 3) {
          console.log(`Table ${tableIndex}: Skipping (only ${rows.length} rows)`);
          continue;
        }
        
        console.log(`Table ${tableIndex}: Processing ${rows.length} rows`);
        
        // Find header rows - could be multiple rows with colspan
        let maturityColIndex = -1;
        let lastColIndex = -1;
        let headerRowsEnd = 0;
        
        // Look through first few rows to find headers
        // The yield curve table typically has "Residual Maturity" and "Last" columns
        for (let rowIndex = 0; rowIndex < Math.min(10, rows.length); rowIndex++) {
          const row = rows[rowIndex];
          const cells = Array.from(row.querySelectorAll('th, td'));
          
          // Check if this row contains "Residual Maturity"
          const cellTexts = cells.map(cell => {
            const text = cell.textContent?.trim() || '';
            // Also check for colspan to understand table structure
            const colspan = parseInt(cell.getAttribute('colspan') || '1');
            return { text: text.toLowerCase(), colspan };
          });
          
          const maturityIndex = cellTexts.findIndex(item => 
            (item.text.includes('residual') && item.text.includes('maturity')) ||
            (item.text === 'residual maturity') ||
            (item.text.includes('maturity') && !item.text.includes('zero') && !item.text.includes('coupon') && !item.text.includes('history'))
          );
          
          if (maturityIndex !== -1) {
            console.log(`Found maturity column at index ${maturityIndex} in row ${rowIndex}`);
            
            // Found maturity column, now find "Last" column
            // The "Last" column is typically under "Annualized Yield"
            // We need to check if there's a row above with "Annualized Yield"
            
            // Check current row and previous rows for "Annualized Yield" header
            for (let checkRow = 0; checkRow <= rowIndex; checkRow++) {
              const checkCells = Array.from(rows[checkRow].querySelectorAll('th, td'));
              const checkTexts = checkCells.map(c => c.textContent?.trim().toLowerCase() || '');
              
              const yieldHeaderIndex = checkTexts.findIndex(text => 
                text.includes('annualized') && text.includes('yield')
              );
              
              if (yieldHeaderIndex !== -1) {
                console.log(`Found "Annualized Yield" header at column ${yieldHeaderIndex} in row ${checkRow}`);
                
                // Found "Annualized Yield" header, now find "Last" in current or next row
                // "Last" should be in the same column group as "Annualized Yield"
                const lastRow = rows[Math.min(rowIndex + 1, rows.length - 1)];
                const lastCells = Array.from(lastRow.querySelectorAll('th, td'));
                const lastTexts = lastCells.map(c => c.textContent?.trim().toLowerCase() || '');
                
                // Find "Last" column - it should be in the same column group as "Annualized Yield"
                const lastIndex = lastTexts.findIndex(text => 
                  (text.includes('last') && !text.includes('update')) ||
                  text === 'last'
                );
                
                if (lastIndex !== -1) {
                  maturityColIndex = maturityIndex;
                  lastColIndex = lastIndex;
                  headerRowsEnd = Math.max(rowIndex + 1, checkRow + 1);
                  console.log(`Found both columns: maturity=${maturityColIndex}, last=${lastColIndex}, headerRowsEnd=${headerRowsEnd}`);
                  break;
                }
              }
            }
            
            // If we didn't find it with Annualized Yield, try simpler approach
            if (lastColIndex === -1) {
              const lastIndex = cellTexts.findIndex(item => 
                (item.text.includes('last') && !item.text.includes('update')) ||
                item.text === 'last'
              );
              
              if (lastIndex !== -1) {
                maturityColIndex = maturityIndex;
                lastColIndex = lastIndex;
                headerRowsEnd = rowIndex + 1;
                console.log(`Found columns (simple): maturity=${maturityColIndex}, last=${lastColIndex}`);
              }
            }
            
            if (maturityColIndex !== -1 && lastColIndex !== -1) {
              break;
            }
          }
        }
        
        if (maturityColIndex === -1 || lastColIndex === -1) {
          console.log(`Table ${tableIndex}: Could not find required columns`);
          continue; // Skip this table if columns not found
        }
        
        console.log(`Table ${tableIndex}: Extracting data from row ${headerRowsEnd} onwards`);
        
        // Extract data from data rows (skip header rows)
        for (let rowIndex = headerRowsEnd; rowIndex < rows.length; rowIndex++) {
          const row = rows[rowIndex];
          const cells = Array.from(row.querySelectorAll('td'));
          
          if (cells.length > Math.max(maturityColIndex, lastColIndex)) {
            const maturityCell = cells[maturityColIndex];
            const lastCell = cells[lastColIndex];
            
            const maturityText = maturityCell?.textContent?.trim() || '';
            const lastText = lastCell?.textContent?.trim() || '';
            
            // Skip empty rows or header-like rows
            if (!maturityText || !lastText || maturityText.toLowerCase().includes('maturity')) {
              continue;
            }
            
            // Skip rows that still show "Loading data"
            if (maturityText.includes('Loading') || lastText.includes('Loading')) {
              continue;
            }
            
            // Extract yield value (percentage) - try multiple patterns
            let yieldValue = null;
            
            // Pattern 1: "2.391%" or "2.391 %"
            const yieldMatch1 = lastText.match(/([\d.]+)\s*%/);
            if (yieldMatch1) {
              yieldValue = parseFloat(yieldMatch1[1]);
            }
            
            // Pattern 2: Just a number (assume percentage)
            if (yieldValue === null || isNaN(yieldValue)) {
              const numMatch = lastText.match(/^([\d.]+)$/);
              if (numMatch) {
                yieldValue = parseFloat(numMatch[1]);
              }
            }
            
            // Pattern 3: Number with spaces or other characters
            if (yieldValue === null || isNaN(yieldValue)) {
              const numMatch2 = lastText.match(/([\d.]+)/);
              if (numMatch2) {
                yieldValue = parseFloat(numMatch2[1]);
              }
            }
            
            if (yieldValue !== null && !isNaN(yieldValue) && maturityText) {
              console.log(`Extracted: ${maturityText} -> ${yieldValue}%`);
              data.push({
                maturity: maturityText,
                yield: yieldValue
              });
            }
          }
        }
        
        // If we found data, break (assume first matching table is correct)
        if (data.length > 0) {
          console.log(`Table ${tableIndex}: Successfully extracted ${data.length} data points`);
          break;
        } else {
          console.log(`Table ${tableIndex}: No data extracted`);
        }
      }
      
      return data;
    });

    console.log(`Raw data extracted for ${country}:`, yieldData.length, 'items');

    // Normalize maturities
    const normalizedData = yieldData
      .map(item => ({
        ...item,
        maturity: normalizeMaturity(item.maturity) || item.maturity
      }))
      .filter(item => item.maturity !== null);

    console.log(`Normalized data for ${country}:`, normalizedData.length, 'items');

    await browser.close();

    if (normalizedData.length === 0) {
      console.warn(`No data extracted for ${country}. This might indicate a parsing issue.`);
    }

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
          headless: 'new',
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

        // Wait for dynamic content to load - the page loads data via JavaScript
        // Wait for "Loading data" indicators to disappear
        try {
          // Wait for loading indicators to disappear (they contain "Loading data" text)
          await page.waitForFunction(() => {
            const loadingElements = Array.from(document.querySelectorAll('*')).filter(el => 
              el.textContent && el.textContent.includes('Loading data')
            );
            return loadingElements.length === 0;
          }, { timeout: 15000 });
          
          console.log(`Loading indicators disappeared for ${country}`);
        } catch (e) {
          console.log(`Still waiting for data to load for ${country}, continuing anyway...`);
        }

        // Additional wait to ensure tables are populated
        await page.waitForTimeout(3000);

        // Wait for the table to load
        try {
          await page.waitForSelector('table', { timeout: 10000 });
        } catch (e) {
          console.log(`No table found for ${country}, trying to continue...`);
        }

        const yieldData = await page.evaluate(() => {
          const data = [];
          const tables = Array.from(document.querySelectorAll('table'));
          
          for (let tableIndex = 0; tableIndex < tables.length; tableIndex++) {
            const table = tables[tableIndex];
            const rows = Array.from(table.querySelectorAll('tr'));
            
            // Skip tables with too few rows (likely not the yield curve table)
            if (rows.length < 3) {
              continue;
            }
            
            // Find header rows - could be multiple rows with colspan
            let maturityColIndex = -1;
            let lastColIndex = -1;
            let headerRowsEnd = 0;
            
            // Look through first few rows to find headers
            for (let rowIndex = 0; rowIndex < Math.min(10, rows.length); rowIndex++) {
              const row = rows[rowIndex];
              const cells = Array.from(row.querySelectorAll('th, td'));
              
              // Check if this row contains "Residual Maturity"
              const cellTexts = cells.map(cell => {
                const text = cell.textContent?.trim() || '';
                const colspan = parseInt(cell.getAttribute('colspan') || '1');
                return { text: text.toLowerCase(), colspan };
              });
              
              const maturityIndex = cellTexts.findIndex(item => 
                (item.text.includes('residual') && item.text.includes('maturity')) ||
                (item.text === 'residual maturity') ||
                (item.text.includes('maturity') && !item.text.includes('zero') && !item.text.includes('coupon') && !item.text.includes('history'))
              );
              
              if (maturityIndex !== -1) {
                // Found maturity column, now find "Last" column
                // Check current row and previous rows for "Annualized Yield" header
                for (let checkRow = 0; checkRow <= rowIndex; checkRow++) {
                  const checkCells = Array.from(rows[checkRow].querySelectorAll('th, td'));
                  const checkTexts = checkCells.map(c => c.textContent?.trim().toLowerCase() || '');
                  
                  const yieldHeaderIndex = checkTexts.findIndex(text => 
                    text.includes('annualized') && text.includes('yield')
                  );
                  
                  if (yieldHeaderIndex !== -1) {
                    // Found "Annualized Yield" header, now find "Last" in current or next row
                    const lastRow = rows[Math.min(rowIndex + 1, rows.length - 1)];
                    const lastCells = Array.from(lastRow.querySelectorAll('th, td'));
                    const lastTexts = lastCells.map(c => c.textContent?.trim().toLowerCase() || '');
                    
                    // Find "Last" column
                    const lastIndex = lastTexts.findIndex(text => 
                      (text.includes('last') && !text.includes('update')) ||
                      text === 'last'
                    );
                    
                    if (lastIndex !== -1) {
                      maturityColIndex = maturityIndex;
                      lastColIndex = lastIndex;
                      headerRowsEnd = Math.max(rowIndex + 1, checkRow + 1);
                      break;
                    }
                  }
                }
                
                // If we didn't find it with Annualized Yield, try simpler approach
                if (lastColIndex === -1) {
                  const lastIndex = cellTexts.findIndex(item => 
                    (item.text.includes('last') && !item.text.includes('update')) ||
                    item.text === 'last'
                  );
                  
                  if (lastIndex !== -1) {
                    maturityColIndex = maturityIndex;
                    lastColIndex = lastIndex;
                    headerRowsEnd = rowIndex + 1;
                  }
                }
                
                if (maturityColIndex !== -1 && lastColIndex !== -1) {
                  break;
                }
              }
            }
            
            if (maturityColIndex === -1 || lastColIndex === -1) {
              continue; // Skip this table if columns not found
            }
            
            // Extract data from data rows (skip header rows)
            for (let rowIndex = headerRowsEnd; rowIndex < rows.length; rowIndex++) {
              const row = rows[rowIndex];
              const cells = Array.from(row.querySelectorAll('td'));
              
              if (cells.length > Math.max(maturityColIndex, lastColIndex)) {
                const maturityCell = cells[maturityColIndex];
                const lastCell = cells[lastColIndex];
                
                const maturityText = maturityCell?.textContent?.trim() || '';
                const lastText = lastCell?.textContent?.trim() || '';
                
                // Skip empty rows or header-like rows
                if (!maturityText || !lastText || maturityText.toLowerCase().includes('maturity')) {
                  continue;
                }
                
                // Skip rows that still show "Loading data"
                if (maturityText.includes('Loading') || lastText.includes('Loading')) {
                  continue;
                }
                
                // Extract yield value (percentage) - try multiple patterns
                let yieldValue = null;
                
                // Pattern 1: "2.391%" or "2.391 %"
                const yieldMatch1 = lastText.match(/([\d.]+)\s*%/);
                if (yieldMatch1) {
                  yieldValue = parseFloat(yieldMatch1[1]);
                }
                
                // Pattern 2: Just a number (assume percentage)
                if (yieldValue === null || isNaN(yieldValue)) {
                  const numMatch = lastText.match(/^([\d.]+)$/);
                  if (numMatch) {
                    yieldValue = parseFloat(numMatch[1]);
                  }
                }
                
                // Pattern 3: Number with spaces or other characters
                if (yieldValue === null || isNaN(yieldValue)) {
                  const numMatch2 = lastText.match(/([\d.]+)/);
                  if (numMatch2) {
                    yieldValue = parseFloat(numMatch2[1]);
                  }
                }
                
                if (yieldValue !== null && !isNaN(yieldValue) && maturityText) {
                  data.push({
                    maturity: maturityText,
                    yield: yieldValue
                  });
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

        console.log(`Raw data extracted for ${country}:`, yieldData.length, 'items');

        const normalizedData = yieldData
          .map(item => ({
            ...item,
            maturity: normalizeMaturity(item.maturity) || item.maturity
          }))
          .filter(item => item.maturity !== null);

        console.log(`Normalized data for ${country}:`, normalizedData.length, 'items');

        await browser.close();

        if (normalizedData.length === 0) {
          console.warn(`No data extracted for ${country}. This might indicate a parsing issue.`);
        }

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

