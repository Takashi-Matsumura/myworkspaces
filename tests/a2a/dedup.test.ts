import { describe, expect, it } from "vitest";
import { hashContent } from "@/lib/a2a/dedup";

describe("A2A hashContent", () => {
  it("同じ入力は同じ hash", () => {
    expect(hashContent("hello")).toBe(hashContent("hello"));
  });

  it("異なる入力は異なる hash", () => {
    expect(hashContent("hello")).not.toBe(hashContent("hello "));
  });

  it("hex 64 文字の SHA-256", () => {
    const h = hashContent("foo");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it("空文字も hash できる", () => {
    expect(hashContent("")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("UTF-8 でエンコードされる (絵文字を含む文字列で安定)", () => {
    const a = hashContent("こんにちは🌸");
    const b = hashContent("こんにちは🌸");
    expect(a).toBe(b);
  });
});
