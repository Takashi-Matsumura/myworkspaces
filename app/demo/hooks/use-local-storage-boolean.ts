"use client";

import { useCallback, useState, type Dispatch, type SetStateAction } from "react";

// "1" / "0" でストレージ。既存 floating-workspace の showHidden と完全互換。
export function useLocalStorageBoolean(
  storageKey: string,
  defaultValue: boolean,
): {
  value: boolean;
  setValue: Dispatch<SetStateAction<boolean>>;
  toggle: () => void;
} {
  const [value, setValueState] = useState<boolean>(() => {
    if (typeof window === "undefined") return defaultValue;
    const raw = window.localStorage.getItem(storageKey);
    if (raw === null) return defaultValue;
    return raw === "1";
  });

  const setValue: Dispatch<SetStateAction<boolean>> = useCallback(
    (next) => {
      setValueState((prev) => {
        const resolved = typeof next === "function" ? (next as (p: boolean) => boolean)(prev) : next;
        if (typeof window !== "undefined") {
          window.localStorage.setItem(storageKey, resolved ? "1" : "0");
        }
        return resolved;
      });
    },
    [storageKey],
  );

  const toggle = useCallback(() => setValue((p) => !p), [setValue]);

  return { value, setValue, toggle };
}
