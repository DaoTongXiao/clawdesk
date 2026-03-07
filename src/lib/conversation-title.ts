const MAX_TITLE_LENGTH = 18;
const DEFAULT_CONVERSATION_TITLE = "New Chat";

const GENERIC_TITLE_RULES: Array<{ pattern: RegExp; title: string }> = [
  { pattern: /(^|\s)(在吗|还在吗|你还在吗|有人吗)(\s|$)/i, title: "在线状态确认" },
  { pattern: /(^|\s)(你好|嗨|哈喽|hello|hi)(\s|$)/i, title: "打招呼" },
  { pattern: /(^|\s)(测试|test|ping)(\s|$)/i, title: "连接测试" },
];

const LEADING_PREFIXES = [
  "请帮我",
  "帮我",
  "帮忙",
  "麻烦你",
  "麻烦",
  "请",
  "可以帮我",
  "能帮我",
  "想请你",
  "我想请你",
  "我想让你",
  "给我",
  "替我",
];

const STOP_MARKERS = [
  "要求",
  "格式",
  "注意",
  "输出",
  "返回",
  "限制",
  "示例",
  "步骤",
  "补充",
  "背景",
  "上下文",
  "请按",
  "按照",
];

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function sanitizeSource(value: string): string {
  return normalizeWhitespace(
    value
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/`[^`]*`/g, " ")
      .replace(/https?:\/\/\S+/g, " ")
      .replace(/^[>#*-]+\s*/gm, " ")
      .replace(/[“”"']/g, "")
  );
}

function trimLeadingPrefix(value: string): string {
  let next = value.trim();
  let changed = true;
  while (changed) {
    changed = false;
    for (const prefix of LEADING_PREFIXES) {
      if (next.startsWith(prefix) && next.length > prefix.length + 1) {
        next = next.slice(prefix.length).trim();
        changed = true;
        break;
      }
    }
  }
  return next;
}

function trimAtMarker(value: string): string {
  let end = value.length;
  for (const marker of STOP_MARKERS) {
    const index = value.indexOf(marker);
    if (index >= 5 && index < end) {
      end = index;
    }
  }
  return normalizeWhitespace(value.slice(0, end));
}

function takePrimaryClause(value: string): string {
  const firstSentence = value.split(/[\n。！？!?；;]/)[0] ?? value;
  const trimmed = trimAtMarker(firstSentence);
  if (trimmed.length <= MAX_TITLE_LENGTH * 2) return trimmed;

  const commaIndex = trimmed.search(/[，,:：]/);
  if (commaIndex >= 5) {
    return normalizeWhitespace(trimmed.slice(0, commaIndex));
  }
  return trimmed;
}

function trimTrailingPunctuation(value: string): string {
  return value.replace(/[，,:：、\-.]+$/g, "").trim();
}

function truncateTitle(value: string): string {
  const trimmed = trimTrailingPunctuation(value);
  if (trimmed.length <= MAX_TITLE_LENGTH) return trimmed;
  return `${trimmed.slice(0, MAX_TITLE_LENGTH).trim()}…`;
}

function matchGenericTitle(value: string): string | null {
  const compact = normalizeWhitespace(value).toLowerCase();
  for (const rule of GENERIC_TITLE_RULES) {
    if (rule.pattern.test(compact)) {
      return rule.title;
    }
  }
  return null;
}

function buildTitleFromUserContent(userContent: string): string {
  const sanitized = sanitizeSource(userContent);
  const genericTitle = matchGenericTitle(sanitized);
  if (genericTitle) return genericTitle;

  const primaryClause = takePrimaryClause(trimLeadingPrefix(sanitized));
  const fallback = takePrimaryClause(sanitized);
  return truncateTitle(primaryClause || fallback || DEFAULT_CONVERSATION_TITLE);
}

export function buildConversationTitle(userContent: string, assistantContent?: string): string {
  const userTitle = buildTitleFromUserContent(userContent);
  if (userTitle !== DEFAULT_CONVERSATION_TITLE) return userTitle;

  const assistantTitle = assistantContent ? takePrimaryClause(sanitizeSource(assistantContent)) : "";
  return truncateTitle(assistantTitle || DEFAULT_CONVERSATION_TITLE);
}

export function canRefreshAutoConversationTitle(currentTitle: string, userContent: string): boolean {
  return currentTitle === DEFAULT_CONVERSATION_TITLE || currentTitle === buildConversationTitle(userContent);
}

export { DEFAULT_CONVERSATION_TITLE };
