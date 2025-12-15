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
  currentComponent?: {
    type?: string;
    optionType?: 'call' | 'put';
    strike?: number;
    strikeType?: 'absolute' | 'percent';
    quantity?: number;
    volatility?: number;
    barrier?: number;
    barrierType?: 'absolute' | 'percent';
    secondBarrier?: number;
    rebate?: number;
    missingParams?: string[];
  };
  components: Array<{
    type: string;
    optionType?: 'call' | 'put';
    strike?: number;
    strikeType?: 'absolute' | 'percent';
    quantity?: number;
    volatility?: number;
    barrier?: number;
    barrierType?: 'absolute' | 'percent';
    secondBarrier?: number;
    rebate?: number;
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
      `💡 **Types disponibles:**\n` +
      `• Options vanilles: "call strike 1.10" ou "put strike 1.05"\n` +
      `• Options barrière: "call knockout strike 1.10 barrière 1.15" ou "put knockin strike 1.05 barrière 1.00"\n` +
      `• Options digitales: "one-touch barrière 1.15 rebate 5%" ou "double-touch barrière 1.10 / 1.20"\n` +
      `• Autres: "forward strike 1.10" ou "swap"\n\n` +
      `💡 Le chat vous guidera pour collecter tous les paramètres nécessaires!\n` +
      `💡 Dites "Terminer" ou "C'est tout" une fois tous les composants ajoutés.`;
  }

  /**
   * Détecte le type d'option avancé depuis le message
   */
  private detectOptionType(message: string): { type: string; optionType: 'call' | 'put' | null } {
    const normalized = message.toLowerCase();
    
    // Options digitales
    if (normalized.includes('one-touch') || normalized.includes('one touch')) {
      return { type: 'one-touch', optionType: null };
    }
    if (normalized.includes('no-touch') || normalized.includes('no touch')) {
      return { type: 'no-touch', optionType: null };
    }
    if (normalized.includes('double-touch') || normalized.includes('double touch')) {
      return { type: 'double-touch', optionType: null };
    }
    if (normalized.includes('double-no-touch') || normalized.includes('double no touch')) {
      return { type: 'double-no-touch', optionType: null };
    }
    if (normalized.includes('range-binary') || normalized.includes('range binary')) {
      return { type: 'range-binary', optionType: null };
    }
    if (normalized.includes('outside-binary') || normalized.includes('outside binary')) {
      return { type: 'outside-binary', optionType: null };
    }
    
    // Options barrière knockout
    if (normalized.includes('knockout') || normalized.includes('knock-out') || normalized.includes('ko')) {
      if (normalized.includes('call')) {
        if (normalized.includes('reverse') || normalized.includes('rev')) {
          return { type: 'call-reverse-knockout', optionType: 'call' };
        }
        if (normalized.includes('double') || normalized.includes('dbl')) {
          return { type: 'call-double-knockout', optionType: 'call' };
        }
        return { type: 'call-knockout', optionType: 'call' };
      }
      if (normalized.includes('put')) {
        if (normalized.includes('reverse') || normalized.includes('rev')) {
          return { type: 'put-reverse-knockout', optionType: 'put' };
        }
        if (normalized.includes('double') || normalized.includes('dbl')) {
          return { type: 'put-double-knockout', optionType: 'put' };
        }
        return { type: 'put-knockout', optionType: 'put' };
      }
    }
    
    // Options barrière knockin
    if (normalized.includes('knockin') || normalized.includes('knock-in') || normalized.includes('ki')) {
      if (normalized.includes('call')) {
        if (normalized.includes('reverse') || normalized.includes('rev')) {
          return { type: 'call-reverse-knockin', optionType: 'call' };
        }
        if (normalized.includes('double') || normalized.includes('dbl')) {
          return { type: 'call-double-knockin', optionType: 'call' };
        }
        return { type: 'call-knockin', optionType: 'call' };
      }
      if (normalized.includes('put')) {
        if (normalized.includes('reverse') || normalized.includes('rev')) {
          return { type: 'put-reverse-knockin', optionType: 'put' };
        }
        if (normalized.includes('double') || normalized.includes('dbl')) {
          return { type: 'put-double-knockin', optionType: 'put' };
        }
        return { type: 'put-knockin', optionType: 'put' };
      }
    }
    
    // Options vanilles
    if (normalized.includes('call') || normalized.includes('achat')) {
      return { type: 'call', optionType: 'call' };
    }
    if (normalized.includes('put') || normalized.includes('vente')) {
      return { type: 'put', optionType: 'put' };
    }
    
    return { type: '', optionType: null };
  }

  /**
   * Détermine les paramètres requis pour un type d'option
   */
  private getRequiredParams(optionType: string): string[] {
    const params: string[] = [];
    
    // Toutes les options nécessitent un strike
    if (optionType !== 'swap' && optionType !== 'forward') {
      params.push('strike');
    }
    
    // Options vanilles nécessitent volatilité
    if (optionType === 'call' || optionType === 'put') {
      params.push('volatility');
    }
    
    // Options barrière nécessitent barrière et volatilité
    if (optionType.includes('knockout') || optionType.includes('knockin')) {
      params.push('barrier');
      params.push('volatility');
      
      // Options double barrière nécessitent aussi secondBarrier
      if (optionType.includes('double')) {
        params.push('secondBarrier');
      }
    }
    
    // Options digitales nécessitent barrière, rebate et volatilité
    if (optionType.includes('touch') || optionType.includes('binary')) {
      params.push('barrier');
      params.push('rebate');
      params.push('volatility');
      
      // Options double nécessitent secondBarrier
      if (optionType.includes('double')) {
        params.push('secondBarrier');
      }
    }
    
    // Forwards nécessitent strike
    if (optionType === 'forward') {
      params.push('strike');
    }
    
    return params;
  }

  /**
   * Étape 4: Collecte des composants avec gestion intelligente des paramètres
   */
  private handleComponentsStep(message: string, sessionId: string): string {
    const session = this.strategySessions.get(sessionId);
    if (!session || !session.currencyPair) return '❌ Session introuvable.';

    const normalized = message.toLowerCase();

    // Vérifier si l'utilisateur veut terminer
    if (normalized.includes('terminer') || normalized.includes('terminé') || 
        normalized.includes('c\'est tout') || normalized.includes('fini') ||
        normalized.includes('done')) {
      // Si on est en train de construire un composant, l'annuler
      if (session.currentComponent) {
        session.currentComponent = undefined;
        return '✅ Composant annulé.\n\n💡 Ajoutez un nouveau composant ou dites "Terminer" pour finaliser la stratégie.';
      }
      return this.finalizeStrategy(sessionId);
    }

    // Si on est en train de collecter les paramètres d'un composant
    if (session.currentComponent) {
      return this.collectComponentParams(message, sessionId);
    }

    // Détecter le type de composant
    let componentType: string | null = null;
    let optionType: 'call' | 'put' | null = null;

    if (normalized.includes('forward')) {
      componentType = 'forward';
    } else if (normalized.includes('swap')) {
      componentType = 'swap';
    } else {
      const detected = this.detectOptionType(message);
      if (detected.type) {
        componentType = detected.type;
        optionType = detected.optionType;
      }
    }

    if (!componentType) {
      return '❓ Type de composant non reconnu.\n\n💡 Types disponibles:\n' +
        `• Options vanilles: "call", "put"\n` +
        `• Options barrière: "call knockout", "put knockin", "call reverse knockout"\n` +
        `• Options digitales: "one-touch", "no-touch", "double-touch", "range-binary"\n` +
        `• Autres: "forward", "swap"\n\n` +
        `💡 Exemple: "Ajoute un call knockout strike 1.10"`;
    }

    // Initialiser le composant en cours
    session.currentComponent = {
      type: componentType,
      optionType: optionType || undefined,
      missingParams: this.getRequiredParams(componentType)
    };

    // Extraire les paramètres déjà fournis dans le message
    this.extractParamsFromMessage(message, session.currentComponent, session.spotPrice || 1.0);

    // Si tous les paramètres sont fournis, ajouter directement
    if (session.currentComponent.missingParams!.length === 0) {
      return this.addComponent(sessionId);
    }

    // Sinon, demander les paramètres manquants
    return this.askForMissingParams(sessionId);
  }

  /**
   * Extrait les paramètres depuis le message utilisateur
   */
  private extractParamsFromMessage(message: string, component: any, spotPrice: number): void {
    // Déterminer quel paramètre est prioritaire (le premier dans missingParams)
    const priorityParam = component.missingParams && component.missingParams.length > 0 
      ? component.missingParams[0] 
      : null;

    // Extraire le strike
    const strikePatterns = [
      /\bstrike\s*[=:]\s*(\d+\.?\d*)/i,
      /\bk\s*[=:]\s*(\d+\.?\d*)/i,
      /\bstrike\s+(\d+\.?\d*)/i,
      /\bà\s*(\d+\.?\d*)/i,
      /\b(\d+\.\d{2,4})\b/ // Format simple comme "1.10"
    ];

    for (const pattern of strikePatterns) {
      const match = message.match(pattern);
      if (match) {
        const value = parseFloat(match[1]);
        if (value > 0) {
          component.strike = value;
          component.strikeType = 'absolute';
          if (component.missingParams) {
            component.missingParams = component.missingParams.filter((p: string) => p !== 'strike');
          }
        }
      }
    }

    // Extraire la volatilité (prioritaire si c'est le paramètre manquant)
    const volPatterns = [
      /\bvol(?:atilit[ée])?\s*[=:]\s*(\d+\.?\d*)\s*%/i,
      /\bvol(?:atilit[ée])?\s+(\d+\.?\d*)\s*%/i,
      /\bvol\s*[=:]\s*(\d+\.?\d*)/i,
      /\bvol\s+(\d+\.?\d*)/i,
      /\b(\d+\.?\d*)\s*%\s*vol(?:atilit[ée])?/i,
      /\b(\d+\.?\d*)\s*%\s*vol/i
    ];

    let volatilityFound = false;
    for (const pattern of volPatterns) {
      const match = message.match(pattern);
      if (match) {
        const volValue = parseFloat(match[1]);
        if (volValue > 0 && volValue <= 100) {
          component.volatility = volValue;
          if (component.missingParams) {
            component.missingParams = component.missingParams.filter((p: string) => p !== 'volatility');
          }
          volatilityFound = true;
          break; // Sortir de la boucle après avoir trouvé la volatilité
        }
      }
    }

    // Si aucun pattern explicite ne correspond mais que le message contient juste un nombre avec %, 
    // et que la volatilité est le paramètre manquant prioritaire, l'utiliser
    if (!volatilityFound && priorityParam === 'volatility') {
      const simplePercentPattern = /\b(\d+\.?\d*)\s*%/i;
      const simpleMatch = message.match(simplePercentPattern);
      if (simpleMatch) {
        const volValue = parseFloat(simpleMatch[1]);
        // Vérifier que ce n'est pas une quantité (qui serait aussi un pourcentage)
        // Si le message ne contient pas "quantité" ou "qty", c'est probablement la volatilité
        if (volValue > 0 && volValue <= 100 && 
            !message.toLowerCase().includes('quantité') && 
            !message.toLowerCase().includes('qty') &&
            !message.toLowerCase().includes('quantity') &&
            !message.toLowerCase().includes('barrière') &&
            !message.toLowerCase().includes('barrier') &&
            !message.toLowerCase().includes('rebate')) {
          component.volatility = volValue;
          if (component.missingParams) {
            component.missingParams = component.missingParams.filter((p: string) => p !== 'volatility');
          }
        }
      }
    }

    // Extraire la barrière
    const barrierPatterns = [
      /\bbarri[èe]re\s*[=:]\s*(\d+\.?\d*)/i,
      /\bbarrier\s*[=:]\s*(\d+\.?\d*)/i,
      /\bbarri[èe]re\s+(\d+\.?\d*)/i
    ];

    for (const pattern of barrierPatterns) {
      const match = message.match(pattern);
      if (match) {
        const value = parseFloat(match[1]);
        if (value > 0) {
          if (!component.barrier) {
            component.barrier = value;
            component.barrierType = 'absolute';
            if (component.missingParams) {
              component.missingParams = component.missingParams.filter((p: string) => p !== 'barrier');
            }
          } else if (!component.secondBarrier) {
            component.secondBarrier = value;
            if (component.missingParams) {
              component.missingParams = component.missingParams.filter((p: string) => p !== 'secondBarrier');
            }
          }
        }
      }
    }

    // Extraire le rebate (pour options digitales)
    const rebatePatterns = [
      /\brebate\s*[=:]\s*(\d+\.?\d*)\s*%/i,
      /\brebate\s*[=:]\s*(\d+\.?\d*)/i
    ];

    for (const pattern of rebatePatterns) {
      const match = message.match(pattern);
      if (match) {
        component.rebate = parseFloat(match[1]);
        if (component.missingParams) {
          component.missingParams = component.missingParams.filter((p: string) => p !== 'rebate');
        }
      }
    }

    // Extraire la quantité (seulement si ce n'est pas la volatilité qui est demandée)
    // Pour éviter les conflits avec les pourcentages simples
    if (priorityParam !== 'volatility') {
      const quantityPatterns = [
        /\bquantit[ée]\s*[=:]\s*(\d+\.?\d*)\s*%/i,
        /\bqty\s*[=:]\s*(\d+\.?\d*)/i
      ];

      for (const pattern of quantityPatterns) {
        const match = message.match(pattern);
        if (match) {
          component.quantity = parseFloat(match[1]);
          if (component.missingParams) {
            component.missingParams = component.missingParams.filter((p: string) => p !== 'quantity');
          }
        }
      }
      
      // Si la quantité est le paramètre manquant et qu'on a un simple pourcentage, l'utiliser
      if (priorityParam === 'quantity') {
        const simplePercentPattern = /\b(\d+\.?\d*)\s*%/i;
        const simpleMatch = message.match(simplePercentPattern);
        if (simpleMatch && !component.quantity) {
          const qtyValue = parseFloat(simpleMatch[1]);
          if (qtyValue > 0 && qtyValue <= 100) {
            component.quantity = qtyValue;
            if (component.missingParams) {
              component.missingParams = component.missingParams.filter((p: string) => p !== 'quantity');
            }
          }
        }
      }
    }
  }

  /**
   * Collecte les paramètres manquants étape par étape
   */
  private collectComponentParams(message: string, sessionId: string): string {
    const session = this.strategySessions.get(sessionId);
    if (!session || !session.currentComponent) return '❌ Erreur de session.';

    const component = session.currentComponent;
    const spotPrice = session.spotPrice || 1.0;

    // Extraire les paramètres du message
    this.extractParamsFromMessage(message, component, spotPrice);

    // Vérifier si tous les paramètres sont maintenant fournis
    if (component.missingParams && component.missingParams.length === 0) {
      return this.addComponent(sessionId);
    }

    // Sinon, continuer à demander
    return this.askForMissingParams(sessionId);
  }

  /**
   * Demande les paramètres manquants de manière intelligente
   */
  private askForMissingParams(sessionId: string): string {
    const session = this.strategySessions.get(sessionId);
    if (!session || !session.currentComponent) return '❌ Erreur de session.';

    const component = session.currentComponent;
    const missing = component.missingParams || [];
    const spotPrice = session.spotPrice || 1.0;

    if (missing.length === 0) {
      return this.addComponent(sessionId);
    }

    const nextParam = missing[0];
    let question = `📝 **Ajout d'un ${component.type.toUpperCase()}**\n\n`;

    // Afficher les paramètres déjà collectés
    const collected: string[] = [];
    if (component.strike) collected.push(`✅ Strike: ${component.strike}`);
    if (component.volatility) collected.push(`✅ Volatilité: ${component.volatility}%`);
    if (component.barrier) collected.push(`✅ Barrière: ${component.barrier}`);
    if (component.secondBarrier) collected.push(`✅ Seconde barrière: ${component.secondBarrier}`);
    if (component.rebate) collected.push(`✅ Rebate: ${component.rebate}%`);
    if (component.quantity) collected.push(`✅ Quantité: ${component.quantity}%`);

    if (collected.length > 0) {
      question += collected.join('\n') + '\n\n';
    }

    // Demander le paramètre suivant
    switch (nextParam) {
      case 'strike':
        question += `❓ **Quel est le strike?**\n` +
          `💡 Exemple: "1.10" ou "strike 1.10" (spot actuel: ${spotPrice.toFixed(4)})`;
        break;
      case 'volatility':
        question += `❓ **Quelle est la volatilité?**\n` +
          `💡 Exemple: "12%" ou "vol 15" (par défaut: ${(this.defaultVolatility * 100).toFixed(1)}%)`;
        break;
      case 'barrier':
        question += `❓ **Quelle est la barrière?**\n` +
          `💡 Exemple: "1.15" ou "barrière 1.15" (spot actuel: ${spotPrice.toFixed(4)})`;
        break;
      case 'secondBarrier':
        question += `❓ **Quelle est la seconde barrière?**\n` +
          `💡 Exemple: "1.20" ou "seconde barrière 1.20"`;
        break;
      case 'rebate':
        question += `❓ **Quel est le rebate (paiement)?**\n` +
          `💡 Exemple: "5%" ou "rebate 10" (par défaut: 5%)`;
        break;
      default:
        question += `❓ Veuillez fournir: ${nextParam}`;
    }

    return question;
  }

  /**
   * Ajoute le composant à la stratégie
   */
  private addComponent(sessionId: string): string {
    const session = this.strategySessions.get(sessionId);
    if (!session || !session.currentComponent) return '❌ Erreur de session.';

    const component = session.currentComponent;
    const spotPrice = session.spotPrice || 1.0;

    // Appliquer les valeurs par défaut
    const finalComponent: any = {
      type: component.type,
      quantity: component.quantity || 100,
      strikeType: component.strikeType || 'absolute'
    };

    if (component.optionType) {
      finalComponent.optionType = component.optionType;
    }

    if (component.strike) {
      finalComponent.strike = component.strike;
    } else if (component.type !== 'swap' && component.type !== 'forward') {
      // Strike par défaut pour les options
      finalComponent.strike = spotPrice;
      finalComponent.strikeType = 'absolute';
    }

    if (component.volatility !== undefined) {
      finalComponent.volatility = component.volatility;
    } else if (component.type === 'call' || component.type === 'put' || 
               component.type.includes('knockout') || component.type.includes('knockin') ||
               component.type.includes('touch') || component.type.includes('binary')) {
      finalComponent.volatility = this.defaultVolatility * 100;
    }

    if (component.barrier) {
      finalComponent.barrier = component.barrier;
      finalComponent.barrierType = component.barrierType || 'absolute';
    }

    if (component.secondBarrier) {
      finalComponent.secondBarrier = component.secondBarrier;
    }

    if (component.rebate !== undefined) {
      finalComponent.rebate = component.rebate;
    } else if (component.type.includes('touch') || component.type.includes('binary')) {
      finalComponent.rebate = 5; // Par défaut 5%
    }

    session.components.push(finalComponent);
    const componentDesc = this.formatComponentDescription(finalComponent);

    // Réinitialiser le composant en cours
    session.currentComponent = undefined;

    return `✅ **Composant ajouté:** ${componentDesc}\n\n` +
      `📊 Total composants: ${session.components.length}\n\n` +
      `💡 Ajoutez d'autres composants ou dites "Terminer" pour finaliser la stratégie.`;
  }

  /**
   * Formate la description d'un composant
   */
  private formatComponentDescription(component: any): string {
    let desc = component.type.toUpperCase();
    
    if (component.strike) {
      desc += ` Strike ${component.strike}`;
    }
    if (component.barrier) {
      desc += ` Barrière ${component.barrier}`;
    }
    if (component.secondBarrier) {
      desc += ` / ${component.secondBarrier}`;
    }
    if (component.volatility) {
      desc += ` Vol ${component.volatility}%`;
    }
    if (component.rebate) {
      desc += ` Rebate ${component.rebate}%`;
    }
    if (component.quantity) {
      desc += ` Qty ${component.quantity}%`;
    }
    
    return desc;
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
          volatility: comp.volatility || this.defaultVolatility * 100,
          barrier: comp.barrier,
          barrierType: comp.barrierType || 'absolute',
          secondBarrier: comp.secondBarrier,
          rebate: comp.rebate
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

      // Déclencher un événement personnalisé pour notifier Strategy Builder
      window.dispatchEvent(new CustomEvent('calculatorStateUpdated', {
        detail: { source: 'chat' }
      }));

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

