"use client";
import { useEffect, useRef, useState } from "react";

// Two management lists share debouncing and stale-response protection. No background prefetch.
// Only typing in `textField` is debounced; discrete filter and page clicks load at once.
export function usePagedWorkspace<T, F>(initial: T, filters: F, load: (filters: F) => Promise<T>, textField?: keyof F) {
  const [data, setData] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const key = JSON.stringify(filters);
  // The server renders the default filters; a refreshed `initial` for them needs no second request.
  const defaultKey = useRef(key);
  const previous = useRef({ initial, key, filters });
  useEffect(() => {
    if (previous.current.initial === initial && previous.current.key === key) return;
    const typed = textField !== undefined && previous.current.filters[textField] !== filters[textField];
    const refreshed = previous.current.initial !== initial;
    previous.current = { initial, key, filters };
    let current = true;
    if (refreshed && key === defaultKey.current) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- adopt the server's fresh default page
      setData(initial); setError(""); setBusy(false);
      return;
    }
    setBusy(true);
    const timer = setTimeout(() => {
      load(JSON.parse(key) as F).then(value => {
        if (current) { setData(value); setError(""); }
      }).catch(reason => {
        if (current) setError(reason instanceof Error ? reason.message : "Unable to load this page.");
      }).finally(() => { if (current) setBusy(false); });
    }, typed ? 300 : 0);
    return () => { current = false; clearTimeout(timer); };
  }, [initial, key, load, filters, textField]);
  return { data, busy, error };
}
