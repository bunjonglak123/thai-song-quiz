"use client";

import { useSyncExternalStore } from "react";

const noop = () => () => {};

/** false during server render and hydration, true afterwards. */
export function useMounted() {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}
