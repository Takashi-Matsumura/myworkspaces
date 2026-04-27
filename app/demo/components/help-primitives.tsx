"use client";

import { createContext, useContext } from "react";

// business-help / coding-help のレイアウトプリミティブを共通化する。
// Section / Subsection / Faq / Kbd は HelpRoot で包んだ variant を内部で参照する
// (各所で variant を渡さないで済むよう Context 経由)。

export type HelpVariant = "light" | "dark" | "dark-violet" | "dark-indigo";

type HelpTheme = {
  rootBg: string;
  rootText: string;
  sectionBorder: string;
  sectionTitle: string;
  subsectionTitle: string;
  faqBorder: string;
  faqSummary: string;
  faqBodyBorder: string;
  faqBodyText: string;
  kbd: string;
};

const HELP_THEMES: Record<HelpVariant, HelpTheme> = {
  light: {
    rootBg: "bg-white",
    rootText: "text-gray-800",
    sectionBorder: "border-emerald-200",
    sectionTitle: "text-emerald-800",
    subsectionTitle: "text-gray-800",
    faqBorder: "border border-gray-200 bg-gray-50/60",
    faqSummary: "text-gray-800 hover:bg-gray-100",
    faqBodyBorder: "border-t border-gray-200",
    faqBodyText: "text-gray-700",
    kbd: "border border-gray-300 bg-gray-50 text-gray-700",
  },
  dark: {
    rootBg: "bg-[#0b0b0f]",
    rootText: "text-white/85",
    sectionBorder: "border-emerald-500/30",
    sectionTitle: "text-emerald-300",
    subsectionTitle: "text-white/90",
    faqBorder: "border border-white/10 bg-white/5",
    faqSummary: "text-white/90 hover:bg-white/10",
    faqBodyBorder: "border-t border-white/10",
    faqBodyText: "text-white/70",
    kbd: "border border-white/20 bg-white/10 text-white/80",
  },
  "dark-violet": {
    rootBg: "bg-[#100c1f]",
    rootText: "text-white/85",
    sectionBorder: "border-violet-500/30",
    sectionTitle: "text-violet-300",
    subsectionTitle: "text-white/90",
    faqBorder: "border border-white/10 bg-white/5",
    faqSummary: "text-white/90 hover:bg-white/10",
    faqBodyBorder: "border-t border-white/10",
    faqBodyText: "text-white/70",
    kbd: "border border-white/20 bg-white/10 text-white/80",
  },
  "dark-indigo": {
    rootBg: "bg-[#0b0b0f]",
    rootText: "text-white/85",
    sectionBorder: "border-indigo-400/30",
    sectionTitle: "text-indigo-300",
    subsectionTitle: "text-white/90",
    faqBorder: "border border-white/10 bg-white/5",
    faqSummary: "text-white/90 hover:bg-white/10",
    faqBodyBorder: "border-t border-white/10",
    faqBodyText: "text-white/70",
    kbd: "border border-white/20 bg-white/10 text-white/80",
  },
};

const HelpVariantContext = createContext<HelpVariant>("light");

function useHelpTheme(): HelpTheme {
  return HELP_THEMES[useContext(HelpVariantContext)];
}

export function HelpRoot({
  variant,
  fontSize = 13,
  children,
}: {
  variant: HelpVariant;
  fontSize?: number;
  children: React.ReactNode;
}) {
  const theme = HELP_THEMES[variant];
  return (
    <HelpVariantContext.Provider value={variant}>
      <div
        className={`h-full overflow-y-auto ${theme.rootBg}`}
        style={{ fontSize: `${fontSize}px`, lineHeight: 1.6 }}
      >
        <div
          className={`mx-auto max-w-3xl space-y-6 px-6 py-5 ${theme.rootText}`}
        >
          {children}
        </div>
      </div>
    </HelpVariantContext.Provider>
  );
}

export function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const theme = useHelpTheme();
  return (
    <section>
      <h2
        className={`border-b ${theme.sectionBorder} pb-1 font-semibold ${theme.sectionTitle}`}
        style={{ fontSize: "1.15em" }}
      >
        {title}
      </h2>
      <div className="mt-2 space-y-2">{children}</div>
    </section>
  );
}

export function Subsection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const theme = useHelpTheme();
  return (
    <div className="mt-3">
      <h3
        className={`font-semibold ${theme.subsectionTitle}`}
        style={{ fontSize: "1em" }}
      >
        {title}
      </h3>
      <div className="mt-1">{children}</div>
    </div>
  );
}

export function Faq({
  q,
  children,
}: {
  q: string;
  children: React.ReactNode;
}) {
  const theme = useHelpTheme();
  return (
    <details className={`rounded ${theme.faqBorder}`}>
      <summary
        className={`cursor-pointer select-none px-3 py-1.5 font-medium ${theme.faqSummary}`}
      >
        Q. {q}
      </summary>
      <div
        className={`px-3 py-2 ${theme.faqBodyBorder} ${theme.faqBodyText}`}
      >
        {children}
      </div>
    </details>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  const theme = useHelpTheme();
  return (
    <kbd
      className={`rounded px-1.5 py-0.5 font-mono shadow-sm ${theme.kbd}`}
      style={{ fontSize: "0.85em" }}
    >
      {children}
    </kbd>
  );
}
