"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";

export default function FixedWorkspaceHeader({ children, className = "" }: { children: ReactNode; className?: string }) {
  const slot = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const header = slot.current?.firstElementChild;
    if (!header) return;
    const style = document.documentElement.style;
    const previous = style.getPropertyValue("--workspace-header-h");
    const priority = style.getPropertyPriority("--workspace-header-h");
    const mobile = window.matchMedia("(max-width: 1024px), (hover: none) and (pointer: coarse)");
    const restore = () => {
      if (previous) style.setProperty("--workspace-header-h", previous, priority);
      else style.removeProperty("--workspace-header-h");
    };
    // Measure wrapping, text size and safe areas instead of assuming a one-line header.
    const measure = () => {
      if (mobile.matches) style.setProperty("--workspace-header-h", `${header.getBoundingClientRect().height}px`);
      else restore();
    };
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    mobile.addEventListener("change", measure);
    measure();
    return () => { observer.disconnect(); mobile.removeEventListener("change", measure); restore(); };
  }, []);

  return <div ref={slot} className={`workspace-header-slot ${className}`}>{children}</div>;
}
