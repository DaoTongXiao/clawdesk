"use client";

import type { ComponentType } from "react";
import {
  Activity,
  Bot,
  Cable,
  CircleGauge,
  FileText,
  FolderOpen,
  Info,
  LayoutDashboard,
  Logs,
  Radio,
  Settings,
  Sparkles,
  Terminal,
  Timer,
} from "lucide-react";
import {
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

export type OpenclawSectionId =
  | "settings"
  | "overview"
  | "channels"
  | "instances"
  | "sessions"
  | "usage"
  | "cronJobs"
  | "agents"
  | "skills"
  | "nodes"
  | "about"
  | "config"
  | "debug"
  | "logs";

interface NavItem {
  id: OpenclawSectionId;
  label: string;
  icon: ComponentType<{ className?: string }>;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const groups: NavGroup[] = [
  {
    title: "设置",
    items: [
      { id: "settings", label: "网关设置", icon: Settings },
      { id: "about", label: "关于", icon: Info },
    ],
  },
  {
    title: "控制",
    items: [
      { id: "overview", label: "总览", icon: LayoutDashboard },
      { id: "channels", label: "通道", icon: Cable },
      { id: "instances", label: "实例", icon: Radio },
      { id: "sessions", label: "会话", icon: FileText },
      { id: "usage", label: "用量", icon: CircleGauge },
      { id: "cronJobs", label: "定时任务", icon: Timer },
    ],
  },
  {
    title: "代理",
    items: [
      { id: "agents", label: "代理列表", icon: Bot },
      { id: "skills", label: "技能", icon: Sparkles },
      { id: "nodes", label: "节点", icon: FolderOpen },
    ],
  },
  {
    title: "高级",
    items: [
      { id: "config", label: "原始配置", icon: Settings },
      { id: "debug", label: "调试", icon: Terminal },
      { id: "logs", label: "日志", icon: Logs },
    ],
  },
];

export function getSectionLabel(section: OpenclawSectionId): string {
  for (const group of groups) {
    for (const item of group.items) {
      if (item.id === section) return item.label;
    }
  }
  return "配置";
}

export function OpenclawNav({
  activeSection,
  onSelect,
}: {
  activeSection: OpenclawSectionId;
  onSelect: (section: OpenclawSectionId) => void;
}) {
  return (
    <SidebarContent>
      <SidebarGroup>
        <SidebarGroupLabel>系统</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                isActive={activeSection === "overview"}
                onClick={() => onSelect("overview")}
              >
                <Activity className="size-4" />
                <span>总览</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      {groups.map((group) => (
        <SidebarGroup key={group.title}>
          <SidebarGroupLabel>{group.title}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {group.items.map((item) => (
                <SidebarMenuItem key={item.id}>
                  <SidebarMenuButton
                    isActive={activeSection === item.id}
                    onClick={() => onSelect(item.id)}
                  >
                    <item.icon className="size-4" />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </SidebarContent>
  );
}
