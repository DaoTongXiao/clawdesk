import { invoke } from "@tauri-apps/api/core";
import { isDesktopRuntime } from "@/lib/desktop";
import { querySectionByGateway } from "@/lib/openclaw-config-gateway";
export { isRemoteGatewayUrl } from "@/lib/openclaw-config-gateway";

export interface OpenclawConfigSection {
  key: string;
  valueType: string;
  itemCount: number;
}

export interface OpenclawConfigPayload {
  found: boolean;
  path: string;
  raw: string;
  config: Record<string, unknown>;
  sections: OpenclawConfigSection[];
}

export interface OpenclawOverviewPayload {
  found: boolean;
  path: string;
  sectionCount: number;
  hasGateway: boolean;
  hasGatewayToken: boolean;
  gatewayPort: number | null;
  sectionKeys: string[];
}

export interface OpenclawSectionPayload {
  found: boolean;
  section: string;
  value: unknown;
  itemCount: number;
}

export interface OpenclawLogsPayload {
  files: string[];
  lines: string[];
}

export interface OpenclawValidatePayload {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface OpenclawCliPayload {
  section: string;
  command: string[];
  ok: boolean;
  statusCode: number;
  data: unknown;
  stderr: string;
}

const defaultPayload: OpenclawConfigPayload = {
  found: false,
  path: "",
  raw: "{}",
  config: {},
  sections: [],
};

function toErrorText(error: unknown): string {
  return error instanceof Error ? error.message : "命令执行失败";
}

function toPayloadError(section: string, message: string, command: string[] = []): OpenclawCliPayload {
  return {
    section,
    command,
    ok: false,
    statusCode: -1,
    data: null,
    stderr: message,
  };
}


export async function readOpenclawConfig(): Promise<OpenclawConfigPayload> {
  if (!isDesktopRuntime()) {
    return defaultPayload;
  }

  const result = await invoke<OpenclawConfigPayload>("openclaw_config_read");
  return {
    ...result,
    raw: result.raw || "{}",
    config: result.config ?? {},
    sections: result.sections ?? [],
  };
}

export async function saveOpenclawConfig(raw: string): Promise<OpenclawConfigPayload> {
  if (!isDesktopRuntime()) {
    throw new Error("desktop runtime required");
  }
  return invoke<OpenclawConfigPayload>("openclaw_config_save", { raw });
}

export async function readOpenclawOverview(): Promise<OpenclawOverviewPayload> {
  if (!isDesktopRuntime()) {
    return {
      found: false,
      path: "",
      sectionCount: 0,
      hasGateway: false,
      hasGatewayToken: false,
      gatewayPort: null,
      sectionKeys: [],
    };
  }
  return invoke<OpenclawOverviewPayload>("openclaw_overview_read");
}

export async function readOpenclawSection(section: string): Promise<OpenclawSectionPayload> {
  if (!isDesktopRuntime()) {
    return { found: false, section, value: null, itemCount: 0 };
  }
  return invoke<OpenclawSectionPayload>("openclaw_section_read", { section });
}

export async function readOpenclawLogs(limit = 200, keyword = ""): Promise<OpenclawLogsPayload> {
  if (!isDesktopRuntime()) {
    return { files: [], lines: [] };
  }
  return invoke<OpenclawLogsPayload>("openclaw_logs_read", {
    limit,
    keyword: keyword.trim() ? keyword : undefined,
  });
}

export async function validateOpenclawConfig(raw: string): Promise<OpenclawValidatePayload> {
  if (!isDesktopRuntime()) {
    return { valid: true, errors: [], warnings: [] };
  }
  return invoke<OpenclawValidatePayload>("openclaw_config_validate", { raw });
}

export async function queryOpenclawSection(
  section: string,
  options?: { fallbackToLocal?: boolean }
): Promise<OpenclawCliPayload> {
  if (!isDesktopRuntime()) {
    return toPayloadError(section, "desktop runtime required");
  }

  const fallbackToLocal = options?.fallbackToLocal !== false;
  const gatewayPayload = await querySectionByGateway(section);
  if (gatewayPayload && (gatewayPayload.ok || !fallbackToLocal)) {
    return gatewayPayload;
  }

  if (!fallbackToLocal) {
    return gatewayPayload ?? toPayloadError(section, "网关未连接");
  }

  try {
    return await invoke<OpenclawCliPayload>("openclaw_cli_query", { section });
  } catch (error) {
    return gatewayPayload ?? toPayloadError(section, toErrorText(error));
  }
}

export async function runOpenclawAction(
  section: string,
  action: string,
  target?: string,
  dryRun?: boolean
): Promise<OpenclawCliPayload> {
  if (!isDesktopRuntime()) {
    return toPayloadError(section, "desktop runtime required");
  }
  try {
    return await invoke<OpenclawCliPayload>("openclaw_cli_action", {
      section,
      action,
      target,
      dry_run: dryRun,
    });
  } catch (error) {
    return toPayloadError(section, toErrorText(error));
  }
}

export async function getOpenclawCliVersion(): Promise<string | null> {
  if (!isDesktopRuntime()) return null;

  try {
    const payload = await invoke<OpenclawCliPayload>("openclaw_cli_version");
    if (!payload.ok) return null;

    // Parse version from output, format might be "openclaw 0.1.0" or "0.1.0"
    const output = payload.stderr || String(payload.data || "");
    const match = output.match(/(\d+\.\d+\.\d+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}
