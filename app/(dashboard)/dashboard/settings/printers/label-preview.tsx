"use client";

import { useEffect, useRef, type ReactNode } from "react";
import styles from "./label-settings-responsive.module.css";

// Scale only the settings preview; the label renderer keeps its physical dimensions.
export default function LabelPreview({ children }: { children: ReactNode }) {
  const frame = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const outer = frame.current, inner = content.current;
    if (!outer || !inner) return;
    const fit = () => {
      const scale = outer.clientWidth ? Math.min(1, outer.clientWidth / inner.offsetWidth) : 1;
      outer.style.setProperty("--label-preview-scale", String(scale));
      outer.style.setProperty("--label-preview-height", `${inner.offsetHeight * scale}px`);
    };
    const observer = new ResizeObserver(fit);
    observer.observe(outer); observer.observe(inner); fit();
    return () => observer.disconnect();
  }, []);
  return <div ref={frame} className={styles.previewFrame}><div ref={content} className={styles.previewContent}>{children}</div></div>;
}
