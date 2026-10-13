"use client";

import { useEffect, useRef } from "react";

// Match the scoped web layouts, including iPad Pro in either orientation.
export const MANAGEMENT_COMPACT_QUERY = "(max-width: 1279px), (max-width: 1366px) and (pointer: coarse)";

export function useManagementViewport<T extends HTMLElement>() {
  const root = useRef<T>(null);
  useEffect(() => {
    const node = root.current;
    const viewport = window.visualViewport;
    const compact = window.matchMedia(MANAGEMENT_COMPACT_QUERY);
    const update = () => {
      if (!node) return;
      if (compact.matches) {
        node.style.setProperty("--management-viewport-top", `${viewport?.offsetTop ?? 0}px`);
        node.style.setProperty("--management-viewport-height", `${viewport?.height ?? window.innerHeight}px`);
      } else {
        node.style.removeProperty("--management-viewport-top");
        node.style.removeProperty("--management-viewport-height");
      }
    };
    update();
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    compact.addEventListener("change", update);
    return () => {
      viewport?.removeEventListener("resize", update);
      viewport?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      compact.removeEventListener("change", update);
    };
  }, []);
  return root;
}
