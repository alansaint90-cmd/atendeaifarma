"use client";
import { useSyncExternalStore } from "react";
const subscribe = () => () => {};
/** Preserva o HTML inicial antes de acessar dados do navegador. */
export function useHydrated() {
  return useSyncExternalStore(subscribe, () => true, () => false);
}
