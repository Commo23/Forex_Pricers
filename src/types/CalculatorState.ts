import { OptionImpliedVolatility } from '../pages/Index';

export interface CustomPeriod {
  maturityDate: string;
  volume: number;
}

export interface CalculatorState {
    params: {
      startDate: string;
      monthsToHedge: number;
      interestRate: number;
      domesticRate: number;
      foreignRate: number;
      totalVolume: number;
      baseVolume: number;
      quoteVolume: number;
      spotPrice: number;
      currencyPair: any; // CurrencyPair interface
      useCustomPeriods: boolean;
      customPeriods: CustomPeriod[];
      volumeType: 'receivable' | 'payable'; // Type de volume
    };
    strategy: any[];
    results: any;
    payoffData: any[];
    manualForwards: Record<string, number>;
    realPrices: Record<string, number>;
    realPriceParams: {
      useSimulation: boolean;
      volatility: number;
      drift: number;
      numSimulations: number;
    };
    barrierOptionSimulations: number;
    barrierPricingModel: 'monte-carlo' | 'closed-form';
    activeTab: string;
    customScenario: any;
    stressTestScenarios: Record<string, any>;
    useImpliedVol: boolean;
    /** Use bootstrapped curves (Rate Explorer) for quote/base rates by maturity */
    useBootstrappedInterestRates?: boolean;
    impliedVolatilities: OptionImpliedVolatility;
  } 