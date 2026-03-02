import { isDesktopRuntime } from "@/lib/desktop";
import { runOpenclawAction } from "@/lib/openclaw-config";

export type OpenclawUpdateStage =
  | "idle"
  | "checking"
  | "available"
  | "latest"
  | "updating"
  | "updated"
  | "error";

export interface OpenclawUpdateState {
  stage: OpenclawUpdateStage;
  currentVersion: string;
  latestVersion: string;
  hasUpdate: boolean;
  checkedAt?: number;
  error?: string;
  releaseUrl?: string;
  releaseNotes?: string;
}

interface GitHubRelease {
  tag_name: string;
  name: string;
  html_url: string;
  body: string;
  published_at: string;
}

type UpdateListener = (state: OpenclawUpdateState) => void;

const OPENCLAW_GITHUB_REPO = "openclaw/openclaw";
const UPDATE_CHECK_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours

const listeners = new Set<UpdateListener>();
let state: OpenclawUpdateState = {
  stage: "idle",
  currentVersion: "",
  latestVersion: "",
  hasUpdate: false,
};
let runningTask: Promise<OpenclawUpdateState> | null = null;
let autoChecked = false;

function emit(next: OpenclawUpdateState) {
  state = next;
  for (const listener of listeners) {
    listener(state);
  }
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "更新检查失败，请稍后重试";
}

function parseVersion(versionStr: string): string {
  // Remove 'v' prefix if present (e.g., "v0.1.0" -> "0.1.0")
  const cleaned = versionStr.replace(/^v/, "");
  const match = cleaned.match(/(\d+\.\d+\.\d+)/);
  return match ? match[1] : "";
}

function compareVersions(a: string, b: string): number {
  const partsA = a.split(".").map(Number);
  const partsB = b.split(".").map(Number);

  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const numA = partsA[i] || 0;
    const numB = partsB[i] || 0;
    if (numA > numB) return 1;
    if (numA < numB) return -1;
  }
  return 0;
}

async function getCurrentVersion(): Promise<string> {
  if (!isDesktopRuntime()) return "";

  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const payload = await invoke<{
      ok: boolean;
      data: unknown;
      stderr: string;
    }>("openclaw_cli_version");

    if (!payload.ok) return "";

    // Version output might be in stderr or data
    const output = payload.stderr || String(payload.data || "");
    return parseVersion(output);
  } catch {
    return "";
  }
}

async function fetchLatestRelease(): Promise<GitHubRelease | null> {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${OPENCLAW_GITHUB_REPO}/releases/latest`
    );

    if (!response.ok) {
      if (response.status === 404) {
        console.warn("OpenClaw repository or releases not found");
      } else if (response.status === 403) {
        console.warn("GitHub API rate limit exceeded");
      }
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error("Failed to fetch OpenClaw release:", error);
    return null;
  }
}

async function runCheck(): Promise<OpenclawUpdateState> {
  emit({
    ...state,
    stage: "checking",
    checkedAt: Date.now(),
  });

  try {
    const currentVersion = await getCurrentVersion();

    if (!currentVersion) {
      const next: OpenclawUpdateState = {
        stage: "error",
        currentVersion: "",
        latestVersion: "",
        hasUpdate: false,
        checkedAt: Date.now(),
        error: "无法获取 OpenClaw CLI 版本，请确认已安装",
      };
      emit(next);
      return next;
    }

    const release = await fetchLatestRelease();

    if (!release) {
      const next: OpenclawUpdateState = {
        stage: "error",
        currentVersion,
        latestVersion: "",
        hasUpdate: false,
        checkedAt: Date.now(),
        error: "无法获取最新版本信息",
      };
      emit(next);
      return next;
    }

    const latestVersion = parseVersion(release.tag_name);

    if (!latestVersion) {
      const next: OpenclawUpdateState = {
        stage: "error",
        currentVersion,
        latestVersion: "",
        hasUpdate: false,
        checkedAt: Date.now(),
        error: "无法解析最新版本号",
      };
      emit(next);
      return next;
    }

    const hasUpdate = compareVersions(currentVersion, latestVersion) < 0;

    const next: OpenclawUpdateState = {
      stage: hasUpdate ? "available" : "latest",
      currentVersion,
      latestVersion,
      hasUpdate,
      checkedAt: Date.now(),
      releaseUrl: release.html_url,
      releaseNotes: release.body,
    };
    emit(next);
    return next;
  } catch (error) {
    const next: OpenclawUpdateState = {
      stage: "error",
      currentVersion: "",
      latestVersion: "",
      hasUpdate: false,
      checkedAt: Date.now(),
      error: toErrorMessage(error),
    };
    emit(next);
    return next;
  }
}

export function getOpenclawUpdateState(): OpenclawUpdateState {
  return state;
}

export function subscribeOpenclawUpdate(listener: UpdateListener): () => void {
  listeners.add(listener);
  listener(state);
  return () => {
    listeners.delete(listener);
  };
}

export async function checkOpenclawUpdate(): Promise<OpenclawUpdateState> {
  if (runningTask) return runningTask;
  runningTask = runCheck().finally(() => {
    runningTask = null;
  });
  return runningTask;
}

export async function updateOpenclaw(): Promise<void> {
  if (!isDesktopRuntime()) {
    emit({
      ...state,
      stage: "error",
      error: "仅桌面环境支持更新",
    });
    return;
  }

  emit({
    ...state,
    stage: "updating",
  });

  try {
    const result = await runOpenclawAction("selfUpdate", "update");

    if (!result.ok) {
      emit({
        ...state,
        stage: "error",
        error: result.stderr || "更新命令执行失败",
      });
      return;
    }

    // Re-check version after update
    const newVersion = await getCurrentVersion();

    emit({
      ...state,
      stage: "updated",
      currentVersion: newVersion || state.currentVersion,
      hasUpdate: false,
      checkedAt: Date.now(),
    });
  } catch (error) {
    emit({
      ...state,
      stage: "error",
      error: toErrorMessage(error),
    });
  }
}

export async function startAutoOpenclawUpdateCheck(): Promise<OpenclawUpdateState> {
  if (autoChecked) return state;
  autoChecked = true;
  return checkOpenclawUpdate();
}
