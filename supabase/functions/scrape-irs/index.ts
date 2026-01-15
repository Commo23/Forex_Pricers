// Deno types for Supabase Edge Functions
declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
  serve(handler: (req: Request) => Promise<Response> | Response): void;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const IRS_INDICES: Record<string, {
  name: string;
  currency: string;
  maturities: number[];
  urlPattern: string;
}> = {
  usd: {
    name: "USD Interest Rate Swap",
    currency: "USD",
    maturities: [1, 2, 3, 4, 5, 6, 7, 8, 10, 30],
    urlPattern: "usd-{maturity}-interest-rate-swap"
  },
  eur: {
    name: "EUR Interest Rate Swap",
    currency: "EUR",
    maturities: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 15, 25, 30],
    urlPattern: "eur-{maturity}-irs-interest-rate-swap"
  },
  gbp: {
    name: "GBP Interest Rate Swap",
    currency: "GBP",
    maturities: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 20, 25, 30],
    urlPattern: "gbp-{maturity}-irs-interest-rate-swap"
  },
  chf: {
    name: "CHF Interest Rate Swap",
    currency: "CHF",
    maturities: [1, 2, 3, 4, 5, 7, 8, 9, 10],
    urlPattern: "chf-{maturity}-irs-interest-rate-swap"
  },
  jpy: {
    name: "JPY Interest Rate Swap",
    currency: "JPY",
    maturities: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 20, 25, 30],
    urlPattern: "jpy-{maturity}-irs-interest-rate-swap"
  }
};

interface IRSData {
  maturity: string;
  tenor: number;
  rate: string;
  rateValue: number;
  change: string;
  changeValue: number;
  prevClose: string;
  dayLow: string;
  dayHigh: string;
  yearLow: string;
  yearHigh: string;
}

function formatMaturity(years: number): string {
  return years === 1 ? "1-year" : `${years}-years`;
}

function parseRateFromMarkdown(markdown: string): {
  rate: number;
  change: number;
  prevClose: string;
  dayLow: string;
  dayHigh: string;
  yearLow: string;
  yearHigh: string;
} | null {
  try {
    const lines = markdown.split('\n');
    
    let rate = 0;
    let change = 0;
    let prevClose = "N/A";
    let dayLow = "N/A";
    let dayHigh = "N/A";
    let yearLow = "N/A";
    let yearHigh = "N/A";
    
    for (let i = 0; i < Math.min(lines.length, 50); i++) {
      const line = lines[i].trim();
      
      if (/^[\d]+\.[\d]+$/.test(line) && rate === 0) {
        rate = parseFloat(line);
      }
      
      const changeMatch = line.match(/^([+-]?[\d.]+)\(([+-]?[\d.]+)%\)$/);
      if (changeMatch && change === 0) {
        change = parseFloat(changeMatch[1]);
      }
    }
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      const dayRangeMatch = line.match(/Day's Range([\d.]+)-([\d.]+)/);
      if (dayRangeMatch) {
        dayLow = dayRangeMatch[1];
        dayHigh = dayRangeMatch[2];
      }
      
      const yearRangeMatch = line.match(/52 wk Range([\d.]+)-([\d.]+)/);
      if (yearRangeMatch) {
        yearLow = yearRangeMatch[1];
        yearHigh = yearRangeMatch[2];
      }
      
      if (line.startsWith('Prev. Close') && i + 2 < lines.length) {
        const nextLine = lines[i + 2].trim();
        if (/^[\d.]+$/.test(nextLine)) {
          prevClose = nextLine;
        }
      }
      
      if (lines[i - 1]?.trim() === 'Prev. Close' && /^[\d.]+$/.test(line)) {
        prevClose = line;
      }
    }
    
    if (rate === 0) {
      return null;
    }
    
    return { rate, change, prevClose, dayLow, dayHigh, yearLow, yearHigh };
  } catch (error) {
    console.error('Error parsing rate from markdown:', error);
    return null;
  }
}

async function scrapeIRSData(
  apiKey: string, 
  currency: string,
  maturity: number,
  urlPattern: string
): Promise<IRSData | null> {
  try {
    const maturityStr = formatMaturity(maturity);
    const urlPath = urlPattern.replace('{maturity}', maturityStr);
    const url = `https://www.investing.com/rates-bonds/${urlPath}`;
    
    console.log(`Scraping IRS: ${currency} ${maturity}Y from ${url}`);
    
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url,
        formats: ['markdown'],
        onlyMainContent: true,
        waitFor: 2000,
      }),
    });
    
    if (!response.ok) {
      console.error(`Firecrawl API error for ${currency} ${maturity}Y: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    const markdown = data.data?.markdown || data.markdown || '';
    
    if (!markdown) {
      console.error(`No markdown content for ${currency} ${maturity}Y`);
      return null;
    }
    
    const parsed = parseRateFromMarkdown(markdown);
    
    if (!parsed) {
      console.error(`Could not parse rate for ${currency} ${maturity}Y`);
      return null;
    }
    
    const changeDisplay = parsed.change >= 0 
      ? `+${parsed.change.toFixed(4)}` 
      : parsed.change.toFixed(4);
    
    return {
      maturity: `${maturity}Y`,
      tenor: maturity,
      rate: parsed.rate.toFixed(4),
      rateValue: parsed.rate,
      change: changeDisplay,
      changeValue: parsed.change,
      prevClose: parsed.prevClose,
      dayLow: parsed.dayLow,
      dayHigh: parsed.dayHigh,
      yearLow: parsed.yearLow,
      yearHigh: parsed.yearHigh,
    };
  } catch (error) {
    console.error(`Error scraping ${currency} ${maturity}Y:`, error);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { currency } = await req.json();
    
    if (!currency) {
      return new Response(
        JSON.stringify({ success: false, error: 'Currency is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const currencyLower = currency.toLowerCase();
    const irsConfig = IRS_INDICES[currencyLower];
    
    if (!irsConfig) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Unknown currency: ${currency}. Available: ${Object.keys(IRS_INDICES).join(', ')}` 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const apiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!apiKey) {
      console.error('FIRECRAWL_API_KEY not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'Firecrawl API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log(`Starting IRS scrape for ${currency} with ${irsConfig.maturities.length} maturities`);
    
    const results: IRSData[] = [];
    
    for (const maturity of irsConfig.maturities) {
      const data = await scrapeIRSData(apiKey, currency.toUpperCase(), maturity, irsConfig.urlPattern);
      if (data) {
        results.push(data);
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    results.sort((a, b) => a.tenor - b.tenor);
    
    console.log(`Scraped ${results.length}/${irsConfig.maturities.length} maturities for ${currency}`);
    
    return new Response(
      JSON.stringify({
        success: true,
        currency: currency.toUpperCase(),
        name: irsConfig.name,
        data: results,
        lastUpdated: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error('Error in scrape-irs:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Export empty to make this a module
export {};

