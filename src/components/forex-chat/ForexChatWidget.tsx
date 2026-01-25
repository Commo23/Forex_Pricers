import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, X, Minimize2, Maximize2, Bot } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useForexChat } from '@/hooks/useForexChat';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { TypingIndicator } from './TypingIndicator';
import { ChatSettingsPanel } from './ChatSettingsPanel';
import { ChatHistoryPanel } from './ChatHistoryPanel';
import { useNavigate } from 'react-router-dom';

const ForexChatWidget: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { 
    messages, 
    isLoading, 
    sendMessage, 
    clearMessages, 
    settings, 
    setSettings,
    currentChatId,
    chatHistory,
    createNewChat,
    loadChat,
    deleteChat,
    updateChatTitle
  } = useForexChat();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen && !isMinimized) {
      scrollToBottom();
    }
  }, [messages, isOpen, isMinimized]);

  const handleOpenFullPage = () => {
    navigate('/forex-chat');
  };

  if (!isOpen) {
    return (
      <Button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg z-50 bg-primary hover:bg-primary/90"
        size="lg"
      >
        <MessageSquare className="h-6 w-6" />
      </Button>
    );
  }

  return (
    <Card className={`fixed bottom-6 right-6 w-96 shadow-2xl z-50 flex flex-col ${isMinimized ? 'h-14' : 'h-[600px]'}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b bg-primary text-primary-foreground rounded-t-lg shrink-0">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5" />
          <span className="font-semibold">Forex Chat AI</span>
        </div>
        <div className="flex gap-2">
          <Button 
            size="sm" 
            variant="ghost" 
            className="text-primary-foreground hover:bg-primary-foreground/20"
            onClick={handleOpenFullPage}
            title="Ouvrir en pleine page"
          >
            <Maximize2 className="h-4 w-4" />
          </Button>
          <Button 
            size="sm" 
            variant="ghost" 
            className="text-primary-foreground hover:bg-primary-foreground/20"
            onClick={() => setIsMinimized(!isMinimized)}
            title={isMinimized ? "Agrandir" : "Minimiser"}
          >
            {isMinimized ? <Maximize2 className="h-4 w-4" /> : <Minimize2 className="h-4 w-4" />}
          </Button>
          <Button 
            size="sm" 
            variant="ghost"
            className="text-primary-foreground hover:bg-primary-foreground/20"
            onClick={() => setIsOpen(false)}
            title="Fermer"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {!isMinimized && (
        <>
          {/* Messages */}
          <ScrollArea className="flex-1 p-4 min-h-0">
            <div className="space-y-4">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center text-center py-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 mb-3">
                    <Bot className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="text-sm font-semibold text-foreground mb-1">
                    Forex Chat AI
                  </h3>
                  <p className="text-xs text-muted-foreground mb-4">
                    Expert en couverture de change. Posez vos questions !
                  </p>
                  <Button
                    onClick={handleOpenFullPage}
                    variant="outline"
                    size="sm"
                    className="text-xs"
                  >
                    Ouvrir en pleine page
                  </Button>
                </div>
              ) : (
                <>
                  {messages.map((message, index) => (
                    <ChatMessage 
                      key={index} 
                      message={message} 
                      fxDisplayMode={settings.fxDisplayMode} 
                      assetClass={settings.assetClass} 
                    />
                  ))}
                  {isLoading && messages[messages.length - 1]?.role === "user" && (
                    <TypingIndicator />
                  )}
                  <div ref={messagesEndRef} />
                </>
              )}
            </div>
          </ScrollArea>

          {/* Settings and Actions */}
          <div className="px-4 py-2 border-t flex items-center justify-between shrink-0 gap-2">
            <div className="flex items-center gap-2">
              <ChatHistoryPanel
                chatHistory={chatHistory}
                currentChatId={currentChatId}
                onNewChat={createNewChat}
                onLoadChat={loadChat}
                onDeleteChat={deleteChat}
                onUpdateTitle={updateChatTitle}
              />
              <ChatSettingsPanel settings={settings} onSettingsChange={setSettings} />
            </div>
            {messages.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearMessages}
                className="text-xs h-7"
              >
                Effacer
              </Button>
            )}
          </div>

          {/* Input */}
          <div className="p-4 border-t shrink-0">
            <ChatInput onSend={sendMessage} isLoading={isLoading} placeholder="Posez votre question..." />
          </div>
        </>
      )}
    </Card>
  );
};

export default ForexChatWidget;

