import { useMemo } from "react";
import { FuturesData } from "@/lib/rate-explorer/rateIndices";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";

interface RateCurveChartProps {
  data: FuturesData[];
  showEffectiveRate?: boolean;
}

// Helper to extract year from maturity string like "Dec '25" or "(Dec '25)"
function extractYearMonth(maturity: string): { year: number; month: number } {
  const match = maturity.match(/(\w{3})\s*'(\d{2})/);
  if (!match) return { year: 2025, month: 1 };
  
  const monthNames: Record<string, number> = {
    Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
    Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12,
  };
  
  const monthNum = monthNames[match[1]] || 1;
  const yearNum = 2000 + parseInt(match[2], 10);
  
  return { year: yearNum, month: monthNum };
}

// Sort by maturity date
function sortByMaturity(a: FuturesData, b: FuturesData): number {
  const dateA = extractYearMonth(a.maturity);
  const dateB = extractYearMonth(b.maturity);
  
  if (dateA.year !== dateB.year) return dateA.year - dateB.year;
  return dateA.month - dateB.month;
}

export function RateCurveChart({ data, showEffectiveRate = true }: RateCurveChartProps) {
  const chartData = useMemo(() => {
    if (!data || data.length === 0) return [];
    
    // Sort by maturity and transform data
    return [...data]
      .sort(sortByMaturity)
      .map((item) => {
        const latestNum = parseFloat(item.latest.replace(/[^0-9.-]/g, ""));
        const effectiveRate = 100 - latestNum;
        
        return {
          contract: item.contract,
          maturity: item.maturity,
          latest: latestNum,
          effectiveRate: parseFloat(effectiveRate.toFixed(4)),
        };
      });
  }, [data]);

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        No data available for chart
      </div>
    );
  }

  const chartConfig = {
    latest: {
      label: "Latest Price",
      color: "hsl(var(--primary))",
    },
    effectiveRate: {
      label: "Effective Rate (%)",
      color: "hsl(142, 76%, 36%)",
    },
  };

  // Calculate min/max for Y axis
  const values = showEffectiveRate 
    ? chartData.map((d) => d.effectiveRate)
    : chartData.map((d) => d.latest);
  
  const minVal = Math.floor(Math.min(...values) * 10) / 10 - 0.2;
  const maxVal = Math.ceil(Math.max(...values) * 10) / 10 + 0.2;

  return (
    <ChartContainer config={chartConfig} className="h-[350px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={chartData}
          margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="hsl(var(--border))"
            opacity={0.5}
          />
          <XAxis
            dataKey="maturity"
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            tickLine={{ stroke: "hsl(var(--border))" }}
            axisLine={{ stroke: "hsl(var(--border))" }}
            angle={-45}
            textAnchor="end"
            height={60}
            interval={Math.floor(chartData.length / 12)}
          />
          <YAxis
            domain={[minVal, maxVal]}
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            tickLine={{ stroke: "hsl(var(--border))" }}
            axisLine={{ stroke: "hsl(var(--border))" }}
            tickFormatter={(value) => `${value.toFixed(2)}%`}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                formatter={(value, name) => [
                  `${Number(value).toFixed(4)}%`,
                  name === "effectiveRate" ? "Taux Effectif" : "Prix Latest",
                ]}
              />
            }
          />
          {showEffectiveRate ? (
            <Line
              type="monotone"
              dataKey="effectiveRate"
              stroke="hsl(142, 76%, 36%)"
              strokeWidth={2}
              dot={{ r: 3, fill: "hsl(142, 76%, 36%)" }}
              activeDot={{ r: 5, fill: "hsl(142, 76%, 36%)" }}
            />
          ) : (
            <Line
              type="monotone"
              dataKey="latest"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              dot={{ r: 3, fill: "hsl(var(--primary))" }}
              activeDot={{ r: 5, fill: "hsl(var(--primary))" }}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </ChartContainer>
  );
}

