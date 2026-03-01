"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { ArrowUp, Square } from "lucide-react";
import { cn } from "@/lib/utils";

const MIN_HEIGHT = 72; // ~3 rows
const MAX_HEIGHT = 300;
const QUICK_PROMPTS = [
  "根据当前仓库生成一份开发计划",
  "帮我梳理这个项目的模块结构",
  "给我一个最小可回滚的改造方案",
];

export function ChatInput() {
  const { state, actions } = useStore();
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const composingRef = useRef(false);

  const isStreamingHere =
    state.isStreaming &&
    state.streamingConversationId === state.activeConversationId;

  const canSend =
    input.trim().length > 0 &&
    !isStreamingHere &&
    state.connectionStatus === "connected";
  const showQuickPrompts = !state.activeConversationId && !input.trim();

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const next = Math.max(MIN_HEIGHT, Math.min(el.scrollHeight, MAX_HEIGHT));
    el.style.height = next + "px";
  }, [input]);

  // Auto-focus when conversation changes (e.g. new chat)
  useEffect(() => {
    textareaRef.current?.focus();
  }, [state.activeConversationId]);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || isStreamingHere) return;

    setInput("");
    // sendMessage handles conversation creation if needed
    actions.sendMessage(text, state.activeConversationId || undefined);
  }, [input, isStreamingHere, state.activeConversationId, actions]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && !composingRef.current) {
      e.preventDefault();
      if (canSend) handleSend();
    }
  };

  return (
    <div className="shrink-0 bg-gradient-to-t from-background via-background to-background/80 pt-2 pb-4">
      <div className="mx-auto max-w-3xl px-4">
        {showQuickPrompts && (
          <div className="mb-4 grid gap-2 sm:grid-cols-3">
            {QUICK_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => {
                  setInput(prompt);
                  textareaRef.current?.focus();
                }}
                className={cn(
                  "rounded-2xl border border-border/60 bg-card px-4 py-3 text-left text-sm",
                  "text-foreground/90 shadow-sm transition-colors hover:bg-muted/40"
                )}
              >
                {prompt}
              </button>
            ))}
          </div>
        )}
        <div
          className={cn(
            "relative flex items-end gap-3 rounded-3xl border border-border/70 bg-card px-5 py-4",
            "shadow-sm transition-all duration-200",
            "focus-within:border-primary/40 focus-within:bg-background focus-within:shadow-md focus-within:shadow-primary/5"
          )}
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onCompositionStart={() => { composingRef.current = true; }}
            onCompositionEnd={() => { composingRef.current = false; }}
            placeholder={
              state.connectionStatus !== "connected"
                ? "请先连接网关..."
                : state.activeConversationId
                  ? "输入消息..."
                  : "开始一个新线程..."
            }
            disabled={state.connectionStatus !== "connected"}
            rows={3}
            className={cn(
              "flex-1 resize-none bg-transparent text-base outline-none leading-relaxed",
              "placeholder:text-muted-foreground/40 placeholder:leading-relaxed",
              "disabled:cursor-not-allowed disabled:opacity-40",
              "transition-[height] duration-150 ease-out"
            )}
            style={{ minHeight: MIN_HEIGHT, maxHeight: MAX_HEIGHT }}
          />
          {isStreamingHere ? (
            <Button
              size="icon"
              variant="destructive"
              onClick={() => actions.abortStreaming()}
              className="mb-0.5 size-8 shrink-0 rounded-full shadow-sm"
            >
              <Square className="size-3.5 fill-current" />
            </Button>
          ) : (
            <Button
              size="icon"
              onClick={handleSend}
              disabled={!canSend}
              className={cn(
                "mb-0.5 size-8 shrink-0 rounded-full shadow-sm transition-opacity",
                canSend ? "opacity-100" : "opacity-50"
              )}
            >
              <ArrowUp className="size-4" />
            </Button>
          )}
        </div>
        <p className="mt-2 text-center text-[10px] text-muted-foreground/40">
          回车发送，Shift + 回车换行
        </p>
      </div>
    </div>
  );
}
