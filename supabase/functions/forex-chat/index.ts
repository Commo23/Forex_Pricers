import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ChatSettings {
  responseStyle: "concise" | "detailed" | "technical";
  enableMarketData: boolean;
  enableFunctionCalls: boolean;
  customInstructions: string;
  fxDisplayMode: "card" | "json";
  assetClass: "forex" | "commodities";
}

interface MarketData {
  rates: Record<string, number>;
  timestamp: string;
  pairs: Array<{
    pair: string;
    spotRate: number;
    bid: number;
    ask: number;
  }>;
}

interface PerplexitySearchResult {
  content: string;
  citations: string[];
}

interface FXExtractionData {
  amount: number | null;
  currency: string | null;
  direction: "receive" | "pay" | null;
  maturity: string | null;
  baseCurrency: string | null;
  currentRate: number | null;
  Barriere: number | null;
  hedgeDirection: "upside" | "downside" | null;
}

const RESPONSE_STYLE_INSTRUCTIONS = {
  concise: `## Style de Réponse: CONCIS
- Réponds de manière brève et directe (2-3 phrases max par point)
- Évite les détails superflus et les longues explications
- Va droit au but avec des recommandations claires
- Utilise des listes à puces courtes`,
  
  detailed: `## Style de Réponse: DÉTAILLÉ
- Fournis des explications complètes avec contexte
- Inclus des exemples concrets et des calculs
- Explique le raisonnement derrière chaque recommandation
- Compare les alternatives quand c'est pertinent`,
  
  technical: `## Style de Réponse: TECHNIQUE
- Utilise le jargon financier professionnel (Greeks, basis points, etc.)
- Inclus des formules et des calculs précis
- Référence les normes (ISDA, IFRS 9, etc.)
- Suppose que l'utilisateur a une expertise avancée`,
};

const FUNCTION_CALL_INSTRUCTIONS = `
## Capacités de Calcul
Tu peux effectuer des calculs et analyses:
- Pricing de forwards et options (Black-Scholes, Garman-Kohlhagen)
- Calcul des Greeks (Delta, Gamma, Vega, Theta)
- Valorisation de positions de hedging
- Analyse de scénarios et stress tests
- Calcul de VaR et sensibilités`;

function getTodayDate(): string {
  return new Date().toISOString().split('T')[0];
}

const FX_EXTRACTION_INSTRUCTIONS = `
## MODE EXTRACTION DE DONNÉES FX

**DATE DU JOUR: ${getTodayDate()}** - Utilise cette date pour calculer le time to maturity.

IMPORTANT: Quand l'utilisateur exprime une demande de couverture de change (hedging), tu dois:

1. ANALYSER son message et extraire les informations suivantes:

### Champs OBLIGATOIRES:
- amount (number): montant numérique sans devise (ex: 1000000 pour "1M")
- currency (string): devise du flux (USD, EUR, GBP, CHF, JPY, CAD, AUD, etc.)
- direction (string): "receive" (je reçois) ou "pay" (je paie)
- maturity (number): TOUJOURS en format ANNUALISÉ décimal (ex: 0.5 pour 6 mois, 0.25 pour 3 mois)
- baseCurrency (string): devise de référence du client (EUR, USD, etc.)

### Champs OPTIONNELS:
- currentRate (number|null): taux de change currency/baseCurrency - TU DOIS LE CHERCHER via les données de marché
- Barriere (number|null): niveau de protection souhaité
- hedgeDirection (string|null): "upside" (hausse) ou "downside" (baisse)

2. RÈGLES DE CONVERSION:

### Montants:
- "1M", "1 million" → 1000000
- "500K", "500 mille" → 500000
- "2,5M" → 2500000
- "1.5M" → 1500000

### Devises (normalisation):
- "dollar", "dollars", "$", "USD" → "USD"
- "euro", "euros", "€", "EUR" → "EUR"
- "livre", "livres", "£", "GBP" → "GBP"
- "yen", "¥", "JPY" → "JPY"
- Si pays mentionné: "France" → baseCurrency = "EUR", "USA" → baseCurrency = "USD", etc.

### Direction:
- "recevoir", "reçois", "encaisser", "perception" → "receive"
- "payer", "paie", "décaisser", "verser" → "pay"

### Maturité (CALCUL PRÉCIS avec la date du jour ${getTodayDate()}):
- "dans 6 mois" → 0.5
- "dans 3 mois" → 0.25
- "dans 1 an" → 1.0
- "dans 18 mois" → 1.5
- Pour une DATE PRÉCISE: calcule (dateÉchéance - dateAujourdhui) / 365
  Exemple: Si aujourd'hui = ${getTodayDate()} et échéance = 2026-07-12, alors maturity = (181 jours) / 365 = 0.496

### Direction de couverture (hedgeDirection):
- "couvrir à la baisse", "protection baisse", "ne pas descendre", "plancher" → "downside"
- "couvrir à la hausse", "protection hausse", "ne pas monter", "plafond" → "upside"
- IMPORTANT: Si tu déduis hedgeDirection à partir du contexte mais que ce n'est pas explicitement mentionné, 
  tu DOIS confirmer avec l'utilisateur. Par exemple:
  "Je comprends que vous souhaitez une protection contre la baisse (downside). Pouvez-vous confirmer ?"

3. SI UN CHAMP OBLIGATOIRE MANQUE:
- Tu DOIS demander à l'utilisateur de le fournir
- Ta question DOIT OBLIGATOIREMENT contenir le symbole "?"
- Utilise la MÊME LANGUE que l'utilisateur
- Exemple: "Quelle est votre devise de référence (base currency) ?"

4. POUR LE TAUX ACTUEL (currentRate):
- Utilise les données de marché fournies pour trouver le taux currency/baseCurrency
- Format: currency/baseCurrency (ex: USD/EUR si currency=USD et baseCurrency=EUR)
- OBLIGATOIRE: Tu dois toujours chercher ce taux dans les données fournies

5. QUAND TOUTES LES DONNÉES SONT COMPLÈTES:
- Génère le JSON à la TOUTE FIN de ta réponse
- NE PAS utiliser de blocs de code markdown (\`\`\`)
- Format EXACT - commence par FX_DATA: suivi du JSON sur UNE SEULE LIGNE:

FX_DATA:{"amount":1000000,"currency":"USD","direction":"receive","maturity":0.5,"baseCurrency":"EUR","currentRate":0.92,"Barriere":null,"hedgeDirection":"downside"}

6. EXEMPLES:

Input: "Je reçois 1M USD dans 6 mois, ma devise principale est EUR"
Output: Confirme les données et termine par:
FX_DATA:{"amount":1000000,"currency":"USD","direction":"receive","maturity":0.5,"baseCurrency":"EUR","currentRate":0.92,"Barriere":null,"hedgeDirection":null}

Input: "Je dois payer 500K GBP le 15 juillet 2026"
Calcul: Du ${getTodayDate()} au 2026-07-15 = X jours, maturity = X/365
Output: Demande la devise de base, puis génère le JSON avec la maturity calculée.
`;

const COMMODITIES_SYSTEM_PROMPT = `Tu es CommodityRisk AI, un assistant expert en Risk Management dans le domaine des MATIÈRES PREMIÈRES (Commodities). Tu aides les utilisateurs à comprendre et gérer leurs risques liés aux commodities.

## Ton Expertise
- **Matières premières énergétiques**: pétrole brut (Brent, WTI), gaz naturel, charbon, électricité
- **Métaux**: or, argent, cuivre, aluminium, zinc, nickel, platine, palladium
- **Produits agricoles**: blé, maïs, soja, café, cacao, sucre, coton
- **Stratégies de couverture**: forwards, futures, swaps, options sur commodities
- **Analyse des risques**: exposition prix, risque de base, risque de volume, risque de contrepartie
- **Marchés**: LME (métaux), NYMEX/ICE (énergie), CBOT/CME (agricoles)
- **Réglementation**: EMIR, Dodd-Frank, MiFID II pour les dérivés commodities

## Contexte Important
- Tu comprends que "commodities" = matières premières
- Tu peux discuter des stratégies de hedging similaires au forex mais adaptées aux commodities
- Tu analyses les positions spot, forwards, futures et options
- Tu calcules les Greeks pour les options commodities
- Tu connais les particularités: contango, backwardation, roll yield, basis risk`;

const COMMODITIES_EXTRACTION_INSTRUCTIONS = `
## MODE EXTRACTION DE DONNÉES COMMODITIES

**DATE DU JOUR: ${getTodayDate()}** - Utilise cette date pour calculer le time to maturity.

IMPORTANT: Quand l'utilisateur exprime une demande de couverture de commodities, tu dois:

1. ANALYSER son message et extraire les informations suivantes:

### Champs OBLIGATOIRES:
- amount (number): quantité (ex: 1000 pour "1000 barils" ou "1000 tonnes")
- currency (string): la COMMODITY concernée (OIL, GAS, GOLD, SILVER, COPPER, WHEAT, CORN, etc.)
- direction (string): "receive" (je vends/produis) ou "pay" (j'achète/consomme)
- maturity (number): TOUJOURS en format ANNUALISÉ décimal
- baseCurrency (string): devise de cotation (USD, EUR, etc.)

### Champs OPTIONNELS:
- currentRate (number|null): prix actuel de la commodity
- Barriere (number|null): niveau de prix de protection souhaité
- hedgeDirection (string|null): "upside" (protection contre hausse des prix) ou "downside" (protection contre baisse des prix)

### Direction de couverture (hedgeDirection):
- Producteur/Vendeur → généralement "downside" (protection contre la baisse des prix)
- Acheteur/Consommateur → généralement "upside" (protection contre la hausse des prix)
- IMPORTANT: Confirme toujours avec l'utilisateur si déduit du contexte

2. FORMAT DE SORTIE:
FX_DATA:{"amount":1000,"currency":"OIL","direction":"pay","maturity":0.5,"baseCurrency":"USD","currentRate":75.50,"Barriere":null,"hedgeDirection":"upside"}
`;

async function fetchMarketData(): Promise<MarketData | null> {
  try {
    const response = await fetch("https://api.exchangerate-api.com/v4/latest/USD");
    if (!response.ok) {
      console.error("Failed to fetch market data:", response.status);
      return null;
    }
    
    const data = await response.json();
    const rates = data.rates;
    
    // Calculate common FX pairs
    const pairs = [
      { 
        pair: "EUR/USD", 
        spotRate: parseFloat((1 / rates.EUR).toFixed(4)),
        bid: parseFloat((1 / rates.EUR - 0.0001).toFixed(4)),
        ask: parseFloat((1 / rates.EUR + 0.0001).toFixed(4)),
      },
      { 
        pair: "GBP/USD", 
        spotRate: parseFloat((1 / rates.GBP).toFixed(4)),
        bid: parseFloat((1 / rates.GBP - 0.0001).toFixed(4)),
        ask: parseFloat((1 / rates.GBP + 0.0001).toFixed(4)),
      },
      { 
        pair: "USD/JPY", 
        spotRate: parseFloat(rates.JPY.toFixed(2)),
        bid: parseFloat((rates.JPY - 0.01).toFixed(2)),
        ask: parseFloat((rates.JPY + 0.01).toFixed(2)),
      },
      { 
        pair: "USD/CHF", 
        spotRate: parseFloat(rates.CHF.toFixed(4)),
        bid: parseFloat((rates.CHF - 0.0001).toFixed(4)),
        ask: parseFloat((rates.CHF + 0.0001).toFixed(4)),
      },
      { 
        pair: "EUR/GBP", 
        spotRate: parseFloat((rates.GBP / rates.EUR).toFixed(4)),
        bid: parseFloat((rates.GBP / rates.EUR - 0.0001).toFixed(4)),
        ask: parseFloat((rates.GBP / rates.EUR + 0.0001).toFixed(4)),
      },
      { 
        pair: "AUD/USD", 
        spotRate: parseFloat((1 / rates.AUD).toFixed(4)),
        bid: parseFloat((1 / rates.AUD - 0.0001).toFixed(4)),
        ask: parseFloat((1 / rates.AUD + 0.0001).toFixed(4)),
      },
      { 
        pair: "USD/CAD", 
        spotRate: parseFloat(rates.CAD.toFixed(4)),
        bid: parseFloat((rates.CAD - 0.0001).toFixed(4)),
        ask: parseFloat((rates.CAD + 0.0001).toFixed(4)),
      },
      { 
        pair: "NZD/USD", 
        spotRate: parseFloat((1 / rates.NZD).toFixed(4)),
        bid: parseFloat((1 / rates.NZD - 0.0001).toFixed(4)),
        ask: parseFloat((1 / rates.NZD + 0.0001).toFixed(4)),
      },
    ];
    
    return {
      rates,
      timestamp: new Date().toISOString(),
      pairs,
    };
  } catch (error) {
    console.error("Error fetching market data:", error);
    return null;
  }
}

// Search for additional market data using Perplexity
async function searchMarketData(query: string): Promise<PerplexitySearchResult | null> {
  const PERPLEXITY_API_KEY = Deno.env.get("PERPLEXITY_API_KEY");
  
  if (!PERPLEXITY_API_KEY) {
    console.log("Perplexity API key not configured, skipping web search");
    return null;
  }

  try {
    const response = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${PERPLEXITY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "sonar",
        messages: [
          { 
            role: "system", 
            content: "You are a financial market data expert. Provide precise, current market data including FX rates, forward points, volatility, and any relevant financial metrics. Be concise and factual. Always cite your sources."
          },
          { 
            role: "user", 
            content: query 
          }
        ],
        search_recency_filter: "day",
      }),
    });

    if (!response.ok) {
      console.error("Perplexity API error:", response.status);
      return null;
    }

    const data = await response.json();
    return {
      content: data.choices?.[0]?.message?.content || "",
      citations: data.citations || [],
    };
  } catch (error) {
    console.error("Error calling Perplexity API:", error);
    return null;
  }
}

function buildMarketDataContext(marketData: MarketData, perplexityData: PerplexitySearchResult | null): string {
  const pairsInfo = marketData.pairs
    .map(p => `- ${p.pair}: Spot ${p.spotRate} (Bid: ${p.bid} / Ask: ${p.ask})`)
    .join("\n");
  
  // Build all cross rates for extraction
  const crossRates: string[] = [];
  const currencies = Object.keys(marketData.rates);
  
  for (const curr of currencies) {
    if (curr === "USD") continue;
    crossRates.push(`- ${curr}/USD: ${(1 / marketData.rates[curr]).toFixed(6)}`);
    crossRates.push(`- USD/${curr}: ${marketData.rates[curr].toFixed(6)}`);
  }
  
  // Add cross rates between major currencies
  const majors = ["EUR", "GBP", "JPY", "CHF", "CAD", "AUD", "NZD"];
  for (const curr1 of majors) {
    for (const curr2 of majors) {
      if (curr1 !== curr2 && marketData.rates[curr1] && marketData.rates[curr2]) {
        crossRates.push(`- ${curr1}/${curr2}: ${(marketData.rates[curr2] / marketData.rates[curr1]).toFixed(6)}`);
      }
    }
  }

  let additionalMarketInfo = "";
  if (perplexityData?.content) {
    additionalMarketInfo = `

## DONNÉES DE MARCHÉ ENRICHIES (Source: Recherche Web)
${perplexityData.content}

Sources: ${perplexityData.citations.slice(0, 3).join(", ")}`;
  }
  
  return `
## DONNÉES DE MARCHÉ EN TEMPS RÉEL (Source: ExchangeRate API)
Dernière mise à jour: ${marketData.timestamp}
**DATE DU JOUR: ${getTodayDate()}** - Utilise cette date pour tous les calculs de maturité.

### Taux Spot Principaux:
${pairsInfo}

### Tous les Taux de Change Disponibles (pour calcul currentRate):
${crossRates.slice(0, 50).join("\n")}

### Taux bruts (base USD):
- EUR: ${marketData.rates.EUR}
- GBP: ${marketData.rates.GBP}
- JPY: ${marketData.rates.JPY}
- CHF: ${marketData.rates.CHF}
- CAD: ${marketData.rates.CAD}
- AUD: ${marketData.rates.AUD}
- NZD: ${marketData.rates.NZD}
- CNY: ${marketData.rates.CNY}
- HKD: ${marketData.rates.HKD}
- SGD: ${marketData.rates.SGD}
- SEK: ${marketData.rates.SEK}
- NOK: ${marketData.rates.NOK}
- MXN: ${marketData.rates.MXN}
- ZAR: ${marketData.rates.ZAR}
- TRY: ${marketData.rates.TRY}
- BRL: ${marketData.rates.BRL}
- INR: ${marketData.rates.INR}
- MAD: ${marketData.rates.MAD || "N/A"}
- DKK: ${marketData.rates.DKK}
- PLN: ${marketData.rates.PLN}
- CZK: ${marketData.rates.CZK}
- HUF: ${marketData.rates.HUF}
- RUB: ${marketData.rates.RUB || "N/A"}
${additionalMarketInfo}

IMPORTANT: 
- Utilise UNIQUEMENT ces données réelles pour répondre aux questions sur les taux de change.
- Pour calculer un taux currency/baseCurrency: divise le taux baseCurrency par le taux currency (tous deux par rapport à USD)
- Exemple: EUR/GBP = rates.GBP / rates.EUR`;
}

function buildSystemPrompt(settings: ChatSettings, marketDataContext: string | null): string {
  const isForex = settings.assetClass === "forex";
  
  let prompt = isForex 
    ? `Tu es ForexHedge AI, un assistant expert en finance de marché spécialisé dans le hedging FOREX. Tu aides les utilisateurs à comprendre et gérer leurs risques de change.

## Ton Expertise
- Stratégies de couverture (hedging) : forwards, options vanilles, options exotiques, swaps de devises
- Analyse des risques de change : exposition économique, transactionnelle et de translation
- Instruments dérivés : pricing, Greeks, valorisation
- Réglementation et comptabilité de couverture (IFRS 9, hedge accounting)
- Market data : taux spot, forwards, volatilités implicites, courbes de taux

${RESPONSE_STYLE_INSTRUCTIONS[settings.responseStyle]}
`
    : `${COMMODITIES_SYSTEM_PROMPT}

${RESPONSE_STYLE_INSTRUCTIONS[settings.responseStyle]}
`;

  // Add extraction instructions based on asset class
  prompt += isForex ? FX_EXTRACTION_INSTRUCTIONS : COMMODITIES_EXTRACTION_INSTRUCTIONS;

  if (settings.enableMarketData && marketDataContext) {
    prompt += marketDataContext;
  }

  if (settings.enableFunctionCalls) {
    prompt += FUNCTION_CALL_INSTRUCTIONS;
  }

  if (settings.customInstructions?.trim()) {
    prompt += `

## Instructions Personnalisées de l'Utilisateur
${settings.customInstructions.trim()}`;
  }

  prompt += `

## Limites
- Tu ne peux pas exécuter de trades
- Tu ne garantis pas les performances futures
- Tu recommandes toujours de consulter un professionnel pour les décisions importantes
- IMPORTANT: Quand tu donnes des taux/prix, utilise UNIQUEMENT les données réelles fournies. Ne jamais inventer de données.`;

  return prompt;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, settings } = await req.json();
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    
    if (!GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not configured");
    }

    // Default settings if not provided
    const chatSettings: ChatSettings = {
      responseStyle: settings?.responseStyle || "concise",
      enableMarketData: settings?.enableMarketData ?? true,
      enableFunctionCalls: settings?.enableFunctionCalls ?? true,
      customInstructions: settings?.customInstructions || "",
      fxDisplayMode: settings?.fxDisplayMode || "card",
      assetClass: settings?.assetClass || "forex",
    };

    // Fetch real market data if enabled
    let marketDataContext: string | null = null;
    if (chatSettings.enableMarketData) {
      // Fetch basic exchange rates
      const marketData = await fetchMarketData();
      
      // Extract last user message for context-aware search
      const lastUserMessage = messages.filter((m: {role: string}) => m.role === "user").pop()?.content || "";
      
      // Search for additional market data using Perplexity
      let perplexityData: PerplexitySearchResult | null = null;
      if (lastUserMessage.toLowerCase().includes("forward") || 
          lastUserMessage.toLowerCase().includes("volatil") ||
          lastUserMessage.toLowerCase().includes("option") ||
          lastUserMessage.toLowerCase().includes("swap")) {
        perplexityData = await searchMarketData(`Current FX market data for ${lastUserMessage.slice(0, 200)}`);
      }
      
      if (marketData) {
        marketDataContext = buildMarketDataContext(marketData, perplexityData);
        console.log("Market data fetched successfully", perplexityData ? "with Perplexity enrichment" : "");
      } else {
        console.warn("Could not fetch market data");
      }
    }

    const systemPrompt = buildSystemPrompt(chatSettings, marketDataContext);
    console.log("Received messages:", messages.length, "Settings:", chatSettings.responseStyle, "MarketData:", !!marketDataContext);

    // Build conversation history for Gemini
    const contents: any[] = [];
    
    // Add system prompt as first user message
    contents.push({
      role: "user",
      parts: [{ text: systemPrompt }]
    });
    
    // Add conversation history
    for (const msg of messages) {
      contents.push({
        role: msg.role === "user" ? "user" : "model",
        parts: [{ text: msg.content }]
      });
    }

    // Call Gemini API directly
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:streamGenerateContent?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: contents,
        generationConfig: {
          temperature: 0.7,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 8192,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini API error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Trop de requêtes. Veuillez réessayer dans quelques instants." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: "Erreur du service IA. Veuillez réessayer." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Streaming response started");

    // Convert Gemini streaming format to OpenAI SSE format
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    
    if (!reader) {
      throw new Error("No response body");
    }

    const stream = new ReadableStream({
      async start(controller) {
        try {
          let buffer = "";
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || "";

            for (const line of lines) {
              if (line.trim() === "") continue;
              
              // Gemini returns JSON lines directly (not SSE format)
              try {
                const data = JSON.parse(line);
                const candidates = data.candidates?.[0];
                const content = candidates?.content?.parts?.[0]?.text;
                
                if (content) {
                  // Convert to OpenAI SSE format
                  const sseData = JSON.stringify({
                    choices: [{
                      delta: { content: content }
                    }]
                  });
                  controller.enqueue(new TextEncoder().encode(`data: ${sseData}\n\n`));
                }
              } catch (e) {
                // Skip invalid JSON lines
                console.log("Skipping invalid line:", line.substring(0, 100));
              }
            }
          }
        } catch (error) {
          controller.error(error);
        } finally {
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (error) {
    console.error("Chat error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Erreur inconnue" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

