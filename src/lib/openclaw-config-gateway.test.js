import { describe, expect, it } from "bun:test";
import {
  clearGatewayQueryStrategyCacheForTest,
  isRemoteGatewayUrl,
  querySectionByGatewayWithClient,
} from "./openclaw-config-gateway";

describe("远程网关地址识别", () => {
  it("应正确识别远程与本地地址", () => {
    expect(isRemoteGatewayUrl("wss://gateway.example.com")).toBe(true);
    expect(isRemoteGatewayUrl("ws://localhost:18789")).toBe(false);
    expect(isRemoteGatewayUrl("ws://127.0.0.1:18789")).toBe(false);
  });

  it("应在无效地址时返回非远程", () => {
    expect(isRemoteGatewayUrl("not-a-url")).toBe(false);
    expect(isRemoteGatewayUrl("")).toBe(false);
    expect(isRemoteGatewayUrl(null)).toBe(false);
  });
});

describe("远程分区方法协商", () => {
  it("应在候选方法中自动重试直到成功", async () => {
    clearGatewayQueryStrategyCacheForTest();
    const called = [];
    const gateway = {
      isConnected: () => true,
      sendRequest: async (method, params) => {
        called.push({ method, params });
        if (method === "channels.list") {
          return { ok: true, payload: { chat: {}, auth: [] } };
        }
        return { ok: false, error: { message: `unknown method: ${method}` } };
      },
    };
    const result = await querySectionByGatewayWithClient("channels", gateway);
    expect(result?.ok).toBe(true);
    expect(result?.command[0]).toBe("channels.list");
    expect(called.length).toBe(5);
  });

  it("应复用上次成功的方法减少重试", async () => {
    const called = [];
    const gateway = {
      isConnected: () => true,
      sendRequest: async (method, params) => {
        called.push({ method, params });
        if (method === "channels.list") {
          return { ok: true, payload: { chat: {}, auth: [] } };
        }
        return { ok: false, error: { message: `unknown method: ${method}` } };
      },
    };
    const result = await querySectionByGatewayWithClient("channels", gateway);
    expect(result?.ok).toBe(true);
    expect(called.length).toBe(1);
    expect(called[0]?.method).toBe("channels.list");
  });
});
