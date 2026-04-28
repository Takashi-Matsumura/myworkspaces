// 1 件の A2A メッセージを相手 session に inject する。
// /api/opencode/sessions/{id}/prompt 経由ではなく opencode サイドカーへ直接 POST する
// (transformBody の variant prefix 付加を回避するため)。
//
// agent は必ず "build" を明示する (Spike 副次発見: agent: business は workspace に
// 業務 agent 未登録だと silently 破棄される事故あり)。

import { fetchOpencode } from "@/lib/opencode-client";
import { encode, type A2APanel } from "./prefix";

export type InjectResult = {
  ok: boolean;
  status: number;
};

export async function injectA2aMessage(
  sub: string,
  toSessionId: string,
  ropeId: string,
  fromPanel: A2APanel,
  hopCount: number,
  content: string,
): Promise<InjectResult> {
  const text = encode({ from: fromPanel, hop: hopCount, rope: ropeId }, content);
  const body = JSON.stringify({
    parts: [{ type: "text", text }],
    agent: "build",
  });
  const resp = await fetchOpencode(
    sub,
    `/session/${encodeURIComponent(toSessionId)}/prompt_async`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    },
  );
  return { ok: resp.ok, status: resp.status };
}
