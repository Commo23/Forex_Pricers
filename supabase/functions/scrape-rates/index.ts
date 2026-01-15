// Deno types for Supabase Edge Functions
declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
  serve(handler: (req: Request) => Promise<Response> | Response): void;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Rate indices configuration with correct URLs
const RATE_INDICES: Record<string, {
  name: string;
  currency: string;
  url: string;
  symbolPrefix: string;
}> = {
  euribor3m: {
    name: "3-Month Euribor",
    currency: "EUR",
    url: "https://www.barchart.com/futures/quotes/IMF26/futures-prices",
    symbolPrefix: "IM"
  },
  sofr: {
    name: "SOFR 3-Month",
    currency: "USD",
    url: "https://www.barchart.com/futures/quotes/SQV25/futures-prices",
    symbolPrefix: "SQ"
  },
  sonia: {
    name: "SONIA 3-Month",
    currency: "GBP",
    url: "https://www.barchart.com/futures/quotes/J8Z25/futures-prices",
    symbolPrefix: "J8"
  },
  estr3m: {
    name: "3-Month ESTR",
    currency: "EUR",
    url: "https://www.barchart.com/futures/quotes/RAV25/futures-prices",
    symbolPrefix: "RA"
  },
  estr1m: {
    name: "1-Month ESTR",
    currency: "EUR",
    url: "https://www.barchart.com/futures/quotes/EGV25/futures-prices",
    symbolPrefix: "EG"
  },
  estr3m_long: {
    name: "3-Month ESTR (Long)",
    currency: "EUR",
    url: "https://www.barchart.com/futures/quotes/RAH30/futures-prices",
    symbolPrefix: "RA"
  },
  tona3m: {
    name: "3-Month TONA",
    currency: "JPY",
    url: "https://www.barchart.com/futures/quotes/T0Z25/futures-prices",
    symbolPrefix: "T0"
  },
  saron3m: {
    name: "3-Month SARON",
    currency: "CHF",
    url: "https://www.barchart.com/futures/quotes/J2Z25/futures-prices",
    symbolPrefix: "J2"
  },
  corra3m: {
    name: "CORRA 3-Month",
    currency: "CAD",
    url: "https://www.barchart.com/futures/quotes/RGZ25/futures-prices",
    symbolPrefix: "RG"
  },
  sora3m: {
    name: "3M SORA Futures",
    currency: "SGD",
    url: "https://www.barchart.com/futures/quotes/KUAZ25/futures-prices",
    symbolPrefix: "KUA"
  }
};

interface FuturesData {
  contract: string;
  maturity: string;
  latest: string;
  change: string;
  changeValue: number;
  open: string;
  high: string;
  low: string;
  previous: string;
}

function parseMarkdownData(markdown: string, symbolPrefix: string): FuturesData[] {
  const results: FuturesData[] = [];
  const lines = markdown.split("\n");
  
  const contractLinkPattern = new RegExp(`\\[(${symbolPrefix}[A-Z]?[FGHJKMNQUVXZ]\\d{2})\\s*\\(([^)]+)\\)\\]\\([^)]+\\)`);
  
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    const match = line.match(contractLinkPattern);
    
    if (match) {
      const contract = match[1];
      const maturity = match[2];
      
      const values: string[] = [];
      let j = i + 1;
      
      while (j < lines.length && values.length < 12) {
        const valueLine = lines[j].trim();
        
        if (contractLinkPattern.test(valueLine)) break;
        
        if (!valueLine) {
          j++;
          continue;
        }
        
        if (valueLine.includes("Contract") || valueLine.includes("Latest") || valueLine.includes("---")) {
          j++;
          continue;
        }
        
        if (/^[\d\.\-+sunch]+$|^N\/A$|^\d{1,2}\/\d{1,2}\/\d{2}$/.test(valueLine.replace(/s$/, ''))) {
          values.push(valueLine);
        }
        
        j++;
      }
      
      if (values.length >= 6) {
        const latest = values[0].replace(/s$/, '').trim();
        const changeStr = values[1].trim();
        const open = values[2].replace(/s$/, '').trim();
        const high = values[3].replace(/s$/, '').trim();
        const low = values[4].replace(/s$/, '').trim();
        const previous = values[5].replace(/s$/, '').trim();
        
        let changeValue = 0;
        let change = changeStr;
        
        if (changeStr.toLowerCase() === "unch" || changeStr === "0") {
          changeValue = 0;
          change = "unch";
        } else {
          changeValue = parseFloat(changeStr) || 0;
          if (changeValue !== 0) {
            change = (changeValue > 0 ? "+" : "") + changeStr;
          }
        }
        
        if (latest && !isNaN(parseFloat(latest))) {
          results.push({
            contract,
            maturity,
            latest,
            change: changeValue === 0 ? "unch" : change,
            changeValue,
            open: open === "N/A" ? latest : open,
            high: high === "N/A" ? latest : high,
            low: low === "N/A" ? latest : low,
            previous: previous === "N/A" ? latest : previous,
          });
        }
      }
      
      i = j;
    } else {
      i++;
    }
  }
  
  console.log(`Parsed ${results.length} contracts with prefix ${symbolPrefix}`);
  return results;
}

async function scrapeRateData(apiKey: string, url: string, symbolPrefix: string): Promise<FuturesData[]> {
  console.log(`Scraping: ${url}`);

  try {
    const response = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url,
        formats: ["markdown"],
        onlyMainContent: false,
        waitFor: 3000,
      }),
    });

    if (!response.ok) {
      console.error(`Firecrawl error: ${response.status}`);
      return [];
    }

    const data = await response.json();
    const markdown = data.data?.markdown || data.markdown || "";
    
    console.log(`Markdown length: ${markdown.length}`);
    
    if (markdown.length < 1000) {
      console.error("Markdown too short, possible blocking");
      return [];
    }

    const results = parseMarkdownData(markdown, symbolPrefix);
    console.log(`Extracted ${results.length} contracts`);
    
    return results;
  } catch (error) {
    console.error(`Error scraping:`, error);
    return [];
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("FIRECRAWL_API_KEY");
    if (!apiKey) {
      console.error("FIRECRAWL_API_KEY not configured");
      return new Response(
        JSON.stringify({ success: false, error: "Firecrawl not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { index } = await req.json();

    if (!index || !RATE_INDICES[index]) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Invalid index. Valid indices: " + Object.keys(RATE_INDICES).join(", ") 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const rateConfig = RATE_INDICES[index];
    console.log(`Fetching ${rateConfig.name} data from ${rateConfig.url}...`);

    const data = await scrapeRateData(apiKey, rateConfig.url, rateConfig.symbolPrefix);

    if (data.length === 0) {
      console.error("No data extracted - scraping may have failed");
      return new Response(
        JSON.stringify({
          success: false,
          error: "Unable to extract data from source. The page may be blocking requests.",
          index: index,
          name: rateConfig.name,
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        index: index,
        name: rateConfig.name,
        currency: rateConfig.currency,
        data,
        lastUpdated: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in scrape-rates:", error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error" 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// Export empty to make this a module
export {};

