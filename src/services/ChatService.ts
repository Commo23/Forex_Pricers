import ExchangeRateService from './ExchangeRateService';
import { calculateGarmanKohlhagenPrice, calculateFXForwardPrice } from './PricingService';
import ChatSyncService from './ChatSyncService';

/**
 * Service de chat pour l'assistant FX
 * Système basé sur des règles et pattern matching (sans IA externe)
 * Fonctionnalités:
 * - Obtenir le spot rate d'une paire de devises
 * - Calculer le prix d'une option (Call/Put)
 * - Calculer le forward FX
 */
interface StrategySession {
  step: 'currency' | 'volume' | 'maturity' | 'components' | 'complete';
  currencyPair?: { base: string; quote: string };
  spotPrice?: number;
  baseVolume?: number;
  quoteVolume?: number;
  monthsToHedge?: number;
  components: Array<{
    type: 'option' | 'forward' | 'swap';
    optionType?: 'call' | 'put';
    strike?: number;
    strikeType?: 'absolute' | 'percent';
    quantity?: number;
    volatility?: number;
  }>;
}

class ChatService {
  private static instance: ChatService;
  private exchangeRateService: ExchangeRateService;
  private strategySessions: Map<string, StrategySession> = new Map();

  // Taux d'intérêt par défaut (en pourcentage annuel)
  private defaultRates: { [key: string]: number } = {
    'USD': 5.0,
    'EUR': 4.0,
    'GBP': 5.25,
    'JPY': 0.1,
    'CHF': 1.5,
    'AUD': 4.35,
    'CAD': 5.0,
    'NZD': 5.5
  };

  // Volatilité par défaut (10% annuelle)
  private defaultVolatility = 0.10;

  private constructor() {
    this.exchangeRateService = ExchangeRateService.getInstance();
  }

  static getInstance(): ChatService {
    if (!ChatService.instance) {
      ChatService.instance = new ChatService();
    }
    return ChatService.instance;
  }

  /**
   * Traite un message de l'utilisateur et retourne une réponse
   */
  async processMessage(message: string, sessionId: string = 'default'): Promise<string> {
    const normalizedMessage = message.toLowerCase().trim();

    // Vérifier si on est en train de construire une stratégie
    const session = this.strategySessions.get(sessionId);
    if (session && session.step !== 'complete') {
      return await this.handleStrategyBuilding(message, sessionId);
    }

    // Vérifier si l'utilisateur demande à voir les résultats
    if (this.isResultsRequest(normalizedMessage)) {
      return await this.handleResultsRequest();
    }

    // Détection des différentes intentions
    if (this.isStrategySimulationRequest(normalizedMessage)) {
      return await this.startStrategySimulation(sessionId);
    }

    if (this.isOptionPriceRequest(normalizedMessage)) {
      return await this.handleOptionPriceRequest(message);
    }

    if (this.isForwardRequest(normalizedMessage)) {
      return await this.handleForwardRequest(message);
    }

    if (this.isSpotRateRequest(normalizedMessage)) {
      return await this.handleSpotRateRequest(message);
    }

    // Réponse par défaut avec suggestions
    return this.getDefaultResponse();
  }

  /**
   * Vérifie si le message demande un spot rate
   */
  private isSpotRateRequest(message: string): boolean {
    const spotKeywords = ['spot', 'taux', 'rate', 'cours', 'prix', 'change'];
    const hasSpotKeyword = spotKeywords.some(keyword => message.includes(keyword));
    
    // Détecte les paires de devises (format XXX/YYY ou XXX YYY)
    const currencyPairPattern = /([A-Z]{3})\/?\s*([A-Z]{3})/i;
    const hasCurrencyPair = currencyPairPattern.test(message);

    return hasSpotKeyword || hasCurrencyPair;
  }

  /**
   * Extrait la paire de devises du message
   */
  private extractCurrencyPair(message: string): { base: string; quote: string } | null {
    // Pattern pour XXX/YYY ou XXX YYY
    const patterns = [
      /([A-Z]{3})\/([A-Z]{3})/i,
      /([A-Z]{3})\s+([A-Z]{3})/i,
      /([A-Z]{3})([A-Z]{3})/i
    ];

    for (const pattern of patterns) {
      const match = message.match(pattern);
      if (match) {
        return {
          base: match[1].toUpperCase(),
          quote: match[2].toUpperCase()
        };
      }
    }

    return null;
  }

  /**
   * Gère la demande de spot rate
   */
  private async handleSpotRateRequest(message: string): Promise<string> {
    const pair = this.extractCurrencyPair(message);

    if (!pair) {
      return '❓ Je n\'ai pas pu identifier la paire de devises. Veuillez spécifier une paire au format EUR/USD ou EUR USD.';
    }

    try {
      // Essayer d'abord avec la base currency
      let exchangeData = await this.exchangeRateService.getExchangeRates(pair.base);
      let rate = exchangeData.rates[pair.quote];
      let isInverted = false;

      // Si le taux n'existe pas, essayer avec la quote currency comme base
      if (!rate) {
        exchangeData = await this.exchangeRateService.getExchangeRates(pair.quote);
        const invertedRate = exchangeData.rates[pair.base];
        
        if (invertedRate) {
          // Inverser le taux (1 / taux inversé)
          rate = 1 / invertedRate;
          isInverted = true;
        }
      }

      if (!rate || isNaN(rate)) {
        return `❌ Désolé, je n'ai pas pu trouver le taux pour ${pair.base}/${pair.quote}. Vérifiez que la paire est correcte.`;
      }

      const date = new Date(exchangeData.time_last_updated * 1000).toLocaleString('fr-FR');
      const formattedRate = this.formatRate(rate);

      return `✅ **Spot ${pair.base}/${pair.quote}**: ${formattedRate}\n\n📅 Dernière mise à jour: ${date}`;
    } catch (error) {
      console.error('Error fetching spot rate:', error);
      return `❌ Erreur lors de la récupération du taux ${pair.base}/${pair.quote}. Veuillez réessayer plus tard.`;
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
   * Vérifie si le message demande un calcul de prix d'option
   */
  private isOptionPriceRequest(message: string): boolean {
    const optionKeywords = ['call', 'put', 'option', 'prix option', 'price option', 'calcule', 'calculer'];
    const hasOptionKeyword = optionKeywords.some(keyword => message.includes(keyword));
    
    // Détecte la présence d'un strike
    const hasStrike = /\bstrike\b|\bk\s*=\s*|\bà\s*\d+|\b@\s*\d+/i.test(message);
    
    return hasOptionKeyword || hasStrike;
  }

  /**
   * Extrait les paramètres d'une option depuis le message
   */
  private extractOptionParams(message: string): {
    type: 'call' | 'put' | null;
    currencyPair: { base: string; quote: string } | null;
    strike: number | null;
    maturityMonths: number | null;
    volatility: number | null;
  } {
    const result = {
      type: null as 'call' | 'put' | null,
      currencyPair: null as { base: string; quote: string } | null,
      strike: null as number | null,
      maturityMonths: null as number | null,
      volatility: null as number | null
    };

    // Détecter le type (call ou put)
    if (/call|achat/i.test(message)) {
      result.type = 'call';
    } else if (/put|vente/i.test(message)) {
      result.type = 'put';
    }

    // Extraire la paire de devises
    result.currencyPair = this.extractCurrencyPair(message);

    // Extraire le strike
    const strikePatterns = [
      /\bstrike\s*[=:]\s*(\d+\.?\d*)/i,
      /\bk\s*[=:]\s*(\d+\.?\d*)/i,
      /\bà\s*(\d+\.?\d*)/i,
      /\b@\s*(\d+\.?\d*)/i,
      /\bstrike\s+(\d+\.?\d*)/i
    ];
    
    for (const pattern of strikePatterns) {
      const match = message.match(pattern);
      if (match) {
        result.strike = parseFloat(match[1]);
        break;
      }
    }

    // Extraire la maturité (en mois)
    const maturityPatterns = [
      /\b(\d+)\s*mois/i,
      /\b(\d+)\s*m\b/i,
      /\b(\d+)\s*month/i,
      /\b(\d+)\s*jours/i,
      /\b(\d+)\s*d\b/i,
      /\b(\d+)\s*day/i,
      /\b(\d+)\s*semaines/i,
      /\b(\d+)\s*w\b/i,
      /\b(\d+)\s*week/i
    ];

    for (const pattern of maturityPatterns) {
      const match = message.match(pattern);
      if (match) {
        const value = parseFloat(match[1]);
        const unit = match[0].toLowerCase();
        
        if (unit.includes('jour') || unit.includes('d') || unit.includes('day')) {
          result.maturityMonths = value / 30;
        } else if (unit.includes('semaine') || unit.includes('w') || unit.includes('week')) {
          result.maturityMonths = value / 4.33;
        } else {
          result.maturityMonths = value;
        }
        break;
      }
    }

    // Extraire la volatilité (optionnelle)
    const volPatterns = [
      /\bvol\s*[=:]\s*(\d+\.?\d*)\s*%/i,
      /\bvolatility\s*[=:]\s*(\d+\.?\d*)\s*%/i,
      /\bvol\s*(\d+\.?\d*)\s*%/i,
      /\bvol\s*[=:]\s*(\d+\.?\d*)/i
    ];

    for (const pattern of volPatterns) {
      const match = message.match(pattern);
      if (match) {
        result.volatility = parseFloat(match[1]) / 100; // Convertir en décimal
        break;
      }
    }

    return result;
  }

  /**
   * Gère la demande de calcul de prix d'option
   */
  private async handleOptionPriceRequest(message: string): Promise<string> {
    const params = this.extractOptionParams(message);

    // Vérifications
    if (!params.type) {
      return '❓ Veuillez spécifier le type d\'option: "call" ou "put".\n\n💡 Exemple: "Calcule un call EUR/USD strike 1.10 à 3 mois"';
    }

    if (!params.currencyPair) {
      return '❓ Je n\'ai pas pu identifier la paire de devises. Veuillez spécifier une paire au format EUR/USD.';
    }

    if (!params.strike) {
      return '❓ Veuillez spécifier le strike de l\'option.\n\n💡 Exemple: "Calcule un call EUR/USD strike 1.10 à 3 mois"';
    }

    if (!params.maturityMonths) {
      return '❓ Veuillez spécifier la maturité de l\'option.\n\n💡 Exemple: "Calcule un call EUR/USD strike 1.10 à 3 mois"';
    }

    try {
      // Récupérer le spot rate
      const exchangeData = await this.exchangeRateService.getExchangeRates(params.currencyPair.base);
      let spotPrice = exchangeData.rates[params.currencyPair.quote];

      if (!spotPrice) {
        // Essayer avec la quote currency comme base
        const invertedData = await this.exchangeRateService.getExchangeRates(params.currencyPair.quote);
        const invertedRate = invertedData.rates[params.currencyPair.base];
        if (invertedRate) {
          spotPrice = 1 / invertedRate;
        } else {
          return `❌ Impossible de récupérer le spot pour ${params.currencyPair.base}/${params.currencyPair.quote}.`;
        }
      }

      // Récupérer les taux d'intérêt
      const domesticRate = (this.defaultRates[params.currencyPair.quote] || 5.0) / 100;
      const foreignRate = (this.defaultRates[params.currencyPair.base] || 4.0) / 100;

      // Maturité en années
      const timeToMaturity = params.maturityMonths / 12;

      // Volatilité
      const volatility = params.volatility || this.defaultVolatility;

      // Calculer le prix de l'option avec Garman-Kohlhagen
      const optionPrice = calculateGarmanKohlhagenPrice(
        params.type,
        spotPrice,
        params.strike,
        domesticRate,
        foreignRate,
        timeToMaturity,
        volatility
      );

      // Formater la réponse
      const priceInPercent = (optionPrice / spotPrice) * 100;
      const volDisplay = (volatility * 100).toFixed(1);

      return `✅ **Prix du ${params.type.toUpperCase()} ${params.currencyPair.base}/${params.currencyPair.quote}**\n\n` +
        `📊 Spot: ${spotPrice.toFixed(4)}\n` +
        `🎯 Strike: ${params.strike.toFixed(4)}\n` +
        `📅 Maturité: ${params.maturityMonths} mois (${timeToMaturity.toFixed(2)} ans)\n` +
        `📈 Volatilité: ${volDisplay}%\n` +
        `💰 Prix: ${optionPrice.toFixed(6)} (${priceInPercent.toFixed(4)}% du spot)\n\n` +
        `💡 Note: Utilisation du modèle Garman-Kohlhagen avec taux d'intérêt par défaut.`;
    } catch (error) {
      console.error('Error calculating option price:', error);
      return `❌ Erreur lors du calcul du prix de l'option. Veuillez réessayer.`;
    }
  }

  /**
   * Vérifie si le message demande un calcul de forward
   */
  private isForwardRequest(message: string): boolean {
    const forwardKeywords = ['forward', 'futur', 'future', 'taux forward'];
    return forwardKeywords.some(keyword => message.includes(keyword));
  }

  /**
   * Gère la demande de calcul de forward
   */
  private async handleForwardRequest(message: string): Promise<string> {
    const pair = this.extractCurrencyPair(message);
    
    if (!pair) {
      return '❓ Je n\'ai pas pu identifier la paire de devises. Veuillez spécifier une paire au format EUR/USD.';
    }

    // Extraire la maturité
    const maturityPatterns = [
      /\b(\d+)\s*mois/i,
      /\b(\d+)\s*m\b/i,
      /\b(\d+)\s*month/i
    ];

    let maturityMonths = 6; // Par défaut 6 mois
    for (const pattern of maturityPatterns) {
      const match = message.match(pattern);
      if (match) {
        maturityMonths = parseFloat(match[1]);
        break;
      }
    }

    try {
      // Récupérer le spot rate
      const exchangeData = await this.exchangeRateService.getExchangeRates(pair.base);
      let spotPrice = exchangeData.rates[pair.quote];

      if (!spotPrice) {
        const invertedData = await this.exchangeRateService.getExchangeRates(pair.quote);
        const invertedRate = invertedData.rates[pair.base];
        if (invertedRate) {
          spotPrice = 1 / invertedRate;
        } else {
          return `❌ Impossible de récupérer le spot pour ${pair.base}/${pair.quote}.`;
        }
      }

      // Récupérer les taux d'intérêt
      const domesticRate = (this.defaultRates[pair.quote] || 5.0) / 100;
      const foreignRate = (this.defaultRates[pair.base] || 4.0) / 100;

      // Calculer le forward
      const timeToMaturity = maturityMonths / 12;
      const forwardPrice = calculateFXForwardPrice(spotPrice, domesticRate, foreignRate, timeToMaturity);

      const forwardPoints = forwardPrice - spotPrice;
      const forwardPointsPercent = (forwardPoints / spotPrice) * 100;

      return `✅ **Forward ${pair.base}/${pair.quote} à ${maturityMonths} mois**\n\n` +
        `📊 Spot: ${spotPrice.toFixed(4)}\n` +
        `📈 Forward: ${forwardPrice.toFixed(4)}\n` +
        `📉 Points forward: ${forwardPoints > 0 ? '+' : ''}${forwardPoints.toFixed(4)} (${forwardPointsPercent > 0 ? '+' : ''}${forwardPointsPercent.toFixed(4)}%)\n\n` +
        `💡 Note: Calcul basé sur la différence de taux d'intérêt entre ${pair.quote} (${(domesticRate * 100).toFixed(2)}%) et ${pair.base} (${(foreignRate * 100).toFixed(2)}%).`;
    } catch (error) {
      console.error('Error calculating forward:', error);
      return `❌ Erreur lors du calcul du forward. Veuillez réessayer.`;
    }
  }

  /**
   * Détecte si l'utilisateur demande une simulation de stratégie
   */
  private isStrategySimulationRequest(message: string): boolean {
    const keywords = ['simule', 'simuler', 'simulation', 'stratégie', 'strategy', 'créer stratégie', 'nouvelle stratégie'];
    return keywords.some(keyword => message.includes(keyword));
  }

  /**
   * Détecte si l'utilisateur demande les résultats
   */
  private isResultsRequest(message: string): boolean {
    const keywords = ['résultats', 'results', 'résultat', 'resultat', 'résumé', 'resume', 'résume'];
    return keywords.some(keyword => message.includes(keyword));
  }

  /**
   * Démarre une nouvelle simulation de stratégie
   */
  private async startStrategySimulation(sessionId: string): Promise<string> {
    const session: StrategySession = {
      step: 'currency',
      components: []
    };
    this.strategySessions.set(sessionId, session);

    return `🚀 **Simulation de stratégie FX**\n\n` +
      `Je vais vous guider pour créer votre stratégie de hedging.\n\n` +
      `**Étape 1/4**: Quelle paire de devises souhaitez-vous hedger?\n` +
      `💡 Exemple: "EUR/USD" ou "GBP/USD"`;
  }

  /**
   * Gère la construction de stratégie étape par étape
   */
  private async handleStrategyBuilding(message: string, sessionId: string): Promise<string> {
    const session = this.strategySessions.get(sessionId);
    if (!session) {
      return '❌ Session de stratégie introuvable. Veuillez recommencer.';
    }

    switch (session.step) {
      case 'currency':
        return await this.handleCurrencyStep(message, sessionId);
      case 'volume':
        return await this.handleVolumeStep(message, sessionId);
      case 'maturity':
        return await this.handleMaturityStep(message, sessionId);
      case 'components':
        return await this.handleComponentsStep(message, sessionId);
      default:
        return '❌ Étape inconnue.';
    }
  }

  /**
   * Étape 1: Collecte de la paire de devises
   */
  private async handleCurrencyStep(message: string, sessionId: string): Promise<string> {
    const session = this.strategySessions.get(sessionId);
    if (!session) return '❌ Session introuvable.';

    const pair = this.extractCurrencyPair(message);
    if (!pair) {
      return '❓ Je n\'ai pas pu identifier la paire de devises.\n\n💡 Veuillez spécifier une paire au format EUR/USD ou GBP/USD.';
    }

    try {
      // Récupérer le spot
      const exchangeData = await this.exchangeRateService.getExchangeRates(pair.base);
      let spotPrice = exchangeData.rates[pair.quote];

      if (!spotPrice) {
        const invertedData = await this.exchangeRateService.getExchangeRates(pair.quote);
        const invertedRate = invertedData.rates[pair.base];
        if (invertedRate) {
          spotPrice = 1 / invertedRate;
        } else {
          return `❌ Impossible de récupérer le spot pour ${pair.base}/${pair.quote}.`;
        }
      }

      session.currencyPair = pair;
      session.spotPrice = spotPrice;
      session.step = 'volume';

      return `✅ Paire de devises: **${pair.base}/${pair.quote}**\n` +
        `📊 Spot actuel: **${spotPrice.toFixed(4)}**\n\n` +
        `**Étape 2/4**: Quel volume souhaitez-vous hedger?\n` +
        `💡 Exemple: "10 millions EUR" ou "15M USD" ou "10000000 EUR"`;
    } catch (error) {
      return '❌ Erreur lors de la récupération du spot. Veuillez réessayer.';
    }
  }

  /**
   * Étape 2: Collecte du volume
   */
  private handleVolumeStep(message: string, sessionId: string): string {
    const session = this.strategySessions.get(sessionId);
    if (!session || !session.currencyPair) return '❌ Session introuvable.';

    // Extraire le volume
    const volumePatterns = [
      /(\d+(?:\.\d+)?)\s*millions?\s*([A-Z]{3})/i,
      /(\d+(?:\.\d+)?)\s*M\s*([A-Z]{3})/i,
      /(\d+(?:\.\d+)?)\s*([A-Z]{3})/i,
      /(\d+(?:,\d+)?)\s*([A-Z]{3})/i
    ];

    let volume = 0;
    let currency = '';

    for (const pattern of volumePatterns) {
      const match = message.match(pattern);
      if (match) {
        volume = parseFloat(match[1].replace(',', ''));
        currency = match[2].toUpperCase();
        
        // Convertir millions en unités
        if (message.toLowerCase().includes('million') || message.toLowerCase().includes('M')) {
          volume = volume * 1000000;
        }
        break;
      }
    }

    if (volume === 0) {
      return '❓ Je n\'ai pas pu identifier le volume.\n\n💡 Veuillez spécifier un volume, par exemple: "10 millions EUR" ou "15M USD".';
    }

    if (currency === session.currencyPair.base) {
      session.baseVolume = volume;
      session.quoteVolume = volume * (session.spotPrice || 1);
    } else if (currency === session.currencyPair.quote) {
      session.quoteVolume = volume;
      session.baseVolume = volume / (session.spotPrice || 1);
    } else {
      return `❓ La devise du volume (${currency}) ne correspond pas à la paire ${session.currencyPair.base}/${session.currencyPair.quote}.`;
    }

    session.step = 'maturity';

    return `✅ Volume: **${this.formatVolume(session.baseVolume)} ${session.currencyPair.base}**\n` +
      `   (${this.formatVolume(session.quoteVolume)} ${session.currencyPair.quote})\n\n` +
      `**Étape 3/4**: Quelle est la maturité de votre hedging?\n` +
      `💡 Exemple: "12 mois" ou "6 mois" ou "1 an"`;
  }

  /**
   * Étape 3: Collecte de la maturité
   */
  private handleMaturityStep(message: string, sessionId: string): string {
    const session = this.strategySessions.get(sessionId);
    if (!session) return '❌ Session introuvable.';

    const maturityPatterns = [
      /\b(\d+)\s*mois/i,
      /\b(\d+)\s*m\b/i,
      /\b(\d+)\s*month/i,
      /\b(\d+)\s*an/i,
      /\b(\d+)\s*année/i
    ];

    let months = 0;
    for (const pattern of maturityPatterns) {
      const match = message.match(pattern);
      if (match) {
        months = parseFloat(match[1]);
        if (message.toLowerCase().includes('an') || message.toLowerCase().includes('année')) {
          months = months * 12;
        }
        break;
      }
    }

    if (months === 0) {
      return '❓ Je n\'ai pas pu identifier la maturité.\n\n💡 Veuillez spécifier une maturité, par exemple: "12 mois" ou "6 mois".';
    }

    session.monthsToHedge = months;
    session.step = 'components';

    return `✅ Maturité: **${months} mois**\n\n` +
      `**Étape 4/4**: Quels composants souhaitez-vous ajouter à votre stratégie?\n\n` +
      `💡 Exemples:\n` +
      `• "Ajoute un call EUR/USD strike 1.10"\n` +
      `• "Un put strike 1.05"\n` +
      `• "Un forward"\n` +
      `• "Terminer" ou "C'est tout" pour finaliser`;
  }

  /**
   * Étape 4: Collecte des composants
   */
  private handleComponentsStep(message: string, sessionId: string): string {
    const session = this.strategySessions.get(sessionId);
    if (!session || !session.currencyPair) return '❌ Session introuvable.';

    const normalized = message.toLowerCase();

    // Vérifier si l'utilisateur veut terminer
    if (normalized.includes('terminer') || normalized.includes('terminé') || 
        normalized.includes('c\'est tout') || normalized.includes('fini') ||
        normalized.includes('done')) {
      return this.finalizeStrategy(sessionId);
    }

    // Détecter le type de composant
    let componentType: 'option' | 'forward' | 'swap' | null = null;
    let optionType: 'call' | 'put' | null = null;

    if (normalized.includes('forward')) {
      componentType = 'forward';
    } else if (normalized.includes('swap')) {
      componentType = 'swap';
    } else if (normalized.includes('call') || normalized.includes('achat')) {
      componentType = 'option';
      optionType = 'call';
    } else if (normalized.includes('put') || normalized.includes('vente')) {
      componentType = 'option';
      optionType = 'put';
    }

    if (!componentType) {
      return '❓ Type de composant non reconnu.\n\n💡 Veuillez spécifier: "call", "put", "forward" ou "swap".';
    }

    // Pour les options, extraire le strike
    let strike: number | undefined;
    if (componentType === 'option') {
      const strikePatterns = [
        /\bstrike\s*[=:]\s*(\d+\.?\d*)/i,
        /\bk\s*[=:]\s*(\d+\.?\d*)/i,
        /\bstrike\s+(\d+\.?\d*)/i,
        /\bà\s*(\d+\.?\d*)/i
      ];

      for (const pattern of strikePatterns) {
        const match = message.match(pattern);
        if (match) {
          strike = parseFloat(match[1]);
          break;
        }
      }

      if (!strike) {
        return `❓ Veuillez spécifier le strike pour le ${optionType}.\n\n💡 Exemple: "call strike 1.10" ou "put à 1.05"`;
      }
    }

    // Ajouter le composant
    const component: any = {
      type: componentType === 'option' ? 'option' : componentType,
      quantity: 100 // Par défaut 100%
    };

    if (componentType === 'option') {
      component.optionType = optionType;
      component.strike = strike;
      component.strikeType = 'absolute';
      component.volatility = this.defaultVolatility * 100; // En pourcentage
    }

    session.components.push(component);

    const componentDesc = componentType === 'option' 
      ? `${optionType?.toUpperCase()} strike ${strike}`
      : componentType.toUpperCase();

    return `✅ Composant ajouté: **${componentDesc}**\n\n` +
      `📊 Total composants: ${session.components.length}\n\n` +
      `💡 Ajoutez d'autres composants ou dites "Terminer" pour finaliser la stratégie.`;
  }

  /**
   * Finalise la stratégie et l'exporte vers Strategy Builder
   */
  private finalizeStrategy(sessionId: string): string {
    const session = this.strategySessions.get(sessionId);
    if (!session || !session.currencyPair || !session.baseVolume || !session.monthsToHedge) {
      return '❌ Paramètres manquants. Veuillez recommencer la simulation.';
    }

    try {
      // Construire la structure pour Strategy Builder
      const currencyPair = {
        symbol: `${session.currencyPair.base}/${session.currencyPair.quote}`,
        name: `${session.currencyPair.base}/${session.currencyPair.quote}`,
        base: session.currencyPair.base,
        quote: session.currencyPair.quote,
        category: 'majors' as const,
        defaultSpotRate: session.spotPrice || 1.0
      };

      const calculatorState = {
        params: {
          startDate: new Date().toISOString().split('T')[0],
          strategyStartDate: new Date().toISOString().split('T')[0],
          monthsToHedge: session.monthsToHedge,
          domesticRate: (this.defaultRates[session.currencyPair.quote] || 5.0) / 100,
          foreignRate: (this.defaultRates[session.currencyPair.base] || 4.0) / 100,
          baseVolume: session.baseVolume,
          quoteVolume: session.quoteVolume,
          spotPrice: session.spotPrice || 1.0,
          currencyPair: currencyPair,
          useCustomPeriods: false,
          customPeriods: [],
          volumeType: 'receivable' as const
        },
        strategy: session.components.map(comp => ({
          type: comp.type,
          optionType: comp.optionType,
          strike: comp.strike,
          strikeType: comp.strikeType || 'absolute',
          quantity: comp.quantity || 100,
          volatility: comp.volatility || this.defaultVolatility * 100
        })),
        results: null,
        payoffData: [],
        manualForwards: {},
        realPrices: {},
        realPriceParams: {
          useSimulation: false,
          volatility: this.defaultVolatility,
          drift: 0.01,
          numSimulations: 1000
        },
        barrierOptionSimulations: 1000,
        useClosedFormBarrier: false,
        activeTab: 'parameters',
        customScenario: null,
        stressTestScenarios: {},
        useImpliedVol: false,
        impliedVolatilities: {},
        customOptionPrices: {}
      };

      // Sauvegarder dans localStorage
      localStorage.setItem('calculatorState', JSON.stringify(calculatorState));

      // Marquer la session comme complète
      session.step = 'complete';

      return `✅ **Stratégie créée avec succès!**\n\n` +
        `📊 **Résumé:**\n` +
        `• Paire: ${session.currencyPair.base}/${session.currencyPair.quote}\n` +
        `• Volume: ${this.formatVolume(session.baseVolume)} ${session.currencyPair.base}\n` +
        `• Maturité: ${session.monthsToHedge} mois\n` +
        `• Composants: ${session.components.length}\n\n` +
        `🚀 **Prochaines étapes:**\n` +
        `1. Allez sur **Strategy Builder**\n` +
        `2. Cliquez sur **"Calculate Strategy Results"**\n` +
        `3. Les résultats apparaîtront automatiquement ici une fois calculés\n\n` +
        `💡 La stratégie a été chargée dans Strategy Builder!\n` +
        `📊 Le chat surveille automatiquement les résultats et vous notifiera dès qu'ils seront disponibles.`;
    } catch (error) {
      console.error('Error finalizing strategy:', error);
      return '❌ Erreur lors de la création de la stratégie. Veuillez réessayer.';
    }
  }

  /**
   * Récupère et affiche les résultats de la stratégie
   */
  private handleResultsRequest(): string {
    try {
      // Utiliser ChatSyncService pour récupérer les résultats
      const syncService = ChatSyncService.getInstance();
      const results = syncService.getResults();

      if (!results || !Array.isArray(results) || results.length === 0) {
        return '⏳ **Aucun résultat calculé pour le moment.**\n\n' +
          `💡 Veuillez:\n` +
          `1. Aller sur **Strategy Builder**\n` +
          `2. Cliquer sur **"Calculate Strategy Results"**\n` +
          `3. Les résultats apparaîtront automatiquement ici une fois calculés`;
      }

      const savedState = localStorage.getItem('calculatorState');
      if (!savedState) {
        return '❌ Aucune stratégie trouvée. Veuillez d\'abord créer une stratégie.';
      }

      const state = JSON.parse(savedState);

      // Calculer les totaux
      const totals = results.reduce((acc: any, result: any) => {
        acc.hedgedCost += result.hedgedCost || 0;
        acc.unhedgedCost += result.unhedgedCost || 0;
        acc.deltaPnL += result.deltaPnL || 0;
        acc.totalVolume += result.monthlyVolume || 0;
        acc.strategyPremium += (result.strategyPrice || 0) * (result.monthlyVolume || 0);
        return acc;
      }, {
        hedgedCost: 0,
        unhedgedCost: 0,
        deltaPnL: 0,
        totalVolume: 0,
        strategyPremium: 0
      });

      // Calculer par année
      const yearlyResults: Record<string, any> = {};
      results.forEach((result: any) => {
        const year = result.date.split('-')[0];
        if (!yearlyResults[year]) {
          yearlyResults[year] = {
            hedgedCost: 0,
            unhedgedCost: 0,
            deltaPnL: 0,
            volume: 0
          };
        }
        yearlyResults[year].hedgedCost += result.hedgedCost || 0;
        yearlyResults[year].unhedgedCost += result.unhedgedCost || 0;
        yearlyResults[year].deltaPnL += result.deltaPnL || 0;
        yearlyResults[year].volume += result.monthlyVolume || 0;
      });

      const currencyPair = state.params?.currencyPair;
      const currency = currencyPair?.quote || 'USD';

      let response = `📊 **Résultats de la stratégie**\n\n`;
      response += `**Résumé global:**\n`;
      response += `• Coût hedgé: ${this.formatCurrency(totals.hedgedCost, currency)}\n`;
      response += `• Coût non-hedgé: ${this.formatCurrency(totals.unhedgedCost, currency)}\n`;
      response += `• P&L Delta: ${this.formatCurrency(totals.deltaPnL, currency)}\n`;
      response += `• Premium stratégie: ${this.formatCurrency(totals.strategyPremium, currency)}\n`;
      response += `• Volume total: ${this.formatVolume(totals.totalVolume)}\n\n`;

      if (Object.keys(yearlyResults).length > 0) {
        response += `**Par année:**\n`;
        Object.entries(yearlyResults).sort().forEach(([year, data]: [string, any]) => {
          response += `\n**${year}:**\n`;
          response += `  • P&L: ${this.formatCurrency(data.deltaPnL, currency)}\n`;
          response += `  • Volume: ${this.formatVolume(data.volume)}\n`;
        });
      }

      return response;
    } catch (error) {
      console.error('Error reading results:', error);
      return '❌ Erreur lors de la lecture des résultats.';
    }
  }

  /**
   * Formate un montant en devise
   */
  private formatCurrency(amount: number, currency: string = 'USD'): string {
    if (isNaN(amount)) return 'N/A';
    const absAmount = Math.abs(amount);
    if (absAmount >= 1000000) {
      return `${(amount / 1000000).toFixed(2)}M ${currency}`;
    } else if (absAmount >= 1000) {
      return `${(amount / 1000).toFixed(2)}K ${currency}`;
    }
    return `${amount.toFixed(2)} ${currency}`;
  }

  /**
   * Formate un volume
   */
  private formatVolume(volume: number): string {
    if (volume >= 1000000) {
      return `${(volume / 1000000).toFixed(2)}M`;
    } else if (volume >= 1000) {
      return `${(volume / 1000).toFixed(2)}K`;
    }
    return volume.toFixed(0);
  }

  /**
   * Réponse par défaut avec toutes les fonctionnalités disponibles
   */
  private getDefaultResponse(): string {
    return `Je peux vous aider avec plusieurs fonctionnalités:\n\n` +
      `📊 **Taux de change spot**\n` +
      `• "Quel est le spot EUR/USD?"\n` +
      `• "Donne-moi le taux GBP/USD"\n\n` +
      `💰 **Calcul de prix d'options**\n` +
      `• "Calcule un call EUR/USD strike 1.10 à 3 mois"\n` +
      `• "Prix d'un put GBP/USD strike 1.25 à 6 mois vol 12%"\n\n` +
      `📈 **Calcul de forward FX**\n` +
      `• "Quel est le forward EUR/USD à 6 mois?"\n` +
      `• "Forward USD/JPY à 3 mois"\n\n` +
      `💡 Posez votre question en langage naturel!`;
  }
}

export default ChatService;

