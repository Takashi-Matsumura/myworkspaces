"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PartInfo } from "../use-opencode-stream";
import type { ChatTheme } from "../chat-theme";

// 英語の思考ログを折りたたみ + 日本語翻訳タブで表示する。
// 翻訳は /api/opencode/translate の text/plain ストリームを逐次連結する。
// 1 回翻訳した結果はキャッシュし、再度「日本語」タブを押しても再取得しない。
// 思考ログがストリーム途中の場合は「再翻訳」で最新版に更新できる。
export function ReasoningPart({ part, theme }: { part: PartInfo; theme: ChatTheme }) {
  const [tab, setTab] = useState<"source" | "ja">("source");
  const [translation, setTranslation] = useState("");
  const [translating, setTranslating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [translatedFromLen, setTranslatedFromLen] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  // アンマウント時に stream を畳む。
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const runTranslate = useCallback(async () => {
    const text = part.text;
    if (!text.trim()) return;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setTranslating(true);
    setError(null);
    setTranslation("");
    try {
      const resp = await fetch("/api/opencode/translate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
        signal: ac.signal,
      });
      if (!resp.ok || !resp.body) {
        setError(`翻訳に失敗しました (${resp.status})`);
        setTranslating(false);
        return;
      }
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        if (chunk) {
          acc += chunk;
          setTranslation(acc);
        }
      }
      setTranslatedFromLen(text.length);
    } catch (err) {
      if ((err as { name?: string }).name === "AbortError") return;
      setError(String(err));
    } finally {
      setTranslating(false);
    }
  }, [part.text]);

  const onOpenJa = useCallback(() => {
    setTab("ja");
    if (!translation && !translating) void runTranslate();
  }, [translation, translating, runTranslate]);

  // 思考ログ本文が伸びた分 (delta 追記) があれば再翻訳を提案する。
  const stale = translation !== "" && part.text.length !== translatedFromLen;

  return (
    <details
      className={`mb-2 rounded ${theme.reasoningBorder}`}
      style={{ fontSize: "0.9em" }}
    >
      <summary
        className={`flex cursor-pointer select-none items-center gap-2 px-2 py-1 ${theme.reasoningSummary}`}
      >
        <span>思考ログ ({part.text.length} 文字)</span>
        <span className="ml-auto flex items-center gap-1" style={{ fontSize: "0.9em" }}>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              setTab("source");
            }}
            className={`rounded px-2 py-0.5 ${
              tab === "source"
                ? theme.reasoningTabActive
                : theme.reasoningTabInactive
            }`}
          >
            原文
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              onOpenJa();
            }}
            className={`rounded px-2 py-0.5 ${
              tab === "ja"
                ? theme.translateTabActive
                : theme.translateTabInactive
            }`}
            title="AI 翻訳で日本語に変換 (llama-server)"
          >
            {translating ? "翻訳中…" : "日本語"}
          </button>
        </span>
      </summary>
      {tab === "source" ? (
        <pre
          className={`whitespace-pre-wrap break-words px-3 py-2 font-mono leading-relaxed ${theme.reasoningBodyText}`}
          style={{ fontSize: "0.9em" }}
        >
          {part.text}
        </pre>
      ) : (
        <div className="px-3 py-2" style={{ fontSize: "0.9em" }}>
          {error ? (
            <div className={theme.errorText}>{error}</div>
          ) : translation === "" && translating ? (
            <div className={theme.translatingText}>● 翻訳中…</div>
          ) : translation === "" ? (
            <div className={theme.sidebarMutedMini}>（未翻訳）</div>
          ) : (
            <>
              <pre
                className={`whitespace-pre-wrap break-words leading-relaxed ${theme.translatedText}`}
              >
                {translation}
                {translating && (
                  <span className={theme.translationCaretAccent}> ▌</span>
                )}
              </pre>
              {stale && !translating && (
                <div
                  className={`mt-2 flex items-center gap-2 ${theme.translatingText}`}
                >
                  <span>思考ログが更新されています</span>
                  <button
                    type="button"
                    onClick={() => void runTranslate()}
                    className={`rounded px-2 py-0.5 ${theme.retranslateBtn}`}
                  >
                    再翻訳
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </details>
  );
}
