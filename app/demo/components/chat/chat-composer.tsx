"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { Send, Square } from "lucide-react";
import type { ChatTheme } from "../chat-theme";
import type { SkillSummary } from "../opencode-chat";

// 親が「生成完了時にフォーカスを戻す」等の操作で textarea を直接触れるよう公開する。
export type InlineComposerHandle = {
  focus: () => void;
};

type InlineComposerProps = {
  disabled: boolean;
  busy: boolean;
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void | Promise<void>;
  onAbort?: () => void;
  skills: SkillSummary[];
  statusLine: string;
  theme: ChatTheme;
  // ファイルが composer 領域に DnD された時に呼ばれる。Biz パネルが
  // 受け取って /api/workspace/upload に転送する想定。Coding/Analyze は
  // 渡さない (= DnD は無視する)。
  onFilesDropped?: (files: File[]) => void | Promise<void>;
};

// メッセージ履歴のスクロール領域内に「次の下書きメッセージ」として並ぶ
// インライン入力カード。下部固定のチャット欄ではなく会話フローの末尾に
// 居座る形で、複数行入力にも内容量に応じて自動で伸びる。
export const InlineComposer = forwardRef<InlineComposerHandle, InlineComposerProps>(function InlineComposer(
  {
    disabled,
    busy,
    value,
    onChange,
    onSubmit,
    onAbort,
    skills,
    statusLine,
    theme,
    onFilesDropped,
  },
  ref,
) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [suggestIndex, setSuggestIndex] = useState(0);
  const [dragActive, setDragActive] = useState(false);

  useImperativeHandle(
    ref,
    () => ({
      focus: () => {
        textareaRef.current?.focus();
      },
    }),
    [],
  );

  // 入力の先頭が `/<prefix>` の形ならサジェストを出す。空の `/` は全件表示。
  const suggestions = useMemo(() => {
    const m = value.match(/^\/([a-z0-9_-]*)$/i);
    if (!m) return [] as SkillSummary[];
    const prefix = m[1].toLowerCase();
    return skills.filter((s) => s.name.startsWith(prefix));
  }, [value, skills]);

  const showSuggest = !disabled && suggestions.length > 0;

  useEffect(() => {
    if (suggestIndex >= suggestions.length) setSuggestIndex(0);
  }, [suggestions.length, suggestIndex]);

  // 内容量に応じて textarea の高さを scrollHeight に追従。
  // 上限は 40em 相当でクリップし、超えたら内部スクロール。
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    const style = window.getComputedStyle(ta);
    const emPx = parseFloat(style.fontSize) || 14;
    const max = Math.round(emPx * 40);
    const next = Math.min(ta.scrollHeight, max);
    ta.style.height = `${next}px`;
    ta.style.overflowY = ta.scrollHeight > max ? "auto" : "hidden";
  }, [value]);

  const applySuggestion = useCallback(
    (name: string) => {
      onChange(`/${name} `);
      setSuggestIndex(0);
      requestAnimationFrame(() => textareaRef.current?.focus());
    },
    [onChange],
  );

  const dropEnabled = Boolean(onFilesDropped) && !disabled;

  return (
    <form
      className={`relative rounded-lg shadow-sm ${theme.composerWrap} ${
        dragActive ? theme.composerDropActive : ""
      }`}
      onSubmit={(e) => {
        e.preventDefault();
        if (!disabled) void onSubmit();
      }}
      onDragOver={
        dropEnabled
          ? (e) => {
              if (e.dataTransfer.types.includes("Files")) {
                e.preventDefault();
                e.dataTransfer.dropEffect = "copy";
                if (!dragActive) setDragActive(true);
              }
            }
          : undefined
      }
      onDragLeave={
        dropEnabled
          ? (e) => {
              // composer の外まで完全に出た時だけクリア (子要素間の dragleave を無視)
              if (e.currentTarget.contains(e.relatedTarget as Node)) return;
              setDragActive(false);
            }
          : undefined
      }
      onDrop={
        dropEnabled
          ? (e) => {
              e.preventDefault();
              setDragActive(false);
              const files = Array.from(e.dataTransfer.files);
              if (files.length > 0) void onFilesDropped?.(files);
            }
          : undefined
      }
    >
      {showSuggest && (
        <div
          className={`absolute bottom-full left-0 right-0 z-10 mb-1 max-h-56 overflow-y-auto rounded-md shadow-lg ${theme.suggestWrap}`}
          style={{ fontSize: "0.9em" }}
        >
          <div
            className={`px-2 py-1 ${theme.suggestHeader}`}
            style={{ fontSize: "0.8em" }}
          >
            スキル (Tab / Enter で挿入、Esc で閉じる)
          </div>
          <ul>
            {suggestions.map((s, i) => (
              <li key={s.name}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    applySuggestion(s.name);
                  }}
                  className={`block w-full px-3 py-1.5 text-left ${
                    i === suggestIndex
                      ? theme.suggestActive
                      : theme.suggestHover
                  }`}
                >
                  <div className={`font-mono font-medium ${theme.suggestName}`}>
                    /{s.name}
                  </div>
                  <div
                    className={`truncate ${theme.suggestDesc}`}
                    style={{ fontSize: "0.85em" }}
                  >
                    {s.description || "(説明なし)"}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div
        className={`px-3 pt-2 font-semibold uppercase tracking-wide ${theme.composerLabel}`}
        style={{ fontSize: "0.7em" }}
      >
        あなた (下書き)
      </div>
      <textarea
        ref={textareaRef}
        rows={1}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          if (showSuggest) {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setSuggestIndex((i) => Math.min(suggestions.length - 1, i + 1));
              return;
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setSuggestIndex((i) => Math.max(0, i - 1));
              return;
            }
            if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
              e.preventDefault();
              const chosen = suggestions[suggestIndex];
              if (chosen) applySuggestion(chosen.name);
              return;
            }
            if (e.key === "Escape") {
              e.preventDefault();
              onChange(value.replace(/^\//, ""));
              return;
            }
          }
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (!disabled) void onSubmit();
          }
        }}
        placeholder="メッセージを入力 (Enter で送信 / Shift+Enter で改行 /「/」でスキル)"
        disabled={disabled}
        className={`block w-full resize-none border-0 bg-transparent px-3 py-2 leading-relaxed focus:outline-none focus:ring-0 ${theme.composerTextarea}`}
      />
      <div
        className={`flex items-center justify-between gap-2 px-3 py-1.5 ${theme.composerFooter}`}
        style={{ fontSize: "0.8em" }}
      >
        <span
          className={`truncate font-mono ${
            busy ? theme.composerBusyOn : theme.composerBusyOff
          }`}
          title="応答中は文字ベースで推定 (~ 付き)、完了時に llama-server の /tokenize で実トークン数に差し替え。コンテキストはセッション全文のトークン数と上限の比"
        >
          {statusLine}
        </span>
        {busy && onAbort ? (
          <button
            type="button"
            onClick={onAbort}
            className={`flex items-center justify-center gap-1.5 rounded-md px-3 py-1 font-medium ${theme.abortBtn}`}
            title="生成を停止"
          >
            <Square style={{ width: "1em", height: "1em" }} />
            停止
          </button>
        ) : (
          <button
            type="submit"
            disabled={disabled || busy || value.trim().length === 0}
            className={`flex items-center justify-center gap-1.5 rounded-md px-3 py-1 font-medium ${theme.sendBtn}`}
          >
            <Send style={{ width: "1em", height: "1em" }} />
            送信
          </button>
        )}
      </div>
    </form>
  );
});
