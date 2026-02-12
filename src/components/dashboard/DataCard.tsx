import { ReactNode } from "react";

interface DataCardProps {
  title: string;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function DataCard({ title, children, actions, className = "" }: DataCardProps) {
  return (
    <div className={`bg-card rounded-lg border border-border overflow-hidden ${className}`}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-table-header">
        <h2 className="text-sm font-semibold">{title}</h2>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}
