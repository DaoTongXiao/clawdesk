import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { homedir } from "os";
import { join } from "path";

function resolveGatewayHost(gateway: unknown, request: Request): string {
  if (gateway && typeof gateway === "object" && "host" in gateway) {
    const host = (gateway as { host?: unknown }).host;
    if (typeof host === "string" && host.trim()) {
      return host.trim();
    }
  }

  try {
    return new URL(request.url).hostname || "localhost";
  } catch {
    return "localhost";
  }
}

export async function GET(request: Request) {
  try {
    const configPath = join(homedir(), ".openclaw", "openclaw.json");
    const raw = await readFile(configPath, "utf-8");
    const config = JSON.parse(raw);

    const gateway = config?.gateway;
    if (!gateway?.auth?.token) {
      return NextResponse.json({ found: false });
    }

    const port = gateway.port ?? 18789;
    const host = resolveGatewayHost(gateway, request);
    const url = `ws://${host}:${port}`;
    const token = gateway.auth.token;

    return NextResponse.json({ found: true, url, token });
  } catch {
    return NextResponse.json({ found: false });
  }
}
