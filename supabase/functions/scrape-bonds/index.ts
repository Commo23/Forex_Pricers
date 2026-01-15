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

const COUNTRY_CURRENCIES: Record<string, string> = {
  'switzerland': 'CHF',
  'taiwan': 'TWD',
  'thailand': 'THB',
  'china': 'CNY',
  'japan': 'JPY',
  'singapore': 'SGD',
  'denmark': 'DKK',
  'germany': 'EUR',
  'sweden': 'SEK',
  'netherlands': 'EUR',
  'norway': 'NOK',
  'finland': 'EUR',
  'austria': 'EUR',
  'australia': 'AUD',
  'canada': 'CAD',
  'ireland': 'EUR',
  'france': 'EUR',
  'belgium': 'EUR',
  'new-zealand': 'NZD',
  'united-kingdom': 'GBP',
  'south-korea': 'KRW',
  'malta': 'EUR',
  'czech-republic': 'CZK',
  'israel': 'ILS',
  'slovakia': 'EUR',
  'slovenia': 'EUR',
  'iceland': 'ISK',
  'spain': 'EUR',
  'hong-kong': 'HKD',
  'united-states': 'USD',
  'poland': 'PLN',
  'italy': 'EUR',
  'portugal': 'EUR',
  'croatia': 'EUR',
  'greece': 'EUR',
  'cyprus': 'EUR',
  'hungary': 'HUF',
  'romania': 'RON',
  'india': 'INR',
  'indonesia': 'IDR',
  'philippines': 'PHP',
  'colombia': 'COP',
  'south-africa': 'ZAR',
  'mexico': 'MXN',
  'brazil': 'BRL',
  'russia': 'RUB',
  'turkey': 'TRY',
  'argentina': 'ARS',
  'morocco': 'MAD',
  'egypt': 'EGP',
  'nigeria': 'NGN',
  'kenya': 'KES',
  'vietnam': 'VND',
  'malaysia': 'MYR',
  'saudi-arabia': 'SAR',
  'united-arab-emirates': 'AED',
  'qatar': 'QAR',
  'kuwait': 'KWD',
  'bahrain': 'BHD',
  'oman': 'OMR',
  'chile': 'CLP',
  'peru': 'PEN',
  'pakistan': 'PKR',
  'bangladesh': 'BDT',
  'sri-lanka': 'LKR',
};

interface CountryBondData {
  country: string;
  countrySlug: string;
  currency: string;
  rating: string;
  yield10Y: number | null;
  bankRate: number | null;
  spreadVsBund: number | null;
  spreadVsTNote: number | null;
  spreadVsBankRate: number | null;
}

interface BondYieldData {
  maturity: string;
  maturityYears: number;
  yield: number | null;
  chg1M: number | null;
  chg6M: number | null;
  chg12M: number | null;
  price: number | null;
  priceChg1M: number | null;
  priceChg6M: number | null;
  priceChg12M: number | null;
  capitalGrowth: number | null;
  lastUpdate: string;
}

function parsePercentage(value: string): number | null {
  if (!value) return null;
  const cleaned = value.replace(/[%,]/g, '').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function parseMainTable(markdown: string): CountryBondData[] {
  const results: CountryBondData[] = [];
  const lines = markdown.split('\n');
  
  for (const line of lines) {
    if (!line.includes('|')) continue;
    if (line.includes('---')) continue;
    
    const countryMatch = line.match(/\[([^\]]+)\]\(https:\/\/www\.worldgovernmentbonds\.com\/country\/([^\/]+)\/\)/);
    if (!countryMatch) continue;
    
    const countryName = countryMatch[1].replace(/\s*\(\*\)\s*$/, '').trim();
    const countrySlug = countryMatch[2];
    const currency = COUNTRY_CURRENCIES[countrySlug] || 'USD';
    
    const ratingMatch = line.match(/\[([A-D]{1,3}[+-]?)\]\(https:\/\/www\.worldgovernmentbonds\.com\/credit-rating\//);
    const rating = ratingMatch ? ratingMatch[1] : '';
    
    const yieldMatch = line.match(/\[(\d+\.?\d*%)\]\(https:\/\/www\.worldgovernmentbonds\.com\/bond-historical-data\//);
    const standaloneYieldMatch = line.match(/\|\s*(\d+\.?\d*)%\s*\|/);
    const yield10Y = yieldMatch 
      ? parsePercentage(yieldMatch[1]) 
      : (standaloneYieldMatch ? parsePercentage(standaloneYieldMatch[1] + '%') : null);
    
    const cells = line.split('|').map(c => c.trim());
    let bankRate: number | null = null;
    let spreadVsBund: number | null = null;
    let spreadVsTNote: number | null = null;
    let spreadVsBankRate: number | null = null;
    
    let foundYield = false;
    let foundBankRate = false;
    let spreadCount = 0;
    
    for (const cell of cells) {
      if (!cell) continue;
      
      const linkText = cell.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
      
      const percentMatch = linkText.match(/(\d+\.?\d*)%/);
      if (percentMatch && !linkText.includes('bp')) {
        if (!foundYield) {
          foundYield = true;
        } else if (!foundBankRate) {
          bankRate = parseFloat(percentMatch[1]);
          foundBankRate = true;
        }
      }
      
      const bpMatch = linkText.match(/(-?\d+\.?\d*)\s*bp/i);
      if (bpMatch) {
        const bpValue = parseFloat(bpMatch[1]);
        if (spreadCount === 0) {
          spreadVsBund = bpValue;
        } else if (spreadCount === 1) {
          spreadVsTNote = bpValue;
        } else if (spreadCount === 2) {
          spreadVsBankRate = bpValue;
        }
        spreadCount++;
      }
    }
    
    if (countryName && yield10Y !== null) {
      results.push({
        country: countryName,
        countrySlug,
        currency,
        rating,
        yield10Y,
        bankRate,
        spreadVsBund,
        spreadVsTNote,
        spreadVsBankRate,
      });
    }
  }
  
  return results;
}

function parseCountryYieldTable(markdown: string): BondYieldData[] {
  const tempResults: BondYieldData[] = [];
  const lines = markdown.split('\n');
  
  let tableStarted = false;
  
  for (const line of lines) {
    if (!line.includes('|')) {
      continue;
    }
    if (line.includes('---')) {
      tableStarted = true;
      continue;
    }
    
    const maturityMatch = line.match(/\[(\d+)\s*(months?|years?)\]\(https:\/\/www\.worldgovernmentbonds\.com\/bond-historical-data\//i);
    if (!maturityMatch) continue;
    
    const hasYield = /\|\s*-?\d+\.?\d*%\s*\|/.test(line);
    if (!hasYield) continue;
    
    const maturityValue = parseInt(maturityMatch[1]);
    const maturityUnit = maturityMatch[2].toLowerCase();
    const isMonths = maturityUnit.startsWith('month');
    
    const maturity = `${maturityValue} ${maturityUnit}`;
    const maturityYears = isMonths ? maturityValue / 12 : maturityValue;
    
    const cells = line.split('|').map(c => c.trim());
    
    let yieldVal: number | null = null;
    let chg1M: number | null = null;
    let chg6M: number | null = null;
    let chg12M: number | null = null;
    let price: number | null = null;
    let capitalGrowth: number | null = null;
    let lastUpdate = '';
    
    let bpCount = 0;
    let foundYield = false;
    let foundPrice = false;
    
    for (const cell of cells) {
      if (!cell) continue;
      
      if (cell.includes('worldgovernmentbonds.com/bond-historical-data')) continue;
      
      const dateMatch = cell.match(/(\d{1,2})\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i);
      if (dateMatch) {
        lastUpdate = cell;
        continue;
      }
      
      const yieldMatch = cell.match(/^(-?\d+\.?\d*)%$/);
      if (yieldMatch && !foundYield) {
        yieldVal = parseFloat(yieldMatch[1]);
        foundYield = true;
        continue;
      }
      
      const bpMatch = cell.match(/([+-]?\d+\.?\d*)\s*bp/i);
      if (bpMatch) {
        const bpValue = parseFloat(bpMatch[1]);
        if (bpCount === 0) chg1M = bpValue;
        else if (bpCount === 1) chg6M = bpValue;
        else if (bpCount === 2) chg12M = bpValue;
        bpCount++;
        continue;
      }
      
      const numMatch = cell.match(/^(\d+\.?\d*)$/);
      if (numMatch) {
        const numVal = parseFloat(numMatch[1]);
        if (!foundPrice && numVal >= 50 && numVal <= 150) {
          price = numVal;
          foundPrice = true;
        } else if (numVal > 0 && numVal < 10) {
          capitalGrowth = numVal;
        }
        continue;
      }
    }
    
    if (yieldVal !== null) {
      tempResults.push({
        maturity,
        maturityYears,
        yield: yieldVal,
        chg1M,
        chg6M,
        chg12M,
        price,
        priceChg1M: null,
        priceChg6M: null,
        priceChg12M: null,
        capitalGrowth,
        lastUpdate,
      });
    }
  }
  
  const seen = new Set<number>();
  const results: BondYieldData[] = [];
  for (const item of tempResults) {
    if (!seen.has(item.maturityYears)) {
      seen.add(item.maturityYears);
      results.push(item);
    }
  }
  
  results.sort((a, b) => a.maturityYears - b.maturityYears);
  
  return results;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { type, country } = await req.json();
    
    const apiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!apiKey) {
      console.error('FIRECRAWL_API_KEY not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'Firecrawl API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let url: string;
    if (type === 'countries') {
      url = 'https://www.worldgovernmentbonds.com/';
    } else if (type === 'country' && country) {
      url = `https://www.worldgovernmentbonds.com/country/${country}/`;
    } else {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid request type. Use "countries" or "country" with country slug.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Scraping ${type}: ${url}`);

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

    const data = await response.json();

    if (!response.ok) {
      console.error('Firecrawl API error:', data);
      return new Response(
        JSON.stringify({ success: false, error: data.error || `Request failed with status ${response.status}` }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const markdown = data.data?.markdown || data.markdown || '';
    
    if (type === 'countries') {
      const countries = parseMainTable(markdown);
      console.log(`Parsed ${countries.length} countries`);
      
      return new Response(
        JSON.stringify({
          success: true,
          data: countries,
          scrapedAt: new Date().toISOString(),
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      const yields = parseCountryYieldTable(markdown);
      const currency = COUNTRY_CURRENCIES[country] || 'USD';
      console.log(`Parsed ${yields.length} yield points for ${country}`);
      
      return new Response(
        JSON.stringify({
          success: true,
          country,
          currency,
          data: yields,
          scrapedAt: new Date().toISOString(),
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  } catch (error) {
    console.error('Error scraping bonds:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Export empty to make this a module
export {};

