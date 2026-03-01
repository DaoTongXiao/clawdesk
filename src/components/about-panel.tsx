"use client";

import { useEffect, useState } from "react";
import { getDesktopAppVersion } from "@/lib/desktop";

export function AboutPanel() {
  const [version, setVersion] = useState("读取中...");

  useEffect(() => {
    getDesktopAppVersion()
      .then((value) => {
        if (!value) {
          setVersion("未知");
          return;
        }
        setVersion(value);
      })
      .catch(() => {
        setVersion("未知");
      });
  }, []);

  return (
    <section className="mx-auto w-full max-w-3xl space-y-4">
      <div className="rounded-xl border border-border/70 bg-card p-5">
        <h3 className="text-base font-semibold">关于</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2">
            <p className="text-xs text-muted-foreground">应用名称</p>
            <p className="mt-1 text-sm font-medium">ClawDesk</p>
          </div>
          <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2">
            <p className="text-xs text-muted-foreground">当前版本</p>
            <p className="mt-1 text-sm font-medium">{version}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
