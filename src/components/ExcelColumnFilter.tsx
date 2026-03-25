import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Filter, X } from "lucide-react";

export type ExcelFilterOption = { value: string; label?: string };

export function ExcelColumnFilter({
  title,
  options,
  selected,
  onChange,
  className,
}: {
  title: string;
  options: ExcelFilterOption[];
  selected: string[];
  onChange: (nextSelected: string[]) => void;
  className?: string;
}) {
  const [q, setQ] = useState("");
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return options;
    return options.filter((o) => (o.label ?? o.value).toLowerCase().includes(qq));
  }, [options, q]);

  const allValues = useMemo(() => options.map((o) => o.value), [options]);
  const isAllSelected = selected.length > 0 && selected.length === allValues.length;

  const toggle = (value: string) => {
    const next = new Set(selectedSet);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onChange(Array.from(next));
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className={className}>
          <Filter className="h-3.5 w-3.5" />
          {selected.length > 0 && <Badge variant="secondary" className="ml-2 px-1.5 py-0">{selected.length}</Badge>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[280px] p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-semibold">{title}</div>
          {selected.length > 0 && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => onChange([])}
              title="Clear filter"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        <div className="mt-2">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search..." className="h-8" />
        </div>

        <div className="mt-2 max-h-[260px] overflow-auto pr-1 space-y-1">
          <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 hover:bg-muted">
            <Checkbox
              checked={isAllSelected}
              onCheckedChange={() => onChange(isAllSelected ? [] : allValues)}
            />
            <span className="text-sm">Select all</span>
          </label>

          {filtered.map((o) => {
            const label = o.label ?? o.value;
            return (
              <label key={o.value} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 hover:bg-muted">
                <Checkbox checked={selectedSet.has(o.value)} onCheckedChange={() => toggle(o.value)} />
                <span className="text-sm">{label}</span>
              </label>
            );
          })}
          {filtered.length === 0 && <div className="px-2 py-6 text-center text-sm text-muted-foreground">No values</div>}
        </div>
      </PopoverContent>
    </Popover>
  );
}

