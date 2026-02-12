interface PriceChangeProps {
  value: string;
  className?: string;
}

export function PriceChange({ value, className = "" }: PriceChangeProps) {
  const numVal = parseFloat(value.replace(/[^0-9.\-+]/g, ""));
  const isPositive = !isNaN(numVal) && numVal > 0;
  const isNegative = !isNaN(numVal) && numVal < 0;

  return (
    <span
      className={`data-cell ${
        isPositive ? "text-positive" : isNegative ? "text-negative" : "text-muted-foreground"
      } ${className}`}
    >
      {isPositive && !value.startsWith("+") ? "+" : ""}
      {value || "N/A"}
    </span>
  );
}
