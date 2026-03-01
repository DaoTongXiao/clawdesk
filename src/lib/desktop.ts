import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";

export interface GatewayDetectionResult {
  found: boolean;
  url: string | null;
  token: string | null;
}

type DesktopWindow = Window & {
  __TAURI__?: unknown;
  __TAURI_INTERNALS__?: unknown;
};

function notFound(): GatewayDetectionResult {
  return { found: false, url: null, token: null };
}

export function isDesktopRuntime(): boolean {
  if (typeof window === "undefined") return false;
  const desktopWindow = window as DesktopWindow;
  return Boolean(desktopWindow.__TAURI__ || desktopWindow.__TAURI_INTERNALS__);
}

export async function detectGatewayFromDesktop(): Promise<GatewayDetectionResult> {
  if (!isDesktopRuntime()) return notFound();

  try {
    const result = await invoke<GatewayDetectionResult>("detect_gateway");
    if (!result?.found || !result.url || !result.token) return notFound();
    return { found: true, url: result.url, token: result.token };
  } catch {
    return notFound();
  }
}

export async function getDesktopAppVersion(): Promise<string | null> {
  if (!isDesktopRuntime()) return null;

  try {
    return await getVersion();
  } catch {
    return null;
  }
}
