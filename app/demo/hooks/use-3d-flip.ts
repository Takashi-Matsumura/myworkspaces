"use client";

import { useCallback, useState, type Dispatch, type SetStateAction } from "react";

export function use3dFlip(initial = false): {
  flipped: boolean;
  setFlipped: Dispatch<SetStateAction<boolean>>;
  toggle: () => void;
} {
  const [flipped, setFlipped] = useState<boolean>(initial);
  const toggle = useCallback(() => setFlipped((f) => !f), []);
  return { flipped, setFlipped, toggle };
}
