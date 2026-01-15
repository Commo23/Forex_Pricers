import { FXExtractionData } from "@/types/forexChat";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowDownRight, ArrowUpRight, Calendar, DollarSign, TrendingDown, TrendingUp, Target, Percent, Shield } from "lucide-react";

interface FXDataCardProps {
  data: FXExtractionData;
  isForex?: boolean;
}

export function FXDataCard({ data, isForex = true }: FXDataCardProps) {
  const formatAmount = (amount: number | null) => {
    if (amount === null) return "—";
    if (amount >= 1000000) return `${(amount / 1000000).toFixed(2)}M`;
    if (amount >= 1000) return `${(amount / 1000).toFixed(0)}K`;
    return amount.toLocaleString();
  };

  const formatMaturity = (maturity: string | null) => {
    if (maturity === null) return "—";
    const num = parseFloat(maturity);
    if (isNaN(num)) return maturity;
    if (num < 1) {
      const months = Math.round(num * 12);
      return `${months} mois`;
    }
    return `${num.toFixed(2)} an${num > 1 ? "s" : ""}`;
  };

  const getHedgeDirectionLabel = (hedgeDir: "upside" | "downside" | null) => {
    if (!hedgeDir) return null;
    if (hedgeDir === "upside") {
      return isForex ? "Protection hausse" : "Protection contre hausse prix";
    }
    return isForex ? "Protection baisse" : "Protection contre baisse prix";
  };

  return (
    <Card className="mt-4 bg-gradient-to-br from-primary/5 to-accent/5 border-primary/20">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <DollarSign className="h-5 w-5 text-primary" />
          {isForex ? "Récapitulatif de la Stratégie FX" : "Récapitulatif de la Stratégie Commodities"}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        {/* Direction and Amount */}
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${data.direction === "receive" ? "bg-green-500/10" : "bg-red-500/10"}`}>
            {data.direction === "receive" ? (
              <ArrowDownRight className="h-5 w-5 text-green-500" />
            ) : (
              <ArrowUpRight className="h-5 w-5 text-red-500" />
            )}
          </div>
          <div>
            <p className="text-sm text-muted-foreground">
              {data.direction === "receive" ? "À recevoir" : "À payer"}
            </p>
            <p className="text-xl font-bold">
              {formatAmount(data.amount)} {data.currency}
            </p>
          </div>
          <Badge variant="outline" className="ml-auto">
            Base: {data.baseCurrency || "—"}
          </Badge>
        </div>

        {/* Details Grid */}
        <div className="grid grid-cols-2 gap-3">
          {/* Maturity */}
          <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Maturité</p>
              <p className="font-medium">{formatMaturity(data.maturity)}</p>
            </div>
          </div>

          {/* Current Rate */}
          <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
            <Percent className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Taux actuel</p>
              <p className="font-medium">
                {data.currentRate !== null ? data.currentRate.toFixed(4) : "—"}
              </p>
            </div>
          </div>

          {/* Barrier */}
          {data.Barriere !== null && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
              <Target className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Barrière</p>
                <p className="font-medium">{data.Barriere.toFixed(4)}</p>
              </div>
            </div>
          )}

          {/* Hedge Direction - Always show with emphasis */}
          {data.hedgeDirection !== null && (
            <div className={`flex items-center gap-2 p-3 rounded-lg col-span-2 ${
              data.hedgeDirection === "upside" ? "bg-green-500/10 border border-green-500/30" : "bg-red-500/10 border border-red-500/30"
            }`}>
              <Shield className={`h-5 w-5 ${data.hedgeDirection === "upside" ? "text-green-500" : "text-red-500"}`} />
              <div className="flex-1">
                <p className="text-xs text-muted-foreground">Direction de couverture</p>
                <div className="flex items-center gap-2">
                  {data.hedgeDirection === "upside" ? (
                    <TrendingUp className="h-4 w-4 text-green-500" />
                  ) : (
                    <TrendingDown className="h-4 w-4 text-red-500" />
                  )}
                  <p className="font-medium">{getHedgeDirectionLabel(data.hedgeDirection)}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Pair Display */}
        <div className="pt-2 border-t border-border/50">
          <p className="text-sm text-center text-muted-foreground">
            {isForex ? "Paire" : "Commodity"}: <span className="font-semibold text-foreground">{data.currency}/{data.baseCurrency}</span>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

