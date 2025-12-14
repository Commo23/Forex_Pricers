/**
 * FX Options Strategy Simulator & Risk Matrix
 * 
 * This simulator has been adapted specifically for foreign exchange (FX) options trading.
 * Key FX-specific features:
 * - Garman-Kohlhagen pricing model for currency options
 * - Black-Scholes fallback option
 * - Dual interest rate support (domestic & foreign rates)
 * - FX forward pricing using interest rate differential
 * - Currency pair management (majors, crosses, others)
 * - FX-specific Monte Carlo simulations with proper drift calculation
 * - Barrier options adapted for FX trading
 * - Comprehensive risk matrix analysis for FX strategies
 * 
 * Calculation Models:
 * - FX Forward: S * exp((r_d - r_f) * t)
 * - FX Options: Garman-Kohlhagen model with domestic/foreign rates
 * - Monte Carlo Drift: (r_d - r_f - 0.5 * σ²) for FX price dynamics
 */

// ===========================
// EXPORTED PRICING FUNCTIONS
// ===========================

// Fonction d'erreur pour les calculs statistiques
export const erf = (x: number): number => {
  const a1 =  0.254829592;
  const a2 = -0.284496736;
  const a3 =  1.421413741;
  const a4 = -1.453152027;
  const a5 =  1.061405429;
  const p  =  0.3275911;
  
  const sign = (x < 0) ? -1 : 1;
  x = Math.abs(x);
  
  const t = 1.0/(1.0 + p*x);
  const y = 1.0 - ((((((a5*t + a4)*t) + a3)*t + a2)*t + a1)*t*Math.exp(-x*x));
  
  return sign*y;
};

// Fonction de distribution normale cumulative
export const CND = (x: number): number => (1 + erf(x / Math.sqrt(2))) / 2;

// FX Forward Pricing Model
export const calculateFXForwardPrice = (S: number, r_d: number, r_f: number, t: number): number => {
  return S * Math.exp((r_d - r_f) * t);
};

// Garman-Kohlhagen FX Option Pricing Model
export const calculateGarmanKohlhagenPrice = (type: string, S: number, K: number, r_d: number, r_f: number, t: number, sigma: number): number => {
  const d1 = (Math.log(S / K) + (r_d - r_f + (sigma * sigma) / 2) * t) / (sigma * Math.sqrt(t));
  const d2 = d1 - sigma * Math.sqrt(t);
  
  if (type === 'call') {
    return S * Math.exp(-r_f * t) * CND(d1) - K * Math.exp(-r_d * t) * CND(d2);
  } else {
    return K * Math.exp(-r_d * t) * CND(-d2) - S * Math.exp(-r_f * t) * CND(-d1);
  }
};

// Vanilla option Monte Carlo pricing
export const calculateVanillaOptionMonteCarlo = (
  optionType: string,
  S: number,      // Current price
  K: number,      // Strike price
  r_d: number,    // Domestic risk-free rate
  r_f: number,    // Foreign risk-free rate 
  t: number,      // Time to maturity in years
  sigma: number,  // Volatility
  numSimulations: number = 1000 // Number of simulations
): number => {
  let payoffSum = 0;
  
  for (let i = 0; i < numSimulations; i++) {
    // Generate random normal variable (using Box-Muller transform for better accuracy)
    const u1 = Math.random();
    const u2 = Math.random();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    
    // Simulate final FX price using geometric Brownian motion
    const finalPrice = S * Math.exp(
      (r_d - r_f - 0.5 * sigma * sigma) * t + 
      sigma * Math.sqrt(t) * z
    );
    
    // Calculate payoff
    let payoff = 0;
    if (optionType === 'call') {
      payoff = Math.max(finalPrice - K, 0);
    } else if (optionType === 'put') {
      payoff = Math.max(K - finalPrice, 0);
    }
    
    payoffSum += payoff;
  }
  
  // Calculate average payoff and discount to present value
  const averagePayoff = payoffSum / numSimulations;
  const optionPrice = averagePayoff * Math.exp(-r_d * t);
  
  return Math.max(0, optionPrice);
};

// Barrier option Monte Carlo pricing (complete implementation with path generation)
export const calculateBarrierOptionPrice = (
  optionType: string,
  S: number,      // Current price
  K: number,      // Strike price
  r: number,      // Risk-free rate
  t: number,      // Time to maturity in years
  sigma: number,  // Volatility
  barrier: number, // Barrier level
  secondBarrier?: number, // Second barrier for double barrier options
  numSimulations: number = 1000 // Number of simulations
): number => {
  // Generate a simple price path for this specific option
  const numSteps = Math.max(252 * t, 50); // At least 50 steps
  const dt = t / numSteps;
  
  // Generate paths for just this one option
  const paths = [];
  for (let i = 0; i < numSimulations; i++) {
    const path = [S]; // Start with current price
    
    // Simulate price path
    for (let step = 0; step < numSteps; step++) {
      const previousPrice = path[path.length - 1];
      // Generate random normal variable
      const randomWalk = Math.random() * 2 - 1; // Simple approximation of normal distribution
      
      // Update price using geometric Brownian motion
      const nextPrice = previousPrice * Math.exp(
        (r - 0.5 * Math.pow(sigma, 2)) * dt + 
        sigma * Math.sqrt(dt) * randomWalk
      );
      
      path.push(nextPrice);
    }
    
    paths.push(path);
  }
  
  // Use calculatePricesFromPaths to calculate the price
  const optionPrice = calculatePricesFromPaths(
    optionType,
    S,
    K,
    r,
    numSteps, // The final index in the path
    paths,
    barrier,
    secondBarrier
  );

  // S'assurer que le prix de l'option n'est jamais négatif
  return Math.max(0, optionPrice);
};

// Calculate option prices and payoffs from price paths
export const calculatePricesFromPaths = (
  optionType: string, 
  S: number, 
  K: number, 
  r: number, 
  maturityIndex: number,
  paths: number[][],
  barrier?: number,
  secondBarrier?: number
): number => {
  let priceSum = 0;
  const numSimulations = paths.length;
  
  for (let i = 0; i < numSimulations; i++) {
    const path = paths[i];
    const finalPrice = path[maturityIndex];
    let payoff = 0;
    let barrierHit = false;
    
    // Check for barrier events along the path up to maturity
    if (barrier && (optionType.includes('knockout') || optionType.includes('knockin'))) {
      for (let step = 0; step <= maturityIndex; step++) {
        const pathPrice = path[step];
        
        // Check barrier logic based on option type
        const isAboveBarrier = pathPrice >= barrier;
        const isBelowBarrier = pathPrice <= barrier;
        
        // Apply same barrier logic as in the original function
        if (optionType.includes('knockout')) {
          if (optionType.includes('reverse')) {
            if (optionType.includes('put')) {
              // Put Reverse KO: Knocked out if price goes ABOVE barrier
              if (isAboveBarrier) {
                barrierHit = true;
                break;
              }
            } else {
              // Call Reverse KO: Knocked out if price goes BELOW barrier
              if (isBelowBarrier) {
                barrierHit = true;
                break;
              }
            }
          } else if (optionType.includes('double')) {
            // Double KO: Knocked out if price crosses either barrier
            const upperBarrier = Math.max(barrier, secondBarrier || 0);
            const lowerBarrier = Math.min(barrier, secondBarrier || Infinity);
            
            // Vérifier si le prix touche soit la barrière supérieure, soit la barrière inférieure
            // Pour un Call Double KO, l'option est invalidée si le prix monte trop haut ou descend trop bas
            if ((pathPrice >= upperBarrier) || (pathPrice <= lowerBarrier)) {
              barrierHit = true;
              break;
            }
          } else {
            if (optionType.includes('put')) {
              // Put KO: Knocked out if price goes BELOW barrier
              if (isBelowBarrier) {
                barrierHit = true;
                break;
              }
            } else {
              // Call KO: Knocked out if price goes ABOVE barrier
              if (isAboveBarrier) {
                barrierHit = true;
                break;
              }
            }
          }
        } else if (optionType.includes('knockin')) {
          if (optionType.includes('reverse')) {
            if (optionType.includes('put')) {
              // Put Reverse KI: Knocked in if price goes ABOVE barrier
              if (isAboveBarrier) {
                barrierHit = true;
              }
            } else {
              // Call Reverse KI: Knocked in if price goes BELOW barrier
              if (isBelowBarrier) {
                barrierHit = true;
              }
            }
          } else if (optionType.includes('double')) {
            // Double KI: Knocked in if price crosses either barrier
            const upperBarrier = Math.max(barrier, secondBarrier || 0);
            const lowerBarrier = Math.min(barrier, secondBarrier || Infinity);
            if (pathPrice >= upperBarrier || pathPrice <= lowerBarrier) {
              barrierHit = true;
            }
          } else {
            if (optionType.includes('put')) {
              // Put KI: Knocked in if price goes BELOW barrier
              if (isBelowBarrier) {
                barrierHit = true;
              }
            } else {
              // Call KI: Knocked in if price goes ABOVE barrier
              if (isAboveBarrier) {
                barrierHit = true;
              }
            }
          }
        }
      }
    }
    
    // Calculate payoff
    const isCall = optionType.includes('call') || (!optionType.includes('put') && !optionType.includes('swap'));
    const baseOptionPayoff = isCall ? 
      Math.max(0, finalPrice - K) : 
      Math.max(0, K - finalPrice);
    
    if (!barrier) {
      // Standard option
      payoff = baseOptionPayoff;
    } else if (optionType.includes('knockout')) {
      // Knockout option
      // Une fois que la barrière est touchée (barrierHit=true), l'option est invalidée définitivement
      // et le payoff reste à zéro, même si le prix revient dans la zone favorable
      if (!barrierHit) {
        payoff = baseOptionPayoff;
      }
    } else if (optionType.includes('knockin')) {
      // Knockin option
      if (barrierHit) {
        payoff = baseOptionPayoff;
      }
    }
    
    priceSum += payoff;
  }
  
  // Average payoff discounted back to present value
  const t = maturityIndex / (252 * paths[0].length); // Approximate time to maturity
  return (priceSum / numSimulations) * Math.exp(-r * t);
};

// Digital option Monte Carlo pricing (complete implementation)
export const calculateDigitalOptionPrice = (
  optionType: string,
  S: number,      // Current price
  K: number,      // Strike/Barrier level
  r: number,      // Risk-free rate
  t: number,      // Time to maturity
  sigma: number,  // Volatility
  barrier?: number,
  secondBarrier?: number,
  numSimulations: number = 10000,
  rebate: number = 1
): number => {
  // Conversion du rebate en pourcentage
  const rebateDecimal = rebate / 100;
  
  let payoutSum = 0;
  // Amélioration de la précision de la simulation
  const stepsPerDay = 4;
  const totalSteps = Math.max(252 * t * stepsPerDay, 50);
  const dt = t / totalSteps;
  for (let sim = 0; sim < numSimulations; sim++) {
    let price = S;
    let touched = false;
    let touchedSecond = false;
    for (let step = 0; step < totalSteps; step++) {
      const z = Math.sqrt(-2 * Math.log(Math.random())) * Math.cos(2 * Math.PI * Math.random());
      price = price * Math.exp((r - 0.5 * sigma * sigma) * dt + sigma * Math.sqrt(dt) * z);
      switch (optionType) {
        case 'one-touch':
          if (barrier !== undefined && price >= barrier) touched = true;
          break;
        case 'no-touch':
          if (barrier !== undefined && price >= barrier) touched = true;
          break;
        case 'double-touch':
          if (barrier !== undefined && price >= barrier) touched = true;
          if (secondBarrier !== undefined && price <= secondBarrier) touchedSecond = true;
          break;
        case 'double-no-touch':
          if ((barrier !== undefined && price >= barrier) || (secondBarrier !== undefined && price <= secondBarrier)) touched = true;
          break;
        case 'range-binary':
          if (barrier !== undefined && K !== undefined && price >= K && price <= barrier) touched = true;
          break;
        case 'outside-binary':
          if (barrier !== undefined && K !== undefined && (price <= K || price >= barrier)) touched = true;
          break;
      }
    }
    switch (optionType) {
      case 'one-touch':
        if (touched) payoutSum += rebateDecimal;
        break;
      case 'no-touch':
        if (!touched) payoutSum += rebateDecimal;
        break;
      case 'double-touch':
        if (touched || touchedSecond) payoutSum += rebateDecimal;
        break;
      case 'double-no-touch':
        if (!touched) payoutSum += rebateDecimal;
        break;
      case 'range-binary':
        if (touched) payoutSum += rebateDecimal;
        break;
      case 'outside-binary':
        if (touched) payoutSum += rebateDecimal;
        break;
    }
  }
  // Retourner le prix sans facteur d'échelle arbitraire
  return Math.exp(-r * t) * (payoutSum / numSimulations);
};

// Barrier option closed form pricing (complete VBA implementation)
export const calculateBarrierOptionClosedForm = (
  optionType: string,
  S: number,      // Current price
  K: number,      // Strike price
  r: number,      // Risk-free rate
  t: number,      // Time to maturity in years
  sigma: number,  // Volatility
  barrier: number, // Barrier level
  secondBarrier?: number, // Second barrier for double barrier options
  r_f: number = 0 // Foreign risk-free rate (not used in this implementation)
): number => {
  // Paramètres fondamentaux selon les notations du code VBA
  const b = r;  // Cost of carry (peut être ajusté pour dividendes)
  const v = sigma; // Pour garder la même notation que le code VBA
  const T = t;    // Pour garder la même notation que le code VBA
  const barrierOptionSimulations = 1000; // Default simulations
  
  // PARTIE 1: Options à barrière simple
  if (!optionType.includes('double')) {
    // Calcul des paramètres de base
    const mu = (b - v**2/2) / (v**2);
    const lambda = Math.sqrt(mu**2 + 2*r/(v**2));
    
    // Paramètres pour les options à barrière simple selon le code VBA
    const X = K; // Le strike price
    const H = barrier; // La barrière
    
    const X1 = Math.log(S/X) / (v * Math.sqrt(T)) + (1 + mu) * v * Math.sqrt(T);
    const X2 = Math.log(S/H) / (v * Math.sqrt(T)) + (1 + mu) * v * Math.sqrt(T);
    const y1 = Math.log(H**2/(S*X)) / (v * Math.sqrt(T)) + (1 + mu) * v * Math.sqrt(T);
    const y2 = Math.log(H/S) / (v * Math.sqrt(T)) + (1 + mu) * v * Math.sqrt(T);
    const Z = Math.log(H/S) / (v * Math.sqrt(T)) + lambda * v * Math.sqrt(T);
    
    // Variables binaires eta et phi selon le type d'option
    let eta = 0, phi = 0;
    let TypeFlag = "";
    
    // Déterminer le TypeFlag basé sur le type d'option
    if (optionType === 'call-knockin' && !optionType.includes('reverse') && H < S) {
      TypeFlag = "cdi"; // Call down-and-in
      eta = 1;
      phi = 1;
    } else if (optionType === 'call-knockin' && !optionType.includes('reverse') && H > S) {
      TypeFlag = "cui"; // Call up-and-in
      eta = -1;
      phi = 1;
    } else if (optionType === 'put-knockin' && !optionType.includes('reverse') && H < S) {
      TypeFlag = "pdi"; // Put down-and-in
      eta = 1;
      phi = -1;
    } else if (optionType === 'put-knockin' && !optionType.includes('reverse') && H > S) {
      TypeFlag = "pui"; // Put up-and-in
      eta = -1;
      phi = -1;
    } else if (optionType === 'call-knockout' && !optionType.includes('reverse') && H < S) {
      TypeFlag = "cdo"; // Call down-and-out
      eta = 1;
      phi = 1;
    } else if (optionType === 'call-knockout' && !optionType.includes('reverse') && H > S) {
      TypeFlag = "cuo"; // Call up-and-out
      eta = -1;
      phi = 1;
    } else if (optionType === 'put-knockout' && !optionType.includes('reverse') && H < S) {
      TypeFlag = "pdo"; // Put down-and-out
      eta = 1;
      phi = -1;
    } else if (optionType === 'put-knockout' && !optionType.includes('reverse') && H > S) {
      TypeFlag = "puo"; // Put up-and-out
      eta = -1;
      phi = -1;
    } else if (optionType === 'call-reverse-knockin') {
      // Équivalent à put-up-and-in
      TypeFlag = "pui";
      eta = -1;
      phi = -1;
    } else if (optionType === 'call-reverse-knockout') {
      // Équivalent à put-up-and-out
      TypeFlag = "puo";
      eta = -1;
      phi = -1;
    } else if (optionType === 'put-reverse-knockin') {
      // Équivalent à call-up-and-in
      TypeFlag = "cui";
      eta = -1;
      phi = 1;
    } else if (optionType === 'put-reverse-knockout') {
      // Équivalent à call-up-and-out
      TypeFlag = "cuo";
      eta = -1;
      phi = 1;
    }
    
    // Si le type d'option n'est pas reconnu, utiliser Monte Carlo
    if (TypeFlag === "") {
      return calculateBarrierOptionPrice(optionType, S, K, r, t, sigma, barrier, secondBarrier, barrierOptionSimulations);
    }
    
    // Calculer les termes f1-f6 selon le code VBA
    const f1 = phi * S * Math.exp((b-r)*T) * CND(phi*X1) - 
              phi * X * Math.exp(-r*T) * CND(phi*X1 - phi*v*Math.sqrt(T));
              
    const f2 = phi * S * Math.exp((b-r)*T) * CND(phi*X2) - 
              phi * X * Math.exp(-r*T) * CND(phi*X2 - phi*v*Math.sqrt(T));
              
    const f3 = phi * S * Math.exp((b-r)*T) * (H/S)**(2*(mu+1)) * CND(eta*y1) - 
              phi * X * Math.exp(-r*T) * (H/S)**(2*mu) * CND(eta*y1 - eta*v*Math.sqrt(T));
              
    const f4 = phi * S * Math.exp((b-r)*T) * (H/S)**(2*(mu+1)) * CND(eta*y2) - 
              phi * X * Math.exp(-r*T) * (H/S)**(2*mu) * CND(eta*y2 - eta*v*Math.sqrt(T));
    
    // K représente le cash rebate, généralement 0 pour les options standards
    const cashRebate = 0;
    
    const f5 = cashRebate * Math.exp(-r*T) * (CND(eta*X2 - eta*v*Math.sqrt(T)) - 
            (H/S)**(2*mu) * CND(eta*y2 - eta*v*Math.sqrt(T)));
            
    const f6 = cashRebate * ((H/S)**(mu+lambda) * CND(eta*Z) + 
            (H/S)**(mu-lambda) * CND(eta*Z - 2*eta*lambda*v*Math.sqrt(T)));
    
    // Calculer le prix selon le TypeFlag et la relation entre X et H
    let optionPrice = 0;
    
    if (X > H) {
      switch (TypeFlag) {
        case "cdi": optionPrice = f3 + f5; break;
        case "cui": optionPrice = f1 + f5; break;
        case "pdi": optionPrice = f2 - f3 + f4 + f5; break;
        case "pui": optionPrice = f1 - f2 + f4 + f5; break;
        case "cdo": optionPrice = f1 - f3 + f6; break;
        case "cuo": optionPrice = f6; break;
        case "pdo": optionPrice = f1 - f2 + f3 - f4 + f6; break;
        case "puo": optionPrice = f2 - f4 + f6; break;
      }
    } else if (X < H) {
      switch (TypeFlag) {
        case "cdi": optionPrice = f1 - f2 + f4 + f5; break;
        case "cui": optionPrice = f2 - f3 + f4 + f5; break;
        case "pdi": optionPrice = f1 + f5; break;
        case "pui": optionPrice = f3 + f5; break;
        case "cdo": optionPrice = f2 - f4 + f6; break;
        case "cuo": optionPrice = f1 - f2 + f3 - f4 + f6; break;
        case "pdo": optionPrice = f6; break;
        case "puo": optionPrice = f1 - f3 + f6; break;
      }
    }
    
    // S'assurer que le prix de l'option n'est jamais négatif
    return Math.max(0, optionPrice);
  }
  // PARTIE 2: Options à double barrière
  else if (secondBarrier) {
    // Variables pour les options à double barrière selon le code VBA
    const X = K; // Strike price
    const L = Math.min(barrier, secondBarrier); // Barrière inférieure
    const U = Math.max(barrier, secondBarrier); // Barrière supérieure
    
    // Paramètres pour les formules de double barrière
    const delta1 = 0; // Taux de croissance des barrières (généralement 0)
    const delta2 = 0; // Taux de dividende (dans notre cas, 0)
    
    // Déterminer le TypeFlag en fonction du type d'option
    let TypeFlag = "";
    if (optionType.includes('call-double-knockout')) {
      TypeFlag = "co"; // Call double-knockout (out)
    } else if (optionType.includes('call-double-knockin')) {
      TypeFlag = "ci"; // Call double-knockin (in)
    } else if (optionType.includes('put-double-knockout')) {
      TypeFlag = "po"; // Put double-knockout (out)
    } else if (optionType.includes('put-double-knockin')) {
      TypeFlag = "pi"; // Put double-knockin (in)
    }
    
    // Si le type n'est pas reconnu, utiliser Monte Carlo
    if (TypeFlag === "") {
      return calculateBarrierOptionPrice(optionType, S, K, r, t, sigma, barrier, secondBarrier, barrierOptionSimulations);
    }
    
    // Calculer les variables F et E selon le code VBA
    const F = U * Math.exp(delta1 * T);
    const E = L * Math.exp(delta1 * T);
    
    let Sum1 = 0;
    let Sum2 = 0;
    
    // Pour les options call double-barrière (ci/co)
    if (TypeFlag === "co" || TypeFlag === "ci") {
      // Somme sur un nombre fini de termes (-5 à 5 dans le code VBA)
      for (let n = -5; n <= 5; n++) {
        const d1 = (Math.log(S * U ** (2 * n) / (X * L ** (2 * n))) + (b + v ** 2 / 2) * T) / (v * Math.sqrt(T));
        const d2 = (Math.log(S * U ** (2 * n) / (F * L ** (2 * n))) + (b + v ** 2 / 2) * T) / (v * Math.sqrt(T));
        const d3 = (Math.log(L ** (2 * n + 2) / (X * S * U ** (2 * n))) + (b + v ** 2 / 2) * T) / (v * Math.sqrt(T));
        const d4 = (Math.log(L ** (2 * n + 2) / (F * S * U ** (2 * n))) + (b + v ** 2 / 2) * T) / (v * Math.sqrt(T));
        
        const mu1 = 2 * (b - delta2 - n * (delta1 - delta2)) / v ** 2 + 1;
        const mu2 = 2 * n * (delta1 - delta2) / v ** 2;
        const mu3 = 2 * (b - delta2 + n * (delta1 - delta2)) / v ** 2 + 1;
        
        Sum1 += (U ** n / L ** n) ** mu1 * (L / S) ** mu2 * (CND(d1) - CND(d2)) - 
              (L ** (n + 1) / (U ** n * S)) ** mu3 * (CND(d3) - CND(d4));
              
        Sum2 += (U ** n / L ** n) ** (mu1 - 2) * (L / S) ** mu2 * (CND(d1 - v * Math.sqrt(T)) - CND(d2 - v * Math.sqrt(T))) - 
              (L ** (n + 1) / (U ** n * S)) ** (mu3 - 2) * (CND(d3 - v * Math.sqrt(T)) - CND(d4 - v * Math.sqrt(T)));
      }
    }
    // Pour les options put double-barrière (pi/po)
    else if (TypeFlag === "po" || TypeFlag === "pi") {
      // Somme sur un nombre fini de termes (-5 à 5 dans le code VBA)
      for (let n = -5; n <= 5; n++) {
        const d1 = (Math.log(S * U ** (2 * n) / (E * L ** (2 * n))) + (b + v ** 2 / 2) * T) / (v * Math.sqrt(T));
        const d2 = (Math.log(S * U ** (2 * n) / (X * L ** (2 * n))) + (b + v ** 2 / 2) * T) / (v * Math.sqrt(T));
        const d3 = (Math.log(L ** (2 * n + 2) / (E * S * U ** (2 * n))) + (b + v ** 2 / 2) * T) / (v * Math.sqrt(T));
        const d4 = (Math.log(L ** (2 * n + 2) / (X * S * U ** (2 * n))) + (b + v ** 2 / 2) * T) / (v * Math.sqrt(T));
        
        const mu1 = 2 * (b - delta2 - n * (delta1 - delta2)) / v ** 2 + 1;
        const mu2 = 2 * n * (delta1 - delta2) / v ** 2;
        const mu3 = 2 * (b - delta2 + n * (delta1 - delta2)) / v ** 2 + 1;
        
        Sum1 += (U ** n / L ** n) ** mu1 * (L / S) ** mu2 * (CND(d1) - CND(d2)) - 
              (L ** (n + 1) / (U ** n * S)) ** mu3 * (CND(d3) - CND(d4));
              
        Sum2 += (U ** n / L ** n) ** (mu1 - 2) * (L / S) ** mu2 * (CND(d1 - v * Math.sqrt(T)) - CND(d2 - v * Math.sqrt(T))) - 
              (L ** (n + 1) / (U ** n * S)) ** (mu3 - 2) * (CND(d3 - v * Math.sqrt(T)) - CND(d4 - v * Math.sqrt(T)));
      }
    }
    
    // Calculer OutValue selon le type d'option
    let OutValue = 0;
    if (TypeFlag === "co" || TypeFlag === "ci") {
      OutValue = S * Math.exp((b - r) * T) * Sum1 - X * Math.exp(-r * T) * Sum2;
    } else if (TypeFlag === "po" || TypeFlag === "pi") {
      OutValue = X * Math.exp(-r * T) * Sum2 - S * Math.exp((b - r) * T) * Sum1;
    }
    
    // Fonction pour calculer le prix Black-Scholes standard
    const GBlackScholes = (type: string, S: number, X: number, T: number, r: number, b: number, v: number) => {
      const d1 = (Math.log(S / X) + (b + v ** 2 / 2) * T) / (v * Math.sqrt(T));
      const d2 = d1 - v * Math.sqrt(T);
      
      if (type === "c") {
        return S * Math.exp((b - r) * T) * CND(d1) - X * Math.exp(-r * T) * CND(d2);
      } else { // type === "p"
        return X * Math.exp(-r * T) * CND(-d2) - S * Math.exp((b - r) * T) * CND(-d1);
      }
    };
    
    // Calculer le prix final selon le TypeFlag (appliquer la relation de parité pour les knockin)
    let optionPrice = 0;
    if (TypeFlag === "co") {
      optionPrice = OutValue;
    } else if (TypeFlag === "po") {
      optionPrice = OutValue;
    } else if (TypeFlag === "ci") {
      // Pour les options knockin, utiliser la relation: knockin + knockout = vanille
      optionPrice = GBlackScholes("c", S, X, T, r, b, v) - OutValue;
    } else if (TypeFlag === "pi") {
      // Pour les options knockin, utiliser la relation: knockin + knockout = vanille
      optionPrice = GBlackScholes("p", S, X, T, r, b, v) - OutValue;
    }
    
    // S'assurer que le prix de l'option n'est jamais négatif
    return Math.max(0, optionPrice);
  }
  
  // Si nous arrivons ici, c'est que le type d'option n'est pas supporté
  return calculateBarrierOptionPrice(optionType, S, K, r, t, sigma, barrier, secondBarrier, barrierOptionSimulations);
};

// Generic option pricing function
export const calculateOptionPrice = (
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
): number => {
  if (type === 'call' || type === 'put') {
    return calculateGarmanKohlhagenPrice(type, S, K, r_d, r_f, t, sigma);
  } else if (type.includes('knockout') || type.includes('knockin')) {
    return calculateBarrierOptionClosedForm(type, S, K, r_d, t, sigma, barrier || 0, secondBarrier, r_f);
  } else {
    return calculateDigitalOptionPrice(type, S, K, r_d, t, sigma, barrier, secondBarrier, numSimulations, rebate || 1);
  }
};

// Implied volatility calculation
export const calculateImpliedVolatility = (
  optionType: string,
  S: number,      // Prix actuel du sous-jacent
  K: number,      // Prix d'exercice
  r_d: number,    // Taux domestique sans risque
  r_f: number,    // Taux étranger sans risque
  t: number,      // Temps jusqu'à maturité en années
  marketPrice: number,  // Prix de l'option observé sur le marché
  tolerance: number = 0.0001, // Précision souhaitée
  maxIterations: number = 100 // Nombre maximum d'itérations
): number => {
  // Pour les options à barrière ou complexes, cette fonction est plus difficile à implémenter
  // Dans ce cas, nous nous limitons aux calls et puts vanille
  if (optionType !== 'call' && optionType !== 'put') {
    return 0; // Retourner une valeur par défaut pour les options non supportées
  }

  // Méthode de Newton-Raphson pour trouver la volatilité implicite
  let sigma = 0.20; // Valeur initiale
  let vega = 0;
  let price = 0;
  let diff = 0;
  let iteration = 0;

  while (iteration < maxIterations) {
    // Calcul du prix avec la volatilité courante
    price = calculateGarmanKohlhagenPrice(optionType, S, K, r_d, r_f, t, sigma);
    
    // Différence entre le prix calculé et le prix observé
    diff = price - marketPrice;
    
    // Vérifier si la précision souhaitée est atteinte
    if (Math.abs(diff) < tolerance) {
      break;
    }
    
    // Calcul de la vega (dérivée du prix par rapport à la volatilité)
    const d1 = (Math.log(S/K) + (r_d - r_f + sigma*sigma/2)*t) / (sigma*Math.sqrt(t));
    vega = S * Math.sqrt(t) * Math.exp(-r_f * t) * (1/Math.sqrt(2*Math.PI)) * Math.exp(-d1*d1/2);
    
    // Mise à jour de sigma selon la méthode de Newton-Raphson
    sigma = sigma - diff / vega;
    
    // Empêcher sigma de devenir négatif ou trop petit
    if (sigma <= 0.001) {
      sigma = 0.001;
    }
    
    // Empêcher sigma de devenir trop grand
    if (sigma > 5) {
      sigma = 5;
    }
    
    iteration++;
  }
  
  // Retourner la volatilité implicite
  return sigma;
};

// Swap pricing
export const calculateSwapPrice = (forwards: number[], times: number[], r: number): number => {
  let sum = 0;
  for (let i = 0; i < forwards.length; i++) {
    sum += forwards[i] * Math.exp(-r * times[i]);
  }
  return sum / forwards.length;
};

// Time to maturity calculation utility
export const calculateTimeToMaturity = (maturityDate: string, valuationDate: string): number => {
  const maturity = new Date(maturityDate + 'T24:00:00Z');
  const valuation = new Date(valuationDate + 'T00:00:00Z');
  const diffTime = Math.abs(maturity.getTime() - valuation.getTime());
  return diffTime / (365.25 * 24 * 60 * 60 * 1000);
};

// Strategy payoff calculation utility
export const calculateStrategyPayoffAtPrice = (components: any[], price: number, spotPrice: number): number => {
  let totalPayoff = 0;
  
  components.forEach(comp => {
    const strike = comp.strikeType === 'percent' 
      ? spotPrice * (comp.strike / 100) 
      : comp.strike;
    
    let payoff = 0;
    
    if (comp.type === 'swap') {
      // For swaps, the payoff is the difference between the price and the strike
      payoff = (price - strike);
    } else if (comp.type.includes('knockout') || comp.type.includes('knockin')) {
      // Handle barrier options
      const barrier = comp.barrierType === 'percent' 
        ? spotPrice * (comp.barrier / 100) 
        : comp.barrier;
      
      const secondBarrier = comp.type.includes('double') 
        ? (comp.barrierType === 'percent' 
          ? spotPrice * (comp.secondBarrier / 100) 
          : comp.secondBarrier) 
        : undefined;
        
      // Determine if the barrier is breached
      let isBarrierBroken = false;
      
      if (comp.type.includes('double')) {
        // Double barrier options
        const upperBarrier = Math.max(barrier, secondBarrier || 0);
        const lowerBarrier = Math.min(barrier, secondBarrier || Infinity);
        isBarrierBroken = price >= upperBarrier || price <= lowerBarrier;
      } else if (comp.type.includes('reverse')) {
        // Reverse barrier options
        if (comp.type.includes('put')) {
          // Put Reverse: barrier breached if price is above
          isBarrierBroken = price >= barrier;
        } else {
          // Call Reverse: barrier breached if price is below
          isBarrierBroken = price <= barrier;
        }
      } else {
        // Standard barrier options
        if (comp.type.includes('put')) {
          // Put: barrier breached if price is below
          isBarrierBroken = price <= barrier;
        } else {
          // Call: barrier breached if price is above
          isBarrierBroken = price >= barrier;
        }
      }
      
      // Calculate the base payoff
      const isCall = comp.type.includes('call');
      const basePayoff = isCall 
        ? Math.max(0, price - strike) 
        : Math.max(0, strike - price);
      
      // Determine the final payoff according to the option type
      if (comp.type.includes('knockout')) {
        // For knock-out options, the payoff is zero if the barrier is breached
        payoff = isBarrierBroken ? 0 : basePayoff;
      } else { // knockin
        // For knock-in options, the payoff is non-zero only if the barrier is breached
        payoff = isBarrierBroken ? basePayoff : 0;
      }
    } else if (comp.type === 'call') {
      // Standard call option
      payoff = Math.max(0, price - strike);
    } else if (comp.type === 'put') {
      // Standard put option
      payoff = Math.max(0, strike - price);
    } else if (comp.type === 'forward') {
      // Forward payoff
      payoff = price - strike;
    } else if ([
      'one-touch', 'no-touch', 'double-touch', 'double-no-touch', 'range-binary', 'outside-binary'
    ].includes(comp.type)) {
      // Options digitales : payoff = rebate si condition atteinte
      const barrier = comp.barrierType === 'percent' ? spotPrice * (comp.barrier || 0) / 100 : (comp.barrier || 0);
      const secondBarrier = comp.barrierType === 'percent' ? spotPrice * (comp.secondBarrier || 0) / 100 : (comp.secondBarrier || 0);
      const rebate = (comp.rebate || 1) / 100;
      let conditionMet = false;
      switch(comp.type) {
        case 'one-touch':
          conditionMet = price >= barrier;
          break;
        case 'no-touch':
          conditionMet = price < barrier;
          break;
        case 'double-touch':
          conditionMet = price >= barrier || price <= secondBarrier;
          break;
        case 'double-no-touch':
          conditionMet = price < barrier && price > secondBarrier;
          break;
        case 'range-binary':
          conditionMet = price <= barrier && price >= strike;
          break;
        case 'outside-binary':
          conditionMet = price > barrier || price < strike;
          break;
      }
      payoff = conditionMet ? rebate : 0;
    }
    
    // Add the payoff to the total taking into account the quantity
    totalPayoff += payoff * (comp.quantity / 100);
  });
  
  return totalPayoff;
};

import React, { useState, useEffect, useCallback } from 'react';
import StrategyImportService from '../services/StrategyImportService';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Plus, Trash2, Save, X, AlertTriangle, Table, PlusCircle, Trash, Upload, BarChart3, Calculator, Shield, Calendar, RefreshCw } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link } from 'react-router-dom';
import { CalculatorState, CustomPeriod } from '@/types/CalculatorState';
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import MonteCarloVisualization from '../components/MonteCarloVisualization';
import PayoffChart from '../components/PayoffChart';
import { SimulationData } from '../components/MonteCarloVisualization';
import { Switch } from "@/components/ui/switch";
import { v4 as uuidv4 } from 'uuid';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import ZeroCostStrategies from '@/components/ZeroCostStrategies';
import ZeroCostTab from '@/components/ZeroCostTab';
import { PricingService } from '@/services/PricingService';
import ExchangeRateService from '@/services/ExchangeRateService';

// Currency Pair interface
interface CurrencyPair {
  symbol: string;
  name: string;
  base: string;
  quote: string;
  category: 'majors' | 'crosses' | 'others';
  defaultSpotRate: number; // Default spot rate for this currency pair
}

interface FXStrategyParams {
  startDate: string;           // Hedging Start Date (renamed from startDate)
  strategyStartDate: string;   // Strategy Start Date (new field)
  monthsToHedge: number;
  domesticRate: number;
  foreignRate: number;
  totalVolume: number; // Keep for backward compatibility
  baseVolume: number;   // Volume in base currency
  quoteVolume: number;  // Volume in quote currency
  spotPrice: number;
  currencyPair: CurrencyPair;
  useCustomPeriods: boolean;
  customPeriods: CustomPeriod[];
  volumeType: 'receivable' | 'payable'; // Type de volume: receivable ou payable
  // Legacy field for backward compatibility
  interestRate?: number;
}

export interface StressTestScenario {
  name: string;
  description: string;
  volatility: number;
  drift: number;
  priceShock: number;
  forwardBasis?: number;
  realBasis?: number;
  isCustom?: boolean;
  isEditable?: boolean;
  isHistorical?: boolean;
  historicalData?: HistoricalDataPoint[];
}

export interface StrategyComponent {
  type: 'call' | 'put' | 'swap' | 'forward' | 
         'call-knockout' | 'call-reverse-knockout' | 'call-double-knockout' | 
         'put-knockout' | 'put-reverse-knockout' | 'put-double-knockout' |
         'call-knockin' | 'call-reverse-knockin' | 'call-double-knockin' |
         'put-knockin' | 'put-reverse-knockin' | 'put-double-knockin' |
         'one-touch' | 'double-touch' | 'no-touch' | 'double-no-touch' |
         'range-binary' | 'outside-binary';
  strike: number;
  strikeType: 'percent' | 'absolute';
  volatility: number;
  quantity: number;
  barrier?: number;           // Primary barrier level
  secondBarrier?: number;     // Secondary barrier for double barriers
  barrierType?: 'percent' | 'absolute';  // Whether barrier is % of spot or absolute value
  rebate?: number;            // Rebate amount for digital options
  timeToPayoff?: number;      // Time to payoff for one-touch options (in years)
  dynamicStrike?: {
    method: 'equilibrium';
    balanceWithIndex: number;
    volatilityAdjustment?: number;
  };
}

export interface Result {
  date: string;
  timeToMaturity: number;
  forward: number;
  realPrice: number;
  optionPrices: Array<{
    type: string;
    price: number;
    quantity: number;
    strike: number;
    label: string;
    dynamicStrikeInfo?: {
      calculatedStrike: number;
      calculatedStrikePercent: string;
      forwardRate: number;
      timeToMaturity: number;
    };
  }>;
  strategyPrice: number;
  totalPayoff: number;
  monthlyVolume: number;
  hedgedCost: number;
  unhedgedCost: number;
  deltaPnL: number;
}

interface SavedScenario {
  id: string;
  name: string;
  timestamp: number;
  params: {
    startDate: string;           // Hedging Start Date
    strategyStartDate: string;   // Strategy Start Date
    monthsToHedge: number;
    interestRate: number;
    domesticRate?: number;
    foreignRate?: number;
    totalVolume: number;
    baseVolume?: number;
    quoteVolume?: number;
    spotPrice: number;
    currencyPair?: CurrencyPair;
    useCustomPeriods?: boolean;
    customPeriods?: CustomPeriod[];
    volumeType?: 'receivable' | 'payable'; // Type de volume
  };
  strategy: StrategyComponent[];
  results: Result[];
  payoffData: Array<{ price: number; payoff: number }>;
  stressTest?: StressTestScenario;
  // Ajouter les données additionnelles du tableau
  useImpliedVol: boolean;
  impliedVolatilities: OptionImpliedVolatility;
  manualForwards: {[key: string]: number};
  realPrices: {[key: string]: number};
  customOptionPrices?: {[key: string]: {[optionKey: string]: number}};
}

interface ImpliedVolatility {
  [key: string]: number; // Format: "YYYY-MM": volatility
}

// New interface for per-option implied volatility
export interface OptionImpliedVolatility {
  [key: string]: {   // Format: "YYYY-MM"
    [optionIndex: string]: number;  // Format: "optionType-index": volatility
    global?: number;  // Global volatility for the month (backward compatibility)
  };
}

interface HistoricalDataPoint {
  date: string;
  price: number;
}

interface MonthlyStats {
  month: string;
  avgPrice: number;
  volatility: number | null;
  dataPoints?: number;
  calculationMethod?: string;
}

interface PriceRange {
  min: number;
  max: number;
  probability: number;
}

interface RiskMatrixResult {
  strategy: StrategyComponent[];
  coverageRatio: number;
  costs: {[key: string]: number};
  differences: {[key: string]: number};
  hedgingCost: number;
  name: string; // Ajout de la propriété name
}

// Ajouter cette interface pour les matrices de risque sauvegardées
interface SavedRiskMatrix {
  id: string;
  name: string;
  timestamp: number;
  priceRanges: PriceRange[];
  strategies: {
    components: StrategyComponent[];
    coverageRatio: number;
    name: string;
  }[];
  results: RiskMatrixResult[];
}

const DEFAULT_SCENARIOS = {
  base: {
    name: "Base Case",
    description: "Normal market conditions",
    volatility: 0.2,
    drift: 0.01,
    priceShock: 0,
    forwardBasis: 0,
    isEditable: true
  },
  highVol: {
    name: "High Volatility",
    description: "Double volatility scenario",
    volatility: 0.4,
    drift: 0.01,
    priceShock: 0,
    forwardBasis: 0,
    isEditable: true
  },
  crash: {
    name: "Market Crash",
    description: "High volatility, negative drift, price shock",
    volatility: 0.5,
    drift: -0.03,
    priceShock: -0.2,
    forwardBasis: 0,
    isEditable: true
  },
  bull: {
    name: "Bull Market",
    description: "Low volatility, positive drift, upward shock",
    volatility: 0.15,
    drift: 0.02,
    priceShock: 0.1,
    forwardBasis: 0,
    isEditable: true
  }
};

// Currency Pairs Database with current market rates (approximate)
export const CURRENCY_PAIRS: CurrencyPair[] = [
  // Major Pairs
  { symbol: "EUR/USD", name: "Euro/US Dollar", base: "EUR", quote: "USD", category: "majors", defaultSpotRate: 1.0850 },
  { symbol: "GBP/USD", name: "British Pound/US Dollar", base: "GBP", quote: "USD", category: "majors", defaultSpotRate: 1.2650 },
  { symbol: "USD/JPY", name: "US Dollar/Japanese Yen", base: "USD", quote: "JPY", category: "majors", defaultSpotRate: 149.50 },
  { symbol: "USD/CHF", name: "US Dollar/Swiss Franc", base: "USD", quote: "CHF", category: "majors", defaultSpotRate: 0.8850 },
  { symbol: "AUD/USD", name: "Australian Dollar/US Dollar", base: "AUD", quote: "USD", category: "majors", defaultSpotRate: 0.6580 },
  { symbol: "USD/CAD", name: "US Dollar/Canadian Dollar", base: "USD", quote: "CAD", category: "majors", defaultSpotRate: 1.3650 },
  { symbol: "NZD/USD", name: "New Zealand Dollar/US Dollar", base: "NZD", quote: "USD", category: "majors", defaultSpotRate: 0.6020 },
  
  // Cross Rates (Non-USD pairs)
  { symbol: "EUR/GBP", name: "Euro/British Pound", base: "EUR", quote: "GBP", category: "crosses", defaultSpotRate: 0.8580 },
  { symbol: "EUR/JPY", name: "Euro/Japanese Yen", base: "EUR", quote: "JPY", category: "crosses", defaultSpotRate: 162.25 },
  { symbol: "GBP/JPY", name: "British Pound/Japanese Yen", base: "GBP", quote: "JPY", category: "crosses", defaultSpotRate: 189.15 },
  { symbol: "EUR/CHF", name: "Euro/Swiss Franc", base: "EUR", quote: "CHF", category: "crosses", defaultSpotRate: 0.9605 },
  { symbol: "EUR/AUD", name: "Euro/Australian Dollar", base: "EUR", quote: "AUD", category: "crosses", defaultSpotRate: 1.6485 },
  { symbol: "GBP/CHF", name: "British Pound/Swiss Franc", base: "GBP", quote: "CHF", category: "crosses", defaultSpotRate: 1.1195 },
  { symbol: "AUD/JPY", name: "Australian Dollar/Japanese Yen", base: "AUD", quote: "JPY", category: "crosses", defaultSpotRate: 98.40 },
  { symbol: "CAD/JPY", name: "Canadian Dollar/Japanese Yen", base: "CAD", quote: "JPY", category: "crosses", defaultSpotRate: 109.52 },
  { symbol: "CHF/JPY", name: "Swiss Franc/Japanese Yen", base: "CHF", quote: "JPY", category: "crosses", defaultSpotRate: 169.01 },
];

// State pour les paires de devises personnalisées
const Index = () => {
  const { toast } = useToast();
  
  // Get ExchangeRateService instance for real-time rate fetching
  const exchangeRateService = React.useMemo(() => {
    return ExchangeRateService.getInstance();
  }, []);
  
  const [customCurrencyPairs, setCustomCurrencyPairs] = useState<CurrencyPair[]>(() => {
    const savedPairs = localStorage.getItem('customCurrencyPairs');
    return savedPairs ? JSON.parse(savedPairs) : [];
  });
  
  // Sync custom pairs from localStorage (shared with ForexMarket)
  React.useEffect(() => {
    const handleStorageChange = () => {
      try {
        const savedPairs = localStorage.getItem('customCurrencyPairs');
        if (savedPairs) {
          const pairs = JSON.parse(savedPairs);
          setCustomCurrencyPairs(pairs);
        }
      } catch (error) {
        console.warn('Error syncing custom currency pairs:', error);
      }
    };
    
    // Listen for storage changes
    window.addEventListener('storage', handleStorageChange);
    
    // Also check periodically (in case changes are made in same window)
    const interval = setInterval(handleStorageChange, 1000);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(interval);
    };
  }, []);
  
  // Function to fetch real-time rate from Market Data
  const fetchRealTimeRate = async (currencyPair: CurrencyPair): Promise<number | null> => {
    try {
      const { base, quote } = currencyPair;
      
      // Get exchange rates from API
      const exchangeData = await exchangeRateService.getExchangeRates('USD');
      const rates = exchangeData.rates;
      
      // Calculate the cross rate for the selected pair
      let rate: number;
      
      if (base === 'USD') {
        // Direct rate: USD/XXX
        rate = rates[quote] || currencyPair.defaultSpotRate;
      } else if (quote === 'USD') {
        // Inverted rate: XXX/USD = 1 / (USD/XXX)
        rate = rates[base] ? 1 / rates[base] : currencyPair.defaultSpotRate;
      } else {
        // Cross rate: BASE/QUOTE = (USD/QUOTE) / (USD/BASE)
        const baseRate = rates[base] || 1;
        const quoteRate = rates[quote] || 1;
        rate = quoteRate / baseRate;
      }
      
      return rate;
    } catch (error) {
      console.error('Error fetching real-time rate:', error);
      return null;
    }
  };

  // Fonction pour sauvegarder les paires personnalisées
  const saveCustomCurrencyPairs = (pairs: CurrencyPair[]) => {
    localStorage.setItem('customCurrencyPairs', JSON.stringify(pairs));
    setCustomCurrencyPairs(pairs);
  };

  // Fonction pour ajouter une paire de devise manuellement
  const addCustomCurrencyPair = (newPair: CurrencyPair) => {
    const updated = [...customCurrencyPairs, newPair];
    saveCustomCurrencyPairs(updated);
  };

  // Add state for active tab
  const [activeTab, setActiveTab] = useState(() => {
    try {
    const savedState = localStorage.getItem('calculatorState');
      return savedState ? JSON.parse(savedState).activeTab || 'parameters' : 'parameters';
    } catch (error) {
      console.warn('Error parsing activeTab from localStorage:', error);
      return 'parameters';
    }
  });

  // Basic parameters state
  const [params, setParams] = useState(() => {
    const defaultParams = {
      startDate: new Date().toISOString().split('T')[0],           // Hedging Start Date
      strategyStartDate: new Date().toISOString().split('T')[0],   // Strategy Start Date (same as hedging start by default)
      monthsToHedge: 12,
      interestRate: 2.0, // Domestic rate for backward compatibility
      domesticRate: 1.0, // EUR rate
      foreignRate: 0.5, // USD rate
      totalVolume: 10000000,
      baseVolume: 10000000, // Default base volume
      quoteVolume: 10000000 * CURRENCY_PAIRS[0].defaultSpotRate, // Calculated quote volume
      spotPrice: CURRENCY_PAIRS[0].defaultSpotRate, // Default to EUR/USD spot rate
      currencyPair: CURRENCY_PAIRS[0], // Default to EUR/USD
      useCustomPeriods: false,
      customPeriods: [],
      volumeType: 'receivable' // Default to receivable
    };
    
    try {
      const savedState = localStorage.getItem('calculatorState');
    if (savedState) {
      const savedParams = JSON.parse(savedState).params;
      // Ensure backward compatibility - calculate missing volumes if needed
      if (!savedParams.baseVolume) {
        savedParams.baseVolume = savedParams.totalVolume || 10000000;
      }
      if (!savedParams.quoteVolume) {
        savedParams.quoteVolume = (savedParams.totalVolume || 10000000) * (savedParams.spotPrice || 1.0850);
      }
      // Ensure backward compatibility - add strategyStartDate if missing
      if (!savedParams.strategyStartDate) {
        savedParams.strategyStartDate = savedParams.startDate || new Date().toISOString().split('T')[0];
      }
      // Ensure backward compatibility - add volumeType if missing
      if (!savedParams.volumeType) {
        savedParams.volumeType = 'receivable'; // Default to receivable
      }
      return savedParams;
      }
    } catch (error) {
      console.warn('Error parsing params from localStorage:', error);
      // Clear corrupted data
      try {
        localStorage.removeItem('calculatorState');
      } catch (e) {
        console.warn('Could not clear corrupted localStorage:', e);
      }
    }
    
    return defaultParams;
  });

  // Keep track of initial spot price
  const [initialSpotPrice, setInitialSpotPrice] = useState<number>(params.spotPrice);

  // Strategy components state
  const [strategy, setStrategy] = useState(() => {
    try {
    const savedState = localStorage.getItem('calculatorState');
      return savedState ? JSON.parse(savedState).strategy || [] : [];
    } catch (error) {
      console.warn('Error parsing strategy from localStorage:', error);
      return [];
    }
  });

  // Results state - complete results for calculations
  const [results, setResults] = useState(() => {
    try {
    const savedState = localStorage.getItem('calculatorState');
      return savedState ? JSON.parse(savedState).results || null : null;
    } catch (error) {
      console.warn('Error parsing results from localStorage:', error);
      return null;
    }
  });

  // Display results state - filtered results for user interface
  const [displayResults, setDisplayResults] = useState(() => {
    try {
    const savedState = localStorage.getItem('calculatorState');
      const fullResults = savedState ? JSON.parse(savedState).results || null : null;
    // Initialize with full results, will be filtered when calculateResults runs
    return fullResults;
    } catch (error) {
      console.warn('Error parsing displayResults from localStorage:', error);
      return null;
    }
  });

  // Manual forward prices state
  const [manualForwards, setManualForwards] = useState(() => {
    try {
    const savedState = localStorage.getItem('calculatorState');
      return savedState ? JSON.parse(savedState).manualForwards || {} : {};
    } catch (error) {
      console.warn('Error parsing manualForwards from localStorage:', error);
      return {};
    }
  });

  // Real prices state
  const [realPrices, setRealPrices] = useState(() => {
    try {
    const savedState = localStorage.getItem('calculatorState');
      return savedState ? JSON.parse(savedState).realPrices || {} : {};
    } catch (error) {
      console.warn('Error parsing realPrices from localStorage:', error);
      return {};
    }
  });

  // Payoff data state
  const [payoffData, setPayoffData] = useState(() => {
    try {
    const savedState = localStorage.getItem('calculatorState');
      return savedState ? JSON.parse(savedState).payoffData || [] : [];
    } catch (error) {
      console.warn('Error parsing payoffData from localStorage:', error);
      return [];
    }
  });

  // Real prices simulation parameters
  const [realPriceParams, setRealPriceParams] = useState<{
    useSimulation: boolean;
    volatility: number;
    drift: number;
    numSimulations: number;
  }>({
      useSimulation: false,
      volatility: 0.3,
    drift: 0,
      numSimulations: 1000
  });

  const [barrierOptionSimulations, setBarrierOptionSimulations] = useState<number>(() => {
    const savedState = localStorage.getItem('calculatorState');
    return savedState ? JSON.parse(savedState).barrierOptionSimulations || 1000 : 1000;
  });
  
  // Legacy: useClosedFormBarrier is now handled by barrierPricingModel

  // Month names in English
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June', 
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  // Custom scenario state
  const [customScenario, setCustomScenario] = useState<StressTestScenario>(() => {
    const savedState = localStorage.getItem('calculatorState');
    return savedState ? JSON.parse(savedState).customScenario : {
      name: "Custom Case",
      description: "User-defined scenario",
      volatility: 0.2,
      drift: 0.01,
      priceShock: 0,
      forwardBasis: 0,
      isCustom: true
    };
  });

  // Stress Test Scenarios - Updated to reflect historical FX crisis scenarios
  const [stressTestScenarios, setStressTestScenarios] = useState<Record<string, StressTestScenario>>(() => {
    const savedState = localStorage.getItem('calculatorState');
    // Force loading of new scenarios by checking if we have all expected scenarios
    const defaultScenarios = {
      base: {
        name: "Base Case",
        description: "Normal market conditions - typical FX volatility of 10-15%",
        volatility: 0.12,
        drift: 0.005,
        priceShock: 0,
        forwardBasis: 0,
        isEditable: true,
        isHistorical: false
      },
      
      // Historical Crisis Scenarios
      gfc2008: {
        name: "Global Financial Crisis (2008)",
        description: "Based on 2008 crisis: extreme volatility, flight to USD/CHF/JPY safe havens",
        volatility: 0.35,
        drift: -0.015,
        priceShock: -0.12,
        forwardBasis: 0.008,
        isEditable: true,
        isHistorical: true
      },
      
      blackWednesday: {
        name: "Black Wednesday (1992)",
        description: "ERM crisis: GBP devaluation, central bank intervention failure",
        volatility: 0.45,
        drift: -0.025,
        priceShock: -0.15,
        forwardBasis: 0.015,
        isEditable: true,
        isHistorical: true
      },
      
      asianCrisis: {
        name: "Asian Financial Crisis (1997-98)",
        description: "EM currency collapse: massive capital outflows, currency pegs breaking",
        volatility: 0.55,
        drift: -0.035,
        priceShock: -0.25,
        forwardBasis: 0.025,
        isEditable: true,
        isHistorical: true
      },
      
      brexit2016: {
        name: "Brexit Vote (2016)",
        description: "Political risk shock: sudden devaluation, risk-off sentiment",
        volatility: 0.28,
        drift: -0.012,
        priceShock: -0.08,
        forwardBasis: 0.005,
        isEditable: true,
        isHistorical: true
      },
      
      covid2020: {
        name: "COVID-19 Pandemic (2020)",
        description: "Global health crisis: extreme volatility, central bank intervention",
        volatility: 0.32,
        drift: -0.008,
        priceShock: -0.10,
        forwardBasis: 0.003,
        isEditable: true,
        isHistorical: true
      },
      
      swissFrancShock: {
        name: "Swiss Franc Shock (2015)",
        description: "SNB abandon peg: sudden CHF appreciation, market disruption",
        volatility: 0.40,
        drift: 0.010,
        priceShock: 0.18,
        forwardBasis: -0.008,
        isEditable: true,
        isHistorical: true
      },
      
      // ECB/Fed Stress Test Scenarios
      adverseECB: {
        name: "ECB Adverse Scenario",
        description: "Based on ECB stress testing: eurozone recession, banking stress",
        volatility: 0.25,
        drift: -0.020,
        priceShock: -0.09,
        forwardBasis: 0.012,
        isEditable: true,
        isHistorical: false
      },
      
      fedSCAR: {
        name: "Fed CCAR Adverse",
        description: "Fed stress test: severe US recession, global spillover effects",
        volatility: 0.30,
        drift: -0.018,
        priceShock: -0.11,
        forwardBasis: 0.010,
        isEditable: true,
        isHistorical: false
      },
      
      // Contemporary Risk Scenarios  
      centralBankDivergence: {
        name: "Central Bank Policy Divergence",
        description: "Extreme monetary policy divergence causing capital flow reversals",
        volatility: 0.22,
        drift: -0.010,
        priceShock: -0.06,
        forwardBasis: 0.018,
        isEditable: true,
        isHistorical: false
      },
      
      emergingMarketCrisis: {
        name: "Emerging Market Crisis",
        description: "Major EM economy crisis with contagion to developed markets",
        volatility: 0.38,
        drift: -0.022,
        priceShock: -0.14,
        forwardBasis: 0.020,
        isEditable: true,
        isHistorical: false
      },
      
      tradeWar: {
        name: "Trade War Escalation",
        description: "Severe trade tensions leading to currency manipulation concerns",
        volatility: 0.26,
        drift: -0.013,
        priceShock: -0.07,
        forwardBasis: 0.008,
        isEditable: true,
        isHistorical: false
      },
      
      inflationShock: {
        name: "Inflation Shock",
        description: "Unexpected inflation surge forcing aggressive central bank action",
        volatility: 0.24,
        drift: 0.008,
        priceShock: 0.05,
        forwardBasis: 0.015,
        isEditable: true,
        isHistorical: false
      },
      
      // Tail Risk Scenarios
      reserveCurrencyCrisis: {
        name: "Reserve Currency Crisis",
        description: "Loss of confidence in major reserve currency (USD/EUR)",
        volatility: 0.60,
        drift: -0.040,
        priceShock: -0.30,
        forwardBasis: 0.035,
        isEditable: true,
        isHistorical: false
      },
      
      custom: {
        name: "Custom Scenario",
        description: "User-defined stress scenario",
        volatility: 0.15,
        drift: 0.005,
        priceShock: 0,
        forwardBasis: 0,
        isCustom: true,
        isEditable: true,
        isHistorical: false
      }
    };
    
    // Always return default scenarios to ensure we have all the new ones
    if (savedState) {
      const parsed = JSON.parse(savedState);
      // Check if we have all the new scenarios, if not, use defaults
      const savedScenarios = parsed.stressTestScenarios || {};
      const expectedScenarios = ['base', 'gfc2008', 'blackWednesday', 'asianCrisis', 'brexit2016', 'covid2020', 'swissFrancShock', 'adverseECB', 'fedSCAR', 'centralBankDivergence', 'emergingMarketCrisis', 'tradeWar', 'inflationShock', 'reserveCurrencyCrisis', 'custom'];
      
      const hasAllScenarios = expectedScenarios.every(key => savedScenarios[key]);
      
      if (hasAllScenarios) {
        return savedScenarios;
      }
    }
    
    return defaultScenarios;
  });

  // Add this new state
  const [activeStressTest, setActiveStressTest] = useState<string | null>(null);
  
  // Function to get stress test summary stats
  const getStressTestSummary = () => {
    if (!activeStressTest || !stressTestScenarios[activeStressTest]) return null;
    
    const scenario = stressTestScenarios[activeStressTest];
    return {
      name: scenario.name,
      type: scenario.isHistorical ? 'Historical' : 
            ['adverseECB', 'fedSCAR'].includes(activeStressTest) ? 'Regulatory' : 
            activeStressTest === 'reserveCurrencyCrisis' ? 'Tail Risk' : 'Contemporary',
      riskLevel: Math.abs(scenario.priceShock) > 0.15 ? 'High' : 
                 Math.abs(scenario.priceShock) > 0.05 ? 'Medium' : 'Low',
      severity: {
        volatility: scenario.volatility,
        shock: scenario.priceShock,
        drift: scenario.drift
      }
    };
  };

  // Add state for showing inputs
  const [showInputs, setShowInputs] = useState<Record<string, boolean>>({});

  // Toggle inputs visibility for a scenario
  const toggleInputs = (key: string) => {
    setShowInputs(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  // Add these new states
  const [useImpliedVol, setUseImpliedVol] = useState(false);
  const [impliedVolatilities, setImpliedVolatilities] = useState<OptionImpliedVolatility>({});

  // État pour les prix d'options personnalisés
  const [useCustomOptionPrices, setUseCustomOptionPrices] = useState(false);
  const [customOptionPrices, setCustomOptionPrices] = useState<{[key: string]: {[key: string]: number}}>({});
  
  // État pour les strikes personnalisés
  const [customStrikes, setCustomStrikes] = useState<{[key: string]: {[key: string]: number}}>({});
  
  // Historical data and monthly stats
  const [historicalData, setHistoricalData] = useState<HistoricalDataPoint[]>([]);
  const [monthlyStats, setMonthlyStats] = useState<MonthlyStats[]>([]);
  const [showHistoricalData, setShowHistoricalData] = useState(true);
  const [showMonthlyStats, setShowMonthlyStats] = useState(true);

  // Function to generate FX-appropriate price ranges based on current currency pair
  const generateFXPriceRanges = (currencyPair: CurrencyPair, spotPrice: number): PriceRange[] => {
    // Determine volatility tier based on currency pair
    let volatilityTier: 'low' | 'medium' | 'high' = 'medium';
    
    if (['EUR/USD', 'USD/JPY', 'GBP/USD', 'USD/CHF'].includes(currencyPair.symbol)) {
      volatilityTier = 'low'; // Major pairs - lower volatility
    } else if (['EUR/GBP', 'EUR/JPY', 'GBP/JPY', 'EUR/CHF', 'GBP/CHF', 'CHF/JPY'].includes(currencyPair.symbol)) {
      volatilityTier = 'medium'; // Cross pairs - medium volatility
    } else {
      volatilityTier = 'high'; // Exotic pairs - higher volatility
    }
    
    // Define movement ranges based on volatility tier
    const movements = {
      low: [-0.08, -0.04, 0.04, 0.08], // ±4-8% for majors
      medium: [-0.12, -0.06, 0.06, 0.12], // ±6-12% for crosses
      high: [-0.20, -0.10, 0.10, 0.20] // ±10-20% for exotics
    };
    
    const rangeMoves = movements[volatilityTier];
    
    // Generate price levels around current spot
    const prices = rangeMoves.map(move => spotPrice * (1 + move));
    prices.sort((a, b) => a - b);
    
    // Create ranges with appropriate probabilities (normal distribution-like)
    return [
      { 
        min: parseFloat(prices[0].toFixed(4)), 
        max: parseFloat(prices[1].toFixed(4)), 
        probability: 20 // Tail risk
      },
      { 
        min: parseFloat(prices[1].toFixed(4)), 
        max: parseFloat(spotPrice.toFixed(4)), 
        probability: 30 // Below current
      },
      { 
        min: parseFloat(spotPrice.toFixed(4)), 
        max: parseFloat(prices[2].toFixed(4)), 
        probability: 30 // Above current
      },
      { 
        min: parseFloat(prices[2].toFixed(4)), 
        max: parseFloat(prices[3].toFixed(4)), 
        probability: 20 // Tail risk
      }
    ];
  };

  const [priceRanges, setPriceRanges] = useState<PriceRange[]>(() => {
    // Initialize with FX-appropriate ranges
    return generateFXPriceRanges(params.currencyPair, params.spotPrice);
  });

  const [matrixStrategies, setMatrixStrategies] = useState<{
    components: StrategyComponent[];
    coverageRatio: number;
    name: string;
  }[]>([]);

  const [riskMatrixResults, setRiskMatrixResults] = useState<RiskMatrixResult[]>([]);

  // Forex-specific states
  const [optionPricingModel, setOptionPricingModel] = useState<'black-scholes' | 'garman-kohlhagen' | 'monte-carlo'>('garman-kohlhagen');
  const [barrierPricingModel, setBarrierPricingModel] = useState<'monte-carlo' | 'closed-form'>('closed-form');

  // Ajouter cet état
  const [savedRiskMatrices, setSavedRiskMatrices] = useState<SavedRiskMatrix[]>(() => {
    const saved = localStorage.getItem('savedRiskMatrices');
    return saved ? JSON.parse(saved) : [];
  });

  // Ajouter un état pour stocker les volumes personnalisés par mois
  const [customVolumes, setCustomVolumes] = useState<Record<string, number>>({});

  // Ajouter un état pour l'onglet actif des résultats
  const [activeResultsTab, setActiveResultsTab] = useState('detailed');

  // Ajouter une fonction pour gérer les changements de volume
  const handleVolumeChange = (monthKey: string, newVolume: number) => {
    // Mettre à jour l'état des volumes personnalisés
    setCustomVolumes(prev => ({
      ...prev,
      [monthKey]: newVolume
    }));
    
    // Recalculer les résultats avec les nouveaux volumes
    recalculateResults();
  };

  // Fonction pour recalculer les résultats avec les volumes personnalisés
  const recalculateResults = () => {
    if (!results) return;
    
    // Create copy of results
    const updatedResults = [...results];
    
    // Update each result with new data
    updatedResults.forEach(result => {
      const date = new Date(result.date);
      const monthKey = `${date.getFullYear()}-${date.getMonth() + 1}`;
      
      // Update forward price if available in manual forwards
      if (manualForwards[monthKey]) {
        result.forward = manualForwards[monthKey];
      }
      
      // Update real price if available in real prices
      if (realPrices[monthKey]) {
        result.realPrice = realPrices[monthKey];
      }
      
      // Recalculate option prices with current parameters and IV
      result.optionPrices.forEach((option, optionIndex) => {
        const strike = option.strike;
        
        // Use custom option prices if enabled
        const optionKey = `${option.type}-${optionIndex}`;
        if (useCustomOptionPrices && customOptionPrices[monthKey]?.[optionKey] !== undefined) {
          option.price = customOptionPrices[monthKey][optionKey];
        } else {
          // Otherwise recalculate price with current parameters
          let volatilityToUse;
          
          if (useImpliedVol && impliedVolatilities[monthKey]) {
            // Use implied volatility if available
            const iv = getImpliedVolatility(monthKey, optionKey);
            volatilityToUse = (iv !== undefined && iv !== null) ? iv / 100 : 
              (strategy.find(opt => opt.type === option.type)?.volatility || 20) / 100;
          } else {
            // Use strategy volatility
            volatilityToUse = (strategy.find(opt => opt.type === option.type)?.volatility || 20) / 100;
          }
          
          // Calculate price with proper volatility
          if (option.type === 'forward') {
            option.price = (result.forward - strike) * Math.exp(-params.domesticRate/100 * result.timeToMaturity);
          } else if (option.type === 'call' || option.type === 'put') {
            option.price = calculateGarmanKohlhagenPrice(
              option.type,
              result.forward,
              strike,
              params.domesticRate/100,
              params.foreignRate/100,
              result.timeToMaturity,
              volatilityToUse
            );
          } else if (option.type.includes('knockout') || option.type.includes('knockin')) {
            // For barrier options, use the appropriate calculation
            const strategyOption = strategy.find(opt => opt.type === option.type);
            if (strategyOption) {
              const barrier = strategyOption.barrierType === 'percent' ? 
                params.spotPrice * (strategyOption.barrier / 100) : 
                strategyOption.barrier;
                
              const secondBarrier = option.type.includes('double') ? 
                (strategyOption.barrierType === 'percent' ? 
                  params.spotPrice * (strategyOption.secondBarrier / 100) : 
                  strategyOption.secondBarrier) : 
                undefined;
                
              if (barrierPricingModel === 'closed-form') {
                const underlyingResult = PricingService.calculateUnderlyingPrice(
                  params.spotPrice,
                  params.domesticRate/100,
                  params.foreignRate/100,
                  result.timeToMaturity
                );
                option.price = calculateBarrierOptionClosedForm(
                  option.type,
                  underlyingResult.price,
                  strike,
                  params.domesticRate/100,
                  result.timeToMaturity,
                  volatilityToUse,
                  barrier,
                  secondBarrier
                );
              } else {
                const underlyingResult = PricingService.calculateUnderlyingPrice(
                  params.spotPrice,
                  params.domesticRate/100,
                  params.foreignRate/100,
                  result.timeToMaturity
                );
                option.price = calculateBarrierOptionPrice(
                  option.type,
                  underlyingResult.price,
                  strike,
                  params.domesticRate/100,
                  result.timeToMaturity,
                  volatilityToUse,
                  barrier,
                  secondBarrier,
                  barrierOptionSimulations
                );
              }
            }
          } else if (
            option.type.includes('one-touch') ||
            option.type.includes('double-touch') ||
            option.type.includes('no-touch') ||
            option.type.includes('double-no-touch') ||
            option.type.includes('range-binary') ||
            option.type.includes('outside-binary')
          ) {
            // For digital options
            const strategyOption = strategy.find(opt => opt.type === option.type);
            if (strategyOption) {
              const barrier = strategyOption.barrierType === 'percent' ? 
                params.spotPrice * (strategyOption.barrier / 100) : 
                strategyOption.barrier;
                
              const secondBarrier = option.type.includes('double') ? 
                (strategyOption.barrierType === 'percent' ? 
                  params.spotPrice * (strategyOption.secondBarrier / 100) : 
                  strategyOption.secondBarrier) : 
                undefined;
                
              const underlyingResult = PricingService.calculateUnderlyingPrice(
                params.spotPrice,
                params.domesticRate/100,
                params.foreignRate/100,
                result.timeToMaturity
              );
              option.price = calculateDigitalOptionPrice(
                option.type,
                underlyingResult.price,
                strike,
                params.domesticRate / 100,
                result.timeToMaturity,
                volatilityToUse,
                barrier,
                secondBarrier,
                10000,
                strategyOption.rebate ?? 1
              );
            }
          }
        }
      });
      
      // Recalculate strategy price
      result.strategyPrice = validateDataForReduce(result.optionPrices).reduce((sum, opt) => sum + opt.price * opt.quantity/100, 0);
      
      // Recalculate hedged cost, unhedged cost, delta P&L
      const monthlyPayoff = result.realPrice - result.forward;
      result.totalPayoff = monthlyPayoff * result.monthlyVolume;
      result.hedgedCost = result.strategyPrice * result.monthlyVolume;
      result.unhedgedCost = result.totalPayoff;
      result.deltaPnL = result.unhedgedCost - result.hedgedCost;
    });
    
    // Update results state
    setResults(updatedResults);
  };

  // Add this function for Monte Carlo simulation of barrier options
  const calculateBarrierOptionPrice = (
    optionType: string,
    S: number,      // Current price
    K: number,      // Strike price
    r: number,      // Risk-free rate
    t: number,      // Time to maturity in years
    sigma: number,  // Volatility
    barrier: number, // Barrier level
    secondBarrier?: number, // Second barrier for double barrier options
    numSimulations: number = 1000 // Number of simulations
  ) => {
    // Generate a simple price path for this specific option
      const numSteps = Math.max(252 * t, 50); // At least 50 steps
      const dt = t / numSteps;
      
    // Generate paths for just this one option
    const paths = [];
    for (let i = 0; i < numSimulations; i++) {
      const path = [S]; // Start with current price
      
      // Simulate price path
      for (let step = 0; step < numSteps; step++) {
        const previousPrice = path[path.length - 1];
        // Generate random normal variable
        const randomWalk = Math.random() * 2 - 1; // Simple approximation of normal distribution
        
        // Update price using geometric Brownian motion
        const nextPrice = previousPrice * Math.exp(
          (r - 0.5 * Math.pow(sigma, 2)) * dt + 
          sigma * Math.sqrt(dt) * randomWalk
        );
        
        path.push(nextPrice);
      }
      
      paths.push(path);
    }
    
    // Use our new function to calculate the price
    const optionPrice = calculatePricesFromPaths(
      optionType,
      S,
      K,
      r,
      numSteps, // The final index in the path
      paths,
      barrier,
      secondBarrier
    );

    // S'assurer que le prix de l'option n'est jamais négatif
    return Math.max(0, optionPrice);
  };

  // Digital option Monte Carlo pricing
  const calculateDigitalOptionPrice = (
    optionType: string,
    S: number,      // Current price
    K: number,      // Strike/Barrier level
    r: number,      // Risk-free rate
    t: number,      // Time to maturity
    sigma: number,  // Volatility
    barrier?: number,
    secondBarrier?: number,
    numSimulations: number = 10000,
    rebate: number = 1
  ) => {
    // Conversion du rebate en pourcentage
    const rebateDecimal = rebate / 100;
    
    let payoutSum = 0;
    // Amélioration de la précision de la simulation
    const stepsPerDay = 4;
    const totalSteps = Math.max(252 * t * stepsPerDay, 50);
    const dt = t / totalSteps;
    for (let sim = 0; sim < numSimulations; sim++) {
      let price = S;
      let touched = false;
      let touchedSecond = false;
      for (let step = 0; step < totalSteps; step++) {
        const z = Math.sqrt(-2 * Math.log(Math.random())) * Math.cos(2 * Math.PI * Math.random());
        price = price * Math.exp((r - 0.5 * sigma * sigma) * dt + sigma * Math.sqrt(dt) * z);
        switch (optionType) {
          case 'one-touch':
            if (barrier !== undefined && price >= barrier) touched = true;
            break;
          case 'no-touch':
            if (barrier !== undefined && price >= barrier) touched = true;
            break;
          case 'double-touch':
            if (barrier !== undefined && price >= barrier) touched = true;
            if (secondBarrier !== undefined && price <= secondBarrier) touchedSecond = true;
            break;
          case 'double-no-touch':
            if ((barrier !== undefined && price >= barrier) || (secondBarrier !== undefined && price <= secondBarrier)) touched = true;
            break;
          case 'range-binary':
            if (barrier !== undefined && K !== undefined && price >= K && price <= barrier) touched = true;
            break;
          case 'outside-binary':
            if (barrier !== undefined && K !== undefined && (price <= K || price >= barrier)) touched = true;
            break;
        }
      }
      switch (optionType) {
        case 'one-touch':
          if (touched) payoutSum += rebateDecimal;
          break;
        case 'no-touch':
          if (!touched) payoutSum += rebateDecimal;
          break;
        case 'double-touch':
          if (touched || touchedSecond) payoutSum += rebateDecimal;
          break;
        case 'double-no-touch':
          if (!touched) payoutSum += rebateDecimal;
          break;
        case 'range-binary':
          if (touched) payoutSum += rebateDecimal;
          break;
        case 'outside-binary':
          if (touched) payoutSum += rebateDecimal;
          break;
      }
    }
    // Retourner le prix sans facteur d'échelle arbitraire
    return Math.exp(-r * t) * (payoutSum / numSimulations);
  };

  // Modify the calculateOptionPrice function to handle barrier options
  // FX Forward Pricing Model
  const calculateFXForwardPrice = (S: number, r_d: number, r_f: number, t: number) => {
    return S * Math.exp((r_d - r_f) * t);
  };

  // Garman-Kohlhagen FX Option Pricing Model
  const calculateGarmanKohlhagenPrice = (type: string, S: number, K: number, r_d: number, r_f: number, t: number, sigma: number) => {
    const d1 = (Math.log(S / K) + (r_d - r_f + (sigma * sigma) / 2) * t) / (sigma * Math.sqrt(t));
    const d2 = d1 - sigma * Math.sqrt(t);
    
    const CND = (x: number) => (1 + erf(x / Math.sqrt(2))) / 2;
    
    if (type === 'call') {
      return S * Math.exp(-r_f * t) * CND(d1) - K * Math.exp(-r_d * t) * CND(d2);
    } else {
      return K * Math.exp(-r_d * t) * CND(-d2) - S * Math.exp(-r_f * t) * CND(-d1);
    }
  };

  // Nouvelle fonction pour calculer les options vanilla avec Monte Carlo
  const calculateVanillaOptionMonteCarlo = (
    optionType: string,
    S: number,      // Current price
    K: number,      // Strike price
    r_d: number,    // Domestic risk-free rate
    r_f: number,    // Foreign risk-free rate 
    t: number,      // Time to maturity in years
    sigma: number,  // Volatility
    numSimulations: number = 1000 // Number of simulations
  ) => {
    let payoffSum = 0;
    
    for (let i = 0; i < numSimulations; i++) {
      // Generate random normal variable (using Box-Muller transform for better accuracy)
      const u1 = Math.random();
      const u2 = Math.random();
      const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      
      // Simulate final FX price using geometric Brownian motion
      const finalPrice = S * Math.exp(
        (r_d - r_f - 0.5 * sigma * sigma) * t + 
        sigma * Math.sqrt(t) * z
      );
      
      // Calculate payoff
      let payoff = 0;
      if (optionType === 'call') {
        payoff = Math.max(finalPrice - K, 0);
      } else if (optionType === 'put') {
        payoff = Math.max(K - finalPrice, 0);
      }
      
      payoffSum += payoff;
    }
    
    // Calculate average payoff and discount to present value
    const averagePayoff = payoffSum / numSimulations;
    const optionPrice = averagePayoff * Math.exp(-r_d * t);
    
    return Math.max(0, optionPrice);
  };

  const calculateOptionPrice = (type, S, K, r, t, sigma, date?, optionIndex?) => {
    // Utilize the volatility implied if available
    let effectiveSigma = sigma;
    if (date && useImpliedVol) {
      const monthKey = `${date.getFullYear()}-${date.getMonth() + 1}`;
      const optionKey = optionIndex !== undefined ? `${type}-${optionIndex}` : undefined;
      const iv = getImpliedVolatility(monthKey, optionKey);
      
      if (iv !== null) {
        effectiveSigma = iv / 100;
      }
    }

    // If it's a barrier option, use Monte Carlo simulation or closed-form solution based on flag
    if (type.includes('knockout') || type.includes('knockin')) {
      // Find the option in the strategy to get barrier values
      const option = strategy.find(opt => opt.type === type);
      if (!option) return 0;

      // Calculate barrier values
      const barrier = option.barrierType === 'percent' ? 
        params.spotPrice * (option.barrier / 100) : 
        option.barrier;
        
      const secondBarrier = option.type.includes('double') ? 
        (option.barrierType === 'percent' ? 
          params.spotPrice * (option.secondBarrier / 100) : 
          option.secondBarrier) : 
        undefined;
      
      // Use closed-form solution if enabled for both simple and double barrier options
      if (barrierPricingModel === 'closed-form') {
        return Math.max(0, calculateBarrierOptionClosedForm(
          type,
          S,
          K,
          r,
          t,
          effectiveSigma,
          barrier,
          secondBarrier
        ));
      } else {
        // Otherwise use Monte Carlo simulation
        return Math.max(0, calculateBarrierOptionPrice(
        type,
        S,
        K,
        r,
        t,
        effectiveSigma,
        barrier,
        secondBarrier,
          barrierOptionSimulations // Use the number of simulations specific to barrier options
        ));
      }
    }
    
    // Digital Options Calculations
    if (type.includes('one-touch') || type.includes('no-touch') || 
        type.includes('double-touch') || type.includes('double-no-touch') ||
        type.includes('range-binary') || type.includes('outside-binary')) {
      // Find the option in the strategy to get digital params
      const option = strategy.find(opt => opt.type === type);
      if (!option) return 0;
      const barrier = option.barrierType === 'percent' ? 
        params.spotPrice * (option.barrier / 100) : 
        option.barrier;
      const secondBarrier = option.type.includes('double') ? 
        (option.barrierType === 'percent' ? 
          params.spotPrice * (option.secondBarrier / 100) : 
          option.secondBarrier) : 
        undefined;
      const rebate = option.rebate !== undefined ? option.rebate : 1;
      const numSimulations = barrierOptionSimulations || 10000;
      return calculateDigitalOptionPrice(
        type,
        S,
        K,
        r,
        t,
        effectiveSigma,
        barrier,
        secondBarrier,
        numSimulations,
        rebate
      );
    }
    
    // For standard options, use appropriate pricing model
    let price = 0;
    if (optionPricingModel === 'garman-kohlhagen') {
      // Use Garman-Kohlhagen for FX options
      price = calculateGarmanKohlhagenPrice(type, S, K, params.domesticRate / 100, params.foreignRate / 100, t, effectiveSigma);
    } else if (optionPricingModel === 'monte-carlo') {
      // Use Monte Carlo for vanilla options
      price = calculateVanillaOptionMonteCarlo(
        type, 
        S, 
        K, 
        params.domesticRate / 100, 
        params.foreignRate / 100, 
        t, 
        effectiveSigma,
        1000 // Number of simulations for vanilla options
      );
    } else {
      // Use traditional Black-Scholes
      const d1 = (Math.log(S/K) + (r + effectiveSigma**2/2)*t) / (effectiveSigma*Math.sqrt(t));
      const d2 = d1 - effectiveSigma*Math.sqrt(t);
      
      const Nd1 = (1 + erf(d1/Math.sqrt(2)))/2;
      const Nd2 = (1 + erf(d2/Math.sqrt(2)))/2;
      
      if (type === 'call') {
        price = S*Nd1 - K*Math.exp(-r*t)*Nd2;
      } else { // put
        price = K*Math.exp(-r*t)*(1-Nd2) - S*(1-Nd1);
      }
    }
    
    // S'assurer que le prix de l'option n'est jamais négatif
    return Math.max(0, price);
  };

  // Error function (erf) implementation
  const erf = (x) => {
    const a1 =  0.254829592;
    const a2 = -0.284496736;
    const a3 =  1.421413741;
    const a4 = -1.453152027;
    const a5 =  1.061405429;
    const p  =  0.3275911;
    
    const sign = (x < 0) ? -1 : 1;
    x = Math.abs(x);
    
    const t = 1.0/(1.0 + p*x);
    const y = 1.0 - ((((((a5*t + a4)*t) + a3)*t + a2)*t + a1)*t*Math.exp(-x*x));
    
    return sign*y;
  };

  // Generate price paths for the entire period using Monte Carlo
  const generatePricePathsForPeriod = (months, startDate, numSimulations = 1000) => {
    const paths = [];
    const timeToMaturities = months.map(date => {
      const maturityDateStr = date.toISOString().split('T')[0]; // Format YYYY-MM-DD
      const valuationDateStr = startDate.toISOString().split('T')[0]; // Format YYYY-MM-DD
      return calculateTimeToMaturity(maturityDateStr, valuationDateStr);
    });
    
    const maxMaturity = Math.max(...timeToMaturities);
    const numSteps = Math.max(252 * maxMaturity, 50); // At least 50 steps, or daily steps
    const dt = maxMaturity / numSteps;
    
    // Pre-calculate monthly indices in the path
    const monthlyIndices = timeToMaturities.map(t => Math.floor(t / maxMaturity * numSteps));
    
    // Generate paths
    for (let i = 0; i < numSimulations; i++) {
      const path = [params.spotPrice]; // Start with current spot price
      
      // Simulate full path
      for (let step = 0; step < numSteps; step++) {
        const previousPrice = path[path.length - 1];
        // Generate random normal variable
        const randomWalk = Math.random() * 2 - 1; // Simple approximation of normal distribution
        
        // Update price using FX geometric Brownian motion
        const nextPrice = previousPrice * Math.exp(
          (params.domesticRate/100 - params.foreignRate/100 - 0.5 * Math.pow(realPriceParams.volatility, 2)) * dt + 
          realPriceParams.volatility * Math.sqrt(dt) * randomWalk
        );
        
        path.push(nextPrice);
      }
      
      paths.push(path);
    }
    
    return { paths, monthlyIndices };
  };

  // Calculate option prices and payoffs from price paths
  const calculatePricesFromPaths = (
    optionType, 
    S, 
    K, 
    r, 
    maturityIndex,
    paths,
    barrier?,
    secondBarrier?
  ) => {
    let priceSum = 0;
    const numSimulations = paths.length;
    
    for (let i = 0; i < numSimulations; i++) {
      const path = paths[i];
      const finalPrice = path[maturityIndex];
      let payoff = 0;
      let barrierHit = false;
      
      // Check for barrier events along the path up to maturity
      if (barrier && (optionType.includes('knockout') || optionType.includes('knockin'))) {
        for (let step = 0; step <= maturityIndex; step++) {
          const pathPrice = path[step];
          
          // Check barrier logic based on option type
          const isAboveBarrier = pathPrice >= barrier;
          const isBelowBarrier = pathPrice <= barrier;
          
          // Apply same barrier logic as in the original function
          if (optionType.includes('knockout')) {
            if (optionType.includes('reverse')) {
              if (optionType.includes('put')) {
                // Put Reverse KO: Knocked out if price goes ABOVE barrier
                if (isAboveBarrier) {
                  barrierHit = true;
                  break;
                }
              } else {
                // Call Reverse KO: Knocked out if price goes BELOW barrier
                if (isBelowBarrier) {
                  barrierHit = true;
                  break;
                }
              }
            } else if (optionType.includes('double')) {
              // Double KO: Knocked out if price crosses either barrier
              const upperBarrier = Math.max(barrier, secondBarrier || 0);
              const lowerBarrier = Math.min(barrier, secondBarrier || Infinity);
              
              // Vérifier si le prix touche soit la barrière supérieure, soit la barrière inférieure
              // Pour un Call Double KO, l'option est invalidée si le prix monte trop haut ou descend trop bas
              if ((pathPrice >= upperBarrier) || (pathPrice <= lowerBarrier)) {
                barrierHit = true;
                break;
              }
            } else {
              if (optionType.includes('put')) {
                // Put KO: Knocked out if price goes BELOW barrier
                if (isBelowBarrier) {
                  barrierHit = true;
                  break;
                }
              } else {
                // Call KO: Knocked out if price goes ABOVE barrier
                if (isAboveBarrier) {
                  barrierHit = true;
                  break;
                }
              }
            }
          } else if (optionType.includes('knockin')) {
            if (optionType.includes('reverse')) {
              if (optionType.includes('put')) {
                // Put Reverse KI: Knocked in if price goes ABOVE barrier
                if (isAboveBarrier) {
                  barrierHit = true;
                }
              } else {
                // Call Reverse KI: Knocked in if price goes BELOW barrier
                if (isBelowBarrier) {
                  barrierHit = true;
                }
              }
            } else if (optionType.includes('double')) {
              // Double KI: Knocked in if price crosses either barrier
              const upperBarrier = Math.max(barrier, secondBarrier || 0);
              const lowerBarrier = Math.min(barrier, secondBarrier || Infinity);
              if (pathPrice >= upperBarrier || pathPrice <= lowerBarrier) {
                barrierHit = true;
              }
            } else {
              if (optionType.includes('put')) {
                // Put KI: Knocked in if price goes BELOW barrier
                if (isBelowBarrier) {
                  barrierHit = true;
                }
              } else {
                // Call KI: Knocked in if price goes ABOVE barrier
                if (isAboveBarrier) {
                  barrierHit = true;
                }
              }
            }
          }
        }
      }
      
      // Calculate payoff
      const isCall = optionType.includes('call') || (!optionType.includes('put') && !optionType.includes('swap'));
      const baseOptionPayoff = isCall ? 
        Math.max(0, finalPrice - K) : 
        Math.max(0, K - finalPrice);
      
      if (!barrier) {
        // Standard option
        payoff = baseOptionPayoff;
      } else if (optionType.includes('knockout')) {
        // Knockout option
        // Une fois que la barrière est touchée (barrierHit=true), l'option est invalidée définitivement
        // et le payoff reste à zéro, même si le prix revient dans la zone favorable
        if (!barrierHit) {
          payoff = baseOptionPayoff;
        }
      } else if (optionType.includes('knockin')) {
        // Knockin option
        if (barrierHit) {
          payoff = baseOptionPayoff;
        }
      }
      
      priceSum += payoff;
    }
    
    // Average payoff discounted back to present value
    const t = maturityIndex / (252 * paths[0].length); // Approximate time to maturity
    return (priceSum / numSimulations) * Math.exp(-r * t);
  };

  // Modify the calculatePayoff function to handle barrier options
  const calculatePayoff = () => {
    if (strategy.length === 0) return;

    const spotPrice = params.spotPrice;
    const priceRange = Array.from({length: 101}, (_, i) => spotPrice * (0.5 + i * 0.01));
    
    // Generate Monte Carlo paths for 1 year (standard for payoff diagrams)
    const numSteps = 252; // Daily steps for a year
    const numSimulations = 500; // Fewer simulations for the payoff diagram
    const paths = [];
    
    for (let i = 0; i < numSimulations; i++) {
      const path = [spotPrice];
      const dt = 1/252; // Daily step
      
      for (let step = 0; step < numSteps; step++) {
        const previousPrice = path[path.length - 1];
        const randomWalk = Math.random() * 2 - 1;
        const nextPrice = previousPrice * Math.exp(
          (params.domesticRate/100 - params.foreignRate/100 - Math.pow(realPriceParams.volatility, 2)/2) * dt + 
          realPriceParams.volatility * Math.sqrt(dt) * randomWalk
        );
        path.push(nextPrice);
      }
      paths.push(path);
    }

    const payoffCalculation = priceRange.map(price => {
      let totalPayoff = 0;

      strategy.forEach(option => {
        const strike = option.strikeType === 'percent' 
          ? params.spotPrice * (option.strike / 100) 
          : option.strike;

        const quantity = option.quantity / 100;

        // Calculate option price based on type
        let optionPremium;
        
        if (option.type === 'call' || option.type === 'put') {
          // Use appropriate pricing model for FX options
          if (optionPricingModel === 'garman-kohlhagen') {
            optionPremium = calculateGarmanKohlhagenPrice(
              option.type,
              spotPrice,
              strike,
              params.domesticRate/100,
              params.foreignRate/100,
              1, // 1 year for payoff diagrams
              option.volatility/100
            );
          } else {
            // Black-Scholes fallback
            const d1 = (Math.log(spotPrice/strike) + (params.domesticRate/100 + (option.volatility/100)**2/2)*1) / ((option.volatility/100)*Math.sqrt(1));
            const d2 = d1 - (option.volatility/100)*Math.sqrt(1);
            
            const Nd1 = (1 + erf(d1/Math.sqrt(2)))/2;
            const Nd2 = (1 + erf(d2/Math.sqrt(2)))/2;
            
            if (option.type === 'call') {
              optionPremium = spotPrice*Nd1 - strike*Math.exp(-params.domesticRate/100*1)*Nd2;
            } else { // put
              optionPremium = strike*Math.exp(-params.domesticRate/100*1)*(1-Nd2) - spotPrice*(1-Nd1);
            }
          }
        } else if (option.type.includes('knockout') || option.type.includes('knockin')) {
          // Use Monte Carlo for barrier options
          const barrier = option.barrierType === 'percent' ? 
            params.spotPrice * (option.barrier / 100) : 
            option.barrier;
            
          const secondBarrier = option.type.includes('double') ? 
            (option.barrierType === 'percent' ? 
              params.spotPrice * (option.secondBarrier / 100) : 
              option.secondBarrier) : 
            undefined;
            
          optionPremium = calculatePricesFromPaths(
          option.type,
          spotPrice,
          strike,
          params.domesticRate/100,
            numSteps,
            paths,
            barrier,
            secondBarrier
          );
        } else if (option.type === 'swap') {
          // For swaps, premium is typically negligible for payoff diagrams
          optionPremium = 0;
        } else if (['one-touch', 'no-touch', 'double-touch', 'double-no-touch', 'range-binary', 'outside-binary'].includes(option.type)) {
          // Pour les options digitales, utiliser une approximation simple pour les graphiques de payoff
          const rebateDecimal = (option.rebate || 5) / 100;
          // Approximation simple : prime = probability * rebate * discount factor
          optionPremium = 0.5 * rebateDecimal * Math.exp(-params.domesticRate/100 * 1);
        }

        // Calculate payoff at this price point
        let payoff = 0;
        
        if (option.type === 'call') {
          payoff = Math.max(0, price - strike);
        } else if (option.type === 'put') {
          payoff = Math.max(0, strike - price);
        } else if (option.type === 'swap') {
          payoff = spotPrice - price;
        } else if (option.type.includes('knockout') || option.type.includes('knockin')) {
          // Approche simplifiée pour les graphiques de payoff des options à barrière
          // Note: Ceci est une approximation pour la visualisation, qui ne capture pas
          // complètement la nature path-dependent de ces options
          
          const barrier = option.barrierType === 'percent' ? 
            params.spotPrice * (option.barrier / 100) : 
            option.barrier;
          
          const secondBarrier = option.type.includes('double') ? 
            (option.barrierType === 'percent' ? 
              params.spotPrice * (option.secondBarrier / 100) : 
              option.secondBarrier) : 
            undefined;
          
          let isBarrierBroken = false;
          
          // Vérifier si le prix franchit une barrière selon le type d'option
          if (option.type.includes('knockout')) {
          if (option.type.includes('reverse')) {
            if (option.type.includes('put')) {
                // Put Reverse KO: Knocked out si au-dessus de la barrière
                isBarrierBroken = price >= barrier;
        } else {
                // Call Reverse KO: Knocked out si en-dessous de la barrière
                isBarrierBroken = price <= barrier;
            }
          } else if (option.type.includes('double')) {
              // Double KO: Knocked out si en dehors des deux barrières
              const upperBarrier = Math.max(barrier, secondBarrier || 0);
              const lowerBarrier = Math.min(barrier, secondBarrier || Infinity);
              isBarrierBroken = price >= upperBarrier || price <= lowerBarrier;
          } else {
            if (option.type.includes('put')) {
                // Put Standard KO: Knocked out si en-dessous de la barrière
                isBarrierBroken = price <= barrier;
            } else {
                // Call Standard KO: Knocked out si au-dessus de la barrière
                isBarrierBroken = price >= barrier;
              }
            }
          } else if (option.type.includes('knockin')) {
            if (option.type.includes('reverse')) {
              if (option.type.includes('put')) {
                // Put Reverse KI: Knocked in si au-dessus de la barrière
                isBarrierBroken = price >= barrier;
              } else {
                // Call Reverse KI: Knocked in si en-dessous de la barrière
                isBarrierBroken = price <= barrier;
              }
            } else if (option.type.includes('double')) {
              // Double KI: Knocked in si en dehors des deux barrières
              const upperBarrier = Math.max(barrier, secondBarrier || 0);
              const lowerBarrier = Math.min(barrier, secondBarrier || Infinity);
              isBarrierBroken = price >= upperBarrier || price <= lowerBarrier;
            } else {
              if (option.type.includes('put')) {
                // Put Standard KI: Knocked in si en-dessous de la barrière
                isBarrierBroken = price <= barrier;
              } else {
                // Call Standard KI: Knocked in si au-dessus de la barrière
                isBarrierBroken = price >= barrier;
              }
            }
          }
          
          // Calculer le payoff en fonction du type d'option et du franchissement de barrière
          const isCall = option.type.includes('call');
          const basePayoff = isCall ? 
            Math.max(0, price - strike) : 
            Math.max(0, strike - price);
          
          if (option.type.includes('knockout')) {
            // Pour les options Knock-Out, le payoff est nul si la barrière est franchie
            payoff = isBarrierBroken ? 0 : basePayoff;
          } else { // knockin
            // Pour les options Knock-In, le payoff n'est non-nul que si la barrière est franchie
            payoff = isBarrierBroken ? basePayoff : 0;
          }
        } else if (['one-touch', 'no-touch', 'double-touch', 'double-no-touch', 'range-binary', 'outside-binary'].includes(option.type)) {
          // Calcul du payoff pour les options digitales
          const barrier = option.barrierType === 'percent' ? 
            params.spotPrice * (option.barrier / 100) : 
            option.barrier;
          const secondBarrier = option.secondBarrier ? 
            (option.barrierType === 'percent' ? 
              params.spotPrice * (option.secondBarrier / 100) : 
              option.secondBarrier) : undefined;
          
          const rebateDecimal = (option.rebate || 5) / 100;
          let conditionMet = false;
          
          switch(option.type) {
            case 'one-touch':
              conditionMet = price >= barrier;
              break;
            case 'no-touch':
              conditionMet = price < barrier;
              break;
            case 'double-touch':
              conditionMet = price >= barrier || (secondBarrier && price <= secondBarrier);
              break;
            case 'double-no-touch':
              conditionMet = price < barrier && (!secondBarrier || price > secondBarrier);
              break;
            case 'range-binary':
              const upperBound = Math.max(barrier, secondBarrier || 0);
              const lowerBound = Math.min(barrier, secondBarrier || Infinity);
              conditionMet = price <= upperBound && price >= lowerBound;
              break;
            case 'outside-binary':
              const upperBound2 = Math.max(barrier, secondBarrier || 0);
              const lowerBound2 = Math.min(barrier, secondBarrier || Infinity);
              conditionMet = price > upperBound2 || price < lowerBound2;
              break;
          }
          
          // Pour les options digitales, le payoff est le rebate si condition remplie, 0 sinon
          payoff = conditionMet ? rebateDecimal : 0;
        }
        
        // Subtract premium for net payoff
        const netPayoff = payoff - optionPremium;
        totalPayoff += netPayoff * quantity;
      });

      return { price, payoff: totalPayoff };
    });

    setPayoffData(payoffCalculation);
  };

  // Add new option to strategy
  const addOption = () => {
    setStrategy([...strategy, {
      type: 'call',
      strike: 100,
      strikeType: 'percent',
      volatility: 20,
      quantity: 100,
      // Ne pas ajouter de barrières par défaut - elles seront ajoutées seulement si nécessaires
      barrierType: 'percent'
    }]);
  };

  // Remove option from strategy
  const removeOption = (index) => {
    const newStrategy = strategy.filter((_, i) => i !== index);
    setStrategy(newStrategy);
    
    if (newStrategy.length > 0) {
      calculatePayoff();
    } else {
      setPayoffData([]);
    }
  };

  // Update option parameters
  const updateOption = (index, field, value) => {
    const newStrategy = [...strategy];
    newStrategy[index][field] = value;
    setStrategy(newStrategy);
    calculatePayoff();
  };

  // Filter results to show only from user's chosen start date onwards
  const filterResultsForDisplay = (allResults: Result[], hedgingStartDate: string): Result[] | null => {
    if (!allResults || allResults.length === 0) {
      return null;
    }

    // Since we now generate months starting from hedging start date, 
    // we should show ALL calculated results (all months to hedge)
    console.log(`[DISPLAY FILTER] Hedging start date: ${hedgingStartDate}`);
    console.log(`[DISPLAY FILTER] Showing ALL ${allResults.length} calculated periods (all months to hedge)`);
    
    if (allResults.length > 0) {
      console.log(`[DISPLAY FILTER] First period: ${allResults[0].date}`);
      console.log(`[DISPLAY FILTER] Last period: ${allResults[allResults.length - 1].date}`);
    }

    return allResults;
  };

  // Calculate detailed results
  const calculateResults = () => {
    // Use strategy start date for financial calculations (accurate time-to-maturity and forward prices)
    const strategyStartDate = new Date(params.strategyStartDate);
    const calculationStartDate = new Date(strategyStartDate.getFullYear(), strategyStartDate.getMonth(), strategyStartDate.getDate());
    
    // User's chosen hedging start date - this is where pricing and hedging periods should start
    const hedgingStartDate = new Date(params.startDate);
    
    let months = [];
    let monthlyVolumes = [];

    // Check if we're using custom periods or standard months
    if (params.useCustomPeriods && params.customPeriods.length > 0) {
      // Sort custom periods by maturity date
      const sortedPeriods = [...params.customPeriods].sort(
        (a, b) => new Date(a.maturityDate).getTime() - new Date(b.maturityDate).getTime()
      );
      
      // Convert custom periods to months array
      months = sortedPeriods.map(period => new Date(period.maturityDate));
      
      // Use the volumes defined in custom periods
      monthlyVolumes = sortedPeriods.map(period => period.volume);
    } else {
      // Generate exactly the number of months specified by the user
      // Start from the HEDGING START DATE and add exactly monthsToHedge months
      let currentDate = new Date(hedgingStartDate);
      
      // Generate exactly params.monthsToHedge months
      for (let i = 0; i < params.monthsToHedge; i++) {
        const monthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
        months.push(monthEnd);
        currentDate.setMonth(currentDate.getMonth() + 1);
      }
      
      console.log(`[CALCULATION] Generated exactly ${months.length} periods starting from HEDGING START DATE ${hedgingStartDate.toISOString().split('T')[0]}`);
      
      // Use equal volumes for each month
      const monthlyVolume = params.totalVolume / months.length;
      monthlyVolumes = Array(months.length).fill(monthlyVolume);
    }

    // Generate price paths for the entire period (from today's date for accurate calculations)
    const { paths, monthlyIndices } = generatePricePathsForPeriod(months, calculationStartDate, realPriceParams.numSimulations);

    // If simulation is enabled, generate new real prices using the first path
    if (realPriceParams.useSimulation) {
      const simulatedPrices = {};
      months.forEach((date, idx) => {
        const monthKey = `${date.getFullYear()}-${date.getMonth() + 1}`;
        // Use the first simulated path as the 'real' price path
        simulatedPrices[monthKey] = paths[0][monthlyIndices[idx]];
      });
      setRealPrices(simulatedPrices);
    }

    // Prepare Monte Carlo visualization data once we have paths
    const timeLabels = months.map(
      (date) => `${date.getFullYear()}-${date.getMonth() + 1}`
    );

    // Select randomly up to 100 paths to display
    const maxDisplayPaths = Math.min(100, paths.length);
    const selectedPathIndices = [];
    
    // If we have fewer than 100 paths, use all of them
    if (paths.length <= maxDisplayPaths) {
      for (let i = 0; i < paths.length; i++) {
        selectedPathIndices.push(i);
      }
    } else {
      // Otherwise, select 100 random indices
      while (selectedPathIndices.length < maxDisplayPaths) {
        const randomIndex = Math.floor(Math.random() * paths.length);
        if (!selectedPathIndices.includes(randomIndex)) {
          selectedPathIndices.push(randomIndex);
        }
      }
    }
    
    // Create the real price paths data
    const realPricePaths = selectedPathIndices.map(pathIndex => 
      monthlyIndices.map(idx => paths[pathIndex][idx])
    );

    // Calculate barrier option prices if we have barrier options
    const barrierOptions = strategy.filter(
      (opt) => opt.type.includes('knockout') || opt.type.includes('knockin')
    );

    const barrierOptionPricePaths: number[][] = [];

    if (barrierOptions.length > 0) {
      // For simplicity, use the first barrier option
      const barrierOption = barrierOptions[0];
      
      // Calculate barrier value
      const barrier = barrierOption.barrierType === 'percent' 
        ? params.spotPrice * (barrierOption.barrier! / 100) 
        : barrierOption.barrier!;
      
      const secondBarrier = barrierOption.type.includes('double')
        ? barrierOption.barrierType === 'percent'
          ? params.spotPrice * (barrierOption.secondBarrier! / 100)
          : barrierOption.secondBarrier
        : undefined;
        
      // Calculate strike
      const strike = barrierOption.strikeType === 'percent'
        ? params.spotPrice * (barrierOption.strike / 100)
        : barrierOption.strike;

      // Calculate option prices for selected paths
      for (const pathIndex of selectedPathIndices) {
        const path = paths[pathIndex];
        const optionPrices: number[] = [];
        
        // For each month, calculate the option price
        for (let monthIdx = 0; monthIdx < monthlyIndices.length; monthIdx++) {
          const maturityIndex = monthlyIndices[monthIdx];
          
          // Calculate option price at this point
          const optionPrice = calculatePricesFromPaths(
            barrierOption.type,
            params.spotPrice,
            strike,
            params.domesticRate/100,
            maturityIndex,
            [path],
            barrier,
            secondBarrier
          );
          
          optionPrices.push(optionPrice);
        }
        
        barrierOptionPricePaths.push(optionPrices);
      }
    }

    // Update visualization data with the calculated paths
    setSimulationData({
      realPricePaths,
      timeLabels,
      strategyName: barrierOptions.length > 0 
        ? `${barrierOptions[0].type} at ${barrierOptions[0].strike}` 
        : 'Current Strategy',
    });

    // Continue with the rest of calculateResults
    // Calculate time to maturity using the same function as HedgingInstruments for consistency
    const timeToMaturities = months.map(date => {
      const maturityDateStr = date.toISOString().split('T')[0]; // Format YYYY-MM-DD
      const valuationDateStr = calculationStartDate.toISOString().split('T')[0]; // Format YYYY-MM-DD
      return calculateTimeToMaturity(maturityDateStr, valuationDateStr);
    });

    // Suivi des options knocked out
    const knockedOutOptions = new Set();
    
    // Pour chaque chemin de simulation, vérifier à l'avance les franchissements de barrière
    const barrierCrossings = {};
    // Pour suivre les options knock-in activées
    const barrierActivations = {};
    
    strategy.forEach((option, optIndex) => {
      // Gestion des options knockout
      if (option.type.includes('knockout')) {
        const optionId = `${option.type}-${optIndex}`;
        barrierCrossings[optionId] = [];
        
        // Vérifier les franchissements sur le chemin principal (celui utilisé pour les real prices)
        const barrier = option.barrierType === 'percent' ? 
          params.spotPrice * (option.barrier / 100) : 
          option.barrier;
          
        const secondBarrier = option.type.includes('double') ? 
          (option.barrierType === 'percent' ? 
            params.spotPrice * (option.secondBarrier / 100) : 
            option.secondBarrier) : 
          undefined;
        
        // Vérifier le franchissement pour chaque mois
        let isKnockedOut = false;
        
        months.forEach((date, monthIndex) => {
          const monthKey = `${date.getFullYear()}-${date.getMonth() + 1}`;
          const realPrice = realPrices[monthKey] || 0;
          
          // Vérifier si cette option serait knocked out
          let barrierCrossed = false;
          if (!isKnockedOut) { // Ne vérifier que si l'option n'est pas déjà knocked out
            if (option.type.includes('reverse')) {
              if (option.type.includes('put')) {
                // Put Reverse KO: Knocked out si prix au-dessus de la barrière
                barrierCrossed = realPrice >= barrier;
              } else {
                // Call Reverse KO: Knocked out si prix en-dessous de la barrière
                barrierCrossed = realPrice <= barrier;
              }
            } else if (option.type.includes('double')) {
              // Double KO: Knocked out si prix en dehors des deux barrières
              const upperBarrier = Math.max(barrier, secondBarrier || 0);
              const lowerBarrier = Math.min(barrier, secondBarrier || Infinity);
              barrierCrossed = realPrice >= upperBarrier || realPrice <= lowerBarrier;
            } else {
              if (option.type.includes('put')) {
                // Put Standard KO: Knocked out si prix en-dessous de la barrière
                barrierCrossed = realPrice <= barrier;
              } else {
                // Call Standard KO: Knocked out si prix au-dessus de la barrière
                barrierCrossed = realPrice >= barrier;
              }
            }
          }
          
          // Mettre à jour l'état knocked out si la barrière est franchie
          if (barrierCrossed) {
            isKnockedOut = true;
          }
          
          // Stocker si l'option est knocked out à ce mois
          barrierCrossings[optionId][monthIndex] = isKnockedOut;
        });
      }
      
      // Gestion des options knockin - ajout de code similaire pour suivre l'activation
      if (option.type.includes('knockin')) {
        const optionId = `${option.type}-${optIndex}`;
        barrierActivations[optionId] = [];
        
        const barrier = option.barrierType === 'percent' ? 
          params.spotPrice * (option.barrier / 100) : 
          option.barrier;
          
        const secondBarrier = option.type.includes('double') ? 
          (option.barrierType === 'percent' ? 
            params.spotPrice * (option.secondBarrier / 100) : 
            option.secondBarrier) : 
          undefined;
        
        // Vérifier l'activation pour chaque mois
        let isKnockedIn = false;
        
        months.forEach((date, monthIndex) => {
          const monthKey = `${date.getFullYear()}-${date.getMonth() + 1}`;
          const realPrice = realPrices[monthKey] || 0;
          
          // Vérifier si cette option serait knocked in
          let barrierHit = false;
          if (!isKnockedIn) { // Vérifier seulement si l'option n'est pas déjà knocked in
            if (option.type.includes('reverse')) {
              if (option.type.includes('put')) {
                // Put Reverse KI: Knocked in si prix au-dessus de la barrière
                barrierHit = realPrice >= barrier;
              } else {
                // Call Reverse KI: Knocked in si prix en-dessous de la barrière
                barrierHit = realPrice <= barrier;
              }
            } else if (option.type.includes('double')) {
              // Double KI: Knocked in si prix en dehors des deux barrières
              const upperBarrier = Math.max(barrier, secondBarrier || 0);
              const lowerBarrier = Math.min(barrier, secondBarrier || Infinity);
              barrierHit = realPrice >= upperBarrier || realPrice <= lowerBarrier;
            } else {
              if (option.type.includes('put')) {
                // Put Standard KI: Knocked in si prix en-dessous de la barrière
                barrierHit = realPrice <= barrier;
              } else {
                // Call Standard KI: Knocked in si prix au-dessus de la barrière
                barrierHit = realPrice >= barrier;
              }
            }
          }
          
          // Mettre à jour l'état knocked in si la barrière est touchée
          if (barrierHit) {
            isKnockedIn = true;
          }
          
          // Stocker si l'option est knocked in à ce mois
          barrierActivations[optionId][monthIndex] = isKnockedIn;
        });
      }
    });

    // Generate detailed results for each period with the corresponding monthly volume
    const detailedResults = months.map((date, i) => {
      // Use the monthly volume from our array instead of dividing total volume
      const monthlyVolume = monthlyVolumes[i];
      
      const t = timeToMaturities[i];
      const maturityIndex = monthlyIndices[i]; // Add the maturityIndex definition
      
      // Get forward price using FX forward formula
        const monthKey = `${date.getFullYear()}-${date.getMonth() + 1}`;
      const forward = (() => {
        return manualForwards[monthKey] || 
          calculateFXForwardPrice(
            initialSpotPrice, 
            params.domesticRate / 100, 
            params.foreignRate / 100, 
            t
          );
      })();

      // Get real price
      const realPrice = realPrices[monthKey] || forward;

      // Calculer le prix du swap une fois pour tous les swaps
        const swapPrice = calculateSwapPrice(
            months.map((_, idx) => {
                const monthKey = `${_.getFullYear()}-${_.getMonth() + 1}`;
                return manualForwards[monthKey] || 
            calculateFXForwardPrice(
              initialSpotPrice, 
              params.domesticRate / 100, 
              params.foreignRate / 100, 
              timeToMaturities[idx]
            );
            }),
            timeToMaturities,
        params.domesticRate/100
        );

      // Séparer les swaps, forwards et options
        const swaps = strategy.filter(s => s.type === 'swap');
        const forwards = strategy.filter(s => s.type === 'forward');
        const options = strategy.filter(s => s.type !== 'swap' && s.type !== 'forward');

      // Calculer les prix des options en utilisant les chemins de prix
        const optionPrices = options.map((option, optIndex) => {
            // Vérifier si un strike personnalisé existe pour cette période
            const strikeKey = `${option.type}-${optIndex}`;
            const customStrike = customStrikes[monthKey]?.[strikeKey];
            
            // Calculer le strike initial (basé sur le spot pour les pourcentages)
            // Utiliser le strike personnalisé s'il existe, sinon calculer normalement
            let strike = customStrike !== undefined
              ? customStrike
              : (option.strikeType === 'percent' ? 
                  params.spotPrice * (option.strike/100) : 
                  option.strike);
            
            // Check if this option has dynamic strike calculation based on time to maturity
            // Ne pas calculer le strike dynamique si un strike personnalisé existe
            if (option.dynamicStrike && option.dynamicStrike.method === 'equilibrium' && customStrike === undefined) {
              // Get the balancing option
              const balanceWithOption = strategy[option.dynamicStrike.balanceWithIndex];
              
              if (balanceWithOption) {
                // Calculate the strike of the balancing option
                const balanceWithStrike = balanceWithOption.strikeType === 'percent' ? 
                  forward * (balanceWithOption.strike/100) : 
                  balanceWithOption.strike;
                
                // Calculate volatility, with adjustment if specified
                const volAdjustment = option.dynamicStrike.volatilityAdjustment || 1;
                const balanceWithVol = balanceWithOption.volatility / 100;
                const currentVol = (option.volatility / 100) * volAdjustment;
                
                // Get the type of options
                const balanceWithType = balanceWithOption.type.includes('put') ? 'put' : 'call';
                const currentType = option.type.includes('put') ? 'put' : 'call';
                
                // Get the domestic and foreign interest rates
                const r_d = params.domesticRate / 100;
                const r_f = params.foreignRate / 100;
                
                // Calculate the premium of the balancing option for this specific time to maturity
                // This is important - we use the specific time to maturity for this period
                const balanceWithPrice = calculateGarmanKohlhagenPrice(
                  balanceWithType,
                  forward,
                  balanceWithStrike,
                  r_d,
                  r_f,
                  t, // Use this period's time to maturity
                  balanceWithVol
                );
                
                // Find the strike that gives an equivalent premium for the current option
                let low = forward * 0.5;    // Start with a wide range
                let high = forward * 1.5;
                let mid = 0;
                let price = 0;
                
                // Use bisection method to find equilibrium strike
                for (let iter = 0; iter < 50; iter++) {
                  mid = (low + high) / 2;
                  price = calculateGarmanKohlhagenPrice(
                    currentType,
                    forward,
                    mid,
                    r_d,
                    r_f,
                    t, // Use this period's time to maturity
                    currentVol
                  );
                  
                  // Check if we're close enough
                  if (Math.abs(price - balanceWithPrice) < 0.0001) {
                    break;
                  }
                  
                  // Adjust search range based on option type and price comparison
                  if (price > balanceWithPrice) {
                    if (currentType === 'call') {
                      low = mid;
                    } else { // put
                      high = mid;
                    }
                  } else {
                    if (currentType === 'call') {
                      high = mid;
                    } else { // put
                      low = mid;
                    }
                  }
                }
                
                // Set the dynamically calculated strike for this specific period
                strike = mid;
                
                // Store this as a dynamically calculated strike in an attribute
                // This will be used to display in the UI
                option.dynamicStrikeInfo = {
                  calculatedStrike: strike,
                  calculatedStrikePercent: (strike / forward * 100).toFixed(2) + '%',
                  forwardRate: forward,
                  timeToMaturity: t
                };
                
                // Optional: Log the calculated strike for debugging
                console.log(`Period ${i} (${monthKey}): Calculated strike for ${currentType} at ${strike.toFixed(4)} (${(strike/forward*100).toFixed(2)}% of forward)`);
              }
            }
            
            // Generate a descriptive label based on option type
            let optionLabel = "";
            if (option.type === 'call') {
              optionLabel = `Call Price ${optIndex + 1}`;
            } else if (option.type === 'put') {
              optionLabel = `Put Price ${optIndex + 1}`;
            } else if (option.type === 'swap') {
              optionLabel = `Swap Price ${optIndex + 1}`;
            } else if (option.type === 'forward') {
              optionLabel = `Forward ${optIndex + 1}`;
            } else if (option.type.includes('knockout')) {
              // Knockout options
              if (option.type.includes('call')) {
                if (option.type.includes('reverse')) {
                  optionLabel = `Call Rev KO ${optIndex + 1}`;
                } else if (option.type.includes('double')) {
                  optionLabel = `Call Dbl KO ${optIndex + 1}`;
            } else {
                  optionLabel = `Call KO ${optIndex + 1}`;
                }
              } else { // Put options
                if (option.type.includes('reverse')) {
                  optionLabel = `Put Rev KO ${optIndex + 1}`;
                } else if (option.type.includes('double')) {
                  optionLabel = `Put Dbl KO ${optIndex + 1}`;
                } else {
                  optionLabel = `Put KO ${optIndex + 1}`;
                }
              }
            } else if (option.type.includes('knockin')) {
              // Knockin options
              if (option.type.includes('call')) {
                if (option.type.includes('reverse')) {
                  optionLabel = `Call Rev KI ${optIndex + 1}`;
                } else if (option.type.includes('double')) {
                  optionLabel = `Call Dbl KI ${optIndex + 1}`;
                } else {
                  optionLabel = `Call KI ${optIndex + 1}`;
                }
              } else { // Put options
                if (option.type.includes('reverse')) {
                  optionLabel = `Put Rev KI ${optIndex + 1}`;
                } else if (option.type.includes('double')) {
                  optionLabel = `Put Dbl KI ${optIndex + 1}`;
                } else {
                  optionLabel = `Put KI ${optIndex + 1}`;
                }
              }
            } else if (option.type.includes('one-touch')) {
              optionLabel = `One Touch ${optIndex + 1}`;
            } else if (option.type.includes('no-touch')) {
              optionLabel = `No Touch ${optIndex + 1}`;
            } else if (option.type.includes('double-touch')) {
              optionLabel = `Double Touch ${optIndex + 1}`;
            } else if (option.type.includes('double-no-touch')) {
              optionLabel = `Double No Touch ${optIndex + 1}`;
            } else if (option.type.includes('range-binary')) {
              optionLabel = `Range Binary ${optIndex + 1}`;
            } else if (option.type.includes('outside-binary')) {
              optionLabel = `Outside Binary ${optIndex + 1}`;
            }
            
        // Calculate option price differently based on type
        let price;
        
        // Vérifier si cette option a été knocked out dans un mois précédent
        const optionId = `${option.type}-${optIndex}`;
        const isKnockedOut = option.type.includes('knockout') && barrierCrossings[optionId] && barrierCrossings[optionId][i];
        
        // Check if we should use custom prices first
        // Utiliser strikeKey qui a déjà été défini plus haut
        if (useCustomOptionPrices && customOptionPrices[monthKey]?.[strikeKey] !== undefined) {
          // Use custom price if available
          price = customOptionPrices[monthKey][strikeKey];
        } else {
          // Calculate price normally
          
          // Pour les options knocked out, nous calculons toujours le prix même si l'option est knocked out
          // Le prix représente la valeur théorique de l'option, indépendamment de son état knocked out
          if (option.type === 'forward') {
            // For forwards, the value is simply the difference between forward rate and strike
            price = (forward - strike) * Math.exp(-params.domesticRate/100 * t);
          } else if (option.type === 'call' || option.type === 'put') {
            // Utiliser la volatilité implicite spécifique à l'option si disponible
            const iv = getImpliedVolatility(monthKey, strikeKey);
            const effectiveSigma = useImpliedVol && iv !== undefined && iv !== null
              ? iv / 100
              : option.volatility / 100;
          // For standard options, use appropriate pricing model
          if (optionPricingModel === 'garman-kohlhagen') {
            const underlyingResult = PricingService.calculateUnderlyingPrice(
              params.spotPrice,
              params.domesticRate/100,
              params.foreignRate/100,
              t
            );
            price = calculateGarmanKohlhagenPrice(
              option.type,
              underlyingResult.price,
              strike,
              params.domesticRate/100,
              params.foreignRate/100,
              t,
              effectiveSigma
            );
          } else if (optionPricingModel === 'monte-carlo') {
            // Use Monte Carlo for vanilla options
            const underlyingResult = PricingService.calculateUnderlyingPrice(
              params.spotPrice,
              params.domesticRate/100,
              params.foreignRate/100,
              t
            );
            price = calculateVanillaOptionMonteCarlo(
              option.type,
              underlyingResult.price,
              strike,
              params.domesticRate / 100,
              params.foreignRate / 100,
              t,
              effectiveSigma,
              1000 // Number of simulations for vanilla options
            );
          } else {
            // Black-Scholes fallback
            const d1 = (Math.log(forward/strike) + (params.domesticRate/100 + effectiveSigma**2/2)*t) / (effectiveSigma*Math.sqrt(t));
            const d2 = d1 - effectiveSigma*Math.sqrt(t);
            
            const Nd1 = (1 + erf(d1/Math.sqrt(2)))/2;
            const Nd2 = (1 + erf(d2/Math.sqrt(2)))/2;
            
            if (option.type === 'call') {
              price = forward*Nd1 - strike*Math.exp(-params.domesticRate/100*t)*Nd2;
            } else { // put
              price = strike*Math.exp(-params.domesticRate/100*t)*(1-Nd2) - forward*(1-Nd1);
            }
          }
        } else if (option.type.includes('knockout') || option.type.includes('knockin')) {
          // For barrier options, use Monte Carlo paths or closed-form solutions based on flag
          const barrier = option.barrierType === 'percent' ? 
            params.spotPrice * (option.barrier / 100) : 
            option.barrier;
            
          const secondBarrier = option.type.includes('double') ? 
            (option.barrierType === 'percent' ? 
              params.spotPrice * (option.secondBarrier / 100) : 
              option.secondBarrier) : 
            undefined;
            
          // Use implied volatility if available, just like with standard options
          // Utiliser strikeKey qui a déjà été défini plus haut
          const effectiveSigma = useImpliedVol && impliedVolatilities[monthKey] ? 
            (getImpliedVolatility(monthKey, strikeKey) || option.volatility) / 100 : 
            option.volatility / 100;
            
          // Use closed-form solution if enabled (for both simple and double barrier options)
          if (barrierPricingModel === 'closed-form') {
            const underlyingResult = PricingService.calculateUnderlyingPrice(
              params.spotPrice,
              params.domesticRate/100,
              params.foreignRate/100,
              t
            );
            price = calculateBarrierOptionClosedForm(
              option.type,
              underlyingResult.price,
              strike,
              params.domesticRate/100,
              t,
              effectiveSigma,
              barrier,
              secondBarrier
            );
          } else {
            // For Monte Carlo simulation, we need to generate new paths with the correct implied volatility
            // Generate a smaller set of paths specifically for this calculation with the correct volatility
            const localPaths = [];
            const numLocalSims = 300; // Smaller number for performance
            const numSteps = maturityIndex;
            const dt = t / numSteps;
            
            const underlyingResult = PricingService.calculateUnderlyingPrice(
              params.spotPrice,
              params.domesticRate/100,
              params.foreignRate/100,
              t
            );
            
            for (let i = 0; i < numLocalSims; i++) {
              const path = [underlyingResult.price]; // Start with configured underlying price
              
              for (let step = 0; step < numSteps; step++) {
                const prevPrice = path[path.length - 1];
                // Generate random normal variable
                const randomWalk = Math.random() * 2 - 1; // Simple approximation
                
                // Use the effective sigma (which may be implied volatility)
                const nextPrice = prevPrice * Math.exp(
                  (params.domesticRate/100 - params.foreignRate/100 - 0.5 * Math.pow(effectiveSigma, 2)) * dt + 
                  effectiveSigma * Math.sqrt(dt) * randomWalk
                );
                
                path.push(nextPrice);
              }
              
              localPaths.push(path);
            }
            
            // Calculate price using these paths with correct volatility
          price = calculatePricesFromPaths(
                option.type,
                forward,
                    strike,
                params.domesticRate/100,
              numSteps,
              localPaths,
            barrier,
            secondBarrier
          );
          }
        } else if (
          option.type.includes('one-touch') ||
          option.type.includes('double-touch') ||
          option.type.includes('no-touch') ||
          option.type.includes('double-no-touch') ||
          option.type.includes('range-binary') ||
          option.type.includes('outside-binary')
        ) {
          // Calculer la barrière principale
          const barrier = option.barrierType === 'percent'
            ? params.spotPrice * (option.barrier / 100)
            : option.barrier;
          // Calculer la seconde barrière si besoin
          const secondBarrier = option.type.includes('double')
            ? (option.barrierType === 'percent'
                ? params.spotPrice * (option.secondBarrier / 100)
                : option.secondBarrier)
            : undefined;
          // Calculer le prix digital
          const underlyingResult = PricingService.calculateUnderlyingPrice(
            params.spotPrice,
            params.domesticRate/100,
            params.foreignRate/100,
            t
          );
          price = calculateDigitalOptionPrice(
            option.type,
            underlyingResult.price,
            strike,
            params.domesticRate / 100,
            t,
            option.volatility / 100,
            barrier,
            secondBarrier,
            10000, // nombre de simulations
            option.rebate ?? 1
          );
        }
        } // Fermer le bloc else
            
        return {
          type: option.type,
          price: price,
              quantity: option.quantity/100,
              strike: strike,
              label: optionLabel,
              dynamicStrikeInfo: option.dynamicStrike ? option.dynamicStrikeInfo : undefined
            };
        });

      // Add swap and forward prices
      const allOptionPrices = [
        ...optionPrices,
        ...swaps.map((swap, swapIndex) => ({
          type: 'swap',
          price: swapPrice,
          quantity: swap.quantity/100,
          strike: swap.strike,
          label: `Swap Price ${swapIndex + 1}`
        })),
        ...forwards.map((forwardItem, forwardIndex) => {
          const forwardValue = (forward - forwardItem.strike) * Math.exp(-params.domesticRate/100 * t);
          return {
            type: 'forward',
            price: forwardValue,
            quantity: forwardItem.quantity/100,
            strike: forwardItem.strike,
            label: `Forward ${forwardIndex + 1}`
          };
        })
      ];

        // Calculate strategy price
      const strategyPrice = validateDataForReduce(allOptionPrices).reduce((total, opt) => 
            total + (opt.price * opt.quantity), 0);

        // Calculate payoff using real price
      const totalPayoff = validateDataForReduce(allOptionPrices).reduce((sum, opt, idx) => {
          let payoff = 0;
          
        // Pour les options de la stratégie originale, utiliser l'index original
        // pour retrouver correctement l'état knock-out/knock-in
        const originalIndex = options.findIndex((original, i) => {
          const originalStrike = original.strikeType === 'percent' ? 
            params.spotPrice * (original.strike/100) : original.strike;
          return original.type === opt.type && Math.abs(originalStrike - opt.strike) < 0.001;
        });
        
        const optionId = `${opt.type}-${originalIndex}`;
        
        // Vérifier si l'option est knocked out (pour toutes les options à barrière)
        const isKnockedOut = opt.type.includes('knockout') && barrierCrossings[optionId] && barrierCrossings[optionId][i];
        // Vérifier si l'option est knocked in (pour toutes les options à barrière knock-in)
        const isKnockedIn = opt.type.includes('knockin') && barrierActivations[optionId] && barrierActivations[optionId][i];
        
        if (isKnockedOut) {
          // Si l'option est knocked out, son payoff est 0
          payoff = 0;
        } else if (opt.type.includes('knockin')) {
          // Pour les options knock-in, utiliser l'état stocké
            const isCall = opt.type.includes('call');
            const basePayoff = isCall ? 
            Math.max(0, realPrice - opt.strike) : 
            Math.max(0, opt.strike - realPrice);
          
          // Si l'option est déjà knocked in, elle est active
          payoff = isKnockedIn ? basePayoff : 0;
        } else if (opt.type.includes('knockout') || opt.type.includes('knockin')) {
          // Pour les options knockout, vérifier si le prix actuel franchirait la barrière
          const option = strategy.find(s => s.type === opt.type);
          if (!option) return sum;
          
          const barrier = option.barrierType === 'percent' ? 
            params.spotPrice * (option.barrier / 100) : 
            option.barrier;
            
          const secondBarrier = option.type.includes('double') ? 
            (option.barrierType === 'percent' ? 
              params.spotPrice * (option.secondBarrier / 100) : 
              option.secondBarrier) : 
            undefined;
          
          // Vérifier si le prix actuel franchirait la barrière
          let barrierHit = false;
          
              if (opt.type.includes('reverse')) {
                if (opt.type.includes('put')) {
              barrierHit = realPrice >= barrier; // Reverse Put: hit if above
                } else {
              barrierHit = realPrice <= barrier; // Reverse Call: hit if below
                }
              } else if (opt.type.includes('double')) {
            barrierHit = realPrice >= barrier || (secondBarrier && realPrice <= secondBarrier);
              } else {
                if (opt.type.includes('put')) {
              barrierHit = realPrice <= barrier; // Put: hit if below
                } else {
              barrierHit = realPrice >= barrier; // Call: hit if above
            }
          }
          
          const isCall = opt.type.includes('call');
          const basePayoff = isCall ? 
            Math.max(0, realPrice - opt.strike) : 
            Math.max(0, opt.strike - realPrice);
          
          if (opt.type.includes('knockout')) {
            payoff = barrierHit ? 0 : basePayoff;
            }
          } else if (opt.type === 'call') {
          payoff = Math.max(0, realPrice - opt.strike);
          } else if (opt.type === 'put') {
          payoff = Math.max(0, opt.strike - realPrice);
          } else if (opt.type === 'swap') {
          payoff = forward - realPrice;
          } else if (
            opt.type.includes('one-touch') ||
            opt.type.includes('double-touch') ||
            opt.type.includes('no-touch') ||
            opt.type.includes('double-no-touch') ||
            opt.type.includes('range-binary') ||
            opt.type.includes('outside-binary')
          ) {
            // Pour les options digitales, calculer le payoff réel (rebate ou 0)
            const option = strategy.find(s => s.type === opt.type);
            if (!option) return sum;
            
            // Récupérer les barrières et le rebate
            const barrier = option.barrierType === 'percent' ? 
              params.spotPrice * (option.barrier / 100) : 
              option.barrier;
              
            const secondBarrier = option.type.includes('double') ? 
              (option.barrierType === 'percent' ? 
                params.spotPrice * (option.secondBarrier / 100) : 
                option.secondBarrier) : 
              undefined;
            
            const rebate = option.rebate ?? 1;
            
            // Vérifier si la condition est atteinte en fonction du type d'option
            let conditionAtteinte = false;
            
            if (opt.type.includes('one-touch')) {
              conditionAtteinte = realPrice >= barrier;
            } else if (opt.type.includes('no-touch')) {
              conditionAtteinte = realPrice < barrier;
            } else if (opt.type.includes('double-touch')) {
              const upperBarrier = Math.max(barrier, secondBarrier || 0);
              const lowerBarrier = Math.min(barrier, secondBarrier || Infinity);
              conditionAtteinte = (realPrice >= upperBarrier || realPrice <= lowerBarrier);
            } else if (opt.type.includes('double-no-touch')) {
              const upperBarrier = Math.max(barrier, secondBarrier || 0);
              const lowerBarrier = Math.min(barrier, secondBarrier || Infinity);
              conditionAtteinte = (realPrice < upperBarrier && realPrice > lowerBarrier);
            } else if (opt.type.includes('range-binary')) {
              const upperBarrier = Math.max(barrier, secondBarrier || 0);
              const lowerBarrier = Math.min(barrier, secondBarrier || Infinity);
              conditionAtteinte = (realPrice <= upperBarrier && realPrice >= lowerBarrier);
            } else if (opt.type.includes('outside-binary')) {
              const upperBarrier = Math.max(barrier, secondBarrier || 0);
              const lowerBarrier = Math.min(barrier, secondBarrier || Infinity);
              conditionAtteinte = (realPrice > upperBarrier || realPrice < lowerBarrier);
            }
            
            // Attribuer le rebate ou 0 en fonction de la condition
            payoff = conditionAtteinte ? ((rebate / 100) * monthlyVolume) : 0;
          }
          
            return sum + (payoff * opt.quantity);
        }, 0);

      // Calculer le pourcentage total de swaps dans la stratégie
        const totalSwapPercentage = validateDataForReduce(swaps).reduce((sum, swap) => sum + swap.quantity, 0) / 100;
      
      // Calculer le prix couvert (hedged price) en tenant compte des swaps et du prix réel
        const hedgedPrice = totalSwapPercentage * swapPrice + (1 - totalSwapPercentage) * realPrice;

      // Vérifier si la stratégie contient des options digitales
      const hasDigitalOptions = strategy.some(opt => 
        ['one-touch', 'no-touch', 'double-touch', 'double-no-touch', 'range-binary', 'outside-binary'].includes(opt.type)
      );

      // Calculer le coût hedgé selon la formule d'origine
      // Pour les options digitales, totalPayoff est déjà multiplié par le volume
        const hedgedCost = -(monthlyVolume * hedgedPrice) - 
            (monthlyVolume * (1 - totalSwapPercentage) * strategyPrice) + 
          (hasDigitalOptions ? 
            ((1 - totalSwapPercentage) * totalPayoff) : 
            (monthlyVolume * (1 - totalSwapPercentage) * totalPayoff)
          );
      
      // Calculer le coût non hedgé selon la formule d'origine
      const unhedgedCost = -(monthlyVolume * realPrice);
      
      // Calculer le Delta P&L selon la formule d'origine
      const deltaPnL = hedgedCost - unhedgedCost;

        return {
        date: date.toISOString().split('T')[0],
        timeToMaturity: t,
        forward: forward,
        realPrice: realPrice,
        optionPrices: allOptionPrices,
        strategyPrice: strategyPrice,
        totalPayoff: totalPayoff,
        monthlyVolume: monthlyVolume,
        hedgedCost: hedgedCost,
        unhedgedCost: unhedgedCost,
        deltaPnL: deltaPnL
        };
    });

    // Store complete results for calculations (includes periods before user's start date)
    setResults(detailedResults);
    
    // Show all calculated results (all months to hedge from hedging start date)
    const displayResults = filterResultsForDisplay(detailedResults, params.startDate);
    setDisplayResults(displayResults);
    
    // Après avoir mis à jour toutes les données de résultats, recalculez les simulations Monte Carlo
    // Cette ligne devrait être placée juste avant la fin de la fonction calculateResults
    if (realPriceParams.useSimulation) {
      recalculateMonteCarloSimulations();
    }
  };

  // Initialize display results from saved state if needed
  useEffect(() => {
    if (results && !displayResults) {
      const filteredResults = filterResultsForDisplay(results, params.startDate);
      setDisplayResults(filteredResults);
    }
  }, [results, displayResults, params.startDate]);

  useEffect(() => {
    if (strategy.length > 0) {
      calculatePayoff();
    }
  }, [strategy]);

  // Apply stress test scenario
  const applyStressTest = (key) => {
    setActiveStressTest(key);
    const scenario = stressTestScenarios[key];
    
    // Appliquer le choc de prix au prix spot
    const adjustedPrice = params.spotPrice * (1 + scenario.priceShock);
    
    // Mettre à jour les paramètres de prix réels
    setRealPriceParams(prev => ({
      ...prev,
      useSimulation: !scenario.realBasis, // Désactiver la simulation si on utilise realBasis
      volatility: scenario.volatility,
      drift: scenario.drift
    }));
    
    // Calculer les forward prices et real prices selon le type de scénario
      const newForwards = {};
    const newRealPrices = {};
      
    const months = [];
    const strategyStartDate = new Date(params.strategyStartDate);
      
      for (let i = 0; i < params.monthsToHedge; i++) {
      const date = new Date(strategyStartDate);
      date.getMonth() + i;
      
      const monthKey = `${date.getFullYear()}-${date.getMonth() + 1}`;
        const timeInYears = i / 12;
      
      // Calcul du forward price standard basé sur le taux d'intérêt
      const baseForward = calculateFXForwardPrice(params.spotPrice, params.domesticRate/100, params.foreignRate/100, timeInYears);
      
      // Pour Contango et Backwardation standard, appliquer la base mensuelle aux forwards
      if (scenario.forwardBasis !== undefined) {
        // Pour Contango: augmentation mensuelle (ex: 1.05^mois)
        // Pour Backwardation: diminution mensuelle (ex: 0.95^mois)
        newForwards[monthKey] = baseForward * Math.pow(1 + scenario.forwardBasis, i);
      } else {
        // Si pas de base spécifiée, utiliser le forward standard
        newForwards[monthKey] = baseForward;
      }
      
      // Pour tous les scénarios, appliquer le choc de prix aux prix réels
    if (scenario.realBasis !== undefined) {
        // Pour Contango (Real Prices) et Backwardation (Real Prices)
        newRealPrices[monthKey] = adjustedPrice * Math.pow(1 + scenario.realBasis, i);
      } else {
        // Pour les autres scénarios, appliquer uniquement le choc de prix
        newRealPrices[monthKey] = adjustedPrice;
      }
    }
    
    if (Object.keys(newForwards).length > 0) {
      setManualForwards(newForwards);
    }
    
    if (Object.keys(newRealPrices).length > 0) {
      setRealPrices(newRealPrices);
    }
    
      calculateResults();
  };

  // Update stress test scenario
  const updateScenario = (key: string, field: keyof StressTestScenario, value: number) => {
    setStressTestScenarios(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        [field]: value
      }
    }));
  };

  // Type guard for results
  const isValidResult = (result: any): result is Result => {
    return result && 
      typeof result.hedgedCost === 'number' &&
      typeof result.unhedgedCost === 'number' &&
      typeof result.deltaPnL === 'number' &&
      typeof result.strategyPrice === 'number' &&
      typeof result.monthlyVolume === 'number';
  };

  // Update the yearlyResults calculation with type checking
  const calculateYearlyResults = (results: Result[]) => {
    return validateDataForReduce(results).reduce((acc: Record<string, { 
      hedgedCost: number; 
      unhedgedCost: number; 
      deltaPnL: number;
      strategyPremium: number; // Added this property
    }>, row) => {
      // Corriger l'extraction de l'année - les dates sont maintenant au format ISO (YYYY-MM-DD)
      const year = row.date.split('-')[0];
      if (!acc[year]) {
        acc[year] = {
          hedgedCost: 0,
          unhedgedCost: 0,
          deltaPnL: 0,
          strategyPremium: 0 // Initialize the new property
        };
      }
      if (isValidResult(row)) {
        acc[year].hedgedCost += row.hedgedCost;
        acc[year].unhedgedCost += row.unhedgedCost;
        acc[year].deltaPnL += row.deltaPnL;
        acc[year].strategyPremium += (row.strategyPrice * row.monthlyVolume); // Calculate and add the strategy premium
      }
      return acc;
    }, {});
  };

  // Modifier le gestionnaire de changement du prix spot
  const handleSpotPriceChange = (newPrice: number) => {
    setParams(prev => ({
      ...prev,
      spotPrice: newPrice,
      // Update quote volume when spot price changes
      quoteVolume: prev.baseVolume * newPrice
    }));
    setInitialSpotPrice(newPrice); // Mettre à jour le prix spot initial uniquement lors des modifications manuelles
  };

  // Handle base volume change - update quote volume automatically
  const handleBaseVolumeChange = (newBaseVolume: number) => {
    setParams(prev => ({
      ...prev,
      baseVolume: newBaseVolume,
      quoteVolume: newBaseVolume * prev.spotPrice,
      totalVolume: newBaseVolume // Keep totalVolume in sync for backward compatibility
    }));
  };

  // Handle quote volume change - update base volume automatically
  const handleQuoteVolumeChange = (newQuoteVolume: number) => {
    setParams(prev => ({
      ...prev,
      quoteVolume: newQuoteVolume,
      baseVolume: newQuoteVolume / prev.spotPrice,
      totalVolume: newQuoteVolume / prev.spotPrice // Keep totalVolume in sync for backward compatibility
    }));
  };

  // Function to update price ranges when currency pair or spot price changes
  const updatePriceRangesForFX = () => {
    const newRanges = generateFXPriceRanges(params.currencyPair, params.spotPrice);
    setPriceRanges(newRanges);
  };

  // Add this useEffect near your other useEffect hooks
  useEffect(() => {
    if (!realPriceParams.useSimulation) {
      // When switching to manual mode, initialize real prices with forward prices
      const initialRealPrices = {};
      results?.forEach(row => {
        const date = new Date(row.date);
        const monthKey = `${date.getFullYear()}-${date.getMonth() + 1}`;
        initialRealPrices[monthKey] = row.forward;
      });
      setRealPrices(initialRealPrices);
    }
  }, [realPriceParams.useSimulation]);

  // Auto-update price ranges when currency pair or spot price changes
  useEffect(() => {
    const newRanges = generateFXPriceRanges(params.currencyPair.symbol, params.spotPrice);
    setPriceRanges(newRanges);
  }, [params.currencyPair.symbol, params.spotPrice]);

  const saveScenario = () => {
    if (!results || !payoffData) return;

    const scenario: SavedScenario = {
      id: uuidv4(),
      name: `Scenario ${new Date().toLocaleDateString()}`,
      timestamp: Date.now(),
      params,
      strategy,
      results,
      payoffData,
      stressTest: activeStressTest ? stressTestScenarios[activeStressTest] : null,
      useImpliedVol,
      impliedVolatilities,
      manualForwards,
      realPrices,
      customOptionPrices
    };

    const savedScenarios = JSON.parse(localStorage.getItem('optionScenarios') || '[]');
    savedScenarios.push(scenario);
    localStorage.setItem('optionScenarios', JSON.stringify(savedScenarios));

    toast({
      title: "Scenario Saved",
      description: "Your strategy scenario has been saved successfully!",
    });
  };

  const importToHedgingInstruments = () => {
    if (!strategy || strategy.length === 0) {
      alert('Veuillez d\'abord ajouter au moins un composant de stratégie');
      return;
    }

    if (!params.currencyPair) {
      alert('Veuillez d\'abord sélectionner une paire de devises');
      return;
    }

    if (!results || results.length === 0) {
      alert('Aucun résultat détaillé disponible. Veuillez d\'abord exécuter le calcul.');
      return;
    }

    const strategyName = prompt('Entrez un nom pour cette stratégie:');
    if (!strategyName) return;

    try {
      const importService = StrategyImportService.getInstance();
      
      // ✅ Utiliser tous les résultats calculés (tous les mois à hedger)
      // Les périodes sont maintenant générées directement à partir de la Hedging Start Date
      const filteredResults = filterResultsForDisplay(results, params.startDate);
      
      if (!filteredResults || filteredResults.length === 0) {
        alert('Aucune période à exporter. Vérifiez que la Hedging Start Date est correcte.');
        return;
      }
      
      console.log(`[EXPORT] Hedging Start Date: ${params.startDate}`);
      console.log(`[EXPORT] Total calculated periods: ${results.length}, Exported periods: ${filteredResults.length}`);
      console.log(`[EXPORT] First exported period: ${filteredResults[0].date}`);
      console.log(`[EXPORT] Last exported period: ${filteredResults[filteredResults.length - 1].date}`);
      
      // Préparer les données de résultats détaillés FILTRÉES pour l'import
      // avec informations enrichies pour le re-pricing
      const enrichedDetailedResults = filteredResults.map((result, periodIndex) => {
        const monthKey = `${new Date(result.date).getFullYear()}-${new Date(result.date).getMonth() + 1}`;
        
        // Enrichir chaque résultat avec des informations supplémentaires
        const enrichedResult = {
          ...result,
          // Informations de marché du moment
          marketData: {
            spotPrice: params.spotPrice,
            domesticRate: params.domesticRate,
            foreignRate: params.foreignRate,
            monthKey: monthKey,
            periodIndex: periodIndex
          },
          // ✅ CORRECTION : Volatilités implicites spécifiques du tableau detailed results
          impliedVolatilities: impliedVolatilities[monthKey] || {},
          // Prix personnalisés si utilisés
          customPrices: useCustomOptionPrices ? (customOptionPrices[monthKey] || {}) : {},
          // Forwards manuels si utilisés
          manualForward: manualForwards[monthKey],
          // Prix réels si utilisés
          realPrice: realPrices[monthKey],
          // Informations détaillées sur chaque composant de stratégie
          strategyDetails: strategy.map((component, componentIndex) => {
            // Calculer le strike en valeur absolue
            const absoluteStrike = component.strikeType === 'percent' 
              ? params.spotPrice * (component.strike / 100)
              : component.strike;
            
            // Calculer les barrières en valeur absolue SEULEMENT pour les options barrières
            let absoluteBarrier = undefined;
            let absoluteSecondBarrier = undefined;
            
            if (component.type.includes('knockout') || component.type.includes('knockin') || 
                component.type.includes('touch') || component.type.includes('binary')) {
              absoluteBarrier = component.barrier 
                ? (component.barrierType === 'percent' 
                    ? params.spotPrice * (component.barrier / 100)
                    : component.barrier)
                : undefined;
              
              absoluteSecondBarrier = component.secondBarrier 
                ? (component.barrierType === 'percent' 
                    ? params.spotPrice * (component.secondBarrier / 100)
                    : component.secondBarrier)
                : undefined;
            }

            // ✅ CORRECTION : Obtenir la volatilité effective du tableau Detailed Results
            const optionKey = `${component.type}-${componentIndex}`;
            let effectiveVolatility = component.volatility; // Fallback par défaut
            
            if (useImpliedVol && impliedVolatilities[monthKey]) {
              // Utiliser la volatilité implicite spécifique à l'option si disponible
              const impliedVol = getImpliedVolatility(monthKey, optionKey);
              if (impliedVol !== undefined && impliedVol !== null && impliedVol > 0) {
                effectiveVolatility = impliedVol;
              }
            }

            // Obtenir le prix d'option correspondant depuis les résultats
            const optionPriceData = result.optionPrices[componentIndex];
            
            return {
              componentIndex: componentIndex,
              type: component.type,
              originalStrike: component.strike,
              strikeType: component.strikeType,
              absoluteStrike: absoluteStrike,
              originalVolatility: component.volatility,
              effectiveVolatility: effectiveVolatility,
              quantity: component.quantity,
              // Barrières en valeur absolue (seulement pour les options barrières)
              originalBarrier: (component.type.includes('knockout') || component.type.includes('knockin') || 
                               component.type.includes('touch') || component.type.includes('binary')) 
                               ? component.barrier : undefined,
              absoluteBarrier: absoluteBarrier,
              originalSecondBarrier: (component.type.includes('knockout') || component.type.includes('knockin') || 
                                     component.type.includes('touch') || component.type.includes('binary')) 
                                     ? component.secondBarrier : undefined,
              absoluteSecondBarrier: absoluteSecondBarrier,
              barrierType: (component.type.includes('knockout') || component.type.includes('knockin') || 
                           component.type.includes('touch') || component.type.includes('binary')) 
                           ? component.barrierType : undefined,
              // Rebate pour les options digitales
              rebate: component.rebate,
              // Time to payoff pour les one-touch
              timeToPayoff: component.timeToPayoff,
              // Informations sur le strike dynamique si applicable
              dynamicStrike: component.dynamicStrike,
              dynamicStrikeInfo: optionPriceData?.dynamicStrikeInfo,
              // Prix et données calculées
              calculatedPrice: optionPriceData?.price,
              label: optionPriceData?.label,
              // Prix personnalisé si utilisé
              customPrice: useCustomOptionPrices ? customOptionPrices[monthKey]?.[optionKey] : undefined,
              // Données de re-pricing essentielles
              repricingData: {
                underlyingPrice: result.forward,
                timeToMaturity: result.timeToMaturity,
                domesticRate: params.domesticRate / 100,
                foreignRate: params.foreignRate / 100,
                volatility: effectiveVolatility / 100,
                dividendYield: 0, // Pas applicable pour FX
                // Modèle de pricing utilisé
                pricingModel: 'garman-kohlhagen' // ou le modèle utilisé
              }
            };
          })
        };
        
        return enrichedResult;
      });
      
      const strategyId = importService.importStrategy(strategyName, strategy, {
        currencyPair: params.currencyPair,
        spotPrice: params.spotPrice,
        startDate: params.startDate,           // Hedging Start Date
        strategyStartDate: params.strategyStartDate,   // Strategy Start Date
        monthsToHedge: params.monthsToHedge,
        baseVolume: params.baseVolume,
        quoteVolume: params.quoteVolume,
        domesticRate: params.domesticRate,
        foreignRate: params.foreignRate,
        volumeType: params.volumeType,
        useCustomPeriods: params.useCustomPeriods,
        customPeriods: params.customPeriods,
      }, enrichedDetailedResults); // Passer TOUS les résultats enrichis

      // Dispatch custom event to notify HedgingInstruments page
      window.dispatchEvent(new CustomEvent('hedgingInstrumentsUpdated'));

      // Message d'alerte amélioré avec plus d'informations
      const totalPeriods = enrichedDetailedResults.length;
      const totalComponents = strategy.length;
      alert(`Stratégie "${strategyName}" exportée avec succès vers Instruments de Couverture!\n` +
            `ID de la stratégie: ${strategyId}\n` +
            `Hedging Start Date: ${params.startDate}\n` +
            `Périodes exportées: ${totalPeriods} (filtrées à partir de ${params.startDate})\n` +
            `Composants par période: ${totalComponents}\n` +
            `Total d'instruments créés: ${totalPeriods * totalComponents}`);
    } catch (error) {
      console.error('Erreur lors de l\'export de la stratégie:', error);
      alert('Erreur lors de l\'export de la stratégie. Veuillez réessayer.');
    }
  };

  // Save state when important values change
  useEffect(() => {
    const state: CalculatorState = {
      params,
      strategy,
      results,
      payoffData,
      manualForwards,
      realPrices,
      realPriceParams,
      barrierOptionSimulations,
      barrierPricingModel,
      activeTab,
      customScenario,
      stressTestScenarios,
      useImpliedVol,
      impliedVolatilities
    };
    localStorage.setItem('calculatorState', JSON.stringify(state));
  }, [
    params,
    strategy,
    results,
    payoffData,
    manualForwards,
    realPrices,
    realPriceParams,
    barrierOptionSimulations,
    barrierPricingModel,
    activeTab,
    customScenario,
    stressTestScenarios,
    useImpliedVol,
    impliedVolatilities
  ]);

  const resetScenario = (key: string) => {
    if (DEFAULT_SCENARIOS[key]) {
      setStressTestScenarios(prev => ({
        ...prev,
        [key]: { ...DEFAULT_SCENARIOS[key] }
      }));
    }
  };

  // Fonction pour nettoyer les barrières incorrectes des stratégies existantes
  const cleanStrategyBarriers = () => {
    const cleanedStrategy = strategy.map(component => {
      // Si ce n'est pas une option barrière, supprimer les barrières
      if (!component.type.includes('knockout') && !component.type.includes('knockin') && 
          !component.type.includes('touch') && !component.type.includes('binary')) {
        const { barrier, secondBarrier, barrierType, ...cleanComponent } = component;
        return cleanComponent;
      }
      return component;
    });
    
    setStrategy(cleanedStrategy);
    console.log('Barrières nettoyées pour les options non-barrières');
  };

  // Fonction pour nettoyer le localStorage
  const clearLocalStorage = () => {
    if (confirm('Êtes-vous sûr de vouloir effacer toutes les données sauvegardées ?')) {
      localStorage.removeItem('calculatorState');
      localStorage.removeItem('importedStrategies');
      localStorage.removeItem('hedgingInstruments');
      window.location.reload();
    }
  };

  // Add function to validate data before using reduce operations
  const validateDataForReduce = (data: any, operation: string = 'reduce') => {
    if (!data || !Array.isArray(data)) {
      console.warn(`⚠️ Invalid data for ${operation}:`, data);
      return [];
    }
    return data;
  };

  // Add function to clear loaded scenario
  const clearLoadedScenario = () => {
    try {
      console.log('🧹 Clearing loaded scenario...');
    setParams({
      startDate: new Date().toISOString().split('T')[0],           // Hedging Start Date
      strategyStartDate: new Date().toISOString().split('T')[0],   // Strategy Start Date
      monthsToHedge: 12,
      interestRate: 2.0,
      domesticRate: 1.0,
      foreignRate: 0.5,
      totalVolume: 1000000,
      baseVolume: 1000000,
      quoteVolume: 1000000 * CURRENCY_PAIRS[0].defaultSpotRate,
      spotPrice: CURRENCY_PAIRS[0].defaultSpotRate,
      currencyPair: CURRENCY_PAIRS[0],
      useCustomPeriods: false,
      customPeriods: [],
      volumeType: 'receivable'
    });
    setStrategy([]);
    setResults(null);
    setDisplayResults(null); // Important: clear display results too
    setPayoffData([]);
    setManualForwards({});
    setRealPrices({});
    setRealPriceParams({
      useSimulation: false,
      volatility: 0.3,
      drift: 0,
      numSimulations: 1000
    });
    
    // Réinitialiser les données de volatilité implicite et prix personnalisés
    setUseImpliedVol(false);
    setImpliedVolatilities({});
    setUseCustomOptionPrices(false);
    setCustomOptionPrices({});
    
    // Réinitialiser l'onglet actif
    setActiveTab('parameters');
    
    // Réinitialiser les scénarios de stress test à leurs valeurs par défaut
    setStressTestScenarios({
      base: {
        name: "Base Case",
        description: "Normal market conditions",
        volatility: 0.2,
        drift: 0.01,
        priceShock: 0,
        forwardBasis: 0,
        isEditable: true
      },
      highVol: {
        name: "High Volatility",
        description: "Double volatility scenario",
        volatility: 0.4,
        drift: 0.01,
        priceShock: 0,
        forwardBasis: 0,
        isEditable: true
      },
      crash: {
        name: "Market Crash",
        description: "High volatility, negative drift, price shock",
        volatility: 0.5,
        drift: -0.03,
        priceShock: -0.2,
        forwardBasis: 0,
        isEditable: true
      },
      bull: {
        name: "Bull Market",
        description: "Low volatility, positive drift, upward shock",
        volatility: 0.15,
        drift: 0.02,
        priceShock: 0.1,
        forwardBasis: 0,
        isEditable: true
      },
      contango: {
        name: "Contango",
        description: "Forward prices higher than spot (monthly basis in %)",
        volatility: 0.2,
        drift: 0.01,
        priceShock: 0,
        forwardBasis: 0.01,
        isEditable: true
      },
      backwardation: {
        name: "Backwardation",
        description: "Forward prices lower than spot (monthly basis in %)",
        volatility: 0.2,
        drift: 0.01,
        priceShock: 0,
        forwardBasis: -0.01,
        isEditable: true
      },
      contangoReal: {
        name: "Contango (Real Prices)",
        description: "Real prices higher than spot (monthly basis in %)",
        volatility: 0.2,
        drift: 0.01,
        priceShock: 0,
        realBasis: 0.01,
        isEditable: true
      },
      backwardationReal: {
        name: "Backwardation (Real Prices)",
        description: "Real prices lower than spot (monthly basis in %)",
        volatility: 0.2,
        drift: 0.01,
        priceShock: 0,
        realBasis: -0.01,
        isEditable: true
      },
      custom: {
        name: "Custom Case",
        description: "User-defined scenario",
        volatility: 0.2,
        drift: 0.01,
        priceShock: 0,
        forwardBasis: 0,
        isCustom: true
      }
    });

    // Save the current state but with cleared scenario
    const state: CalculatorState = {
      params: {
        startDate: new Date().toISOString().split('T')[0],
        monthsToHedge: 12,
        interestRate: 2.0,
        domesticRate: 1.0,
        foreignRate: 0.5,
        totalVolume: 1000000,
        baseVolume: 1000000,
        quoteVolume: 1000000 * CURRENCY_PAIRS[0].defaultSpotRate,
        spotPrice: CURRENCY_PAIRS[0].defaultSpotRate,
        currencyPair: CURRENCY_PAIRS[0],
        useCustomPeriods: false,
        customPeriods: [],
        volumeType: 'receivable'
      },
      strategy: [],
      results: null,
      // displayResults removed - not part of CalculatorState interface
      payoffData: [],
      manualForwards: {},
      realPrices: {},
      realPriceParams: {
        useSimulation: false,
        volatility: 0.3,
        drift: 0,
        numSimulations: 1000
      },
      barrierOptionSimulations: 1000,
      barrierPricingModel: 'monte-carlo' as 'monte-carlo' | 'closed-form',
      activeTab: activeTab,
      customScenario: {
        name: "Custom Case",
        description: "User-defined scenario",
        volatility: 0.2,
        drift: 0.01,
        priceShock: 0,
        forwardBasis: 0,
        isCustom: true
      },
      stressTestScenarios: DEFAULT_SCENARIOS,
      useImpliedVol: false,
      impliedVolatilities: {}
    };
    localStorage.setItem('calculatorState', JSON.stringify(state));
    
    console.log('✅ Scenario cleared successfully');
    } catch (error) {
      console.error('❌ Error clearing scenario:', error);
      // Fallback: just clear localStorage and reload
      localStorage.removeItem('calculatorState');
      window.location.reload();
    }
  };

  // PDF export is now handled by Reports page - save scenario first
  const exportToPDF = async () => {
    if (!results || !payoffData) {
      toast({
        title: "No Results",
        description: "Please calculate results first before exporting to PDF.",
        variant: "destructive"
      });
      return;
    }

    // Save the scenario first, then redirect to Reports for PDF export
    const scenario: SavedScenario = {
      id: uuidv4(),
      name: `Scenario ${new Date().toLocaleDateString()}`,
      timestamp: Date.now(),
      params,
      strategy,
      results,
      payoffData,
      stressTest: activeStressTest ? stressTestScenarios[activeStressTest] : null,
      useImpliedVol,
      impliedVolatilities,
      manualForwards,
      realPrices,
      customOptionPrices
    };

    const savedScenarios = JSON.parse(localStorage.getItem('optionScenarios') || '[]');
    savedScenarios.push(scenario);
    localStorage.setItem('optionScenarios', JSON.stringify(savedScenarios));

    toast({
      title: "Scenario Saved",
      description: "Redirecting to Reports page for PDF export...",
    });

    // Navigate to Reports page where PDF export is handled
    window.location.href = '/reports';
  };

  // Ajoutez cette fonction pour gérer les changements de volatilité implicite
  const handleImpliedVolChange = (monthKey: string, value: number) => {
    setImpliedVolatilities(prev => {
      const updated = { ...prev };
      if (!updated[monthKey]) {
        updated[monthKey] = {};
      }
      updated[monthKey].global = value;
      return updated;
    });
    calculateResults();
  };
  
  // Helper function to get implied volatility with the new structure
  const getImpliedVolatility = (monthKey: string, optionKey?: string) => {
    if (!impliedVolatilities[monthKey]) {
      return null;
    }
    
    // If an optionKey is provided and that specific IV exists, return it
    if (optionKey && impliedVolatilities[monthKey][optionKey] !== undefined) {
      const vol = impliedVolatilities[monthKey][optionKey];
      return (vol !== null && vol !== undefined && !isNaN(vol) && vol > 0) ? vol : null;
    }
    
    // Otherwise fall back to the global month IV
    const globalVol = impliedVolatilities[monthKey].global;
    return (globalVol !== null && globalVol !== undefined && !isNaN(globalVol) && globalVol > 0) ? globalVol : null;
  };
  
  // New function to handle per-option implied volatility changes
  const handleOptionImpliedVolChange = (monthKey: string, optionKey: string, value: number) => {
    setImpliedVolatilities(prev => {
      const updated = { ...prev };
      if (!updated[monthKey]) {
        updated[monthKey] = {};
      }
      updated[monthKey][optionKey] = value;
      return updated;
    });
    // Recalculer immédiatement les résultats après chaque changement de valeur
    calculateResults();
  };

  // Fonction pour calculer le prix du swap (moyenne des forwards actualisés)
  const calculateSwapPrice = (forwards: number[], timeToMaturities: number[], r: number) => {
    const weightedSum = validateDataForReduce(forwards).reduce((sum, forward, i) => {
      return sum + forward * Math.exp(-r * timeToMaturities[i]);
    }, 0);
    return weightedSum / forwards.length;
  };

  // Fonction pour ajouter un swap
  const addSwap = () => {
    // Calculer le prix du swap si on a des résultats
    let swapPrice = params.spotPrice;
    if (results) {
      const forwards = results.map(r => r.forward);
      const times = results.map(r => r.timeToMaturity);
              swapPrice = calculateSwapPrice(forwards, times, params.domesticRate/100);
    }

    setStrategy([...strategy, {
      type: 'swap',
      strike: swapPrice,
      strikeType: 'absolute',
      volatility: 0, // Non utilisé pour le swap
      quantity: 100  // 100% par défaut
    }]);
  };

  // Fonction pour ajouter un forward FX
  const addForward = () => {
    // Calculer le taux forward théorique pour 1 an
    const forwardRate = calculateFXForwardPrice(
      params.spotPrice, 
      params.domesticRate / 100, 
      params.foreignRate / 100, 
      1.0 // 1 year
    );

    setStrategy([...strategy, {
      type: 'forward',
      strike: forwardRate,
      strikeType: 'absolute',
      volatility: 0, // Forwards n'ont pas de volatilité
      quantity: 100  // 100% par défaut
    }]);
  };

  // Interface moved to top of file - no need to redeclare here

  // Mettre à jour la fonction de nettoyage CSV
  const cleanCSVLine = (line: string) => {
    return line
      .replace(/\r/g, '')
      .replace(/^"|"$/g, '')
      .split(/[,;\t]/); // Accepte plusieurs délimiteurs
  };

  // Ajouter cet état pour suivre le format CSV sélectionné
  const [csvFormat, setCsvFormat] = useState<'english' | 'french'>('english');

  // Modifier la partie du code qui gère l'importation des données historiques
  const importHistoricalData = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv';
    
    input.onchange = (e: any) => {
      const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
        try {
          const csv = event.target?.result as string;
          const lines = csv.split('\n');
          
          const newData: HistoricalDataPoint[] = [];
          
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            
            // Diviser par virgule ou point-virgule, en tenant compte des guillemets
            const parts = line.split(',').map(part => part.replace(/"/g, '').trim());
            
            if (parts.length < 2) continue;
            
            let dateStr = parts[0];
            let priceStr = parts[1];
            
            // Traiter le format de date selon le format sélectionné
            let date;
            if (csvFormat === 'french') {
              // Format français DD/MM/YYYY
              const [day, month, year] = dateStr.split('/');
              date = new Date(Number(year), Number(month) - 1, Number(day));
            } else {
              // Format anglais MM/DD/YYYY
              const [month, day, year] = dateStr.split('/');
              date = new Date(Number(year), Number(month) - 1, Number(day));
            }
            
            // Traiter le format de prix selon le format sélectionné
            let price;
            if (csvFormat === 'french') {
              // Format français:
              // - Espace ou point comme séparateur de milliers
              // - Virgule comme séparateur décimal
              priceStr = priceStr
                .replace(/\s/g, '') // Supprimer les espaces (séparateurs de milliers)
                .replace(/\./g, '') // Supprimer les points (séparateurs de milliers alternatifs)
                .replace(',', '.'); // Remplacer la virgule par un point pour la conversion
              price = parseFloat(priceStr);
            } else {
              // Format anglais:
              // - Virgule comme séparateur de milliers
              // - Point comme séparateur décimal
              priceStr = priceStr.replace(/,/g, ''); // Supprimer les virgules (séparateurs de milliers)
              price = parseFloat(priceStr);
            }
            
            if (!isNaN(date.getTime()) && !isNaN(price)) {
              newData.push({
                            date: date.toISOString().split('T')[0],
                price
              });
            }
          }
          
          if (newData.length > 0) {
            // Trier les données par date
            const sortedData = newData.sort((a, b) => a.date.localeCompare(b.date));
        setHistoricalData(sortedData);
        calculateMonthlyStats(sortedData);
            console.log("Imported data:", sortedData); // Pour le débogage
            } else {
            alert('No valid data found in the CSV file. Please make sure to select the correct format (French/English).');
          }
          
        } catch (error) {
          console.error('Error parsing CSV:', error);
          alert('Error parsing the CSV file. Please check the format.');
        }
      };
      
        reader.readAsText(file);
    };
    
    input.click();
    };

  // Ajouter cette fonction pour mettre à jour les prix réels et les IV après le calcul des stats mensuelles
  const updateBacktestValues = (stats: MonthlyStats[]) => {
    // Récupérer tous les mois disponibles dans les statistiques
    const newRealPrices: {[key: string]: number} = {};
    const newImpliedVols: OptionImpliedVolatility = {};

    // Parcourir les statistiques mensuelles
    stats.forEach(stat => {
      const [year, month] = stat.month.split('-').map(Number);
      const monthKey = `${year}-${month}`;
      
      // Mettre à jour les prix réels
      newRealPrices[monthKey] = stat.avgPrice;
      
      // Si une volatilité est disponible, la stocker
      if (stat.volatility !== null) {
        if (!newImpliedVols[monthKey]) {
          newImpliedVols[monthKey] = {};
        }
        
        // Stocker la volatilité globale pour le mois
        newImpliedVols[monthKey].global = stat.volatility * 100; // Convertir en pourcentage
        
        // Appliquer également cette volatilité à chaque option de la stratégie
        strategy.forEach((option, index) => {
          // Ignorer les swaps et forwards qui n'utilisent pas de volatilité
          if (option.type !== 'swap' && option.type !== 'forward') {
            const optionKey = `${option.type}-${index}`;
            newImpliedVols[monthKey][optionKey] = stat.volatility * 100; // Convertir en pourcentage
          }
        });
      }
    });

    // Mettre à jour les états
    setRealPrices(newRealPrices);
    setImpliedVolatilities(newImpliedVols);
    setUseImpliedVol(true); // Activer l'utilisation des IV
    
    // Recalculer les résultats avec les nouvelles valeurs
    calculateResults();
  };

  // Update the monthly statistics calculation with intelligent calendar system
  const calculateMonthlyStats = (data: HistoricalDataPoint[]) => {
    // First, validate and filter data
    const validData = data.filter(point => 
      point && 
      point.date && 
      PricingService.isValidDateString(point.date) && 
      typeof point.price === 'number' && 
      !isNaN(point.price)
    );
    
    if (validData.length === 0) {
      console.warn('[BACKTEST] No valid data points found');
      setMonthlyStats([]);
      return;
    }
    
    // Get data range information
    const dateRange = PricingService.getDataDateRange(validData.map(p => p.date));
    if (!dateRange) {
      console.warn('[BACKTEST] Could not determine data range');
      setMonthlyStats([]);
      return;
    }
    
    console.log(`[BACKTEST] Data range: ${dateRange.start.toISOString().split('T')[0]} to ${dateRange.end.toISOString().split('T')[0]}`);
    console.log(`[BACKTEST] Months covered: ${dateRange.months.join(', ')}`);
    
    const monthlyData: { [key: string]: { prices: number[], dates: string[] } } = {};
    
    // Group prices and dates by month
    validData.forEach(point => {
        const date = new Date(point.date);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        if (!monthlyData[monthKey]) {
            monthlyData[monthKey] = { prices: [], dates: [] };
        }
        monthlyData[monthKey].prices.push(point.price);
        monthlyData[monthKey].dates.push(point.date);
    });

    // Calculate statistics for each month using intelligent calendar system
    const stats = Object.entries(monthlyData).map(([month, { prices, dates }]) => {
      // Determine which price to use based on settings
      const exerciseType = PricingService.getBacktestExerciseType();
      let avgPrice: number;
      let calculationMethod = '';
      
      if (exerciseType === 'third-friday') {
        // Use intelligent calendar system to find the 3rd Friday
        const [year, monthNum] = month.split('-').map(Number);
        const thirdFriday = PricingService.getThirdFridayOfMonth(year, monthNum);
        
        if (thirdFriday) {
          // Use the smart date finder to get the closest date in data
          const closestResult = PricingService.findClosestDateInData(thirdFriday, dates);
          
          if (closestResult) {
            avgPrice = prices[closestResult.index];
            calculationMethod = `3rd Friday (${closestResult.date}, ${closestResult.diffDays} days diff)`;
            
            if (closestResult.diffDays > 7) {
              console.warn(`[BACKTEST] ${month}: 3rd Friday data is ${closestResult.diffDays} days away from target date`);
            }
          } else {
            // Fallback to monthly average if no close date found
            avgPrice = validateDataForReduce(prices).reduce((sum, price) => sum + price, 0) / prices.length;
            calculationMethod = 'Monthly average (3rd Friday fallback)';
            console.warn(`[BACKTEST] ${month}: Could not find close date to 3rd Friday, using monthly average`);
          }
        } else {
          // Extremely rare case: no Fridays in month
          avgPrice = prices.reduce((sum, price) => sum + price, 0) / prices.length;
          calculationMethod = 'Monthly average (no 3rd Friday found)';
          console.error(`[BACKTEST] ${month}: No 3rd Friday found, using monthly average`);
        }
      } else {
        // Use monthly average (default behavior)
        avgPrice = prices.reduce((sum, price) => sum + price, 0) / prices.length;
        calculationMethod = `Monthly average (${prices.length} data points)`;
      }
      
      console.log(`[BACKTEST] ${month}: ${calculationMethod} = ${avgPrice.toFixed(4)}`);
      
      // Calculate volatility (same logic as before)
      const returns = prices.slice(1).map((price, i) => 
          Math.log(price / prices[i])
      );
      
      let volatility = null;
      if (returns.length > 0) {
          const avgReturn = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
          const variance = returns.reduce((sum, ret) => 
              sum + Math.pow(ret - avgReturn, 2), 0
          ) / (returns.length - 1);
          volatility = Math.sqrt(variance * 252);
      }

      return { 
        month, 
        avgPrice, 
        volatility,
        dataPoints: prices.length,
        calculationMethod
      };
    });

    // Sort by month (most recent first) and set the statistics
    const sortedStats = stats.sort((a, b) => b.month.localeCompare(a.month));
    setMonthlyStats(sortedStats);
    
    // Add this call with the sorted stats
    updateBacktestValues(sortedStats);
  };

  // Add this function
  const addHistoricalDataRow = () => {
    const today = new Date().toISOString().split('T')[0];
    setHistoricalData([...historicalData, { date: today, price: 0 }]);
  };

  // Add this function too since it's used in the UI
  const clearHistoricalData = () => {
    setHistoricalData([]);
    setMonthlyStats([]);
  };

  // Modify the addCurrentStrategyToMatrix function
  const addCurrentStrategyToMatrix = () => {
    if (strategy.length === 0) {
      alert("Please create a strategy first");
      return;
    }
    
    // Create a deep copy of the current strategy with all properties
    const strategyCopy = strategy.map(opt => ({
      ...opt,
      // Ensure barrier-specific properties are included
      barrier: opt.barrier,
      secondBarrier: opt.secondBarrier,
      barrierType: opt.barrierType || 'percent'
    }));
    
    // Create a name based on the components
    const strategyName = strategyCopy.map(comp => {
      if (comp.type === 'swap') return 'Swap';
      
      // Handle barrier options
      if (comp.type.includes('knockout') || comp.type.includes('knockin')) {
        let optionName = "";
        
        // Determine base type (call/put)
        if (comp.type.includes('call')) {
          optionName = "Call";
        } else {
          optionName = "Put";
        }
        
        // Add barrier type
        if (comp.type.includes('double')) {
          optionName += " Dbl";
        } else if (comp.type.includes('reverse')) {
          optionName += " Rev";
        }
        
        // Add barrier mechanism
        if (comp.type.includes('knockout')) {
          optionName += " KO";
        } else { // knockin
          optionName += " KI";
        }
        
        return optionName;
      }
      
      // Standard options
      return `${comp.type === 'call' ? 'Call' : 'Put'} Option`;
    }).join('/');
    
    setMatrixStrategies([
      ...matrixStrategies,
      {
        components: strategyCopy,
        coverageRatio: 25, // Default 25%
        name: strategyName
      }
    ]);
  };

  // Modify the generateRiskMatrix function to adjust coverage cost according to the ratio
  const generateRiskMatrix = () => {
    // Check if we have results
    if (!results || results.length === 0) {
      alert("Please calculate the results first");
      return;
    }

    // Copy existing results to preserve them
    const existingResults = [...riskMatrixResults];
    const newResults: RiskMatrixResult[] = [];
    
    // For each configured strategy
    matrixStrategies.forEach(strategyConfig => {
      // Check if this strategy already exists in the results
      const existingStrategyIndex = existingResults.findIndex(result => 
        result.name === strategyConfig.name && 
        result.coverageRatio === strategyConfig.coverageRatio
      );
      
      // If the strategy already exists, use the existing results
      if (existingStrategyIndex !== -1) {
        newResults.push(existingResults[existingStrategyIndex]);
        return;
      }
      
      // Otherwise, calculate new results for this strategy
      
      // Calculate the total cost of the strategy taking into account the coverage ratio
      const strategyPremium = validateDataForReduce(results).reduce((sum, row) => {
        // Apply the coverage ratio to the strategy cost
        return sum + (row.strategyPrice * row.monthlyVolume * (strategyConfig.coverageRatio / 100));
      }, 0);
      
      const costs: {[key: string]: number} = {};
      const differences: {[key: string]: number} = {};
      
      // For each price range
      priceRanges.forEach(range => {
        const midPrice = (range.min + range.max) / 2;
        let totalPnL = 0;
        
        // Simulate each month with the constant mid price
        for (let i = 0; i < params.monthsToHedge; i++) {
        const monthlyVolume = params.totalVolume / params.monthsToHedge;
          const coveredVolume = monthlyVolume * (strategyConfig.coverageRatio/100);
          
          // Use the existing strategyPrice from the results
          const strategyPrice = results[Math.min(i, results.length-1)].strategyPrice;
          
          // Calculate the payoff for this mid price using the dedicated function
          const totalPayoff = calculateStrategyPayoffAtPrice(strategyConfig.components, midPrice);

          // Calculate the costs for this month
          const unhedgedCost = -(monthlyVolume * midPrice);
          const hedgedCost = -(monthlyVolume * midPrice) + 
            (coveredVolume * totalPayoff) - 
            (coveredVolume * strategyPrice);
          
          totalPnL += (hedgedCost - unhedgedCost);
        }
        
        // Store the total P&L for this range
        const rangeKey = `${range.min},${range.max}`;
        differences[rangeKey] = totalPnL;
      });
      
      newResults.push({
        strategy: strategyConfig.components,
        coverageRatio: strategyConfig.coverageRatio,
        costs,
        differences,
        hedgingCost: strategyPremium,
        name: strategyConfig.name
      });
    });
    
    setRiskMatrixResults(newResults);
  };

  // Add this function to add a strategy to the matrix
  const addMatrixStrategy = () => {
    if (strategy.length === 0) return;
    
    // Create a deep copy of the current strategy with all properties
    const strategyCopy = strategy.map(opt => ({
      ...opt,
      // Ensure barrier-specific properties are included
      barrier: opt.barrier,
      secondBarrier: opt.secondBarrier,
      barrierType: opt.barrierType || 'percent'
    }));
    
    // Create a name based on the components
    const strategyName = strategyCopy.map(comp => {
      if (comp.type === 'swap') return 'Swap';
      
      // Handle barrier options
      if (comp.type.includes('knockout') || comp.type.includes('knockin')) {
        let optionName = "";
        
        // Determine base type (call/put)
        if (comp.type.includes('call')) {
          optionName = "Call";
        } else {
          optionName = "Put";
        }
        
        // Add barrier type
        if (comp.type.includes('double')) {
          optionName += " Dbl";
        } else if (comp.type.includes('reverse')) {
          optionName += " Rev";
        }
        
        // Add barrier mechanism
        if (comp.type.includes('knockout')) {
          optionName += " KO";
        } else { // knockin
          optionName += " KI";
        }
        
        return optionName;
      }
      
      // Standard options
      return `${comp.type === 'call' ? 'Call' : 'Put'} Option`;
    }).join('/');
    
    setMatrixStrategies([
      ...matrixStrategies,
      {
        components: strategyCopy,
        coverageRatio: 25, // Default 25%
        name: strategyName
      }
    ]);
  };

  // Add this function to calculate the strategy price
  const calculateStrategyPrice = (components: StrategyComponent[]) => {
    let totalPrice = 0;
    
    components.forEach(comp => {
      const strike = comp.strikeType === 'percent' 
        ? params.spotPrice * (comp.strike / 100) 
        : comp.strike;
      
      if (comp.type === 'swap') {
        totalPrice += 0; // Swap has no premium
      } else {
        const optionPrice = calculateOptionPrice(
          comp.type, 
          params.spotPrice, 
          strike, 
          params.domesticRate/100, 
          1, // 1 year as approximation
          comp.volatility/100
        );
        totalPrice += optionPrice * comp.quantity;
      }
    });
    
    return totalPrice;
  };

  // Add this function to calculate the payoff at a given price
  const calculateStrategyPayoffAtPrice = (components: StrategyComponent[], price: number) => {
    let totalPayoff = 0;
    
    components.forEach(comp => {
      const strike = comp.strikeType === 'percent' 
        ? params.spotPrice * (comp.strike / 100) 
        : comp.strike;
      
      let payoff = 0;
      
      if (comp.type === 'swap') {
        // For swaps, the payoff is the difference between the price and the strike
        payoff = (price - strike);
      } else if (comp.type.includes('knockout') || comp.type.includes('knockin')) {
        // Handle barrier options
        const barrier = comp.barrierType === 'percent' 
          ? params.spotPrice * (comp.barrier / 100) 
          : comp.barrier;
        
        const secondBarrier = comp.type.includes('double') 
          ? (comp.barrierType === 'percent' 
            ? params.spotPrice * (comp.secondBarrier / 100) 
            : comp.secondBarrier) 
          : undefined;
          
        // Determine if the barrier is breached
        let isBarrierBroken = false;
        
        if (comp.type.includes('double')) {
          // Double barrier options
          const upperBarrier = Math.max(barrier, secondBarrier || 0);
          const lowerBarrier = Math.min(barrier, secondBarrier || Infinity);
          isBarrierBroken = price >= upperBarrier || price <= lowerBarrier;
        } else if (comp.type.includes('reverse')) {
          // Reverse barrier options
          if (comp.type.includes('put')) {
            // Put Reverse: barrier breached if price is above
            isBarrierBroken = price >= barrier;
          } else {
            // Call Reverse: barrier breached if price is below
            isBarrierBroken = price <= barrier;
          }
        } else {
          // Standard barrier options
          if (comp.type.includes('put')) {
            // Put: barrier breached if price is below
            isBarrierBroken = price <= barrier;
          } else {
            // Call: barrier breached if price is above
            isBarrierBroken = price >= barrier;
          }
        }
        
        // Calculate the base payoff
        const isCall = comp.type.includes('call');
        const basePayoff = isCall 
          ? Math.max(0, price - strike) 
          : Math.max(0, strike - price);
        
        // Determine the final payoff according to the option type
        if (comp.type.includes('knockout')) {
          // For knock-out options, the payoff is zero if the barrier is breached
          payoff = isBarrierBroken ? 0 : basePayoff;
        } else { // knockin
          // For knock-in options, the payoff is non-zero only if the barrier is breached
          payoff = isBarrierBroken ? basePayoff : 0;
        }
      } else if (comp.type === 'call') {
        // Standard call option
        payoff = Math.max(0, price - strike);
      } else { // put
        // Standard put option
        payoff = Math.max(0, strike - price);
      }
      
      // Add the payoff to the total taking into account the quantity
      totalPayoff += payoff * (comp.quantity / 100);
    });
    
    return totalPayoff;
  };

  // Add this function to remove a strategy
  const removeMatrixStrategy = (index: number) => {
    setMatrixStrategies(matrixStrategies.filter((_, i) => i !== index));
  };

  // Update the handleCoverageRatioChange function
  const handleCoverageRatioChange = (index: number, value: number) => {
    const updated = [...matrixStrategies];
    updated[index].coverageRatio = value;
    setMatrixStrategies(updated);
  };

  // Add this function to handle price ranges
  const updatePriceRange = (index: number, field: keyof PriceRange, value: number) => {
    const updated = [...priceRanges];
    updated[index][field] = value;
    setPriceRanges(updated);
  };

  // Add this function to determine cell colors
  const getCellColor = (value: number) => {
    if (value > 0) {
      const intensity = Math.min(value / 100, 1); // Scale appropriately
      return `rgba(0, 128, 0, ${intensity * 0.3})`; // Green
    } else {
      const intensity = Math.min(Math.abs(value) / 100, 1);
      return `rgba(255, 0, 0, ${intensity * 0.3})`; // Red
    }
  };

  // Add a function to clear all strategies
  const clearAllStrategies = () => {
    setMatrixStrategies([]);
    setRiskMatrixResults([]);
  };

  // Add this function to save the risk matrix
  const saveRiskMatrix = () => {
    if (riskMatrixResults.length === 0) {
      alert("No risk matrix results to save");
      return;
    }

    const name = prompt("Enter a name for this risk matrix:", "Risk Matrix " + new Date().toLocaleDateString());
    if (!name) return;

    const newMatrix: SavedRiskMatrix = {
      id: uuidv4(),
      name,
      timestamp: Date.now(),
      priceRanges: [...priceRanges],
      strategies: [...matrixStrategies],
      results: [...riskMatrixResults],
    };

    const updatedMatrices = [...savedRiskMatrices, newMatrix];
    setSavedRiskMatrices(updatedMatrices);
    localStorage.setItem('savedRiskMatrices', JSON.stringify(updatedMatrices));

    alert("Risk matrix saved successfully!");
  };

  // PDF export is now handled by Reports page - save risk matrix first
  const exportRiskMatrixToPDF = async () => {
    if (riskMatrixResults.length === 0) {
      toast({
        title: "No Results",
        description: "No risk matrix results to export.",
        variant: "destructive"
      });
      return;
    }

    // Save the risk matrix to localStorage for Reports page
    const riskMatrixReport = {
      id: uuidv4(),
      name: `Risk Matrix ${new Date().toLocaleDateString()}`,
      timestamp: Date.now(),
      type: 'risk-matrix',
      strategies: riskMatrixResults.map(r => ({
        name: r.name,
        components: strategy,
        coverageRatio: r.coverageRatio
      })),
      priceRanges: priceRanges
    };

    const savedReports = JSON.parse(localStorage.getItem('savedReports') || '[]');
    savedReports.push(riskMatrixReport);
    localStorage.setItem('savedReports', JSON.stringify(savedReports));

    toast({
      title: "Risk Matrix Saved",
      description: "Redirecting to Reports page for PDF export...",
    });

    // Navigate to Reports page where PDF export is handled
    window.location.href = '/reports';
  };

  // Add this function to calculate the expected value of each strategy
  const calculateExpectedValue = (result: RiskMatrixResult) => {
    let expectedValue = 0;
    let totalProbability = 0;
    
    // Iterate over each price range
    priceRanges.forEach(range => {
      const rangeKey = `${range.min},${range.max}`;
      const difference = result.differences[rangeKey]; // Profit/Loss in this range
      const probability = range.probability / 100; // Convert percentage to decimal
      
      // Add the weighted contribution of this range to the expected value
      expectedValue += difference * probability;
      totalProbability += probability;
    });
    
    // Normalize if the probabilities don't sum exactly to 1
    if (totalProbability !== 1) {
      expectedValue = expectedValue / totalProbability;
    }
    
    return expectedValue;
  };

  // Add a function to save the historical backtest results
  const saveHistoricalBacktestResults = () => {
    if (!results) {
      alert("No results to save. Please run the backtest first.");
      return;
    }

    // Ask the user to name their scenario
    const scenarioName = prompt("Scenario name:", "Historical Backtest " + new Date().toLocaleDateString());
    if (!scenarioName) return;

    // Create a new scenario object
    const newScenario: SavedScenario = {
      id: uuidv4(),
      name: scenarioName,
      timestamp: Date.now(),
      params: {...params},
      strategy: [...strategy],
      results: [...results],
      payoffData: [...payoffData],
      // Indicate that it's a historical backtest
      stressTest: {
        name: "Historical Backtest",
        description: "Calculated from historical data",
        volatility: 0,  // These values are not used in the historical backtest
        drift: 0,       // but are needed for the structure
        priceShock: 0,
        isHistorical: true,  // Mark as historical backtest
        historicalData: [...historicalData]  // Add the historical data
      },
      useImpliedVol,
      impliedVolatilities,
      manualForwards,
      realPrices,
      customOptionPrices
    };

    // Get existing scenarios
    const savedScenariosStr = localStorage.getItem('optionScenarios');
    const savedScenarios: SavedScenario[] = savedScenariosStr 
      ? JSON.parse(savedScenariosStr) 
      : [];
    
    // Add the new scenario
    savedScenarios.push(newScenario);
    
    // Save to localStorage
    localStorage.setItem('optionScenarios', JSON.stringify(savedScenarios));
    
    alert("Scenario saved successfully!");
  };

  // PDF export is now handled by Reports page - save backtest first
  const exportHistoricalBacktestToPDF = () => {
    if (!results) {
      toast({
        title: "No Results",
        description: "Please run the backtest first before exporting to PDF.",
        variant: "destructive"
      });
      return;
    }

    // Save the backtest to localStorage for Reports page
    const backtestReport = {
      id: uuidv4(),
      name: `Historical Backtest ${new Date().toLocaleDateString()}`,
      timestamp: Date.now(),
      type: 'backtest',
      params,
      strategy,
      results,
      historicalData,
      monthlyStats
    };

    const savedReports = JSON.parse(localStorage.getItem('savedReports') || '[]');
    savedReports.push(backtestReport);
    localStorage.setItem('savedReports', JSON.stringify(savedReports));

    toast({
      title: "Backtest Saved",
      description: "Redirecting to Reports page for PDF export...",
    });

    // Navigate to Reports page where PDF export is handled
    window.location.href = '/reports';
  };

  // Add this function after clearAllStrategies
  const generateGeneralRiskAnalysis = () => {
    // Check if we have results
    if (!results || results.length === 0) {
      alert("Please calculate the results first");
      return;
    }
    
    // Check if there is at least one strategy
    if (matrixStrategies.length === 0) {
      alert("Please add at least one strategy to the matrix first");
      return;
    }

    // Save existing strategies
    const existingStrategies = [...matrixStrategies];
    
    // Prepare the ratios to apply
    const coverageRatios = [25, 50, 75, 100];
    const analysisStrategies = [];
    
    // For each existing strategy, create versions with different ratios
    existingStrategies.forEach(strategy => {
      // Base name of the strategy 
      const baseName = strategy.name.replace(/\s\d+%$/, ''); // Remove % if already exists
      
      // Create 4 versions with different ratios
      coverageRatios.forEach(ratio => {
        analysisStrategies.push({
          name: `${baseName} ${ratio}%`,
          components: [...strategy.components],
          coverageRatio: ratio
        });
      });
    });
    
    // Set the strategies for the matrix
    setMatrixStrategies(analysisStrategies);
    
    // Generate the matrix with these strategies
    setTimeout(() => {
      generateRiskMatrix();
    }, 100);
  };

  // Add a state to track if the display is in coverage variations mode
  const [showCoverageVariations, setShowCoverageVariations] = useState(false);

  // Add the function to rearrange the matrix display
  const toggleCoverageVariations = () => {
    if (!riskMatrixResults.length) {
      alert("Please generate the risk matrix first");
      return;
    }
    
    setShowCoverageVariations(!showCoverageVariations);
  };

  // Modifier l'affichage du tableau de la matrice de risque
  {riskMatrixResults.length > 0 && (
    <div className="mt-4 overflow-x-auto">
      <h3 className="text-base font-semibold mb-2">Risk Matrix Results</h3>
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className="border p-2">Strategy</th>
            <th className="border p-2">Coverage Ratio</th>
            <th className="border p-2">Hedging Cost (k$)</th>
            {priceRanges.map((range, i) => (
              <th key={i} className="border p-2">{range.probability}%<br/>[{range.min},{range.max}]</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {showCoverageVariations 
            ? riskMatrixResults.flatMap((result, i) => {
                const strategyName = result.name.replace(/\s\d+%$/, '');
                const ratios = [25, 50, 75, 100];
                
                return ratios.map((ratio) => (
                  <tr key={`${i}-${ratio}`}>
                    <td className="border p-2">{strategyName}</td>
                    <td className="border p-2">{ratio}%</td>
                    <td className="border p-2">{((result.hedgingCost / result.coverageRatio) * ratio / 1000).toFixed(1)}</td>
                    
                    {priceRanges.map((range, j) => {
                      const rangeKey = `${range.min},${range.max}`;
                      // Ajuster la valeur en fonction du ratio
                      const adjustedValue = (result.differences[rangeKey] / result.coverageRatio) * ratio;
                      
                      return (
                        <td 
                          key={j} 
                          className="border p-2"
                          style={{ backgroundColor: getCellColor(adjustedValue) }}
                        >
                          {(adjustedValue / 1000).toFixed(1)}
                        </td>
                      );
                    })}
                  </tr>
                ));
              })
            : riskMatrixResults.map((result, i) => (
                <tr key={i}>
                  <td className="border p-2">{result.name}</td>
                  <td className="border p-2">{result.coverageRatio}%</td>
                  <td className="border p-2">{(result.hedgingCost / 1000).toFixed(1)}</td>
                  
                  {priceRanges.map((range, j) => {
                    const rangeKey = `${range.min},${range.max}`;
                    return (
                      <td 
                        key={j} 
                        className="border p-2"
                        style={{ backgroundColor: getCellColor(result.differences[rangeKey]) }}
                      >
                        {(result.differences[rangeKey] / 1000).toFixed(1)}
                      </td>
                    );
                  })}
                </tr>
              ))
          }
        </tbody>
      </table>
    </div>
  )}

  // Add this near the other state variables
  const [showMonteCarloVisualization, setShowMonteCarloVisualization] = useState<boolean>(false);
  
  // Generate months and startDate for simulations
  const startDate = new Date(params.strategyStartDate);
  const months = Array.from({ length: params.monthsToHedge }, (_, i) => {
    const date = new Date(startDate);
    date.setMonth(date.getMonth() + i + 1);
    return date;
  });
  
  // Store simulation data
  const [simulationData, setSimulationData] = useState<SimulationData | null>(null);
  const [isRunningSimulation, setIsRunningSimulation] = useState<boolean>(false);

  // Ajoutez cette fonction pour recalculer les simulations Monte Carlo lorsque les paramètres changent
  const recalculateMonteCarloSimulations = useCallback(() => {
    if (!results) return;
    
    setIsRunningSimulation(true);

    // Récupérer les mois et date de début pour les simulations
    const startDate = new Date(params.strategyStartDate);
    let months = [];
    
    // Check if using custom periods
    if (params.useCustomPeriods && params.customPeriods.length > 0) {
      // Sort custom periods by maturity date
      const sortedPeriods = [...params.customPeriods].sort(
        (a, b) => new Date(a.maturityDate).getTime() - new Date(b.maturityDate).getTime()
      );
      
      // Use the maturity dates from custom periods
      months = sortedPeriods.map(period => new Date(period.maturityDate));
    } else {
      // Use the standard month generation logic
    let currentDate = new Date(startDate);

    const lastDayOfStartMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
    const remainingDaysInMonth = lastDayOfStartMonth.getDate() - currentDate.getDate() + 1;

    if (remainingDaysInMonth > 0) {
      months.push(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0));
    }

    for (let i = 0; i < params.monthsToHedge - (remainingDaysInMonth > 0 ? 1 : 0); i++) {
      currentDate.setMonth(currentDate.getMonth() + 1);
      months.push(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0));
      }
    }

    // Générer les chemins de prix pour toute la période seulement si la simulation est activée
    let paths = [];
    let monthlyIndices = [];
    let timeLabels = [];
    let realPricePaths = [];
    
    // Générer des chemins de prix seulement si la simulation est activée
    if (realPriceParams.useSimulation) {
      const pathsData = generatePricePathsForPeriod(months, startDate, realPriceParams.numSimulations);
      paths = pathsData.paths;
      monthlyIndices = pathsData.monthlyIndices;
      
      // Préparer les données de visualisation Monte Carlo
      timeLabels = months.map(
        (date) => `${date.getFullYear()}-${date.getMonth() + 1}`
      );

      // Sélectionner aléatoirement jusqu'à 100 chemins à afficher
      const maxDisplayPaths = Math.min(100, paths.length);
      const selectedPathIndices = [];
      
      // Si nous avons moins de 100 chemins, utilisez-les tous
      if (paths.length <= maxDisplayPaths) {
        for (let i = 0; i < paths.length; i++) {
          selectedPathIndices.push(i);
        }
      } else {
        // Sinon, sélectionnez 100 indices aléatoires
        while (selectedPathIndices.length < maxDisplayPaths) {
          const randomIndex = Math.floor(Math.random() * paths.length);
          if (!selectedPathIndices.includes(randomIndex)) {
            selectedPathIndices.push(randomIndex);
          }
        }
      }
      
      // Créer les données de chemins de prix réels
      realPricePaths = selectedPathIndices.map(pathIndex => 
        monthlyIndices.map(idx => paths[pathIndex][idx])
      );
    } else {
      // Si la simulation n'est pas utilisée, nous avons quand même besoin de timeLabels pour les options à barrière
      timeLabels = months.map(
        (date) => `${date.getFullYear()}-${date.getMonth() + 1}`
      );
      
      // Générer des chemins simples pour les options barrière si nécessaire
      // Même si useSimulation est false, nous voulons générer des chemins pour les options barrière
      const pathsData = generatePricePathsForPeriod(months, startDate, 100); // Utiliser seulement 100 simulations pour les options barrière
      paths = pathsData.paths;
      monthlyIndices = pathsData.monthlyIndices;
    }

    // Calculer les prix des options à barrière si nous en avons, même si useSimulation est false
    const barrierOptions = strategy.filter(
      (opt) => opt.type.includes('knockout') || opt.type.includes('knockin')
    );

    const barrierOptionPricePaths: number[][] = [];

    if (barrierOptions.length > 0) {
      // Génération de chemins spécifiques pour les options à barrière
      const barrierPathsData = generatePricePathsForPeriod(months, startDate, barrierOptionSimulations);
      const barrierPaths = barrierPathsData.paths;
      const barrierMonthlyIndices = barrierPathsData.monthlyIndices;
      
      // Sélectionner les chemins à utiliser pour l'affichage (soit tous si peu nombreux, soit un échantillon aléatoire)
      const maxDisplayPaths = Math.min(100, barrierPaths.length);
      const selectedPathIndices = [];
      
      // Si nous avons moins de 100 chemins, utilisez-les tous
      if (barrierPaths.length <= maxDisplayPaths) {
        for (let i = 0; i < barrierPaths.length; i++) {
          selectedPathIndices.push(i);
        }
      } else {
        // Sinon, sélectionnez 100 indices aléatoires
        while (selectedPathIndices.length < maxDisplayPaths) {
          const randomIndex = Math.floor(Math.random() * barrierPaths.length);
          if (!selectedPathIndices.includes(randomIndex)) {
            selectedPathIndices.push(randomIndex);
          }
        }
      }

      // Pour simplifier, utilisez la première option à barrière
      const barrierOption = barrierOptions[0];
      
      // Calculer la valeur de la barrière
      const barrier = barrierOption.barrierType === 'percent' 
        ? params.spotPrice * (barrierOption.barrier! / 100) 
        : barrierOption.barrier!;
      
      const secondBarrier = barrierOption.type.includes('double')
        ? barrierOption.barrierType === 'percent'
          ? params.spotPrice * (barrierOption.secondBarrier! / 100)
          : barrierOption.secondBarrier
        : undefined;
        
      // Calculer le strike
      const strike = barrierOption.strikeType === 'percent'
        ? params.spotPrice * (barrierOption.strike / 100)
        : barrierOption.strike;

      // Calculer les prix des options pour les chemins sélectionnés
      for (const pathIndex of selectedPathIndices) {
        const path = barrierPaths[pathIndex];
        const optionPrices: number[] = [];
        
        // Pour chaque mois, calculer le prix de l'option
        for (let monthIdx = 0; monthIdx < barrierMonthlyIndices.length; monthIdx++) {
          const maturityIndex = barrierMonthlyIndices[monthIdx];
          
          // Calculer le prix de l'option à ce point
          const optionPrice = calculatePricesFromPaths(
            barrierOption.type,
            params.spotPrice,
            strike,
            params.domesticRate/100,
            maturityIndex,
            [path],
            barrier,
            secondBarrier
          );
          
          optionPrices.push(optionPrice);
        }
        
        barrierOptionPricePaths.push(optionPrices);
      }
    }

    // Mettre à jour les données de visualisation avec les chemins calculés
    setSimulationData({
      realPricePaths,
      timeLabels,
      strategyName: barrierOptions.length > 0 
        ? `${barrierOptions[0].type} at ${barrierOptions[0].strike}` 
        : 'Current Strategy',
    });

    setIsRunningSimulation(false);
  }, [params, realPriceParams.numSimulations, strategy, results, barrierOptionSimulations]);

  // Update the realPriceParams and recalculate when numSimulations changes
  const handleNumSimulationsChange = (value: number) => {
    // Ensure value is between 100 and 5000
    const validValue = Math.max(100, Math.min(5000, value));
    
    setRealPriceParams(prev => ({
      ...prev,
      numSimulations: validValue
    }));
    
    // Recalculer les simulations avec le nouveau nombre de simulations
    if (results && realPriceParams.useSimulation) {
      recalculateMonteCarloSimulations();
    }
  };

  // Mise à jour du nombre de simulations pour les options à barrière
  useEffect(() => {
    if (results && strategy.some(opt => opt.type.includes('knockout') || opt.type.includes('knockin'))) {
      recalculateMonteCarloSimulations();
    }
  }, [barrierOptionSimulations, recalculateMonteCarloSimulations, results, strategy]);

  // Ajouter un effet useEffect pour recalculer les simulations Monte Carlo lorsque useSimulation change
  useEffect(() => {
    if (results) {
      recalculateMonteCarloSimulations();
    }
  }, [realPriceParams.useSimulation, recalculateMonteCarloSimulations, results]);
  
  // Function to add a new custom period
  const addCustomPeriod = () => {
    // Calculate a default maturity date one month from the strategy start date
    const startDate = new Date(params.strategyStartDate);
    startDate.setMonth(startDate.getMonth() + params.customPeriods.length + 1);
    
    // Create a new custom period with default values
    const newPeriod: CustomPeriod = {
      maturityDate: startDate.toISOString().split('T')[0],
      volume: Math.round(params.baseVolume / (params.customPeriods.length + 1))
    };
    
    // Update the params with the new period
    setParams({
      ...params,
      customPeriods: [...params.customPeriods, newPeriod]
    });
  };
  
  // Function to remove a custom period
  const removeCustomPeriod = (index: number) => {
    const updatedPeriods = [...params.customPeriods];
    updatedPeriods.splice(index, 1);
    
    setParams({
      ...params,
      customPeriods: updatedPeriods
    });
  };
  
  // Function to update a custom period
  const updateCustomPeriod = (index: number, field: keyof CustomPeriod, value: string | number) => {
    const updatedPeriods = [...params.customPeriods];
    updatedPeriods[index] = {
      ...updatedPeriods[index],
      [field]: value
    };
    
    setParams({
      ...params,
      customPeriods: updatedPeriods
    });
  };
  
  // Function to toggle between using standard months or custom periods
  const toggleCustomPeriods = () => {
    // If switching to custom periods for the first time, initialize with one period
    if (!params.useCustomPeriods && params.customPeriods.length === 0) {
      const startDate = new Date(params.strategyStartDate);
      startDate.setMonth(startDate.getMonth() + 1);
      
      setParams({
        ...params,
        useCustomPeriods: !params.useCustomPeriods,
        customPeriods: [
          {
            maturityDate: startDate.toISOString().split('T')[0],
            volume: params.baseVolume
          }
        ]
      });
    } else {
      setParams({
        ...params,
        useCustomPeriods: !params.useCustomPeriods
      });
    }
    
    // Recalculate results if they exist
    if (results) {
      recalculateResults();
    }
  };

  // Fonction pour calculer le prix des options à barrière avec formules fermées
  const calculateBarrierOptionClosedForm = (
    optionType: string,
    S: number,      // Current price
    K: number,      // Strike price
    r: number,      // Risk-free rate
    t: number,      // Time to maturity in years
    sigma: number,  // Volatility
    barrier: number, // Barrier level
    secondBarrier?: number // Second barrier for double barrier options
  ) => {
    // Paramètres fondamentaux selon les notations du code VBA
    const b = r;  // Cost of carry (peut être ajusté pour dividendes)
    const v = sigma; // Pour garder la même notation que le code VBA
    const T = t;    // Pour garder la même notation que le code VBA
    
    // Fonction pour calculer N(x) - cumulative normal distribution
    const CND = (x) => (1 + erf(x / Math.sqrt(2))) / 2;
    
    // PARTIE 1: Options à barrière simple
    if (!optionType.includes('double')) {
      // Calcul des paramètres de base
      const mu = (b - v**2/2) / (v**2);
      const lambda = Math.sqrt(mu**2 + 2*r/(v**2));
      
      // Paramètres pour les options à barrière simple selon le code VBA
      const X = K; // Le strike price
      const H = barrier; // La barrière
      
      const X1 = Math.log(S/X) / (v * Math.sqrt(T)) + (1 + mu) * v * Math.sqrt(T);
      const X2 = Math.log(S/H) / (v * Math.sqrt(T)) + (1 + mu) * v * Math.sqrt(T);
      const y1 = Math.log(H**2/(S*X)) / (v * Math.sqrt(T)) + (1 + mu) * v * Math.sqrt(T);
      const y2 = Math.log(H/S) / (v * Math.sqrt(T)) + (1 + mu) * v * Math.sqrt(T);
      const Z = Math.log(H/S) / (v * Math.sqrt(T)) + lambda * v * Math.sqrt(T);
      
      // Variables binaires eta et phi selon le type d'option
      let eta = 0, phi = 0;
      let TypeFlag = "";
      
      // Déterminer le TypeFlag basé sur le type d'option
      if (optionType === 'call-knockin' && !optionType.includes('reverse') && H < S) {
        TypeFlag = "cdi"; // Call down-and-in
        eta = 1;
        phi = 1;
      } else if (optionType === 'call-knockin' && !optionType.includes('reverse') && H > S) {
        TypeFlag = "cui"; // Call up-and-in
        eta = -1;
        phi = 1;
      } else if (optionType === 'put-knockin' && !optionType.includes('reverse') && H < S) {
        TypeFlag = "pdi"; // Put down-and-in
        eta = 1;
        phi = -1;
      } else if (optionType === 'put-knockin' && !optionType.includes('reverse') && H > S) {
        TypeFlag = "pui"; // Put up-and-in
        eta = -1;
        phi = -1;
      } else if (optionType === 'call-knockout' && !optionType.includes('reverse') && H < S) {
        TypeFlag = "cdo"; // Call down-and-out
        eta = 1;
        phi = 1;
      } else if (optionType === 'call-knockout' && !optionType.includes('reverse') && H > S) {
        TypeFlag = "cuo"; // Call up-and-out
        eta = -1;
        phi = 1;
      } else if (optionType === 'put-knockout' && !optionType.includes('reverse') && H < S) {
        TypeFlag = "pdo"; // Put down-and-out
        eta = 1;
        phi = -1;
      } else if (optionType === 'put-knockout' && !optionType.includes('reverse') && H > S) {
        TypeFlag = "puo"; // Put up-and-out
        eta = -1;
        phi = -1;
      } else if (optionType === 'call-reverse-knockin') {
        // Équivalent à put-up-and-in
        TypeFlag = "pui";
        eta = -1;
        phi = -1;
      } else if (optionType === 'call-reverse-knockout') {
        // Équivalent à put-up-and-out
        TypeFlag = "puo";
        eta = -1;
        phi = -1;
      } else if (optionType === 'put-reverse-knockin') {
        // Équivalent à call-up-and-in
        TypeFlag = "cui";
        eta = -1;
        phi = 1;
      } else if (optionType === 'put-reverse-knockout') {
        // Équivalent à call-up-and-out
        TypeFlag = "cuo";
        eta = -1;
        phi = 1;
      }
      
      // Si le type d'option n'est pas reconnu, utiliser Monte Carlo
      if (TypeFlag === "") {
        return calculateBarrierOptionPrice(optionType, S, K, r, t, sigma, barrier, secondBarrier, barrierOptionSimulations);
      }
      
      // Calculer les termes f1-f6 selon le code VBA
      const f1 = phi * S * Math.exp((b-r)*T) * CND(phi*X1) - 
                phi * X * Math.exp(-r*T) * CND(phi*X1 - phi*v*Math.sqrt(T));
                
      const f2 = phi * S * Math.exp((b-r)*T) * CND(phi*X2) - 
                phi * X * Math.exp(-r*T) * CND(phi*X2 - phi*v*Math.sqrt(T));
                
      const f3 = phi * S * Math.exp((b-r)*T) * (H/S)**(2*(mu+1)) * CND(eta*y1) - 
                phi * X * Math.exp(-r*T) * (H/S)**(2*mu) * CND(eta*y1 - eta*v*Math.sqrt(T));
                
      const f4 = phi * S * Math.exp((b-r)*T) * (H/S)**(2*(mu+1)) * CND(eta*y2) - 
                phi * X * Math.exp(-r*T) * (H/S)**(2*mu) * CND(eta*y2 - eta*v*Math.sqrt(T));
      
      // K représente le cash rebate, généralement 0 pour les options standards
      const cashRebate = 0;
      
      const f5 = cashRebate * Math.exp(-r*T) * (CND(eta*X2 - eta*v*Math.sqrt(T)) - 
              (H/S)**(2*mu) * CND(eta*y2 - eta*v*Math.sqrt(T)));
              
      const f6 = cashRebate * ((H/S)**(mu+lambda) * CND(eta*Z) + 
              (H/S)**(mu-lambda) * CND(eta*Z - 2*eta*lambda*v*Math.sqrt(T)));
      
      // Calculer le prix selon le TypeFlag et la relation entre X et H
      let optionPrice = 0;
      
      if (X > H) {
        switch (TypeFlag) {
          case "cdi": optionPrice = f3 + f5; break;
          case "cui": optionPrice = f1 + f5; break;
          case "pdi": optionPrice = f2 - f3 + f4 + f5; break;
          case "pui": optionPrice = f1 - f2 + f4 + f5; break;
          case "cdo": optionPrice = f1 - f3 + f6; break;
          case "cuo": optionPrice = f6; break;
          case "pdo": optionPrice = f1 - f2 + f3 - f4 + f6; break;
          case "puo": optionPrice = f2 - f4 + f6; break;
        }
      } else if (X < H) {
        switch (TypeFlag) {
          case "cdi": optionPrice = f1 - f2 + f4 + f5; break;
          case "cui": optionPrice = f2 - f3 + f4 + f5; break;
          case "pdi": optionPrice = f1 + f5; break;
          case "pui": optionPrice = f3 + f5; break;
          case "cdo": optionPrice = f2 - f4 + f6; break;
          case "cuo": optionPrice = f1 - f2 + f3 - f4 + f6; break;
          case "pdo": optionPrice = f6; break;
          case "puo": optionPrice = f1 - f3 + f6; break;
        }
      }
      
      // S'assurer que le prix de l'option n'est jamais négatif
      return Math.max(0, optionPrice);
    }
    // PARTIE 2: Options à double barrière
    else if (secondBarrier) {
      // Variables pour les options à double barrière selon le code VBA
      const X = K; // Strike price
      const L = Math.min(barrier, secondBarrier); // Barrière inférieure
      const U = Math.max(barrier, secondBarrier); // Barrière supérieure
      
      // Paramètres pour les formules de double barrière
      const delta1 = 0; // Taux de croissance des barrières (généralement 0)
      const delta2 = 0; // Taux de dividende (dans notre cas, 0)
      
      // Déterminer le TypeFlag en fonction du type d'option
      let TypeFlag = "";
      if (optionType.includes('call-double-knockout')) {
        TypeFlag = "co"; // Call double-knockout (out)
      } else if (optionType.includes('call-double-knockin')) {
        TypeFlag = "ci"; // Call double-knockin (in)
      } else if (optionType.includes('put-double-knockout')) {
        TypeFlag = "po"; // Put double-knockout (out)
      } else if (optionType.includes('put-double-knockin')) {
        TypeFlag = "pi"; // Put double-knockin (in)
      }
      
      // Si le type n'est pas reconnu, utiliser Monte Carlo
      if (TypeFlag === "") {
        return calculateBarrierOptionPrice(optionType, S, K, r, t, sigma, barrier, secondBarrier, barrierOptionSimulations);
      }
      
      // Calculer les variables F et E selon le code VBA
      const F = U * Math.exp(delta1 * T);
      const E = L * Math.exp(delta1 * T);
      
      let Sum1 = 0;
      let Sum2 = 0;
      
      // Pour les options call double-barrière (ci/co)
      if (TypeFlag === "co" || TypeFlag === "ci") {
        // Somme sur un nombre fini de termes (-5 à 5 dans le code VBA)
        for (let n = -5; n <= 5; n++) {
          const d1 = (Math.log(S * U ** (2 * n) / (X * L ** (2 * n))) + (b + v ** 2 / 2) * T) / (v * Math.sqrt(T));
          const d2 = (Math.log(S * U ** (2 * n) / (F * L ** (2 * n))) + (b + v ** 2 / 2) * T) / (v * Math.sqrt(T));
          const d3 = (Math.log(L ** (2 * n + 2) / (X * S * U ** (2 * n))) + (b + v ** 2 / 2) * T) / (v * Math.sqrt(T));
          const d4 = (Math.log(L ** (2 * n + 2) / (F * S * U ** (2 * n))) + (b + v ** 2 / 2) * T) / (v * Math.sqrt(T));
          
          const mu1 = 2 * (b - delta2 - n * (delta1 - delta2)) / v ** 2 + 1;
          const mu2 = 2 * n * (delta1 - delta2) / v ** 2;
          const mu3 = 2 * (b - delta2 + n * (delta1 - delta2)) / v ** 2 + 1;
          
          Sum1 += (U ** n / L ** n) ** mu1 * (L / S) ** mu2 * (CND(d1) - CND(d2)) - 
                (L ** (n + 1) / (U ** n * S)) ** mu3 * (CND(d3) - CND(d4));
                
          Sum2 += (U ** n / L ** n) ** (mu1 - 2) * (L / S) ** mu2 * (CND(d1 - v * Math.sqrt(T)) - CND(d2 - v * Math.sqrt(T))) - 
                (L ** (n + 1) / (U ** n * S)) ** (mu3 - 2) * (CND(d3 - v * Math.sqrt(T)) - CND(d4 - v * Math.sqrt(T)));
        }
      }
      // Pour les options put double-barrière (pi/po)
      else if (TypeFlag === "po" || TypeFlag === "pi") {
        // Somme sur un nombre fini de termes (-5 à 5 dans le code VBA)
        for (let n = -5; n <= 5; n++) {
          const d1 = (Math.log(S * U ** (2 * n) / (E * L ** (2 * n))) + (b + v ** 2 / 2) * T) / (v * Math.sqrt(T));
          const d2 = (Math.log(S * U ** (2 * n) / (X * L ** (2 * n))) + (b + v ** 2 / 2) * T) / (v * Math.sqrt(T));
          const d3 = (Math.log(L ** (2 * n + 2) / (E * S * U ** (2 * n))) + (b + v ** 2 / 2) * T) / (v * Math.sqrt(T));
          const d4 = (Math.log(L ** (2 * n + 2) / (X * S * U ** (2 * n))) + (b + v ** 2 / 2) * T) / (v * Math.sqrt(T));
          
          const mu1 = 2 * (b - delta2 - n * (delta1 - delta2)) / v ** 2 + 1;
          const mu2 = 2 * n * (delta1 - delta2) / v ** 2;
          const mu3 = 2 * (b - delta2 + n * (delta1 - delta2)) / v ** 2 + 1;
          
          Sum1 += (U ** n / L ** n) ** mu1 * (L / S) ** mu2 * (CND(d1) - CND(d2)) - 
                (L ** (n + 1) / (U ** n * S)) ** mu3 * (CND(d3) - CND(d4));
                
          Sum2 += (U ** n / L ** n) ** (mu1 - 2) * (L / S) ** mu2 * (CND(d1 - v * Math.sqrt(T)) - CND(d2 - v * Math.sqrt(T))) - 
                (L ** (n + 1) / (U ** n * S)) ** (mu3 - 2) * (CND(d3 - v * Math.sqrt(T)) - CND(d4 - v * Math.sqrt(T)));
        }
      }
      
      // Calculer OutValue selon le type d'option
      let OutValue = 0;
      if (TypeFlag === "co" || TypeFlag === "ci") {
        OutValue = S * Math.exp((b - r) * T) * Sum1 - X * Math.exp(-r * T) * Sum2;
      } else if (TypeFlag === "po" || TypeFlag === "pi") {
        OutValue = X * Math.exp(-r * T) * Sum2 - S * Math.exp((b - r) * T) * Sum1;
      }
      
      // Fonction pour calculer le prix Black-Scholes standard
      const GBlackScholes = (type, S, X, T, r, b, v) => {
        const d1 = (Math.log(S / X) + (b + v ** 2 / 2) * T) / (v * Math.sqrt(T));
        const d2 = d1 - v * Math.sqrt(T);
        
        if (type === "c") {
          return S * Math.exp((b - r) * T) * CND(d1) - X * Math.exp(-r * T) * CND(d2);
        } else { // type === "p"
          return X * Math.exp(-r * T) * CND(-d2) - S * Math.exp((b - r) * T) * CND(-d1);
        }
      };
      
      // Calculer le prix final selon le TypeFlag (appliquer la relation de parité pour les knockin)
      let optionPrice = 0;
      if (TypeFlag === "co") {
        optionPrice = OutValue;
      } else if (TypeFlag === "po") {
        optionPrice = OutValue;
      } else if (TypeFlag === "ci") {
        // Pour les options knockin, utiliser la relation: knockin + knockout = vanille
        optionPrice = GBlackScholes("c", S, X, T, r, b, v) - OutValue;
      } else if (TypeFlag === "pi") {
        // Pour les options knockin, utiliser la relation: knockin + knockout = vanille
        optionPrice = GBlackScholes("p", S, X, T, r, b, v) - OutValue;
      }
      
      // S'assurer que le prix de l'option n'est jamais négatif
      return Math.max(0, optionPrice);
    }
    
    // Si nous arrivons ici, c'est que le type d'option n'est pas supporté
    return calculateBarrierOptionPrice(optionType, S, K, r, t, sigma, barrier, secondBarrier, barrierOptionSimulations);
  };

  const [barrierValue, setBarrierValue] = useState<number | null>(null);
  const [secondBarrierValue, setSecondBarrierValue] = useState<number | null>(null);

  // Fonction pour calculer la volatilité implicite à partir d'un prix d'option observé
  const calculateImpliedVolatility = (
    optionType: string,
    S: number,      // Prix actuel du sous-jacent
    K: number,      // Prix d'exercice
    r: number,      // Taux sans risque
    t: number,      // Temps jusqu'à maturité en années
    observedPrice: number,  // Prix de l'option observé sur le marché
    epsilon: number = 0.0001, // Précision souhaitée
    maxIterations: number = 100 // Nombre maximum d'itérations
  ): number => {
    // Pour les options à barrière ou complexes, cette fonction est plus difficile à implémenter
    // Dans ce cas, nous nous limitons aux calls et puts vanille
    if (optionType !== 'call' && optionType !== 'put') {
      return 0; // Retourner une valeur par défaut pour les options non supportées
    }

    // Méthode de Newton-Raphson pour trouver la volatilité implicite
    let sigma = 0.20; // Valeur initiale
    let vega = 0;
    let price = 0;
    let diff = 0;
    let iteration = 0;

    while (iteration < maxIterations) {
      // Calcul du prix avec la volatilité courante
      const d1 = (Math.log(S/K) + (r + sigma*sigma/2)*t) / (sigma*Math.sqrt(t));
      const d2 = d1 - sigma*Math.sqrt(t);
      
      const Nd1 = (1 + erf(d1/Math.sqrt(2)))/2;
      const Nd2 = (1 + erf(d2/Math.sqrt(2)))/2;
      
      if (optionType === 'call') {
        price = S*Nd1 - K*Math.exp(-r*t)*Nd2;
      } else { // put
        price = K*Math.exp(-r*t)*(1-Nd2) - S*(1-Nd1);
      }
      
      // Différence entre le prix calculé et le prix observé
      diff = price - observedPrice;
      
      // Vérifier si la précision souhaitée est atteinte
      if (Math.abs(diff) < epsilon) {
        break;
      }
      
      // Calcul de la vega (dérivée du prix par rapport à la volatilité)
      vega = S * Math.sqrt(t) * (1/Math.sqrt(2*Math.PI)) * Math.exp(-d1*d1/2);
      
      // Mise à jour de sigma selon la méthode de Newton-Raphson
      sigma = sigma - diff / vega;
      
      // Empêcher sigma de devenir négatif ou trop petit
      if (sigma <= 0.001) {
        sigma = 0.001;
      }
      
      // Empêcher sigma de devenir trop grand
      if (sigma > 1) {
        sigma = 1;
      }
      
      iteration++;
    }
    
    // Retourner la volatilité implicite en pourcentage
    return sigma * 100;
  };

  // Gestionnaire d'événements pour mettre à jour le prix personnalisé et calculer l'IV correspondante
  const handleCustomPriceChange = (monthKey: string, optionIndex: string, newPrice: number) => {
    // Mettre à jour l'état des prix personnalisés
    setCustomOptionPrices(prev => {
      const updated = { ...prev };
      if (!updated[monthKey]) {
        updated[monthKey] = {};
      }
      updated[monthKey][optionIndex] = newPrice;
      return updated;
    });
    
    // Si nous avons des résultats
    if (results) {
      const monthResult = results.find(r => {
        const date = new Date(r.date);
        return `${date.getFullYear()}-${date.getMonth() + 1}` === monthKey;
      });
      
      if (monthResult) {
        // Trouver l'option correspondante
        const optionType = optionIndex.split('-')[0]; // Extraire le type (call, put, etc.)
        const optionIdx = parseInt(optionIndex.split('-')[1] || '0'); // Extraire l'index numérique
        
        const option = monthResult.optionPrices.find((opt, idx) => 
          opt.type === optionType && idx === optionIdx
        );
        
        if (option) {
          // Pour les options standards (call/put)
          if (option.type === 'call' || option.type === 'put') {
          // Calculer la volatilité implicite à partir du prix personnalisé
          const underlyingResult = PricingService.calculateUnderlyingPrice(
            params.spotPrice,
            params.domesticRate/100,
            params.foreignRate/100,
            monthResult.timeToMaturity
          );
          const impliedVol = calculateImpliedVolatility(
            option.type,
            underlyingResult.price,  // Utiliser le prix sous-jacent configuré
            option.strike,        // Prix d'exercice
            params.domesticRate / 100, // Taux domestique sans risque (conversion en décimal)
            monthResult.timeToMaturity, // Temps jusqu'à maturité
            newPrice              // Prix observé de l'option
          );
            // Mettre à jour la volatilité implicite pour cette option spécifique
            setImpliedVolatilities(prev => {
              const updated = { ...prev };
              if (!updated[monthKey]) {
                updated[monthKey] = {};
              }
              updated[monthKey][optionIndex] = impliedVol;
              return updated;
            });
          // Activer automatiquement l'utilisation des volatilités implicites
          if (!useImpliedVol) {
            setUseImpliedVol(true);
          }
          }
          // Pour les options à barrière (avec knockout ou knockin dans leur type)
          else if (option.type.includes('knockout') || option.type.includes('knockin')) {
            const strategyOption = strategy.find(opt => opt.type === option.type);
            if (strategyOption) {
              if (useImpliedVol) {
                let bestSigma = 0.20; // Valeur initiale
                let bestDiff = Infinity;
                const steps = 50;
                for (let i = 0; i <= steps; i++) {
                  const testSigma = 0.01 + (i / steps) * 0.99; // Test de volatilité entre 1% et 100%
                  const underlyingResult = PricingService.calculateUnderlyingPrice(
                    params.spotPrice,
                    params.domesticRate/100,
                    params.foreignRate/100,
                    monthResult.timeToMaturity
                  );
                  const testPrice = calculateOptionPrice(
                    option.type,
                    underlyingResult.price,
                    option.strike,
                    params.domesticRate / 100,
                    monthResult.timeToMaturity,
                    testSigma
                  );
                  const diff = Math.abs(testPrice - newPrice);
                  if (diff < bestDiff) {
                    bestDiff = diff;
                    bestSigma = testSigma;
                  }
                }
                // Mettre à jour la volatilité implicite pour cette option spécifique
                setImpliedVolatilities(prev => {
                  const updated = { ...prev };
                  if (!updated[monthKey]) {
                    updated[monthKey] = {};
                  }
                  updated[monthKey][optionIndex] = bestSigma * 100; // Convertir en pourcentage
                  return updated;
                });
              }
            }
          }
          // Recalculer les résultats avec les nouvelles volatilités implicites
          setTimeout(() => {
            recalculateResults();
          }, 50);
        }
      }
    }
  };

  // Fonction pour gérer le changement de strike et recalculer le prix
  const handleStrikeChange = (monthKey: string, optionKey: string, newStrike: number, row: any, optionIndex: number) => {
    // Mettre à jour l'état des strikes personnalisés
    setCustomStrikes(prev => {
      const updated = { ...prev };
      if (!updated[monthKey]) {
        updated[monthKey] = {};
      }
      updated[monthKey][optionKey] = newStrike;
      return updated;
    });
    
    // Trouver l'option dans la stratégie pour obtenir ses paramètres
    const option = row.optionPrices[optionIndex];
    if (!option || option.type === 'swap' || option.type === 'forward') {
      return; // Ne pas traiter les swaps et forwards
    }
    
    // Trouver l'option correspondante dans la stratégie
    const strategyOption = strategy.find((opt, idx) => {
      const optType = opt.type;
      return optType === option.type && idx === optionIndex;
    });
    
    if (!strategyOption) return;
    
    // Calculer le nouveau prix avec le nouveau strike
    const t = row.timeToMaturity;
    const forward = row.forward;
    const r_d = params.domesticRate / 100;
    const r_f = params.foreignRate / 100;
    
    // Utiliser la volatilité implicite si disponible, sinon la volatilité de l'option
    const optionKeyForIV = `${option.type}-${optionIndex}`;
    const iv = getImpliedVolatility(monthKey, optionKeyForIV);
    const effectiveSigma = useImpliedVol && iv !== undefined && iv !== null
      ? iv / 100
      : (strategyOption.volatility || option.volatility || 20) / 100;
    
    // Calculer le prix selon le type d'option
    let newPrice = 0;
    
    if (option.type === 'call' || option.type === 'put') {
      // Options vanilles - utiliser Garman-Kohlhagen
      if (optionPricingModel === 'garman-kohlhagen') {
        newPrice = calculateGarmanKohlhagenPrice(
          option.type,
          forward,
          newStrike,
          r_d,
          r_f,
          t,
          effectiveSigma
        );
      } else if (optionPricingModel === 'monte-carlo') {
        newPrice = calculateVanillaOptionMonteCarlo(
          option.type,
          forward,
          newStrike,
          r_d,
          r_f,
          t,
          effectiveSigma,
          1000
        );
      } else {
        // Black-Scholes fallback
        const d1 = (Math.log(forward/newStrike) + (r_d + effectiveSigma**2/2)*t) / (effectiveSigma*Math.sqrt(t));
        const d2 = d1 - effectiveSigma*Math.sqrt(t);
        const Nd1 = (1 + erf(d1/Math.sqrt(2)))/2;
        const Nd2 = (1 + erf(d2/Math.sqrt(2)))/2;
        
        if (option.type === 'call') {
          newPrice = forward*Nd1 - newStrike*Math.exp(-r_d*t)*Nd2;
        } else {
          newPrice = newStrike*Math.exp(-r_d*t)*(1-Nd2) - forward*(1-Nd1);
        }
      }
    } else if (option.type.includes('knockout') || option.type.includes('knockin')) {
      // Options à barrière
      const barrier = strategyOption.barrierType === 'percent' ? 
        params.spotPrice * (strategyOption.barrier / 100) : 
        strategyOption.barrier;
      const secondBarrier = strategyOption.type.includes('double') ? 
        (strategyOption.barrierType === 'percent' ? 
          params.spotPrice * (strategyOption.secondBarrier / 100) : 
          strategyOption.secondBarrier) : 
        undefined;
      
      if (barrierPricingModel === 'closed-form') {
        newPrice = calculateBarrierOptionClosedForm(
          option.type,
          forward,
          newStrike,
          r_d,
          t,
          effectiveSigma,
          barrier || 0,
          secondBarrier
        );
      } else {
        // Monte Carlo pour les barrières - simplifié ici
        newPrice = calculateBarrierOptionClosedForm(
          option.type,
          forward,
          newStrike,
          r_d,
          t,
          effectiveSigma,
          barrier || 0,
          secondBarrier
        );
      }
    }
    
    // Mettre à jour le prix personnalisé avec le nouveau prix calculé
    setCustomOptionPrices(prev => {
      const updated = { ...prev };
      if (!updated[monthKey]) {
        updated[monthKey] = {};
      }
      updated[monthKey][optionKey] = newPrice;
      return updated;
    });
    
    // Activer l'utilisation des prix personnalisés si ce n'est pas déjà fait
    if (!useCustomOptionPrices) {
      setUseCustomOptionPrices(true);
    }
    
    // Recalculer les résultats
    setTimeout(() => {
      recalculateResults();
    }, 50);
  };

  // Export des fonctions de pricing pour centralisation
// ... toutes les fonctions de pricing ici ...

const pricingFunctions = {
  calculateGarmanKohlhagenPrice,
  calculateVanillaOptionMonteCarlo,
  calculateBarrierOptionPrice,
  calculateDigitalOptionPrice,
  calculateBarrierOptionClosedForm,
  calculateFXForwardPrice,
  calculateOptionPrice,
  erf,
  CND: (x: number) => (1 + erf(x / Math.sqrt(2))) / 2
};

// PricingService now directly imports functions from this module - no initialization needed

  // Fonction pour initialiser les volatilités implicites à partir des prix actuels
  const initializeImpliedVolatilities = () => {
    if (!results) return;
    
    // Stocker les nouvelles volatilités implicites
    const newImpliedVols: OptionImpliedVolatility = {};
    
    // Pour chaque mois dans les résultats
    results.forEach(monthResult => {
      const date = new Date(monthResult.date);
      const monthKey = `${date.getFullYear()}-${date.getMonth() + 1}`;
      
      // Initialiser la structure du mois
      newImpliedVols[monthKey] = {};
      
      // Traiter chaque option dans ce mois
      monthResult.optionPrices.forEach((option, optionIndex) => {
        // Ignorer les swaps
        if (option.type === 'swap') return;
        
        // Trouver l'option correspondante dans la stratégie
        const strategyOption = strategy.find(opt => opt.type === option.type);
        if (!strategyOption) return;
        
        // Calculer la volatilité implicite pour cette option
        let impliedVol = strategyOption.volatility;
        
        // Pour les options standard (call/put), calculer une vraie IV
        if (option.type === 'call' || option.type === 'put') {
          const underlyingResult = PricingService.calculateUnderlyingPrice(
            params.spotPrice,
            params.domesticRate/100,
            params.foreignRate/100,
            monthResult.timeToMaturity
          );
          const calculatedIV = calculateImpliedVolatility(
            option.type,
            underlyingResult.price,
            option.strike,
            params.domesticRate / 100,
            monthResult.timeToMaturity,
            option.price
          );
          
          if (calculatedIV > 0) {
            impliedVol = calculatedIV;
          }
        }
        
        // Stocker la volatilité pour cette option spécifique
        const optionKey = `${option.type}-${optionIndex}`;
        newImpliedVols[monthKey][optionKey] = impliedVol;
      });
      
      // Définir une volatilité globale (moyenne ou première option standard)
      let standardOptionFound = false;
      
      // D'abord, essayer de trouver une option standard
      for (let i = 0; i < monthResult.optionPrices.length; i++) {
        const option = monthResult.optionPrices[i];
        if (option.type === 'call' || option.type === 'put') {
          const optionKey = `${option.type}-${i}`;
          newImpliedVols[monthKey].global = newImpliedVols[monthKey][optionKey];
          standardOptionFound = true;
          break;
        }
      }
      
      // Si aucune option standard, utiliser la moyenne
      if (!standardOptionFound) {
        let sum = 0;
        let count = 0;
        
        for (const optionKey in newImpliedVols[monthKey]) {
          if (optionKey !== 'global') {
            sum += newImpliedVols[monthKey][optionKey];
            count++;
          }
        }
        
        newImpliedVols[monthKey].global = count > 0 ? sum / count : 20; // Valeur par défaut
      }
    });
    
    setImpliedVolatilities(newImpliedVols);
  };

  // Modifier le gestionnaire d'événements pour "Use my own prices"
  const handleUseCustomPricesToggle = (checked: boolean) => {
    setUseCustomOptionPrices(checked);
    
    if (checked) {
      // Initialiser les volatilités implicites à partir des prix actuels
      initializeImpliedVolatilities();
      
      // Activer automatiquement l'utilisation des volatilités implicites
      if (!useImpliedVol) {
        setUseImpliedVol(true);
      }
    }
    
    // Toujours recalculer les résultats après le changement
    setTimeout(() => {
      if (checked) {
        recalculateResults();
      } else {
        // Si on désactive les prix personnalisés, recalculer complètement
        calculateResults();
      }
    }, 100);
  };

  // Gestionnaire pour activer/désactiver l'utilisation des volatilités implicites
  const handleUseImpliedVolToggle = (checked: boolean) => {
    setUseImpliedVol(checked);
    
    // Si on active les volatilités implicites et qu'il n'y en a pas encore, les initialiser
    if (checked && Object.keys(impliedVolatilities).length === 0) {
      initializeImpliedVolatilities();
    }
    
    // Toujours recalculer les résultats après le changement
    setTimeout(() => {
      if (useCustomOptionPrices) {
        // Si on utilise des prix personnalisés, utiliser recalculateResults
        recalculateResults();
      } else {
        // Sinon, recalculer complètement
        calculateResults();
      }
    }, 100);
  };

  return (
    <div id="content-to-pdf" className="w-full mx-auto p-2 space-y-3">
      <style type="text/css" media="print">
        {`
          @page {
            size: portrait;
            margin: 20mm;
          }
          .scenario-content {
            max-width: 800px;
            margin: 0 auto;
          }
          .page-break {
            page-break-before: always;
          }
          table {
            page-break-inside: avoid;
            font-size: 12px;
          }
          .chart-container {
            page-break-inside: avoid;
            margin-bottom: 20px;
            height: 300px !important;
          }
        `}
      </style>
      {/* Add Clear Scenario button if a scenario is loaded */}
      {displayResults && (
        <div className="flex justify-end gap-2">
          <Button
            onClick={saveScenario}
            className="flex items-center gap-2"
          >
            <Save size={16} /> Save Scenario
          </Button>
          <Link to="/reports">
            <Button variant="outline" className="flex items-center gap-2">
              View Saved Scenarios
            </Button>
          </Link>
          <Button
            variant="destructive"
            onClick={clearLoadedScenario}
            className="flex items-center gap-2"
          >
            Clear Loaded Scenario
          </Button>
        </div>
      )}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-5 mb-2">
          <TabsTrigger value="parameters" className="py-2 text-xs sm:text-sm">Strategy Parameters</TabsTrigger>
          <TabsTrigger value="stress" className="py-2 text-xs sm:text-sm">Stress Testing</TabsTrigger>
          <TabsTrigger value="backtest" className="py-2 text-xs sm:text-sm">Historical Backtest</TabsTrigger>
          <TabsTrigger value="riskmatrix" className="py-2 text-xs sm:text-sm">Risk Matrix Generator</TabsTrigger>
          <TabsTrigger value="zerocost" className="py-2 text-xs sm:text-sm">Zero-Cost FX Strategies</TabsTrigger>
        </TabsList>
        
        <TabsContent value="parameters" className="mt-2">
          <Card className="shadow-md">
            <CardHeader className="pb-2 border-b">
              <CardTitle className="text-lg sm:text-xl font-bold text-primary">FX Options Strategy Parameters</CardTitle>
            </CardHeader>
            <CardContent className="pt-3">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                <div className="compact-form-group">
                  <label className="compact-label flex items-center gap-2">
                    Currency Pair
                    <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded">Synced with Market Data</span>
                  </label>
                  <div className="relative flex items-center gap-1">
                  <Select 
                    value={params.currencyPair?.symbol || 'EUR/USD'} 
                    onValueChange={async (value) => {
                        // Chercher dans les paires standard et personnalisées
                        const allPairs = [...CURRENCY_PAIRS, ...customCurrencyPairs];
                        const selectedPair = allPairs.find(pair => pair.symbol === value);
                      if (selectedPair) {
                        // Get current base volume to recalculate quote volume
                        const currentBaseVolume = params.baseVolume || 10000000;
                        
                        // First set the pair with default rate and recalculate quote volume
                        setParams(prev => ({
                          ...prev, 
                          currencyPair: selectedPair,
                          spotPrice: selectedPair.defaultSpotRate,
                          quoteVolume: currentBaseVolume * selectedPair.defaultSpotRate
                        }));
                        setInitialSpotPrice(selectedPair.defaultSpotRate);
                        
                        // Show loading toast
                        const loadingToast = toast({
                          title: "Fetching Rate...",
                          description: `Loading real-time rate for ${selectedPair.symbol} from Market Data...`,
                        });
                        
                        // Then fetch real-time rate from Market Data
                        try {
                          const realTimeRate = await fetchRealTimeRate(selectedPair);
                          if (realTimeRate !== null && !isNaN(realTimeRate) && realTimeRate > 0) {
                            setParams(prev => ({
                              ...prev,
                              spotPrice: realTimeRate,
                              quoteVolume: prev.baseVolume * realTimeRate // Recalculate quote volume with new rate
                            }));
                            setInitialSpotPrice(realTimeRate);
                            
                            // Update the pair's defaultSpotRate if it's a custom pair
                            if (customCurrencyPairs.some(p => p.symbol === selectedPair.symbol)) {
                              const updatedCustomPairs = customCurrencyPairs.map(pair =>
                                pair.symbol === selectedPair.symbol
                                  ? { ...pair, defaultSpotRate: realTimeRate }
                                  : pair
                              );
                              saveCustomCurrencyPairs(updatedCustomPairs);
                            }
                            
                            toast({
                              title: "Rate Updated",
                              description: `Real-time rate for ${selectedPair.symbol}: ${realTimeRate.toFixed(4)}`,
                            });
                          } else {
                            toast({
                              title: "Rate Fetch Failed",
                              description: `Using default rate for ${selectedPair.symbol}`,
                              variant: "default"
                            });
                          }
                        } catch (error) {
                          console.error('Error fetching rate:', error);
                          toast({
                            title: "Rate Fetch Error",
                            description: `Could not fetch rate. Using default value.`,
                            variant: "destructive"
                          });
                        }
                      }
                    }}
                  >
                    <SelectTrigger className="compact-input">
                      <SelectValue placeholder="Select currency pair">
                        {params.currencyPair && (
                          <div className="flex items-center justify-between w-full">
                            <span>{params.currencyPair.symbol}</span>
                            <span className="text-xs text-muted-foreground font-mono ml-2">
                              {params.spotPrice.toFixed(4)}
                            </span>
                          </div>
                        )}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <div className="p-2 text-xs font-medium text-muted-foreground border-b flex items-center gap-2">
                        <span>Major Pairs</span>
                        <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded">Live Rates</span>
                      </div>
                      {CURRENCY_PAIRS.filter(pair => pair.category === 'majors').map(pair => (
                        <SelectItem key={pair.symbol} value={pair.symbol}>
                          <div className="flex flex-col">
                            <span className="font-medium">{pair.symbol}</span>
                            <span className="text-xs text-muted-foreground">{pair.name}</span>
                          </div>
                        </SelectItem>
                      ))}
                      <div className="p-2 text-xs font-medium text-muted-foreground border-b border-t flex items-center gap-2">
                        <span>Cross Rates</span>
                        <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded">Live Rates</span>
                      </div>
                      {CURRENCY_PAIRS.filter(pair => pair.category === 'crosses').map(pair => (
                        <SelectItem key={pair.symbol} value={pair.symbol}>
                          <div className="flex flex-col">
                            <span className="font-medium">{pair.symbol}</span>
                            <span className="text-xs text-muted-foreground">{pair.name}</span>
                          </div>
                        </SelectItem>
                      ))}
                      <div className="p-2 text-xs font-medium text-muted-foreground border-b border-t flex items-center gap-2">
                        <span>Other Currencies</span>
                        <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded">Live Rates</span>
                      </div>
                      {CURRENCY_PAIRS.filter(pair => pair.category === 'others').map(pair => (
                        <SelectItem key={pair.symbol} value={pair.symbol}>
                          <div className="flex flex-col">
                            <span className="font-medium">{pair.symbol}</span>
                            <span className="text-xs text-muted-foreground">{pair.name}</span>
                          </div>
                        </SelectItem>
                      ))}
                        
                        {customCurrencyPairs.length > 0 && (
                          <>
                            <div className="p-2 text-xs font-medium text-muted-foreground border-b border-t flex items-center gap-2">
                              <span>Custom Pairs</span>
                              <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded">Live Rates</span>
                            </div>
                            {customCurrencyPairs.map(pair => (
                              <SelectItem key={pair.symbol} value={pair.symbol}>
                                <div className="flex flex-col">
                                  <span className="font-medium">{pair.symbol}</span>
                                  <span className="text-xs text-muted-foreground">{pair.name}</span>
                                </div>
                              </SelectItem>
                            ))}
                          </>
                        )}
                        
                        <div className="p-2 border-t mt-2">
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button variant="outline" size="sm" className="w-full">
                                <PlusCircle className="h-3 w-3 mr-1" /> Add Custom Currency Pair
                              </Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>Add Custom Currency Pair</DialogTitle>
                                <DialogDescription>
                                  Enter the details of your custom currency pair.
                                </DialogDescription>
                              </DialogHeader>
                              
                              <form onSubmit={(e) => {
                                e.preventDefault();
                                const formData = new FormData(e.currentTarget);
                                const symbol = formData.get('symbol') as string;
                                const name = formData.get('name') as string;
                                const base = formData.get('base') as string;
                                const quote = formData.get('quote') as string;
                                const defaultSpotRate = parseFloat(formData.get('defaultSpotRate') as string);
                                
                                // Validation
                                if (!symbol || !name || !base || !quote || isNaN(defaultSpotRate)) {
                                  toast({
                                    title: "Validation Error",
                                    description: "All fields are required and spot rate must be a valid number.",
                                  });
                                  return;
                                }
                                
                                // Check if pair already exists
                                const allPairs = [...CURRENCY_PAIRS, ...customCurrencyPairs];
                                if (allPairs.some(pair => pair.symbol === symbol)) {
                                  toast({
                                    title: "Pair Already Exists",
                                    description: `Currency pair ${symbol} already exists.`,
                                  });
                                  return;
                                }
                                
                                const newPair: CurrencyPair = {
                                  symbol,
                                  name,
                                  base,
                                  quote,
                                  category: 'others',
                                  defaultSpotRate
                                };
                                
                                addCustomCurrencyPair(newPair);
                                
                                toast({
                                  title: "Success",
                                  description: `Currency pair ${symbol} added successfully.`,
                                });
                                
                                // Reset form and close dialog
                                e.currentTarget.reset();
                                (document.querySelector('[data-state="open"]') as HTMLElement)?.click();
                                
                                // Optionally select the new pair
                                setParams({
                                  ...params,
                                  currencyPair: newPair,
                                  spotPrice: newPair.defaultSpotRate
                                });
                                setInitialSpotPrice(newPair.defaultSpotRate);
                              }}>
                                <div className="grid gap-4 py-4">
                                  <div className="grid grid-cols-4 items-center gap-4">
                                    <Label htmlFor="symbol" className="text-right">Symbol</Label>
                                    <Input id="symbol" name="symbol" placeholder="EUR/USD" className="col-span-3" />
                                  </div>
                                  <div className="grid grid-cols-4 items-center gap-4">
                                    <Label htmlFor="name" className="text-right">Name</Label>
                                    <Input id="name" name="name" placeholder="Euro/US Dollar" className="col-span-3" />
                                  </div>
                                  <div className="grid grid-cols-4 items-center gap-4">
                                    <Label htmlFor="base" className="text-right">Base Currency</Label>
                                    <Input id="base" name="base" placeholder="EUR" className="col-span-3" />
                                  </div>
                                  <div className="grid grid-cols-4 items-center gap-4">
                                    <Label htmlFor="quote" className="text-right">Quote Currency</Label>
                                    <Input id="quote" name="quote" placeholder="USD" className="col-span-3" />
                                  </div>
                                  <div className="grid grid-cols-4 items-center gap-4">
                                    <Label htmlFor="defaultSpotRate" className="text-right">Default Spot Rate</Label>
                                    <Input id="defaultSpotRate" name="defaultSpotRate" placeholder="1.0850" type="number" step="0.0001" className="col-span-3" />
                                  </div>
                                </div>
                                <DialogFooter>
                                  <Button type="submit">Add Currency Pair</Button>
                                </DialogFooter>
                              </form>
                            </DialogContent>
                          </Dialog>
                        </div>
                    </SelectContent>
                  </Select>
                    
                    {customCurrencyPairs.length > 0 && params.currencyPair && customCurrencyPairs.some(pair => pair.symbol === params.currencyPair?.symbol) && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="absolute right-8 top-1/2 transform -translate-y-1/2 h-6 w-6"
                        onClick={() => {
                          const filtered = customCurrencyPairs.filter(pair => pair.symbol !== params.currencyPair?.symbol);
                          saveCustomCurrencyPairs(filtered);
                          
                          // Sélectionner EUR/USD par défaut si la paire supprimée était sélectionnée
                          if (filtered.length === 0 || !filtered.some(pair => pair.symbol === params.currencyPair?.symbol)) {
                            setParams({
                              ...params,
                              currencyPair: CURRENCY_PAIRS[0],
                              spotPrice: CURRENCY_PAIRS[0].defaultSpotRate
                            });
                            setInitialSpotPrice(CURRENCY_PAIRS[0].defaultSpotRate);
                          }
                          
                          toast({
                            title: "Currency Pair Removed",
                            description: `Currency pair ${params.currencyPair?.symbol} has been removed.`,
                          });
                        }}
                        title="Remove custom currency pair"
                      >
                        <Trash className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
                <div className="compact-form-group">
                  <label className="compact-label">Strategy Start Date</label>
                  <Input
                    type="date"
                    value={params.strategyStartDate}
                    onChange={(e) => setParams({...params, strategyStartDate: e.target.value})}
                    className="compact-input"
                  />
                </div>
                <div className="compact-form-group">
                  <label className="compact-label">Hedging Start Date</label>
                  <Input
                    type="date"
                    value={params.startDate}
                    onChange={(e) => setParams({...params, startDate: e.target.value})}
                    className="compact-input"
                  />
                </div>
                <div className="compact-form-group">
                  <label className="compact-label">Months to Hedge</label>
                  <div className="flex items-center gap-2">
                    <Slider 
                      value={[params.monthsToHedge]} 
                      min={1} 
                      max={36} 
                      step={1}
                      onValueChange={(value) => setParams({...params, monthsToHedge: value[0]})}
                      className="flex-1"
                    />
                  <Input
                    type="number"
                    value={params.monthsToHedge}
                    onChange={(e) => setParams({...params, monthsToHedge: Number(e.target.value)})}
                      className="compact-input w-16 text-center"
                  />
                </div>
                </div>
                <div className="compact-form-group">
                  <label className="compact-label">Domestic Rate (%) - {params.currencyPair?.quote || 'USD'}</label>
                  <div className="flex items-center gap-2">
                    <Slider 
                      value={[params.domesticRate]} 
                      min={0} 
                      max={10} 
                      step={0.1}
                      onValueChange={(value) => setParams({...params, domesticRate: value[0]})}
                      className="flex-1"
                    />
                    <Input
                      type="number"
                      value={params.domesticRate}
                      onChange={(e) => setParams({...params, domesticRate: Number(e.target.value)})}
                      className="compact-input w-16 text-center"
                    />
                  </div>
                </div>
                <div className="compact-form-group">
                  <label className="compact-label">Foreign Rate (%) - {params.currencyPair?.base || 'EUR'}</label>
                  <div className="flex items-center gap-2">
                    <Slider 
                      value={[params.foreignRate]} 
                      min={0} 
                      max={10} 
                      step={0.1}
                      onValueChange={(value) => setParams({...params, foreignRate: value[0]})}
                      className="flex-1"
                    />
                    <Input
                      type="number"
                      value={params.foreignRate}
                      onChange={(e) => setParams({...params, foreignRate: Number(e.target.value)})}
                      className="compact-input w-16 text-center"
                    />
                  </div>
                </div>
                {/* Volume & Spot Rate - Compact Grid Layout */}
                <div className="bg-muted/20 p-2 rounded-lg space-y-2">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    {/* Base Volume */}
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">
                        {params.currencyPair?.base || 'Base'} Volume
                    </label>
                  <Input
                    type="number"
                      value={params.baseVolume}
                      onChange={(e) => handleBaseVolumeChange(Number(e.target.value))}
                        className="h-8 text-xs"
                      placeholder="Volume in base currency"
                    />
                  </div>
                    
                    {/* Quote Volume */}
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">
                        {params.currencyPair?.quote || 'Quote'} Volume
                    </label>
                    <Input
                      type="number"
                      value={Math.round(params.quoteVolume)}
                      onChange={(e) => handleQuoteVolumeChange(Number(e.target.value))}
                        className="h-8 text-xs"
                      placeholder="Volume in quote currency"
                    />
                  </div>

                    {/* Volume Type */}
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">
                        Volume Type
                      </label>
                      <Select
                        value={params.volumeType}
                        onValueChange={(value: 'receivable' | 'payable') => 
                          setParams(prev => ({ ...prev, volumeType: value }))
                        }
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="receivable">
                            <div className="flex items-center gap-2">
                              <span className="text-green-600">📈</span>
                              <span>Receivable</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="payable">
                            <div className="flex items-center gap-2">
                              <span className="text-red-600">📉</span>
                              <span>Payable</span>
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      {/* Help text */}
                      <div className="text-xs text-muted-foreground">
                        {params.volumeType === 'receivable' ? (
                          <span className="text-green-600">
                            💰 You will receive {params.currencyPair?.base || 'Base'} currency
                          </span>
                        ) : (
                          <span className="text-red-600">
                            💸 You will pay {params.currencyPair?.base || 'Base'} currency
                          </span>
                        )}
                      </div>
                    </div>
                    
                    {/* Spot Rate */}
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-foreground">
                        Spot Rate ({params.currencyPair?.symbol || 'EUR/USD'})
                      </label>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          value={params.spotPrice}
                          onChange={(e) => handleSpotPriceChange(Number(e.target.value))}
                          className="h-8 text-sm font-mono flex-1 min-w-[100px]"
                          step="0.0001"
                          placeholder={`${params.currencyPair?.defaultSpotRate || 1.0850}`}
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            if (params.currencyPair) {
                              setParams({...params, spotPrice: params.currencyPair.defaultSpotRate});
                              setInitialSpotPrice(params.currencyPair.defaultSpotRate);
                            }
                          }}
                          className="h-8 px-2 text-xs"
                          title="Reset to default market rate"
                        >
                          Reset
                        </Button>
                      </div>
                    </div>
              </div>

                  {/* Auto-sync Status */}
                  <div className="text-xs text-muted-foreground flex items-center gap-1 justify-center bg-primary/5 p-1.5 rounded border border-primary/10">
                    <span>💱</span>
                    <span>Volumes auto-sync at current spot rate: <span className="font-mono font-medium">{params.spotPrice.toFixed(4)}</span></span>
                  </div>
                </div>
              </div>

              {/* Custom Periods - Compact Toggle */}
              <div className="mt-3">
                <div className="bg-muted/20 p-3 rounded-lg">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={params.useCustomPeriods}
                    onCheckedChange={toggleCustomPeriods}
                    id="useCustomPeriods"
                  />
                    <label htmlFor="useCustomPeriods" className="text-sm font-medium cursor-pointer flex items-center gap-2">
                      <Calendar size={16} />
                    Use Custom Periods Instead of Monthly Hedging
                  </label>
                  </div>
                </div>
                
                {params.useCustomPeriods && (
                  <div className="mt-4 pl-8">
                    <div className="flex justify-between items-center mb-3">
                      <h4 className="text-sm font-medium text-foreground/90">Custom Hedging Periods</h4>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={addCustomPeriod}
                        className="flex items-center gap-1 h-8 px-2 text-xs"
                      >
                        <Plus size={14} /> Add Period
                      </Button>
                    </div>
                    
                    {params.customPeriods.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No custom periods defined. Click "Add Period" to create one.</p>
                    ) : (
                      <div className="space-y-2">
                        {params.customPeriods.map((period, index) => (
                          <div key={index} className="grid grid-cols-5 gap-2 items-center p-2 rounded-md bg-muted/50">
                            <div className="col-span-2">
                              <label className="compact-label">Maturity Date</label>
                              <Input
                                type="date"
                                value={period.maturityDate}
                                onChange={(e) => updateCustomPeriod(index, 'maturityDate', e.target.value)}
                                className="compact-input"
                              />
                            </div>
                            <div className="col-span-2">
                              <label className="compact-label">Volume</label>
                              <Input
                                type="number"
                                value={period.volume}
                                onChange={(e) => updateCustomPeriod(index, 'volume', Number(e.target.value))}
                                className="compact-input"
                              />
                            </div>
                            <div className="flex items-end justify-end">
                              <Button 
                                variant="ghost" 
                                size="icon"
                                onClick={() => removeCustomPeriod(index)}
                                className="text-destructive hover:text-destructive hover:bg-destructive/10 h-8 w-8"
                              >
                                <Trash size={14} />
                              </Button>
                            </div>
                          </div>
                        ))}
                        
                        <div className="mt-2 text-xs text-muted-foreground">
                          Total Volume: {params.customPeriods.reduce((sum, p) => sum + p.volume, 0).toLocaleString()}
                        </div>
                        
                        {Math.abs(params.customPeriods.reduce((sum, p) => sum + p.volume, 0) - params.baseVolume) > 0.01 && (
                          <div className="mt-2 text-xs text-amber-600 flex items-center gap-1">
                            <AlertTriangle size={12} />
                            <span>The sum of custom periods volumes ({params.customPeriods.reduce((sum, p) => sum + p.volume, 0).toLocaleString()}) 
                            differs from the base volume ({params.baseVolume.toLocaleString()}).</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Pricing Configuration - Compact Layout */}
              <div className="mt-2 space-y-2">
                {/* Real Price Simulation & Option Pricing Model - Combined Row */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {/* Real Price Simulation */}
                  <div className="bg-muted/30 p-2 rounded-lg space-y-1.5">
                    <h4 className="text-sm font-semibold text-primary flex items-center gap-2">
                      <BarChart3 size={16} />
                      Real Price Simulation
                    </h4>
                  <div className="flex items-center gap-2">
                    <Switch
                    checked={realPriceParams.useSimulation}
                      onCheckedChange={(checked) => setRealPriceParams(prev => ({...prev, useSimulation: checked}))}
                      id="useMonteCarloSimulation"
                  />
                      <label htmlFor="useMonteCarloSimulation" className="text-xs font-medium cursor-pointer">
                      Use Monte Carlo Simulation for Real Prices
                    </label>
                </div>
                  
                  {realPriceParams.useSimulation && (
                      <div className="pt-2 border-t border-border/50">
                        <label className="text-xs text-muted-foreground mb-1 block">Price Path Simulations</label>
                      <div className="flex items-center gap-2">
                        <Slider 
                          value={[realPriceParams.numSimulations]} 
                          min={100} 
                          max={10000} 
                          step={100}
                          onValueChange={(value) => setRealPriceParams(prev => ({...prev, numSimulations: value[0]}))}
                          className="flex-1"
                        />
                  <Input
                    type="number"
                    value={realPriceParams.numSimulations}
                    onChange={(e) => setRealPriceParams(prev => ({...prev, numSimulations: Number(e.target.value)}))}
                    min="100"
                    max="10000"
                    step="100"
                            className="w-16 h-7 text-xs text-center"
                  />
                </div>
                    </div>
                  )}
              </div>
              
                  {/* Option Pricing Model */}
                  <div className="bg-muted/30 p-2 rounded-lg space-y-1.5">
                    <h4 className="text-xs font-semibold text-primary flex items-center gap-2">
                      <Calculator size={14} />
                      Option Pricing Model
                    </h4>
                    <div className="space-y-1.5">
                      <label className="text-xs text-muted-foreground">Model Selection</label>
                  <Select 
                    value={optionPricingModel} 
                    onValueChange={(value: string) => setOptionPricingModel(value as 'black-scholes' | 'garman-kohlhagen' | 'monte-carlo')}
                  >
                        <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Select pricing model" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="black-scholes">Black-Scholes</SelectItem>
                      <SelectItem value="garman-kohlhagen">Garman-Kohlhagen (FX)</SelectItem>
                      <SelectItem value="monte-carlo">Monte Carlo (Vanilla Options)</SelectItem>
                    </SelectContent>
                  </Select>
                      <p className="text-xs text-muted-foreground">
                        Garman-Kohlhagen model is recommended for FX options
                  </p>
                    </div>
                </div>
              </div>

                {/* Barrier Option Pricing - Full Width Compact */}
                <div className="bg-muted/30 p-2 rounded-lg">
                  <h4 className="text-xs font-semibold text-primary flex items-center gap-2 mb-2">
                    <Shield size={14} />
                    Barrier Option Pricing
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {/* Simulations */}
                    <div className="space-y-2">
                      <label className="text-xs text-muted-foreground">Number of Simulations</label>
                    <div className="flex items-center gap-2">
                      <Slider 
                        value={[barrierOptionSimulations]} 
                        min={100} 
                        max={10000} 
                        step={100}
                        onValueChange={(value) => setBarrierOptionSimulations(value[0])}
                        className="flex-1"
                      />
                      <Input
                        type="number"
                        value={barrierOptionSimulations}
                        onChange={(e) => setBarrierOptionSimulations(Number(e.target.value))}
                        min="100"
                        max="10000"
                        step="100"
                          className="w-16 h-7 text-xs text-center"
                      />
                    </div>
                  </div>
                  
                    {/* Pricing Method */}
                    <div className="space-y-2">
                      <label className="text-xs text-muted-foreground">Pricing Method</label>
                    <Select 
                      value={barrierPricingModel} 
                      onValueChange={(value: string) => setBarrierPricingModel(value as 'monte-carlo' | 'closed-form')}
                    >
                        <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Select barrier pricing method" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="monte-carlo">Monte Carlo Simulation</SelectItem>
                        <SelectItem value="closed-form">Closed-Form Approximation</SelectItem>
                      </SelectContent>
                    </Select>
                      <p className="text-xs text-muted-foreground">
                        Closed-form provides faster and more accurate pricing
                    </p>
                    </div>
                  </div>
                    </div>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-md mt-2">
            <CardHeader className="pb-2 border-b flex flex-row items-center justify-between">
              <CardTitle className="text-lg sm:text-xl font-bold text-primary">Strategy Components</CardTitle>
              <div className="flex gap-1.5 flex-wrap">
                <Button onClick={addOption} size="sm" className="h-7 px-2 text-xs flex items-center gap-1">
                  <Plus size={12} /> Add Option
                </Button>
                <Button onClick={addSwap} size="sm" variant="outline" className="h-7 px-2 text-xs flex items-center gap-1">
                  <Plus size={12} /> Add Swap
                </Button>
                <Button onClick={addForward} size="sm" variant="outline" className="h-7 px-2 text-xs flex items-center gap-1">
                  <Plus size={12} /> Add Forward
                </Button>
                {strategy.length > 0 && (
                  <Button onClick={importToHedgingInstruments} size="sm" variant="secondary" className="h-7 px-2 text-xs flex items-center gap-1">
                    <Upload size={12} /> Export to Hedging
                  </Button>
                )}
                {params.currencyPair && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-xs flex items-center gap-1"
                    onClick={async () => {
                      if (!params.currencyPair) return;
                      
                      const loadingToast = toast({
                        title: "Refreshing Rate...",
                        description: `Fetching latest rate for ${params.currencyPair.symbol}...`,
                      });
                      
                      try {
                        const realTimeRate = await fetchRealTimeRate(params.currencyPair);
                        if (realTimeRate !== null && !isNaN(realTimeRate) && realTimeRate > 0) {
                          setParams(prev => ({
                            ...prev,
                            spotPrice: realTimeRate,
                            quoteVolume: prev.baseVolume * realTimeRate // Recalculate quote volume with new rate
                          }));
                          setInitialSpotPrice(realTimeRate);
                          
                          toast({
                            title: "Rate Refreshed",
                            description: `Updated rate for ${params.currencyPair.symbol}: ${realTimeRate.toFixed(4)}`,
                          });
                        } else {
                          toast({
                            title: "Refresh Failed",
                            description: `Could not fetch rate. Using current value.`,
                            variant: "default"
                          });
                        }
                      } catch (error) {
                        console.error('Error refreshing rate:', error);
                        toast({
                          title: "Refresh Error",
                          description: `Could not refresh rate.`,
                          variant: "destructive"
                        });
                      }
                    }}
                    title="Refresh rate from Market Data"
                  >
                    <RefreshCw className="h-3 w-3" /> Refresh Data
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-2">
              <div className="space-y-2">
                {strategy.map((component, index) => (
                  <div key={index} className="grid grid-cols-6 gap-2 items-center p-2 border rounded text-xs">
                    <div>
                      <label className="block text-xs font-medium mb-0.51">Type</label>
                      <select
                        className="w-full p-1 border rounded text-xs"
                        value={component.type}
                        onChange={(e) => updateOption(index, 'type', e.target.value)}
                        disabled={component.type === 'swap' || component.type === 'forward'}
                      >
                        <option value="call">Call</option>
                        <option value="put">Put</option>
                        <option value="swap">Swap</option>
                        <option value="forward">Forward</option>
                        <option value="call-knockout">Call Knock-Out</option>
                        <option value="call-reverse-knockout">Call Reverse Knock-Out</option>
                        <option value="call-double-knockout">Call Double Knock-Out</option>
                        <option value="put-knockout">Put Knock-Out</option>
                        <option value="put-reverse-knockout">Put Reverse Knock-Out</option>
                        <option value="put-double-knockout">Put Double Knock-Out</option>
                        <option value="call-knockin">Call Knock-In</option>
                        <option value="call-reverse-knockin">Call Reverse Knock-In</option>
                        <option value="call-double-knockin">Call Double Knock-In</option>
                        <option value="put-knockin">Put Knock-In</option>
                        <option value="put-reverse-knockin">Put Reverse Knock-In</option>
                        <option value="put-double-knockin">Put Double Knock-In</option>
                        <option value="one-touch">One Touch (beta) </option>
                        <option value="double-touch">Double Touch (beta) </option>
                        <option value="no-touch">No Touch (beta)</option>
                        <option value="double-no-touch">Double No Touch (beta)</option>
                        <option value="range-binary">Range Binary (beta)</option>
                        <option value="outside-binary">Outside Binary (beta)</option>
                      </select>
                    </div>
                    {component.type === 'swap' ? (
                      <>
                        <div className="col-span-2">
                          <label className="block text-xs font-medium mb-0.5">Swap Price</label>
                          <Input
                            type="number"
                            value={component.strike}
                            disabled
                            className="bg-gray-100"
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="block text-xs font-medium mb-0.51">Quantity (%)</label>
                          <Input
                            type="number"
                            value={component.quantity}
                            onChange={(e) => updateOption(index, 'quantity', Number(e.target.value))}
                            min="0"
                            max="100"
                          />
                        </div>
                      </>
                    ) : component.type === 'forward' ? (
                      <>
                        <div className="col-span-2">
                          <label className="block text-xs font-medium mb-0.51">Forward Rate</label>
                          <Input
                            type="number"
                            value={component.strike}
                            onChange={(e) => updateOption(index, 'strike', Number(e.target.value))}
                            step="0.0001"
                            placeholder="e.g., 1.0850"
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="block text-xs font-medium mb-0.51">Quantity (%)</label>
                          <Input
                            type="number"
                            value={component.quantity}
                            onChange={(e) => updateOption(index, 'quantity', Number(e.target.value))}
                            min="0"
                            max="100"
                          />
                        </div>
                      </>
                    ) : (
                      <>
                    <div>
                      <label className="block text-xs font-medium mb-0.51">Strike</label>
                      <Input
                        type="number"
                            value={component.strike}
                        onChange={(e) => updateOption(index, 'strike', Number(e.target.value))}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-0.51">Strike Type</label>
                      <select
                        className="w-full p-2 border rounded"
                            value={component.strikeType}
                        onChange={(e) => updateOption(index, 'strikeType', e.target.value)}
                      >
                        <option value="percent">Percentage</option>
                        <option value="absolute">Absolute</option>
                      </select>
                    </div>
                    
                    {/* Add barrier inputs for barrier option types */}
                    {component.type.includes('knockout') || component.type.includes('knockin') ? (
                      <>
                        <div>
                          <label className="block text-xs font-medium mb-0.51">Barrier</label>
                          <Input
                            type="number"
                            value={component.barrier || 0}
                            onChange={(e) => updateOption(index, 'barrier', Number(e.target.value))}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium mb-0.51">Barrier Type</label>
                          <select
                            className="w-full p-2 border rounded"
                            value={component.barrierType || 'percent'}
                            onChange={(e) => updateOption(index, 'barrierType', e.target.value)}
                          >
                            <option value="percent">Percentage</option>
                            <option value="absolute">Absolute</option>
                          </select>
                        </div>
                        
                        {/* For double barrier options */}
                        {component.type.includes('double') && (
                          <div>
                            <label className="block text-xs font-medium mb-0.51">Second Barrier</label>
                            <Input
                              type="number"
                              value={component.secondBarrier || 0}
                              onChange={(e) => updateOption(index, 'secondBarrier', Number(e.target.value))}
                            />
                          </div>
                        )}
                      </>
                    ) : null}
                    
                    <div>
                      <label className="block text-xs font-medium mb-0.51">Volatility (%)</label>
                      <Input
                        type="number"
                            value={component.volatility}
                        onChange={(e) => updateOption(index, 'volatility', Number(e.target.value))}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-0.51">Quantity (%)</label>
                      <Input
                        type="number"
                            value={component.quantity}
                        onChange={(e) => updateOption(index, 'quantity', Number(e.target.value))}
                      />
                    </div>
                      </>
                    )}
                    {['one-touch','double-touch','no-touch','double-no-touch','range-binary','outside-binary'].includes(component.type) && (
                      <>
                        <div>
                          <label className="block text-xs font-medium mb-0.51">Rebate (%)</label>
                          <Input
                            type="number"
                            value={component.rebate ?? 5}
                            onChange={e => updateOption(index, 'rebate', Number(e.target.value))}
                            min="0"
                            step="0.01"
                            placeholder="% du volume mensuel"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium mb-0.51">Barrier</label>
                          <Input
                            type="number"
                            value={component.barrier ?? 0}
                            onChange={e => updateOption(index, 'barrier', Number(e.target.value))}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium mb-0.51">Barrier Type</label>
                          <select
                            className="w-full p-2 border rounded"
                            value={component.barrierType || 'percent'}
                            onChange={e => updateOption(index, 'barrierType', e.target.value)}
                          >
                            <option value="percent">Percentage</option>
                            <option value="absolute">Absolute</option>
                          </select>
                        </div>
                        {['double-touch','double-no-touch','range-binary','outside-binary'].includes(component.type) && (
                          <div>
                            <label className="block text-xs font-medium mb-0.51">Second Barrier</label>
                            <Input
                              type="number"
                              value={component.secondBarrier ?? 0}
                              onChange={e => updateOption(index, 'secondBarrier', Number(e.target.value))}
                            />
                          </div>
                        )}
                      </>
                    )}
                    <div className="flex items-end">
                      <Button
                        variant="destructive"
                        onClick={() => removeOption(index)}
                        className="flex items-center justify-center"
                      >
                        <Trash2 size={16} />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Button onClick={calculateResults} className="w-full">
            Calculate Strategy Results
          </Button>
        </TabsContent>

        <TabsContent value="stress">
          <Card>
            <button
              onClick={() => toggleInputs('strategy')}
              className="w-full text-left bg-white rounded-md"
            >
              <div className="flex items-center justify-between p-3">
                <span className="font-medium">Strategy Components</span>
                <svg
                  className={`w-4 h-4 transform transition-transform ${showInputs['strategy'] ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </button>
            {showInputs['strategy'] && (
            <div className="px-3 pb-3">
              <div className="space-y-2">
                {strategy.map((option, index) => (
                  <div key={index} className="grid grid-cols-5 gap-2 items-end">
                    <div>
                      <label className="block text-xs font-medium mb-0.51">Type</label>
                      <select
                        className="w-full p-1 border rounded text-xs"
                        value={option.type}
                        onChange={(e) => updateOption(index, 'type', e.target.value)}
                      >
                        <option value="call">Call</option>
                        <option value="put">Put</option>
                        <option value="swap">Swap</option>
                        <option value="forward">Forward</option>
                        <option value="call-knockout">Call Knock-Out</option>
                        <option value="call-reverse-knockout">Call Reverse Knock-Out</option>
                        <option value="call-double-knockout">Call Double Knock-Out</option>
                        <option value="put-knockout">Put Knock-Out</option>
                        <option value="put-reverse-knockout">Put Reverse Knock-Out</option>
                        <option value="put-double-knockout">Put Double Knock-Out</option>
                        <option value="call-knockin">Call Knock-In</option>
                        <option value="call-reverse-knockin">Call Reverse Knock-In</option>
                        <option value="call-double-knockin">Call Double Knock-In</option>
                        <option value="put-knockin">Put Knock-In</option>
                        <option value="put-reverse-knockin">Put Reverse Knock-In</option>
                        <option value="put-double-knockin">Put Double Knock-In</option>
                        <option value="one-touch">One Touch</option>
                        <option value="double-touch">Double Touch</option>
                        <option value="no-touch">No Touch</option>
                        <option value="double-no-touch">Double No Touch</option>
                        <option value="range-binary">Range Binary</option>
                        <option value="outside-binary">Outside Binary</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-0.51">Strike</label>
                      <Input
                        type="number"
                        value={option.strike}
                        onChange={(e) => updateOption(index, 'strike', Number(e.target.value))}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-0.51">Strike Type</label>
                      <select
                        className="w-full p-2 border rounded"
                        value={option.strikeType}
                        onChange={(e) => updateOption(index, 'strikeType', e.target.value)}
                      >
                        <option value="percentage">Percentage</option>
                        <option value="absolute">Absolute</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-0.51">Volatility (%)</label>
                      <Input
                        type="number"
                        value={option.volatility}
                        onChange={(e) => updateOption(index, 'volatility', Number(e.target.value))}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-0.51">Quantity (%)</label>
                      <Input
                        type="number"
                        value={option.quantity}
                        onChange={(e) => updateOption(index, 'quantity', Number(e.target.value))}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            )}
          </Card>

          <Card className="mt-2">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg sm:text-xl">FX Stress Test Scenarios</CardTitle>
                <div className="flex items-center gap-2">
                  <div className="text-sm text-muted-foreground">
                    Based on historical events & regulatory stress tests
                  </div>
                  <button
                    onClick={() => {
                      // Clear localStorage and reload scenarios
                      localStorage.removeItem('calculatorState');
                      window.location.reload();
                    }}
                    className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded transition-colors"
                    title="Reset and load all stress test scenarios"
                  >
                    🔄 Reset Scenarios
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-2">
              {/* Scenarios count indicator */}
              <div className="mb-2 p-2 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-blue-800">
                    📊 {Object.keys(stressTestScenarios).length} scenarios available
                  </span>
                  <span className="text-blue-600">
                    {Object.values(stressTestScenarios).filter(s => s.isHistorical).length} Historical | 
                    {Object.values(stressTestScenarios).filter(s => ['adverseECB', 'fedSCAR'].includes(Object.keys(stressTestScenarios).find(k => stressTestScenarios[k] === s) || '')).length} Regulatory | 
                    {Object.values(stressTestScenarios).filter(s => s.isCustom).length} Custom
                  </span>
                </div>
              </div>
              
              <div className="space-y-3">
                {/* Group scenarios by category */}
                {[
                  { 
                    title: "Base Scenario", 
                    scenarios: Object.entries(stressTestScenarios).filter(([key]) => key === 'base'),
                    color: "bg-gray-50 border-gray-200",
                    icon: "⚪"
                  },
                  { 
                    title: "Historical Crisis Events", 
                    scenarios: Object.entries(stressTestScenarios).filter(([_, scenario]) => scenario.isHistorical),
                    color: "bg-red-50 border-red-200",
                    icon: "📊"
                  },
                  { 
                    title: "Regulatory Stress Tests", 
                    scenarios: Object.entries(stressTestScenarios).filter(([key]) => 
                      ['adverseECB', 'fedSCAR'].includes(key)
                    ),
                    color: "bg-blue-50 border-blue-200",
                    icon: "🏛️"
                  },
                  { 
                    title: "Contemporary Risk Scenarios", 
                    scenarios: Object.entries(stressTestScenarios).filter(([key]) => 
                      ['centralBankDivergence', 'emergingMarketCrisis', 'tradeWar', 'inflationShock'].includes(key)
                    ),
                    color: "bg-yellow-50 border-yellow-200",
                    icon: "⚡"
                  },
                  { 
                    title: "Tail Risk Scenarios", 
                    scenarios: Object.entries(stressTestScenarios).filter(([key]) => 
                      key === 'reserveCurrencyCrisis'
                    ),
                    color: "bg-purple-50 border-purple-200",
                    icon: "⚠️"
                  },
                  { 
                    title: "Custom Scenarios", 
                    scenarios: Object.entries(stressTestScenarios).filter(([_, scenario]) => scenario.isCustom),
                    color: "bg-green-50 border-green-200",
                    icon: "⚙️"
                  }
                ].map(({ title, scenarios, color, icon }) => 
                  scenarios.length > 0 && (
                    <div key={title} className={`p-2 rounded-lg border ${color}`}>
                      <h4 className="font-medium mb-3 text-sm uppercase tracking-wide flex items-center gap-2">
                        <span>{icon}</span>
                        {title}
                      </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                        {scenarios.map(([key, scenario]) => (
                          <Card key={key} className={`p-2 transition-all duration-200 ${activeStressTest === key ? 'ring-2 ring-blue-500 bg-blue-50' : 'bg-white hover:shadow-md'}`}>
                            <div className="space-y-3">
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-1">
                                    <h5 className="font-medium text-sm">{scenario.name}</h5>
                                    {scenario.isHistorical && (
                                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                                        Historical
                                      </span>
                                    )}
                                    {['adverseECB', 'fedSCAR'].includes(key) && (
                                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                        Regulatory
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-xs text-gray-600 leading-relaxed">{scenario.description}</p>
                                </div>
                    <button
                      onClick={() => toggleInputs(key)}
                                  className="ml-2 p-1 rounded-full hover:bg-gray-100 transition-colors"
                                  title="Toggle details"
                    >
                      <svg
                        className={`w-4 h-4 transform transition-transform ${showInputs[key] ? 'rotate-180' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                              </div>
                              
                              {/* Quick metrics preview */}
                              <div className="grid grid-cols-2 gap-2 text-xs">
                                <div className="p-2 bg-gray-50 rounded text-center">
                                  <div className="font-medium text-gray-700">Vol</div>
                                  <div className="font-semibold">{(scenario.volatility * 100).toFixed(1)}%</div>
                                </div>
                                <div className="p-2 bg-gray-50 rounded text-center">
                                  <div className="font-medium text-gray-700">Shock</div>
                                  <div className={`font-semibold ${scenario.priceShock >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                    {scenario.priceShock >= 0 ? '+' : ''}{(scenario.priceShock * 100).toFixed(1)}%
                                  </div>
                                </div>
                              </div>

                              {/* Action button */}
                              <Button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  applyStressTest(key);
                                }}
                                size="sm"
                                className={`w-full ${
                                  activeStressTest === key 
                                    ? 'bg-blue-600 hover:bg-blue-700 text-white' 
                                    : 'bg-gray-800 hover:bg-gray-900 text-white'
                                }`}
                              >
                                {activeStressTest === key ? '✓ Active Scenario' : '🚀 Run Scenario'}
                              </Button>

                              {/* Detailed inputs */}
                    {showInputs[key] && (
                                <div className="mt-3 p-3 bg-gray-50 rounded-lg border-t">
                                  <h6 className="font-medium mb-2 text-xs text-gray-700">⚙️ Customize Parameters</h6>
                        <div className="space-y-2">
                          <div>
                                      <label className="block text-xs font-medium mb-1 text-gray-700">Volatility (%)</label>
                            <Input
                                        className="h-7 text-xs"
                              type="number"
                                        value={(scenario.volatility * 100).toFixed(1)}
                              onChange={(e) => updateScenario(key, 'volatility', Number(e.target.value) / 100)}
                              step="0.1"
                                        min="0"
                                        max="100"
                            />
                          </div>
                          <div>
                                      <label className="block text-xs font-medium mb-1 text-gray-700">Drift (%)</label>
                            <Input
                                        className="h-7 text-xs"
                              type="number"
                                        value={(scenario.drift * 100).toFixed(1)}
                              onChange={(e) => updateScenario(key, 'drift', Number(e.target.value) / 100)}
                              step="0.1"
                                        min="-10"
                                        max="10"
                            />
                          </div>
                          <div>
                                      <label className="block text-xs font-medium mb-1 text-gray-700">Price Shock (%)</label>
                            <Input
                                        className="h-7 text-xs"
                              type="number"
                                        value={(scenario.priceShock * 100).toFixed(1)}
                              onChange={(e) => updateScenario(key, 'priceShock', Number(e.target.value) / 100)}
                              step="0.1"
                                        min="-50"
                                        max="50"
                            />
                          </div>
                          {scenario.forwardBasis !== undefined && (
                            <div>
                                        <label className="block text-xs font-medium mb-1 text-gray-700">Forward Basis (%)</label>
                              <Input
                                          className="h-7 text-xs"
                                type="number"
                                          value={((scenario.forwardBasis || 0) * 100).toFixed(1)}
                                onChange={(e) => updateScenario(key, 'forwardBasis', Number(e.target.value) / 100)}
                                step="0.1"
                                          min="-5"
                                          max="5"
                              />
                            </div>
                          )}
                          {scenario.realBasis !== undefined && (
                            <div>
                                        <label className="block text-xs font-medium mb-1 text-gray-700">Real Basis (%)</label>
                              <Input
                                          className="h-7 text-xs"
                                type="number"
                                          value={((scenario.realBasis || 0) * 100).toFixed(1)}
                                onChange={(e) => updateScenario(key, 'realBasis', Number(e.target.value) / 100)}
                                step="0.1"
                                          min="-5"
                                          max="5"
                              />
                        </div>
                          )}
                        </div>
                                  <div className="mt-3 flex gap-2">
                        <Button
                                      onClick={() => resetScenario(key)}
                                      size="sm"
                                      variant="outline"
                                      className="text-xs"
                                    >
                                      🔄 Reset
                        </Button>
                                  </div>
                      </div>
                    )}
                            </div>
                  </Card>
                ))}
                      </div>
                    </div>
                  )
                )}
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-2 mt-3">
            <Button onClick={calculateResults} className="flex-1">
              Calculate Results
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="backtest">
          <Card>
            <CardHeader>
              <CardTitle>Historical Data Backtest</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-4 mb-4">
                    <Button 
                  variant={showHistoricalData ? "outline" : "default"}
                      onClick={() => setShowHistoricalData(!showHistoricalData)}
                    >
                      {showHistoricalData ? 'Hide' : 'Show'} Historical Data
                    </Button>
                    <Button 
                  variant={showMonthlyStats ? "outline" : "default"}
                      onClick={() => setShowMonthlyStats(!showMonthlyStats)}
                    >
                      {showMonthlyStats ? 'Hide' : 'Show'} Monthly Statistics
                    </Button>
                <div className="flex-grow" />
                <Button onClick={addHistoricalDataRow}>
                  <Plus className="w-4 h-4 mr-2" /> Add Row
                    </Button>
                <div className="flex flex-col sm:flex-row gap-2 items-center">
                  <Select value={csvFormat} onValueChange={(value) => setCsvFormat(value as 'english' | 'french')}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="CSV Format" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="english">English (Point .)</SelectItem>
                      <SelectItem value="french">French (Comma ,)</SelectItem>
                    </SelectContent>
                  </Select>
                  
                  <Button onClick={importHistoricalData} className="flex-grow sm:flex-grow-0">
                  Import Historical Data
                    </Button>
                </div>
                <Button variant="destructive" onClick={clearHistoricalData}>
                  Clear Data
                    </Button>
                </div>
                
                {showHistoricalData && (
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr>
                          <th className="border p-2 bg-gray-50">Date</th>
                          <th className="border p-2 bg-gray-50">Price</th>
                        </tr>
                      </thead>
                      <tbody>
                        {historicalData.map((point, index) => (
                          <tr key={index}>
                            <td className="border p-2">{point.date}</td>
                            <td className="border p-2">{point.price.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

              {showMonthlyStats && monthlyStats.length > 0 && (
                <div className="mt-4">
                  <h3 className="text-base font-semibold mb-2">Monthly Statistics</h3>
                  <table className="w-full border-collapse">
                      <thead>
                        <tr>
                          <th className="border p-2 bg-gray-50">Month</th>
                          <th className="border p-2 bg-gray-50">Average Price</th>
                          <th className="border p-2 bg-gray-50">Historical Volatility</th>
                        </tr>
                      </thead>
                      <tbody>
                        {monthlyStats.map((stat, index) => (
                          <tr key={index}>
                            <td className="border p-2">{stat.month}</td>
                            <td className="border p-2">{stat.avgPrice.toFixed(2)}</td>
                            <td className="border p-2">
                              {stat.volatility ? `${(stat.volatility * 100).toFixed(2)}%` : 'N/A'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
            </CardContent>
          </Card>
          
          {displayResults && (
            <div>
              {/* Affichage des résultats... */}
              
              {/* Save Backtest button - specific to backtest results */}
              <div className="mt-3 flex flex-col md:flex-row gap-2">
                <Button 
                  onClick={saveHistoricalBacktestResults} 
                  variant="outline"
                  className="flex-1"
                >
                  <Save className="h-4 w-4 mr-2" />
                  Save Backtest
                </Button>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="riskmatrix">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>FX Risk Matrix Generator</CardTitle>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">
                    {params.currencyPair?.symbol || 'Currency Pair'}
                  </span>
                  <button
                    onClick={updatePriceRangesForFX}
                    className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded transition-colors"
                    title="Update price ranges for current FX pair"
                  >
                    🔄 Update FX Ranges
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="mb-2 p-2 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="text-sm">
                  <span className="font-medium text-blue-800">Current Setup:</span> 
                  <span className="text-blue-700"> {params.currencyPair?.symbol} @ {params.spotPrice.toFixed(4)}</span>
                  <span className="text-blue-600 ml-2">
                    (Ranges auto-generated based on {params.currencyPair?.category} pair volatility)
                  </span>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-lg font-semibold">FX Rate Ranges</h3>
                    <span className="text-sm text-muted-foreground">
                      ({params.currencyPair?.quote || 'Quote Currency'} per {params.currencyPair?.base || 'Base Currency'})
                    </span>
                  </div>
                  <div className="space-y-4">
                    {priceRanges.map((range, index) => (
                      <div key={index} className="grid grid-cols-3 gap-2">
                        <div>
                          <Label>Min</Label>
                          <Input 
                            type="number" 
                            value={range.min}
                            onChange={(e) => updatePriceRange(index, 'min', Number(e.target.value))}
                          />
              </div>
                        <div>
                          <Label>Max</Label>
                          <Input 
                            type="number" 
                            value={range.max}
                            onChange={(e) => updatePriceRange(index, 'max', Number(e.target.value))}
                          />
                        </div>
                        <div>
                          <Label>Probability (%)</Label>
                          <Input 
                            type="number" 
                            value={range.probability}
                            onChange={(e) => updatePriceRange(index, 'probability', Number(e.target.value))}
                          />
                        </div>
                      </div>
                    ))}
                    <div className="flex justify-between">
                      <Button
                        onClick={() => setPriceRanges([...priceRanges, { min: 0, max: 0, probability: 0 }])}
                        size="sm"
                      >
                        Add Range
                      </Button>
                      <Button
                        onClick={() => setPriceRanges(priceRanges.slice(0, -1))}
                        variant="destructive"
                        size="sm"
                        disabled={priceRanges.length <= 1}
                      >
                        Remove Last
                      </Button>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-base font-semibold mb-2">Strategies</h3>
                  <div className="space-y-2">
                    {matrixStrategies.map((strat, index) => (
                      <div key={index} className="p-2 border rounded-md">
                        <div className="flex justify-between items-center mb-2">
                          <h4 className="font-medium">{strat.name}</h4>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => removeMatrixStrategy(index)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                        <div>
                          <Label>Coverage Ratio (%)</Label>
                          <div className="flex items-center gap-4">
                            <Slider
                              value={[strat.coverageRatio]}
                              min={0}
                              max={100}
                              step={1}
                              onValueChange={(value) => handleCoverageRatioChange(index, value[0])}
                              className="flex-1"
                            />
                            <span className="w-12 text-right">{strat.coverageRatio}%</span>
                          </div>
                        </div>
                      </div>
                    ))}
                    <Button
                      onClick={addMatrixStrategy}
                      className="w-full"
                      disabled={strategy.length === 0}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add Current Strategy
                    </Button>
                  </div>
                </div>
              </div>

              <div className="mt-3 flex flex-col gap-2">
                <Button onClick={generateRiskMatrix} className="w-full">
                  Generate Risk Matrix
                </Button>
                <Button 
                  onClick={toggleCoverageVariations} 
                  className="w-full"
                  variant="outline"
                >
                  {showCoverageVariations ? "Show Original View" : "Show Coverage Variations"}
                </Button>
                <Button 
                  onClick={clearAllStrategies} 
                  className="w-full"
                  variant="destructive"
                >
                  Clear Strategies
                </Button>
                {riskMatrixResults.length > 0 && (
                  <>
                    <Button 
                      onClick={saveRiskMatrix} 
                      className="w-full"
                      variant="outline"
                    >
                      <Save className="h-4 w-4 mr-2" />
                      Save Risk Matrix
                    </Button>
                    <Button 
                      onClick={exportRiskMatrixToPDF} 
                      className="w-full"
                      variant="outline"
                    >
                      Export as PDF
                    </Button>
                  </>
                )}
              </div>

              {riskMatrixResults.length > 0 && (
                <div className="mt-4 overflow-x-auto">
                  <h3 className="text-base font-semibold mb-2">Risk Matrix Results</h3>
                  <table className="w-full border-collapse">
                    <thead>
                      <tr>
                        <th className="border p-2">Strategy</th>
                        <th className="border p-2">Coverage Ratio</th>
                        <th className="border p-2">Hedging Cost ({params.currencyPair?.base || 'Base Currency'})</th>
                        {priceRanges.map((range, i) => (
                          <th key={i} className="border p-2">{range.probability}%<br/>[{range.min.toFixed(4)}-{range.max.toFixed(4)}]</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {showCoverageVariations 
                        ? riskMatrixResults.flatMap((result, i) => {
                            const strategyName = result.name.replace(/\s\d+%$/, '');
                            const ratios = [25, 50, 75, 100];
                            
                            return ratios.map((ratio) => (
                              <tr key={`${i}-${ratio}`}>
                                <td className="border p-2">{strategyName}</td>
                                <td className="border p-2">{ratio}%</td>
                                <td className="border p-2">{((result.hedgingCost / result.coverageRatio) * ratio).toFixed(2)}</td>
                                
                                {priceRanges.map((range, j) => {
                                  const rangeKey = `${range.min},${range.max}`;
                                  // Ajuster la valeur en fonction du ratio
                                  const adjustedValue = (result.differences[rangeKey] / result.coverageRatio) * ratio;
                                  
                                  return (
                                    <td 
                                      key={j} 
                                      className="border p-2"
                                      style={{ backgroundColor: getCellColor(adjustedValue) }}
                                    >
                                      {adjustedValue.toFixed(2)}
                          </td>
                                  );
                                })}
                              </tr>
                            ));
                          })
                        : riskMatrixResults.map((result, i) => (
                            <tr key={i}>
                              <td className="border p-2">{result.name}</td>
                          <td className="border p-2">{result.coverageRatio}%</td>
                              <td className="border p-2">{result.hedgingCost.toFixed(2)}</td>
                              
                          {priceRanges.map((range, j) => {
                            const rangeKey = `${range.min},${range.max}`;
                            return (
                              <td 
                                key={j} 
                                className="border p-2"
                                style={{ backgroundColor: getCellColor(result.differences[rangeKey]) }}
                              >
                                {result.differences[rangeKey].toFixed(2)}
                              </td>
                            );
                          })}
                        </tr>
                          ))
                      }
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="zerocost">
          <ZeroCostTab 
            spotPrice={params.spotPrice}
            setStrategy={setStrategy}
            calculatePayoff={calculatePayoff}
            monthsToHedge={params.monthsToHedge}
          />
        </TabsContent>
      </Tabs>

      {displayResults && (
        <div className="mt-3">
          <Tabs value={activeResultsTab} onValueChange={setActiveResultsTab} className="w-full">
            <TabsList className="grid w-full grid-cols-4 lg:grid-cols-8 mb-3">
              <TabsTrigger value="detailed" className="text-xs">Detailed Results</TabsTrigger>
              <TabsTrigger value="pnl-evolution" className="text-xs">P&L Evolution</TabsTrigger>
              <TabsTrigger value="fx-rates" className="text-xs">Spot vs Forward</TabsTrigger>
              <TabsTrigger value="hedging-profile" className="text-xs">FX HEDGING PROFILE</TabsTrigger>
              <TabsTrigger value="monte-carlo" className="text-xs">Monte Carlo</TabsTrigger>
              <TabsTrigger value="yearly-stats" className="text-xs">Yearly Statistics</TabsTrigger>
              <TabsTrigger value="total-stats" className="text-xs">Total Statistics</TabsTrigger>
              <TabsTrigger value="monthly-breakdown" className="text-xs">Monthly Breakdown</TabsTrigger>
            </TabsList>

            <TabsContent value="detailed">
              <Card className="shadow-lg border border-border/40 overflow-hidden">
                <CardHeader className="bg-gradient-to-r from-primary/10 to-transparent pb-2 border-b">
                  <CardTitle className="text-lg sm:text-xl font-bold text-primary flex items-center gap-2">
                    <Table className="h-4 w-4" />
                    Detailed Results
                  </CardTitle>
                </CardHeader>
            <CardContent className="p-0">
              {displayResults.length > 0 && (
                <div>
                  <div className="flex items-center p-2 bg-muted/30">
                    <div className="flex items-center">
                      <Switch
                      id="useCustomPrices"
                      checked={useCustomOptionPrices}
                      onCheckedChange={handleUseCustomPricesToggle}
                      className="mr-2"
                    />
                      <label htmlFor="useCustomPrices" className="text-sm font-medium cursor-pointer">
                      Use my own prices
                    </label>
                  </div>
                  
                    <div className="ml-4 flex items-center">
                      <Switch
                        id="useImpliedVolUI"
                        checked={useImpliedVol}
                        onCheckedChange={handleUseImpliedVolToggle}
                        className="mr-2"
                      />
                      <label htmlFor="useImpliedVolUI" className="text-sm font-medium cursor-pointer">
                        Use Implied Volatility
                      </label>
                      {useCustomOptionPrices && useImpliedVol && (
                        <span className="bg-amber-100 text-amber-800 text-xs px-2 py-0.5 rounded-full ml-2">
                          Auto-calcul
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <div className="custom-scrollbar">
                    <table className="w-full">
                  <thead>
                        <tr className="bg-muted/50 text-xs uppercase tracking-wider">
                          <th className="px-3 py-3 text-left font-medium text-foreground/70 border-b">Maturity</th>
                          <th className="px-3 py-3 text-left font-medium text-foreground/70 border-b">Time to Maturity</th>
                          <th className="px-3 py-3 text-left font-medium text-foreground/70 border-b bg-blue-500/5">Forward FX Rate</th>
                          <th className="px-3 py-3 text-left font-medium text-foreground/70 border-b bg-primary/5">Spot FX Rate</th>
                          
                          {/* Ajouter des colonnes pour les strikes dynamiques si présents */}
                          {strategy.some(opt => opt.dynamicStrike) && displayResults && displayResults.length > 0 && 
                            strategy.map((opt, idx) => 
                              opt.dynamicStrike ? (
                                <th key={`dyn-strike-${idx}`} className="px-3 py-3 text-left font-medium text-foreground/70 border-b bg-yellow-500/10">
                                  {opt.type.includes('put') ? 'Put' : 'Call'} Strike {idx + 1}
                                </th>
                              ) : null
                            )
                          }
                          
                      {useImpliedVol && results[0].optionPrices.map((opt, i) => (
                        opt.type !== 'swap' && (
                          <th key={`iv-header-${i}`} className="px-3 py-3 text-left font-medium text-foreground/70 border-b bg-amber-500/5">
                            IV {opt.label} (%)
                          </th>
                        )
                      ))}
                      {/* Colonnes Strike pour chaque option */}
                      {displayResults[0].optionPrices.map((opt, i) => (
                        opt.type !== 'swap' && opt.type !== 'forward' && (
                          <th key={`strike-header-${i}`} className="px-3 py-3 text-left font-medium text-foreground/70 border-b bg-orange-500/5">
                            Strike {opt.label}
                          </th>
                        )
                      ))}
                      {displayResults[0].optionPrices.map((opt, i) => (
                            <th key={`opt-header-${i}`} className="px-3 py-3 text-left font-medium text-foreground/70 border-b">{opt.label}</th>
                          ))}
                          <th className="px-3 py-3 text-left font-medium text-foreground/70 border-b bg-green-500/5">Strategy Price</th>
                          <th className="px-3 py-3 text-left font-medium text-foreground/70 border-b bg-purple-500/5">Strategy Payoff</th>
                          <th className="px-3 py-3 text-left font-medium text-foreground/70 border-b">Volume</th>
                          <th className="px-3 py-3 text-left font-medium text-foreground/70 border-b bg-green-500/5">Hedged Cost</th>
                          <th className="px-3 py-3 text-left font-medium text-foreground/70 border-b bg-red-500/5">Unhedged Cost</th>
                          <th className="px-3 py-3 text-left font-medium text-foreground/70 border-b bg-indigo-500/5">Delta P&L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayResults.map((row, i) => {
                      const date = new Date(row.date);
                      const monthKey = `${date.getFullYear()}-${date.getMonth() + 1}`;
                          const isEven = i % 2 === 0;
                          
                          const getPnLColor = (value: number) => {
                            if (value > 0) return 'text-green-600';
                            if (value < 0) return 'text-red-600';
                            return '';
  };

  return (
                            <tr key={i} className={`${isEven ? 'bg-muted/20' : 'bg-background'} hover:bg-muted/40 transition-colors`}>
                              <td className="px-3 py-2 text-sm border-b border-border/30">{row.date}</td>
                              <td className="px-3 py-2 text-sm border-b border-border/30">{row.timeToMaturity.toFixed(4)}</td>
                              <td className="px-3 py-2 text-sm border-b border-border/30 bg-blue-500/5">
                          <Input
                            type="number"
                              value={(() => {
                                const date = new Date(row.date);
                                const monthKey = `${date.getFullYear()}-${date.getMonth() + 1}`;
                                return manualForwards[monthKey] ? Number(manualForwards[monthKey]).toFixed(4) : row.forward.toFixed(4);
                              })()}
                            onChange={(e) => {
                                const date = new Date(row.date);
                                const monthKey = `${date.getFullYear()}-${date.getMonth() + 1}`;
                              const newValue = e.target.value === '' ? '' : Number(e.target.value);
                              setManualForwards(prev => ({
                                ...prev,
                                [monthKey]: newValue
                              }));
                            }}
                            onBlur={() => calculateResults()}
                                  className="compact-input w-32 text-right"
                            step="0.01"
                          />
                        </td>
                              <td className="px-3 py-2 text-sm border-b border-border/30 bg-primary/5">
                          <Input
                            type="number"
                              value={(() => {
                                const date = new Date(row.date);
                                const monthKey = `${date.getFullYear()}-${date.getMonth() + 1}`;
                                return realPriceParams.useSimulation ? 
                              row.realPrice.toFixed(4) : 
                                  (realPrices[monthKey] ? Number(realPrices[monthKey]).toFixed(4) : row.forward.toFixed(4));
                              })()}
                            onChange={(e) => {
                                const date = new Date(row.date);
                                const monthKey = `${date.getFullYear()}-${date.getMonth() + 1}`;
                              const newValue = e.target.value === '' ? '' : Number(e.target.value);
                              setRealPrices(prev => ({
                                ...prev,
                                [monthKey]: newValue
                              }));
                            }}
                            onBlur={() => calculateResults()}
                                  className="compact-input w-32 text-right"
                            step="0.01"
                            disabled={realPriceParams.useSimulation}
                          />
                        </td>
                          {/* Ajouter des cellules pour les strikes dynamiques si présents */}
                          {strategy.some(opt => opt.dynamicStrike) && 
                            strategy.map((opt, idx) => {
                              if (!opt.dynamicStrike) return null;
                              
                              // Trouver l'option correspondante dans le résultat
                              const resultOption = row.optionPrices.find(
                                o => o.label.includes(opt.type.includes('put') ? 'Put' : 'Call') && 
                                     o.label.endsWith(`${idx + 1}`)
                              );
                              
                              // Afficher le strike dynamique si disponible
                              if (resultOption && resultOption.dynamicStrikeInfo) {
                                return (
                                  <td key={`dyn-strike-${idx}-${i}`} className="px-3 py-2 text-sm border-b border-border/30 bg-yellow-500/10 font-mono">
                                    {resultOption.strike.toFixed(4)}
                                    <br />
                                    <span className="text-xs text-muted-foreground">
                                      ({(resultOption.strike / row.forward * 100).toFixed(1)}%)
                                    </span>
                                  </td>
                                );
                              }
                              
                              // Fallback si les informations ne sont pas disponibles
                              return (
                                <td key={`dyn-strike-${idx}-${i}`} className="px-3 py-2 text-sm border-b border-border/30 bg-yellow-500/10">
                                  {resultOption ? resultOption.strike.toFixed(4) : '-'}
                                </td>
                              );
                            })
                          }
                          {useImpliedVol && results[0].optionPrices.map((opt, j) => (
                            opt.type !== 'swap' && (
                              <td key={`iv-${j}`} className="px-3 py-2 text-sm border-b border-border/30 bg-amber-500/5">
                              <div className="flex flex-col">
                              <Input
                                type="number"
                                  value={impliedVolatilities[monthKey]?.[`${opt.type}-${j}`] || ''}
                                  onChange={(e) => handleOptionImpliedVolChange(monthKey, `${opt.type}-${j}`, Number(e.target.value))}
                                  className="compact-input w-24"
                                placeholder="Enter IV"
                              />
                                {useCustomOptionPrices && impliedVolatilities[monthKey] && (
                                  <span className="text-xs text-amber-600 mt-1"></span>
                                )}
                              </div>
                            </td>
                            )
                          ))}
                          {/* Afficher les strikes et prix des options dans le même ordre que les en-têtes */}
                          {/* Colonnes Strike pour chaque option */}
                          {row.optionPrices.map((opt, j) => {
                            if (opt.type === 'swap' || opt.type === 'forward') return null;
                            
                            const date = new Date(row.date);
                            const monthKey = `${date.getFullYear()}-${date.getMonth() + 1}`;
                            const optionKey = `${opt.type}-${j}`;
                            
                            // Calculer le strike à afficher (utiliser customStrikes si disponible, sinon dynamicStrikeInfo ou strike)
                            const displayStrike = customStrikes[monthKey]?.[optionKey] !== undefined
                              ? customStrikes[monthKey][optionKey]
                              : (opt.dynamicStrikeInfo?.calculatedStrike || opt.strike);
                            
                            return (
                              <td key={`strike-${j}`} className="px-3 py-2 text-sm border-b border-border/30 bg-orange-500/5">
                                <Input
                                  type="number"
                                  value={displayStrike.toFixed(4)}
                                  onChange={(e) => {
                                    const newValue = e.target.value === '' ? 0 : Number(e.target.value);
                                    handleStrikeChange(monthKey, optionKey, newValue, row, j);
                                  }}
                                  className="compact-input w-24 text-right font-mono"
                                  step="0.0001"
                                />
                              </td>
                            );
                          })}
                          {/* Colonnes Prix pour chaque option */}
                          {row.optionPrices.map((opt, j) => {
                            // Créer une clé unique pour cette option à cette date
                                  const date = new Date(row.date);
                                  const monthKey = `${date.getFullYear()}-${date.getMonth() + 1}`;
                                  const optionKey = `${opt.type}-${j}`;
                                  
                                  // Récupérer le prix personnalisé s'il existe, ou utiliser le prix calculé
                                  const customPrice = 
                                    customOptionPrices[monthKey]?.[optionKey] !== undefined
                                      ? customOptionPrices[monthKey][optionKey]
                                      : opt.price;
                                  
                                  return (
                                    <td key={`option-${j}`} className="px-3 py-2 text-sm border-b border-border/30">
                                      {useCustomOptionPrices ? (
                                        <Input
                                          type="number"
                                          value={customPrice.toFixed(4)}
                                          onChange={(e) => {
                                            const newValue = e.target.value === '' ? 0 : Number(e.target.value);
                                            // Mettre à jour les prix personnalisés et calculer la volatilité implicite
                                            handleCustomPriceChange(monthKey, optionKey, newValue);
                                          }}
                                          onBlur={() => recalculateResults()}
                                          className="compact-input w-24 text-right"
                                          step="0.0001"
                                        />
                                      ) : (
                                        <span className="font-mono">{opt.price.toFixed(4)}</span>
                                      )}
                                    </td>
                                  );
                                })}
                              <td className="px-3 py-2 text-sm border-b border-border/30 bg-green-500/5 font-medium font-mono">{row.strategyPrice.toFixed(4)}</td>
                              <td className="px-3 py-2 text-sm border-b border-border/30 bg-purple-500/5 font-medium font-mono">{row.totalPayoff.toFixed(4)}</td>
                              <td className="px-3 py-2 text-sm border-b border-border/30">
                          <Input
                            type="number"
                            value={(() => {
                              const date = new Date(row.date);
                              const monthKey = `${date.getFullYear()}-${date.getMonth() + 1}`;
                              return customVolumes[monthKey] || row.monthlyVolume;
                            })()}
                            onChange={(e) => {
                              const date = new Date(row.date);
                              const monthKey = `${date.getFullYear()}-${date.getMonth() + 1}`;
                              const newValue = e.target.value === '' ? 0 : Number(e.target.value);
                              handleVolumeChange(monthKey, newValue);
                            }}
                            onBlur={() => recalculateResults()}
                                  className="compact-input w-32 text-right"
                            step="1"
                          />
                        </td>
                              <td className="px-3 py-2 text-sm border-b border-border/30 bg-green-500/5 font-medium font-mono">{row.hedgedCost.toFixed(2)}</td>
                              <td className="px-3 py-2 text-sm border-b border-border/30 bg-red-500/5 font-medium font-mono">{row.unhedgedCost.toFixed(2)}</td>
                              <td className={`px-3 py-2 text-sm border-b border-border/30 bg-indigo-500/5 font-medium font-mono ${getPnLColor(row.deltaPnL)}`}>
                                {row.deltaPnL.toFixed(2)}
                              </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
                </div>
              )}
            </CardContent>
          </Card>
            </TabsContent>

            <TabsContent value="pnl-evolution">
              <Card>
                <CardHeader>
                  <CardTitle>P&L Evolution</CardTitle>
                </CardHeader>
            <CardContent>
              <div id="strategy-builder-pnl-chart" className="h-96 bg-white dark:bg-gray-900 p-4 rounded">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={displayResults}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="deltaPnL" name="Delta P&L" stroke="#8884d8" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
            </TabsContent>

            <TabsContent value="fx-rates">
              <Card>
                <CardHeader>
                  <CardTitle>Spot vs Forward FX Rates</CardTitle>
                </CardHeader>
            <CardContent>
              <div id="strategy-builder-fx-rates-chart" className="h-96 bg-white dark:bg-gray-900 p-4 rounded">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={displayResults}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line 
                      type="monotone" 
                      dataKey="forward" 
                      name="Forward FX Rate" 
                      stroke="#8884d8" 
                    />
                    <Line 
                      type="monotone" 
                      dataKey="realPrice"
                      name="Spot FX Rate"
                      stroke="#82ca9d"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
            </TabsContent>

            <TabsContent value="hedging-profile">
              {payoffData.length > 0 && (
                <div id="strategy-builder-fx-hedging-chart">
                  <PayoffChart
                    data={payoffData}
                    strategy={strategy}
                    spot={params.spotPrice}
                    currencyPair={params.currencyPair}
                    includePremium={true}
                    className="mt-3"
                  />
                </div>
              )}
            </TabsContent>

            <TabsContent value="monte-carlo">
              {/* Monte Carlo Simulation Card */}
              <Card>
                <CardHeader>
                  <CardTitle>Monte Carlo Simulation</CardTitle>
                  <CardDescription>Visualize price paths and option price evolution</CardDescription>
                </CardHeader>
            <CardContent className="pt-2">
              <div className="flex flex-row justify-between mb-2">
                <div>
                  <Button 
                    onClick={() => {
                      if (results) {
                        if (!simulationData) {
                          recalculateMonteCarloSimulations(); 
                        }
                        setShowMonteCarloVisualization(!showMonteCarloVisualization);
                      } else {
                        alert("Calculate Strategy Results first to generate Monte Carlo simulations.");
                      }
                    }}
                    disabled={!results || isRunningSimulation}
                    className="mr-2"
                  >
                    {isRunningSimulation ? (
                      <>
                        <span className="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-solid border-current border-e-transparent align-[-0.125em]"></span>
                        Running Simulation...
                      </>
                    ) : showMonteCarloVisualization ? (
                      "Hide Visualization"
                    ) : (
                      "Show Monte Carlo Visualization"
                    )}
                  </Button>
                </div>
                <div className="flex items-center">
                  {isRunningSimulation ? (
                    <span className="text-sm text-blue-600">
                      Calculating simulations...
                    </span>
                  ) : realPriceParams.useSimulation ? (
                    <span className="text-sm text-gray-600">
                      Using {realPriceParams.numSimulations || 1000} simulations (configured in Strategy Parameters)
                    </span>
                  ) : strategy.some(opt => opt.type.includes('knockout') || opt.type.includes('knockin')) ? (
                    <span className="text-sm text-blue-600">
                      Barrier option visualization available (Monte Carlo not used for real prices)
                    </span>
                  ) : (
                    <span className="text-sm text-amber-600 font-semibold">
                      Enable "Use Monte Carlo Simulation" or add barrier options to see visualizations
                    </span>
                  )}
                </div>
              </div>

              {showMonteCarloVisualization && results && simulationData && (
                <div>
                  <div className="mb-2 p-2 bg-blue-50 border border-blue-200 rounded-md">
                    <h4 className="font-medium text-blue-800 mb-1 text-sm">Monte Carlo Visualization Information</h4>
                    <ul className="list-disc ml-5 text-sm text-blue-700">
                      {realPriceParams.useSimulation && (
                        <li>Displaying {Math.min(100, realPriceParams.numSimulations)} random paths out of {realPriceParams.numSimulations} total simulations</li>
                      )}
                      {realPriceParams.useSimulation && simulationData.realPricePaths.length > 0 && (
                        <li>Real Price Paths: Shows simulated price paths based on the volatility parameters</li>
                      )}
                    </ul>
                  </div>
                  
                  <MonteCarloVisualization 
                    simulationData={{
                      ...simulationData,
                      
                    }} 
                  />
                  
                  
                </div>
              )}
              
              {(!showMonteCarloVisualization || !results || !simulationData) && (
                <div className="text-center py-8 bg-gray-50 rounded-md border border-gray-200">
                  {!results ? (
                    <div>
                      <p className="text-gray-700 font-medium">Calculate Strategy Results First</p>
                      <p className="mt-1 text-sm text-gray-500">Click "Calculate Results" to generate Monte Carlo simulations.</p>
                    </div>
                  ) : !simulationData ? (
                    <div>
                      <p className="text-gray-700 font-medium">No Simulation Data Available</p>
                      <p className="mt-1 text-sm text-gray-500">Please recalculate results to generate simulation data.</p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-gray-700 font-medium">Visualization Hidden</p>
                      <p className="mt-1 text-sm text-gray-500">Click "Show Monte Carlo Visualization" to display price paths.</p>
                    </div>
                  )}

                  <Button 
                    onClick={() => {
                      if (results) {
                        if (!simulationData) {
                          recalculateMonteCarloSimulations();
                        }
                        setShowMonteCarloVisualization(true);
                      }
                    }}
                    disabled={!results || isRunningSimulation}
                    className="mt-4"
                  >
                    {!simulationData 
                      ? "Generate Simulation" 
                      : "Show Visualization"}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
            </TabsContent>

            <TabsContent value="yearly-stats">
              <Card>
                <CardHeader>
                  <CardTitle>Summary Statistics by Year</CardTitle>
                </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                {(() => {
                  const yearlyResults = calculateYearlyResults(results);

                  return (
                    <table className="w-full border-collapse mb-3">
                      <thead>
                        <tr>
                          <th className="border p-2 text-left">Year</th>
                          <th className="border p-2 text-right">Total Cost with Hedging</th>
                          <th className="border p-2 text-right">Total Cost without Hedging</th>
                          <th className="border p-2 text-right">Total P&L</th>
                          <th className="border p-2 text-right">Total Strategy Premium</th>
                          <th className="border p-2 text-right">Cost Reduction (%)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(yearlyResults).map(([year, data]: [string, any]) => (
                          <tr key={year}>
                            <td className="border p-2 font-medium">{year}</td>
                            <td className="border p-2 text-right">
                              {(data.hedgedCost || 0).toLocaleString(undefined, {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2
                              })}
                            </td>
                            <td className="border p-2 text-right">
                              {(data.unhedgedCost || 0).toLocaleString(undefined, {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2
                              })}
                            </td>
                            <td className="border p-2 text-right">
                              {(data.deltaPnL || 0).toLocaleString(undefined, {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2
                              })}
                            </td>
                            <td className="border p-2 text-right">
                              {(data.strategyPremium || 0).toLocaleString(undefined, {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2
                              })}
                            </td>
                            <td className="border p-2 text-right">
                                  {data.unhedgedCost !== 0 ? (((data.deltaPnL / Math.abs(data.unhedgedCost)) * 100).toFixed(2) + '%') : '0%'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  );
                })()}
              </div>
            </CardContent>
          </Card>
            </TabsContent>

            <TabsContent value="total-stats">
              <Card>
                <CardHeader>
                  <CardTitle>Total Summary Statistics</CardTitle>
                </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <tbody>
                    <tr>
                      <td className="border p-2 font-medium">Total Cost with Hedging</td>
                      <td className="border p-2 text-right">
                        {displayResults.reduce((sum, row) => sum + row.hedgedCost, 0).toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2
                        })}
                      </td>
                    </tr>
                    <tr>
                      <td className="border p-2 font-medium">Total Cost without Hedging</td>
                      <td className="border p-2 text-right">
                        {displayResults.reduce((sum, row) => sum + row.unhedgedCost, 0).toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2
                        })}
                      </td>
                    </tr>
                    <tr>
                      <td className="border p-2 font-medium">Total P&L</td>
                      <td className="border p-2 text-right">
                        {displayResults.reduce((sum, row) => sum + row.deltaPnL, 0).toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2
                        })}
                      </td>
                    </tr>
                    <tr>
                      <td className="border p-2 font-medium">Total Strategy Premium</td>
                      <td className="border p-2 text-right">
                        {displayResults.reduce((sum, row) => sum + (row.strategyPrice * row.monthlyVolume), 0).toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2
                        })}
                      </td>
                    </tr>
                    <tr>
                      <td className="border p-2 font-medium">Cost Reduction (%)</td>
                      <td className="border p-2 text-right">
                        {(() => {
                          const totalPnL = validateDataForReduce(results).reduce((sum, row) => sum + row.deltaPnL, 0);
                          const totalUnhedgedCost = validateDataForReduce(results).reduce((sum, row) => sum + row.unhedgedCost, 0);
                                                             return (((totalPnL / Math.abs(totalUnhedgedCost)) * 100).toFixed(2) + '%');
                        })()}
                      </td>
                    </tr>
                    <tr>
                      <td className="border p-2 font-medium">Strike Target</td>
                      <td className="border p-2 text-right">
                        {(() => {
                          const totalHedgedCost = validateDataForReduce(results).reduce((sum, row) => sum + row.hedgedCost, 0);
                          const totalVolume = validateDataForReduce(results).reduce((sum, row) => sum + row.monthlyVolume, 0);
                          return totalVolume > 0 
                            ? ((-1) * totalHedgedCost / totalVolume).toLocaleString(undefined, {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2
                              })
                            : 'N/A';
                        })()}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
            </TabsContent>

            <TabsContent value="monthly-breakdown">
              <Card>
                <CardHeader>
                  <CardTitle>Monthly & Yearly P&L Breakdown</CardTitle>
                </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                {displayResults.length > 0 && (() => {
                  // Organiser les données par année et par mois
                  const pnlByYearMonth: Record<string, Record<string, number>> = {};
                  const yearTotals: Record<string, number> = {};
                  const monthTotals: Record<string, number> = {};
                  let grandTotal = 0;
                  
                  // Collecter toutes les années et tous les mois uniques
                  const years: Set<string> = new Set();
                  const months: string[] = [
                    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
                  ];
                  
                  // Initialiser la structure de données
                  results.forEach(result => {
                    const date = new Date(result.date);
                    const year = date.getFullYear().toString();
                    const month = date.getMonth();
                    const monthKey = months[month];
                    
                    years.add(year);
                    
                    if (!pnlByYearMonth[year]) {
                      pnlByYearMonth[year] = {};
                      yearTotals[year] = 0;
                    }
                    
                    if (!pnlByYearMonth[year][monthKey]) {
                      pnlByYearMonth[year][monthKey] = 0;
                    }
                    
                    // Ajouter le P&L au mois correspondant
                    pnlByYearMonth[year][monthKey] += result.deltaPnL;
                    
                    // Mettre à jour les totaux
                    yearTotals[year] += result.deltaPnL;
                    if (!monthTotals[monthKey]) monthTotals[monthKey] = 0;
                    monthTotals[monthKey] += result.deltaPnL;
                    grandTotal += result.deltaPnL;
                  });
                  
                  // Convertir l'ensemble des années en tableau trié
                  const sortedYears = Array.from(years).sort();
                  
                  // Fonction pour appliquer une couleur en fonction de la valeur
                  const getPnLColor = (value: number) => {
                    if (value > 0) return 'bg-green-100';
                    if (value < 0) return 'bg-red-100';
                    return '';
                  };
                  
                  // Fonction pour formater les valeurs de P&L
                  const formatPnL = (value: number) => {
                    if (Math.abs(value) < 0.01) return '0';
                    // Formater en milliers avec un point de séparation de milliers
                    return (value / 1000).toLocaleString(undefined, {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 3
                    });
                  };
                  
                  return (
                    <table className="min-w-full border-collapse text-sm">
                      <thead>
                        <tr className="bg-gray-100">
                          <th className="border p-2 font-semibold text-left"></th>
                          {months.map(month => (
                            <th key={month} className="border p-2 font-semibold text-center w-20">{month}</th>
                          ))}
                          <th className="border p-2 font-semibold text-center w-20">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedYears.map(year => (
                          <tr key={year}>
                            <td className="border p-2 font-semibold">{year}</td>
                            {months.map(month => {
                              const value = pnlByYearMonth[year][month] || 0;
                              return (
                                <td 
                                  key={`${year}-${month}`} 
                                  className={`border p-2 text-right ${getPnLColor(value)}`}
                                >
                                  {value ? formatPnL(value) : '-'}
                                </td>
                              );
                            })}
                            <td className={`border p-2 text-right font-semibold ${getPnLColor(yearTotals[year])}`}>
                              {formatPnL(yearTotals[year])}
                            </td>
                          </tr>
                        ))}
                        <tr className="bg-gray-50">
                          <td className="border p-2 font-semibold">Total</td>
                          {months.map(month => (
                            <td 
                              key={`total-${month}`} 
                              className={`border p-2 text-right font-semibold ${getPnLColor(monthTotals[month] || 0)}`}
                            >
                              {monthTotals[month] ? formatPnL(monthTotals[month]) : '-'}
                            </td>
                          ))}
                          <td className={`border p-2 text-right font-semibold ${getPnLColor(grandTotal)}`}>
                            {formatPnL(grandTotal)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  );
                })()}
              </div>
            </CardContent>
          </Card>
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  );
};





export default Index;
