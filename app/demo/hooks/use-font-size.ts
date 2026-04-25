"use client";

import { useCallback, useState, type Dispatch, type SetStateAction } from "react";

type FontSizeOptions = {
  default: number;
  min: number;
  max: number;
};

export function useFontSize(
  storageKey: string,
  opts: FontSizeOptions,
): {
  fontSize: number;
  setFontSize: Dispatch<SetStateAction<number>>;
  changeFontSize: (delta: number) => void;
} {
  const [fontSize, setFontSize] = useState<number>(() => {
    if (typeof window === "undefined") return opts.default;
    const saved = window.localStorage.getItem(storageKey);
    if (!saved) return opts.default;
    const n = Number(saved);
    if (!Number.isFinite(n)) return opts.default;
    return Math.min(opts.max, Math.max(opts.min, n));
  });

  const changeFontSize = useCallback(
    (delta: number) => {
      setFontSize((prev) => {
        const next = Math.min(opts.max, Math.max(opts.min, prev + delta));
        if (typeof window !== "undefined") {
          window.localStorage.setItem(storageKey, String(next));
        }
        return next;
      });
    },
    [storageKey, opts.min, opts.max],
  );

  return { fontSize, setFontSize, changeFontSize };
}
