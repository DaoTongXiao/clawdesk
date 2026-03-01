"use client";

import { useState, useEffect, useRef } from "react";
import {
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { AppSidebar, SidebarMode } from "@/components/app-sidebar";
import { ChatMessages } from "@/components/chat-messages";
import { ChatInput } from "@/components/chat-input";
import { ConnectionIndicator } from "@/components/connection-indicator";
import { OpenclawConfigPanel } from "@/components/openclaw-config-panel";
import { OpenclawSectionId, getSectionLabel } from "@/components/openclaw-nav";
import { useStore } from "@/lib/store";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Pencil } from "lucide-react";

export function ChatLayout() {
  const { state, actions } = useStore();
  const [mode, setMode] = useState<SidebarMode>("chat");
  const [openclawSection, setOpenclawSection] = useState<OpenclawSectionId>("settings");

  const activeConv = state.activeConversationId
    ? state.conversations.find((c) => c.id === state.activeConversationId)
    : null;

  const title =
    mode === "chat"
      ? activeConv?.title ?? state.agentIdentity?.name ?? "ClawDesk"
      : getSectionLabel(openclawSection);

  // Rename dialog state
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  const openRename = () => {
    if (!activeConv) return;
    setRenameValue(activeConv.title);
    setRenameOpen(true);
  };

  const confirmRename = () => {
    if (activeConv && renameValue.trim()) {
      actions.renameConversation(activeConv.id, renameValue.trim());
    }
    setRenameOpen(false);
  };

  useEffect(() => {
    if (renameOpen) {
      setTimeout(() => renameInputRef.current?.select(), 0);
    }
  }, [renameOpen]);

  return (
    <SidebarProvider className="!min-h-0 h-dvh">
      <AppSidebar
        mode={mode}
        onModeChange={setMode}
        activeOpenclawSection={openclawSection}
        onOpenclawSectionChange={setOpenclawSection}
      />
      <SidebarInset className="min-h-0">
        {/* Header */}
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border/50 px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 !h-4" />
          <div className="flex flex-1 items-center gap-1 min-w-0">
            <h1 className="truncate text-sm font-medium">{title}</h1>
            {mode === "chat" && activeConv && (
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={openRename}
                title="Rename conversation"
                className="shrink-0"
              >
                <Pencil className="size-3.5" />
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {mode === "chat" && <ConnectionIndicator />}
          </div>
        </header>

        {mode === "chat" ? (
          <>
            {/* Messages */}
            <ChatMessages />

            {/* Input */}
            <ChatInput />
          </>
        ) : (
          <OpenclawConfigPanel section={openclawSection} />
        )}
      </SidebarInset>

      {/* Rename Dialog */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename conversation</DialogTitle>
            <DialogDescription>Enter a new title for this conversation.</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              confirmRename();
            }}
          >
            <Input
              ref={renameInputRef}
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              placeholder="Conversation title"
            />
            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" onClick={() => setRenameOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!renameValue.trim()}>
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
}
