import { describe, expect, it } from "vitest";
import { extractA2AInboxItems } from "@/app/demo/components/a2a-inbox";
import type {
  MessageInfo,
  PartInfo,
} from "@/app/demo/components/use-opencode-stream";

const userMsg: MessageInfo = {
  id: "msg_user1",
  role: "user",
  sessionID: "ses_x",
  partIds: ["prt_a"],
};
const assistantMsg: MessageInfo = {
  id: "msg_asst1",
  role: "assistant",
  sessionID: "ses_x",
  partIds: ["prt_b"],
};
const userMsgA2A: MessageInfo = {
  id: "msg_user2",
  role: "user",
  sessionID: "ses_x",
  partIds: ["prt_c"],
};

const partsAllNormal: Record<string, PartInfo> = {
  prt_a: {
    id: "prt_a",
    messageID: "msg_user1",
    sessionID: "ses_x",
    type: "text",
    text: "ふつうのユーザー入力",
  },
  prt_b: {
    id: "prt_b",
    messageID: "msg_asst1",
    sessionID: "ses_x",
    type: "text",
    text: "応答",
  },
};

const partsWithA2A: Record<string, PartInfo> = {
  ...partsAllNormal,
  prt_c: {
    id: "prt_c",
    messageID: "msg_user2",
    sessionID: "ses_x",
    type: "text",
    text: "[[A2A from=biz hop=2 rope=rope_abc]]\n本文だけ",
    raw: { a2a: { from: "biz", hop: 2, rope: "rope_abc" } },
  },
};

describe("extractA2AInboxItems", () => {
  it("A2A 部分が無いと空配列", () => {
    const items = extractA2AInboxItems(
      [userMsg, assistantMsg],
      partsAllNormal,
    );
    expect(items).toHaveLength(0);
  });

  it("raw.a2a を持つ part を抽出し、prefix を剥がした content を含む", () => {
    const items = extractA2AInboxItems(
      [userMsg, assistantMsg, userMsgA2A],
      partsWithA2A,
    );
    expect(items).toHaveLength(1);
    const it0 = items[0];
    expect(it0.meta.from).toBe("biz");
    expect(it0.meta.hop).toBe(2);
    expect(it0.meta.rope).toBe("rope_abc");
    expect(it0.content).toBe("本文だけ");
    expect(it0.partId).toBe("prt_c");
  });

  it("不正な形の raw.a2a (型違反) はスキップ", () => {
    const malformed: Record<string, PartInfo> = {
      ...partsAllNormal,
      prt_c: {
        id: "prt_c",
        messageID: "msg_user2",
        sessionID: "ses_x",
        type: "text",
        text: "x",
        raw: { a2a: { from: "admin", hop: "bad", rope: 123 } },
      },
    };
    const items = extractA2AInboxItems([userMsgA2A], malformed);
    expect(items).toHaveLength(0);
  });

  it("複数の A2A メッセージを順序通り抽出", () => {
    const m2: MessageInfo = {
      id: "msg_user3",
      role: "user",
      sessionID: "ses_x",
      partIds: ["prt_d"],
    };
    const ext: Record<string, PartInfo> = {
      ...partsWithA2A,
      prt_d: {
        id: "prt_d",
        messageID: "msg_user3",
        sessionID: "ses_x",
        type: "text",
        text: "[[A2A from=code hop=3 rope=rope_xyz]]\nもう一通",
        raw: { a2a: { from: "code", hop: 3, rope: "rope_xyz" } },
      },
    };
    const items = extractA2AInboxItems([userMsgA2A, m2], ext);
    expect(items.map((i) => i.meta.hop)).toEqual([2, 3]);
    expect(items.map((i) => i.content)).toEqual(["本文だけ", "もう一通"]);
  });
});
