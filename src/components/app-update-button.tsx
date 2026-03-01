"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isDesktopRuntime } from "@/lib/desktop";
import {
  AppUpdateState,
  checkAndInstallAppUpdate,
  getAppUpdateState,
  subscribeAppUpdate,
} from "@/lib/app-updater";

function getLabel(state: AppUpdateState): string {
  switch (state.stage) {
    case "checking":
      return "检查中";
    case "available":
      return state.version ? `更新到 ${state.version}` : "立即更新";
    case "downloading":
      return "更新中";
    case "installed":
      return "已更新";
    default:
      return "检查更新";
  }
}

export function AppUpdateButton() {
  const [updateState, setUpdateState] = useState<AppUpdateState>(getAppUpdateState());
  const [loading, setLoading] = useState(false);

  useEffect(() => subscribeAppUpdate(setUpdateState), []);

  const visible = isDesktopRuntime() && updateState.stage !== "unsupported";
  const disabled = loading || updateState.stage === "checking" || updateState.stage === "downloading";
  const label = useMemo(() => getLabel(updateState), [updateState]);

  const handleClick = async () => {
    setLoading(true);
    try {
      await checkAndInstallAppUpdate();
    } finally {
      setLoading(false);
    }
  };

  if (!visible) return null;

  return (
    <Button variant="outline" size="xs" onClick={handleClick} disabled={disabled} title="检查并安装更新">
      {disabled && <Loader2 className="size-3 animate-spin" />}
      {label}
    </Button>
  );
}
