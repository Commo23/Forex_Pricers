/**
 * Currency list utility - Synchronized with Market Data
 * This list is used across the application for currency selection
 */

export interface CurrencyOption {
  code: string;
  name: string;
}

/**
 * Currency names mapping - synchronized with ExchangeRateService
 * This should match the currencyNames in ExchangeRateService.ts
 */
export const CURRENCY_NAMES: { [key: string]: string } = {
  'USD': 'US Dollar',
  'EUR': 'Euro',
  'GBP': 'British Pound',
  'JPY': 'Japanese Yen',
  'AUD': 'Australian Dollar',
  'CAD': 'Canadian Dollar',
  'CHF': 'Swiss Franc',
  'CNY': 'Chinese Yuan',
  'NZD': 'New Zealand Dollar',
  'SEK': 'Swedish Krona',
  'NOK': 'Norwegian Krone',
  'DKK': 'Danish Krone',
  'PLN': 'Polish Zloty',
  'CZK': 'Czech Koruna',
  'HUF': 'Hungarian Forint',
  'RON': 'Romanian Leu',
  'BGN': 'Bulgarian Lev',
  'HRK': 'Croatian Kuna',
  'RUB': 'Russian Ruble',
  'TRY': 'Turkish Lira',
  'BRL': 'Brazilian Real',
  'MXN': 'Mexican Peso',
  'ARS': 'Argentine Peso',
  'CLP': 'Chilean Peso',
  'COP': 'Colombian Peso',
  'PEN': 'Peruvian Sol',
  'ZAR': 'South African Rand',
  'EGP': 'Egyptian Pound',
  'MAD': 'Moroccan Dirham',
  'NGN': 'Nigerian Naira',
  'KES': 'Kenyan Shilling',
  'INR': 'Indian Rupee',
  'PKR': 'Pakistani Rupee',
  'IDR': 'Indonesian Rupiah',
  'THB': 'Thai Baht',
  'MYR': 'Malaysian Ringgit',
  'SGD': 'Singapore Dollar',
  'HKD': 'Hong Kong Dollar',
  'KRW': 'South Korean Won',
  'PHP': 'Philippine Peso',
  'TWD': 'Taiwan New Dollar',
  'VND': 'Vietnamese Dong',
};

/**
 * Get all available currencies as options
 * @returns Array of currency options sorted by code
 */
export function getAvailableCurrencies(): CurrencyOption[] {
  return Object.entries(CURRENCY_NAMES)
    .map(([code, name]) => ({ code, name }))
    .sort((a, b) => a.code.localeCompare(b.code));
}

/**
 * Get currency name by code
 * @param code Currency code (e.g., 'USD', 'EUR')
 * @returns Currency name or code if not found
 */
export function getCurrencyName(code: string): string {
  return CURRENCY_NAMES[code.toUpperCase()] || code;
}

/**
 * Get formatted currency option string (e.g., "USD - US Dollar")
 * @param code Currency code
 * @returns Formatted string
 */
export function getCurrencyOptionLabel(code: string): string {
  const name = getCurrencyName(code);
  return `${code} - ${name}`;
}

/**
 * Get common/major currencies (most frequently used)
 * @returns Array of common currency codes
 */
export function getCommonCurrencies(): string[] {
  return ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD', 'CNY', 'MAD'];
}

