"use client";

import { useEffect, useRef, useState } from "react";

// Phase E-C-2: language-mermaid のコードブロックを SVG にレンダリング。
//
// mermaid 11 は ESM only でブラウザ DOM に依存するので、SSR を避けて
// useEffect 内で動的 import + render する。失敗時は素のコードブロックに
// フォールバック (印刷時の見栄え劣化はあるが描画落ちはしない)。

type State =
  | { kind: "loading" }
  | { kind: "ready"; svg: string }
  | { kind: "error"; message: string };

let mermaidInitPromise: Promise<typeof import("mermaid").default> | null = null;

async function getMermaid() {
  if (!mermaidInitPromise) {
    mermaidInitPromise = (async () => {
      const mod = await import("mermaid");
      const mermaid = mod.default;
      mermaid.initialize({
        startOnLoad: false,
        theme: "default",
        securityLevel: "strict",
        fontFamily: "ui-sans-serif, -apple-system, sans-serif",
      });
      return mermaid;
    })();
  }
  return mermaidInitPromise;
}

export function MermaidBlock({ code }: { code: string }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  // 同一ページに複数 Mermaid があると id の衝突で render が壊れるので一意 id を持つ
  const idRef = useRef<string>(`mermaid-${Math.random().toString(36).slice(2)}`);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mermaid = await getMermaid();
        const { svg } = await mermaid.render(idRef.current, code);
        if (!cancelled) setState({ kind: "ready", svg });
      } catch (err) {
        if (!cancelled) {
          setState({
            kind: "error",
            message: (err as Error).message ?? "render failed",
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code]);

  if (state.kind === "loading") {
    return (
      <pre className="overflow-x-auto rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
        {code}
      </pre>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="my-2 rounded border border-rose-200 bg-rose-50 p-2">
        <div className="mb-1 font-mono text-[11px] text-rose-700">
          Mermaid 描画失敗: {state.message}
        </div>
        <pre className="overflow-x-auto rounded bg-white px-2 py-1 text-xs text-slate-700">
          {code}
        </pre>
      </div>
    );
  }

  return (
    <div
      className="biz-mermaid my-3 overflow-x-auto rounded border border-slate-200 bg-white p-2"
      // svg は mermaid が生成した安全な文字列。strict セキュリティで html 実行はされない。
      dangerouslySetInnerHTML={{ __html: state.svg }}
    />
  );
}
