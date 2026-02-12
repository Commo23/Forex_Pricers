const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!apiKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'Firecrawl API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Scraping currencies from Barchart via Firecrawl...');

    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: 'https://www.barchart.com/futures/currencies',
        formats: ['markdown'],
        onlyMainContent: true,
        waitFor: 12000,
      }),
    });

    const data = await response.json();
    console.log('Firecrawl status:', response.status);
    
    const markdown = data.data?.markdown || data.markdown || '';
    console.log('Markdown length:', markdown.length);

    const currencies = parseCurrenciesMarkdown(markdown);
    
    if (currencies.length > 0) {
      console.log(`Parsed ${currencies.length} currencies`);
      return new Response(
        JSON.stringify({ success: true, data: currencies, source: 'firecrawl' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, data: [], source: 'firecrawl-fallback', raw: markdown.substring(0, 3000) }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function parseCurrenciesMarkdown(markdown: string): any[] {
  const currencies: any[] = [];
  const lines = markdown.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  
  // Pattern on currencies page:
  // [DXH26](https://www.barchart.com/futures/quotes/DXH26/overview)
  // [U.S. Dollar Index (Mar '26)](https://www.barchart.com/futures/quotes/DXH26/futures-prices)
  // 96.690  (last)
  // +0.002  (change)
  // 96.830  (open)
  // 96.870  (high)
  // 96.480  (low)
  // 15,686  (volume)
  // 14:03 CT (time)
  
  for (let i = 0; i < lines.length; i++) {
    // Match the symbol link: [DXH26](url/overview)
    const symbolMatch = lines[i].match(/^\[([A-Z0-9]+)\]\(https:\/\/www\.barchart\.com\/futures\/quotes\/([A-Z0-9]+)\/overview\)$/);
    if (!symbolMatch) continue;
    
    const symbol = symbolMatch[2];
    
    // Next line should be the name link: [Name (Month)](url/futures-prices)
    let name = symbol;
    let nextIdx = i + 1;
    if (nextIdx < lines.length) {
      const nameMatch = lines[nextIdx].match(/^\[(.+?)\]\(https:\/\/www\.barchart\.com\/futures\/quotes\//);
      if (nameMatch) {
        name = nameMatch[1];
        nextIdx++;
      }
    }
    
    // Collect numeric values after
    const values: string[] = [];
    while (nextIdx < lines.length && values.length < 8) {
      const line = lines[nextIdx];
      // Stop at next symbol link
      if (line.startsWith('[') && line.includes('/overview)')) break;
      // Accept: numbers, signed numbers, N/A, time patterns
      if (/^[-+]?[\d,]+\.?\d*$/.test(line) || /^N\/A$/i.test(line) || /^\d+:\d+\s*CT/.test(line) || /^[-+]\d/.test(line) || /^unch$/i.test(line)) {
        values.push(line);
      }
      nextIdx++;
    }
    
    if (values.length >= 2) {
      currencies.push({
        symbol,
        name,
        last: values[0] || 'N/A',
        change: values[1] || 'N/A',
        percentChange: '', // Not in the page in this view
        high: values[3] || 'N/A',
        low: values[4] || 'N/A',
        volume: values[5] || 'N/A',
        time: values[6] || 'N/A',
      });
    }
  }
  
  return currencies;
}
