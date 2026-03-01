"use client";

import { useEffect } from "react";
import { startAutoUpdateCheckOnce } from "@/lib/app-updater";

export function AppAutoUpdater() {
  useEffect(() => {
    startAutoUpdateCheckOnce().catch(() => {
      // 更新失败时由设置页展示状态
    });
  }, []);

  return null;
}
