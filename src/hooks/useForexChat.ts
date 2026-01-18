import { useState, useCallback } from "react";
import { Message, ChatSettings, DEFAULT_SETTINGS } from "@/types/forexChat";
import { toast } from "sonner";
import { config } from "@/config/environment";
import { PricingActionService, PricingRequest } from "@/services/PricingActionService";

// Helper functions for building system prompt (same as Edge Function)
function getTodayDate(): string {
  return new Date().toISOString().split('T')[0];
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
- Calcul de VaR et sensibilités

## PRICING D'OPTIONS - INSTRUCTIONS IMPORTANTES

Quand l'utilisateur demande de pricer une option, tu dois:

1. DÉTECTER l'intention de pricing avec des mots-clés comme:
   - "pricer", "calculer le prix", "valoriser", "évaluer", "combien coûte"
   - "option call", "option put", "call option", "put option"
   - "barrier option", "knockout", "knockin", "digital option"

2. EXTRAIRE les données nécessaires depuis le message de l'utilisateur:
   - optionType: "call", "put", "call-knockout", "put-knockout", "call-knockin", "put-knockin", "one-touch", "double-touch", "no-touch", "double-no-touch", "range-binary", "outside-binary"
   - currencyPair: format "EUR/USD" (base/quote)
   - spotPrice: prix spot actuel (chercher dans les données de marché fournies)
   - strike: prix d'exercice (en valeur absolue ou pourcentage)
   - strikeType: "percent" ou "absolute"
   - maturity: maturité en années décimales (ex: 0.5 pour 6 mois)
   - volatility: volatilité en pourcentage (ex: 15 pour 15%)
   - barrier: niveau de barrière (si option à barrière)
   - secondBarrier: deuxième barrière (si option double)
   - barrierType: "percent" ou "absolute"
   - rebate: rebate pour options digitales (défaut: 100%)
   - quantity: quantité en pourcentage (défaut: 100)
   - notional: notionnel en devise de base

3. SI DES DONNÉES MANQUENT:
   - Tu DOIS demander à l'utilisateur de fournir les données manquantes
   - Pose des questions CLAIRES et SPÉCIFIQUES
   - Utilise la MÊME LANGUE que l'utilisateur
   - Ne procède PAS au calcul tant que toutes les données ne sont pas disponibles

4. QUAND TOUTES LES DONNÉES SONT DISPONIBLES:
   - Utilise le format JSON suivant pour demander le calcul:
   PRICING_REQUEST:{
     "optionType": "call",
     "currencyPair": "EUR/USD",
     "spotPrice": 1.1000,
     "strike": 110,
     "strikeType": "percent",
     "maturity": 0.5,
     "volatility": 15,
     "barrier": null,
     "quantity": 100
   }
   - Ce JSON sera automatiquement traité par le système de pricing

5. FORMAT DE RÉPONSE APRÈS CALCUL:
   - Présente le résultat de manière claire
   - Affiche le prix dans les deux devises (base et quote)
   - Inclus les Greeks si disponibles
   - Explique brièvement ce que signifie le résultat`;

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

### Direction de couverture (hedgeDirection):
- "couvrir à la baisse", "protection baisse", "ne pas descendre", "plancher" → "downside"
- "couvrir à la hausse", "protection hausse", "ne pas monter", "plafond" → "upside"
- IMPORTANT: Si tu déduis hedgeDirection à partir du contexte mais que ce n'est pas explicitement mentionné, 
  tu DOIS confirmer avec l'utilisateur.

3. SI UN CHAMP OBLIGATOIRE MANQUE:
- Tu DOIS demander à l'utilisateur de le fournir
- Ta question DOIT OBLIGATOIREMENT contenir le symbole "?"
- Utilise la MÊME LANGUE que l'utilisateur

4. POUR LE TAUX ACTUEL (currentRate):
- Utilise les données de marché fournies pour trouver le taux currency/baseCurrency
- Format: currency/baseCurrency (ex: USD/EUR si currency=USD et baseCurrency=EUR)
- OBLIGATOIRE: Tu dois toujours chercher ce taux dans les données fournies

5. QUAND TOUTES LES DONNÉES SONT COMPLÈTES:
- Génère le JSON à la TOUTE FIN de ta réponse
- NE PAS utiliser de blocs de code markdown (\`\`\`)
- Format EXACT - commence par FX_DATA: suivi du JSON sur UNE SEULE LIGNE:

FX_DATA:{"amount":1000000,"currency":"USD","direction":"receive","maturity":0.5,"baseCurrency":"EUR","currentRate":0.92,"Barriere":null,"hedgeDirection":"downside"}
`;

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

2. FORMAT DE SORTIE:
FX_DATA:{"amount":1000,"currency":"OIL","direction":"pay","maturity":0.5,"baseCurrency":"USD","currentRate":75.50,"Barriere":null,"hedgeDirection":"upside"}
`;

async function fetchMarketData(): Promise<string | null> {
  try {
    const response = await fetch("https://api.exchangerate-api.com/v4/latest/USD");
    if (!response.ok) {
      console.error("Failed to fetch market data:", response.status);
      return null;
    }
    
    const data = await response.json();
    const rates = data.rates;
    
    // Calculate common FX pairs (same as hedge-helper-ai-main)
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
    
    const pairsInfo = pairs
      .map(p => `- ${p.pair}: Spot ${p.spotRate} (Bid: ${p.bid} / Ask: ${p.ask})`)
      .join("\n");
    
    // Build all cross rates for extraction (same as hedge-helper-ai-main)
    const crossRates: string[] = [];
    const currencies = Object.keys(rates);
    
    for (const curr of currencies) {
      if (curr === "USD") continue;
      crossRates.push(`- ${curr}/USD: ${(1 / rates[curr]).toFixed(6)}`);
      crossRates.push(`- USD/${curr}: ${rates[curr].toFixed(6)}`);
    }
    
    // Add cross rates between major currencies
    const majors = ["EUR", "GBP", "JPY", "CHF", "CAD", "AUD", "NZD", "CNY", "HKD", "SGD", "SEK", "NOK", "MXN", "ZAR", "TRY", "BRL", "INR", "MAD", "DKK", "PLN", "CZK", "HUF", "RUB"];
    for (const curr1 of majors) {
      for (const curr2 of majors) {
        if (curr1 !== curr2 && rates[curr1] && rates[curr2]) {
          crossRates.push(`- ${curr1}/${curr2}: ${(rates[curr2] / rates[curr1]).toFixed(6)}`);
        }
      }
    }
    
    return `
## DONNÉES DE MARCHÉ EN TEMPS RÉEL (Source: ExchangeRate API)
Dernière mise à jour: ${new Date().toISOString()}
**DATE DU JOUR: ${getTodayDate()}** - Utilise cette date pour tous les calculs de maturité.

### Taux Spot Principaux:
${pairsInfo}

### Tous les Taux de Change Disponibles (pour calcul currentRate):
${crossRates.slice(0, 100).join("\n")}

### Taux bruts (base USD):
- EUR: ${rates.EUR}
- GBP: ${rates.GBP}
- JPY: ${rates.JPY}
- CHF: ${rates.CHF}
- CAD: ${rates.CAD}
- AUD: ${rates.AUD}
- NZD: ${rates.NZD}
- CNY: ${rates.CNY || "N/A"}
- HKD: ${rates.HKD || "N/A"}
- SGD: ${rates.SGD || "N/A"}
- SEK: ${rates.SEK || "N/A"}
- NOK: ${rates.NOK || "N/A"}
- MXN: ${rates.MXN || "N/A"}
- ZAR: ${rates.ZAR || "N/A"}
- TRY: ${rates.TRY || "N/A"}
- BRL: ${rates.BRL || "N/A"}
- INR: ${rates.INR || "N/A"}
- MAD: ${rates.MAD || "N/A"}
- DKK: ${rates.DKK || "N/A"}
- PLN: ${rates.PLN || "N/A"}
- CZK: ${rates.CZK || "N/A"}
- HUF: ${rates.HUF || "N/A"}
- RUB: ${rates.RUB || "N/A"}
${Object.keys(rates).filter(c => !["EUR", "GBP", "JPY", "CHF", "CAD", "AUD", "NZD", "CNY", "HKD", "SGD", "SEK", "NOK", "MXN", "ZAR", "TRY", "BRL", "INR", "MAD", "DKK", "PLN", "CZK", "HUF", "RUB"].includes(c)).map(c => `- ${c}: ${rates[c]}`).join("\n")}

IMPORTANT: 
- Utilise UNIQUEMENT ces données réelles pour répondre aux questions sur les taux de change.
- Pour calculer un taux currency/baseCurrency: divise le taux baseCurrency par le taux currency (tous deux par rapport à USD)
- Exemple: EUR/GBP = rates.GBP / rates.EUR
- Exemple: MAD/EUR = (rates.EUR / rates.MAD) = (1/rates.MAD) / (1/rates.EUR) = rates.EUR / rates.MAD
- Toutes les devises listées ci-dessus sont disponibles et supportées.`;
  } catch (error) {
    console.error("Error fetching market data:", error);
    return null;
  }
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
    : `Tu es CommodityRisk AI, un assistant expert en Risk Management dans le domaine des MATIÈRES PREMIÈRES (Commodities). Tu aides les utilisateurs à comprendre et gérer leurs risques liés aux commodities.

## Ton Expertise
- **Matières premières énergétiques**: pétrole brut (Brent, WTI), gaz naturel, charbon, électricité
- **Métaux**: or, argent, cuivre, aluminium, zinc, nickel, platine, palladium
- **Produits agricoles**: blé, maïs, soja, café, cacao, sucre, coton
- **Stratégies de couverture**: forwards, futures, swaps, options sur commodities
- **Analyse des risques**: exposition prix, risque de base, risque de volume, risque de contrepartie
- **Marchés**: LME (métaux), NYMEX/ICE (énergie), CBOT/CME (agricoles)
- **Réglementation**: EMIR, Dodd-Frank, MiFID II pour les dérivés commodities

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

export function useForexChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [settings, setSettings] = useState<ChatSettings>(DEFAULT_SETTINGS);

  const sendMessage = useCallback(async (input: string) => {
    if (!input.trim() || isLoading) return;

    // Get Gemini API key from localStorage (same as GeminiService)
    let geminiApiKey: string | null = null;
    try {
      const settings = localStorage.getItem('fxRiskManagerSettings');
      if (settings) {
        const parsed = JSON.parse(settings);
        geminiApiKey = parsed.chat?.geminiApiKey || null;
        // Check if AI is enabled
        if (!parsed.chat?.enableAI) {
          toast.error("L'IA n'est pas activée dans les paramètres");
          return;
        }
      }
    } catch (error) {
      console.error("Error loading Gemini API key:", error);
    }

    // Fallback to config if not in localStorage
    if (!geminiApiKey) {
      geminiApiKey = config.apis.gemini.key;
    }

    if (!geminiApiKey || geminiApiKey.trim().length === 0) {
      toast.error("Clé API Gemini non configurée. Veuillez la configurer dans les paramètres.");
      return;
    }

    const userMessage: Message = { role: "user", content: input.trim() };
    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    let assistantContent = "";

    const updateAssistant = (chunk: string) => {
      assistantContent += chunk;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant") {
          return prev.map((m, i) =>
            i === prev.length - 1 ? { ...m, content: assistantContent } : m
          );
        }
        return [...prev, { role: "assistant", content: assistantContent }];
      });
    };

    try {
      // Fetch market data if enabled
      let marketDataContext: string | null = null;
      if (settings.enableMarketData) {
        marketDataContext = await fetchMarketData();
      }

      // Build system prompt
      const systemPrompt = buildSystemPrompt(settings, marketDataContext);

      // Build conversation history for Gemini
      // Gemini format: systemInstruction is separate, then alternating user/model messages
      const contents: any[] = [];
      
      // Add conversation history (alternating user/model)
      for (const msg of messages) {
        contents.push({
          role: msg.role === "user" ? "user" : "model",
          parts: [{ text: msg.content }]
        });
      }

      // Add current user message
      contents.push({
        role: "user",
        parts: [{ text: input.trim() }]
      });

      console.log("[ForexChat] Request contents:", contents.length, "messages");
      console.log("[ForexChat] System prompt length:", systemPrompt.length);

      // Try different Gemini models (same priority as GeminiService)
      const modelsToTry = [
        'gemini-2.5-flash',
        'gemini-2.0-flash-exp',
        'gemini-1.5-flash-latest',
        'gemini-1.5-flash-002',
        'gemini-1.5-flash-001',
        'gemini-1.5-flash',
        'gemini-1.5-pro-latest',
        'gemini-1.5-pro-002',
        'gemini-1.5-pro-001',
        'gemini-1.5-pro',
      ];

      let response: Response | null = null;
      let lastError: Error | null = null;

      // Try each model until one works
      for (const model of modelsToTry) {
        try {
          const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${geminiApiKey}`;
          console.log(`[ForexChat] Trying model: ${model}`);
          
          const requestBody: any = {
            contents: contents,
            systemInstruction: {
              parts: [{ text: systemPrompt }]
            },
            generationConfig: {
              temperature: 0.7,
              topK: 40,
              topP: 0.95,
              maxOutputTokens: 8192,
            },
          };

          console.log("[ForexChat] Request body size:", JSON.stringify(requestBody).length, "chars");

          response = await fetch(apiUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(requestBody),
          });

          if (response.ok) {
            console.log(`[ForexChat] ✅ Success with model: ${model}`);
            break;
          } else if (response.status === 404) {
            // Model not available, try next
            console.log(`[ForexChat] Model ${model} not available, trying next...`);
            response = null;
            continue;
          } else {
            // Other error, try next model
            const errorText = await response.text();
            console.log(`[ForexChat] Error ${response.status} with ${model}:`, errorText.substring(0, 200));
            lastError = new Error(`Erreur ${response.status} avec ${model}`);
            response = null;
            continue;
          }
        } catch (error) {
          console.log(`[ForexChat] Exception with ${model}:`, error);
          lastError = error instanceof Error ? error : new Error(String(error));
          response = null;
          continue;
        }
      }

      if (!response) {
        throw lastError || new Error("Aucun modèle Gemini disponible. Vérifiez votre clé API.");
      }

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Gemini API error:", response.status, errorText);
        
        if (response.status === 429) {
          throw new Error("Trop de requêtes. Veuillez réessayer dans quelques instants.");
        }
        
        throw new Error("Erreur du service IA. Veuillez réessayer.");
      }

      if (!response.body) {
        throw new Error("Pas de réponse du serveur");
      }

      // Read streaming response
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      console.log("[ForexChat] Starting to read stream...");

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          console.log("[ForexChat] Stream finished");
          break;
        }

        buffer += decoder.decode(value, { stream: true });
      }
      
      // Gemini streaming returns a JSON array: [{...}, {...}, ...]
      // We need to parse the complete array and process each chunk
      console.log("[ForexChat] Full buffer length:", buffer.length);
      
      try {
        // Remove any trailing commas or whitespace
        const cleanedBuffer = buffer.trim().replace(/,\s*$/, '');
        
        // Parse the JSON array
        const chunks: any[] = JSON.parse(cleanedBuffer);
        console.log("[ForexChat] Parsed", chunks.length, "chunks");
        
        let fullResponse = "";
        
        // Process each chunk in the array
        for (const chunk of chunks) {
          const candidates = chunk.candidates;
          if (candidates && candidates.length > 0) {
            const candidate = candidates[0];
            const content = candidate.content?.parts?.[0]?.text;
            
            if (content) {
              console.log("[ForexChat] Extracted content:", content.substring(0, 100));
              fullResponse += content;
              updateAssistant(content);
            }
            
            // Check if this is the finish reason (end of stream)
            if (candidate.finishReason) {
              console.log("[ForexChat] Finish reason:", candidate.finishReason);
            }
          }
        }
        
        // ✅ Détecter et traiter les requêtes de pricing
        const pricingRequestMatch = fullResponse.match(/PRICING_REQUEST:\s*(\{[\s\S]*?\})/);
        if (pricingRequestMatch) {
          try {
            const pricingRequestJson = pricingRequestMatch[1];
            const pricingRequest: Partial<PricingRequest> = JSON.parse(pricingRequestJson);
            
            console.log("[ForexChat] Detected pricing request:", pricingRequest);
            
            // Valider la requête
            const validation = PricingActionService.validatePricingRequest(pricingRequest);
            
            if (!validation.valid) {
              // Demander les données manquantes
              const missingFieldsMessage = PricingActionService.generateMissingFieldsMessage(
                validation.missingFields,
                pricingRequest.optionType || 'option'
              );
              
              // Ajouter le message de demande de données manquantes
              setTimeout(() => {
                updateAssistant(`\n\n⚠️ **Données manquantes**\n\n${missingFieldsMessage}`);
              }, 100);
            } else {
              // Obtenir les bank rates depuis localStorage ou utiliser les valeurs par défaut
              let bankRates: Record<string, number | null> = {};
              try {
                // Essayer de charger depuis useBankRates via un hook personnalisé
                // Pour l'instant, on utilise des valeurs par défaut ou on demande à l'utilisateur
                const savedRates = localStorage.getItem('bankRates');
                if (savedRates) {
                  bankRates = JSON.parse(savedRates);
                }
              } catch (e) {
                console.warn("Could not load bank rates from localStorage");
              }
              
              // Calculer le prix
              const result = PricingActionService.calculateOptionPrice(
                pricingRequest as PricingRequest,
                bankRates
              );
              
              // Formater le résultat
              const [baseCurrency, quoteCurrency] = (pricingRequest.currencyPair || 'EUR/USD').split('/');
              const resultMessage = `\n\n✅ **Résultat du Pricing**\n\n` +
                `**Prix unitaire:**\n` +
                `- ${result.priceInQuoteCurrency.toFixed(6)} ${quoteCurrency}\n` +
                `- ${result.priceInBaseCurrency.toFixed(6)} ${baseCurrency}\n\n` +
                `**Méthode:** ${result.method}\n\n`;
              
              let greeksMessage = '';
              if (result.greeks) {
                greeksMessage = `**Greeks:**\n` +
                  `- Delta (Δ): ${result.greeks.delta.toFixed(4)}\n` +
                  `- Gamma (Γ): ${result.greeks.gamma.toFixed(4)}\n` +
                  `- Theta (Θ): ${result.greeks.theta.toFixed(4)}\n` +
                  `- Vega: ${result.greeks.vega.toFixed(4)}\n` +
                  `- Rho (ρ): ${result.greeks.rho.toFixed(4)}\n\n`;
              }
              
              const finalMessage = resultMessage + greeksMessage;
              
              // Ajouter le résultat après un court délai
              setTimeout(() => {
                updateAssistant(finalMessage);
              }, 100);
            }
          } catch (error) {
            console.error("[ForexChat] Error processing pricing request:", error);
            setTimeout(() => {
              updateAssistant(`\n\n❌ **Erreur lors du calcul du prix**\n\n${error instanceof Error ? error.message : 'Erreur inconnue'}`);
            }, 100);
          }
        }
      } catch (e) {
        console.error("[ForexChat] Error parsing stream:", e);
        console.log("[ForexChat] Buffer preview:", buffer.substring(0, 500));
        throw new Error("Erreur lors du parsing de la réponse Gemini");
      }
      
      console.log("[ForexChat] Stream processing complete");
    } catch (error) {
      console.error("Chat error:", error);
      toast.error(error instanceof Error ? error.message : "Une erreur est survenue");
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant" && !last.content) {
          return prev.slice(0, -1);
        }
        return prev;
      });
    } finally {
      setIsLoading(false);
    }
  }, [messages, isLoading, settings]);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  return { messages, isLoading, sendMessage, clearMessages, settings, setSettings };
}
