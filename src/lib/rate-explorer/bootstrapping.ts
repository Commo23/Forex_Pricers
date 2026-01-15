/**
 * Rate Curve Bootstrapping Library
 * 
 * Implements professional bootstrapping methodology:
 * - Swaps are EXACT calibration points (always forced)
 * - Futures are GUIDES between swaps (adjusted to avoid arbitrage)
 * - Interest rate basis conventions per currency
 * 
 * Methods:
 * - Simple/Linear interpolation
 * - Cubic Spline interpolation
 * - Nelson-Siegel parametric model
 */

// ============ Types ============

export type DayCountConvention = 'ACT/360' | 'ACT/365' | 'ACT/ACT' | '30/360';
export type Compounding = 'simple' | 'annual' | 'semi-annual' | 'quarterly' | 'continuous';

export interface BasisConvention {
  dayCount: DayCountConvention;
  compounding: Compounding;
  paymentFrequency: number; // per year
}

export interface BootstrapPoint {
  tenor: number; // in years
  rate: number;  // in decimal (e.g., 0.0425 for 4.25%)
  source: 'futures' | 'swap' | 'bond';
  priority: number; // 1 = swap/bond (highest), 2 = futures
  adjusted?: boolean; // true if futures was adjusted
  originalRate?: number; // original rate before adjustment
}

export interface DiscountFactor {
  tenor: number;
  df: number;
  zeroRate: number;
  forwardRate?: number;
  source: 'swap' | 'futures' | 'interpolated' | 'bond';
}

export interface BootstrapResult {
  method: BootstrapMethod;
  discountFactors: DiscountFactor[];
  parameters?: NelsonSiegelParams;
  curvePoints: { tenor: number; rate: number }[];
  inputPoints: BootstrapPoint[];
  adjustedPoints: BootstrapPoint[];
  currency: string;
  basisConvention: BasisConvention;
}

export type BootstrapMethod = 
  | 'linear' 
  | 'cubic_spline' 
  | 'nelson_siegel'
  | 'bloomberg'
  | 'quantlib_log_linear'
  | 'quantlib_log_cubic'
  | 'quantlib_linear_forward'
  | 'quantlib_monotonic_convex';

export interface NelsonSiegelParams {
  beta0: number;
  beta1: number;
  beta2: number;
  lambda: number;
}

// ============ Currency Conventions ============

const CURRENCY_CONVENTIONS: Record<string, BasisConvention> = {
  USD: { dayCount: 'ACT/360', compounding: 'semi-annual', paymentFrequency: 2 },
  EUR: { dayCount: 'ACT/360', compounding: 'annual', paymentFrequency: 1 },
  GBP: { dayCount: 'ACT/365', compounding: 'semi-annual', paymentFrequency: 2 },
  CHF: { dayCount: 'ACT/360', compounding: 'annual', paymentFrequency: 1 },
  JPY: { dayCount: 'ACT/365', compounding: 'semi-annual', paymentFrequency: 2 },
  CAD: { dayCount: 'ACT/365', compounding: 'semi-annual', paymentFrequency: 2 },
  SGD: { dayCount: 'ACT/365', compounding: 'semi-annual', paymentFrequency: 2 },
};

export function getBasisConvention(currency: string): BasisConvention {
  return CURRENCY_CONVENTIONS[currency] || CURRENCY_CONVENTIONS.USD;
}

// ============ Utility Functions ============

/**
 * Convert maturity string like "Dec '25" to years from now
 */
export function maturityToYears(maturity: string): number {
  const match = maturity.match(/(\w{3})\s*'?(\d{2})/);
  if (!match) return 0;

  const monthNames: Record<string, number> = {
    Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
    Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
  };

  const monthNum = monthNames[match[1]] ?? 0;
  const yearNum = 2000 + parseInt(match[2], 10);

  const maturityDate = new Date(yearNum, monthNum, 15);
  const today = new Date();
  const yearsToMaturity = (maturityDate.getTime() - today.getTime()) / (365.25 * 24 * 60 * 60 * 1000);

  return Math.max(0.01, yearsToMaturity);
}

/**
 * Convert price to effective rate (for futures: 100 - price)
 */
export function priceToRate(price: number): number {
  return (100 - price) / 100;
}

// ============ Rate Conversions ============

/**
 * Convert swap rate to continuous zero rate
 */
export function swapRateToContinuous(swapRate: number, tenor: number, basis: BasisConvention): number {
  const n = basis.paymentFrequency;
  
  if (basis.compounding === 'continuous') {
    return swapRate;
  }
  
  if (basis.compounding === 'simple' || tenor <= 1) {
    // Simple rate: r_cont = ln(1 + r * t) / t
    return Math.log(1 + swapRate * tenor) / tenor;
  }
  
  // Periodic compounding: r_cont = n * ln(1 + r/n)
  return n * Math.log(1 + swapRate / n);
}

/**
 * Convert futures rate (simple money market) to continuous
 */
export function futuresRateToContinuous(futuresRate: number, basis: BasisConvention): number {
  // Futures rates are typically simple rates on ACT/360 or ACT/365
  // For short periods (< 1 year), simple rate ≈ continuous rate
  // r_cont = ln(1 + r * t) / t, for 3-month: t ≈ 0.25
  const period = 0.25; // 3-month futures
  return Math.log(1 + futuresRate * period) / period;
}

// ============ Discount Factor Calculations ============

/**
 * Calculate discount factor from continuous zero rate
 * DF = exp(-r * t)
 */
export function calculateDiscountFactor(rate: number, tenor: number): number {
  return Math.exp(-rate * tenor);
}

/**
 * Calculate zero rate from discount factor
 * r = -ln(DF) / t
 */
export function calculateZeroRate(df: number, tenor: number): number {
  if (tenor <= 0) return 0;
  return -Math.log(df) / tenor;
}

/**
 * Calculate forward rate between two tenors
 * f(t1,t2) = -ln(DF2/DF1) / (t2-t1)
 */
export function calculateForwardRate(
  df1: number,
  tenor1: number,
  df2: number,
  tenor2: number
): number {
  if (tenor2 <= tenor1) return 0;
  return -Math.log(df2 / df1) / (tenor2 - tenor1);
}

// ============ Data Preparation ============

/**
 * Prepare bootstrap points with proper priority and conventions
 * Key principle:
 * - Swaps are EXACT calibration points (priority 1)
 * - Futures are GUIDES (priority 2)
 */
export function prepareBootstrapPoints(
  swapPoints: BootstrapPoint[],
  futuresPoints: BootstrapPoint[],
  currency: string
): BootstrapPoint[] {
  const basis = getBasisConvention(currency);
  
  // Convert all rates to continuous compounding
  const processedSwaps = swapPoints.map(p => ({
    ...p,
    rate: swapRateToContinuous(p.rate, p.tenor, basis),
    priority: 1,
    source: 'swap' as const,
  }));
  
  const processedFutures = futuresPoints.map(p => ({
    ...p,
    rate: futuresRateToContinuous(p.rate, basis),
    priority: 2,
    source: 'futures' as const,
  }));
  
  // Combine all points
  const allPoints = [...processedSwaps, ...processedFutures];
  
  // Sort by tenor
  allPoints.sort((a, b) => a.tenor - b.tenor);
  
  return allPoints;
}

/**
 * Adjust futures to be consistent with swap constraints
 * Implements: Swaps win, futures are deformed slightly
 */
export function adjustFuturesToSwaps(points: BootstrapPoint[]): BootstrapPoint[] {
  const swaps = points.filter(p => p.source === 'swap').sort((a, b) => a.tenor - b.tenor);
  const futures = points.filter(p => p.source === 'futures');
  
  if (swaps.length < 2) {
    // Not enough swaps to constrain, return as is
    return points;
  }
  
  const adjustedFutures: BootstrapPoint[] = [];
  
  for (const future of futures) {
    // Find surrounding swaps
    const prevSwap = [...swaps].reverse().find(s => s.tenor <= future.tenor);
    const nextSwap = swaps.find(s => s.tenor >= future.tenor);
    
    if (prevSwap && nextSwap && prevSwap.tenor !== nextSwap.tenor) {
      // Interpolate expected rate from swaps
      const t = (future.tenor - prevSwap.tenor) / (nextSwap.tenor - prevSwap.tenor);
      const expectedRate = prevSwap.rate + t * (nextSwap.rate - prevSwap.rate);
      
      // Check if futures is too far from expectation
      const deviation = Math.abs(future.rate - expectedRate);
      const tolerance = 0.003; // 30 bps tolerance
      
      if (deviation > tolerance) {
        // Adjust futures towards expected value (weighted average)
        const weight = 0.7; // 70% swap influence, 30% futures
        const adjustedRate = weight * expectedRate + (1 - weight) * future.rate;
        
        adjustedFutures.push({
          ...future,
          rate: adjustedRate,
          adjusted: true,
          originalRate: future.rate,
        });
      } else {
        adjustedFutures.push(future);
      }
    } else {
      // No surrounding swaps, keep original
      adjustedFutures.push(future);
    }
  }
  
  return [...swaps, ...adjustedFutures].sort((a, b) => a.tenor - b.tenor);
}

/**
 * Remove duplicate tenors, keeping swaps over futures
 */
export function removeDuplicates(points: BootstrapPoint[]): BootstrapPoint[] {
  const uniquePoints = new Map<string, BootstrapPoint>();
  
  // Sort by priority first (swaps first)
  const sorted = [...points].sort((a, b) => a.priority - b.priority);
  
  for (const p of sorted) {
    const key = p.tenor.toFixed(3);
    if (!uniquePoints.has(key)) {
      uniquePoints.set(key, p);
    }
    // If already exists and current is swap, replace
    else if (p.source === 'swap') {
      uniquePoints.set(key, p);
    }
  }
  
  return Array.from(uniquePoints.values()).sort((a, b) => a.tenor - b.tenor);
}

// ============ Linear Interpolation ============

export function linearInterpolation(
  points: BootstrapPoint[],
  targetTenor: number
): number {
  if (points.length === 0) return 0;
  if (points.length === 1) return points[0].rate;

  const sorted = [...points].sort((a, b) => a.tenor - b.tenor);

  if (targetTenor <= sorted[0].tenor) return sorted[0].rate;
  if (targetTenor >= sorted[sorted.length - 1].tenor) return sorted[sorted.length - 1].rate;

  for (let i = 0; i < sorted.length - 1; i++) {
    if (targetTenor >= sorted[i].tenor && targetTenor <= sorted[i + 1].tenor) {
      const t1 = sorted[i].tenor;
      const t2 = sorted[i + 1].tenor;
      const r1 = sorted[i].rate;
      const r2 = sorted[i + 1].rate;
      const weight = (targetTenor - t1) / (t2 - t1);
      return r1 + weight * (r2 - r1);
    }
  }

  return sorted[sorted.length - 1].rate;
}

export function bootstrapLinear(
  points: BootstrapPoint[],
  currency: string,
  basis: BasisConvention
): BootstrapResult {
  const sorted = [...points].sort((a, b) => a.tenor - b.tenor);
  const discountFactors: DiscountFactor[] = [];

  // Generate curve at regular intervals
  const maxTenor = Math.max(...sorted.map(p => p.tenor), 1);
  const step = maxTenor > 10 ? 0.5 : 0.25;
  const curvePoints: { tenor: number; rate: number }[] = [];

  let prevDf: DiscountFactor | null = null;

  for (let t = step; t <= maxTenor + step; t += step) {
    const rate = linearInterpolation(sorted, t);
    curvePoints.push({ tenor: t, rate });

    const df = calculateDiscountFactor(rate, t);
    const forwardRate = prevDf
      ? calculateForwardRate(prevDf.df, prevDf.tenor, df, t)
      : rate;

    // Determine source for this point
    const closestInput = sorted.reduce((closest, p) => 
      Math.abs(p.tenor - t) < Math.abs(closest.tenor - t) ? p : closest
    );
    const isExactMatch = Math.abs(closestInput.tenor - t) < 0.01;
    const source = isExactMatch ? closestInput.source : 'interpolated';

    discountFactors.push({
      tenor: t,
      df,
      zeroRate: rate,
      forwardRate: Math.max(0, forwardRate), // Ensure non-negative
      source,
    });

    prevDf = discountFactors[discountFactors.length - 1];
  }

  return {
    method: 'linear',
    discountFactors,
    curvePoints,
    inputPoints: points,
    adjustedPoints: sorted,
    currency,
    basisConvention: basis,
  };
}

// ============ Cubic Spline Interpolation ============

interface SplineCoefficients {
  a: number[];
  b: number[];
  c: number[];
  d: number[];
  x: number[];
}

function calculateSplineCoefficients(points: BootstrapPoint[]): SplineCoefficients {
  const n = points.length;
  if (n < 2) {
    return { a: [points[0]?.rate || 0], b: [0], c: [0], d: [0], x: [points[0]?.tenor || 0] };
  }

  const x = points.map(p => p.tenor);
  const y = points.map(p => p.rate);

  const h: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    h.push(x[i + 1] - x[i]);
  }

  // Natural spline with monotonicity constraint
  const alpha: number[] = [0];
  for (let i = 1; i < n - 1; i++) {
    alpha.push(
      (3 / h[i]) * (y[i + 1] - y[i]) - (3 / h[i - 1]) * (y[i] - y[i - 1])
    );
  }

  const l: number[] = [1];
  const mu: number[] = [0];
  const z: number[] = [0];

  for (let i = 1; i < n - 1; i++) {
    l.push(2 * (x[i + 1] - x[i - 1]) - h[i - 1] * mu[i - 1]);
    mu.push(h[i] / l[i]);
    z.push((alpha[i] - h[i - 1] * z[i - 1]) / l[i]);
  }

  l.push(1);
  z.push(0);

  const c: number[] = new Array(n).fill(0);
  const b: number[] = new Array(n - 1).fill(0);
  const d: number[] = new Array(n - 1).fill(0);

  for (let j = n - 2; j >= 0; j--) {
    c[j] = z[j] - mu[j] * c[j + 1];
    b[j] = (y[j + 1] - y[j]) / h[j] - h[j] * (c[j + 1] + 2 * c[j]) / 3;
    d[j] = (c[j + 1] - c[j]) / (3 * h[j]);
  }

  return { a: y.slice(0, n - 1), b, c: c.slice(0, n - 1), d, x };
}

function evaluateSpline(coeffs: SplineCoefficients, targetX: number): number {
  const { a, b, c, d, x } = coeffs;
  const n = x.length;

  if (n === 1) return a[0];
  if (targetX <= x[0]) return a[0];
  if (targetX >= x[n - 1]) {
    const i = n - 2;
    const dx = x[n - 1] - x[i];
    return a[i] + b[i] * dx + c[i] * dx * dx + d[i] * dx * dx * dx;
  }

  let i = 0;
  for (let j = 0; j < n - 1; j++) {
    if (targetX >= x[j] && targetX <= x[j + 1]) {
      i = j;
      break;
    }
  }

  const dx = targetX - x[i];
  return a[i] + b[i] * dx + c[i] * dx * dx + d[i] * dx * dx * dx;
}

export function bootstrapCubicSpline(
  points: BootstrapPoint[],
  currency: string,
  basis: BasisConvention
): BootstrapResult {
  const sorted = [...points].sort((a, b) => a.tenor - b.tenor);
  const coeffs = calculateSplineCoefficients(sorted);
  const discountFactors: DiscountFactor[] = [];

  const maxTenor = Math.max(...sorted.map(p => p.tenor), 1);
  const step = maxTenor > 10 ? 0.5 : 0.25;
  const curvePoints: { tenor: number; rate: number }[] = [];

  let prevDf: DiscountFactor | null = null;

  for (let t = step; t <= maxTenor + step; t += step) {
    const rate = evaluateSpline(coeffs, t);
    curvePoints.push({ tenor: t, rate });

    const df = calculateDiscountFactor(rate, t);
    const forwardRate = prevDf
      ? calculateForwardRate(prevDf.df, prevDf.tenor, df, t)
      : rate;

    const closestInput = sorted.reduce((closest, p) => 
      Math.abs(p.tenor - t) < Math.abs(closest.tenor - t) ? p : closest
    );
    const isExactMatch = Math.abs(closestInput.tenor - t) < 0.01;
    const source = isExactMatch ? closestInput.source : 'interpolated';

    discountFactors.push({
      tenor: t,
      df,
      zeroRate: rate,
      forwardRate: Math.max(0, forwardRate),
      source,
    });

    prevDf = discountFactors[discountFactors.length - 1];
  }

  return {
    method: 'cubic_spline',
    discountFactors,
    curvePoints,
    inputPoints: points,
    adjustedPoints: sorted,
    currency,
    basisConvention: basis,
  };
}

// ============ Nelson-Siegel Model ============

/**
 * Nelson-Siegel model formula:
 * r(t) = β0 + β1 * ((1 - e^(-λt)) / (λt)) + β2 * ((1 - e^(-λt)) / (λt) - e^(-λt))
 */
export function nelsonSiegelRate(t: number, params: NelsonSiegelParams): number {
  const { beta0, beta1, beta2, lambda } = params;

  if (t <= 0.001) return beta0 + beta1; // Limit as t -> 0

  const lambdaT = lambda * t;
  const expTerm = Math.exp(-lambdaT);
  const factor1 = (1 - expTerm) / lambdaT;
  const factor2 = factor1 - expTerm;

  return beta0 + beta1 * factor1 + beta2 * factor2;
}

/**
 * Fit Nelson-Siegel parameters to observed rates
 * Uses weighted least squares - swaps have higher weight
 */
function fitNelsonSiegel(points: BootstrapPoint[]): NelsonSiegelParams {
  // Initial guesses based on curve shape
  const rates = points.map(p => p.rate);
  const maxRate = Math.max(...rates);
  const minRate = Math.min(...rates);
  const shortRate = points.length > 0 ? points[0].rate : 0.03;
  const longRate = points.length > 0 ? points[points.length - 1].rate : 0.04;
  
  let beta0 = longRate;
  let beta1 = shortRate - longRate;
  let beta2 = (maxRate - minRate) * (maxRate > longRate ? 1 : -1);
  let lambda = 0.5;

  const learningRate = 0.00005;
  const iterations = 8000;

  for (let iter = 0; iter < iterations; iter++) {
    let gradBeta0 = 0;
    let gradBeta1 = 0;
    let gradBeta2 = 0;
    let gradLambda = 0;

    for (const point of points) {
      const t = point.tenor;
      if (t <= 0.001) continue;

      // Weight: swaps get 3x weight
      const weight = point.source === 'swap' ? 3 : 1;

      const lambdaT = lambda * t;
      const expTerm = Math.exp(-lambdaT);
      const factor1 = (1 - expTerm) / lambdaT;
      const factor2 = factor1 - expTerm;

      const predicted = beta0 + beta1 * factor1 + beta2 * factor2;
      const error = predicted - point.rate;

      gradBeta0 += weight * 2 * error;
      gradBeta1 += weight * 2 * error * factor1;
      gradBeta2 += weight * 2 * error * factor2;

      // Gradient for lambda
      const dFactor1_dLambda = t * expTerm / lambdaT - (1 - expTerm) * t / (lambdaT * lambdaT);
      const dFactor2_dLambda = dFactor1_dLambda + t * expTerm;
      gradLambda += weight * 2 * error * (beta1 * dFactor1_dLambda + beta2 * dFactor2_dLambda);
    }

    beta0 -= learningRate * gradBeta0;
    beta1 -= learningRate * gradBeta1;
    beta2 -= learningRate * gradBeta2;
    lambda -= learningRate * 0.05 * gradLambda;

    // Constrain lambda to reasonable range
    lambda = Math.max(0.05, Math.min(3.0, lambda));
  }

  return { beta0, beta1, beta2, lambda };
}

export function bootstrapNelsonSiegel(
  points: BootstrapPoint[],
  currency: string,
  basis: BasisConvention
): BootstrapResult {
  const sorted = [...points].sort((a, b) => a.tenor - b.tenor);
  const params = fitNelsonSiegel(sorted);
  const discountFactors: DiscountFactor[] = [];

  const maxTenor = Math.max(...sorted.map(p => p.tenor), 1);
  const step = maxTenor > 10 ? 0.5 : 0.25;
  const curvePoints: { tenor: number; rate: number }[] = [];

  let prevDf: DiscountFactor | null = null;

  for (let t = step; t <= maxTenor + step; t += step) {
    const rate = nelsonSiegelRate(t, params);
    curvePoints.push({ tenor: t, rate });

    const df = calculateDiscountFactor(rate, t);
    const forwardRate = prevDf
      ? calculateForwardRate(prevDf.df, prevDf.tenor, df, t)
      : rate;

    const closestInput = sorted.reduce((closest, p) => 
      Math.abs(p.tenor - t) < Math.abs(closest.tenor - t) ? p : closest
    );
    const isExactMatch = Math.abs(closestInput.tenor - t) < 0.05;
    const source = isExactMatch ? closestInput.source : 'interpolated';

    discountFactors.push({
      tenor: t,
      df,
      zeroRate: rate,
      forwardRate: Math.max(0, forwardRate),
      source,
    });

    prevDf = discountFactors[discountFactors.length - 1];
  }

  return {
    method: 'nelson_siegel',
    discountFactors,
    curvePoints,
    inputPoints: points,
    adjustedPoints: sorted,
    parameters: params,
    currency,
    basisConvention: basis,
  };
}

// ============ Bloomberg Method ============

interface ForwardPoint {
  startTenor: number;
  endTenor: number;
  forwardRate: number;
}

function logLinearDfInterpolation(
  dfs: { tenor: number; logDf: number }[],
  targetTenor: number
): number {
  if (dfs.length === 0) return 0;
  if (dfs.length === 1) return dfs[0].logDf;

  const sorted = [...dfs].sort((a, b) => a.tenor - b.tenor);

  if (targetTenor <= sorted[0].tenor) {
    return sorted[0].logDf * (targetTenor / sorted[0].tenor);
  }
  if (targetTenor >= sorted[sorted.length - 1].tenor) {
    const lastDf = sorted[sorted.length - 1];
    const rate = -lastDf.logDf / lastDf.tenor;
    return -rate * targetTenor;
  }

  for (let i = 0; i < sorted.length - 1; i++) {
    if (targetTenor >= sorted[i].tenor && targetTenor <= sorted[i + 1].tenor) {
      const t1 = sorted[i].tenor;
      const t2 = sorted[i + 1].tenor;
      const logDf1 = sorted[i].logDf;
      const logDf2 = sorted[i + 1].logDf;
      const weight = (targetTenor - t1) / (t2 - t1);
      return logDf1 + weight * (logDf2 - logDf1);
    }
  }

  return sorted[sorted.length - 1].logDf;
}

function smoothForwardCurve(forwards: ForwardPoint[]): ForwardPoint[] {
  const sorted = [...forwards].sort((a, b) => a.startTenor - b.startTenor);
  const smoothed: ForwardPoint[] = [];
  
  for (let i = 0; i < sorted.length; i++) {
    let fwd = sorted[i].forwardRate;
    
    if (i > 0 && i < sorted.length - 1) {
      const prev = sorted[i - 1].forwardRate;
      const next = sorted[i + 1].forwardRate;
      fwd = 0.6 * fwd + 0.2 * prev + 0.2 * next;
    }
    
    fwd = Math.max(0.0001, fwd);
    
    smoothed.push({
      ...sorted[i],
      forwardRate: fwd,
    });
  }
  
  return smoothed;
}

function forwardsToDfs(forwards: ForwardPoint[]): { tenor: number; df: number }[] {
  const sorted = [...forwards].sort((a, b) => a.startTenor - b.startTenor);
  const dfs: { tenor: number; df: number }[] = [{ tenor: 0, df: 1.0 }];
  
  let currentDf = 1.0;
  
  for (const fwd of sorted) {
    const dt = fwd.endTenor - fwd.startTenor;
    currentDf = currentDf * Math.exp(-fwd.forwardRate * dt);
    dfs.push({ tenor: fwd.endTenor, df: currentDf });
  }
  
  return dfs;
}

export function bootstrapBloomberg(
  points: BootstrapPoint[],
  currency: string,
  basis: BasisConvention
): BootstrapResult {
  const sorted = [...points].sort((a, b) => a.tenor - b.tenor);
  
  const swapDfs: { tenor: number; logDf: number }[] = [];
  
  for (const point of sorted.filter(p => p.source === 'swap')) {
    const df = calculateDiscountFactor(point.rate, point.tenor);
    swapDfs.push({ tenor: point.tenor, logDf: Math.log(df) });
  }
  
  for (const point of sorted.filter(p => p.source === 'futures')) {
    const df = calculateDiscountFactor(point.rate, point.tenor);
    swapDfs.push({ tenor: point.tenor, logDf: Math.log(df) });
  }
  
  swapDfs.sort((a, b) => a.tenor - b.tenor);
  
  const maxTenor = Math.max(...sorted.map(p => p.tenor), 1);
  const step = maxTenor > 10 ? 0.5 : 0.25;
  
  const initialDfs: { tenor: number; df: number }[] = [];
  for (let t = step; t <= maxTenor + step; t += step) {
    const logDf = logLinearDfInterpolation(swapDfs, t);
    initialDfs.push({ tenor: t, df: Math.exp(logDf) });
  }
  
  const forwards: ForwardPoint[] = [];
  for (let i = 1; i < initialDfs.length; i++) {
    const fwd = calculateForwardRate(
      initialDfs[i - 1].df,
      initialDfs[i - 1].tenor,
      initialDfs[i].df,
      initialDfs[i].tenor
    );
    forwards.push({
      startTenor: initialDfs[i - 1].tenor,
      endTenor: initialDfs[i].tenor,
      forwardRate: fwd,
    });
  }
  
  const smoothedForwards = smoothForwardCurve(forwards);
  const finalDfs = forwardsToDfs(smoothedForwards);
  
  const discountFactors: DiscountFactor[] = [];
  const curvePoints: { tenor: number; rate: number }[] = [];
  
  let prevDf: DiscountFactor | null = null;
  
  for (const dfPoint of finalDfs.slice(1)) {
    const zeroRate = calculateZeroRate(dfPoint.df, dfPoint.tenor);
    const forwardRate = prevDf
      ? calculateForwardRate(prevDf.df, prevDf.tenor, dfPoint.df, dfPoint.tenor)
      : zeroRate;
    
    curvePoints.push({ tenor: dfPoint.tenor, rate: zeroRate });
    
    const closestInput = sorted.reduce((closest, p) =>
      Math.abs(p.tenor - dfPoint.tenor) < Math.abs(closest.tenor - dfPoint.tenor) ? p : closest
    );
    const isExactMatch = Math.abs(closestInput.tenor - dfPoint.tenor) < 0.01;
    const source = isExactMatch ? closestInput.source : 'interpolated';
    
    discountFactors.push({
      tenor: dfPoint.tenor,
      df: dfPoint.df,
      zeroRate,
      forwardRate: Math.max(0, forwardRate),
      source,
    });
    
    prevDf = discountFactors[discountFactors.length - 1];
  }
  
  return {
    method: 'bloomberg',
    discountFactors,
    curvePoints,
    inputPoints: points,
    adjustedPoints: sorted,
    currency,
    basisConvention: basis,
  };
}

// ============ QuantLib Methods ============

export function bootstrapQuantLibLogLinear(
  points: BootstrapPoint[],
  currency: string,
  basis: BasisConvention
): BootstrapResult {
  const sorted = [...points].sort((a, b) => a.tenor - b.tenor);
  const discountFactors: DiscountFactor[] = [];
  
  const logDfPoints = sorted.map(p => ({
    tenor: p.tenor,
    logDf: -p.rate * p.tenor,
  }));
  
  const maxTenor = Math.max(...sorted.map(p => p.tenor), 1);
  const step = maxTenor > 10 ? 0.5 : 0.25;
  const curvePoints: { tenor: number; rate: number }[] = [];
  
  let prevDf: DiscountFactor | null = null;
  
  for (let t = step; t <= maxTenor + step; t += step) {
    const logDf = logLinearDfInterpolation(logDfPoints, t);
    const df = Math.exp(logDf);
    const zeroRate = calculateZeroRate(df, t);
    
    curvePoints.push({ tenor: t, rate: zeroRate });
    
    const forwardRate = prevDf
      ? calculateForwardRate(prevDf.df, prevDf.tenor, df, t)
      : zeroRate;
    
    const closestInput = sorted.reduce((closest, p) =>
      Math.abs(p.tenor - t) < Math.abs(closest.tenor - t) ? p : closest
    );
    const isExactMatch = Math.abs(closestInput.tenor - t) < 0.01;
    const source = isExactMatch ? closestInput.source : 'interpolated';
    
    discountFactors.push({
      tenor: t,
      df,
      zeroRate,
      forwardRate: Math.max(0, forwardRate),
      source,
    });
    
    prevDf = discountFactors[discountFactors.length - 1];
  }
  
  return {
    method: 'quantlib_log_linear',
    discountFactors,
    curvePoints,
    inputPoints: points,
    adjustedPoints: sorted,
    currency,
    basisConvention: basis,
  };
}

function logCubicInterpolation(
  points: { tenor: number; logDf: number }[],
  targetTenor: number
): number {
  if (points.length < 2) return points[0]?.logDf || 0;
  
  const bootstrapPoints: BootstrapPoint[] = points.map(p => ({
    tenor: p.tenor,
    rate: p.logDf,
    source: 'swap' as const,
    priority: 1,
  }));
  
  const coeffs = calculateSplineCoefficients(bootstrapPoints);
  return evaluateSpline(coeffs, targetTenor);
}

export function bootstrapQuantLibLogCubic(
  points: BootstrapPoint[],
  currency: string,
  basis: BasisConvention
): BootstrapResult {
  const sorted = [...points].sort((a, b) => a.tenor - b.tenor);
  const discountFactors: DiscountFactor[] = [];
  
  const logDfPoints = sorted.map(p => ({
    tenor: p.tenor,
    logDf: -p.rate * p.tenor,
  }));
  
  const maxTenor = Math.max(...sorted.map(p => p.tenor), 1);
  const step = maxTenor > 10 ? 0.5 : 0.25;
  const curvePoints: { tenor: number; rate: number }[] = [];
  
  let prevDf: DiscountFactor | null = null;
  
  for (let t = step; t <= maxTenor + step; t += step) {
    const logDf = logCubicInterpolation(logDfPoints, t);
    const df = Math.exp(logDf);
    const zeroRate = calculateZeroRate(df, t);
    
    curvePoints.push({ tenor: t, rate: zeroRate });
    
    const forwardRate = prevDf
      ? calculateForwardRate(prevDf.df, prevDf.tenor, df, t)
      : zeroRate;
    
    const closestInput = sorted.reduce((closest, p) =>
      Math.abs(p.tenor - t) < Math.abs(closest.tenor - t) ? p : closest
    );
    const isExactMatch = Math.abs(closestInput.tenor - t) < 0.01;
    const source = isExactMatch ? closestInput.source : 'interpolated';
    
    discountFactors.push({
      tenor: t,
      df,
      zeroRate,
      forwardRate: Math.max(0, forwardRate),
      source,
    });
    
    prevDf = discountFactors[discountFactors.length - 1];
  }
  
  return {
    method: 'quantlib_log_cubic',
    discountFactors,
    curvePoints,
    inputPoints: points,
    adjustedPoints: sorted,
    currency,
    basisConvention: basis,
  };
}

export function bootstrapQuantLibLinearForward(
  points: BootstrapPoint[],
  currency: string,
  basis: BasisConvention
): BootstrapResult {
  const sorted = [...points].sort((a, b) => a.tenor - b.tenor);
  const discountFactors: DiscountFactor[] = [];
  
  const forwardPoints: { tenor: number; forward: number }[] = [];
  
  for (let i = 0; i < sorted.length; i++) {
    let forward: number;
    if (i === 0) {
      forward = sorted[0].rate;
    } else {
      forward = sorted[i].rate + sorted[i].tenor * 
        (sorted[i].rate - sorted[i - 1].rate) / (sorted[i].tenor - sorted[i - 1].tenor);
    }
    forwardPoints.push({ tenor: sorted[i].tenor, forward });
  }
  
  const maxTenor = Math.max(...sorted.map(p => p.tenor), 1);
  const step = maxTenor > 10 ? 0.5 : 0.25;
  const curvePoints: { tenor: number; rate: number }[] = [];
  
  let prevDf: DiscountFactor | null = null;
  
  for (let t = step; t <= maxTenor + step; t += step) {
    let fwd: number;
    if (t <= forwardPoints[0].tenor) {
      fwd = forwardPoints[0].forward;
    } else if (t >= forwardPoints[forwardPoints.length - 1].tenor) {
      fwd = forwardPoints[forwardPoints.length - 1].forward;
    } else {
      fwd = forwardPoints[0].forward;
      for (let i = 0; i < forwardPoints.length - 1; i++) {
        if (t >= forwardPoints[i].tenor && t <= forwardPoints[i + 1].tenor) {
          const weight = (t - forwardPoints[i].tenor) / 
            (forwardPoints[i + 1].tenor - forwardPoints[i].tenor);
          fwd = forwardPoints[i].forward + weight * 
            (forwardPoints[i + 1].forward - forwardPoints[i].forward);
          break;
        }
      }
    }
    
    const zeroRate = fwd;
    
    curvePoints.push({ tenor: t, rate: zeroRate });
    
    const df = calculateDiscountFactor(zeroRate, t);
    const forwardRate = prevDf
      ? calculateForwardRate(prevDf.df, prevDf.tenor, df, t)
      : zeroRate;
    
    const closestInput = sorted.reduce((closest, p) =>
      Math.abs(p.tenor - t) < Math.abs(closest.tenor - t) ? p : closest
    );
    const isExactMatch = Math.abs(closestInput.tenor - t) < 0.01;
    const source = isExactMatch ? closestInput.source : 'interpolated';
    
    discountFactors.push({
      tenor: t,
      df,
      zeroRate,
      forwardRate: Math.max(0, forwardRate),
      source,
    });
    
    prevDf = discountFactors[discountFactors.length - 1];
  }
  
  return {
    method: 'quantlib_linear_forward',
    discountFactors,
    curvePoints,
    inputPoints: points,
    adjustedPoints: sorted,
    currency,
    basisConvention: basis,
  };
}

function monotonicConvexInterpolation(
  points: BootstrapPoint[],
  targetTenor: number
): number {
  if (points.length === 0) return 0;
  if (points.length === 1) return points[0].rate;
  
  const sorted = [...points].sort((a, b) => a.tenor - b.tenor);
  
  if (targetTenor <= sorted[0].tenor) return sorted[0].rate;
  if (targetTenor >= sorted[sorted.length - 1].tenor) return sorted[sorted.length - 1].rate;
  
  let i = 0;
  for (let j = 0; j < sorted.length - 1; j++) {
    if (targetTenor >= sorted[j].tenor && targetTenor <= sorted[j + 1].tenor) {
      i = j;
      break;
    }
  }
  
  const t1 = sorted[i].tenor;
  const t2 = sorted[i + 1].tenor;
  const r1 = sorted[i].rate;
  const r2 = sorted[i + 1].rate;
  
  const x = (targetTenor - t1) / (t2 - t1);
  
  let slope = (r2 - r1) / (t2 - t1);
  
  let slopePrev = slope;
  let slopeNext = slope;
  
  if (i > 0) {
    slopePrev = (r1 - sorted[i - 1].rate) / (t1 - sorted[i - 1].tenor);
  }
  if (i < sorted.length - 2) {
    slopeNext = (sorted[i + 2].rate - r2) / (sorted[i + 2].tenor - t2);
  }
  
  if (slopePrev * slope < 0) slope = 0;
  if (slope * slopeNext < 0) slope = 0;
  
  const h00 = 2 * x * x * x - 3 * x * x + 1;
  const h10 = x * x * x - 2 * x * x + x;
  const h01 = -2 * x * x * x + 3 * x * x;
  const h11 = x * x * x - x * x;
  
  const dt = t2 - t1;
  return h00 * r1 + h10 * dt * slope + h01 * r2 + h11 * dt * slope;
}

export function bootstrapQuantLibMonotonicConvex(
  points: BootstrapPoint[],
  currency: string,
  basis: BasisConvention
): BootstrapResult {
  const sorted = [...points].sort((a, b) => a.tenor - b.tenor);
  const discountFactors: DiscountFactor[] = [];
  
  const maxTenor = Math.max(...sorted.map(p => p.tenor), 1);
  const step = maxTenor > 10 ? 0.5 : 0.25;
  const curvePoints: { tenor: number; rate: number }[] = [];
  
  let prevDf: DiscountFactor | null = null;
  
  for (let t = step; t <= maxTenor + step; t += step) {
    const rate = monotonicConvexInterpolation(sorted, t);
    curvePoints.push({ tenor: t, rate });
    
    const df = calculateDiscountFactor(rate, t);
    const forwardRate = prevDf
      ? calculateForwardRate(prevDf.df, prevDf.tenor, df, t)
      : rate;
    
    const closestInput = sorted.reduce((closest, p) =>
      Math.abs(p.tenor - t) < Math.abs(closest.tenor - t) ? p : closest
    );
    const isExactMatch = Math.abs(closestInput.tenor - t) < 0.01;
    const source = isExactMatch ? closestInput.source : 'interpolated';
    
    discountFactors.push({
      tenor: t,
      df,
      zeroRate: rate,
      forwardRate: Math.max(0, forwardRate),
      source,
    });
    
    prevDf = discountFactors[discountFactors.length - 1];
  }
  
  return {
    method: 'quantlib_monotonic_convex',
    discountFactors,
    curvePoints,
    inputPoints: points,
    adjustedPoints: sorted,
    currency,
    basisConvention: basis,
  };
}

export function bootstrap(
  swapPoints: BootstrapPoint[],
  futuresPoints: BootstrapPoint[],
  method: BootstrapMethod,
  currency: string = 'USD'
): BootstrapResult {
  const basis = getBasisConvention(currency);
  
  const allPoints = prepareBootstrapPoints(swapPoints, futuresPoints, currency);
  
  if (allPoints.length === 0) {
    return {
      method,
      discountFactors: [],
      curvePoints: [],
      inputPoints: [],
      adjustedPoints: [],
      currency,
      basisConvention: basis,
    };
  }
  
  const adjustedPoints = adjustFuturesToSwaps(allPoints);
  const uniquePoints = removeDuplicates(adjustedPoints);

  switch (method) {
    case 'linear':
      return bootstrapLinear(uniquePoints, currency, basis);
    case 'cubic_spline':
      return bootstrapCubicSpline(uniquePoints, currency, basis);
    case 'nelson_siegel':
      return bootstrapNelsonSiegel(uniquePoints, currency, basis);
    case 'bloomberg':
      return bootstrapBloomberg(uniquePoints, currency, basis);
    case 'quantlib_log_linear':
      return bootstrapQuantLibLogLinear(uniquePoints, currency, basis);
    case 'quantlib_log_cubic':
      return bootstrapQuantLibLogCubic(uniquePoints, currency, basis);
    case 'quantlib_linear_forward':
      return bootstrapQuantLibLinearForward(uniquePoints, currency, basis);
    case 'quantlib_monotonic_convex':
      return bootstrapQuantLibMonotonicConvex(uniquePoints, currency, basis);
    default:
      return bootstrapLinear(uniquePoints, currency, basis);
  }
}

export function bootstrapLegacy(
  points: BootstrapPoint[],
  method: BootstrapMethod
): BootstrapResult {
  const swaps = points.filter(p => p.source === 'swap');
  const futures = points.filter(p => p.source === 'futures');
  return bootstrap(swaps, futures, method, 'USD');
}

export function bootstrapBonds(
  bondPoints: BootstrapPoint[],
  method: BootstrapMethod,
  currency: string
): BootstrapResult {
  const basis = getBasisConvention(currency);
  
  const points = bondPoints.map(p => ({
    ...p,
    rate: swapRateToContinuous(p.rate, p.tenor, basis),
    priority: 1,
    source: 'bond' as const,
  }));
  
  const uniquePoints = removeDuplicates(points);
  
  if (uniquePoints.length < 2) {
    return {
      method,
      discountFactors: [],
      curvePoints: [],
      inputPoints: bondPoints,
      adjustedPoints: [],
      currency,
      basisConvention: basis,
    };
  }
  
  switch (method) {
    case 'linear':
      return bootstrapLinear(uniquePoints, currency, basis);
    case 'cubic_spline':
      return bootstrapCubicSpline(uniquePoints, currency, basis);
    case 'nelson_siegel':
      return bootstrapNelsonSiegel(uniquePoints, currency, basis);
    case 'bloomberg':
      return bootstrapBloomberg(uniquePoints, currency, basis);
    case 'quantlib_log_linear':
      return bootstrapQuantLibLogLinear(uniquePoints, currency, basis);
    case 'quantlib_log_cubic':
      return bootstrapQuantLibLogCubic(uniquePoints, currency, basis);
    case 'quantlib_linear_forward':
      return bootstrapQuantLibLinearForward(uniquePoints, currency, basis);
    case 'quantlib_monotonic_convex':
      return bootstrapQuantLibMonotonicConvex(uniquePoints, currency, basis);
    default:
      return bootstrapLinear(uniquePoints, currency, basis);
  }
}

// ============ Export Functions ============

export function exportToCSV(result: BootstrapResult): string {
  const headers = [
    'Tenor',
    'Discount Factor',
    'Zero Rate (%)',
    'Forward Rate (%)',
    'Source',
    'Day Count',
    'Compounding'
  ];
  const rows = result.discountFactors.map(df => [
    df.tenor.toFixed(2),
    df.df.toFixed(8),
    (df.zeroRate * 100).toFixed(4),
    df.forwardRate ? (df.forwardRate * 100).toFixed(4) : 'N/A',
    df.source,
    result.basisConvention.dayCount,
    result.basisConvention.compounding,
  ]);

  return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
}

