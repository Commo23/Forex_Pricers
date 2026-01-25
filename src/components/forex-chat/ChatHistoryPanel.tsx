import { History, Plus, Trash2, MessageSquare, Edit2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ChatHistory } from "@/types/forexChat";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface ChatHistoryPanelProps {
  chatHistory: ChatHistory[];
  currentChatId: string | null;
  onNewChat: () => void;
  onLoadChat: (chatId: string) => void;
  onDeleteChat: (chatId: string) => void;
  onUpdateTitle: (chatId: string, title: string) => void;
}

export function ChatHistoryPanel({
  chatHistory,
  currentChatId,
  onNewChat,
  onLoadChat,
  onDeleteChat,
  onUpdateTitle,
}: ChatHistoryPanelProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");

  const handleStartEdit = (chat: ChatHistory) => {
    setEditingId(chat.id);
    setEditTitle(chat.title);
  };

  const handleSaveEdit = (chatId: string) => {
    if (editTitle.trim()) {
      onUpdateTitle(chatId, editTitle.trim());
    }
    setEditingId(null);
    setEditTitle("");
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditTitle("");
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "À l'instant";
    if (diffMins < 60) return `Il y a ${diffMins} min`;
    if (diffHours < 24) return `Il y a ${diffHours}h`;
    if (diffDays < 7) return `Il y a ${diffDays}j`;
    return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  };

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <History className="h-4 w-4" />
          Historique
        </Button>
      </SheetTrigger>
      <SheetContent className="w-[400px] sm:w-[540px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-primary" />
            Historique des conversations
          </SheetTitle>
          <SheetDescription>
            Gérez vos conversations et créez de nouveaux chats
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 mt-6">
          {/* New Chat Button */}
          <Button
            onClick={onNewChat}
            className="w-full gap-2 bg-primary hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            Nouvelle conversation
          </Button>

          {/* Chat List */}
          <ScrollArea className="h-[calc(100vh-250px)]">
            <div className="space-y-2">
              {chatHistory.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Aucune conversation</p>
                  <p className="text-sm mt-2">Créez votre première conversation</p>
                </div>
              ) : (
                chatHistory.map((chat) => (
                  <div
                    key={chat.id}
                    className={cn(
                      "group relative flex items-start gap-3 p-3 rounded-lg border transition-colors cursor-pointer",
                      currentChatId === chat.id
                        ? "bg-primary/10 border-primary"
                        : "bg-card border-border hover:bg-secondary/50"
                    )}
                    onClick={() => onLoadChat(chat.id)}
                  >
                    <div className="flex-1 min-w-0">
                      {editingId === chat.id ? (
                        <div className="flex items-center gap-2">
                          <Input
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                handleSaveEdit(chat.id);
                              } else if (e.key === "Escape") {
                                handleCancelEdit();
                              }
                            }}
                            className="h-8 text-sm"
                            autoFocus
                            onClick={(e) => e.stopPropagation()}
                          />
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSaveEdit(chat.id);
                            }}
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCancelEdit();
                            }}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-start justify-between gap-2">
                            <h4 className="font-medium text-sm truncate flex-1">
                              {chat.title}
                            </h4>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleStartEdit(chat);
                                }}
                              >
                                <Edit2 className="h-3 w-3" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6 text-destructive hover:text-destructive"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (confirm("Supprimer cette conversation ?")) {
                                    onDeleteChat(chat.id);
                                  }
                                }}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                            <span>{chat.messages.length} message{chat.messages.length > 1 ? 's' : ''}</span>
                            <span>•</span>
                            <span>{formatDate(chat.updatedAt)}</span>
                          </div>
                          {chat.messages.length > 0 && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                              {chat.messages[0].content.substring(0, 60)}...
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </div>
      </SheetContent>
    </Sheet>
  );
}

