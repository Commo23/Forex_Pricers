import { PricingService } from './PricingService';

export interface PricingRequest {
  optionType: 'call' | 'put' | 'call-knockout' | 'put-knockout' | 'call-knockin' | 'put-knockin' | 
              'one-touch' | 'double-touch' | 'no-touch' | 'double-no-touch' | 'range-binary' | 'outside-binary';
  currencyPair: string; // Format: "EUR/USD"
  spotPrice: number;
  strike: number;
  strikeType: 'percent' | 'absolute';
  maturity: number; // En années
  volatility: number; // En pourcentage
  domesticRate?: number; // Taux domestique (devise quote) en %
  foreignRate?: number; // Taux étranger (devise base) en %
  barrier?: number;
  secondBarrier?: number;
  barrierType?: 'percent' | 'absolute';
  rebate?: number; // Pour options digitales
  quantity?: number;
  notional?: number;
}

export interface PricingResult {
  price: number;
  priceInBaseCurrency: number;
  priceInQuoteCurrency: number;
  method: string;
  greeks?: {
    delta: number;
    gamma: number;
    theta: number;
    vega: number;
    rho: number;
  };
}

export class PricingActionService {
  /**
   * Valide que toutes les données nécessaires sont présentes pour pricer une option
   */
  static validatePricingRequest(request: Partial<PricingRequest>): { valid: boolean; missingFields: string[] } {
    const missingFields: string[] = [];
    
    // Champs obligatoires pour toutes les options
    if (!request.optionType) missingFields.push('optionType (call, put, etc.)');
    if (!request.currencyPair) missingFields.push('currencyPair (ex: EUR/USD)');
    if (request.spotPrice === undefined || request.spotPrice === null) missingFields.push('spotPrice');
    if (request.strike === undefined || request.strike === null) missingFields.push('strike');
    if (!request.strikeType) missingFields.push('strikeType (percent ou absolute)');
    if (request.maturity === undefined || request.maturity === null) missingFields.push('maturity (en années)');
    if (request.volatility === undefined || request.volatility === null) missingFields.push('volatility (en %)');
    
    // Champs obligatoires pour les options à barrière
    if (request.optionType?.includes('knockout') || request.optionType?.includes('knockin') || 
        request.optionType?.includes('touch') || request.optionType?.includes('binary')) {
      if (request.barrier === undefined || request.barrier === null) {
        missingFields.push('barrier');
      }
    }
    
    // Champs obligatoires pour les options double barrière
    if (request.optionType?.includes('double')) {
      if (request.secondBarrier === undefined || request.secondBarrier === null) {
        missingFields.push('secondBarrier');
      }
    }
    
    return {
      valid: missingFields.length === 0,
      missingFields
    };
  }

  /**
   * Calcule le prix d'une option avec toutes les données nécessaires
   */
  static calculateOptionPrice(request: PricingRequest, bankRates: Record<string, number | null>): PricingResult {
    // Extraire base et quote de la currency pair
    const [baseCurrency, quoteCurrency] = request.currencyPair.split('/');
    
    // Obtenir les taux d'intérêt depuis bankRates ou utiliser les valeurs fournies
    const domesticRate = request.domesticRate !== undefined 
      ? request.domesticRate / 100 
      : (bankRates[quoteCurrency] || 0) / 100;
    const foreignRate = request.foreignRate !== undefined 
      ? request.foreignRate / 100 
      : (bankRates[baseCurrency] || 0) / 100;
    
    // Calculer le strike absolu si nécessaire
    const strikeAbs = request.strikeType === 'percent' 
      ? request.spotPrice * (request.strike / 100)
      : request.strike;
    
    // Calculer les barrières absolues si nécessaire
    const barrierAbs = request.barrier ? (
      request.barrierType === 'percent'
        ? request.spotPrice * (request.barrier / 100)
        : request.barrier
    ) : undefined;
    
    const secondBarrierAbs = request.secondBarrier ? (
      request.barrierType === 'percent'
        ? request.spotPrice * (request.secondBarrier / 100)
        : request.secondBarrier
    ) : undefined;
    
    // Calculer le prix selon le type d'option
    let price = 0;
    let method = '';
    
    if (request.optionType === 'call' || request.optionType === 'put') {
      // Options vanilles - Garman-Kohlhagen
      price = PricingService.calculateGarmanKohlhagenPrice(
        request.optionType,
        request.spotPrice,
        strikeAbs,
        domesticRate,
        foreignRate,
        request.maturity,
        request.volatility / 100
      );
      method = 'Garman-Kohlhagen';
    } else if (request.optionType.includes('knockout') || request.optionType.includes('knockin')) {
      // Options à barrière - Closed Form
      if (barrierAbs) {
        price = PricingService.calculateBarrierOptionClosedForm(
          request.optionType,
          request.spotPrice,
          strikeAbs,
          domesticRate,
          request.maturity,
          request.volatility / 100,
          barrierAbs,
          secondBarrierAbs,
          foreignRate
        );
        method = 'Barrier Closed-Form';
      }
    } else if (request.optionType.includes('touch') || request.optionType.includes('binary')) {
      // Options digitales - Closed Form
      price = PricingService.calculateDigitalOptionPriceClosedForm(
        request.optionType,
        request.spotPrice,
        strikeAbs,
        domesticRate,
        foreignRate,
        request.maturity,
        request.volatility / 100,
        barrierAbs,
        secondBarrierAbs,
        request.rebate || 1,
        true
      );
      method = 'Digital Closed-Form';
    }
    
    // Calculer les Greeks pour les options vanilles
    let greeks;
    if (request.optionType === 'call' || request.optionType === 'put') {
      try {
        greeks = PricingService.calculateGreeks(
          request.optionType,
          request.spotPrice,
          strikeAbs,
          domesticRate,
          foreignRate,
          request.maturity,
          request.volatility / 100
        );
      } catch (error) {
        console.warn('Error calculating Greeks:', error);
      }
    }
    
    // Le prix retourné par Garman-Kohlhagen est en QUOTE par unité de BASE
    // Donc: priceInQuoteCurrency = price, priceInBaseCurrency = price / spotPrice
    const priceInQuoteCurrency = price;
    const priceInBaseCurrency = price / request.spotPrice;
    
    // Ajuster par la quantité si fournie
    const adjustedPrice = request.quantity ? price * (request.quantity / 100) : price;
    const adjustedPriceInQuoteCurrency = request.quantity ? priceInQuoteCurrency * (request.quantity / 100) : priceInQuoteCurrency;
    const adjustedPriceInBaseCurrency = request.quantity ? priceInBaseCurrency * (request.quantity / 100) : priceInBaseCurrency;
    
    return {
      price: adjustedPrice,
      priceInBaseCurrency: adjustedPriceInBaseCurrency,
      priceInQuoteCurrency: adjustedPriceInQuoteCurrency,
      method,
      greeks
    };
  }

  /**
   * Génère un message pour demander les données manquantes à l'utilisateur
   */
  static generateMissingFieldsMessage(missingFields: string[], optionType: string): string {
    const fieldDescriptions: Record<string, string> = {
      'optionType': 'le type d\'option (call, put, call-knockout, etc.)',
      'currencyPair': 'la paire de devises (ex: EUR/USD)',
      'spotPrice': 'le prix spot actuel',
      'strike': 'le prix d\'exercice (strike)',
      'strikeType': 'si le strike est en pourcentage (%) ou valeur absolue',
      'maturity': 'la maturité en années (ex: 0.5 pour 6 mois)',
      'volatility': 'la volatilité en pourcentage (ex: 15 pour 15%)',
      'barrier': 'le niveau de barrière',
      'secondBarrier': 'le deuxième niveau de barrière (pour options double)',
      'domesticRate': 'le taux d\'intérêt de la devise quote',
      'foreignRate': 'le taux d\'intérêt de la devise base'
    };
    
    const descriptions = missingFields.map(field => fieldDescriptions[field] || field);
    
    return `Pour pricer cette option ${optionType || ''}, j'ai besoin des informations suivantes:\n\n` +
           descriptions.map((desc, i) => `${i + 1}. ${desc}`).join('\n') +
           '\n\nPouvez-vous me fournir ces informations?';
  }
}

