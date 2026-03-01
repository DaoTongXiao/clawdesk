import { getGateway } from "@/lib/gateway";
import { queryOpenclawSection } from "@/lib/openclaw-config";

export interface SkillsStatusConfigCheck {
  path: string;
  satisfied: boolean;
}

export interface SkillInstallOption {
  id: string;
  kind: "brew" | "node" | "go" | "uv";
  label: string;
  bins: string[];
}

export interface SkillStatusEntry {
  name: string;
  description: string;
  source: string;
  filePath: string;
  baseDir: string;
  skillKey: string;
  bundled?: boolean;
  primaryEnv?: string;
  emoji?: string;
  homepage?: string;
  always: boolean;
  disabled: boolean;
  blockedByAllowlist: boolean;
  eligible: boolean;
  requirements: {
    bins: string[];
    env: string[];
    config: string[];
    os: string[];
  };
  missing: {
    bins: string[];
    env: string[];
    config: string[];
    os: string[];
  };
  configChecks: SkillsStatusConfigCheck[];
  install: SkillInstallOption[];
}

export interface SkillStatusReport {
  workspaceDir: string;
  managedSkillsDir: string;
  skills: SkillStatusEntry[];
}

export interface OpenclawSkillGatewayResponse {
  ok: boolean;
  payload?: unknown;
  error?: { message?: string };
}

export interface OpenclawSkillGatewayLike {
  isConnected: () => boolean;
  sendRequest: (
    method: string,
    params: Record<string, unknown>
  ) => Promise<OpenclawSkillGatewayResponse>;
}

function toText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function toBool(value: unknown): boolean {
  return value === true;
}

function toTextList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function normalizeInstall(value: unknown): SkillInstallOption[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const record = toRecord(item);
      const kind = toText(record.kind);
      if (kind !== "brew" && kind !== "node" && kind !== "go" && kind !== "uv") {
        return null;
      }
      return {
        id: toText(record.id),
        kind,
        label: toText(record.label),
        bins: toTextList(record.bins),
      };
    })
    .filter((item): item is SkillInstallOption => Boolean(item));
}

function normalizeChecks(value: unknown): SkillsStatusConfigCheck[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const record = toRecord(item);
    return {
      path: toText(record.path),
      satisfied: toBool(record.satisfied),
    };
  });
}

function normalizeSkillEntry(value: unknown): SkillStatusEntry {
  const record = toRecord(value);
  const requirements = toRecord(record.requirements);
  const missing = toRecord(record.missing);
  return {
    name: toText(record.name),
    description: toText(record.description),
    source: toText(record.source),
    filePath: toText(record.filePath),
    baseDir: toText(record.baseDir),
    skillKey: toText(record.skillKey),
    bundled: toBool(record.bundled),
    primaryEnv: toText(record.primaryEnv) || undefined,
    emoji: toText(record.emoji) || undefined,
    homepage: toText(record.homepage) || undefined,
    always: toBool(record.always),
    disabled: toBool(record.disabled),
    blockedByAllowlist: toBool(record.blockedByAllowlist),
    eligible: toBool(record.eligible),
    requirements: {
      bins: toTextList(requirements.bins),
      env: toTextList(requirements.env),
      config: toTextList(requirements.config),
      os: toTextList(requirements.os),
    },
    missing: {
      bins: toTextList(missing.bins),
      env: toTextList(missing.env),
      config: toTextList(missing.config),
      os: toTextList(missing.os),
    },
    configChecks: normalizeChecks(record.configChecks),
    install: normalizeInstall(record.install),
  };
}

export function normalizeOpenclawSkillReport(value: unknown): SkillStatusReport {
  const record = toRecord(value);
  const skills = Array.isArray(record.skills) ? record.skills.map((item) => normalizeSkillEntry(item)) : [];
  return {
    workspaceDir: toText(record.workspaceDir),
    managedSkillsDir: toText(record.managedSkillsDir),
    skills,
  };
}

function normalizeRequiredText(value: string, fieldName: string): string {
  const next = value.trim();
  if (!next) {
    throw new Error(`参数不合法：${fieldName}不能为空`);
  }
  if (next.length > 128) {
    throw new Error(`参数不合法：${fieldName}长度超过限制`);
  }
  return next;
}

function normalizeSkillKey(skillKey: string): string {
  const next = normalizeRequiredText(skillKey, "skillKey");
  if (!/^[a-zA-Z0-9._:@-]+$/.test(next)) {
    throw new Error("参数不合法：skillKey包含非法字符");
  }
  return next;
}

export async function sendOpenclawSkillGatewayRequest(
  gateway: OpenclawSkillGatewayLike,
  method: string,
  params: Record<string, unknown>
): Promise<Record<string, unknown>> {
  if (!gateway.isConnected()) {
    throw new Error("网关未连接，请先在聊天模式连接网关");
  }
  const response = await gateway.sendRequest(method, params);
  if (!response.ok) {
    throw new Error(response.error?.message || `网关调用失败：${method}`);
  }
  return toRecord(response.payload);
}

async function sendGatewayRequest(method: string, params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const gateway = getGateway() as unknown as OpenclawSkillGatewayLike;
  return sendOpenclawSkillGatewayRequest(gateway, method, params);
}

export async function readOpenclawSkillsStatus(): Promise<SkillStatusReport> {
  const gateway = getGateway();
  if (gateway.isConnected()) {
    const payload = await sendGatewayRequest("skills.status", {});
    return normalizeOpenclawSkillReport(payload);
  }

  const fallback = await queryOpenclawSection("skills");
  if (!fallback.ok) {
    throw new Error(fallback.stderr || "读取技能状态失败");
  }
  return normalizeOpenclawSkillReport(fallback.data);
}

export async function updateOpenclawSkill(params: {
  skillKey: string;
  enabled?: boolean;
  apiKey?: string;
  env?: Record<string, string>;
}): Promise<Record<string, unknown>> {
  const skillKey = normalizeSkillKey(params.skillKey);
  return sendGatewayRequest("skills.update", {
    ...params,
    skillKey,
  } as unknown as Record<string, unknown>);
}

export async function installOpenclawSkill(params: {
  name: string;
  installId: string;
  timeoutMs?: number;
}): Promise<Record<string, unknown>> {
  const name = normalizeRequiredText(params.name, "name");
  const installId = normalizeRequiredText(params.installId, "installId");
  return sendGatewayRequest("skills.install", {
    ...params,
    name,
    installId,
  } as unknown as Record<string, unknown>);
}
