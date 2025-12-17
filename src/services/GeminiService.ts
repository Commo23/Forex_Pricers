/**
 * Service Gemini pour clarifier et normaliser les messages utilisateur
 * L'IA ne fait QUE clarifier/comprendre, pas d'actions
 */
interface ClarificationResult {
  clarifiedMessage: string;
  confidence: number;
  detectedIntent?: string;
  corrections?: string[];
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
          corrections: response.corrections
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
    let prompt = `Tu es un assistant qui aide à clarifier et normaliser les messages utilisateur pour un système de chat FX (Forex).

**RÈGLE CRITIQUE**: Tu ne dois QUE clarifier/comprendre le message, JAMAIS faire d'actions ou répondre directement à l'utilisateur.

**Tâche**: Normaliser le message utilisateur pour qu'il soit compris par un système basé sur des règles.

**Message utilisateur**: "${userMessage}"

**Contexte actuel**: ${context?.currentStep || 'Aucun contexte spécifique'}

**Instructions**:
1. Corrige les fautes d'orthographe et de frappe
2. Normalise les formats (ex: "eur/usd" → "EUR/USD", "10 millions" → "10 millions EUR")
3. Clarifie les ambiguïtés si possible
4. Détecte l'intention principale (spot rate, option pricing, forward, strategy simulation, etc.)
5. Garde le sens original du message

**Format de réponse JSON**:
{
  "clarifiedMessage": "message normalisé et corrigé",
  "confidence": 0.9,
  "detectedIntent": "spot_rate|option_price|forward|strategy_simulation|definition_question|other",
  "corrections": ["liste des corrections apportées"]
}

**IMPORTANT - Détection d'intention**:
- "definition_question": Questions comme "c'est quoi", "qu'est-ce que", "explique", "définition" → Ce sont des QUESTIONS, pas des ACTIONS
- "spot_rate": Demande de taux de change spot (ex: "spot EUR/USD", "taux GBP/USD")
- "option_price": Calcul de prix d'option (ex: "call EUR/USD strike 1.10")
- "forward": Calcul de forward (ex: "forward EUR/USD à 6 mois")
- "strategy_simulation": Simulation de stratégie (ex: "simule une stratégie")
- "other": Autre type de message

**Exemples**:
- "quel est le spot eur/usd?" → {"clarifiedMessage": "Quel est le spot EUR/USD?", "detectedIntent": "spot_rate"}
- "calcule un call eurusd strike 1.10 a 3 mois" → {"clarifiedMessage": "Calcule un call EUR/USD strike 1.10 à 3 mois", "detectedIntent": "option_price"}
- "simule une strategie" → {"clarifiedMessage": "Simule une stratégie", "detectedIntent": "strategy_simulation"}
- "c'est quoi une zero cost collar?" → {"clarifiedMessage": "C'est quoi une zero cost collar?", "detectedIntent": "definition_question"}
- "explique-moi un forward" → {"clarifiedMessage": "Explique-moi un forward", "detectedIntent": "definition_question"}

**ATTENTION**: Ne confonds PAS les termes financiers avec des paires de devises:
- "zero cost collar" n'est PAS une paire de devises
- "call option" n'est PAS une paire de devises
- "knockout option" n'est PAS une paire de devises

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
                maxOutputTokens: 500,
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
        const lastBrace = cleanedText.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
          cleanedText = cleanedText.substring(firstBrace, lastBrace + 1);
        }
      }
      
      const parsed = JSON.parse(cleanedText);
      console.log('[GeminiService] JSON parsé avec succès:', parsed);
      return parsed;
    } catch (parseError) {
      console.error('[GeminiService] Erreur lors du parsing JSON:', parseError, 'Texte:', text);
      // Si le parsing échoue, essayer d'extraire le message clarifié directement
      // Chercher "clarifiedMessage" dans le texte
      const clarifiedMatch = text.match(/"clarifiedMessage"\s*:\s*"([^"]+)"/);
      const intentMatch = text.match(/"detectedIntent"\s*:\s*"([^"]+)"/);
      
      if (clarifiedMatch) {
        return {
          clarifiedMessage: clarifiedMatch[1],
          confidence: 0.7,
          detectedIntent: intentMatch ? intentMatch[1] : undefined
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

