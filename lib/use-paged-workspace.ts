"use client";
import { useEffect, useRef, useState } from "react";

// Two management lists share debouncing and stale-response protection. No background prefetch.
export function usePagedWorkspace<T, F>(initial: T, filters: F, load: (filters: F) => Promise<T>) {
  const [data, setData] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const key = JSON.stringify(filters);
  const previous = useRef({ initial, key });
  useEffect(() => {
    if (previous.current.initial === initial && previous.current.key === key) return;
    previous.current = { initial, key };
    let current = true;
    setBusy(true);
    const timer = setTimeout(() => {
      load(JSON.parse(key) as F).then(value => {
        if (current) { setData(value); setError(""); }
      }).catch(reason => {
        if (current) setError(reason instanceof Error ? reason.message : "Unable to load this page.");
      }).finally(() => { if (current) setBusy(false); });
    }, 300);
    return () => { current = false; clearTimeout(timer); };
  }, [initial, key, load]);
  return { data, busy, error };
}
