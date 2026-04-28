// A2A メッセージの本文 prefix。
// Spike Q2-B で確定: opencode は parts の未知 field を normalize 段階で削除するため、
// メタは text 本文の先頭にエンコードする。
//
// フォーマット:  `[[A2A from=<panel> hop=<n> rope=<id>]]\n<content>`
//   - panel: "biz" | "code"
//   - hop:   1〜hopLimit (整数)
//   - rope:  cuid (英数 + アンダースコア + ハイフン)
//
// encode/decode は server / client 両方から import される純関数。
// 副作用も DB アクセスもしない。

export type A2APanel = "biz" | "code";

export type A2AMeta = {
  from: A2APanel;
  hop: number;
  rope: string;
};

const PREFIX_RE = /^\[\[A2A from=(biz|code) hop=(\d+) rope=([\w-]+)\]\]\n/;

export function encode(meta: A2AMeta, content: string): string {
  return `[[A2A from=${meta.from} hop=${meta.hop} rope=${meta.rope}]]\n${content}`;
}

export function decode(text: string): { meta: A2AMeta | null; content: string } {
  const m = text.match(PREFIX_RE);
  if (!m) return { meta: null, content: text };
  return {
    meta: {
      from: m[1] as A2APanel,
      hop: Number.parseInt(m[2], 10),
      rope: m[3],
    },
    content: text.slice(m[0].length),
  };
}
