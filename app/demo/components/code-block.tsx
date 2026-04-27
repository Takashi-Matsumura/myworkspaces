"use client";

import { useState } from "react";
import { Highlight, themes } from "prism-react-renderer";
import { Check, Copy } from "lucide-react";

// CodingConsole / ActionCard で使うシンタックスハイライト付きコードブロック。
// prism-react-renderer の vsDark を固定し、背景は透過にして親カードの bg を
// そのまま見せる (枠は親が持つ想定)。Business 側では使わないため light 対応は不要。
// hover で右上にコピーボタンを表示。
export function CodeBlock({
  language,
  code,
}: {
  language: string;
  code: string;
}) {
  // 末尾改行は <pre> の空行を増やすだけなので事前に除去
  const normalized = code.replace(/\n+$/, "");
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(normalized);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard API が使えない環境では何もしない */
    }
  };

  return (
    <Highlight code={normalized} language={language} theme={themes.vsDark}>
      {({ className, style, tokens, getLineProps, getTokenProps }) => (
        <div className="group relative">
          <pre
            className={`overflow-x-auto px-3 py-2 leading-relaxed ${className}`}
            style={{ ...style, background: "transparent", fontSize: "0.9em" }}
          >
            {tokens.map((line, i) => (
              <div key={i} {...getLineProps({ line })}>
                {line.map((token, key) => (
                  <span key={key} {...getTokenProps({ token })} />
                ))}
              </div>
            ))}
          </pre>
          <button
            type="button"
            onClick={onCopy}
            className="absolute right-1.5 top-1.5 rounded border border-white/10 bg-white/5 p-1 text-white/85 opacity-0 transition-opacity hover:bg-white/10 hover:text-white focus-visible:opacity-100 group-hover:opacity-100"
            title={copied ? "コピーしました" : "コピー"}
            aria-label="コードをコピー"
          >
            {copied ? (
              <Check style={{ width: "0.9em", height: "0.9em" }} />
            ) : (
              <Copy style={{ width: "0.9em", height: "0.9em" }} />
            )}
          </button>
        </div>
      )}
    </Highlight>
  );
}

// 拡張子からざっくり言語を推定 (prism-react-renderer に渡す用)。
// 不明な場合は "text" にフォールバック。
export function inferLanguageFromPath(path: string): string {
  const ext = path.match(/\.([a-zA-Z0-9]+)$/)?.[1]?.toLowerCase();
  if (!ext) return "text";
  const map: Record<string, string> = {
    ts: "tsx",
    tsx: "tsx",
    js: "jsx",
    jsx: "jsx",
    mjs: "jsx",
    cjs: "jsx",
    json: "json",
    md: "markdown",
    mdx: "markdown",
    css: "css",
    scss: "scss",
    html: "markup",
    xml: "markup",
    svg: "markup",
    py: "python",
    rb: "ruby",
    go: "go",
    rs: "rust",
    sh: "bash",
    bash: "bash",
    zsh: "bash",
    yml: "yaml",
    yaml: "yaml",
    toml: "toml",
    sql: "sql",
    diff: "diff",
    patch: "diff",
    dockerfile: "docker",
  };
  return map[ext] ?? "text";
}
