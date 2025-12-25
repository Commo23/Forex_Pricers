/**
 * Service Gemini pour clarifier et normaliser les messages utilisateur
 * L'IA ne fait QUE clarifier/comprendre, pas d'actions
 */
interface ClarificationResult {
  clarifiedMessage: string;
  confidence: number;
  detectedIntent?: string;
  corrections?: string[];
  extractedParams?: {
    currencyPair?: { base: string; quote: string };
    amount?: { value: number; currency: string };
    countries?: { from?: string; to?: string };
    strategyType?: string;
    timeHorizon?: string;
  };
  fxData?: {
    amount: number | null;
    currency: string | null;
    direction: 'receive' | 'pay' | null;
    maturity: string | null; // Format "XM" ou "YYYY-MM-DD", toujours converti en années dans le service
    baseCurrency: string | null;
    currentRate: number | null;
    Barriere: number | null;
    hedgeDirection: 'upside' | 'downside' | null;
    missingFields?: string[]; // Champs obligatoires manquants
    question?: string; // Question à poser si champs manquants (avec "?")
  };
}

class GeminiService {
  private static instance: GeminiService;
  private apiKey: string | null = null;
  private isEnabled: boolean = false;
  private availableModels: string[] = []; // Cache des modèles disponibles

  private constructor() {
    this.loadApiKey();
  }

  static getInstance(): GeminiService {
    if (!GeminiService.instance) {
      GeminiService.instance = new GeminiService();
    }
    return GeminiService.instance;
  }

  /**
   * Charge la clé API depuis localStorage
   */
  private loadApiKey(): void {
    try {
      const settings = localStorage.getItem('fxRiskManagerSettings');
      if (settings) {
        const parsed = JSON.parse(settings);
        this.apiKey = parsed.chat?.geminiApiKey || null;
        this.isEnabled = !!this.apiKey && this.apiKey.trim().length > 0 && parsed.chat?.enableAI === true;
        console.log('[GeminiService] Clé API chargée:', {
          hasKey: !!this.apiKey,
          keyLength: this.apiKey?.length || 0,
          enableAI: parsed.chat?.enableAI,
          isEnabled: this.isEnabled
        });
      } else {
        console.log('[GeminiService] Aucun settings trouvé dans localStorage');
        this.isEnabled = false;
      }
    } catch (error) {
      console.error('[GeminiService] Erreur lors du chargement de la clé API:', error);
      this.isEnabled = false;
    }
  }

  /**
   * Met à jour la clé API
   */
  updateApiKey(apiKey: string | null): void {
    this.apiKey = apiKey;
    // Réinitialiser le cache des modèles quand la clé change
    this.availableModels = [];
    
    // Vérifier aussi enableAI dans les settings
    try {
      const settings = localStorage.getItem('fxRiskManagerSettings');
      if (settings) {
        const parsed = JSON.parse(settings);
        this.isEnabled = !!apiKey && apiKey.trim().length > 0 && parsed.chat?.enableAI === true;
      } else {
        this.isEnabled = !!apiKey && apiKey.trim().length > 0;
      }
    } catch (error) {
      this.isEnabled = !!apiKey && apiKey.trim().length > 0;
    }
    console.log('[GeminiService] Clé API mise à jour:', {
      hasKey: !!this.apiKey,
      keyLength: this.apiKey?.length || 0,
      isEnabled: this.isEnabled
    });
  }

  /**
   * Vérifie si Gemini est disponible
   */
  isAvailable(): boolean {
    return this.isEnabled;
  }

  /**
   * Clarifie et normalise un message utilisateur
   * L'IA doit seulement comprendre et clarifier, pas faire d'actions
   */
  async clarifyMessage(
    userMessage: string,
    context?: {
      currentStep?: string;
      previousMessages?: string[];
      availableOptions?: string[];
    }
  ): Promise<ClarificationResult> {
    console.log('[GeminiService] clarifyMessage appelé:', {
      isEnabled: this.isEnabled,
      hasApiKey: !!this.apiKey,
      messageLength: userMessage.length
    });
    
    if (!this.isEnabled || !this.apiKey) {
      console.log('[GeminiService] Gemini non disponible, retour du message original');
      // Retourner le message tel quel si Gemini n'est pas disponible
      return {
        clarifiedMessage: userMessage,
        confidence: 1.0
      };
    }

    try {
      const prompt = this.buildClarificationPrompt(userMessage, context);
      console.log('[GeminiService] Prompt construit, appel API...');
      const response = await this.callGeminiAPI(prompt);
      console.log('[GeminiService] Réponse API reçue:', response);
      
      if (response && response.clarifiedMessage) {
        return {
          clarifiedMessage: response.clarifiedMessage,
          confidence: response.confidence || 0.8,
          detectedIntent: response.detectedIntent,
          corrections: response.corrections,
          extractedParams: response.extractedParams,
          fxData: response.fxData
        };
      }

      console.warn('[GeminiService] Réponse API invalide, retour du message original');
      // En cas d'erreur, retourner le message original
      return {
        clarifiedMessage: userMessage,
        confidence: 1.0
      };
    } catch (error: any) {
      console.error('[GeminiService] Erreur lors de la clarification:', error);
      
      // Si c'est une erreur 404 (modèle non disponible), c'est OK, on continue sans IA
      if (error.message?.includes('404') || error.message?.includes('NOT_FOUND')) {
        console.log('[GeminiService] Modèles Gemini non disponibles, utilisation du mode basique (sans IA)');
      }
      
      // En cas d'erreur, retourner le message original (le chat fonctionnera en mode basique)
      return {
        clarifiedMessage: userMessage,
        confidence: 1.0
      };
    }
  }

  /**
   * Construit le prompt pour Gemini
   */
  private buildClarificationPrompt(
    userMessage: string,
    context?: {
      currentStep?: string;
      previousMessages?: string[];
      availableOptions?: string[];
    }
  ): string {
    let prompt = `Tu es un expert en finance de marchés spécialisé dans la gestion du risque de change. Ta mission est d'extraire les informations clés d'un message client concernant sa demande de couverture de change.

**RÈGLE CRITIQUE**: 
- ANALYSE UNIQUEMENT le message client et extrait les informations explicitement mentionnées
- NE JAMAIS inventer ou supposer des valeurs non mentionnées
- POUR LES CHAMPS OPTIONNELS non mentionnés, utilise null
- RÉPONDS UNIQUEMENT avec un JSON valide, aucun texte supplémentaire
- PARSING INTELLIGENT : comprend les variations linguistiques (ex: "1M", "un million", "1 000 000")

**Message utilisateur**: "${userMessage}"

**Contexte actuel**: ${context?.currentStep || 'Aucun contexte spécifique'}

**Instructions d'extraction**:
1. Corrige les fautes d'orthographe et de frappe
2. Normalise les formats et extrait les champs FX requis
3. Détecte l'intention principale (spot rate, option pricing, forward, strategy simulation, etc.)
4. **EXTRAIRE les informations FX selon les spécifications ci-dessous**

**CHAMPS À EXTRAIRE - FX Data Extraction**:

**Champs Obligatoires**:
- **amount** (number|null): montant numérique sans devise (ex: 1000000 pour "1M", 500000 pour "500K")
- **currency** (string|null): devise du flux (USD, EUR, GBP, CHF, JPY, CAD, AUD, MAD, MXN, etc.)
- **direction** (string|null): "receive" (je reçois) ou "pay" (je paie)
- **maturity** (string|null): format "XM" pour mois (ex: "6M" pour 6 mois) ou date ISO "YYYY-MM-DD". **IMPORTANT**: Tu dois toujours convertir en années (ex: "6M" → "0.5", "3M" → "0.25", "2024-12-31" → calculer les jours jusqu'à cette date / 365)
- **baseCurrency** (string|null): devise de référence du client (EUR, USD, etc.). Si le client mentionne un pays (ex: "je réside en France"), déduis la devise (EUR)

**Champs Optionnels**:
- **currentRate** (number|null): taux de change actuel mentionné. Si non mentionné, mets null (le système le cherchera automatiquement)
- **Barriere** (number|null): niveau de protection souhaité (seuil max/min)
- **hedgeDirection** (string|null): "upside" (hausse) ou "downside" (baisse)

**Règles de Conversion**:

**Montants**:
- "1M", "1 million" → 1000000
- "500K", "500 mille" → 500000
- "2,5M" → 2500000
- "1.5M" → 1500000
- "10 m dirhams" → 10000000

**Devises (normalisation)**:
- "dollar", "dollars", "$", "USD" → "USD"
- "euro", "euros", "€", "EUR" → "EUR"
- "livre", "livres", "£", "GBP" → "GBP"
- "yen", "¥", "JPY" → "JPY"
- "dirham", "dirhams", "MAD" → "MAD"
- "peso", "pesos", "MXN" → "MXN"
- Mapping pays → devises: Maroc → MAD, Mexique → MXN, France → EUR, USA → USD, UK → GBP, Japon → JPY, Suisse → CHF, etc.

**Direction**:
- "recevoir", "reçois", "encaisser", "perception", "je reçois" → "receive"
- "payer", "paie", "décaisser", "verser", "je dois payer" → "pay"

**Maturité** (TOUJOURS convertir en années):
- "dans X mois" → calculer X/12 (ex: "6 mois" → "0.5")
- "dans X semaines" → calculer approximatif en mois puis /12
- Date précise "YYYY-MM-DD" → calculer (date - aujourd'hui) / 365 jours
- "3M", "6M" → convertir en années (3M = 0.25, 6M = 0.5)

**Direction de couverture**:
- "couvrir à la baisse", "protection baisse", "ne pas descendre", "se protéger contre la baisse" → "downside"
- "couvrir à la hausse", "protection hausse", "ne pas monter", "se protéger contre la hausse" → "upside"

**LOGIQUE DE RÉPONSE**:

**Si des champs OBLIGATOIRES manquent** (amount, currency, direction, maturity, baseCurrency):
- Retourne un JSON avec "fxData" contenant les champs trouvés
- Ajoute "missingFields" avec la liste des champs manquants
- Ajoute "question" avec une question en français demandant le champ manquant, **OBLIGATOIREMENT avec le symbole "?" à la fin**

**Si tous les champs obligatoires sont présents**:
- Retourne le JSON complet avec tous les champs extraits
- Maturity doit être en années (format décimal, ex: 0.5 pour 6 mois)

**Format de réponse JSON**:

**Cas 1 - Champs manquants**:
{
  "clarifiedMessage": "message normalisé",
  "detectedIntent": "strategy_simulation",
  "fxData": {
    "amount": 1000000,
    "currency": "USD",
    "direction": "receive",
    "maturity": null,
    "baseCurrency": "EUR",
    "currentRate": null,
    "Barriere": null,
    "hedgeDirection": null,
    "missingFields": ["maturity"],
    "question": "Quelle est la maturité de votre opération?"
  }
}

**Cas 2 - Tous les champs présents**:
{
  "clarifiedMessage": "message normalisé",
  "detectedIntent": "strategy_simulation",
  "fxData": {
    "amount": 1000000,
    "currency": "USD",
    "direction": "receive",
    "maturity": "0.5",
    "baseCurrency": "EUR",
    "currentRate": 1.17,
    "Barriere": 1.22,
    "hedgeDirection": "downside"
  }
}

**Exemples de parsing**:

Exemple 1: "Je reçois 1M USD dans 6 mois, ma devise principale est EUR. Le taux actuel est 1,17 et je veux me couvrir à la baisse avec un maximum à 1,22"
→ {
  "fxData": {
    "amount": 1000000,
    "currency": "USD",
    "direction": "receive",
    "maturity": "0.5",
    "baseCurrency": "EUR",
    "currentRate": 1.17,
    "Barriere": 1.22,
    "hedgeDirection": "downside"
  }
}

Exemple 2: "je réside au maroc, je veux acheter du café au mexique, 10 millions dirhams, je veux me protéger"
→ {
  "fxData": {
    "amount": 10000000,
    "currency": "MAD",
    "direction": "pay",
    "maturity": null,
    "baseCurrency": "MAD",
    "currentRate": null,
    "Barriere": null,
    "hedgeDirection": null,
    "missingFields": ["maturity"],
    "question": "Quelle est la maturité de votre opération?"
  }
}

**IMPORTANT**:
- Si l'utilisateur oublie un champ obligatoire, tu DOIS retourner "question" avec "?" à la fin
- Maturity doit TOUJOURS être en années (format décimal)
- currentRate peut être null si non mentionné (le système le cherchera)
- baseCurrency peut être déduit du pays mentionné (ex: "je réside en France" → EUR)

Réponds UNIQUEMENT avec le JSON, sans texte supplémentaire.`;

    if (context?.availableOptions && context.availableOptions.length > 0) {
      prompt += `\n\n**Options disponibles**: ${context.availableOptions.join(', ')}`;
    }

    return prompt;
  }

  /**
   * Appelle l'API Gemini
   */
  private async callGeminiAPI(prompt: string): Promise<any> {
    if (!this.apiKey) {
      throw new Error('Gemini API key not configured');
    }

    try {
      // D'abord, obtenir la liste des modèles disponibles
      const availableModels = await this.listAvailableModels();
      
      // Trouver un modèle utilisable
      const modelToUse = this.findUsableModel(availableModels);
      
      if (!modelToUse) {
        throw new Error('Aucun modèle Gemini disponible. Vérifiez votre clé API.');
      }

      // Essayer d'abord avec v1beta
      const apiVersions = ['v1beta', 'v1'];
      
      for (const version of apiVersions) {
        try {
          const apiUrl = `https://generativelanguage.googleapis.com/${version}/models/${modelToUse}:generateContent?key=${this.apiKey}`;
          console.log(`[GeminiService] Essai avec modèle: ${modelToUse} (${version})`);
          
          const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              contents: [
                {
                  parts: [
                    {
                      text: prompt
                    }
                  ]
                }
              ],
                generationConfig: {
                  temperature: 0.3,
                  topK: 40,
                  topP: 0.95,
                  maxOutputTokens: 1000, // Augmenté pour éviter les réponses tronquées
                }
            })
          });

          if (response.ok) {
            const data = await response.json();
            console.log(`[GeminiService] ✅ Succès avec modèle: ${modelToUse} (${version})`);
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) {
              return this.parseGeminiResponse(text);
            }
          } else if (response.status === 404) {
            // Modèle non disponible sur cette version, essayer la suivante
            console.log(`[GeminiService] Modèle ${modelToUse} non disponible sur ${version}, essai suivant...`);
            continue;
          } else {
            // Autre erreur, essayer la version suivante
            const errorData = await response.text();
            console.log(`[GeminiService] Erreur ${response.status} avec ${version}, essai suivant...`);
            continue;
          }
        } catch (error: any) {
          if (error.message?.includes('404')) {
            continue; // Essayer la version suivante
          }
          // Si ce n'est pas une 404, continuer quand même pour essayer l'autre version
          console.log(`[GeminiService] Erreur avec ${version}:`, error.message);
          continue;
        }
      }
      
      // Si toutes les versions ont échoué, essayer avec d'autres modèles disponibles
      console.log('[GeminiService] Le modèle principal a échoué, essai avec d\'autres modèles disponibles...');
      for (const model of availableModels.slice(0, 5)) { // Essayer les 5 premiers modèles
        if (model === modelToUse) continue; // Déjà essayé
        
        for (const version of apiVersions) {
          try {
            const apiUrl = `https://generativelanguage.googleapis.com/${version}/models/${model}:generateContent?key=${this.apiKey}`;
            console.log(`[GeminiService] Essai avec modèle alternatif: ${model} (${version})`);
            
            const response = await fetch(apiUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                contents: [
                  {
                    parts: [
                      {
                        text: prompt
                      }
                    ]
                  }
                ],
                generationConfig: {
                  temperature: 0.3,
                  topK: 40,
                  topP: 0.95,
                  maxOutputTokens: 500,
                }
              })
            });

            if (response.ok) {
              const data = await response.json();
              console.log(`[GeminiService] ✅ Succès avec modèle alternatif: ${model} (${version})`);
              const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
              if (text) {
                return this.parseGeminiResponse(text);
              }
            }
          } catch (error) {
            continue; // Essayer le modèle suivant
          }
        }
      }
      
      throw new Error('Aucun modèle Gemini disponible. Vérifiez votre clé API et la disponibilité des modèles.');
    } catch (error) {
      console.error('[GeminiService] Error calling Gemini API:', error);
      throw error;
    }
  }

  /**
   * Parse la réponse texte de Gemini en JSON structuré
   */
  private parseGeminiResponse(text: string): any {
    try {
      let cleanedText = text
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      
      // Si le texte commence par {, c'est probablement du JSON
      if (cleanedText.startsWith('{')) {
        // Trouver la première { et la dernière }
        const firstBrace = cleanedText.indexOf('{');
        let lastBrace = cleanedText.lastIndexOf('}');
        
        // Si la dernière } n'existe pas ou est avant la première {, chercher plus intelligemment
        if (lastBrace === -1 || lastBrace <= firstBrace) {
          // Compter les accolades pour trouver la fin du JSON
          let braceCount = 0;
          let inString = false;
          let escapeNext = false;
          
          for (let i = firstBrace; i < cleanedText.length; i++) {
            const char = cleanedText[i];
            
            if (escapeNext) {
              escapeNext = false;
              continue;
            }
            
            if (char === '\\') {
              escapeNext = true;
              continue;
            }
            
            if (char === '"' && !escapeNext) {
              inString = !inString;
              continue;
            }
            
            if (!inString) {
              if (char === '{') braceCount++;
              if (char === '}') {
                braceCount--;
                if (braceCount === 0) {
                  lastBrace = i;
                  break;
                }
              }
            }
          }
        }
        
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
          cleanedText = cleanedText.substring(firstBrace, lastBrace + 1);
        }
      }
      
      // Essayer de réparer le JSON si nécessaire (guillemets non fermés, etc.)
      cleanedText = this.repairJson(cleanedText);
      
      const parsed = JSON.parse(cleanedText);
      console.log('[GeminiService] JSON parsé avec succès:', parsed);
      return parsed;
    } catch (parseError) {
      console.error('[GeminiService] Erreur lors du parsing JSON:', parseError, 'Texte:', text);
      // Si le parsing échoue, essayer d'extraire le message clarifié directement
      // Chercher "clarifiedMessage" dans le texte (avec gestion des chaînes tronquées)
      let clarifiedMatch = text.match(/"clarifiedMessage"\s*:\s*"([^"]+)"/);
      
      // Si pas trouvé avec le pattern simple, essayer d'extraire même si la chaîne est tronquée
      if (!clarifiedMatch) {
        const startPattern = /"clarifiedMessage"\s*:\s*"/;
        const startMatch = text.match(startPattern);
        if (startMatch) {
          const startIndex = startMatch.index! + startMatch[0].length;
          // Chercher la fin de la chaîne ou prendre jusqu'à la fin si tronquée
          let endIndex = text.indexOf('"', startIndex);
          if (endIndex === -1) {
            // Si pas de guillemet fermant, prendre jusqu'à la fin ou jusqu'à une virgule/accolade
            endIndex = Math.min(
              text.indexOf(',', startIndex) !== -1 ? text.indexOf(',', startIndex) : text.length,
              text.indexOf('\n', startIndex) !== -1 ? text.indexOf('\n', startIndex) : text.length,
              text.indexOf('}', startIndex) !== -1 ? text.indexOf('}', startIndex) : text.length
            );
          }
          const extractedValue = text.substring(startIndex, endIndex).trim();
          if (extractedValue) {
            clarifiedMatch = [null, extractedValue];
          }
        }
      }
      
      const intentMatch = text.match(/"detectedIntent"\s*:\s*"([^"]+)"/);
      
      // Essayer d'extraire les paramètres même si le JSON n'est pas parfait
      let extractedParams: any = null;
      
      // Pattern plus flexible pour currencyPair (gère les espaces et ordre variable)
      const currencyPairBaseMatch = text.match(/"base"\s*:\s*"([A-Z]{3})"/i);
      const currencyPairQuoteMatch = text.match(/"quote"\s*:\s*"([A-Z]{3})"/i);
      
      // Pattern pour amount
      const amountValueMatch = text.match(/"value"\s*:\s*(\d+(?:\.\d+)?)/);
      const amountCurrencyMatch = text.match(/"currency"\s*:\s*"([A-Z]{3})"/i);
      
      if (currencyPairBaseMatch && currencyPairQuoteMatch) {
        extractedParams = extractedParams || {};
        extractedParams.currencyPair = {
          base: currencyPairBaseMatch[1].toUpperCase(),
          quote: currencyPairQuoteMatch[1].toUpperCase()
        };
      }
      
      if (amountValueMatch && amountCurrencyMatch) {
        extractedParams = extractedParams || {};
        extractedParams.amount = {
          value: parseFloat(amountValueMatch[1]),
          currency: amountCurrencyMatch[1].toUpperCase()
        };
      }
      
      // Extraire les pays si présents
      const countriesFromMatch = text.match(/"from"\s*:\s*"([^"]+)"/i);
      const countriesToMatch = text.match(/"to"\s*:\s*"([^"]+)"/i);
      if (countriesFromMatch || countriesToMatch) {
        extractedParams = extractedParams || {};
        extractedParams.countries = {};
        if (countriesFromMatch) extractedParams.countries.from = countriesFromMatch[1];
        if (countriesToMatch) extractedParams.countries.to = countriesToMatch[1];
      }
      
      // Essayer d'extraire fxData même si le JSON est mal formé
      let fxData: any = null;
      const fxDataAmountMatch = text.match(/"amount"\s*:\s*(\d+(?:\.\d+)?)/);
      const fxDataCurrencyMatch = text.match(/"currency"\s*:\s*"([A-Z]{3})"/i);
      const fxDataDirectionMatch = text.match(/"direction"\s*:\s*"([^"]+)"/i);
      const fxDataMaturityMatch = text.match(/"maturity"\s*:\s*"([^"]+)"/i);
      const fxDataBaseCurrencyMatch = text.match(/"baseCurrency"\s*:\s*"([A-Z]{3})"/i);
      const missingFieldsMatch = text.match(/"missingFields"\s*:\s*\[([^\]]+)\]/);
      const questionMatch = text.match(/"question"\s*:\s*"([^"]+)"/);
      
      if (fxDataAmountMatch || fxDataCurrencyMatch || fxDataDirectionMatch) {
        fxData = {};
        if (fxDataAmountMatch) fxData.amount = parseFloat(fxDataAmountMatch[1]);
        if (fxDataCurrencyMatch) fxData.currency = fxDataCurrencyMatch[1].toUpperCase();
        if (fxDataDirectionMatch) fxData.direction = fxDataDirectionMatch[1];
        if (fxDataMaturityMatch) fxData.maturity = fxDataMaturityMatch[1];
        if (fxDataBaseCurrencyMatch) fxData.baseCurrency = fxDataBaseCurrencyMatch[1].toUpperCase();
        if (missingFieldsMatch) {
          const fields = missingFieldsMatch[1].split(',').map(f => f.trim().replace(/"/g, ''));
          fxData.missingFields = fields;
        }
        if (questionMatch) fxData.question = questionMatch[1];
      }
      
      if (clarifiedMatch) {
        return {
          clarifiedMessage: clarifiedMatch[1],
          confidence: 0.7,
          detectedIntent: intentMatch ? intentMatch[1] : undefined,
          extractedParams: extractedParams,
          fxData: fxData
        };
      }
      
      // Dernier recours : utiliser le texte tel quel
      return {
        clarifiedMessage: text.trim(),
        confidence: 0.5
      };
    }
  }

  /**
   * Tente de réparer un JSON mal formé (chaînes non terminées, etc.)
   */
  private repairJson(jsonText: string): string {
    try {
      // Vérifier si le JSON est valide
      JSON.parse(jsonText);
      return jsonText;
    } catch (error) {
      // Si erreur, essayer de réparer
      let repaired = jsonText;
      
      // Réparer les chaînes non terminées dans les valeurs
      // Chercher les patterns "key": "value non terminée
      const stringPattern = /"([^"]+)":\s*"([^"]*)$/;
      const match = repaired.match(stringPattern);
      
      if (match) {
        // Fermer la chaîne et ajouter les accolades manquantes
        const beforeMatch = repaired.substring(0, match.index! + match[0].length);
        const afterMatch = repaired.substring(match.index! + match[0].length);
        
        // Fermer la chaîne
        repaired = beforeMatch + '"';
        
        // Compter les accolades ouvertes/fermées
        const openBraces = (repaired.match(/{/g) || []).length;
        const closeBraces = (repaired.match(/}/g) || []).length;
        
        // Ajouter les accolades fermantes manquantes
        if (openBraces > closeBraces) {
          // Ajouter les propriétés manquantes si nécessaire
          if (!repaired.includes('"confidence"')) {
            repaired += ',\n  "confidence": 0.8';
          }
          if (!repaired.includes('"detectedIntent"')) {
            repaired += ',\n  "detectedIntent": "strategy_simulation"';
          }
          
          // Fermer les accolades
          for (let i = 0; i < openBraces - closeBraces; i++) {
            repaired += '\n}';
          }
        }
      }
      
      return repaired;
    }
  }


  /**
   * Liste les modèles disponibles et les met en cache
   */
  async listAvailableModels(): Promise<string[]> {
    if (!this.apiKey) {
      return [];
    }

    // Si déjà en cache, retourner le cache
    if (this.availableModels.length > 0) {
      return this.availableModels;
    }

    try {
      // Essayer v1beta d'abord
      let response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${this.apiKey}`
      );
      
      if (!response.ok) {
        // Fallback sur v1
        response = await fetch(
          `https://generativelanguage.googleapis.com/v1/models?key=${this.apiKey}`
        );
      }
      
      if (response.ok) {
        const data = await response.json();
        // Extraire les noms de modèles (format: "models/gemini-1.5-flash-001" -> "gemini-1.5-flash-001")
        const models = (data.models || []).map((m: any) => {
          const name = m.name || '';
          // Enlever le préfixe "models/" si présent
          return name.replace(/^models\//, '');
        }).filter((name: string) => name.length > 0);
        
        this.availableModels = models;
        console.log('[GeminiService] Modèles disponibles trouvés:', models.length, 'modèles');
        console.log('[GeminiService] Exemples de modèles:', models.slice(0, 10));
        return models;
      }
    } catch (error) {
      console.error('[GeminiService] Erreur lors de la liste des modèles:', error);
    }
    
    return [];
  }

  /**
   * Trouve un modèle utilisable depuis la liste disponible
   */
  private findUsableModel(availableModels: string[]): string | null {
    // Priorité des modèles à essayer
    const preferredModels = [
      'gemini-1.5-flash-latest',
      'gemini-1.5-flash-002',
      'gemini-1.5-flash-001',
      'gemini-1.5-flash',
      'gemini-1.5-pro-latest',
      'gemini-1.5-pro-002',
      'gemini-1.5-pro-001',
      'gemini-1.5-pro',
      'gemini-2.0-flash-exp',
      'gemini-2.5-flash',
      'gemini-pro',
      'gemini-1.0-pro'
    ];

    // Chercher d'abord dans les modèles préférés
    for (const preferred of preferredModels) {
      const found = availableModels.find(m => 
        m === preferred || 
        m.startsWith(preferred + '-') ||
        m.includes(preferred)
      );
      if (found) {
        console.log('[GeminiService] Modèle préféré trouvé:', found);
        return found;
      }
    }

    // Si aucun modèle préféré trouvé, chercher n'importe quel modèle gemini
    const geminiModel = availableModels.find(m => 
      m.toLowerCase().includes('gemini') && 
      (m.toLowerCase().includes('flash') || m.toLowerCase().includes('pro'))
    );
    
    if (geminiModel) {
      console.log('[GeminiService] Modèle Gemini trouvé:', geminiModel);
      return geminiModel;
    }

    // Dernier recours : prendre le premier modèle disponible
    if (availableModels.length > 0) {
      console.log('[GeminiService] Utilisation du premier modèle disponible:', availableModels[0]);
      return availableModels[0];
    }

    return null;
  }

  /**
   * Teste la connexion à Gemini
   */
  async testConnection(): Promise<boolean> {
    if (!this.isEnabled || !this.apiKey) {
      return false;
    }

    try {
      // Réinitialiser le cache des modèles pour forcer une nouvelle recherche
      this.availableModels = [];
      
      // Essayer de lister les modèles d'abord pour voir ce qui est disponible
      const models = await this.listAvailableModels();
      if (models.length > 0) {
        console.log('[GeminiService] ✅ Modèles disponibles trouvés:', models.length);
        const usableModel = this.findUsableModel(models);
        if (usableModel) {
          console.log('[GeminiService] ✅ Modèle utilisable trouvé:', usableModel);
        } else {
          console.warn('[GeminiService] ⚠️ Aucun modèle utilisable trouvé dans la liste');
        }
      } else {
        console.warn('[GeminiService] ⚠️ Aucun modèle disponible');
        return false;
      }
      
      const result = await this.clarifyMessage('test');
      return result.confidence > 0;
    } catch (error) {
      console.error('[GeminiService] ❌ Gemini connection test failed:', error);
      return false;
    }
  }
}

export default GeminiService;

