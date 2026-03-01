"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useStore } from "@/lib/store";
import { testConnection } from "@/lib/gateway";
import { Loader2, CheckCircle2, XCircle, Settings } from "lucide-react";

type TestState = "idle" | "testing" | "success" | "error";

export function GatewaySettingsPanel() {
  const { state, actions } = useStore();
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [testState, setTestState] = useState<TestState>("idle");
  const [testError, setTestError] = useState("");
  const autoConnectOnceRef = useRef(false);

  const gatewayUrl = url || state.settings?.gatewayUrl || state.detectedGatewayUrl || "";
  const gatewayToken = token || state.settings?.token || state.detectedToken || "";
  const hasDetectedGateway = Boolean(state.detectedGatewayUrl && state.detectedToken);

  useEffect(() => {
    if (autoConnectOnceRef.current) return;
    if (!state.settingsLoaded) return;
    if (state.settings?.gatewayUrl) return;
    if (!state.detectedGatewayUrl || !state.detectedToken) return;

    autoConnectOnceRef.current = true;
    actions
      .saveAndConnect(state.detectedGatewayUrl, state.detectedToken)
      .catch(() => {
        autoConnectOnceRef.current = false;
      });
  }, [
    actions,
    state.settingsLoaded,
    state.settings?.gatewayUrl,
    state.detectedGatewayUrl,
    state.detectedToken,
  ]);

  const handleTest = async () => {
    if (!gatewayUrl || !gatewayToken) return;
    setTestState("testing");
    setTestError("");
    const result = await testConnection(gatewayUrl, gatewayToken);
    if (result.ok) {
      setTestState("success");
    } else {
      setTestState("error");
      setTestError(result.error ?? "Unknown error");
    }
  };

  const handleSave = async () => {
    if (!gatewayUrl || !gatewayToken) return;
    await actions.saveAndConnect(gatewayUrl, gatewayToken);
  };

  return (
    <section className="mx-auto w-full max-w-3xl space-y-4">
      <div className="rounded-xl border border-border/70 bg-card p-5">
        <div className="mb-4 flex items-center gap-2">
          <Settings className="size-4 text-muted-foreground" />
          <h3 className="text-base font-semibold">网关设置</h3>
        </div>
        <p className="mb-4 text-xs text-muted-foreground">
          当前地址：{state.settings?.gatewayUrl || state.detectedGatewayUrl || "未配置"}
        </p>
        {hasDetectedGateway && !state.settings?.gatewayUrl && (
          <div className="mb-4 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-600">
            已检测到本地网关，正在自动连接。
          </div>
        )}
        <div className="space-y-2">
          <label className="text-sm font-medium">网关地址</label>
          <Input
            placeholder="ws://localhost:18789"
            value={gatewayUrl}
            onChange={(e) => {
              setUrl(e.target.value);
              setTestState("idle");
            }}
          />
        </div>
        <div className="mt-4 space-y-2">
          <label className="text-sm font-medium">令牌</label>
          <Input
            type="password"
            placeholder="请输入令牌"
            value={gatewayToken}
            onChange={(e) => {
              setToken(e.target.value);
              setTestState("idle");
            }}
          />
        </div>
        {testState === "error" && (
          <div className="mt-4 flex items-center gap-2 text-sm text-red-400">
            <XCircle className="size-4" />
            {testError}
          </div>
        )}
        {testState === "success" && (
          <div className="mt-4 flex items-center gap-2 text-sm text-emerald-500">
            <CheckCircle2 className="size-4" />
            连接成功
          </div>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={handleTest}
            disabled={!gatewayUrl || !gatewayToken || testState === "testing"}
          >
            {testState === "testing" && (
              <Loader2 className="mr-2 size-4 animate-spin" />
            )}
            测试连接
          </Button>
          <Button onClick={handleSave} disabled={!gatewayUrl || !gatewayToken}>
            保存并连接
          </Button>
        </div>
      </div>
    </section>
  );
}

export function SettingsDialog() {
  return <GatewaySettingsPanel />;
}
