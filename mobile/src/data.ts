import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { api, ApiError, type Scope } from './client';
import { offline } from './offline';
import { canSaveOffline } from './offline-snapshots';

export const cache = new Map<string, { data: unknown; at: number }>();
let cacheGeneration = 0;
const keyGenerations = new Map<string, number>();
const reads = new Map<string, { promise: Promise<unknown>; controller: AbortController; users: number }>();
const listeners = new Map<string, Set<() => void>>();
const cachedUsers = new Set<string>();
const freshFor = 30000;
export function clearCache(userId?: string) {
  cacheGeneration++; cache.clear(); keyGenerations.clear();
  for (const read of reads.values()) read.controller.abort();
  reads.clear();
  if (userId) cachedUsers.add(userId);
  for (const user of cachedUsers) void offline.clear(user, !userId).catch(() => undefined);
  cachedUsers.clear();
}
export function invalidateCache(scope: Scope, paths: string[]) {
  const prefix = `${scope.userId}:${scope.businessId}:${scope.branchId}:`;
  for (const key of new Set([...cache.keys(), ...reads.keys(), ...listeners.keys()])) {
    if (!key.startsWith(prefix) || !paths.some(path => key.slice(prefix.length).startsWith(path))) continue;
    cache.delete(key);
    keyGenerations.set(key, (keyGenerations.get(key) ?? 0) + 1);
    reads.get(key)?.controller.abort(); reads.delete(key);
    if (scope.userId && canSaveOffline(key.slice(prefix.length))) void offline.remove(scope.userId, key).catch(() => undefined);
    listeners.get(key)?.forEach(refresh => refresh());
  }
}
function onInvalidated(key: string, refresh: () => void) {
  const subscribers = listeners.get(key) ?? new Set<() => void>();
  subscribers.add(refresh); listeners.set(key, subscribers);
  return () => { subscribers.delete(refresh); if (!subscribers.size) listeners.delete(key); };
}
function sharedRead<T>(key: string, path: string, scope: Scope) {
  let read = reads.get(key);
  if (!read) {
    const controller = new AbortController();
    const promise = api<T>(path, scope, undefined, controller.signal);
    read = { promise, controller, users: 0 };
    reads.set(key, read);
    void promise.then(() => { if (reads.get(key) === read) reads.delete(key); }, () => { if (reads.get(key) === read) reads.delete(key); });
  }
  read.users++;
  const current = read;
  return { promise: read.promise as Promise<T>, release: () => { if (--current.users === 0 && reads.get(key) === current) { reads.delete(key); current.controller.abort(); } } };
}
export function useData<T>(path: string, scope: Scope, online: boolean) {
  const { userId, businessId, branchId } = scope;
  const key = `${scope.userId}:${scope.businessId}:${scope.branchId}:${path}`;
  const [state, setState] = useState<{ key: string; data?: T; error?: string; denied?: boolean; loading: boolean; at?: number }>(() => { const saved = cache.get(key); return { key, data: saved?.data as T | undefined, at: saved?.at, loading: online && !saved }; });
  const [version, setVersion] = useState(0);
  const lastRequest = useRef({ key, version });
  const fetching = useRef(false);
  const refresh = useCallback(() => setVersion(value => value + 1), []);
  useEffect(() => onInvalidated(key, refresh), [key, refresh]);
  useEffect(() => {
    const revalidate = () => {
      const saved = cache.get(key);
      if (online && !fetching.current && AppState.currentState === 'active' && (!saved || Date.now() - saved.at >= freshFor)) refresh();
    };
    const listener = AppState.addEventListener('change', value => { if (value === 'active') revalidate(); });
    // Only operational lists need polling. Settings/forms refresh on entry, resume or save.
    const live = ['incoming', 'orders', 'stock', 'register'].includes(path.split('?')[0]);
    const timer = online && live ? setInterval(revalidate, freshFor) : undefined;
    return () => { listener.remove(); clearInterval(timer); };
  }, [refresh, online, key, path]);
  useEffect(() => {
    const saved = cache.get(key);
    const generation = cacheGeneration;
    const keyGeneration = keyGenerations.get(key) ?? 0;
    const forced = lastRequest.current.key === key && lastRequest.current.version !== version;
    lastRequest.current = { key, version };
    const fresh = Boolean(online && !forced && saved && Date.now() - saved.at < freshFor);
    // Synchronize the visible snapshot with the external cache and network request.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState(previous => ({ key, data: saved?.data as T | undefined ?? (previous.key === key && !previous.denied ? previous.data : undefined), at: saved?.at ?? (previous.key === key ? previous.at : undefined), loading: online && !fresh }));
    let current = true;
    if (userId) cachedUsers.add(userId);
    if (fresh) return () => { current = false; };
    if (!online) {
      if (!saved && userId && canSaveOffline(path)) void offline.read(userId, key).then(snapshot => {
        if (current && generation === cacheGeneration && snapshot) setState({ key, data: snapshot.data as T, at: snapshot.at, loading: false });
      }).catch(() => { if (current) setState({ key, loading: false, error: 'Saved offline data is unavailable.' }); });
      return () => { current = false; };
    }
    fetching.current = true;
    const read = sharedRead<T>(key, path, { userId, businessId, branchId });
    read.promise.then(data => {
      if (!current || generation !== cacheGeneration || keyGeneration !== (keyGenerations.get(key) ?? 0)) return;
      const at = Date.now();
      const same = saved && JSON.stringify(saved.data) === JSON.stringify(data);
      if (same) data = saved.data as T;
      cache.delete(key);
      if (cache.size >= 50) cache.delete(cache.keys().next().value!);
      cache.set(key, { data, at });
      if (userId && canSaveOffline(path)) void offline.save(userId, key, data).catch(() => undefined);
      setState({ key, data, at, loading: false });
    }).catch(error => {
      if (!current || generation !== cacheGeneration || keyGeneration !== (keyGenerations.get(key) ?? 0)) return;
      const denied = error instanceof ApiError && [401, 403].includes(error.status);
      if (denied) { cache.delete(key); if (userId) void offline.clear(userId).catch(() => undefined); }
      setState(previous => ({ key, denied, data: denied ? undefined : saved?.data as T | undefined ?? (previous.key === key ? previous.data : undefined), at: denied ? undefined : saved?.at ?? (previous.key === key ? previous.at : undefined), loading: false, error: error.message }));
    }).finally(() => { if (current) fetching.current = false; });
    return () => { current = false; fetching.current = false; read.release(); };
  }, [key, online, version, path, userId, businessId, branchId]);
  return { ...(state.key === key ? state : { data: undefined, error: undefined, denied: false, at: undefined, loading: online }), refresh };
}


export function useInfiniteData<T extends {rows:{id:string}[];total:number}>(path:string,scope:Scope,online:boolean){
 const pageSize=path.startsWith('account-categories?')?10:15;
 const key=`${scope.userId}:${scope.businessId}:${scope.branchId}:${path}`;
 const [request,setRequest]=useState({key,page:1});
 const page=request.key===key?request.page:1;
 const source=useData<T>(`${path}&limit=${pageSize}&page=${page}`,scope,online);
 const [saved,setSaved]=useState<{key:string;pages:Record<number,T>}>({key,pages:{}});
 const waiting=useRef(false);
 const resetting=useRef(false);
 useEffect(()=>onInvalidated(`${key}&limit=${pageSize}&page=1`,()=>{resetting.current=true;waiting.current=true;setRequest({key,page:1});}),[key,pageSize]);
 useEffect(()=>{waiting.current=false;resetting.current=false;setRequest({key,page:1});setSaved({key,pages:{}});},[key]);
 useEffect(()=>{
  if(!source.loading)waiting.current=false;
  if(source.denied){setSaved({key,pages:{}});return;}
  if(resetting.current&&source.loading)return;
  if(source.data&&!source.error){
   const replace=resetting.current;resetting.current=false;
   setSaved(previous=>({key,pages:{...(!replace&&previous.key===key?previous.pages:{}),[page]:source.data!}}));
  }
 },[key,page,source.data,source.loading,source.error,source.denied]);
 const pages=saved.key===key&&!source.denied?saved.pages:{};
 const latest=pages[page];
 const rows=[...new Map(Object.keys(pages).map(Number).sort((a,b)=>a-b).flatMap(number=>pages[number].rows).map(row=>[row.id,row])).values()];
 const data=latest?{...latest,rows} as T:pages[1]?{...pages[1],rows} as T:undefined;
 const hasMore=!!latest&&latest.rows.length>0&&page*pageSize<latest.total;
 function more(){if(waiting.current||source.loading||source.error||!online||!hasMore)return;waiting.current=true;setRequest({key,page:page+1});}
 function refresh(){waiting.current=true;resetting.current=true;setRequest({key,page:1});source.refresh();}
 return {data,error:source.error,loading:source.loading&&(!data||!pages[page]),refreshing:source.loading&&resetting.current,hasMore,more,refresh};
}

