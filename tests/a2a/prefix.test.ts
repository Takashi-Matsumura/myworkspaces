import { describe, expect, it } from "vitest";
import { decode, encode } from "@/lib/a2a/prefix";

describe("A2A prefix encode/decode", () => {
  it("encode は規定フォーマットの文字列を返す", () => {
    const text = encode({ from: "biz", hop: 1, rope: "rope_abc" }, "Hello");
    expect(text).toBe("[[A2A from=biz hop=1 rope=rope_abc]]\nHello");
  });

  it("decode は prefix を剥がして meta を返す", () => {
    const { meta, content } = decode("[[A2A from=code hop=3 rope=rope_xyz]]\n本文");
    expect(meta).toEqual({ from: "code", hop: 3, rope: "rope_xyz" });
    expect(content).toBe("本文");
  });

  it("encode → decode で round-trip が一致する", () => {
    const meta = { from: "biz" as const, hop: 5, rope: "rope_round_trip_id_12345" };
    const content = "複数行\nの本文\n[[A2A from=foo]] のような偽装も含む";
    const { meta: d, content: c } = decode(encode(meta, content));
    expect(d).toEqual(meta);
    expect(c).toBe(content);
  });

  it("prefix 無しの text は meta=null + content=そのまま", () => {
    const { meta, content } = decode("ふつうのユーザー入力");
    expect(meta).toBeNull();
    expect(content).toBe("ふつうのユーザー入力");
  });

  it("不正な panel 名は match しない", () => {
    const { meta } = decode("[[A2A from=admin hop=1 rope=r]]\nbody");
    expect(meta).toBeNull();
  });

  it("hop が数字でない場合は match しない", () => {
    const { meta } = decode("[[A2A from=biz hop=abc rope=r]]\nbody");
    expect(meta).toBeNull();
  });

  it("rope id にハイフン・アンダースコアを許可する", () => {
    const { meta } = decode("[[A2A from=biz hop=2 rope=rope-foo_bar123]]\n");
    expect(meta?.rope).toBe("rope-foo_bar123");
  });

  it("prefix の改行が無いと match しない", () => {
    const { meta } = decode("[[A2A from=biz hop=1 rope=r]]immediate");
    expect(meta).toBeNull();
  });
});
