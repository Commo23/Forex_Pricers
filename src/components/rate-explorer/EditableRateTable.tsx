import { useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { FuturesData } from "@/lib/rate-explorer/rateIndices";
import { ArrowUpIcon, ArrowDownIcon, MinusIcon, Edit2, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

interface EditableRateTableProps {
  data: FuturesData[];
  isLoading?: boolean;
  onDataChange?: (data: FuturesData[]) => void;
}

// Calculate effective rate: 100 - Latest price
function calculateEffectiveRate(latest: string): string {
  const latestNum = parseFloat(latest.replace(/[^0-9.-]/g, ""));
  if (isNaN(latestNum)) return "N/A";
  const effectiveRate = 100 - latestNum;
  return effectiveRate.toFixed(4);
}

export function EditableRateTable({ data, isLoading, onDataChange }: EditableRateTableProps) {
  const [editMode, setEditMode] = useState(false);
  const [editedData, setEditedData] = useState<FuturesData[]>([]);

  // Initialize edited data when entering edit mode
  const startEditing = useCallback(() => {
    setEditedData([...data]);
    setEditMode(true);
  }, [data]);

  const cancelEditing = useCallback(() => {
    setEditedData([]);
    setEditMode(false);
  }, []);

  const saveChanges = useCallback(() => {
    if (onDataChange) {
      onDataChange(editedData);
    }
    setEditMode(false);
    toast.success("Modifications sauvegardées");
  }, [editedData, onDataChange]);

  const handleCellChange = useCallback((rowIndex: number, field: keyof FuturesData, value: string) => {
    setEditedData((prev) => {
      const newData = [...prev];
      newData[rowIndex] = { ...newData[rowIndex], [field]: value };
      
      // Recalculate changeValue if change field is modified
      if (field === "change") {
        const numValue = parseFloat(value.replace(/[^0-9.-]/g, ""));
        newData[rowIndex].changeValue = isNaN(numValue) ? 0 : numValue;
      }
      
      return newData;
    });
  }, []);

  const displayData = editMode ? editedData : data;

  if (isLoading) {
    return <RateTableSkeleton />;
  }

  if (!displayData || displayData.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground">
        No data available
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Edit controls */}
      <div className="flex items-center justify-end gap-2 px-4 pt-4">
        {!editMode ? (
          <Button variant="outline" size="sm" onClick={startEditing}>
            <Edit2 className="w-4 h-4 mr-2" />
            Modifier
          </Button>
        ) : (
          <>
            <Button variant="outline" size="sm" onClick={cancelEditing}>
              <X className="w-4 h-4 mr-2" />
              Annuler
            </Button>
            <Button size="sm" onClick={saveChanges}>
              <Save className="w-4 h-4 mr-2" />
              Sauvegarder
            </Button>
          </>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Contract
              </th>
              <th className="text-right py-3 px-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Latest
              </th>
              <th className="text-right py-3 px-4 text-xs font-semibold uppercase tracking-wider text-primary">
                Taux Effectif (%)
              </th>
              <th className="text-right py-3 px-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Change
              </th>
              <th className="text-right py-3 px-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground hidden sm:table-cell">
                Open
              </th>
              <th className="text-right py-3 px-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground hidden md:table-cell">
                High
              </th>
              <th className="text-right py-3 px-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground hidden md:table-cell">
                Low
              </th>
              <th className="text-right py-3 px-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground hidden lg:table-cell">
                Previous
              </th>
            </tr>
          </thead>
          <tbody>
            {displayData.map((row, index) => (
              <tr
                key={row.contract}
                className={cn(
                  "border-b border-border/50 transition-colors hover:bg-secondary/50",
                  index % 2 === 0 ? "bg-transparent" : "bg-secondary/20"
                )}
              >
                <td className="py-3 px-4">
                  <div className="flex flex-col">
                    <span className="font-mono text-sm font-medium text-primary">
                      {row.contract}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {row.maturity}
                    </span>
                  </div>
                </td>
                <td className="py-3 px-4 text-right">
                  {editMode ? (
                    <Input
                      className="w-24 ml-auto text-right font-mono text-sm h-8"
                      value={row.latest}
                      onChange={(e) => handleCellChange(index, "latest", e.target.value)}
                    />
                  ) : (
                    <span className="font-mono text-sm tabular-nums font-medium">
                      {row.latest}
                    </span>
                  )}
                </td>
                <td className="py-3 px-4 text-right">
                  <span className="font-mono text-sm tabular-nums font-semibold text-green-400">
                    {calculateEffectiveRate(row.latest)}%
                  </span>
                </td>
                <td className="py-3 px-4 text-right">
                  {editMode ? (
                    <Input
                      className="w-20 ml-auto text-right font-mono text-sm h-8"
                      value={row.change}
                      onChange={(e) => handleCellChange(index, "change", e.target.value)}
                    />
                  ) : (
                    <ChangeCell value={row.changeValue} display={row.change} />
                  )}
                </td>
                <td className="py-3 px-4 text-right hidden sm:table-cell">
                  {editMode ? (
                    <Input
                      className="w-20 ml-auto text-right font-mono text-sm h-8"
                      value={row.open}
                      onChange={(e) => handleCellChange(index, "open", e.target.value)}
                    />
                  ) : (
                    <span className="font-mono text-sm tabular-nums text-muted-foreground">
                      {row.open}
                    </span>
                  )}
                </td>
                <td className="py-3 px-4 text-right hidden md:table-cell">
                  {editMode ? (
                    <Input
                      className="w-20 ml-auto text-right font-mono text-sm h-8"
                      value={row.high}
                      onChange={(e) => handleCellChange(index, "high", e.target.value)}
                    />
                  ) : (
                    <span className="font-mono text-sm tabular-nums text-muted-foreground">
                      {row.high}
                    </span>
                  )}
                </td>
                <td className="py-3 px-4 text-right hidden md:table-cell">
                  {editMode ? (
                    <Input
                      className="w-20 ml-auto text-right font-mono text-sm h-8"
                      value={row.low}
                      onChange={(e) => handleCellChange(index, "low", e.target.value)}
                    />
                  ) : (
                    <span className="font-mono text-sm tabular-nums text-muted-foreground">
                      {row.low}
                    </span>
                  )}
                </td>
                <td className="py-3 px-4 text-right hidden lg:table-cell">
                  {editMode ? (
                    <Input
                      className="w-20 ml-auto text-right font-mono text-sm h-8"
                      value={row.previous}
                      onChange={(e) => handleCellChange(index, "previous", e.target.value)}
                    />
                  ) : (
                    <span className="font-mono text-sm tabular-nums text-muted-foreground">
                      {row.previous}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ChangeCell({ value, display }: { value: number; display: string }) {
  const isUnchanged = display.toLowerCase() === "unch" || value === 0;
  const isPositive = value > 0;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 font-mono text-sm tabular-nums",
        isUnchanged && "text-muted-foreground",
        !isUnchanged && isPositive && "text-green-400",
        !isUnchanged && !isPositive && "text-red-400"
      )}
    >
      {isUnchanged ? (
        <MinusIcon className="w-3 h-3" />
      ) : isPositive ? (
        <ArrowUpIcon className="w-3 h-3" />
      ) : (
        <ArrowDownIcon className="w-3 h-3" />
      )}
      <span>{isUnchanged ? "unch" : (isPositive ? "+" : "") + display}</span>
    </div>
  );
}

function RateTableSkeleton() {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border">
            {["Contract", "Latest", "Taux Effectif", "Change", "Open", "High", "Low", "Previous"].map((header) => (
              <th key={header} className="py-3 px-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 8 }).map((_, i) => (
            <tr key={i} className="border-b border-border/50">
              {Array.from({ length: 8 }).map((_, j) => (
                <td key={j} className="py-3 px-4">
                  <div className="h-4 bg-secondary/50 rounded animate-pulse" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

