// PricingService centralisé - Importe les fonctions de pricing depuis Index.tsx
import {
  erf as erfFromIndex,
  CND as CNDFromIndex,
  calculateFXForwardPrice as calculateFXForwardPriceFromIndex,
  calculateGarmanKohlhagenPrice as calculateGarmanKohlhagenPriceFromIndex,
  calculateVanillaOptionMonteCarlo as calculateVanillaOptionMonteCarloFromIndex,
  calculateBarrierOptionPrice as calculateBarrierOptionPriceFromIndex,
  calculateDigitalOptionPrice as calculateDigitalOptionPriceFromIndex,
  calculateDigitalOptionPriceClosedForm as calculateDigitalOptionPriceClosedFormFromIndex,
  calculateBarrierOptionClosedForm as calculateBarrierOptionClosedFormFromIndex,
  calculateOptionPrice as calculateOptionPriceFromIndex,
  calculateImpliedVolatility as calculateImpliedVolatilityFromIndex,
  calculateSwapPrice as calculateSwapPriceFromIndex,
  calculatePricesFromPaths as calculatePricesFromPathsFromIndex,
  calculateTimeToMaturity as calculateTimeToMaturityFromIndex,
  calculateStrategyPayoffAtPrice as calculateStrategyPayoffAtPriceFromIndex
} from '@/pages/Index';

// Export des fonctions de pricing
export function calculateGarmanKohlhagenPrice(
  type: string, 
  S: number, 
  K: number, 
  r_d: number, 
  r_f: number, 
  t: number, 
  sigma: number
): number {
  return calculateGarmanKohlhagenPriceFromIndex(type, S, K, r_d, r_f, t, sigma);
}

export function calculateVanillaOptionMonteCarlo(
  optionType: string,
  S: number,
  K: number,
  r_d: number,
  r_f: number,
  t: number,
  sigma: number,
  numSimulations: number = 1000
): number {
  return calculateVanillaOptionMonteCarloFromIndex(optionType, S, K, r_d, r_f, t, sigma, numSimulations);
}

export function calculateBarrierOptionPrice(
  optionType: string,
  S: number,
  K: number,
  r: number,
  t: number,
  sigma: number,
  barrier: number,
  secondBarrier?: number,
  numSimulations: number = 1000
): number {
  return calculateBarrierOptionPriceFromIndex(optionType, S, K, r, t, sigma, barrier, secondBarrier, numSimulations);
}

export function calculateDigitalOptionPrice(
  optionType: string,
  S: number,
  K: number,
  r_d: number,  // ✅ Taux domestique (Garman-Kohlhagen)
  r_f: number,  // ✅ Taux étranger (Garman-Kohlhagen)
  t: number,
  sigma: number,
  barrier?: number,
  secondBarrier?: number,
  numSimulations: number = 10000,
  rebate: number = 1,
  useClosedForm: boolean = true,
  payAtTouch: boolean = true
): number {
  return calculateDigitalOptionPriceFromIndex(optionType, S, K, r_d, r_f, t, sigma, barrier, secondBarrier, numSimulations, rebate, useClosedForm, payAtTouch);
}

export function calculateDigitalOptionPriceClosedForm(
  optionType: string,
  S: number,
  K: number,
  r_d: number,  // ✅ Taux domestique (Garman-Kohlhagen)
  r_f: number,  // ✅ Taux étranger (Garman-Kohlhagen)
  t: number,
  sigma: number,
  barrier?: number,
  secondBarrier?: number,
  rebate: number = 1,
  payAtTouch: boolean = true
): number {
  return calculateDigitalOptionPriceClosedFormFromIndex(optionType, S, K, r_d, r_f, t, sigma, barrier, secondBarrier, rebate, payAtTouch);
}

export function calculateBarrierOptionClosedForm(
  optionType: string,
  S: number,
  K: number,
  r_d: number,
  t: number,
  sigma: number,
  barrier: number,
  secondBarrier?: number,
  r_f: number = 0
): number {
  return calculateBarrierOptionClosedFormFromIndex(optionType, S, K, r_d, t, sigma, barrier, secondBarrier, r_f);
}

export function calculateFXForwardPrice(S: number, r_d: number, r_f: number, t: number): number {
  return calculateFXForwardPriceFromIndex(S, r_d, r_f, t);
}

export function calculateOptionPrice(
  type: string,
  S: number,
  K: number,
  r_d: number,
  r_f: number,
  t: number,
  sigma: number,
  barrier?: number,
  secondBarrier?: number,
  rebate?: number,
  numSimulations: number = 1000
): number {
  return calculateOptionPriceFromIndex(type, S, K, r_d, r_f, t, sigma, barrier, secondBarrier, rebate, numSimulations);
}

export function calculateImpliedVolatility(
  optionType: string,
  S: number,
  K: number,
  r_d: number,
  r_f: number,
  t: number,
  marketPrice: number,
  tolerance: number = 0.0001,
  maxIterations: number = 100
): number {
  return calculateImpliedVolatilityFromIndex(optionType, S, K, r_d, r_f, t, marketPrice, tolerance, maxIterations);
}

export function calculateSwapPrice(
  forwards: number[],
  times: number[],
  r: number
): number {
  return calculateSwapPriceFromIndex(forwards, times, r);
}

export function erf(x: number): number {
  return erfFromIndex(x);
}

export function CND(x: number): number {
  return CNDFromIndex(x);
}

export function calculatePricesFromPaths(
  optionType: string,
  S: number,
  K: number,
  r: number,
  maturityIndex: number,
  paths: number[][],
  barrier?: number,
  secondBarrier?: number
): number {
  return calculatePricesFromPathsFromIndex(optionType, S, K, r, maturityIndex, paths, barrier, secondBarrier);
}

export function calculateTimeToMaturity(maturityDate: string, valuationDate: string): number {
  return calculateTimeToMaturityFromIndex(maturityDate, valuationDate);
}

export function calculateStrategyPayoffAtPrice(components: any[], price: number, spotPrice: number): number {
  return calculateStrategyPayoffAtPriceFromIndex(components, price, spotPrice);
}

// ===== GREEKS CALCULATIONS =====

// Interface pour les grecques
export interface Greeks {
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  rho: number;
}

// Calcul des grecques pour options vanilles (Garman-Kohlhagen)
export function calculateVanillaGreeks(
  type: 'call' | 'put',
  S: number,      // Spot price
  K: number,      // Strike price
  r_d: number,    // Domestic rate
  r_f: number,    // Foreign rate
  t: number,      // Time to maturity
  sigma: number   // Volatility
): Greeks {
  const sqrtT = Math.sqrt(t);
  const d1 = (Math.log(S / K) + (r_d - r_f + 0.5 * sigma * sigma) * t) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  
  // Fonctions de distribution normale
  const N = (x: number) => (1 + erf(x / Math.sqrt(2))) / 2;
  const NPrime = (x: number) => Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
  
  const Nd1 = N(d1);
  const Nd2 = N(d2);
  const NPrimeD1 = NPrime(d1);
  
  let delta: number;
  let gamma: number;
  let theta: number;
  let vega: number;
  let rho: number;
  
  if (type === 'call') {
    // Call Greeks
    delta = Math.exp(-r_f * t) * Nd1;
    gamma = Math.exp(-r_f * t) * NPrimeD1 / (S * sigma * sqrtT);
    theta = -S * Math.exp(-r_f * t) * NPrimeD1 * sigma / (2 * sqrtT) 
            - r_d * K * Math.exp(-r_d * t) * Nd2 
            + r_f * S * Math.exp(-r_f * t) * Nd1;
    vega = S * Math.exp(-r_f * t) * NPrimeD1 * sqrtT;
    rho = K * t * Math.exp(-r_d * t) * Nd2;
  } else {
    // Put Greeks
    delta = Math.exp(-r_f * t) * (Nd1 - 1);
    gamma = Math.exp(-r_f * t) * NPrimeD1 / (S * sigma * sqrtT);
    theta = -S * Math.exp(-r_f * t) * NPrimeD1 * sigma / (2 * sqrtT) 
            + r_d * K * Math.exp(-r_d * t) * N(-d2) 
            - r_f * S * Math.exp(-r_f * t) * N(-d1);
    vega = S * Math.exp(-r_f * t) * NPrimeD1 * sqrtT;
    rho = -K * t * Math.exp(-r_d * t) * N(-d2);
  }
  
  return {
    delta: delta,
    gamma: gamma,
    theta: theta,
    vega: vega,
    rho: rho
  };
}

// Calcul des grecques pour options barrières (approximation analytique)
export function calculateBarrierGreeks(
  type: string,
  S: number,      // Spot price
  K: number,      // Strike price
  r_d: number,    // Domestic rate
  t: number,      // Time to maturity
  sigma: number,  // Volatility
  barrier: number, // Barrier level
  secondBarrier?: number // Second barrier for double barriers
): Greeks {
  // Pour les options barrières, on utilise une approximation
  // basée sur les grecques vanilles avec ajustements
  
  // Déterminer le type d'option vanille sous-jacente
  let vanillaType: 'call' | 'put' = 'call';
  if (type.includes('put')) {
    vanillaType = 'put';
  }
  
  // Calculer les grecques vanilles de base
  const vanillaGreeks = calculateVanillaGreeks(vanillaType, S, K, r_d, 0, t, sigma);
  
  // Facteurs d'ajustement pour les barrières
  let barrierFactor = 1.0;
  let gammaFactor = 1.0;
  let vegaFactor = 1.0;
  
  // Ajustements selon le type de barrière
  if (type.includes('knockout')) {
    // Knock-out: les grecques sont réduites près de la barrière
    const distanceToBarrier = Math.abs(S - barrier) / S;
    barrierFactor = Math.min(1.0, distanceToBarrier * 2);
    gammaFactor = Math.min(1.0, distanceToBarrier * 1.5);
    vegaFactor = Math.min(1.0, distanceToBarrier * 1.8);
  } else if (type.includes('knockin')) {
    // Knock-in: les grecques sont augmentées près de la barrière
    const distanceToBarrier = Math.abs(S - barrier) / S;
    barrierFactor = Math.max(0.1, 1.0 - distanceToBarrier * 0.5);
    gammaFactor = Math.max(0.2, 1.0 - distanceToBarrier * 0.3);
    vegaFactor = Math.max(0.15, 1.0 - distanceToBarrier * 0.4);
  }
  
  // Ajustements pour les barrières doubles
  if (secondBarrier && type.includes('double')) {
    const distanceToSecondBarrier = Math.abs(S - secondBarrier) / S;
    barrierFactor *= Math.min(1.0, distanceToSecondBarrier * 1.5);
    gammaFactor *= Math.min(1.0, distanceToSecondBarrier * 1.2);
    vegaFactor *= Math.min(1.0, distanceToSecondBarrier * 1.3);
  }
  
  return {
    delta: vanillaGreeks.delta * barrierFactor,
    gamma: vanillaGreeks.gamma * gammaFactor,
    theta: vanillaGreeks.theta * barrierFactor,
    vega: vanillaGreeks.vega * vegaFactor,
    rho: vanillaGreeks.rho * barrierFactor
  };
}

// Calcul des grecques pour options digitales (approximation)
export function calculateDigitalGreeks(
  type: string,
  S: number,      // Spot price
  K: number,      // Strike/Barrier level
  r_d: number,    // Domestic rate
  t: number,      // Time to maturity
  sigma: number,  // Volatility
  barrier?: number,
  secondBarrier?: number,
  rebate: number = 1
): Greeks {
  // Pour les options digitales, les grecques sont très sensibles
  // On utilise une approximation basée sur des spreads de vanilles
  
  const sqrtT = Math.sqrt(t);
  const d1 = (Math.log(S / K) + (r_d + 0.5 * sigma * sigma) * t) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  
  const N = (x: number) => (1 + erf(x / Math.sqrt(2))) / 2;
  const NPrime = (x: number) => Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
  
  // Approximation: option digitale ≈ spread de vanilles
  const epsilon = 0.001; // Petit écart pour l'approximation
  const K1 = K - epsilon;
  const K2 = K + epsilon;
  
  const call1 = calculateVanillaGreeks('call', S, K1, r_d, 0, t, sigma);
  const call2 = calculateVanillaGreeks('call', S, K2, r_d, 0, t, sigma);
  
  // Grecques digitales approximées
  const delta = (call1.delta - call2.delta) / (2 * epsilon) * rebate;
  const gamma = (call1.gamma - call2.gamma) / (2 * epsilon) * rebate;
  const theta = (call1.theta - call2.theta) / (2 * epsilon) * rebate;
  const vega = (call1.vega - call2.vega) / (2 * epsilon) * rebate;
  const rho = (call1.rho - call2.rho) / (2 * epsilon) * rebate;
  
  return {
    delta: delta,
    gamma: gamma,
    theta: theta,
    vega: vega,
    rho: rho
  };
}

// Fonction principale pour calculer les grecques selon le type d'option
export function calculateGreeks(
  type: string,
  S: number,
  K: number,
  r_d: number,
  r_f: number,
  t: number,
  sigma: number,
  barrier?: number,
  secondBarrier?: number,
  rebate: number = 1
): Greeks {
  // Options vanilles
  if (type === 'call' || type === 'put') {
    return calculateVanillaGreeks(type as 'call' | 'put', S, K, r_d, r_f, t, sigma);
  }
  
  // Options barrières
  if (type.includes('knockout') || type.includes('knockin')) {
    return calculateBarrierGreeks(type, S, K, r_d, t, sigma, barrier || 0, secondBarrier);
  }
  
  // Options digitales
  if (type.includes('touch') || type.includes('binary')) {
    return calculateDigitalGreeks(type, S, K, r_d, t, sigma, barrier, secondBarrier, rebate);
  }
  
  // Par défaut, retourner des grecques nulles
  return {
    delta: 0,
    gamma: 0,
    theta: 0,
    vega: 0,
    rho: 0
  };
}

// Function to get pricing settings from localStorage
export function getPricingSettings() {
  try {
    const savedSettings = localStorage.getItem('fxRiskManagerSettings');
    if (savedSettings) {
      const settings = JSON.parse(savedSettings);
      return settings.pricing || {};
    }
  } catch (error) {
    console.error('Error loading pricing settings:', error);
  }
  
  // Default pricing settings
  return {
    defaultModel: "garman-kohlhagen",
    useRealTimeData: true,
    volatilityModel: "garch",
    interestRateSource: "bloomberg",
    pricingFrequency: "real-time",
    underlyingPriceType: "spot",
    backtestExerciseType: "monthly-average"
  };
}

// Function to get the underlying price type setting
export function getUnderlyingPriceType(): 'spot' | 'forward' {
  const pricingSettings = getPricingSettings();
  return pricingSettings.underlyingPriceType || 'spot';
}

// Function to get the backtest exercise type setting
export function getBacktestExerciseType(): 'monthly-average' | 'third-friday' {
  const pricingSettings = getPricingSettings();
  return pricingSettings.backtestExerciseType || 'monthly-average';
}

// Smart calendar system for accurate date calculations

// Function to check if a year is a leap year
export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
}

// Function to get the number of days in a month
export function getDaysInMonth(year: number, month: number): number {
  const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month === 2 && isLeapYear(year)) {
    return 29;
  }
  return daysInMonth[month - 1];
}

// Function to get all Fridays in a given month
export function getFridaysInMonth(year: number, month: number): Date[] {
  const fridays: Date[] = [];
  const daysInMonth = getDaysInMonth(year, month);
  
  // Check each day of the month
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month - 1, day);
    if (date.getDay() === 5) { // 5 = Friday
      fridays.push(new Date(date));
    }
  }
  
  return fridays;
}

// Function to calculate the third Friday of a given month and year
export function getThirdFridayOfMonth(year: number, month: number): Date | null {
  const fridays = getFridaysInMonth(year, month);
  
  // Return the third Friday if it exists
  if (fridays.length >= 3) {
    const thirdFriday = fridays[2]; // Index 2 = third Friday
    console.log(`[CALENDAR] ${year}-${String(month).padStart(2, '0')}: Found 3rd Friday on ${thirdFriday.toISOString().split('T')[0]} (${fridays.length} Fridays total)`);
    return thirdFriday;
  }
  
  // Handle edge case: months with less than 3 Fridays (very rare)
  console.warn(`[CALENDAR] ${year}-${String(month).padStart(2, '0')}: Only ${fridays.length} Fridays found, using last Friday`);
  return fridays.length > 0 ? fridays[fridays.length - 1] : null;
}

// Function to find the closest date in data to a target date
export function findClosestDateInData(targetDate: Date, dates: string[]): { index: number; date: string; diffDays: number } | null {
  if (dates.length === 0) {
    return null;
  }
  
  let closestIndex = 0;
  let closestDiff = Infinity;
  
  dates.forEach((dateStr, index) => {
    const dataDate = new Date(dateStr);
    const diffMs = Math.abs(dataDate.getTime() - targetDate.getTime());
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffMs < closestDiff) {
      closestDiff = diffMs;
      closestIndex = index;
    }
  });
  
  const diffDays = Math.floor(closestDiff / (1000 * 60 * 60 * 24));
  
  return {
    index: closestIndex,
    date: dates[closestIndex],
    diffDays: diffDays
  };
}

// Function to validate if a date string is valid
export function isValidDateString(dateStr: string): boolean {
  const date = new Date(dateStr);
  return !isNaN(date.getTime());
}

// Function to get month range from data
export function getDataDateRange(dates: string[]): { start: Date; end: Date; months: string[] } | null {
  if (dates.length === 0) {
    return null;
  }
  
  const validDates = dates.filter(isValidDateString).map(d => new Date(d));
  if (validDates.length === 0) {
    return null;
  }
  
  const start = new Date(Math.min(...validDates.map(d => d.getTime())));
  const end = new Date(Math.max(...validDates.map(d => d.getTime())));
  
  // Generate list of months in the range
  const months: string[] = [];
  const current = new Date(start.getFullYear(), start.getMonth(), 1);
  const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);
  
  while (current <= endMonth) {
    const monthKey = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`;
    months.push(monthKey);
    current.setMonth(current.getMonth() + 1);
  }
  
  return { start, end, months };
}

// Function to calculate the appropriate underlying price based on settings
export function calculateUnderlyingPrice(
  spotPrice: number,
  domesticRate: number,
  foreignRate: number,
  timeToMaturity: number
): { price: number; type: 'spot' | 'forward' } {
  const priceType = getUnderlyingPriceType();
  
  if (priceType === 'forward') {
    return {
      price: calculateFXForwardPrice(spotPrice, domesticRate, foreignRate, timeToMaturity),
      type: 'forward'
    };
  } else {
    return {
      price: spotPrice,
      type: 'spot'
    };
  }
}

// Classe PricingService pour la compatibilité
export class PricingService {
  static calculateGarmanKohlhagenPrice = calculateGarmanKohlhagenPrice;
  static calculateVanillaOptionMonteCarlo = calculateVanillaOptionMonteCarlo;
  static calculateBarrierOptionPrice = calculateBarrierOptionPrice;
  static calculateDigitalOptionPrice = calculateDigitalOptionPrice;
  static calculateDigitalOptionPriceClosedForm = calculateDigitalOptionPriceClosedForm;
  static calculateBarrierOptionClosedForm = calculateBarrierOptionClosedForm;
  static calculateFXForwardPrice = calculateFXForwardPrice;
  static calculateOptionPrice = calculateOptionPrice;
  static calculateImpliedVolatility = calculateImpliedVolatility;
  static calculateSwapPrice = calculateSwapPrice;
  static calculatePricesFromPaths = calculatePricesFromPaths;
  static calculateTimeToMaturity = calculateTimeToMaturity;
  static calculateStrategyPayoffAtPrice = calculateStrategyPayoffAtPrice;
  
  // Greeks calculations
  static calculateGreeks = calculateGreeks;
  static calculateVanillaGreeks = calculateVanillaGreeks;
  static calculateBarrierGreeks = calculateBarrierGreeks;
  static calculateDigitalGreeks = calculateDigitalGreeks;
  
  static erf = erf;
  static CND = CND;
  static getPricingSettings = getPricingSettings;
  static getUnderlyingPriceType = getUnderlyingPriceType;
  static calculateUnderlyingPrice = calculateUnderlyingPrice;
  static getBacktestExerciseType = getBacktestExerciseType;
  static getThirdFridayOfMonth = getThirdFridayOfMonth;
  // Smart calendar functions
  static isLeapYear = isLeapYear;
  static getDaysInMonth = getDaysInMonth;
  static getFridaysInMonth = getFridaysInMonth;
  static findClosestDateInData = findClosestDateInData;
  static isValidDateString = isValidDateString;
  static getDataDateRange = getDataDateRange;
} 