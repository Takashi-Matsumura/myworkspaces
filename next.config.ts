import type { NextConfig } from "next";

// Next.js 16 + React 19 + @excalidraw/excalidraw@0.18 の組み合わせで Strict Mode 有効時に
// Excalidraw のデスクトップ UI (.layer-ui__wrapper) が描画されないため、無効化する。
const nextConfig: NextConfig = {
  reactStrictMode: false,
};

export default nextConfig;
