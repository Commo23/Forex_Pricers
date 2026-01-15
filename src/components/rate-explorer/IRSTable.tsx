import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { IRSData } from "@/lib/rate-explorer/irsIndices";

interface IRSTableProps {
  data: IRSData[];
  isLoading?: boolean;
}

export function IRSTable({ data, isLoading }: IRSTableProps) {
  if (isLoading) {
    return <IRSTableSkeleton />;
  }

  if (!data || data.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No data available. Click refresh to load IRS rates.
      </div>
    );
  }

  return (
    <div className="rounded-md border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="font-semibold">Maturity</TableHead>
            <TableHead className="font-semibold text-right">Rate (%)</TableHead>
            <TableHead className="font-semibold text-right">Change</TableHead>
            <TableHead className="font-semibold text-right">Prev. Close</TableHead>
            <TableHead className="font-semibold text-right">Day Low</TableHead>
            <TableHead className="font-semibold text-right">Day High</TableHead>
            <TableHead className="font-semibold text-right">52W Low</TableHead>
            <TableHead className="font-semibold text-right">52W High</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((row) => (
            <TableRow key={row.maturity}>
              <TableCell className="font-medium">{row.maturity}</TableCell>
              <TableCell className="text-right font-mono">{row.rate}</TableCell>
              <TableCell className="text-right">
                <ChangeCell value={row.changeValue} display={row.change} />
              </TableCell>
              <TableCell className="text-right font-mono">{row.prevClose}</TableCell>
              <TableCell className="text-right font-mono">{row.dayLow}</TableCell>
              <TableCell className="text-right font-mono">{row.dayHigh}</TableCell>
              <TableCell className="text-right font-mono">{row.yearLow}</TableCell>
              <TableCell className="text-right font-mono">{row.yearHigh}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ChangeCell({ value, display }: { value: number; display: string }) {
  if (value > 0) {
    return (
      <span className="flex items-center justify-end gap-1 text-green-600">
        <TrendingUp className="h-4 w-4" />
        {display}
      </span>
    );
  } else if (value < 0) {
    return (
      <span className="flex items-center justify-end gap-1 text-red-600">
        <TrendingDown className="h-4 w-4" />
        {display}
      </span>
    );
  }
  return (
    <span className="flex items-center justify-end gap-1 text-muted-foreground">
      <Minus className="h-4 w-4" />
      {display}
    </span>
  );
}

function IRSTableSkeleton() {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Maturity</TableHead>
            <TableHead className="text-right">Rate (%)</TableHead>
            <TableHead className="text-right">Change</TableHead>
            <TableHead className="text-right">Prev. Close</TableHead>
            <TableHead className="text-right">Day Low</TableHead>
            <TableHead className="text-right">Day High</TableHead>
            <TableHead className="text-right">52W Low</TableHead>
            <TableHead className="text-right">52W High</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 10 }).map((_, i) => (
            <TableRow key={i}>
              <TableCell><Skeleton className="h-4 w-12" /></TableCell>
              <TableCell className="text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
              <TableCell className="text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
              <TableCell className="text-right"><Skeleton className="h-4 w-14 ml-auto" /></TableCell>
              <TableCell className="text-right"><Skeleton className="h-4 w-14 ml-auto" /></TableCell>
              <TableCell className="text-right"><Skeleton className="h-4 w-14 ml-auto" /></TableCell>
              <TableCell className="text-right"><Skeleton className="h-4 w-14 ml-auto" /></TableCell>
              <TableCell className="text-right"><Skeleton className="h-4 w-14 ml-auto" /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

