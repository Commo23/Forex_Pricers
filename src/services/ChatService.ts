import ExchangeRateService from './ExchangeRateService';
import { PricingService } from './PricingService';
import { 
  CURRENCY_PAIRS,
  calculateFXForwardPrice,
  calculateGarmanKohlhagenPrice,
  calculateSwapPrice,
  calculateTimeToMaturity,
  calculateOptionPrice
} from '@/pages/Index';

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
- Simulation complète de stratégies FX avec plusieurs composants

**Règles importantes:**
- Réponds toujours en français de manière professionnelle et concise
- Utilise les outils disponibles pour effectuer des calculs précis
- Si tu ne connais pas quelque chose, dis-le honnêtement
- Formate les nombres avec une précision appropriée (4 décimales pour les taux FX)
- Explique les concepts financiers de manière claire

**Pour les simulations de stratégies (build_strategy):**
- Quand l'utilisateur demande de "construire une stratégie", "simuler une stratégie", "build a strategy", ou veut analyser une combinaison d'instruments FX:
  1. Demande TOUS les paramètres nécessaires AVANT d'appeler build_strategy:
     - Paire de devises (ex: EUR/USD)
     - Prix spot actuel (ou récupère-le avec get_spot_rate)
     - Taux d'intérêt domestique (en %)
     - Taux d'intérêt étranger (en %)
     - Volume en devise de base
     - Date de début du hedging (format YYYY-MM-DD)
     - Nombre de mois à hedger
     - Liste des composants (options, forwards, swaps) avec leurs paramètres:
       * Type (call, put, forward, swap)
       * Strike (valeur ou %)
       * Type de strike (percent ou absolute)
       * Volatilité (en %)
       * Quantité (en %)
  2. Confirme tous les paramètres avec l'utilisateur avant de lancer la simulation
  3. Une fois la simulation terminée, présente les résultats de manière claire:
     - Résumé global (coûts hedgés/non hedgés, P&L)
     - Détails par période (date, forward, prix de stratégie, P&L)
     - Analyse des composants individuels

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
      },
      {
        type: 'function',
        function: {
          name: 'build_strategy',
          description: 'Construit et simule une stratégie FX complète avec plusieurs composants (options, forwards, swaps). Utilise cette fonction quand l\'utilisateur demande de "construire une stratégie", "simuler une stratégie", "build a strategy", ou veut analyser une combinaison d\'instruments FX.',
          parameters: {
            type: 'object',
            properties: {
              currencyPair: {
                type: 'string',
                description: 'Paire de devises (ex: EUR/USD, GBP/USD)'
              },
              spotPrice: {
                type: 'number',
                description: 'Prix spot actuel'
              },
              domesticRate: {
                type: 'number',
                description: 'Taux d\'intérêt domestique en pourcentage (ex: 1.0 pour 1%)'
              },
              foreignRate: {
                type: 'number',
                description: 'Taux d\'intérêt étranger en pourcentage (ex: 0.5 pour 0.5%)'
              },
              baseVolume: {
                type: 'number',
                description: 'Volume en devise de base (ex: 10000000 pour 10M EUR)'
              },
              startDate: {
                type: 'string',
                description: 'Date de début du hedging au format YYYY-MM-DD'
              },
              monthsToHedge: {
                type: 'number',
                description: 'Nombre de mois à hedger (ex: 12 pour 1 an)'
              },
              components: {
                type: 'array',
                description: 'Liste des composants de la stratégie',
                items: {
                  type: 'object',
                  properties: {
                    type: {
                      type: 'string',
                      enum: ['call', 'put', 'forward', 'swap'],
                      description: 'Type de composant: call, put, forward, ou swap'
                    },
                    strike: {
                      type: 'number',
                      description: 'Strike (en pourcentage si strikeType=percent, sinon valeur absolue)'
                    },
                    strikeType: {
                      type: 'string',
                      enum: ['percent', 'absolute'],
                      description: 'Type de strike: percent ou absolute'
                    },
                    volatility: {
                      type: 'number',
                      description: 'Volatilité en pourcentage (ex: 15 pour 15%)'
                    },
                    quantity: {
                      type: 'number',
                      description: 'Quantité en pourcentage (ex: 100 pour 100%)'
                    }
                  },
                  required: ['type', 'strike', 'strikeType', 'volatility', 'quantity']
                }
              }
            },
            required: ['currencyPair', 'spotPrice', 'domesticRate', 'foreignRate', 'baseVolume', 'startDate', 'monthsToHedge', 'components']
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
        
        case 'build_strategy':
          return await this.buildStrategy(args);
        
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
   * Construit et simule une stratégie FX complète
   */
  private async buildStrategy(args: any): Promise<string> {
    try {
      const {
        currencyPair,
        spotPrice,
        domesticRate,
        foreignRate,
        baseVolume,
        startDate,
        monthsToHedge,
        components
      } = args;

      // Valider les inputs
      if (!components || components.length === 0) {
        return JSON.stringify({ error: 'Aucun composant de stratégie fourni' });
      }

      // Trouver la paire de devises
      const pair = CURRENCY_PAIRS.find(p => p.symbol === currencyPair);
      if (!pair) {
        return JSON.stringify({ error: `Paire de devises ${currencyPair} non trouvée` });
      }

      // Convertir les taux en décimal
      const r_d = domesticRate / 100;
      const r_f = foreignRate / 100;

      // Générer les dates de maturité (fin de chaque mois)
      const start = new Date(startDate);
      const months: Date[] = [];
      const monthlyVolumes: number[] = [];
      const monthlyVolume = baseVolume / monthsToHedge;

      for (let i = 0; i < monthsToHedge; i++) {
        const monthEnd = new Date(start.getFullYear(), start.getMonth() + i + 1, 0);
        months.push(monthEnd);
        monthlyVolumes.push(monthlyVolume);
      }

      // Calculer les résultats pour chaque période
      const results = months.map((date, i) => {
        const monthKey = `${date.getFullYear()}-${date.getMonth() + 1}`;
        const t = calculateTimeToMaturity(date.toISOString().split('T')[0], startDate);
        
        // Calculer le forward
        const forward = calculateFXForwardPrice(spotPrice, r_d, r_f, t);

        // Calculer les prix de chaque composant
        const optionPrices = components.map((component: any, compIndex: number) => {
          const strike = component.strikeType === 'percent' 
            ? spotPrice * (component.strike / 100)
            : component.strike;
          
          const vol = component.volatility / 100;
          const quantity = component.quantity / 100;

          let price = 0;
          let label = '';

          if (component.type === 'forward') {
            price = forward - strike;
            label = `Forward @ ${strike.toFixed(4)}`;
          } else if (component.type === 'swap') {
            // Pour un swap, calculer le prix du swap
            const forwards = months.map((_, idx) => {
              const t_swap = calculateTimeToMaturity(_.toISOString().split('T')[0], startDate);
              return calculateFXForwardPrice(spotPrice, r_d, r_f, t_swap);
            });
            const times = months.map((_, idx) => {
              return calculateTimeToMaturity(_.toISOString().split('T')[0], startDate);
            });
            price = calculateSwapPrice(forwards, times, r_d);
            label = `Swap`;
          } else if (component.type === 'call' || component.type === 'put') {
            price = calculateGarmanKohlhagenPrice(
              component.type,
              spotPrice,
              strike,
              r_d,
              r_f,
              t,
              vol
            );
            label = `${component.type.toUpperCase()} @ ${strike.toFixed(4)}`;
          }

          return {
            type: component.type,
            price: price,
            quantity: quantity,
            strike: strike,
            label: label,
            volatility: component.volatility
          };
        });

        // Calculer le prix total de la stratégie
        const strategyPrice = optionPrices.reduce((sum: number, opt: any) => {
          return sum + (opt.price * opt.quantity * monthlyVolumes[i]);
        }, 0);

        // Calculer le payoff total
        const totalPayoff = optionPrices.reduce((sum: number, opt: any) => {
          if (opt.type === 'forward') {
            return sum + ((forward - opt.strike) * opt.quantity * monthlyVolumes[i]);
          } else if (opt.type === 'swap') {
            return sum + (opt.price * opt.quantity * monthlyVolumes[i]);
          } else {
            // Pour les options, le payoff dépend du prix spot à l'échéance
            // On utilise le forward comme approximation
            const intrinsicValue = opt.type === 'call' 
              ? Math.max(0, forward - opt.strike)
              : Math.max(0, opt.strike - forward);
            return sum + (intrinsicValue * opt.quantity * monthlyVolumes[i]);
          }
        }, 0);

        // Calculer les coûts hedgés et non hedgés
        const hedgedCost = strategyPrice;
        const unhedgedCost = monthlyVolumes[i] * spotPrice;
        const deltaPnL = hedgedCost - unhedgedCost;

        return {
          date: date.toISOString().split('T')[0],
          timeToMaturity: t,
          forward: forward,
          realPrice: forward,
          optionPrices: optionPrices,
          strategyPrice: strategyPrice,
          totalPayoff: totalPayoff,
          monthlyVolume: monthlyVolumes[i],
          hedgedCost: hedgedCost,
          unhedgedCost: unhedgedCost,
          deltaPnL: deltaPnL
        };
      });

      // Calculer les statistiques globales
      const totalHedgedCost = results.reduce((sum, r) => sum + r.hedgedCost, 0);
      const totalUnhedgedCost = results.reduce((sum, r) => sum + r.unhedgedCost, 0);
      const totalDeltaPnL = totalHedgedCost - totalUnhedgedCost;
      const averageStrategyPrice = results.reduce((sum, r) => sum + r.strategyPrice, 0) / results.length;

      return JSON.stringify({
        currencyPair,
        spotPrice,
        domesticRate: `${domesticRate.toFixed(2)}%`,
        foreignRate: `${foreignRate.toFixed(2)}%`,
        baseVolume,
        monthsToHedge,
        components: components.length,
        results: results.map(r => ({
          date: r.date,
          maturity: `${(r.timeToMaturity * 12).toFixed(1)} mois`,
          forward: r.forward.toFixed(4),
          strategyPrice: r.strategyPrice.toFixed(2),
          deltaPnL: r.deltaPnL.toFixed(2),
          components: r.optionPrices.map((opt: any) => ({
            type: opt.type,
            label: opt.label,
            price: opt.price.toFixed(4),
            quantity: `${opt.quantity * 100}%`
          }))
        })),
        summary: {
          totalHedgedCost: totalHedgedCost.toFixed(2),
          totalUnhedgedCost: totalUnhedgedCost.toFixed(2),
          totalDeltaPnL: totalDeltaPnL.toFixed(2),
          averageStrategyPrice: averageStrategyPrice.toFixed(2)
        }
      });
    } catch (error: any) {
      throw new Error(`Erreur lors de la construction de la stratégie: ${error.message}`);
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
          // Format Gemini pour functionResponse
          let responseContent = msg.content;
          // Si c'est une string JSON, essayer de la parser
          if (typeof responseContent === 'string') {
            try {
              responseContent = JSON.parse(responseContent);
            } catch {
              // Garder comme string si ce n'est pas du JSON valide
            }
          }
          return {
            role: 'function',
            parts: [{ 
              functionResponse: { 
                name: msg.name, 
                response: responseContent
              } 
            }]
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
    // Détecter les requêtes simples qui peuvent être traitées directement
    const simpleResponse = await this.handleSimpleQuery(userMessage);
    if (simpleResponse) {
      return simpleResponse;
    }

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
      
      // Si erreur de quota, essayer de traiter directement
      if (error.message && (error.message.includes('quota') || error.message.includes('Quota exceeded'))) {
        const directResponse = await this.handleSimpleQuery(userMessage);
        if (directResponse) {
          return directResponse;
        }
        return `⚠️ Quota API dépassé. Veuillez réessayer plus tard.\n\n${this.fallbackMode(userMessage, error.message)}`;
      }
      
      return this.fallbackMode(userMessage, error.message);
    }
  }

  /**
   * Traite les requêtes simples directement sans passer par Gemini
   */
  private async handleSimpleQuery(message: string): Promise<string | null> {
    const normalizedMessage = message.toLowerCase().trim();
    
    // 1. Détection de requête de spot rate
    const spotResult = await this.handleSpotRateQuery(message);
    if (spotResult) return spotResult;

    // 2. Détection de calcul d'option (call/put)
    const optionResult = await this.handleOptionPriceQuery(message);
    if (optionResult) return optionResult;

    // 3. Détection de calcul de forward
    const forwardResult = await this.handleForwardRateQuery(message);
    if (forwardResult) return forwardResult;

    return null;
  }

  /**
   * Traite les requêtes de spot rate
   */
  private async handleSpotRateQuery(message: string): Promise<string | null> {
    const spotPatterns = [
      /(?:quel|what|donne|give|show).*(?:est|is|le|the).*(?:spot|taux|cours|rate).*([A-Z]{3})\/?\s*([A-Z]{3})/i,
      /spot\s+([A-Z]{3})\/?\s*([A-Z]{3})/i,
      /([A-Z]{3})\/?\s*([A-Z]{3})\s+spot/i,
      /taux\s+([A-Z]{3})\/?\s*([A-Z]{3})/i,
      /cours\s+([A-Z]{3})\/?\s*([A-Z]{3})/i,
      /([A-Z]{3})\/?\s*([A-Z]{3})/i // Pattern simple pour détecter une paire de devises seule
    ];

    for (const pattern of spotPatterns) {
      const match = message.match(pattern);
      if (match) {
        const base = match[1] || match[2];
        const quote = match[2] || match[3];
        if (base && quote && base.length === 3 && quote.length === 3) {
          try {
            const result = await this.getSpotRate(`${base}/${quote}`);
            const data = JSON.parse(result);
            return `💱 **Spot ${data.currencyPair}**\n\n📊 Taux: **${data.rate}**\n🕐 Mis à jour: ${data.timestamp}`;
          } catch (error) {
            return null;
          }
        }
      }
    }

    return null;
  }

  /**
   * Traite les requêtes de calcul d'option
   */
  private async handleOptionPriceQuery(message: string): Promise<string | null> {
    // Patterns pour détecter les requêtes d'option avec paramètres
    const optionPatterns = [
      // Format: "call EUR/USD strike 1.10 spot 1.0850 3 mois vol 15%"
      /(call|put)\s+([A-Z]{3})\/?\s*([A-Z]{3})\s+(?:strike|k)\s+([\d.]+)\s+(?:spot|s)\s+([\d.]+)\s+(\d+)\s*(?:mois|months|m)\s*(?:vol|volatility)?\s*([\d.]+)?%?/i,
      // Format: "prix call EUR/USD strike 1.10 spot 1.0850 3 mois"
      /(?:prix|price|calcul|calculate)\s+(call|put)\s+([A-Z]{3})\/?\s*([A-Z]{3})\s+(?:strike|k)\s+([\d.]+)\s+(?:spot|s)\s+([\d.]+)\s+(\d+)\s*(?:mois|months|m)/i,
      // Format: "option call EUR/USD 1.10 1.0850 3 mois 15%"
      /(?:option|option\s+price)\s+(call|put)\s+([A-Z]{3})\/?\s*([A-Z]{3})\s+([\d.]+)\s+([\d.]+)\s+(\d+)\s*(?:mois|months|m)\s*([\d.]+)?%?/i,
      // Format: "call EUR/USD 1.10 à 3 mois" (utilise le spot actuel)
      /(call|put)\s+([A-Z]{3})\/?\s*([A-Z]{3})\s+([\d.]+)\s+(?:à|at|for)\s+(\d+)\s*(?:mois|months|m)/i
    ];

    for (const pattern of optionPatterns) {
      const match = message.match(pattern);
      if (match) {
        try {
          const optionType = match[1].toLowerCase();
          const base = match[2];
          const quote = match[3];
          
          // Extraire les paramètres selon le pattern
          let strike: number;
          let spotPrice: number;
          let months: number;
          let volatility = 0.15; // Par défaut 15%

          if (match[4] && match[5] && match[6]) {
            // Pattern avec strike et spot explicites
            strike = parseFloat(match[4]);
            spotPrice = parseFloat(match[5]);
            months = parseInt(match[6]);
            if (match[7]) volatility = parseFloat(match[7]) / 100;
          } else if (match[4] && match[5]) {
            // Pattern avec seulement strike et spot (sans mois explicite)
            strike = parseFloat(match[4]);
            spotPrice = parseFloat(match[5]);
            months = 3; // Par défaut 3 mois
          } else {
            // Pattern simple avec strike et mois
            strike = parseFloat(match[4]);
            months = parseInt(match[5]);
            // Récupérer le spot actuel
            try {
              const spotResult = await this.getSpotRate(`${base}/${quote}`);
              const spotData = JSON.parse(spotResult);
              spotPrice = parseFloat(spotData.rate);
            } catch {
              return null; // Impossible de récupérer le spot
            }
          }

          if (optionType && base && quote && strike && spotPrice && months && !isNaN(strike) && !isNaN(spotPrice) && !isNaN(months)) {
            const timeToMaturity = months / 12;
            const result = await this.calculateOptionPrice({
              optionType,
              currencyPair: `${base}/${quote}`,
              spotPrice,
              strike,
              timeToMaturity,
              volatility
            });
            const data = JSON.parse(result);
            return `📈 **Prix ${optionType.toUpperCase()} ${data.currencyPair}**\n\n` +
                   `💰 Prix: **${data.price}** (${data.pricePercent}%)\n` +
                   `📊 Strike: ${data.strike}\n` +
                   `📈 Spot: ${data.spotPrice}\n` +
                   `📅 Maturité: ${data.timeToMaturity}\n` +
                   `📉 Volatilité: ${data.volatility}`;
          }
        } catch (error) {
          // Continuer avec le pattern suivant
          continue;
        }
      }
    }

    return null;
  }

  /**
   * Traite les requêtes de calcul de forward
   */
  private async handleForwardRateQuery(message: string): Promise<string | null> {
    // Patterns pour détecter les requêtes de forward avec paramètres
    const forwardPatterns = [
      // Format: "forward EUR/USD spot 1.0850 3 mois"
      /forward\s+([A-Z]{3})\/?\s*([A-Z]{3})\s+(?:spot|spot\s+price|s)\s+([\d.]+)\s+(\d+)\s*(?:mois|months|m)/i,
      // Format: "taux forward EUR/USD 1.0850 à 3 mois"
      /(?:taux\s+)?forward\s+([A-Z]{3})\/?\s*([A-Z]{3})\s+([\d.]+)\s+(?:à|at|for)\s+(\d+)\s*(?:mois|months|m)/i,
      // Format: "calcul forward EUR/USD 1.0850 3 mois"
      /(?:calcul|calculate)\s+forward\s+([A-Z]{3})\/?\s*([A-Z]{3})\s+([\d.]+)\s+(\d+)\s*(?:mois|months|m)/i,
      // Format: "forward EUR/USD 3 mois" (utilise le spot actuel)
      /forward\s+([A-Z]{3})\/?\s*([A-Z]{3})\s+(\d+)\s*(?:mois|months|m)/i
    ];

    for (const pattern of forwardPatterns) {
      const match = message.match(pattern);
      if (match) {
        try {
          const base = match[1];
          const quote = match[2];
          let spotPrice: number;
          let months: number;

          if (match[3] && match[4]) {
            // Pattern avec spot explicite
            spotPrice = parseFloat(match[3]);
            months = parseInt(match[4]);
          } else if (match[3]) {
            // Pattern simple avec seulement les mois (récupérer le spot)
            months = parseInt(match[3]);
            try {
              const spotResult = await this.getSpotRate(`${base}/${quote}`);
              const spotData = JSON.parse(spotResult);
              spotPrice = parseFloat(spotData.rate);
            } catch {
              return null; // Impossible de récupérer le spot
            }
          } else {
            continue;
          }
          
          if (base && quote && spotPrice && months && !isNaN(spotPrice) && !isNaN(months)) {
            const timeToMaturity = months / 12;
            const result = await this.calculateForwardRate({
              currencyPair: `${base}/${quote}`,
              spotPrice,
              timeToMaturity
            });
            const data = JSON.parse(result);
            return `📊 **Forward ${data.currencyPair}**\n\n` +
                   `💰 Prix Forward: **${data.forwardPrice}**\n` +
                   `📈 Spot: ${data.spotPrice}\n` +
                   `📅 Maturité: ${data.timeToMaturity}\n` +
                   `💹 Taux domestique: ${data.domesticRate}\n` +
                   `💹 Taux étranger: ${data.foreignRate}`;
          }
        } catch (error) {
          // Continuer avec le pattern suivant
          continue;
        }
      }
    }

    return null;
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

    // Utiliser gemini-2.5-flash (modèle disponible dans v1beta et supporte generateContent)
    // Modèles disponibles vérifiés: gemini-2.5-flash, gemini-2.5-pro, gemini-2.0-flash, gemini-pro-latest
    const model = 'gemini-2.5-flash';
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
      
      // Détecter les erreurs de quota spécifiquement
      const errorMessage = error.error?.message || errorText;
      if (errorMessage.includes('quota') || errorMessage.includes('Quota exceeded') || response.status === 429) {
        throw new Error(`Quota API dépassé: ${errorMessage}`);
      }
      
      throw new Error(errorMessage || `Erreur API Gemini: ${response.status}`);
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