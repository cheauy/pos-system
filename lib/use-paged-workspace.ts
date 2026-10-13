"use client";
import { useEffect, useRef, useState } from "react";

// Two management lists share debouncing and stale-response protection. No background prefetch.
// Only typing in `textField` is debounced; discrete filter and page clicks load at once.
export function usePagedWorkspace<T, F>(initial: T, filters: F, load: (filters: F) => Promise<T>, textField?: keyof F) {
  const [data, setData] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const key = JSON.stringify(filters);
  // The server renders the default filters; a refreshed `initial` for them needs no second request.
  const defaultKey = useRef(key);
  const previous = useRef({ initial, key, filters, revision });
  useEffect(() => {
    if (previous.current.initial === initial && previous.current.key === key && previous.current.revision === revision) return;
    const nextFilters = JSON.parse(key) as F;
    const typed = textField !== undefined && previous.current.filters[textField] !== nextFilters[textField];
    const refreshed = previous.current.initial !== initial;
    previous.current = { initial, key, filters: nextFilters, revision };
    let current = true;
    if (refreshed && key === defaultKey.current) {
      setData(initial); setError(""); setBusy(false);
      return;
    }
    setBusy(true); setError("");
    const timer = setTimeout(() => {
      load(JSON.parse(key) as F).then(value => {
        if (current) { setData(value); setError(""); }
      }).catch(reason => {
        if (current) setError(reason instanceof Error ? reason.message : "Unable to load this page.");
      }).finally(() => { if (current) setBusy(false); });
    }, typed ? 300 : 0);
    return () => { current = false; clearTimeout(timer); };
  }, [initial, key, load, textField, revision]);
  return { data, busy, error, retry: () => setRevision(value => value + 1) };
}
