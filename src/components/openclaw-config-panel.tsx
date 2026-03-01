"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  OpenclawCliPayload,
  OpenclawLogsPayload,
  OpenclawOverviewPayload,
  OpenclawSectionPayload,
  OpenclawValidatePayload,
  queryOpenclawSection,
  readOpenclawConfig,
  readOpenclawLogs,
  readOpenclawOverview,
  readOpenclawSection,
  saveOpenclawConfig,
  validateOpenclawConfig,
} from "@/lib/openclaw-config";
import { isDesktopRuntime } from "@/lib/desktop";
import { OpenclawSectionId, getSectionLabel } from "@/components/openclaw-nav";
import { buildCliSummary, isCliSection, OpenclawCliActions } from "@/components/openclaw/openclaw-cli-section";
import { OpenclawSkillsSection } from "@/components/openclaw/openclaw-skills-section";
import { GatewaySettingsPanel } from "@/components/settings-dialog";

const sectionMap: Record<OpenclawSectionId, string | null> = {
  settings: null,
  overview: null,
  channels: "channels",
  instances: "instances",
  sessions: "sessions",
  usage: "usage",
  cronJobs: "cronJobs",
  agents: "agents",
  skills: "skills",
  nodes: "nodes",
  config: null,
  debug: null,
  logs: null,
};

function toPretty(value: unknown): string {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return "{}";
  }
}

export function OpenclawConfigPanel({ section }: { section: OpenclawSectionId }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [path, setPath] = useState("");
  const [editor, setEditor] = useState("{}");
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [overview, setOverview] = useState<OpenclawOverviewPayload | null>(null);
  const [sectionData, setSectionData] = useState<OpenclawSectionPayload | null>(null);
  const [cliData, setCliData] = useState<OpenclawCliPayload | null>(null);
  const [logsData, setLogsData] = useState<OpenclawLogsPayload>({ files: [], lines: [] });
  const [logsKeyword, setLogsKeyword] = useState("");
  const [validateData, setValidateData] = useState<OpenclawValidatePayload | null>(null);

  const sectionKey = sectionMap[section];
  const showRawEditor = section === "config" || section === "debug";
  const isStandaloneSection = section === "settings";

  const loadConfig = useCallback(async () => {
    try {
      const result = await readOpenclawConfig();
      setPath(result.path || "~/.openclaw/openclaw.json");
      setEditor(result.raw || "{}");
    } catch (err) {
      setError(err instanceof Error ? err.message : "读取配置失败");
    }
  }, []);

  const loadSection = useCallback(async () => {
    setLoading(true);
    setError("");
    setSectionData(null);
    setCliData(null);
    try {
      if (section === "overview") {
        setOverview(await readOpenclawOverview());
        return;
      }
      if (section === "settings" || section === "skills") {
        return;
      }
      if (section === "logs") {
        setLogsData(await readOpenclawLogs(300, logsKeyword));
        return;
      }
      if (section === "debug") {
        setValidateData(await validateOpenclawConfig(editor));
        return;
      }
      if (isCliSection(section)) {
        const payload = await queryOpenclawSection(section);
        setCliData(payload);
        if (!payload.ok && sectionKey) {
          setSectionData(await readOpenclawSection(sectionKey));
        }
        return;
      }
      if (sectionKey) {
        setSectionData(await readOpenclawSection(sectionKey));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载分区失败");
    } finally {
      setLoading(false);
    }
  }, [editor, logsKeyword, section, sectionKey]);

  useEffect(() => {
    setError("");
    loadConfig().catch(() => {
      // 已在函数中处理
    });
  }, [loadConfig]);

  useEffect(() => {
    if (!isDesktopRuntime()) return;
    loadSection().catch(() => {
      // 已在函数中处理
    });
  }, [loadSection]);

  const preview = useMemo(() => (sectionData ? toPretty(sectionData.value) : toPretty({})), [sectionData]);
  const filteredLines = useMemo(() => {
    if (!logsKeyword.trim()) return logsData.lines;
    const key = logsKeyword.toLowerCase();
    return logsData.lines.filter((line) => line.toLowerCase().includes(key));
  }, [logsData.lines, logsKeyword]);
  const cliSummary = useMemo(() => (cliData ? buildCliSummary(section, cliData.data) : []), [cliData, section]);

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      const result = await saveOpenclawConfig(editor);
      setEditor(result.raw || "{}");
      setPath(result.path || path);
      setSavedAt(Date.now());
      if (section === "debug") {
        setValidateData(await validateOpenclawConfig(result.raw || "{}"));
      } else {
        await loadSection();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存配置失败");
    } finally {
      setSaving(false);
    }
  };

  const sectionBody = () => {
    if (section === "overview") {
      return (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card title="配置文件">{overview?.path || path || "~/.openclaw/openclaw.json"}</Card>
          <Card title="分区数量">{String(overview?.sectionCount ?? 0)}</Card>
          <Card title="网关配置">{overview?.hasGateway ? "已配置" : "未配置"}</Card>
          <Card title="鉴权令牌">{overview?.hasGatewayToken ? "已配置" : "未配置"}</Card>
        </div>
      );
    }

    if (section === "logs") {
      return (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={logsKeyword}
              onChange={(event) => setLogsKeyword(event.target.value)}
              placeholder="筛选日志关键字"
              className="h-8 max-w-xs"
            />
            <Button variant="outline" size="sm" onClick={() => loadSection()} disabled={loading}>
              刷新日志
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            文件：{logsData.files.length ? logsData.files.join("，") : "未发现日志文件"}
          </p>
          <pre className="max-h-[55vh] overflow-auto rounded-md border border-border/60 bg-muted/40 p-3 text-xs leading-5">
            {filteredLines.length ? filteredLines.join("\n") : "暂无日志"}
          </pre>
        </div>
      );
    }

    if (section === "debug") {
      return (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => loadSection()} disabled={loading}>
              校验配置
            </Button>
            {validateData?.valid ? (
              <span className="text-xs text-emerald-500">校验通过</span>
            ) : (
              <span className="text-xs text-destructive">存在错误</span>
            )}
          </div>
          <pre className="max-h-[55vh] overflow-auto rounded-md border border-border/60 bg-muted/40 p-3 text-xs leading-5">
            {toPretty(validateData ?? { valid: false, errors: ["尚未校验"], warnings: [] })}
          </pre>
        </div>
      );
    }

    if (section === "settings") return <GatewaySettingsPanel />;
    if (section === "skills") return <OpenclawSkillsSection />;

    if (isCliSection(section)) {
      return (
        <div className="space-y-3">
          {cliSummary.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {cliSummary.map((item) => (
                <Card key={item.title} title={item.title}>
                  {item.value}
                </Card>
              ))}
            </div>
          )}
          <OpenclawCliActions section={section} onActionDone={loadSection} />
          {cliData && (
            <p className={`text-xs ${cliData.ok ? "text-muted-foreground" : "text-destructive"}`}>
              命令：{cliData.command.join(" ") || "无"}
              {`  ·  状态码：${cliData.statusCode}`}
              {cliData.stderr ? `  ·  错误：${cliData.stderr}` : ""}
            </p>
          )}
          {!cliData?.ok && sectionData && (
            <p className="text-xs text-muted-foreground">网关命令不可用，已回退展示配置分区数据。</p>
          )}
          <pre className="max-h-[55vh] overflow-auto rounded-md border border-border/60 bg-muted/40 p-3 text-xs leading-5">
            {cliData ? toPretty(cliData.data) : preview}
          </pre>
        </div>
      );
    }

    return (
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">条目数：{sectionData?.itemCount ?? 0}</p>
        <pre className="max-h-[55vh] overflow-auto rounded-md border border-border/60 bg-muted/40 p-3 text-xs leading-5">
          {preview}
        </pre>
      </div>
    );
  };

  if (!isDesktopRuntime()) {
    return (
      <div className="flex-1 p-6">
        <div className="mx-auto max-w-4xl rounded-xl border border-border/70 bg-card p-5">
          <h2 className="text-lg font-semibold">配置中心</h2>
          <p className="mt-2 text-sm text-muted-foreground">该功能仅桌面运行时可用。</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="rounded-xl border border-border/70 bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-2xl font-semibold">{getSectionLabel(section)}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {isStandaloneSection ? "在独立页面完成安全配置。" : "接管 openclaw 配置与运行信息。"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {section !== "skills" && !isStandaloneSection && (
                <Button variant="outline" onClick={() => loadSection()} disabled={loading || saving}>
                  刷新数据
                </Button>
              )}
              {showRawEditor && (
                <Button onClick={handleSave} disabled={loading || saving}>
                  {saving ? "保存中..." : "保存配置"}
                </Button>
              )}
            </div>
          </div>
          {!isStandaloneSection && (
            <p className="mt-3 rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              路径：{path || "~/.openclaw/openclaw.json"}
              {savedAt ? `  ·  最近保存：${new Date(savedAt).toLocaleTimeString()}` : ""}
            </p>
          )}
          {error && (
            <p className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
        <div className="rounded-xl border border-border/70 bg-card p-4">{sectionBody()}</div>
        {showRawEditor && (
          <div className="rounded-xl border border-border/70 bg-card p-4">
            <h3 className="mb-2 text-sm font-semibold">原始配置</h3>
            <textarea
              value={editor}
              onChange={(event) => setEditor(event.target.value)}
              className="h-[45vh] w-full resize-none rounded-md border border-border bg-muted/40 p-3 font-mono text-xs leading-5 outline-none focus:border-primary/40"
              spellCheck={false}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: string }) {
  return (
    <div className="rounded-lg border border-border/70 bg-muted/30 px-3 py-2">
      <p className="text-xs text-muted-foreground">{title}</p>
      <p className="mt-1 break-all text-sm">{children}</p>
    </div>
  );
}
