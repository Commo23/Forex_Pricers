const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { symbol, maturity } = await req.json();

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

    let optionsUrl = `https://www.barchart.com/futures/quotes/${symbol}/options`;
    if (maturity) {
      optionsUrl += `/${maturity}`;
    }
    optionsUrl += '?futuresOptionsView=merged';

    console.log(`Scraping options from: ${optionsUrl}`);

    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: optionsUrl,
        formats: ['markdown'],
        onlyMainContent: true,
        waitFor: 12000,
      }),
    });

    const data = await response.json();
    console.log('Firecrawl status:', response.status);

    const markdown = data.data?.markdown || data.markdown || '';
    console.log('Markdown length:', markdown.length);

    const result = parseOptionsMarkdown(markdown);
    
    console.log(`Parsed ${result.calls.length} calls, ${result.puts.length} puts, ${result.expirations.length} expirations`);

    return new Response(
      JSON.stringify({
        success: true,
        data: { calls: result.calls, puts: result.puts, metadata: result.metadata },
        expirations: result.expirations,
        source: result.calls.length > 0 || result.puts.length > 0 ? 'firecrawl' : 'firecrawl-fallback',
        raw: result.calls.length === 0 && result.puts.length === 0 ? markdown.substring(0, 3000) : undefined,
      }),
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

function parseOptionsMarkdown(markdown: string): {
  calls: any[];
  puts: any[];
  expirations: any[];
  metadata: any;
} {
  const calls: any[] = [];
  const puts: any[] = [];
  const expirations: any[] = [];
  const metadata: any = {};
  const lines = markdown.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  // Extract metadata
  for (const line of lines) {
    // "24 Days to expiration on 03/06/26"
    const dteMatch = line.match(/(\d+)\s*Days?\s*to\s*expiration\s*on\s*(\S+)/i);
    if (dteMatch) {
      metadata.daysToExpiration = parseInt(dteMatch[1]);
      metadata.expirationDate = dteMatch[2];
    }
    // "Implied Volatility: 6.84%"
    const ivMatch = line.match(/Implied Volatility:\s*\*?\*?([0-9.]+%?)\*?\*?/i);
    if (ivMatch) {
      metadata.impliedVolatility = ivMatch[1];
    }
  }

  // Extract expirations from the line listing months:
  // "Mar 2026Apr 2026May 2026..." (all concatenated)
  for (const line of lines) {
    const monthPattern = /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s*(20\d{2})/g;
    let match;
    const matches: Array<{label: string; value: string}> = [];
    while ((match = monthPattern.exec(line)) !== null) {
      const month = match[1].toLowerCase();
      const year = match[2].substring(2); // "26"
      const value = `${month}-${year}`;
      const label = `${match[1]} '${year}`;
      matches.push({ label, value });
    }
    if (matches.length >= 3) {
      // This is our expiration line
      for (const m of matches) {
        if (!expirations.find(e => e.value === m.value)) {
          expirations.push(m);
        }
      }
    }
  }

  // Parse options data
  // Each option row starts with a strike like "1.16750C" or "1.16750P"
  // Followed by 12 values: Open, High, Low, Latest, Change, Bid, Ask, Volume, OpenInt, Premium, LastTrade
  // The section headers are "#### Calls" and "#### Puts"
  
  let section: 'calls' | 'puts' | 'unknown' = 'unknown';
  
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === '#### Calls' || lines[i].toLowerCase() === 'calls') {
      section = 'calls';
      continue;
    }
    if (lines[i] === '#### Puts' || lines[i].toLowerCase() === 'puts') {
      section = 'puts';
      continue;
    }

    // Match strike patterns: "1.16750C" or "1.16750P" or "1.19000C"
    const strikeMatch = lines[i].match(/^(\d+\.\d+)(C|P)$/);
    if (!strikeMatch) continue;

    const strike = strikeMatch[1];
    const type = strikeMatch[2]; // C or P
    
    // Use section header to determine, or fallback to C/P suffix
    const targetSection = section !== 'unknown' ? section : (type === 'C' ? 'calls' : 'puts');
    
    // Collect the next values (up to 12: Open, High, Low, Latest, Change, Bid, Ask, Volume, OI, Premium, LastTrade)
    const values: string[] = [];
    let j = i + 1;
    while (j < lines.length && values.length < 12) {
      const line = lines[j];
      // Stop at next strike pattern or section header
      if (/^\d+\.\d+(C|P)$/.test(line)) break;
      if (line.startsWith('####')) break;
      // Accept: numbers, signed numbers, N/A, "unch", time patterns, dates
      if (/^[-+]?[\d,]+\.?\d*s?$/.test(line) || /^N\/A$/i.test(line) || /^unch$/i.test(line) || /^\d+:\d+/.test(line) || /^\d{2}\/\d{2}\/\d{2}$/.test(line)) {
        values.push(line.replace(/s$/, '')); // Remove trailing 's' (settlement marker)
      }
      j++;
    }

    if (values.length >= 5) {
      const option = {
        strike,
        open: values[0] || 'N/A',
        high: values[1] || 'N/A',
        low: values[2] || 'N/A',
        last: values[3] || 'N/A',
        change: values[4] === 'unch' ? '0' : (values[4] || 'N/A'),
        bid: values[5] || 'N/A',
        ask: values[6] || 'N/A',
        volume: values[7] || 'N/A',
        openInterest: values[8] || 'N/A',
      };

      if (targetSection === 'puts') {
        puts.push(option);
      } else {
        calls.push(option);
      }
    }
  }

  return { calls, puts, expirations, metadata };
}
