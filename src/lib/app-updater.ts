import { check } from "@tauri-apps/plugin-updater";
import { isDesktopRuntime } from "@/lib/desktop";

export type AppUpdateStage =
  | "idle"
  | "unsupported"
  | "checking"
  | "latest"
  | "available"
  | "downloading"
  | "installed"
  | "error";

export interface AppUpdateState {
  stage: AppUpdateStage;
  version?: string;
  checkedAt?: number;
  downloadedBytes?: number;
  totalBytes?: number;
  errorMessage?: string;
}

type UpdateListener = (state: AppUpdateState) => void;

const listeners = new Set<UpdateListener>();
let state: AppUpdateState = { stage: "idle" };
let runningTask: Promise<AppUpdateState> | null = null;
let autoChecked = false;

function emit(next: AppUpdateState) {
  state = next;
  for (const listener of listeners) {
    listener(state);
  }
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "更新失败，请稍后重试";
}

function parseEventName(event: unknown): string {
  if (!event || typeof event !== "object") return "";
  const record = event as Record<string, unknown>;
  if (typeof record.event === "string") return record.event;
  return "";
}

function parseEventData(event: unknown): Record<string, unknown> {
  if (!event || typeof event !== "object") return {};
  const record = event as Record<string, unknown>;
  if (!record.data || typeof record.data !== "object") return {};
  return record.data as Record<string, unknown>;
}

function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return 0;
}

async function runCheckAndInstall(): Promise<AppUpdateState> {
  if (!isDesktopRuntime()) {
    const next: AppUpdateState = { stage: "unsupported", checkedAt: Date.now() };
    emit(next);
    return next;
  }

  emit({ stage: "checking", checkedAt: Date.now() });

  try {
    const update = await check();
    if (!update) {
      const next: AppUpdateState = { stage: "latest", checkedAt: Date.now() };
      emit(next);
      return next;
    }

    const rawVersion = (update as { version?: unknown }).version;
    const version = typeof rawVersion === "string" ? rawVersion : "";
    emit({ stage: "available", version, checkedAt: Date.now() });

    let downloadedBytes = 0;
    let totalBytes = 0;

    await update.downloadAndInstall((event) => {
      const eventName = parseEventName(event);
      const eventData = parseEventData(event);

      if (eventName === "Started") {
        totalBytes = toNumber(eventData.contentLength);
      } else if (eventName === "Progress") {
        downloadedBytes += toNumber(eventData.chunkLength);
      }

      emit({
        stage: "downloading",
        version,
        checkedAt: Date.now(),
        downloadedBytes,
        totalBytes,
      });
    });

    const next: AppUpdateState = {
      stage: "installed",
      version,
      checkedAt: Date.now(),
      downloadedBytes,
      totalBytes,
    };
    emit(next);
    return next;
  } catch (error) {
    const next: AppUpdateState = {
      stage: "error",
      checkedAt: Date.now(),
      errorMessage: toErrorMessage(error),
    };
    emit(next);
    return next;
  }
}

export function getAppUpdateState(): AppUpdateState {
  return state;
}

export function subscribeAppUpdate(listener: UpdateListener): () => void {
  listeners.add(listener);
  listener(state);
  return () => {
    listeners.delete(listener);
  };
}

export async function checkAndInstallAppUpdate(): Promise<AppUpdateState> {
  if (runningTask) return runningTask;
  runningTask = runCheckAndInstall().finally(() => {
    runningTask = null;
  });
  return runningTask;
}

export async function startAutoUpdateCheckOnce(): Promise<AppUpdateState> {
  if (autoChecked) return state;
  autoChecked = true;
  return checkAndInstallAppUpdate();
}
