import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProgressPane } from "@/app/demo/components/progress-pane";
import { CHAT_THEMES } from "@/app/demo/components/chat-theme";
import type { MessageInfo, PartInfo } from "@/app/demo/components/use-opencode-stream";

// Phase F-F: ProgressPane の表示ロジックを React Testing Library で検証。
// パネル毎のテーマクラスは Biz の値を借りる (検証は label テキストと aria 役割で行うので影響なし)。

const theme = CHAT_THEMES.business;

function makeUserMessage(id: string): MessageInfo {
  return { id, role: "user", sessionID: "s1", partIds: [] };
}

function makeAssistantMessage(id: string, partIds: string[]): MessageInfo {
  return { id, role: "assistant", sessionID: "s1", partIds };
}

function makePart(id: string, type: PartInfo["type"], extra: Partial<PartInfo> = {}): PartInfo {
  return {
    id,
    messageID: "a1",
    sessionID: "s1",
    type,
    text: "",
    raw: {},
    ...extra,
  };
}

describe("ProgressPane — empty / fallback", () => {
  it("activeId が null なら「進捗なし」を表示", () => {
    render(
      <ProgressPane
        messages={[]}
        parts={{}}
        busy={false}
        activeId={null}
        theme={theme}
      />,
    );
    expect(screen.getByText(/進捗なし/)).toBeInTheDocument();
  });

  it("user メッセージしかない場合も「進捗なし」", () => {
    const messages = [makeUserMessage("m1")];
    render(
      <ProgressPane
        messages={messages}
        parts={{}}
        busy={false}
        activeId="s1"
        theme={theme}
      />,
    );
    expect(screen.getByText(/進捗なし/)).toBeInTheDocument();
  });
});

describe("ProgressPane — step カウント", () => {
  it("step-start 2 / step-finish 1 なら「1/2 完了 · 1 進行中」", () => {
    const parts: Record<string, PartInfo> = {
      ps1: makePart("ps1", "step-start"),
      pf1: makePart("pf1", "step-finish"),
      ps2: makePart("ps2", "step-start"),
    };
    const messages = [makeAssistantMessage("a1", ["ps1", "pf1", "ps2"])];
    render(
      <ProgressPane
        messages={messages}
        parts={parts}
        busy
        activeId="s1"
        theme={theme}
      />,
    );
    expect(screen.getByText(/1\/2 完了/)).toBeInTheDocument();
    expect(screen.getByText(/1 進行中/)).toBeInTheDocument();
  });

  it("step-finish が start と同数なら「進行中」が出ない", () => {
    const parts: Record<string, PartInfo> = {
      ps1: makePart("ps1", "step-start"),
      pf1: makePart("pf1", "step-finish"),
    };
    const messages = [makeAssistantMessage("a1", ["ps1", "pf1"])];
    render(
      <ProgressPane
        messages={messages}
        parts={parts}
        busy={false}
        activeId="s1"
        theme={theme}
      />,
    );
    expect(screen.getByText(/1\/1 完了/)).toBeInTheDocument();
    expect(screen.queryByText(/進行中/)).not.toBeInTheDocument();
  });
});

describe("ProgressPane — tool ラベル", () => {
  it("tool が無ければ「tool 実行なし」を表示", () => {
    const parts: Record<string, PartInfo> = {
      ps1: makePart("ps1", "step-start"),
    };
    const messages = [makeAssistantMessage("a1", ["ps1"])];
    render(
      <ProgressPane
        messages={messages}
        parts={parts}
        busy={false}
        activeId="s1"
        theme={theme}
      />,
    );
    expect(screen.getByText(/tool 実行なし/)).toBeInTheDocument();
  });

  it("tool part の最後 (read) を「最後に実行: read <path>」で表示", () => {
    const parts: Record<string, PartInfo> = {
      t1: makePart("t1", "tool", {
        raw: { tool: "read", state: { input: { path: "src/index.ts" }, status: "completed" } },
      }),
    };
    const messages = [makeAssistantMessage("a1", ["t1"])];
    render(
      <ProgressPane
        messages={messages}
        parts={parts}
        busy={false}
        activeId="s1"
        theme={theme}
      />,
    );
    expect(screen.getByText(/最後に実行/)).toBeInTheDocument();
    expect(screen.getByText(/read src\/index\.ts/)).toBeInTheDocument();
  });
});

describe("ProgressPane — web_search バッジ", () => {
  function setupWithWebSearch(readUrl?: string) {
    const parts: Record<string, PartInfo> = {
      t1: makePart("t1", "tool", {
        raw: { tool: "web_search", state: { input: { query: "foo" } } },
      }),
      t2: makePart("t2", "tool", {
        raw: {
          tool: "web_search",
          state: { input: readUrl ? { read_url: readUrl } : { query: "bar" } },
        },
      }),
    };
    const messages = [makeAssistantMessage("a1", ["t1", "t2"])];
    return { parts, messages };
  }

  it("showWebSearchBadge=false (デフォルト) ではバッジが出ない", () => {
    const { parts, messages } = setupWithWebSearch();
    render(
      <ProgressPane
        messages={messages}
        parts={parts}
        busy={false}
        activeId="s1"
        theme={theme}
      />,
    );
    expect(screen.queryByText(/web_search 2\/5/)).not.toBeInTheDocument();
  });

  it("showWebSearchBadge=true で「web_search 2/5」を表示", () => {
    const { parts, messages } = setupWithWebSearch();
    render(
      <ProgressPane
        messages={messages}
        parts={parts}
        busy={false}
        activeId="s1"
        theme={theme}
        showWebSearchBadge
      />,
    );
    expect(screen.getByText(/web_search 2\/5/)).toBeInTheDocument();
  });

  it("read_url を含む呼出は「本文 N/2」も併記", () => {
    const { parts, messages } = setupWithWebSearch("https://example.com");
    render(
      <ProgressPane
        messages={messages}
        parts={parts}
        busy={false}
        activeId="s1"
        theme={theme}
        showWebSearchBadge
      />,
    );
    expect(screen.getByText(/本文 1\/2/)).toBeInTheDocument();
  });

  it("web_search が 0 件ならバッジを表示しない", () => {
    const parts: Record<string, PartInfo> = {
      t1: makePart("t1", "tool", { raw: { tool: "read" } }),
    };
    const messages = [makeAssistantMessage("a1", ["t1"])];
    render(
      <ProgressPane
        messages={messages}
        parts={parts}
        busy={false}
        activeId="s1"
        theme={theme}
        showWebSearchBadge
      />,
    );
    expect(screen.queryByText(/web_search/)).not.toBeInTheDocument();
  });
});
