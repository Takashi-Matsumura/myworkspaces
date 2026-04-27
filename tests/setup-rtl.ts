// Phase F-F: jsdom + React Testing Library のセットアップ。
//
// - @testing-library/jest-dom の matcher を vitest の expect に登録
// - 各テスト後に DOM をクリーンアップ (useEffect cleanup の検証用)

import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
});
