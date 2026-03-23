import React, { useState, useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { BloombergChart } from "./BloombergChart";
import { useThemeContext } from "@/hooks/ThemeProvider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface PayoffChartProps {
  data: Array<{ price: number; payoff: number }>;
  strategy: any[];
  spot: number;
  currencyPair: any;
  includePremium?: boolean;
  className?: string;
  showPremiumToggle?: boolean;
  realPremium?: number; // ✅ Vraie prime calculée par PricingService
  priceData?: Array<{ spot: number; price: number; delta: number; gamma: number; theta: number; vega: number; rho: number }>; // ✅ Données de prix et grecques
}

// Generate FX hedging payoff data based on strategy
const generateFXHedgingData = (strategy: any[], spot: number, includePremium: boolean = false, realPremium?: number) => {
  const data = [];
  const minSpot = spot * 0.7;  // -30% du spot
  const maxSpot = spot * 1.3;  // +30% du spot
  const step = (maxSpot - minSpot) / 100; // 100 points

  for (let currentSpot = minSpot; currentSpot <= maxSpot; currentSpot += step) {
    const unhedgedRate = currentSpot;
    let hedgedRate = currentSpot;
    let totalPremium = 0;

    // Process each option in the strategy
    strategy.forEach(option => {
      const strike = option.strikeType === 'percent' 
        ? spot * (option.strike / 100) 
        : option.strike;
      
      // Utilise la quantité avec son signe (+ pour achat, - pour vente)
      const quantity = option.quantity / 100;
      
      // ✅ Use real premium calculated by PricingService if available
      let premium = realPremium || 0.01 * Math.abs(quantity); // Fallback to simple premium if no real premium
      
      // ✅ Adjust premium based on quantity (same premium for all scenarios when using realPremium)
      if (realPremium) {
        // Real premium already calculated for the exact option, just use it
        premium = realPremium;
      } else {
        // Fallback: For digital options, try to use more realistic premium calculation
        if (['one-touch', 'no-touch', 'double-touch', 'double-no-touch', 'range-binary', 'outside-binary'].includes(option.type)) {
          const barrier = option.barrierType === 'percent' 
            ? spot * (option.barrier / 100) 
            : option.barrier;
          const rebateDecimal = (option.rebate || 5) / 100;
          
          // Approximation simple: premium = probability * rebate * discount factor
          // Plus proche de la barrière = plus de probabilité d'activation
          let probApprox = 0.5; // Probabilité par défaut
          
          if (option.type === 'one-touch') {
            probApprox = currentSpot >= barrier ? 1 : Math.min(0.8, (currentSpot / barrier) * 0.6);
          } else if (option.type === 'no-touch') {
            probApprox = currentSpot < barrier ? Math.max(0.2, 1 - (currentSpot / barrier) * 0.6) : 0;
          }
          
          premium = probApprox * rebateDecimal * 0.95; // 5% discount factor
        }
      }
      
      if (option.type === 'put') {
        // PUT: La logique change selon achat ou vente - INVERSION COMPLÈTE
        if (currentSpot < strike) {
          // Dans la monnaie
          if (quantity > 0) {
            // ACHAT PUT: Protection contre la baisse
            // Formule inversée
            hedgedRate = currentSpot - ((strike - currentSpot) * Math.abs(quantity));
          } else if (quantity < 0) {
            // VENTE PUT: Obligation d'achat à un prix élevé
            // Formule inversée
            hedgedRate = currentSpot + ((strike - currentSpot) * Math.abs(quantity));
          }
        }
        // Hors de la monnaie: pas d'effet sur le taux (sauf prime)
      } 
      else if (option.type === 'call') {
        // CALL: La logique change selon achat ou vente
        if (currentSpot > strike) {
          // Dans la monnaie
          if (quantity > 0) {
            // ACHAT CALL: Protection contre la hausse
            hedgedRate = currentSpot - ((currentSpot - strike) * Math.abs(quantity));
          } else if (quantity < 0) {
            // VENTE CALL: Obligation de vente à un prix bas
            hedgedRate = currentSpot + ((currentSpot - strike) * Math.abs(quantity));
          }
        }
        // Hors de la monnaie: pas d'effet sur le taux (sauf prime)
      }
      else if (option.type === 'forward') {
        // FORWARD: Taux fixe peu importe le spot
        hedgedRate = strike * Math.abs(quantity) + currentSpot * (1 - Math.abs(quantity));
      }
      else if (option.type === 'swap') {
        // SWAP: Échange à taux fixe
        hedgedRate = strike;
      }
      
      // Barrier options (simplified logic)
      else if (option.type.includes('knockout') || option.type.includes('knockin')) {
        const barrier = option.barrierType === 'percent' 
          ? spot * (option.barrier / 100) 
          : option.barrier;
        
        let isBarrierBroken = false;
        
        if (option.type.includes('knockout')) {
          if (option.type.includes('call')) {
            isBarrierBroken = currentSpot >= barrier;
          } else if (option.type.includes('put')) {
            isBarrierBroken = currentSpot <= barrier;
          }
        } else if (option.type.includes('knockin')) {
          if (option.type.includes('call')) {
            isBarrierBroken = currentSpot >= barrier;
          } else if (option.type.includes('put')) {
            isBarrierBroken = currentSpot <= barrier;
          }
        }
        
        if (option.type.includes('knockout')) {
          // Option knocked out = pas de protection
          if (!isBarrierBroken) {
            if (option.type.includes('call') && currentSpot > strike) {
              // Même logique que CALL standard avec quantité signée
              if (quantity > 0) {
                hedgedRate = currentSpot - ((currentSpot - strike) * Math.abs(quantity));
              } else if (quantity < 0) {
                hedgedRate = currentSpot + ((currentSpot - strike) * Math.abs(quantity));
              }
            } else if (option.type.includes('put') && currentSpot < strike) {
              // Même logique inversée que PUT standard avec quantité signée
              if (quantity > 0) {
                // INVERSION pour PUT avec barrière - knockout
                hedgedRate = currentSpot - ((strike - currentSpot) * Math.abs(quantity));
              } else if (quantity < 0) {
                // INVERSION pour PUT avec barrière - knockout
                hedgedRate = currentSpot + ((strike - currentSpot) * Math.abs(quantity));
              }
            }
          }
        } else { // knockin
          // Option knocked in = protection active
          if (isBarrierBroken) {
            if (option.type.includes('call') && currentSpot > strike) {
              // Même logique que CALL standard avec quantité signée
              if (quantity > 0) {
                hedgedRate = currentSpot - ((currentSpot - strike) * Math.abs(quantity));
              } else if (quantity < 0) {
                hedgedRate = currentSpot + ((currentSpot - strike) * Math.abs(quantity));
              }
            } else if (option.type.includes('put') && currentSpot < strike) {
              // Même logique inversée que PUT standard avec quantité signée
              if (quantity > 0) {
                // INVERSION pour PUT avec barrière - knockin
                hedgedRate = currentSpot - ((strike - currentSpot) * Math.abs(quantity));
              } else if (quantity < 0) {
                // INVERSION pour PUT avec barrière - knockin
                hedgedRate = currentSpot + ((strike - currentSpot) * Math.abs(quantity));
              }
            }
          }
        }
      }
      else if (option.type.includes('one-touch')) {
        const barrier = option.barrierType === 'percent' 
          ? spot * (option.barrier / 100) 
          : option.barrier;
        
        // Appliquer le rebate correctement en fonction du volume et de la quantité
        if (currentSpot >= barrier) {
          // Le rebate s'applique comme pourcentage du volume, pondéré par la quantité
          const rebateDecimal = (option.rebate || 5) / 100;
          const volumeImpact = rebateDecimal * Math.abs(quantity);
          
          // Impact positif du rebate sur le taux de change effectif
          if (quantity > 0) {
            // Position longue: rebate améliore le taux (réduction effective)
            hedgedRate = currentSpot * (1 - volumeImpact);
          } else {
            // Position courte: rebate détériore le taux (coût effectif)
            hedgedRate = currentSpot * (1 + volumeImpact);
          }
        }
      }
      else if (option.type.includes('no-touch')) {
        const barrier = option.barrierType === 'percent' 
          ? spot * (option.barrier / 100) 
          : option.barrier;
        
        if (currentSpot < barrier) {
          // Même logique que one-touch pour l'impact du rebate
          const rebateDecimal = (option.rebate || 5) / 100;
          const volumeImpact = rebateDecimal * Math.abs(quantity);
          
          if (quantity > 0) {
            hedgedRate = currentSpot * (1 - volumeImpact);
          } else {
            hedgedRate = currentSpot * (1 + volumeImpact);
          }
        }
      }
      else if (option.type.includes('double-touch')) {
        const barrier1 = option.barrierType === 'percent' 
          ? spot * (option.barrier / 100) 
          : option.barrier;
        const barrier2 = option.barrierType === 'percent' 
          ? spot * (option.secondBarrier / 100) 
          : option.secondBarrier;
        
        if (currentSpot >= barrier1 || currentSpot <= barrier2) {
          // Même logique que one-touch pour l'impact du rebate
          const rebateDecimal = (option.rebate || 5) / 100;
          const volumeImpact = rebateDecimal * Math.abs(quantity);
          
          if (quantity > 0) {
            hedgedRate = currentSpot * (1 - volumeImpact);
          } else {
            hedgedRate = currentSpot * (1 + volumeImpact);
          }
        }
      }
      else if (option.type.includes('double-no-touch')) {
        const barrier1 = option.barrierType === 'percent' 
          ? spot * (option.barrier / 100) 
          : option.barrier;
        const barrier2 = option.barrierType === 'percent' 
          ? spot * (option.secondBarrier / 100) 
          : option.secondBarrier;
        
        if (currentSpot < barrier1 && currentSpot > barrier2) {
          // Même logique que no-touch pour l'impact du rebate
          const rebateDecimal = (option.rebate || 5) / 100;
          const volumeImpact = rebateDecimal * Math.abs(quantity);
          
          if (quantity > 0) {
            hedgedRate = currentSpot * (1 - volumeImpact);
          } else {
            hedgedRate = currentSpot * (1 + volumeImpact);
          }
        }
      }
      else if (option.type === 'range-binary') {
        const upperBound = option.barrierType === 'percent' 
          ? spot * (option.barrier / 100) 
          : option.barrier;
        const lowerBound = option.strikeType === 'percent'
          ? spot * (option.strike / 100)
          : option.strike;
        
        if (currentSpot <= upperBound && currentSpot >= lowerBound) {
          // Même logique que les autres options digitales pour l'impact du rebate
          const rebateDecimal = (option.rebate || 5) / 100;
          const volumeImpact = rebateDecimal * Math.abs(quantity);
          
          if (quantity > 0) {
            hedgedRate = currentSpot * (1 - volumeImpact);
          } else {
            hedgedRate = currentSpot * (1 + volumeImpact);
          }
        }
      }
      else if (option.type === 'outside-binary') {
        const upperBound = option.barrierType === 'percent' 
          ? spot * (option.barrier / 100) 
          : option.barrier;
        const lowerBound = option.strikeType === 'percent'
          ? spot * (option.strike / 100)
          : option.strike;
        
        if (currentSpot > upperBound || currentSpot < lowerBound) {
          // Même logique que les autres options digitales pour l'impact du rebate
          const rebateDecimal = (option.rebate || 5) / 100;
          const volumeImpact = rebateDecimal * Math.abs(quantity);
          
          if (quantity > 0) {
            hedgedRate = currentSpot * (1 - volumeImpact);
          } else {
            hedgedRate = currentSpot * (1 + volumeImpact);
          }
        }
      }
      
      // Ajuster pour la prime avec le signe correct selon achat/vente
      if (quantity > 0) {
        // Pour les achats d'options, on paie la prime (coût négatif)
        totalPremium += premium;
      } else if (quantity < 0) {
        // Pour les ventes d'options, on reçoit la prime (gain positif)
        totalPremium -= premium;
      }
    });

    // Ajuster pour la prime si incluse
    // La prime payée augmente le coût effectif du taux de change
    if (includePremium && strategy.length > 0) {
      hedgedRate += totalPremium;
    }

    data.push({
      spot: parseFloat(currentSpot.toFixed(4)),
      unhedgedRate: parseFloat(unhedgedRate.toFixed(4)),
      hedgedRate: parseFloat(hedgedRate.toFixed(4))
    });
  }

  return data;
};

// Custom tooltip component for FX hedging
const CustomTooltip = ({ 
  active, 
  payload, 
  label, 
  currencyPair
}: any) => {
  
  if (active && payload && payload.length) {
    const hedgedValue = payload.find((p: any) => p.dataKey === 'hedgedRate')?.value;
    const unhedgedValue = payload.find((p: any) => p.dataKey === 'unhedgedRate')?.value;
    const protection = hedgedValue && unhedgedValue ? (hedgedValue - unhedgedValue) : 0;
    
    return (
      <div className="p-3 rounded-lg shadow-lg bg-background border border-border">
        <p className="font-semibold">
          {currencyPair?.symbol || 'FX'} Rate: {Number(label).toFixed(4)}
        </p>
        {payload.map((entry: any, index: number) => (
          <p key={`item-${index}`} style={{ color: entry.color }}>
            {entry.name}: {Number(entry.value).toFixed(4)}
          </p>
        ))}
        <hr className="my-2 border-border" />
        <p className="text-sm font-medium">
          Protection: {protection > 0 ? '+' : ''}{protection.toFixed(4)}
          {protection > 0 ? ' ✅' : protection < 0 ? ' ❌' : ' ⚪'}
        </p>
        <p className="text-xs text-muted-foreground">
          <span className="font-medium">Base:</span> {currencyPair?.base || 'BASE'}
          {' | '}
          <span className="font-medium">Quote:</span> {currencyPair?.quote || 'QUOTE'}
        </p>
      </div>
    );
  }

  return null;
};

const PayoffChart: React.FC<PayoffChartProps> = ({ 
  data, 
  strategy, 
  spot, 
  currencyPair,
  includePremium = false,
  className = "",
  showPremiumToggle = false,
  realPremium, // ✅ Receive real premium
  priceData // ✅ Receive price and Greeks data
}) => {
  const [activeTab, setActiveTab] = useState<"payoff" | "hedging" | "delta" | "gamma" | "theta" | "vega" | "rho">("payoff");
  const [showPremium, setShowPremium] = useState(includePremium);
  const { theme } = useThemeContext();
  const isBloombergTheme = theme === 'bloomberg';
  
  const fxHedgingData = useMemo(() => {
    return generateFXHedgingData(strategy, spot, showPremium, realPremium); // ✅ Pass real premium
  }, [strategy, spot, showPremium, realPremium]); // ✅ Add realPremium to dependencies
  
  // Get strategy type for display
  const getStrategyName = () => {
    if (strategy.length === 0) return "No Hedging Strategy";
    if (strategy.length === 1) {
      const option = strategy[0];
      const strikeDisplay = option.strikeType === 'percent' 
        ? `${option.strike}%` 
        : option.strike.toFixed(4);
      return `${option.type.toUpperCase()} ${strikeDisplay}`;
    }
    return "Multi-Leg Hedging Strategy";
  };

  // Configure reference lines based on strategy
  const getReferenceLines = () => {
    const lines = [
      // Current spot line
      <ReferenceLine
        key="spot"
        x={spot}
        stroke="#6B7280"
        strokeWidth={2}
        strokeDasharray="3 3"
        label={{
          value: "Current Spot",
          position: "top",
          fill: "#6B7280",
          fontSize: 12,
        }}
      />
    ];

    // Add strategy-specific reference lines
    strategy.forEach((option, index) => {
      const strike = option.strikeType === 'percent' 
        ? spot * (option.strike / 100) 
        : option.strike;

      // Strike line
      lines.push(
        <ReferenceLine
          key={`strike-${index}`}
          x={strike}
          stroke="#059669"
          strokeWidth={2}
          strokeDasharray="5 5"
          label={{
            value: `${option.type.toUpperCase()} Strike`,
            position: "top",
            fill: "#059669",
            fontSize: 11,
          }}
        />
      );

      // Barrier lines for barrier options
      if (option.barrier && (option.type.includes('knockout') || option.type.includes('knockin'))) {
        const barrier = option.barrierType === 'percent' 
          ? spot * (option.barrier / 100) 
          : option.barrier;

        const isKnockout = option.type.includes('knockout');
        const barrierColor = isKnockout ? "#DC2626" : "#2563EB";

        lines.push(
          <ReferenceLine
            key={`barrier-${index}`}
            x={barrier}
            stroke={barrierColor}
            strokeWidth={2}
            strokeDasharray="4 4"
            label={{
              value: `${isKnockout ? 'KO' : 'KI'} Barrier`,
              position: "top",
              fill: barrierColor,
              fontSize: 11,
            }}
          />
        );
      }
    });

    return lines;
  };

  // Si le thème Bloomberg est activé, utiliser le BloombergChart spécialisé
  if (isBloombergTheme) {
    return (
      <Card className={`${className} bloomberg-theme`}>
        <CardHeader className="pb-2 border-b">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xl font-semibold text-orange-500">
              {activeTab === "payoff" ? "PAYOFF CHART" : "FX HEDGING PROFILE"}
            </CardTitle>
            <Tabs 
              value={activeTab} 
              onValueChange={(value) => setActiveTab(value as "payoff" | "hedging")}
              className="ml-auto"
            >
              <TabsList className="bg-secondary">
                <TabsTrigger value="payoff" className="text-sm">Payoff</TabsTrigger>
                <TabsTrigger value="hedging" className="text-sm">FX Hedging</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <div className="text-sm text-muted-foreground mt-1 font-mono">
            {getStrategyName()}
          </div>
        </CardHeader>
        <CardContent className="pt-4 px-2">
          {activeTab === "payoff" ? (
            <BloombergChart 
              data={data}
              spotPrice={spot}
              title="Payoff Chart"
              height={400}
            />
          ) : (
            <ResponsiveContainer width="100%" height={400}>
              <LineChart 
                data={fxHedgingData}
                margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                style={{ backgroundColor: '#101418', borderRadius: '4px' }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#2a3039" />
                <XAxis 
                  dataKey="spot"
                  domain={["dataMin", "dataMax"]}
                  tick={{ fill: '#aaa' }}
                  tickLine={{ stroke: '#aaa' }}
                  axisLine={{ stroke: '#aaa' }}
                  label={{
                    value: 'Spot Rate',
                    position: 'insideBottom',
                    offset: -5,
                    style: {
                      fill: '#aaa',
                      fontFamily: '"Roboto Mono", monospace',
                      fontSize: '12px'
                    }
                  }}
                />
                <YAxis 
                  tick={{ fill: '#aaa' }}
                  tickLine={{ stroke: '#aaa' }}
                  axisLine={{ stroke: '#aaa' }}
                  label={{
                    value: 'Effective Rate',
                    angle: -90,
                    position: 'insideLeft',
                    style: {
                      fill: '#aaa',
                      fontFamily: '"Roboto Mono", monospace',
                      fontSize: '12px'
                    }
                  }}
                />
                <Tooltip 
                  content={<CustomTooltip currencyPair={currencyPair} />}
                />
                <Legend 
                  wrapperStyle={{
                    fontFamily: '"Roboto Mono", monospace',
                    fontSize: '12px',
                    color: '#aaa'
                  }}
                />
                <ReferenceLine
                  x={spot}
                  stroke="#21a621"
                  strokeDasharray="3 3"
                  label={{
                    value: `Spot: ${spot.toFixed(2)}`,
                    position: 'top',
                    fill: '#21a621',
                    fontSize: '10px',
                    fontFamily: '"Roboto Mono", monospace'
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="unhedgedRate"
                  stroke="#777"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  dot={false}
                  name="Unhedged Rate"
                />
                <Line
                  type="monotone"
                  dataKey="hedgedRate"
                  stroke="#ffa500"
                  strokeWidth={3}
                  dot={false}
                  activeDot={{ r: 6, stroke: '#ffa500', strokeWidth: 2, fill: '#101418' }}
                  name="Hedged Rate"
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    );
  }

  // Sinon, utiliser le chart standard existant
  return (
    <Card className={className}>
      <CardHeader className="pb-2 border-b">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xl font-semibold">
            {activeTab === "payoff" ? "Payoff Chart" : "FX Hedging Profile"}
          </CardTitle>
          <div className="flex items-center gap-4">
            {showPremiumToggle && (
              <div className="flex items-center space-x-2">
                <Switch
                  id="premium-toggle"
                  checked={showPremium}
                  onCheckedChange={setShowPremium}
                />
                <Label htmlFor="premium-toggle" className="text-sm">
                  Inclure Prime
                </Label>
              </div>
            )}
            <Tabs 
              value={activeTab} 
              onValueChange={(value) => setActiveTab(value as "payoff" | "hedging" | "delta" | "gamma" | "theta" | "vega" | "rho")}
            >
              <TabsList>
                <TabsTrigger value="payoff">Payoff</TabsTrigger>
                <TabsTrigger value="hedging">FX Hedging</TabsTrigger>
                <TabsTrigger value="delta">Delta</TabsTrigger>
                <TabsTrigger value="gamma">Gamma</TabsTrigger>
                <TabsTrigger value="theta">Theta</TabsTrigger>
                <TabsTrigger value="vega">Vega</TabsTrigger>
                <TabsTrigger value="rho">Rho</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>
        <div className="text-sm text-muted-foreground mt-1">
          {activeTab === "payoff" || activeTab === "hedging" ? getStrategyName() : `Graphs : ${getStrategyName()}`}
        </div>
      </CardHeader>
      <CardContent className="pt-4 px-2">
        {activeTab === "payoff" && (
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="price" 
                label={{ value: 'Price', position: 'insideBottomRight', offset: -5 }}
              />
              <YAxis 
                label={{
                  value: 'Profit/Loss', 
                  angle: -90, 
                  position: 'insideLeft',
                  style: { textAnchor: 'middle' }
                }}
              />
              <Tooltip content={<CustomTooltip currencyPair={currencyPair} />} />
              <Legend />
              {getReferenceLines()}
              <Line
                type="monotone"
                dataKey="payoff"
                stroke="#c4d82e"
                strokeWidth={2}
                dot={false}
                name="Profit/Loss"
              />
            </LineChart>
          </ResponsiveContainer>
        )}

        {activeTab === "hedging" && (
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={fxHedgingData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="spot" 
                label={{ value: 'Spot Rate', position: 'insideBottomRight', offset: -5 }}
              />
              <YAxis
                label={{
                  value: 'Effective Rate', 
                  angle: -90,
                  position: 'insideLeft',
                  style: { textAnchor: 'middle' }
                }}
              />
              <Tooltip content={<CustomTooltip currencyPair={currencyPair} />} />
              <Legend />
              <ReferenceLine
                x={spot}
                stroke="#6B7280"
                strokeDasharray="3 3"
                label={{
                  value: `Current Spot: ${spot.toFixed(4)}`,
                  position: 'top',
                  fill: "#6B7280",
                  fontSize: 12,
                }}
              />
              <Line
                type="monotone"
                dataKey="unhedgedRate"
                stroke="#9CA3AF"
                strokeWidth={2}
                strokeDasharray="4 4"
                dot={false}
                name="Unhedged Rate"
              />
              <Line
                type="monotone"
                dataKey="hedgedRate"
                stroke="#3B82F6"
                strokeWidth={3}
                dot={false}
                activeDot={{ r: 6, fill: "#3B82F6" }}
                name="Hedged Rate"
              />
            </LineChart>
          </ResponsiveContainer>
        )}

        {/* ✅ NOUVEAU: Graphiques individuels pour chaque Grec */}
        {activeTab === "delta" && priceData && (
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={priceData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="spot" 
                label={{ value: 'spot', position: 'insideBottomRight', offset: -5 }}
              />
              <YAxis
                label={{
                  value: 'delta', 
                  angle: -90,
                  position: 'insideLeft',
                  style: { textAnchor: 'middle' }
                }}
              />
              <Tooltip 
                formatter={(value: number) => [
                  value.toFixed(6),
                  'Delta'
                ]}
                labelFormatter={(label: number) => `Spot: ${label.toFixed(4)}`}
              />
              <Legend />
              <ReferenceLine
                x={spot}
                stroke="#22C55E"
                strokeDasharray="3 3"
                label={{
                  value: 'strike',
                  position: 'top',
                  fill: "#22C55E",
                  fontSize: 12,
                }}
              />
              <Line
                type="monotone"
                dataKey="delta"
                stroke="#000000"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: "#EF4444" }}
                name="Delta"
              />
            </LineChart>
          </ResponsiveContainer>
        )}

        {activeTab === "gamma" && priceData && (
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={priceData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="spot" 
                label={{ value: 'spot', position: 'insideBottomRight', offset: -5 }}
              />
              <YAxis
                label={{
                  value: 'gamma', 
                  angle: -90,
                  position: 'insideLeft',
                  style: { textAnchor: 'middle' }
                }}
              />
              <Tooltip 
                formatter={(value: number) => [
                  value.toFixed(6),
                  'Gamma'
                ]}
                labelFormatter={(label: number) => `Spot: ${label.toFixed(4)}`}
              />
              <Legend />
              <ReferenceLine
                x={spot}
                stroke="#22C55E"
                strokeDasharray="3 3"
                label={{
                  value: 'strike',
                  position: 'top',
                  fill: "#22C55E",
                  fontSize: 12,
                }}
              />
              <Line
                type="monotone"
                dataKey="gamma"
                stroke="#000000"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: "#EF4444" }}
                name="Gamma"
              />
            </LineChart>
          </ResponsiveContainer>
        )}

        {activeTab === "theta" && priceData && (
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={priceData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="spot" 
                label={{ value: 'spot', position: 'insideBottomRight', offset: -5 }}
              />
              <YAxis
                label={{
                  value: 'theta', 
                  angle: -90,
                  position: 'insideLeft',
                  style: { textAnchor: 'middle' }
                }}
              />
              <Tooltip 
                formatter={(value: number) => [
                  value.toFixed(6),
                  'Theta'
                ]}
                labelFormatter={(label: number) => `Spot: ${label.toFixed(4)}`}
              />
              <Legend />
              <ReferenceLine
                x={spot}
                stroke="#22C55E"
                strokeDasharray="3 3"
                label={{
                  value: 'strike',
                  position: 'top',
                  fill: "#22C55E",
                  fontSize: 12,
                }}
              />
              <Line
                type="monotone"
                dataKey="theta"
                stroke="#000000"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: "#EF4444" }}
                name="Theta"
              />
            </LineChart>
          </ResponsiveContainer>
        )}

        {activeTab === "vega" && priceData && (
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={priceData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="spot" 
                label={{ value: 'spot', position: 'insideBottomRight', offset: -5 }}
              />
              <YAxis
                label={{
                  value: 'vega', 
                  angle: -90,
                  position: 'insideLeft',
                  style: { textAnchor: 'middle' }
                }}
              />
              <Tooltip 
                formatter={(value: number) => [
                  value.toFixed(6),
                  'Vega'
                ]}
                labelFormatter={(label: number) => `Spot: ${label.toFixed(4)}`}
              />
              <Legend />
              <ReferenceLine
                x={spot}
                stroke="#22C55E"
                strokeDasharray="3 3"
                label={{
                  value: 'strike',
                  position: 'top',
                  fill: "#22C55E",
                  fontSize: 12,
                }}
              />
              <Line
                type="monotone"
                dataKey="vega"
                stroke="#000000"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: "#EF4444" }}
                name="Vega"
              />
            </LineChart>
          </ResponsiveContainer>
        )}

        {activeTab === "rho" && priceData && (
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={priceData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="spot" 
                label={{ value: 'spot', position: 'insideBottomRight', offset: -5 }}
              />
              <YAxis
                label={{
                  value: 'rho', 
                  angle: -90,
                  position: 'insideLeft',
                  style: { textAnchor: 'middle' }
                }}
              />
              <Tooltip 
                formatter={(value: number) => [
                  value.toFixed(6),
                  'Rho'
                ]}
                labelFormatter={(label: number) => `Spot: ${label.toFixed(4)}`}
              />
              <Legend />
              <ReferenceLine
                x={spot}
                stroke="#22C55E"
                strokeDasharray="3 3"
                label={{
                  value: 'strike',
                  position: 'top',
                  fill: "#22C55E",
                  fontSize: 12,
                }}
              />
              <Line
                type="monotone"
                dataKey="rho"
                stroke="#000000"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: "#EF4444" }}
                name="Rho"
              />
            </LineChart>
          </ResponsiveContainer>
        )}

        {/* Message si pas de données de prix */}
        {(activeTab === "delta" || activeTab === "gamma" || activeTab === "theta" || activeTab === "vega" || activeTab === "rho") && !priceData && (
          <div className="flex items-center justify-center h-96 text-muted-foreground">
            <div className="text-center">
              <p className="text-lg font-medium mb-2">Aucune donnée de prix disponible</p>
              <p className="text-sm">Cliquez sur "Calculate" pour générer les courbes de grecques</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default PayoffChart; 