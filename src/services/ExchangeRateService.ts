export interface ExchangeRateData {
  provider: string;
  base: string;
  date: string;
  time_last_updated: number;
  rates: { [key: string]: number };
}

import { CURRENCY_NAMES } from '@/utils/currencyList';

export interface CurrencyInfo {
  code: string;
  name: string;
  rate: number;
}

class ExchangeRateService {
  private static instance: ExchangeRateService;
  private baseUrl = 'https://api.exchangerate-api.com/v4/latest';
  private cache: Map<string, { data: ExchangeRateData; timestamp: number }> = new Map();
  private cacheTimeout = 5 * 60 * 1000; // 5 minutes

  static getInstance(): ExchangeRateService {
    if (!ExchangeRateService.instance) {
      ExchangeRateService.instance = new ExchangeRateService();
    }
    return ExchangeRateService.instance;
  }

  /**
   * Récupère les taux de change pour une devise de base
   */
  async getExchangeRates(baseCurrency: string = 'USD'): Promise<ExchangeRateData> {
    const cacheKey = baseCurrency;
    const now = Date.now();
    
    // Vérifier le cache
    const cached = this.cache.get(cacheKey);
    if (cached && (now - cached.timestamp) < this.cacheTimeout) {
      return cached.data;
    }

    try {
      const response = await fetch(`${this.baseUrl}/${baseCurrency}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data: ExchangeRateData = await response.json();
      
      // Mettre en cache
      this.cache.set(cacheKey, { data, timestamp: now });
      
      return data;
    } catch (error) {
      console.error('Erreur lors de la récupération des taux de change:', error);
      throw error;
    }
  }

  /**
   * Formatage des données pour l'affichage dans un tableau
   * Uses centralized currency list from currencyList.ts
   */
  formatCurrencyData(exchangeData: ExchangeRateData): CurrencyInfo[] {
    return Object.entries(exchangeData.rates).map(([code, rate]) => ({
      code,
      name: CURRENCY_NAMES[code] || code,
      rate
    }));
  }



  /**
   * Récupère les principales paires de devises
   */
  getMajorCurrencyPairs(baseCurrency: string = 'USD'): string[] {
    const majorCurrencies = ['EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'NZD', 'CNY'];
    return majorCurrencies.filter(currency => currency !== baseCurrency);
  }

  /**
   * Calcule le taux croisé entre deux devises
   */
  calculateCrossRate(fromCurrency: string, toCurrency: string, rates: { [key: string]: number }): number {
    if (fromCurrency === 'USD') {
      return rates[toCurrency] || 0;
    }
    if (toCurrency === 'USD') {
      return 1 / (rates[fromCurrency] || 1);
    }
    // Calcul via USD: FROM/TO = (USD/TO) / (USD/FROM)
    return (rates[toCurrency] || 0) / (rates[fromCurrency] || 1);
  }

  /**
   * Formate un taux de change avec le bon nombre de décimales
   */
  formatRate(rate: number, precision?: number): string {
    if (precision !== undefined) {
      return rate.toFixed(precision);
    }
    
    // Auto-détection de la précision basée sur la valeur
    if (rate > 100) {
      return rate.toFixed(2); // JPY, etc.
    } else if (rate > 10) {
      return rate.toFixed(3); // TRY, etc.
    } else {
      return rate.toFixed(4); // EUR/USD, etc.
    }
  }

  /**
   * Vide le cache (utile pour forcer un refresh)
   */
  clearCache(): void {
    this.cache.clear();
  }
}

export default ExchangeRateService; 