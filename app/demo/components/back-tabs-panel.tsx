"use client";

import { useState } from "react";

export type BackTab = {
  key: string;
  label: string;
  icon: React.ReactNode;
  render: (p: { fontSize: number }) => React.ReactNode;
};

type Variant = "business" | "coding";

type Theme = {
  containerBg: string;
  barBg: string;
  barBorder: string;
  activeBg: string;
  activeText: string;
  inactiveText: string;
  hoverBg: string;
  hoverText: string;
};

const THEMES: Record<Variant, Theme> = {
  business: {
    containerBg: "bg-white",
    barBg: "bg-gray-50",
    barBorder: "border-gray-200",
    activeBg: "bg-white",
    activeText: "text-emerald-700",
    inactiveText: "text-gray-500",
    hoverBg: "hover:bg-white",
    hoverText: "hover:text-gray-800",
  },
  coding: {
    containerBg: "bg-[#0b0b0f]",
    barBg: "bg-[#15151c]",
    barBorder: "border-white/10",
    activeBg: "bg-white/10",
    activeText: "text-emerald-300",
    inactiveText: "text-white/60",
    hoverBg: "hover:bg-white/5",
    hoverText: "hover:text-white/90",
  },
};

export default function BackTabsPanel({
  tabs,
  variant = "business",
  fontSize = 13,
  initialTab,
}: {
  tabs: BackTab[];
  variant?: Variant;
  fontSize?: number;
  initialTab?: string;
}) {
  const [activeKey, setActiveKey] = useState<string>(
    initialTab ?? tabs[0]?.key ?? "",
  );
  const theme = THEMES[variant];
  const active = tabs.find((t) => t.key === activeKey) ?? tabs[0];

  return (
    <div className={`flex h-full w-full flex-col ${theme.containerBg}`}>
      <div
        className={`flex items-center gap-1 border-b ${theme.barBorder} ${theme.barBg} px-2 py-1`}
        style={{ fontSize: `${Math.max(11, Math.round(fontSize * 0.85))}px` }}
      >
        {tabs.map((t) => (
          <TabButton
            key={t.key}
            active={activeKey === t.key}
            onClick={() => setActiveKey(t.key)}
            icon={t.icon}
            label={t.label}
            theme={theme}
          />
        ))}
      </div>
      <div className="flex-1 overflow-hidden">
        {active ? active.render({ fontSize }) : null}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  theme,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  theme: Theme;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded px-3 py-1 font-medium transition-colors ${
        active
          ? `${theme.activeBg} ${theme.activeText} shadow-sm`
          : `${theme.inactiveText} ${theme.hoverBg} ${theme.hoverText}`
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
