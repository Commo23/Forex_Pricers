const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { symbol } = await req.json();

    if (!symbol) {
      return new Response(
        JSON.stringify({ success: false, error: 'Symbol is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!apiKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'Firecrawl API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const url = `https://www.barchart.com/futures/quotes/${symbol}/futures-prices`;
    console.log(`Scraping futures from: ${url}`);

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
        waitFor: 12000,
      }),
    });

    const data = await response.json();
    console.log('Firecrawl status:', response.status);

    const markdown = data.data?.markdown || data.markdown || '';
    console.log('Markdown length:', markdown.length);

    const futures = parseFuturesMarkdown(markdown);
    
    if (futures.length > 0) {
      console.log(`Parsed ${futures.length} futures contracts`);
      return new Response(
        JSON.stringify({ success: true, data: futures, source: 'firecrawl' }),
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

function parseFuturesMarkdown(markdown: string): any[] {
  const futures: any[] = [];
  const lines = markdown.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  
  // Pattern: [E6H26 (Mar '26)](https://www.barchart.com/futures/quotes/E6H26/overview)
  // Followed by: last, change, open, high, low, previous, volume, openInterest, time
  for (let i = 0; i < lines.length; i++) {
    const linkMatch = lines[i].match(/\[([A-Z0-9]+)\s*\(([^)]+)\)\]\(https:\/\/www\.barchart\.com\/futures\/quotes\/([A-Z0-9]+)\/overview\)/);
    if (!linkMatch) continue;
    
    const contract = linkMatch[3];
    const month = linkMatch[2];
    
    // Collect subsequent values
    const values: string[] = [];
    let j = i + 1;
    while (j < lines.length && values.length < 10) {
      const line = lines[j];
      if (line.startsWith('[') || line.startsWith('#') || line.startsWith('!')) break;
      if (/^[-+]?[\d,]+\.?\d*$/.test(line) || /^N\/A$/i.test(line) || /^\d+:\d+/.test(line) || /^[-+]?\d/.test(line)) {
        values.push(line);
      }
      j++;
    }
    
    if (values.length >= 2) {
      futures.push({
        contract,
        month,
        last: values[0] || 'N/A',
        change: values[1] || 'N/A',
        // values[2] = open, values[3] = high, values[4] = low, values[5] = previous
        open: values[2] || 'N/A',
        high: values[3] || 'N/A',
        low: values[4] || 'N/A',
        // values[5] = previous close (skip)
        volume: values[6] || 'N/A',
        openInterest: values[7] || 'N/A',
        time: values[8] || 'N/A',
        percentChange: '',
      });
    }
  }
  
  return futures;
}
