import { describe, expect, it } from "bun:test";
import {
  installOpenclawSkill,
  normalizeOpenclawSkillReport,
  sendOpenclawSkillGatewayRequest,
  updateOpenclawSkill,
} from "./openclaw-skills.ts";

describe("技能报告解析", () => {
  it("应正确解析完整技能报告", () => {
    const report = normalizeOpenclawSkillReport({
      workspaceDir: "/tmp/ws",
      managedSkillsDir: "/tmp/managed",
      skills: [
        {
          name: "demo-skill",
          description: "demo description",
          source: "openclaw-managed",
          filePath: "/tmp/ws/skills/demo/skill.md",
          baseDir: "/tmp/ws/skills/demo",
          skillKey: "demo-skill",
          bundled: false,
          primaryEnv: "DEMO_API_KEY",
          always: false,
          disabled: false,
          blockedByAllowlist: false,
          eligible: true,
          requirements: {
            bins: ["democtl"],
            env: ["DEMO_API_KEY"],
            config: [],
            os: [],
          },
          missing: {
            bins: [],
            env: [],
            config: [],
            os: [],
          },
          configChecks: [{ path: "skills.entries.demo-skill.apiKey", satisfied: true }],
          install: [{ id: "demo-install", kind: "node", label: "安装 demo", bins: ["democtl"] }],
        },
      ],
    });

    expect(report.workspaceDir).toBe("/tmp/ws");
    expect(report.skills.length).toBe(1);
    expect(report.skills[0]?.name).toBe("demo-skill");
    expect(report.skills[0]?.install[0]?.kind).toBe("node");
  });
});

describe("技能网关请求异常", () => {
  it("应在未连接时直接失败", async () => {
    await expect(
      sendOpenclawSkillGatewayRequest(
        {
          isConnected: () => false,
          sendRequest: async () => ({ ok: true, payload: {} }),
        },
        "skills.status",
        {}
      )
    ).rejects.toThrow("网关未连接");
  });

  it("应透传网关失败信息", async () => {
    await expect(
      sendOpenclawSkillGatewayRequest(
        {
          isConnected: () => true,
          sendRequest: async () => ({ ok: false, error: { message: "服务拒绝" } }),
        },
        "skills.update",
        { skillKey: "demo-skill" }
      )
    ).rejects.toThrow("服务拒绝");
  });

  it("应透传超时异常", async () => {
    await expect(
      sendOpenclawSkillGatewayRequest(
        {
          isConnected: () => true,
          sendRequest: async () => {
            throw new Error("请求超时");
          },
        },
        "skills.install",
        { name: "demo", installId: "node-demo" }
      )
    ).rejects.toThrow("请求超时");
  });
});

describe("技能参数校验", () => {
  it("应拒绝非法 skillKey", async () => {
    await expect(updateOpenclawSkill({ skillKey: "bad key!" })).rejects.toThrow(
      "skillKey包含非法字符"
    );
  });

  it("应拒绝空安装参数", async () => {
    await expect(installOpenclawSkill({ name: " ", installId: "node-demo" })).rejects.toThrow(
      "name不能为空"
    );
    await expect(installOpenclawSkill({ name: "demo", installId: "" })).rejects.toThrow(
      "installId不能为空"
    );
  });
});
