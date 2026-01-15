import { useRef, useEffect } from "react";
import { Layout } from "@/components/Layout";
import { useForexChat } from "@/hooks/useForexChat";
import { ChatMessage } from "@/components/forex-chat/ChatMessage";
import { ChatInput } from "@/components/forex-chat/ChatInput";
import { TypingIndicator } from "@/components/forex-chat/TypingIndicator";
import { MarketDataPanel } from "@/components/forex-chat/MarketDataPanel";
import { ChatSettingsPanel } from "@/components/forex-chat/ChatSettingsPanel";
import { Bot, Trash2, TrendingUp, Shield, BarChart3, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";

const QUICK_ACTIONS = [
  { icon: Shield, label: "Stratégies de hedging", prompt: "Quelles sont les principales stratégies de couverture FOREX pour une entreprise exposée au risque EUR/USD ?" },
  { icon: TrendingUp, label: "Forwards vs Options", prompt: "Compare les forwards et les options pour couvrir une exposition de change. Quels sont les avantages et inconvénients de chaque instrument ?" },
  { icon: BarChart3, label: "Analyser mon risque", prompt: "Comment puis-je évaluer mon exposition au risque de change ? Quels sont les indicateurs clés à surveiller ?" },
];

const STRATEGY_PROMPT = `Je souhaite initier une nouvelle stratégie de couverture de change. Peux-tu m'aider à définir les paramètres ? J'ai besoin de te donner :
- Le montant à couvrir
- La devise concernée
- Si je dois payer ou recevoir cette devise
- La date d'échéance
- Ma devise de référence`;

const ForexChat = () => {
  const { messages, isLoading, sendMessage, clearMessages, settings, setSettings } = useForexChat();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <Layout title="Forex Chat AI">
      <div className="flex h-[calc(100vh-8.5rem)] bg-background -m-2 -mb-0">
        {/* Chat Section */}
        <div className="flex-1 flex flex-col min-w-0 h-full">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-card/50 shrink-0">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary glow-primary">
                <Bot className="h-5 w-5 text-primary-foreground" />
              </div>
              <div>
                <h1 className="font-semibold text-foreground">ForexHedge AI</h1>
                <p className="text-xs text-muted-foreground">Expert en couverture de change</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <ChatSettingsPanel settings={settings} onSettingsChange={setSettings} />
              {messages.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearMessages}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Effacer
                </Button>
              )}
            </div>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0 flex flex-col">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center flex-1 text-center py-8">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 mb-6">
                <Bot className="h-8 w-8 text-primary" />
              </div>
              <h2 className="text-2xl font-bold text-foreground mb-2">
                Bienvenue sur <span className="gradient-text">ForexHedge AI</span>
              </h2>
              <p className="text-muted-foreground max-w-md mb-8">
                Je suis votre assistant expert en finance de marché, spécialisé dans le hedging FOREX.
                Posez-moi vos questions sur les stratégies de couverture, l'analyse des risques, ou les instruments dérivés.
              </p>

              {/* Quick Actions */}
              <div className="grid gap-3 w-full max-w-xl">
                {QUICK_ACTIONS.map((action) => (
                  <button
                    key={action.label}
                    onClick={() => sendMessage(action.prompt)}
                    className="flex items-center gap-3 p-4 bg-card border border-border rounded-xl hover:border-primary/50 hover:bg-secondary/50 transition-all text-left group"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary group-hover:bg-primary/20 transition-colors">
                      <action.icon className="h-5 w-5 text-primary" />
                    </div>
                    <span className="text-sm font-medium text-foreground">{action.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4 max-w-3xl mx-auto w-full pb-4">
              {messages.map((message, index) => (
                <ChatMessage key={index} message={message} fxDisplayMode={settings.fxDisplayMode} assetClass={settings.assetClass} />
              ))}
              {isLoading && messages[messages.length - 1]?.role === "user" && (
                <TypingIndicator />
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
          </div>

          {/* Input Area */}
          <div className="px-6 py-3 border-t border-border bg-card/50 shrink-0 mt-auto">
            <div className="max-w-3xl mx-auto space-y-2">
              {messages.length === 0 && (
                <div className="flex justify-center">
                  <Button
                    onClick={() => sendMessage(STRATEGY_PROMPT)}
                    disabled={isLoading}
                    className="gap-2 bg-gradient-to-r from-primary to-accent hover:opacity-90"
                  >
                    <Rocket className="h-4 w-4" />
                    Initier une stratégie
                  </Button>
                </div>
              )}
              <ChatInput onSend={sendMessage} isLoading={isLoading} />
            </div>
          </div>
        </div>

        {/* Market Data Panel - Hidden on mobile */}
        <div className="hidden lg:block w-80 xl:w-96 border-l border-border h-full">
          <MarketDataPanel />
        </div>
      </div>
    </Layout>
  );
};

export default ForexChat;

