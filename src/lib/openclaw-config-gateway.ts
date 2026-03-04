import { getGateway } from "@/lib/gateway";

const localHosts = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]"]);

type OpenclawCliLikePayload = {
  section: string;
  command: string[];
  ok: boolean;
  statusCode: number;
  data: unknown;
  stderr: string;
};

type GatewayQueryCandidate = {
  method: string;
  params: Record<string, unknown>;
  mapData?: (payload: unknown) => unknown;
};

type GatewayQueryStrategy = {
  candidates: GatewayQueryCandidate[];
};

type GatewayClientLike = {
  isConnected: () => boolean;
  sendRequest: (
    method: string,
    params: Record<string, unknown>
  ) => Promise<{ ok: boolean; payload?: unknown; error?: { message?: string } }>;
};

const successCandidateIndex = new Map<string, number>();

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function toErrorText(error: unknown): string {
  return error instanceof Error ? error.message : "命令执行失败";
}

function toPayloadError(section: string, message: string, command: string[] = []): OpenclawCliLikePayload {
  return {
    section,
    command,
    ok: false,
    statusCode: -1,
    data: null,
    stderr: message,
  };
}

function pickConfigSection(payload: unknown, section: string): unknown {
  const direct = toRecord(payload);
  if (section in direct) return direct[section];
  const nestedConfig = toRecord(direct.config);
  if (section in nestedConfig) return nestedConfig[section];
  const nestedValue = toRecord(direct.value);
  if (section in nestedValue) return nestedValue[section];
  return payload ?? null;
}

function shouldRetryWithNextCandidate(errorText: string): boolean {
  const text = (errorText || "").toLowerCase();
  if (!text) return false;
  if (text.includes("unknown method")) return true;
  if (text.includes("invalid") && text.includes("params")) return true;
  if (text.includes("unexpected property")) return true;
  if (text.includes("required property")) return true;
  return false;
}

function getGatewayQueryStrategy(section: string): GatewayQueryStrategy | null {
  switch (section) {
    case "overview":
      return {
        candidates: [{ method: "status", params: {} }, { method: "overview", params: {} }],
      };
    case "channels":
      return {
        candidates: [
          {
            method: "config.get",
            params: {},
            mapData: (payload) => pickConfigSection(payload, "channels"),
          },
          {
            method: "config.get",
            params: { section: "channels" },
            mapData: (payload) => pickConfigSection(payload, "channels"),
          },
          {
            method: "config.get",
            params: { key: "channels" },
            mapData: (payload) => pickConfigSection(payload, "channels"),
          },
          {
            method: "config.get",
            params: { target: "channels" },
            mapData: (payload) => pickConfigSection(payload, "channels"),
          },
          { method: "channels.list", params: {} },
          { method: "channels.status", params: {} },
        ],
      };
    case "instances":
      return {
        candidates: [
          { method: "channels.status", params: {} },
          { method: "channels.list", params: {} },
          { method: "status", params: {} },
        ],
      };
    case "sessions":
      return {
        candidates: [{ method: "sessions.list", params: {} }, { method: "sessions", params: {} }],
      };
    case "usage":
      return {
        candidates: [
          { method: "usage.get", params: {} },
          { method: "usage.cost", params: {} },
          { method: "usage.list", params: {} },
          { method: "gateway.usage", params: {} },
          { method: "gateway.usage-cost", params: {} },
          { method: "status", params: {} },
        ],
      };
    case "cronJobs":
      return {
        candidates: [{ method: "cron.list", params: {} }, { method: "cron.jobs", params: {} }],
      };
    case "agents":
      return {
        candidates: [{ method: "agents.list", params: {} }, { method: "agent.list", params: {} }],
      };
    case "skills":
      return {
        candidates: [{ method: "skills.status", params: {} }, { method: "skills.list", params: {} }],
      };
    case "nodes":
      return {
        candidates: [
          { method: "node.list", params: {} },
          { method: "nodes.list", params: {} },
          { method: "node.status", params: {} },
        ],
      };
    default:
      return null;
  }
}

export function clearGatewayQueryStrategyCacheForTest(): void {
  successCandidateIndex.clear();
}

export async function querySectionByGatewayWithClient(
  section: string,
  gateway: GatewayClientLike
): Promise<OpenclawCliLikePayload | null> {
  const strategy = getGatewayQueryStrategy(section);
  if (!strategy) return null;

  if (!gateway.isConnected()) return null;

  const cachedIndex = successCandidateIndex.get(section);
  const candidates =
    cachedIndex !== undefined && cachedIndex >= 0 && cachedIndex < strategy.candidates.length
      ? [strategy.candidates[cachedIndex], ...strategy.candidates.filter((_, index) => index !== cachedIndex)]
      : strategy.candidates;

  let lastFailure: OpenclawCliLikePayload | null = null;

  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    if (!candidate) continue;
    try {
      const result = await gateway.sendRequest(candidate.method, candidate.params);
      const data = candidate.mapData ? candidate.mapData(result.payload) : result.payload ?? null;
      if (result.ok) {
        const originalIndex = strategy.candidates.indexOf(candidate);
        if (originalIndex >= 0) {
          successCandidateIndex.set(section, originalIndex);
        }
        return {
          section,
          command: [candidate.method],
          ok: true,
          statusCode: 0,
          data,
          stderr: "",
        };
      }

      const message = result.error?.message || "网关请求失败";
      lastFailure = toPayloadError(section, message, [candidate.method]);
      if (!shouldRetryWithNextCandidate(message)) {
        return lastFailure;
      }
    } catch (error) {
      const message = toErrorText(error);
      lastFailure = toPayloadError(section, message, [candidate.method]);
      if (!shouldRetryWithNextCandidate(message)) {
        return lastFailure;
      }
    }
  }

  return lastFailure ?? toPayloadError(section, "网关请求失败");
}

export async function querySectionByGateway(section: string): Promise<OpenclawCliLikePayload | null> {
  const gateway = getGateway() as unknown as GatewayClientLike;
  return querySectionByGatewayWithClient(section, gateway);
}

export function isRemoteGatewayUrl(url: string | null | undefined): boolean {
  const raw = (url || "").trim();
  if (!raw) return false;
  try {
    const parsed = new URL(raw);
    return !localHosts.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}
