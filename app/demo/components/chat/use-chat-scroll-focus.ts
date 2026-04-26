"use client";

import { useEffect, useRef, type RefObject } from "react";
import type { InlineComposerHandle } from "./chat-composer";

// チャット系パネル (opencode-chat / coding / analyze) で共通のスクロール挙動。
//
// 1. セッション切替時 + そのセッションの履歴が初めて表示された時 → 強制的に最下部へ
//    (ロード前は totalChars=0 なので、最初に内容が入った瞬間にスナップする)
// 2. 生成中 (busy=true) は強制で最下部に追従。思考ログや tool カードで scrollHeight が
//    一気に伸びても、最新の処理過程が常に画面に出ているようにする
// 3. 非生成中は「下端近くを見ている時のみ」追従。上を読んでいる間は引き戻さない
// 4. busy が true → false になった瞬間 (= 応答生成完了) → 強制最下部 + composer フォーカス
export function useChatScrollAndFocus({
  scrollRef,
  composerRef,
  sessionId,
  totalChars,
  busy,
  input,
}: {
  scrollRef: RefObject<HTMLDivElement | null>;
  composerRef: RefObject<InlineComposerHandle | null>;
  sessionId: string | null;
  totalChars: number;
  busy: boolean;
  input: string;
}) {
  // 「このセッションでは初回スナップ済か」を覚える。sessionId 切替で null に戻す。
  const initialSnappedFor = useRef<string | null>(null);

  useEffect(() => {
    initialSnappedFor.current = null;
  }, [sessionId]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (
      sessionId &&
      initialSnappedFor.current !== sessionId &&
      totalChars > 0
    ) {
      el.scrollTop = el.scrollHeight;
      initialSnappedFor.current = sessionId;
      return;
    }
    if (busy) {
      el.scrollTop = el.scrollHeight;
      return;
    }
    const nearBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight < 160;
    if (nearBottom) el.scrollTop = el.scrollHeight;
  }, [sessionId, totalChars, busy, input, scrollRef]);

  // busy true → false の遷移を検知して、最下部スクロール + composer フォーカス。
  const prevBusyRef = useRef(busy);
  useEffect(() => {
    const wasBusy = prevBusyRef.current;
    prevBusyRef.current = busy;
    if (!wasBusy || busy) return;
    // レイアウト確定後に実行 (アボート/完了直後は最後の delta が反映されるのを 1 frame 待つ)
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
      composerRef.current?.focus();
    });
  }, [busy, scrollRef, composerRef]);
}
