"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  installOpenclawSkill,
  readOpenclawSkillsStatus,
  SkillStatusEntry,
  SkillStatusReport,
  updateOpenclawSkill,
} from "@/lib/openclaw-skills";

type SkillMessage = {
  kind: "success" | "error";
  message: string;
};

type SkillGroup = {
  id: string;
  label: string;
  skills: SkillStatusEntry[];
};

const sourceGroups: Array<{ id: string; label: string; sources: string[] }> = [
  { id: "workspace", label: "工作区技能", sources: ["openclaw-workspace"] },
  { id: "built-in", label: "内置技能", sources: ["openclaw-bundled"] },
  { id: "installed", label: "已安装技能", sources: ["openclaw-managed"] },
  { id: "extra", label: "扩展技能", sources: ["openclaw-extra"] },
];

function trimText(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

function computeMissing(skill: SkillStatusEntry): string[] {
  return [
    ...skill.missing.bins.map((item) => `命令:${item}`),
    ...skill.missing.env.map((item) => `环境:${item}`),
    ...skill.missing.config.map((item) => `配置:${item}`),
    ...skill.missing.os.map((item) => `系统:${item}`),
  ];
}

function computeReasons(skill: SkillStatusEntry): string[] {
  const reasons: string[] = [];
  if (skill.disabled) reasons.push("已禁用");
  if (skill.blockedByAllowlist) reasons.push("被白名单阻断");
  return reasons;
}

function groupSkills(skills: SkillStatusEntry[]): SkillGroup[] {
  const groups = new Map<string, SkillGroup>();
  for (const def of sourceGroups) {
    groups.set(def.id, { id: def.id, label: def.label, skills: [] });
  }

  const builtIn = sourceGroups.find((item) => item.id === "built-in");
  const other: SkillGroup = { id: "other", label: "其他技能", skills: [] };
  for (const skill of skills) {
    const match = skill.bundled
      ? builtIn
      : sourceGroups.find((item) => item.sources.includes(skill.source));
    if (match) {
      groups.get(match.id)?.skills.push(skill);
    } else {
      other.skills.push(skill);
    }
  }

  const ordered = sourceGroups
    .map((item) => groups.get(item.id))
    .filter((item): item is SkillGroup => Boolean(item && item.skills.length > 0));
  if (other.skills.length > 0) {
    ordered.push(other);
  }
  return ordered;
}

function StatusChip({ children, tone = "normal" }: { children: string; tone?: "normal" | "ok" | "warn" }) {
  const toneClass =
    tone === "ok"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600"
      : tone === "warn"
        ? "border-amber-500/40 bg-amber-500/10 text-amber-600"
        : "border-border/70 bg-muted/30 text-muted-foreground";
  return <span className={`rounded-full border px-2 py-0.5 text-[11px] ${toneClass}`}>{children}</span>;
}

export function OpenclawSkillsSection() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<SkillStatusReport | null>(null);
  const [filter, setFilter] = useState("");
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, SkillMessage>>({});

  const setSkillMessage = useCallback((skillKey: string, message?: SkillMessage) => {
    if (!skillKey.trim()) return;
    setMessages((prev) => {
      const next = { ...prev };
      if (message) {
        next[skillKey] = message;
      } else {
        delete next[skillKey];
      }
      return next;
    });
  }, []);

  const loadSkills = useCallback(async (clearMessages = false) => {
    setLoading(true);
    setError(null);
    if (clearMessages) {
      setMessages({});
    }
    try {
      const next = await readOpenclawSkillsStatus();
      setReport(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载技能失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSkills(true).catch(() => {
      // 已在函数内处理错误
    });
  }, [loadSkills]);

  const filtered = useMemo(() => {
    const skills = report?.skills ?? [];
    const keyword = filter.trim().toLowerCase();
    if (!keyword) return skills;
    return skills.filter((skill) =>
      [skill.name, skill.description, skill.source].join(" ").toLowerCase().includes(keyword)
    );
  }, [filter, report?.skills]);

  const groups = useMemo(() => groupSkills(filtered), [filtered]);

  const onToggle = useCallback(
    async (skill: SkillStatusEntry) => {
      setBusyKey(skill.skillKey);
      setError(null);
      try {
        const nextEnabled = skill.disabled;
        await updateOpenclawSkill({ skillKey: skill.skillKey, enabled: nextEnabled });
        await loadSkills();
        setSkillMessage(skill.skillKey, {
          kind: "success",
          message: nextEnabled ? "技能已启用" : "技能已禁用",
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "更新技能失败";
        setError(message);
        setSkillMessage(skill.skillKey, { kind: "error", message });
      } finally {
        setBusyKey(null);
      }
    },
    [loadSkills, setSkillMessage]
  );

  const onSaveKey = useCallback(
    async (skill: SkillStatusEntry) => {
      setBusyKey(skill.skillKey);
      setError(null);
      try {
        await updateOpenclawSkill({
          skillKey: skill.skillKey,
          apiKey: edits[skill.skillKey] ?? "",
        });
        await loadSkills();
        setSkillMessage(skill.skillKey, { kind: "success", message: "密钥已保存" });
      } catch (err) {
        const message = err instanceof Error ? err.message : "保存密钥失败";
        setError(message);
        setSkillMessage(skill.skillKey, { kind: "error", message });
      } finally {
        setBusyKey(null);
      }
    },
    [edits, loadSkills, setSkillMessage]
  );

  const onInstall = useCallback(
    async (skill: SkillStatusEntry, installId: string) => {
      setBusyKey(skill.skillKey);
      setError(null);
      try {
        const result = await installOpenclawSkill({ name: skill.name, installId, timeoutMs: 120000 });
        await loadSkills();
        setSkillMessage(skill.skillKey, {
          kind: "success",
          message: typeof result.message === "string" && result.message ? result.message : "安装完成",
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "安装技能失败";
        setError(message);
        setSkillMessage(skill.skillKey, { kind: "error", message });
      } finally {
        setBusyKey(null);
      }
    },
    [loadSkills, setSkillMessage]
  );

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">技能</h3>
          <p className="text-sm text-muted-foreground">统一管理内置、托管与工作区技能。</p>
        </div>
        <Button variant="outline" size="sm" disabled={loading} onClick={() => loadSkills()}>
          {loading ? "加载中..." : "刷新"}
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">筛选</span>
          <Input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="搜索技能"
            className="h-8 w-[300px]"
          />
        </label>
        <p className="pb-1 text-xs text-muted-foreground">{filtered.length} 项</p>
      </div>

      {error && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">未找到匹配技能。</p>
      ) : (
        <div className="space-y-3">
          {groups.map((group) => {
            const collapsedByDefault = group.id === "workspace" || group.id === "built-in";
            return (
              <details key={group.id} className="rounded-lg border border-border/70 bg-muted/20" open={!collapsedByDefault}>
                <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-sm font-medium">
                  <span>{group.label}</span>
                  <span className="text-xs text-muted-foreground">{group.skills.length}</span>
                </summary>
                <div className="space-y-2 px-3 pb-3">
                  {group.skills.map((skill) => {
                    const missing = computeMissing(skill);
                    const reasons = computeReasons(skill);
                    const busy = busyKey === skill.skillKey;
                    const apiKey = edits[skill.skillKey] ?? "";
                    const canInstall = skill.install.length > 0 && skill.missing.bins.length > 0;
                    const installOption = canInstall ? skill.install[0] : null;
                    const message = messages[skill.skillKey];
                    const showBundled = Boolean(skill.bundled && skill.source !== "openclaw-bundled");
                    return (
                      <div key={skill.skillKey} className="rounded-md border border-border/70 bg-card p-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="space-y-1">
                            <p className="text-sm font-medium">{skill.emoji ? `${skill.emoji} ` : ""}{skill.name}</p>
                            <p className="max-w-3xl text-xs text-muted-foreground">{trimText(skill.description, 140)}</p>
                            <div className="flex flex-wrap items-center gap-1.5 pt-1">
                              <StatusChip>{skill.source || "unknown"}</StatusChip>
                              {showBundled && <StatusChip>bundled</StatusChip>}
                              <StatusChip tone={skill.eligible ? "ok" : "warn"}>{skill.eligible ? "可用" : "阻断"}</StatusChip>
                              {skill.disabled && <StatusChip tone="warn">禁用</StatusChip>}
                            </div>
                            {missing.length > 0 && <p className="text-xs text-muted-foreground">缺失：{missing.join("，")}</p>}
                            {reasons.length > 0 && <p className="text-xs text-muted-foreground">原因：{reasons.join("，")}</p>}
                          </div>

                          <div className="space-y-2">
                            <div className="flex flex-wrap justify-end gap-2">
                              <Button variant="outline" size="sm" disabled={busy} onClick={() => onToggle(skill)}>
                                {skill.disabled ? "启用" : "禁用"}
                              </Button>
                              {installOption && (
                                <Button variant="outline" size="sm" disabled={busy} onClick={() => onInstall(skill, installOption.id)}>
                                  {busy ? "安装中..." : installOption.label || "安装"}
                                </Button>
                              )}
                            </div>
                            {message && (
                              <p className={`text-xs ${message.kind === "error" ? "text-destructive" : "text-emerald-600"}`}>
                                {message.message}
                              </p>
                            )}
                            {skill.primaryEnv && (
                              <div className="space-y-2">
                                <Input
                                  type="password"
                                  value={apiKey}
                                  onChange={(event) => setEdits((prev) => ({ ...prev, [skill.skillKey]: event.target.value }))}
                                  placeholder={`输入 ${skill.primaryEnv}`}
                                  className="h-8 w-64"
                                />
                                <Button size="sm" disabled={busy} onClick={() => onSaveKey(skill)}>
                                  保存密钥
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </details>
            );
          })}
        </div>
      )}
    </section>
  );
}
