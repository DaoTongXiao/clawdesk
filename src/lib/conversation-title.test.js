import { describe, expect, it } from "bun:test";
import {
  buildConversationTitle,
  canRefreshAutoConversationTitle,
  DEFAULT_CONVERSATION_TITLE,
} from "./conversation-title.ts";

describe("会话标题生成", () => {
  it("应从首条需求中提炼简短标题", () => {
    expect(
      buildConversationTitle("帮我总结今天的工作并写日报，要求按项目分类并突出风险")
    ).toBe("总结今天的工作并写日报");
  });

  it("应把寒暄类消息转换为摘要标题", () => {
    expect(buildConversationTitle("你还在吗", "在的，皇上。太子随时听候吩咐呀。")).toBe(
      "在线状态确认"
    );
  });

  it("应识别可被自动刷新的一次性标题", () => {
    expect(canRefreshAutoConversationTitle(DEFAULT_CONVERSATION_TITLE, "查看知乎我的消息")).toBe(
      true
    );
    expect(canRefreshAutoConversationTitle("查看知乎我的消息", "查看知乎我的消息")).toBe(
      true
    );
    expect(canRefreshAutoConversationTitle("手动改过的标题", "查看知乎我的消息")).toBe(false);
  });
});
