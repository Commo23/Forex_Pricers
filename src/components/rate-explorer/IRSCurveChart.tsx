import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { IRSData } from "@/lib/rate-explorer/irsIndices";

interface IRSCurveChartProps {
  data: IRSData[];
  currency: string;
}

export function IRSCurveChart({ data, currency }: IRSCurveChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="h-[400px] flex items-center justify-center text-muted-foreground">
        No data available for chart
      </div>
    );
  }

  // Sort by tenor and prepare chart data
  const chartData = [...data]
    .sort((a, b) => a.tenor - b.tenor)
    .map((d) => ({
      maturity: d.maturity,
      tenor: d.tenor,
      rate: d.rateValue,
    }));

  return (
    <div className="h-[400px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={chartData}
          margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
        >
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis
            dataKey="maturity"
            tick={{ fill: 'hsl(var(--foreground))' }}
            tickLine={{ stroke: 'hsl(var(--foreground))' }}
          />
          <YAxis
            tick={{ fill: 'hsl(var(--foreground))' }}
            tickLine={{ stroke: 'hsl(var(--foreground))' }}
            domain={['auto', 'auto']}
            tickFormatter={(value) => `${value.toFixed(2)}%`}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                const data = payload[0].payload;
                return (
                  <div className="bg-popover border rounded-lg shadow-lg p-3">
                    <p className="font-semibold text-foreground">{data.maturity}</p>
                    <p className="text-sm text-muted-foreground">
                      Rate: <span className="font-mono text-foreground">{data.rate.toFixed(4)}%</span>
                    </p>
                  </div>
                );
              }
              return null;
            }}
          />
          <Legend />
          <Line
            type="monotone"
            dataKey="rate"
            name={`${currency} Swap Rate`}
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            dot={{ fill: 'hsl(var(--primary))', strokeWidth: 2, r: 4 }}
            activeDot={{ r: 6, fill: 'hsl(var(--primary))' }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

