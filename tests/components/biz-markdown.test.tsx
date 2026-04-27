import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// Phase F-F: BizMarkdown のレンダリングと、language-mermaid / language-xxx の振り分けを検証。
// MermaidBlock は実際に mermaid を import するので、テストでは描画器をモックして
// 「正しい言語タグで呼び出された」ことだけ assert する。

vi.mock("@/app/demo/components/mermaid-block", () => ({
  MermaidBlock: ({ code }: { code: string }) => (
    <div data-testid="mermaid-block">{code}</div>
  ),
}));

vi.mock("@/app/demo/components/code-block", () => ({
  CodeBlock: ({ language, code }: { language: string; code: string }) => (
    <pre data-testid="code-block" data-language={language}>
      {code}
    </pre>
  ),
}));

import { BizMarkdown } from "@/app/demo/components/biz-markdown";

describe("BizMarkdown — 基本レンダリング", () => {
  it("見出し / 段落 / 強調を HTML に変換する", () => {
    render(
      <BizMarkdown source={`# Title\n\nHello **world**.`} />,
    );
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1).toHaveTextContent("Title");
    expect(screen.getByText(/Hello/)).toBeInTheDocument();
    expect(screen.getByText("world")).toBeInTheDocument();
  });

  it("GFM の表を <table> に変換する (remark-gfm)", () => {
    const md = "| col |\n| --- |\n| val |\n";
    render(<BizMarkdown source={md} />);
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "val" })).toBeInTheDocument();
  });

  it("インラインコード <code> はそのまま出す", () => {
    render(<BizMarkdown source="use `npm install`" />);
    const code = screen.getByText("npm install");
    expect(code.tagName.toLowerCase()).toBe("code");
  });
});

describe("BizMarkdown — fenced code 振り分け", () => {
  it("language 付きフェンスは CodeBlock に渡される", () => {
    const md = '```ts\nconst x = 1;\n```';
    render(<BizMarkdown source={md} />);
    const block = screen.getByTestId("code-block");
    expect(block.dataset.language).toBe("ts");
    expect(block).toHaveTextContent("const x = 1;");
  });

  it("language-mermaid は MermaidBlock に渡される (E-C-2)", () => {
    const md = "```mermaid\nflowchart TD\n  A --> B\n```";
    render(<BizMarkdown source={md} />);
    const block = screen.getByTestId("mermaid-block");
    expect(block).toHaveTextContent("flowchart TD");
    expect(block).toHaveTextContent("A --> B");
    // CodeBlock には行かない
    expect(screen.queryByTestId("code-block")).not.toBeInTheDocument();
  });

  it("複数の Mermaid ブロックが共存できる", () => {
    const md = [
      "```mermaid",
      "graph A",
      "```",
      "",
      "```mermaid",
      "graph B",
      "```",
    ].join("\n");
    render(<BizMarkdown source={md} />);
    const blocks = screen.getAllByTestId("mermaid-block");
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toHaveTextContent("graph A");
    expect(blocks[1]).toHaveTextContent("graph B");
  });

  it("language なしフェンスは CodeBlock を経由しない", () => {
    const md = '```\nplain text\n```';
    render(<BizMarkdown source={md} />);
    expect(screen.queryByTestId("code-block")).not.toBeInTheDocument();
    expect(screen.queryByTestId("mermaid-block")).not.toBeInTheDocument();
  });
});

describe("BizMarkdown — fontSize / className prop", () => {
  it("className を root に適用する", () => {
    const { container } = render(
      <BizMarkdown source="# x" className="custom-cls" />,
    );
    expect(container.querySelector(".custom-cls")).not.toBeNull();
  });

  it("fontSize を inline style に渡す", () => {
    const { container } = render(<BizMarkdown source="# x" fontSize={20} />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.style.fontSize).toBe("20px");
  });
});
