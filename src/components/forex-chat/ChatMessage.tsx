import { cn } from "@/lib/utils";
import { Message, parseFXExtractionFromResponse, FXDisplayMode, AssetClass } from "@/types/forexChat";
import { Bot, User } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { FXDataCard } from "./FXDataCard";
import { FXDataJSON } from "./FXDataJSON";
import { useMemo } from "react";

interface ChatMessageProps {
  message: Message;
  fxDisplayMode?: FXDisplayMode;
  assetClass?: AssetClass;
}

export function ChatMessage({ message, fxDisplayMode = "card", assetClass = "forex" }: ChatMessageProps) {
  const isUser = message.role === "user";

  // Parse FX data from assistant messages
  const { fxData, cleanContent } = useMemo(() => {
    if (isUser) return { fxData: null, cleanContent: message.content };
    const result = parseFXExtractionFromResponse(message.content);
    return { fxData: result.data, cleanContent: result.cleanContent };
  }, [message.content, isUser]);

  return (
    <div
      className={cn(
        "flex gap-3 animate-fade-in",
        isUser ? "flex-row-reverse" : "flex-row"
      )}
    >
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-secondary text-foreground"
        )}
      >
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>

      <div
        className={cn(
          "max-w-[80%] rounded-xl px-4 py-3",
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-card border border-border"
        )}
      >
        {isUser ? (
          <p className="text-sm">{message.content}</p>
        ) : (
          <div className="prose prose-invert prose-sm max-w-none">
            <ReactMarkdown
              components={{
                p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                ul: ({ children }) => (
                  <ul className="list-disc pl-4 mb-2 space-y-1">{children}</ul>
                ),
                ol: ({ children }) => (
                  <ol className="list-decimal pl-4 mb-2 space-y-1">{children}</ol>
                ),
                li: ({ children }) => <li className="text-sm">{children}</li>,
                strong: ({ children }) => (
                  <strong className="font-semibold text-primary">{children}</strong>
                ),
                code: ({ children }) => (
                  <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono text-accent">
                    {children}
                  </code>
                ),
                h1: ({ children }) => (
                  <h1 className="text-lg font-bold text-foreground mb-2">{children}</h1>
                ),
                h2: ({ children }) => (
                  <h2 className="text-base font-semibold text-foreground mb-2">{children}</h2>
                ),
                h3: ({ children }) => (
                  <h3 className="text-sm font-semibold text-foreground mb-1">{children}</h3>
                ),
              }}
            >
              {cleanContent}
            </ReactMarkdown>
            
            {/* Display FX Data based on display mode setting */}
            {fxData && (
              fxDisplayMode === "card" 
                ? <FXDataCard data={fxData} isForex={assetClass === "forex"} />
                : <FXDataJSON data={fxData} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

