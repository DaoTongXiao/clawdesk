"use client";

import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OpenclawSectionId } from "@/components/openclaw-nav";
import { OpenclawCliPayload, runOpenclawAction } from "@/lib/openclaw-config";

export const cliSections: ReadonlySet<OpenclawSectionId> = new Set([
  "channels",
  "instances",
  "sessions",
  "usage",
  "cronJobs",
  "agents",
  "skills",
  "nodes",
]);

export function isCliSection(section: OpenclawSectionId): boolean {
  return cliSections.has(section);
}

function valueAtPath(payload: unknown, path: string[]): unknown {
  let current: unknown = payload;
  for (const key of path) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function numberOrZero(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function arraySize(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

export function buildCliSummary(section: OpenclawSectionId, data: unknown): Array<{ title: string; value: string }> {
  switch (section) {
    case "channels":
      return [
        { title: "通道类型", value: String(Object.keys((valueAtPath(data, ["chat"]) as Record<string, unknown>) || {}).length) },
        { title: "鉴权配置", value: String(arraySize(valueAtPath(data, ["auth"]))) },
      ];
    case "instances":
      return [
        { title: "通道总数", value: String(arraySize(valueAtPath(data, ["channelOrder"]))) },
        { title: "运行中实例", value: String(Object.values((valueAtPath(data, ["channels"]) as Record<string, unknown>) || {}).filter((v) => Boolean((v as Record<string, unknown>)?.running)).length) },
      ];
    case "sessions":
      return [
        { title: "会话总数", value: String(numberOrZero(valueAtPath(data, ["count"]))) },
        { title: "跨代理统计", value: Boolean(valueAtPath(data, ["allAgents"])) ? "是" : "否" },
      ];
    case "usage":
      return [
        { title: "总令牌数", value: String(numberOrZero(valueAtPath(data, ["totals", "totalTokens"]))) },
        { title: "总成本", value: String(numberOrZero(valueAtPath(data, ["totals", "totalCost"]))) },
      ];
    case "cronJobs":
      return [
        { title: "任务总数", value: String(numberOrZero(valueAtPath(data, ["total"]))) },
        { title: "启用任务", value: String(arraySize((valueAtPath(data, ["jobs"]) as unknown[] | undefined)?.filter((job) => Boolean((job as Record<string, unknown>)?.enabled)))) },
      ];
    case "agents":
      return [
        { title: "代理总数", value: String(arraySize(data)) },
        { title: "默认代理", value: String((Array.isArray(data) ? (data.find((v) => Boolean((v as Record<string, unknown>)?.isDefault)) as Record<string, unknown> | undefined) : undefined)?.id || "未设置") },
      ];
    case "skills":
      return [
        { title: "技能总数", value: String(arraySize(valueAtPath(data, ["skills"]))) },
        { title: "可用技能", value: String(arraySize((valueAtPath(data, ["skills"]) as unknown[] | undefined)?.filter((skill) => Boolean((skill as Record<string, unknown>)?.eligible)))) },
      ];
    case "nodes":
      return [
        { title: "节点总数", value: String(arraySize(valueAtPath(data, ["nodes"]))) },
        { title: "在线节点", value: String(arraySize((valueAtPath(data, ["nodes"]) as unknown[] | undefined)?.filter((node) => Boolean((node as Record<string, unknown>)?.connected)))) },
      ];
    default:
      return [];
  }
}

export function OpenclawCliActions({
  section,
  onActionDone,
}: {
  section: OpenclawSectionId;
  onActionDone: () => Promise<void>;
}) {
  const [target, setTarget] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<OpenclawCliPayload | null>(null);

  const doAction = async (action: string, dryRun = false) => {
    setRunning(true);
    try {
      const payload = await runOpenclawAction(section, action, target.trim() || undefined, dryRun);
      setResult(payload);
      await onActionDone();
    } catch (error) {
      setResult({
        section,
        command: [],
        ok: false,
        statusCode: -1,
        data: null,
        stderr: error instanceof Error ? error.message : "执行失败",
      });
    } finally {
      setRunning(false);
    }
  };

  let content: ReactNode = null;
  if (section === "sessions") {
    content = (
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" disabled={running} onClick={() => doAction("cleanup", true)}>
          预览清理
        </Button>
        <Button size="sm" disabled={running} onClick={() => doAction("cleanup", false)}>
          执行清理
        </Button>
      </div>
    );
  } else if (section === "cronJobs") {
    content = (
      <div className="flex flex-wrap items-center gap-2">
        <Input value={target} onChange={(event) => setTarget(event.target.value)} placeholder="任务ID" className="h-8 max-w-xs" />
        <Button variant="outline" size="sm" disabled={running} onClick={() => doAction("enable")}>启用</Button>
        <Button variant="outline" size="sm" disabled={running} onClick={() => doAction("disable")}>禁用</Button>
        <Button variant="outline" size="sm" disabled={running} onClick={() => doAction("run")}>立即执行</Button>
        <Button variant="destructive" size="sm" disabled={running} onClick={() => doAction("remove")}>删除任务</Button>
      </div>
    );
  } else if (section === "nodes") {
    content = (
      <div className="flex flex-wrap items-center gap-2">
        <Input value={target} onChange={(event) => setTarget(event.target.value)} placeholder="配对请求ID" className="h-8 max-w-xs" />
        <Button variant="outline" size="sm" disabled={running} onClick={() => doAction("approve")}>批准配对</Button>
        <Button variant="destructive" size="sm" disabled={running} onClick={() => doAction("reject")}>拒绝配对</Button>
      </div>
    );
  }

  if (!content) return null;

  return (
    <div className="space-y-2">
      {content}
      {result && (
        <p className={`text-xs ${result.ok ? "text-emerald-500" : "text-destructive"}`}>
          {result.ok ? "操作成功" : "操作失败"}
          {result.stderr ? `：${result.stderr}` : ""}
        </p>
      )}
    </div>
  );
}
