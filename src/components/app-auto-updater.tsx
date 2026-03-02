"use client";

import { useEffect } from "react";
import { checkAndInstallAppUpdate, startAutoUpdateCheckOnce } from "@/lib/app-updater";
import { startAutoOpenclawUpdateCheck } from "@/lib/openclaw-updater";

const UPDATE_CHECK_INTERVAL_MS = 10 * 60 * 1000;

export function AppAutoUpdater() {
  useEffect(() => {
    startAutoUpdateCheckOnce().catch(() => {
      // 更新失败时由设置页展示状态
    });

    startAutoOpenclawUpdateCheck().catch(() => {
      // OpenClaw 更新检查失败时由设置页展示状态
    });

    const timer = window.setInterval(() => {
      checkAndInstallAppUpdate().catch(() => {
        // 忽略周期检查异常，等待下次重试
      });
    }, UPDATE_CHECK_INTERVAL_MS);

    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      checkAndInstallAppUpdate().catch(() => {
        // 忽略前台复查异常，等待下次重试
      });
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  return null;
}
