"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { CodeBlock } from "./code-block";
import { MermaidBlock } from "./mermaid-block";

// Phase E-C-1: Biz パネルのチャット表示と /biz/preview の両方で使う Markdown レンダラ。
//
// remark-gfm + remark-math + rehype-katex の stack は BusinessConsole.MessagePartBiz で
// 既に確立済み。code ブロックは CodeBlock (prism-react-renderer) でハイライト。
// Phase E-C-2 で Mermaid を language-mermaid 検出時に SVG 化する予定。
export function BizMarkdown({
  source,
  className,
  fontSize = "inherit",
}: {
  source: string;
  className?: string;
  fontSize?: string | number;
}) {
  return (
    <div
      className={`prose max-w-none ${className ?? ""}`}
      style={{ fontSize, lineHeight: 1.55 }}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          pre: ({ children }) => <>{children}</>,
          code: (props) => {
            const { className: codeCn, children } = props as {
              className?: string;
              children?: React.ReactNode;
              inline?: boolean;
            };
            const lang = /language-(\w+)/.exec(codeCn ?? "")?.[1];
            const text = String(children ?? "");
            if (lang === "mermaid") {
              // Phase E-C-2: Mermaid は SVG レンダリングし印刷時もベクトルで綺麗に出す。
              return <MermaidBlock code={text} />;
            }
            if (lang) {
              return <CodeBlock language={lang} code={text} />;
            }
            return <code className={codeCn}>{children}</code>;
          },
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
