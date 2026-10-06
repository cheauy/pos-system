import "server-only";
import { cookies } from "next/headers";
import { mobileRequest } from "@/lib/mobile/request-context";

// React cache() memoizes only while rendering. Server Actions run outside render,
// so without this every action re-ran auth/business/branch/permission lookups for
// each caller. Memoize per request on the request's cookie store; the key includes
// every cookie value, the mobile request scope and the arguments, so a cookie
// written mid-request (session refresh, branch switch) is read again. Outside a
// request (scripts, tests without a cookie store) it simply calls through.
export function requestScoped<A extends unknown[], T>(load: (...args: A) => Promise<T>): (...args: A) => Promise<T> {
  const memo = new WeakMap<object, Map<string, Promise<T>>>();
  return async (...args: A) => {
    let store: Awaited<ReturnType<typeof cookies>>;
    try { store = await cookies(); } catch { return load(...args); }
    const key = `${store.toString()}|${JSON.stringify(mobileRequest.getStore() ?? null)}|${JSON.stringify(args)}`;
    let byKey = memo.get(store);
    if (!byKey) memo.set(store, byKey = new Map());
    let result = byKey.get(key);
    if (!result) { result = load(...args); byKey.set(key, result); }
    return result;
  };
}
