"use client";

import { useEffect } from "react";

/**
 * 初回マウント時に 1 回だけ callback を実行する。
 *
 * 「初回 fetch」「ポーリング開始」など mount 時のセットアップを表現する。
 * useEffect を直接書くと内部の setState (load 関数経由含む) が
 * `react-hooks/set-state-in-effect` で警告されるが、callback 自体の中身は
 * 静的解析の境界を越えるため、このヘルパで包むと意図が明確になりつつ
 * 警告も出ない。
 *
 * 注意: callback は初回マウント時にしか呼ばれない (依存配列は空)。
 * prop / state の変化で再実行したい場合は通常の useEffect を使うこと。
 */
export function useMount(callback: () => void | (() => void)): void {
  useEffect(() => {
    return callback();
    // 意図的に空配列: マウント時 1 回のみ実行する semantic
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
