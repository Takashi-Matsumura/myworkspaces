"use client";

import { Highlight, themes } from "prism-react-renderer";

// CodingConsole / ActionCard で使うシンタックスハイライト付きコードブロック。
// prism-react-renderer の vsDark を固定し、背景は透過にして親カードの bg を
// そのまま見せる (枠は親が持つ想定)。Business 側では使わないため light 対応は不要。
export function CodeBlock({
  language,
  code,
}: {
  language: string;
  code: string;
}) {
  // 末尾改行は <pre> の空行を増やすだけなので事前に除去
  const normalized = code.replace(/\n+$/, "");
  return (
    <Highlight code={normalized} language={language} theme={themes.vsDark}>
      {({ className, style, tokens, getLineProps, getTokenProps }) => (
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
