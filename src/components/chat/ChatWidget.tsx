import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, X, Send, Minimize2, CheckCircle2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import ChatService from '@/services/ChatService';
import ChatSyncService from '@/services/ChatSyncService';
import { ChatConfig } from '@/config/chatConfig';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

const ChatWidget: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: '👋 Bonjour! Je suis votre assistant FX intelligent. Je peux vous aider avec:\n\n• 📊 Taux de change spot en temps réel\n• 💰 Calcul de prix d\'options (Call/Put)\n• 📈 Calcul de forward FX\n\nPosez-moi une question en langage naturel!',
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [hasNewResults, setHasNewResults] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatService = ChatService.getInstance();
  const syncService = ChatSyncService.getInstance();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Synchronisation avec l'application
  useEffect(() => {
    // Démarrer le polling pour détecter les résultats
    syncService.startPolling(2000);

    // Écouter les événements de synchronisation
    const unsubscribeResults = syncService.on('resultsCalculated', (data) => {
      // Notifier l'utilisateur que les résultats sont disponibles
      setHasNewResults(true);
      
      // Ajouter un message automatique si le chat est ouvert
      setMessages(prev => {
        // Vérifier si on est déjà ouvert et non minimisé
        if (isOpen && !isMinimized) {
          const notificationMessage: Message = {
            id: `results-${Date.now()}`,
            role: 'assistant',
            content: '✅ **Résultats calculés!**\n\nLes résultats de votre stratégie sont maintenant disponibles.\n\n💡 Dites "Résultats" ou "Résumé" pour les voir.',
            timestamp: new Date()
          };
          return [...prev, notificationMessage];
        }
        return prev;
      });
    });

    const unsubscribeUpdated = syncService.on('resultsUpdated', (data) => {
      // Mettre à jour les résultats si l'utilisateur les a déjà demandés
      setMessages(prev => {
        const lastMessage = prev[prev.length - 1];
        if (lastMessage && lastMessage.role === 'assistant' && lastMessage.content.includes('Résultats de la stratégie')) {
          // Mettre à jour le dernier message avec les nouveaux résultats
          chatService.processMessage('Résultats', 'default').then(response => {
            const updatedMessage: Message = {
              ...lastMessage,
              content: response,
              timestamp: new Date()
            };
            setMessages(current => [...current.slice(0, -1), updatedMessage]);
          });
        }
        return prev;
      });
    });

    return () => {
      unsubscribeResults();
      unsubscribeUpdated();
      // Ne pas arrêter complètement le polling, juste le mettre en pause
      if (ChatConfig.pollingPauseWhenClosed) {
        syncService.pausePolling();
      }
    };
  }, [isOpen, isMinimized]);

  // Vérifier au montage si des résultats sont déjà disponibles
  useEffect(() => {
    if (syncService.hasResults()) {
      setHasNewResults(true);
    }
  }, []);

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    const currentInput = input;
    setInput('');
    setIsLoading(true);

    try {
      // Utiliser un sessionId unique par utilisateur (basé sur localStorage ou généré)
      const sessionId = 'default'; // Pour l'instant, une session unique
      const response = await chatService.processMessage(currentInput, sessionId);
      
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, assistantMessage]);

      // Si l'utilisateur demande les résultats, marquer comme lus
      if (currentInput.toLowerCase().includes('résultat') || currentInput.toLowerCase().includes('résumé')) {
        setHasNewResults(false);
      }
    } catch (error) {
      console.error('Chat error:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: '❌ Désolé, une erreur est survenue. Veuillez réessayer.',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  // Fonction pour actualiser le chat
  const handleRefresh = async () => {
    // Effacer toutes les sessions (mémoire et localStorage)
    chatService.clearAllSessions();
    
    // Réinitialiser les messages au message de bienvenue
    setMessages([{
      id: 'welcome',
      role: 'assistant',
      content: '👋 Bonjour! Je suis votre assistant FX intelligent. Je peux vous aider avec:\n\n• 📊 Taux de change spot en temps réel\n• 💰 Calcul de prix d\'options (Call/Put)\n• 📈 Calcul de forward FX\n• 🚀 Simulation de stratégies\n\nPosez-moi une question en langage naturel!',
      timestamp: new Date()
    }]);
    
    // Vérifier si des résultats sont disponibles
    const syncService = ChatSyncService.getInstance();
    if (syncService.hasResults()) {
      setHasNewResults(true);
      // Ajouter un message informatif
      setTimeout(() => {
        const infoMessage: Message = {
          id: `refresh-${Date.now()}`,
          role: 'assistant',
          content: '💡 Des résultats de stratégie sont disponibles. Dites "Résultats" pour les voir.',
          timestamp: new Date()
        };
        setMessages(prev => [...prev, infoMessage]);
      }, 500);
    } else {
      setHasNewResults(false);
    }
  };

  // Quick actions avec toutes les fonctionnalités
  const quickActions = [
    "Quel est le spot EUR/USD?",
    "Calcule un call EUR/USD strike 1.10 à 3 mois",
    "Simule une stratégie"
  ];

  if (!isOpen) {
    return (
      <Button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg z-50"
        size="lg"
      >
        <MessageSquare className="h-6 w-6" />
      </Button>
    );
  }

  return (
    <Card className={`fixed bottom-6 right-6 w-96 shadow-2xl z-50 flex flex-col ${isMinimized ? 'h-14' : 'h-[600px]'}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b bg-primary text-primary-foreground rounded-t-lg">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          <span className="font-semibold">FX Assistant</span>
          {hasNewResults && (
            <span className="flex items-center gap-1 text-xs bg-green-500 px-2 py-0.5 rounded-full">
              <CheckCircle2 className="h-3 w-3" />
              Résultats disponibles
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <Button 
            size="sm" 
            variant="ghost" 
            className="text-primary-foreground hover:bg-primary-foreground/20"
            onClick={handleRefresh}
            title="Actualiser le chat"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button 
            size="sm" 
            variant="ghost" 
            className="text-primary-foreground hover:bg-primary-foreground/20"
            onClick={() => setIsMinimized(!isMinimized)}
            title="Minimiser"
          >
            <Minimize2 className="h-4 w-4" />
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
          <ScrollArea className="flex-1 p-4">
            <div className="space-y-4">
              {messages.map(message => (
                <div
                  key={message.id}
                  className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] p-3 rounded-lg ${
                      message.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted'
                    }`}
                  >
                    <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                    <p className={`text-xs mt-1 ${
                      message.role === 'user' 
                        ? 'text-primary-foreground/70' 
                        : 'text-muted-foreground'
                    }`}>
                      {message.timestamp.toLocaleTimeString('fr-FR', { 
                        hour: '2-digit', 
                        minute: '2-digit' 
                      })}
                    </p>
                  </div>
                </div>
              ))}
              
              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-muted p-3 rounded-lg">
                    <span className="animate-pulse">💭 Réflexion en cours...</span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>

          {/* Quick Actions */}
          {messages.length === 1 && (
            <div className="px-4 pb-2 border-t">
              <p className="text-xs text-muted-foreground mb-2">Suggestions:</p>
              <div className="flex flex-wrap gap-2">
                {quickActions.map((action, i) => (
                  <Button
                    key={i}
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={() => {
                      setInput(action);
                      setTimeout(() => sendMessage(), 100);
                    }}
                  >
                    {action}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Input */}
          <div className="p-4 border-t">
            <div className="flex gap-2">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Posez votre question..."
                onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                disabled={isLoading}
                className="flex-1"
              />
              <Button onClick={sendMessage} disabled={isLoading || !input.trim()}>
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </>
      )}
    </Card>
  );
};

export default ChatWidget;

