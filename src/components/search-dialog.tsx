"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useStore } from "@/lib/store";
import { searchMessages } from "@/lib/db";
import type { Message, Conversation } from "@/types";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, X, MessageSquare, ArrowRight } from "lucide-react";

interface SearchResult {
  message: Message;
  conversation: Conversation | undefined;
}

interface SearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialScope?: "global" | "current";
}

export function SearchDialog({ open, onOpenChange, initialScope = "global" }: SearchDialogProps) {
  const { state, actions } = useStore();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [scope, setScope] = useState<"global" | "current">(initialScope);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus input when dialog opens
  useEffect(() => {
    if (open) {
      setScope(initialScope);
      setTimeout(() => inputRef.current?.focus(), 0);
    } else {
      setQuery("");
      setResults([]);
    }
  }, [open, initialScope]);

  // Search messages when query changes
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    const searchTimer = setTimeout(async () => {
      setLoading(true);
      try {
        const conversationId = scope === "current" ? state.activeConversationId ?? undefined : undefined;
        const messages = await searchMessages(query, conversationId);
        const searchResults: SearchResult[] = messages.map((msg) => ({
          message: msg,
          conversation: state.conversations.find((c) => c.id === msg.conversationId),
        }));
        setResults(searchResults);
      } catch (error) {
        console.error("Search failed:", error);
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(searchTimer);
  }, [query, scope, state.activeConversationId, state.conversations]);

  const handleSelectResult = useCallback(async (result: SearchResult) => {
    // Switch to the conversation if different
    if (result.conversation && result.conversation.id !== state.activeConversationId) {
      await actions.selectConversation(result.conversation.id);
    }
    onOpenChange(false);
    // TODO: Scroll to specific message (can be enhanced later)
  }, [state.activeConversationId, actions, onOpenChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onOpenChange(false);
    }
  }, [onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 gap-0">
        {/* Search Input */}
        <div className="flex items-center border-b px-4">
          <Search className="size-4 text-muted-foreground shrink-0" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={scope === "global" ? "搜索所有消息..." : "搜索当前会话..."}
            className="border-0 shadow-none focus-visible:ring-0 px-3"
          />
          {scope === "current" && state.activeConversationId && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-7 px-2 shrink-0"
              onClick={() => setScope("global")}
            >
              当前会话
              <ArrowRight className="size-3 ml-1" />
            </Button>
          )}
          {query && (
            <Button
              variant="ghost"
              size="icon-xs"
              className="shrink-0"
              onClick={() => setQuery("")}
            >
              <X className="size-4" />
            </Button>
          )}
        </div>

        {/* Results */}
        <ScrollArea className="max-h-[60vh]">
          {loading ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              搜索中...
            </div>
          ) : query.trim() && results.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              未找到匹配的消息
            </div>
          ) : results.length > 0 ? (
            <div className="py-2">
              {results.map((result) => (
                <button
                  key={result.message.id}
                  className="w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors"
                  onClick={() => handleSelectResult(result)}
                >
                  <div className="flex items-start gap-3">
                    <MessageSquare className="size-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      {scope === "global" && result.conversation && (
                        <p className="text-xs text-muted-foreground mb-1">
                          {result.conversation.title}
                        </p>
                      )}
                      <p className="text-sm line-clamp-2">
                        <HighlightedText
                          text={result.message.content}
                          query={query}
                        />
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {result.message.role === "user" ? "你" : "助手"} · {formatTime(result.message.createdAt)}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="py-12 text-center text-sm text-muted-foreground">
              输入关键词搜索消息
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

// Component to highlight matching text
function HighlightedText({ text, query }: { text: string; query: string }) {
  const parts = useMemo(() => {
    if (!query.trim()) return [{ text, highlight: false }];
    const regex = new RegExp(`(${escapeRegex(query)})`, "gi");
    const tokens = text.split(regex);
    return tokens.map((token) => ({
      text: token,
      highlight: token.toLowerCase() === query.toLowerCase(),
    }));
  }, [text, query]);

  return (
    <span className="whitespace-pre-wrap break-words">
      {parts.map((part, i) =>
        part.highlight ? (
          <mark key={i} className="bg-yellow-200 dark:bg-yellow-800 rounded px-0.5">
            {part.text}
          </mark>
        ) : (
          <span key={i}>{part.text}</span>
        )
      )}
    </span>
  );
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();

  if (isToday) {
    return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  }
  if (isYesterday) {
    return `昨天 ${date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`;
  }
  return date.toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
}
