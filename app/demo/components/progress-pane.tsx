"use client";

import { useMemo } from "react";
import { CheckCircle2, Circle, Zap } from "lucide-react";
import type { MessageInfo, PartInfo } from "./use-opencode-stream";
import { CODING_THEME } from "./coding-theme";
import { parseToolPart } from "./action-card";

// 現在アクティブな assistant メッセージに含まれる step-start/finish と tool を
// 集計して、1 行コンパクトな「進捗サマリ」として表示する。
// 上下分割レイアウトの下段 (会話ログと composer の間) に置く前提。
//
// 表示内容:
// - ステップ進行: [✓] × 完了数 + [●] 進行中 (step-start > step-finish)
// - 現在実行中 tool: 最新の tool part (Read/Edit/Bash/etc.) の短い要約
// - アイドル時は最新ステップの件数のみコンパクトに
export function ProgressPane({
  messages,
  parts,
  busy,
  activeId,
}: {
  messages: MessageInfo[];
  parts: Record<string, PartInfo>;
  busy: boolean;
  activeId: string | null;
}) {
  const summary = useMemo(() => {
    if (!activeId) return null;

    // 最新の assistant メッセージが対象 (直前の user turn 以降の作業)
    let latestAssistant: MessageInfo | undefined;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role !== "user") {
        latestAssistant = messages[i];
        break;
      }
    }
    if (!latestAssistant) return null;

    // 対象メッセージ内の part を type 別に集計
    let stepStart = 0;
    let stepFinish = 0;
    const tools: PartInfo[] = [];
    for (const pid of latestAssistant.partIds) {
      const p = parts[pid];
      if (!p) continue;
      if (p.type === "step-start") stepStart++;
      else if (p.type === "step-finish") stepFinish++;
      else if (p.type === "tool") tools.push(p);
    }

    const runningStep = stepStart - stepFinish;
    const latestTool = tools.length > 0 ? tools[tools.length - 1] : null;

    return { stepStart, stepFinish, runningStep, latestTool, toolCount: tools.length };
  }, [messages, parts, activeId]);

  if (!summary) {
    // セッション未選択 or メッセージなしの時はペイン自体を薄く
    return (
      <div
        className={`flex flex-none items-center gap-3 border-t ${CODING_THEME.cardBorder} px-4 py-2 text-white/40`}
        style={{ fontSize: "0.85em" }}
      >
        <span>進捗なし · 新しい指示を待機中</span>
      </div>
    );
  }

  const { stepStart, stepFinish, runningStep, latestTool, toolCount } = summary;

  // ステップチェックボックス群 (完了 + 進行中)
  const checks: React.ReactNode[] = [];
  for (let i = 0; i < stepFinish; i++) {
    checks.push(
      <CheckCircle2
        key={`done-${i}`}
        className={CODING_THEME.cardAccentRead}
        style={{ width: "0.95em", height: "0.95em" }}
      />,
    );
  }
  for (let i = 0; i < runningStep; i++) {
    checks.push(
      <Circle
        key={`running-${i}`}
        className={`${CODING_THEME.cardAccentRun} animate-pulse`}
        style={{ width: "0.95em", height: "0.95em" }}
      />,
    );
  }

  // 現在実行中 tool (最新 tool)。busy 中なら「実行中」、完了後は「最後に実行」
  let toolLabel: React.ReactNode = null;
  if (latestTool) {
    const parsed = parseToolPart(latestTool);
    const path =
      (parsed.input?.path as string | undefined) ??
      (parsed.input?.filePath as string | undefined) ??
      (parsed.input?.file_path as string | undefined);
    const cmd =
      (parsed.input?.command as string | undefined) ??
      (parsed.input?.cmd as string | undefined);
    const target = path ?? cmd ?? parsed.tool;
    const verb = busy ? "実行中" : "最後に実行";
    toolLabel = (
      <span className="flex min-w-0 items-center gap-1.5 truncate">
        <Zap
          className={busy ? `${CODING_THEME.cardAccentRun} animate-pulse` : "text-white/40"}
          style={{ width: "0.95em", height: "0.95em" }}
        />
        {busy ? (
          <span className="opencode-shimmer truncate font-mono">
            {verb}: {parsed.tool} {target}
          </span>
        ) : (
          <>
            <span className="text-white/60">{verb}:</span>
            <span className="truncate font-mono text-white/90">
              {parsed.tool} {target}
            </span>
          </>
        )}
      </span>
    );
  }

  return (
    <div
      className={`flex flex-none items-center gap-3 border-t ${CODING_THEME.cardBorder} px-4 py-2`}
      style={{ fontSize: "0.85em" }}
    >
      <span className="flex items-center gap-2">
        <span className="text-white/50">ステップ:</span>
        {checks.length > 0 ? (
          <span className="flex items-center gap-1">{checks}</span>
        ) : (
          <span className="text-white/40">—</span>
        )}
        <span className="text-white/50">
          {stepFinish}/{stepStart || stepFinish} 完了
        </span>
        {runningStep > 0 && (
          <span className="opencode-shimmer">· {runningStep} 進行中</span>
        )}
      </span>
      <span className="h-3 w-px bg-white/10" />
      {toolLabel ?? (
        <span className="flex items-center gap-1.5 text-white/40">
          <Zap style={{ width: "0.95em", height: "0.95em" }} />
          tool 実行なし
        </span>
      )}
      {toolCount > 1 && (
        <span className="ml-auto flex-none text-white/40">
          · 累計 {toolCount} tool
        </span>
      )}
    </div>
  );
}
