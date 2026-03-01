import { invoke } from "@tauri-apps/api/core";
import type { Conversation, Message, Settings } from "@/types";

function ensureTheme(theme: "dark" | "light"): "dark" | "light" {
  return theme === "dark" ? "dark" : "light";
}

export async function desktopGetSettings(): Promise<Settings | null> {
  const result = await invoke<Settings | null>("desktop_store_get_settings");
  if (!result) return null;
  return { ...result, theme: ensureTheme(result.theme) };
}

export async function desktopSaveSettings(
  gatewayUrl: string,
  token: string,
  theme: "dark" | "light"
): Promise<Settings> {
  const result = await invoke<Settings>("desktop_store_save_settings", {
    gatewayUrl,
    token,
    theme,
  });
  return { ...result, theme: ensureTheme(result.theme) };
}

export async function desktopUpdateTheme(theme: "dark" | "light"): Promise<void> {
  await invoke("desktop_store_update_theme", { theme });
}

export async function desktopGetConversation(
  id: string
): Promise<Conversation | undefined> {
  const result = await invoke<Conversation | null>("desktop_store_get_conversation", { id });
  return result ?? undefined;
}

export async function desktopGetAllConversations(): Promise<Conversation[]> {
  return invoke<Conversation[]>("desktop_store_get_all_conversations");
}

export async function desktopCreateConversation(
  id: string,
  sessionKey: string,
  title: string
): Promise<Conversation> {
  return invoke<Conversation>("desktop_store_create_conversation", {
    id,
    sessionKey,
    title,
  });
}

export async function desktopUpdateConversationTitle(
  id: string,
  title: string
): Promise<void> {
  await invoke("desktop_store_update_conversation_title", { id, title });
}

export async function desktopDeleteConversation(id: string): Promise<void> {
  await invoke("desktop_store_delete_conversation", { id });
}

export async function desktopDeleteAllConversations(): Promise<void> {
  await invoke("desktop_store_delete_all_conversations");
}

export async function desktopGetMessages(conversationId: string): Promise<Message[]> {
  return invoke<Message[]>("desktop_store_get_messages", { conversationId });
}

export async function desktopAddMessage(message: Message): Promise<void> {
  await invoke("desktop_store_add_message", { message });
}

export async function desktopSearchConversations(query: string): Promise<Conversation[]> {
  return invoke<Conversation[]>("desktop_store_search_conversations", { query });
}

