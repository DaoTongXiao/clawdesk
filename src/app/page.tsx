"use client";

import { StoreProvider } from "@/lib/store";
import { ChatLayout } from "@/components/chat-layout";
import { AppAutoUpdater } from "@/components/app-auto-updater";

export default function Home() {
  return (
    <StoreProvider>
      <AppAutoUpdater />
      <ChatLayout />
    </StoreProvider>
  );
}
