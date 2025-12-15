import ExchangeRateService from './ExchangeRateService';
import { PricingService } from './PricingService';

/**
 * Service de chat intelligent pour l'assistant FX
 * Utilise UNIQUEMENT Google Gemini AI avec function calling pour comprendre le contexte
 */
interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'function';
  content: string;
  name?: string;
  function_call?: {
    name: string;
    arguments: string;
  };
}

interface FunctionTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, any>;
      required: string[];
    };
  };
}

class ChatService {
  private static instance: ChatService;
  private exchangeRateService: ExchangeRateService;
  private apiKey: string | null;
  private conversationHistory: ChatMessage[] = [];

  private constructor() {
    this.exchangeRateService = ExchangeRateService.getInstance();
    // Utilise UNIQUEMENT Gemini API Key
    // Clé Gemini par défaut (à mettre dans .env en production)
    this.apiKey = import.meta.env.VITE_GEMINI_API_KEY || 
                   'AIzaSyAecEj25iUirNNX38uxQhKbecbcnlutOuQ'; // Clé par défaut
    
    // Initialiser l'historique avec le prompt système
    this.conversationHistory = [{
      role: 'system',
      content: this.getSystemPrompt()
    }];
  }

  static getInstance(): ChatService {
    if (!ChatService.instance) {
      ChatService.instance = new ChatService();
    }
    return ChatService.instance;
  }

  /**
   * Prompt système pour donner le contexte à l'IA
   */
  private getSystemPrompt(): string {
    return `Tu es un assistant expert en trading FX et hedging de devises. Tu aides les utilisateurs avec:

**Domaine d'expertise:**
- Pricing d'options FX (modèle Garman-Kohlhagen, Monte Carlo, Barrier Options)
- Calculs de forward FX
- Stratégies de hedging (Zero-Cost Collar, Participating Forward, Risk Reversal, etc.)
- Analyse de marché et de portfolio
- Calculs de P&L et de risque

**Règles importantes:**
- Réponds toujours en français de manière professionnelle et concise
- Utilise les outils disponibles pour effectuer des calculs précis
- Si tu ne connais pas quelque chose, dis-le honnêtement
- Formate les nombres avec une précision appropriée (4 décimales pour les taux FX)
- Explique les concepts financiers de manière claire

**Format des réponses:**
- Utilise des emojis pour rendre les réponses plus agréables
- Structure tes réponses avec des sections claires
- Donne toujours le contexte (date, source, etc.)`;
  }

  /**
   * Vérifie si la clé API Gemini est valide
   */
  private isValidGeminiKey(): boolean {
    return !!(this.apiKey && (this.apiKey.startsWith('AIza') || this.apiKey.length > 20));
  }

  /**
   * Définit les outils (functions) disponibles pour l'IA
   */
  private getAvailableTools(): FunctionTool[] {
    return [
      {
        type: 'function',
        function: {
          name: 'get_spot_rate',
          description: 'Récupère le taux de change spot actuel pour une paire de devises (ex: EUR/USD, GBP/USD). Utilise cette fonction quand l\'utilisateur demande un taux, un cours, un spot, ou mentionne une paire de devises.',
          parameters: {
            type: 'object',
            properties: {
              currencyPair: {
                type: 'string',
                description: 'La paire de devises au format BASE/QUOTE (ex: EUR/USD, GBP/USD, USD/JPY)'
              }
            },
            required: ['currencyPair']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'calculate_option_price',
          description: 'Calcule le prix d\'une option FX (call ou put) en utilisant le modèle Garman-Kohlhagen. Utilise cette fonction quand l\'utilisateur demande le prix d\'une option, un call, un put, ou veut calculer une option.',
          parameters: {
            type: 'object',
            properties: {
              optionType: {
                type: 'string',
                enum: ['call', 'put'],
                description: 'Type d\'option: call ou put'
              },
              currencyPair: {
                type: 'string',
                description: 'Paire de devises (ex: EUR/USD)'
              },
              spotPrice: {
                type: 'number',
                description: 'Prix spot actuel'
              },
              strike: {
                type: 'number',
                description: 'Prix d\'exercice (strike)'
              },
              timeToMaturity: {
                type: 'number',
                description: 'Temps jusqu\'à l\'échéance en années (ex: 0.25 pour 3 mois)'
              },
              domesticRate: {
                type: 'number',
                description: 'Taux d\'intérêt domestique (en décimal, ex: 0.05 pour 5%)'
              },
              foreignRate: {
                type: 'number',
                description: 'Taux d\'intérêt étranger (en décimal, ex: 0.04 pour 4%)'
              },
              volatility: {
                type: 'number',
                description: 'Volatilité (en décimal, ex: 0.15 pour 15%)'
              }
            },
            required: ['optionType', 'currencyPair', 'spotPrice', 'strike', 'timeToMaturity']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'calculate_forward_rate',
          description: 'Calcule le taux forward FX pour une paire de devises et une maturité donnée. Utilise cette fonction quand l\'utilisateur demande un forward, un taux à terme, ou veut calculer un forward.',
          parameters: {
            type: 'object',
            properties: {
              currencyPair: {
                type: 'string',
                description: 'Paire de devises (ex: EUR/USD)'
              },
              spotPrice: {
                type: 'number',
                description: 'Prix spot actuel'
              },
              timeToMaturity: {
                type: 'number',
                description: 'Temps jusqu\'à l\'échéance en années'
              },
              domesticRate: {
                type: 'number',
                description: 'Taux d\'intérêt domestique (en décimal)'
              },
              foreignRate: {
                type: 'number',
                description: 'Taux d\'intérêt étranger (en décimal)'
              }
            },
            required: ['currencyPair', 'spotPrice', 'timeToMaturity']
          }
        }
      }
    ];
  }

  /**
   * Exécute une fonction appelée par l'IA
   */
  private async executeFunction(name: string, args: any): Promise<string> {
    try {
      switch (name) {
        case 'get_spot_rate':
          return await this.getSpotRate(args.currencyPair);
        
        case 'calculate_option_price':
          return await this.calculateOptionPrice(args);
        
        case 'calculate_forward_rate':
          return await this.calculateForwardRate(args);
        
        default:
          return `Fonction ${name} non reconnue.`;
      }
    } catch (error: any) {
      console.error(`Error executing function ${name}:`, error);
      return `Erreur lors de l'exécution de ${name}: ${error.message}`;
    }
  }

  /**
   * Récupère le spot rate
   */
  private async getSpotRate(currencyPair: string): Promise<string> {
    const [base, quote] = currencyPair.split('/').map(c => c.trim().toUpperCase());
    
    if (!base || !quote) {
      return `Format de paire invalide: ${currencyPair}. Utilisez le format BASE/QUOTE (ex: EUR/USD).`;
    }

    try {
      let exchangeData = await this.exchangeRateService.getExchangeRates(base);
      let rate = exchangeData.rates[quote];

      // Si le taux n'existe pas, essayer avec la quote comme base
      if (!rate) {
        exchangeData = await this.exchangeRateService.getExchangeRates(quote);
        const invertedRate = exchangeData.rates[base];
        if (invertedRate) {
          rate = 1 / invertedRate;
        }
      }

      if (!rate || isNaN(rate)) {
        return `Taux non disponible pour ${currencyPair}.`;
      }

      const date = new Date(exchangeData.time_last_updated * 1000).toLocaleString('fr-FR');
      const formattedRate = this.formatRate(rate);

      return JSON.stringify({
        currencyPair: `${base}/${quote}`,
        rate: formattedRate,
        timestamp: date
      });
    } catch (error) {
      throw new Error(`Erreur lors de la récupération du taux: ${error}`);
    }
  }

  /**
   * Calcule le prix d'une option
   */
  private async calculateOptionPrice(args: any): Promise<string> {
    const {
      optionType,
      currencyPair,
      spotPrice,
      strike,
      timeToMaturity,
      domesticRate = 0.05,
      foreignRate = 0.04,
      volatility = 0.15
    } = args;

    try {
      const price = PricingService.calculateGarmanKohlhagenPrice(
        optionType,
        spotPrice,
        strike,
        domesticRate,
        foreignRate,
        timeToMaturity,
        volatility
      );

      return JSON.stringify({
        optionType,
        currencyPair,
        spotPrice,
        strike,
        timeToMaturity: `${(timeToMaturity * 12).toFixed(0)} mois`,
        price: price.toFixed(4),
        pricePercent: (price * 100).toFixed(4),
        volatility: `${(volatility * 100).toFixed(2)}%`
      });
    } catch (error) {
      throw new Error(`Erreur lors du calcul: ${error}`);
    }
  }

  /**
   * Calcule le forward rate
   */
  private async calculateForwardRate(args: any): Promise<string> {
    const {
      currencyPair,
      spotPrice,
      timeToMaturity,
      domesticRate = 0.05,
      foreignRate = 0.04
    } = args;

    try {
      const forwardPrice = PricingService.calculateFXForwardPrice(
        spotPrice,
        domesticRate,
        foreignRate,
        timeToMaturity
      );

      return JSON.stringify({
        currencyPair,
        spotPrice,
        forwardPrice: forwardPrice.toFixed(4),
        timeToMaturity: `${(timeToMaturity * 12).toFixed(0)} mois`,
        domesticRate: `${(domesticRate * 100).toFixed(2)}%`,
        foreignRate: `${(foreignRate * 100).toFixed(2)}%`
      });
    } catch (error) {
      throw new Error(`Erreur lors du calcul: ${error}`);
    }
  }

  /**
   * Formate le taux selon sa valeur
   */
  private formatRate(rate: number): string {
    if (rate < 0.01) {
      return rate.toFixed(6);
    } else if (rate < 1) {
      return rate.toFixed(4);
    } else if (rate < 100) {
      return rate.toFixed(4);
    } else {
      return rate.toFixed(2);
    }
  }

  /**
   * Convertit l'historique au format Gemini
   */
  private convertHistoryToGeminiFormat(): any[] {
    return this.conversationHistory
      .filter(msg => msg.role !== 'system') // Gemini gère le système différemment
      .map(msg => {
        if (msg.role === 'function') {
          return {
            role: 'function',
            parts: [{ functionResponse: { name: msg.name, response: msg.content } }]
          };
        }
        return {
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content }]
        };
      });
  }

  /**
   * Convertit les tools au format Gemini
   */
  private getGeminiTools(): any {
    const tools = this.getAvailableTools();
    return {
      functionDeclarations: tools.map(tool => ({
        name: tool.function.name,
        description: tool.function.description,
        parameters: tool.function.parameters
      }))
    };
  }

  /**
   * Traite un message avec Gemini AI
   */
  async processMessage(userMessage: string): Promise<string> {
    // Si pas de clé API, utiliser le mode fallback
    if (!this.apiKey) {
      return this.fallbackMode(userMessage);
    }

    // Ajouter le message de l'utilisateur à l'historique
    this.conversationHistory.push({
      role: 'user',
      content: userMessage
    });

    try {
      // Utilise UNIQUEMENT Gemini
      if (!this.isValidGeminiKey()) {
        throw new Error('Clé API Gemini invalide ou manquante');
      }
      return await this.processWithGemini(userMessage);
    } catch (error: any) {
      console.error('Chat error:', error);
      return this.fallbackMode(userMessage, error.message);
    }
  }

  /**
   * Traite un message avec Gemini API
   */
  private async processWithGemini(userMessage: string): Promise<string> {
    const contents = this.convertHistoryToGeminiFormat();
    const tools = this.getGeminiTools();

    const requestBody: any = {
      contents: contents,
      tools: [tools],
      systemInstruction: {
        parts: [{ text: this.getSystemPrompt() }]
      }
    };

    // Utiliser gemini-pro (modèle disponible dans v1beta)
    const model = 'gemini-pro';
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      let error;
      try {
        error = JSON.parse(errorText);
      } catch {
        error = { error: { message: errorText } };
      }
      throw new Error(error.error?.message || `Erreur API Gemini: ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.candidates || data.candidates.length === 0) {
      throw new Error('Aucune réponse de Gemini');
    }

    const candidate = data.candidates[0];
    
    if (!candidate.content || !candidate.content.parts) {
      throw new Error('Format de réponse invalide de Gemini');
    }

    const content = candidate.content;

    // Vérifier si Gemini veut utiliser une fonction
    const functionCallPart = content.parts.find((part: any) => part.functionCall);
    if (functionCallPart) {
      const functionCall = functionCallPart.functionCall;
      const functionName = functionCall.name;
      const functionArgs = functionCall.args || {};

      // Ajouter le message de l'IA à l'historique
      this.conversationHistory.push({
        role: 'assistant',
        content: `Appel de fonction: ${functionName}`
      });

      // Exécuter la fonction
      const functionResult = await this.executeFunction(functionName, functionArgs);

      // Ajouter le résultat de la fonction à l'historique
      this.conversationHistory.push({
        role: 'function',
        name: functionName,
        content: functionResult
      });

      // Rappeler Gemini avec le résultat
      return await this.processMessage('');
    }

    // Réponse directe de Gemini
    const textParts = content.parts.filter((part: any) => part.text);
    const assistantMessage = textParts.map((part: any) => part.text).join('\n');

    if (!assistantMessage) {
      throw new Error('Réponse vide de Gemini');
    }

    this.conversationHistory.push({
      role: 'assistant',
      content: assistantMessage
    });

    return assistantMessage;
  }


  /**
   * Mode fallback si pas d'API ou erreur
   */
  private fallbackMode(message: string, error?: string): string {
    const normalizedMessage = message.toLowerCase().trim();
    
    // Détection simple de spot rate
    const currencyPairPattern = /([A-Z]{3})\/?\s*([A-Z]{3})/i;
    const match = message.match(currencyPairPattern);
    
    if (match) {
      const base = match[1].toUpperCase();
      const quote = match[2].toUpperCase();
      return `⚠️ Mode limité activé (API non configurée).\n\nPour obtenir le spot ${base}/${quote}, veuillez configurer VITE_GEMINI_API_KEY dans votre fichier .env\n\n${error ? `Erreur: ${error}` : ''}`;
    }

    return `⚠️ Mode limité activé. Pour utiliser toutes les fonctionnalités du chatbot, veuillez configurer VITE_GEMINI_API_KEY dans votre fichier .env\n\n${error ? `Erreur: ${error}` : ''}`;
  }

  /**
   * Réinitialise l'historique de conversation
   */
  resetConversation(): void {
    this.conversationHistory = [{
      role: 'system',
      content: this.getSystemPrompt()
    }];
  }
}

export default ChatService;
