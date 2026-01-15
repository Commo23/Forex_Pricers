import { FXExtractionData } from "@/types/forexChat";
import { Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";

interface FXDataJSONProps {
  data: FXExtractionData;
}

export function FXDataJSON({ data }: FXDataJSONProps) {
  const [copied, setCopied] = useState(false);
  
  const jsonString = JSON.stringify(data, null, 2);

  const handleCopy = () => {
    navigator.clipboard.writeText(jsonString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="mt-4 relative">
      <div className="flex items-center justify-between px-3 py-2 bg-muted rounded-t-lg border border-border border-b-0">
        <span className="text-xs font-medium text-muted-foreground">FX_DATA</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={handleCopy}
        >
          {copied ? (
            <>
              <Check className="h-3 w-3 mr-1" />
              Copié
            </>
          ) : (
            <>
              <Copy className="h-3 w-3 mr-1" />
              Copier
            </>
          )}
        </Button>
      </div>
      <pre className="bg-background border border-border rounded-b-lg p-4 overflow-x-auto text-xs font-mono text-foreground">
        {jsonString}
      </pre>
    </div>
  );
}

