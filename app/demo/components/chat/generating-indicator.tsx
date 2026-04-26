"use client";

// 生成中の表示。opencode TUI 風に文字を左右に光が流れるシマー (.opencode-shimmer)
// で表現する。Business / Coding / Analyze の 3 パネルから共通利用する。
//
// シマー色は CSS 側 (.opencode-shimmer / .chat-dark .opencode-shimmer) で
// 明地 / 暗地に出し分けるので、ここでは色を当てない。
export function GeneratingIndicator({ label = "応答を生成中" }: { label?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="opencode-shimmer font-medium"
      style={{ fontSize: "0.9em" }}
    >
      {label}…
    </div>
  );
}
