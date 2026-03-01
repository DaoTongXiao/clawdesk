"use client";

import { useState, useEffect, useRef } from "react";
import { useStore } from "@/lib/store";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { OpenclawNav, OpenclawSectionId } from "@/components/openclaw-nav";
import { MessageSquarePlus, MessageSquare, Trash2, Moon, Sun, MoreHorizontal, Search, Pencil } from "lucide-react";
import Image from "next/image";

export type SidebarMode = "chat" | "openclaw";

export function AppSidebar({
  mode,
  onModeChange,
  activeOpenclawSection,
  onOpenclawSectionChange,
}: {
  mode: SidebarMode;
  onModeChange: (mode: SidebarMode) => void;
  activeOpenclawSection: OpenclawSectionId;
  onOpenclawSectionChange: (section: OpenclawSectionId) => void;
}) {
  const { state, actions } = useStore();
  const { setOpenMobile, isMobile } = useSidebar();
  const [searchQuery, setSearchQuery] = useState("");

  // Rename dialog state
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Delete dialog state
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Delete-all dialog state
  const [deleteAllOpen, setDeleteAllOpen] = useState(false);

  const filtered = searchQuery
    ? state.conversations.filter((c) =>
        c.title.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : state.conversations;

  const handleNew = async () => {
    await actions.newConversation();
    if (isMobile) setOpenMobile(false);
  };

  const handleSelect = async (id: string) => {
    await actions.selectConversation(id);
    if (isMobile) setOpenMobile(false);
  };

  const openRename = (id: string, currentTitle: string) => {
    setRenameId(id);
    setRenameValue(currentTitle);
    setRenameOpen(true);
  };

  const confirmRename = () => {
    if (renameId && renameValue.trim()) {
      actions.renameConversation(renameId, renameValue.trim());
    }
    setRenameOpen(false);
  };

  const openDelete = (id: string) => {
    setDeleteId(id);
    setDeleteOpen(true);
  };

  const confirmDelete = () => {
    if (deleteId) {
      actions.deleteConversation(deleteId);
    }
    setDeleteOpen(false);
  };

  const confirmDeleteAll = () => {
    actions.deleteAllConversations();
    setDeleteAllOpen(false);
  };

  // Auto-focus rename input when dialog opens
  useEffect(() => {
    if (renameOpen) {
      setTimeout(() => renameInputRef.current?.select(), 0);
    }
  }, [renameOpen]);

  return (
    <>
      <Sidebar collapsible="icon" className="border-r-0">
        {/* Header: Brand + New Chat */}
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" className="pointer-events-none">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg overflow-hidden">
                  <Image src="/logo.png" alt="ClawDesk" width={32} height={32} />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">ClawDesk</span>
                  <span className="truncate text-xs text-sidebar-foreground/60">
                  </span>
                </div>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        <div className="px-2 pb-2 group-data-[collapsible=icon]:hidden">
          <div className="grid grid-cols-2 gap-1 rounded-lg border border-sidebar-border/60 bg-sidebar-accent/40 p-1">
            <Button variant={mode === "chat" ? "default" : "ghost"} size="sm" className="h-7" onClick={() => onModeChange("chat")}>
              聊天
            </Button>
            <Button variant={mode === "openclaw" ? "default" : "ghost"} size="sm" className="h-7" onClick={() => onModeChange("openclaw")}>
              配置
            </Button>
          </div>
        </div>

        {mode === "chat" ? (
          <>
            <div className="px-2 pt-1 group-data-[collapsible=icon]:hidden">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-sidebar-foreground/50" />
                <SidebarInput
                  placeholder="搜索会话..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>

            <SidebarContent>
              <SidebarGroup>
                <SidebarGroupLabel>会话</SidebarGroupLabel>
                <SidebarGroupAction title="新建会话" onClick={handleNew}>
                  <MessageSquarePlus className="size-4" />
                </SidebarGroupAction>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {filtered.length === 0 ? (
                      <p className="px-2 py-6 text-center text-xs text-sidebar-foreground/50">
                        {searchQuery ? "未找到匹配会话" : "暂无会话"}
                      </p>
                    ) : (
                      filtered.map((conv) => (
                        <SidebarMenuItem key={conv.id}>
                          <SidebarMenuButton
                            isActive={state.activeConversationId === conv.id}
                            onClick={() => handleSelect(conv.id)}
                            tooltip={conv.title}
                          >
                            <MessageSquare className="size-4" />
                            <span>{conv.title}</span>
                          </SidebarMenuButton>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <SidebarMenuAction showOnHover>
                                <MoreHorizontal className="size-4" />
                              </SidebarMenuAction>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent side="right" align="start">
                              <DropdownMenuItem
                                onClick={() => openRename(conv.id, conv.title)}
                              >
                                <Pencil className="size-4" />
                                重命名
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => openDelete(conv.id)}
                              >
                                <Trash2 className="size-4" />
                                删除
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </SidebarMenuItem>
                      ))
                    )}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            </SidebarContent>
          </>
        ) : (
          <OpenclawNav activeSection={activeOpenclawSection} onSelect={onOpenclawSectionChange} />
        )}

        {/* Footer */}
        <SidebarFooter>
          <SidebarMenu>
            {mode === "chat" && state.conversations.length > 0 && (
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => setDeleteAllOpen(true)}
                  tooltip="删除全部会话"
                >
                  <Trash2 className="size-4" />
                  <span>删除全部</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )}
            <SidebarMenuItem>
              <SidebarMenuButton onClick={() => actions.toggleTheme()} tooltip="切换主题">
                {state.settings?.theme === "light" ? (
                  <Moon className="size-4" />
                ) : (
                  <Sun className="size-4" />
                )}
                <span>
                  {state.settings?.theme === "light" ? "深色模式" : "浅色模式"}
                </span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>

      {/* Rename Dialog */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>重命名会话</DialogTitle>
            <DialogDescription>请输入会话新名称。</DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); confirmRename(); }}>
            <Input ref={renameInputRef} value={renameValue} onChange={(e) => setRenameValue(e.target.value)} placeholder="会话名称" />
            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" onClick={() => setRenameOpen(false)}>
                取消
              </Button>
              <Button type="submit" disabled={!renameValue.trim()}>
                保存
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除该会话？</AlertDialogTitle>
            <AlertDialogDescription>
              该操作会永久删除当前会话及其全部消息。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete All Confirmation */}
      <AlertDialog open={deleteAllOpen} onOpenChange={setDeleteAllOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除全部会话？</AlertDialogTitle>
            <AlertDialogDescription>
              该操作会永久删除全部会话与消息，且不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteAll}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              删除全部
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
