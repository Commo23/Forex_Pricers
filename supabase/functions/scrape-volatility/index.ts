const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const OPTIONS_TYPES = [
  { label: 'Monthly Options', value: 'monthly' },
  { label: 'Friday Weekly Options', value: 'weeklyFriday' },
  { label: 'Monday Weekly Options', value: 'weeklyMonday' },
  { label: 'Tuesday Weekly Options', value: 'weeklyTuesday' },
  { label: 'Wednesday Weekly Options', value: 'weeklyWednesday' },
  { label: 'Thursday Weekly Options', value: 'weeklyThursday' },
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { futureSymbol, optionSymbol, moneyness, maturity, optionsType } = await req.json();

    if (!futureSymbol) {
      return new Response(
        JSON.stringify({ success: false, error: 'futureSymbol is required' }),
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

    const mn = moneyness || 50;
    const optSym = optionSymbol || futureSymbol;
    
    // Build query params
    const params = new URLSearchParams();
    params.set('futuresOptionsView', 'merged');
    params.set('moneyness', String(mn));
    if (optionsType && optionsType !== 'monthly') {
      params.set('futuresOptionsType', optionsType);
    }

    const symbolPart = maturity || optSym;
    const url = `https://www.barchart.com/futures/quotes/${futureSymbol}/volatility-greeks/${symbolPart}?${params.toString()}`;
    console.log(`Scraping volatility from: ${url}`);

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

    const result = parseVolatilityMarkdown(markdown);
    console.log(`Parsed ${result.calls.length} calls, ${result.puts.length} puts, ${result.expirations.length} expirations`);

    return new Response(
      JSON.stringify({
        success: true,
        data: { calls: result.calls, puts: result.puts, metadata: result.metadata },
        expirations: result.expirations,
        optionsTypes: OPTIONS_TYPES,
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

interface GreekRow {
  strike: string;
  type: string;
  latest: string;
  iv: string;
  delta: string;
  gamma: string;
  theta: string;
  vega: string;
  ivSkew: string;
  lastTrade: string;
}

function parseVolatilityMarkdown(markdown: string): {
  calls: GreekRow[];
  puts: GreekRow[];
  expirations: Array<{ label: string; value: string }>;
  metadata: { daysToExpiration?: number; expirationDate?: string; pointValue?: string };
} {
  const calls: GreekRow[] = [];
  const puts: GreekRow[] = [];
  const expirations: Array<{ label: string; value: string }> = [];
  const metadata: { daysToExpiration?: number; expirationDate?: string; pointValue?: string } = {};
  const lines = markdown.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  // Extract metadata
  for (const line of lines) {
    const dteMatch = line.match(/\*?\*?(\d+)\s*Days?\*?\*?\s*to\s*expiration\s*on\s*\*?\*?(\S+)\*?\*?/i);
    if (dteMatch) {
      metadata.daysToExpiration = parseInt(dteMatch[1]);
      metadata.expirationDate = dteMatch[2];
    }
    const pvMatch = line.match(/Price Value of Option point:\s*\*?\*?([^*]+)\*?\*?/i);
    if (pvMatch) {
      metadata.pointValue = pvMatch[1].trim();
    }
  }

  // Extract expirations from links
  const expSet = new Set<string>();
  for (const line of lines) {
    const expPattern = /\[([^\]]+)\]\(https:\/\/www\.barchart\.com\/futures\/quotes\/[A-Z0-9]+\/volatility-greeks\/([A-Z0-9]+)\)/g;
    let match;
    while ((match = expPattern.exec(line)) !== null) {
      const label = match[1].trim();
      const value = match[2];
      if (!expSet.has(value)) {
        expSet.add(value);
        expirations.push({ label, value });
      }
    }
  }

  // Also try concatenated month patterns
  if (expirations.length === 0) {
    for (const line of lines) {
      const monthPattern = /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s*(20\d{2})/g;
      let match;
      const matches: Array<{ label: string; value: string }> = [];
      while ((match = monthPattern.exec(line)) !== null) {
        const month = match[1].toLowerCase();
        const year = match[2].substring(2);
        const value = `${month}-${year}`;
        const label = `${match[1]} '${year}`;
        matches.push({ label, value });
      }
      if (matches.length >= 3) {
        for (const m of matches) {
          if (!expirations.find(e => e.value === m.value)) {
            expirations.push(m);
          }
        }
      }
    }
  }

  // Also extract weekly expirations like "Week 2: Feb 2026"
  for (const line of lines) {
    const weekPattern = /\[?(Week\s*\d+:\s*(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s*20\d{2})\]?/gi;
    let match;
    while ((match = weekPattern.exec(line)) !== null) {
      const label = match[1].trim();
      const value = label.replace(/\s+/g, '-').toLowerCase();
      if (!expSet.has(value)) {
        expSet.add(value);
        expirations.push({ label, value });
      }
    }
  }

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

    const strikeMatch = lines[i].match(/^(\d+\.\d+)$/);
    if (!strikeMatch) continue;

    const nextLine = lines[i + 1];
    if (!nextLine || (nextLine !== 'Call' && nextLine !== 'Put')) continue;

    const strike = strikeMatch[1];
    const type = nextLine;
    const targetSection = section !== 'unknown' ? section : (type === 'Call' ? 'calls' : 'puts');

    const values: string[] = [];
    let j = i + 2;
    while (j < lines.length && values.length < 8) {
      const line = lines[j];
      if (/^\d+\.\d+$/.test(line) && lines[j + 1] && (lines[j + 1] === 'Call' || lines[j + 1] === 'Put')) break;
      if (line.startsWith('####')) break;
      if (line === 'false') { j++; continue; }
      if (['Strike', 'Type', 'Latest', 'IV', 'Delta', 'Gamma', 'Theta', 'Vega', 'Links', 'Last Trade', 'IV Skew'].includes(line)) { j++; continue; }
      if (line.startsWith('![')) { j++; continue; }
      if (/^[-+]?[\d,.]+%?s?$/.test(line) || /^\d{2}\/\d{2}\/\d{2}$/.test(line) || /^\d+:\d+/.test(line) || /^N\/A$/i.test(line) || /^unch$/i.test(line)) {
        values.push(line.replace(/s$/, ''));
      }
      j++;
    }

    if (values.length >= 6) {
      const row: GreekRow = {
        strike,
        type,
        latest: values[0] || 'N/A',
        iv: values[1] || 'N/A',
        delta: values[2] || 'N/A',
        gamma: values[3] || 'N/A',
        theta: values[4] || 'N/A',
        vega: values[5] || 'N/A',
        ivSkew: values[6] || 'N/A',
        lastTrade: values[7] || 'N/A',
      };

      if (targetSection === 'puts') {
        puts.push(row);
      } else {
        calls.push(row);
      }
    }
  }

  return { calls, puts, expirations, metadata };
}
