import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { api, ApiError, type Scope } from './client';
import { offline } from './offline';
import { canSaveOffline } from './offline-snapshots';

export const cache = new Map<string, { data: unknown; at: number }>();
let cacheGeneration = 0;
const cachedUsers = new Set<string>();
export function clearCache(userId?: string) {
  cacheGeneration++; cache.clear();
  if (userId) cachedUsers.add(userId);
  for (const user of cachedUsers) void offline.clear(user, !userId).catch(() => undefined);
  cachedUsers.clear();
}
export function useData<T>(path: string, scope: Scope, online: boolean) {
  const { userId, businessId, branchId } = scope;
  const key = `${scope.userId}:${scope.businessId}:${scope.branchId}:${path}`;
  const [state, setState] = useState<{ key: string; data?: T; error?: string; denied?: boolean; loading: boolean; at?: number }>(() => { const saved = cache.get(key); return { key, data: saved?.data as T | undefined, at: saved?.at, loading: online }; });
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion(value => value + 1), []);
  useEffect(() => {
    const listener = AppState.addEventListener('change', value => { if (value === 'active') refresh(); });
    const timer = online ? setInterval(() => { if (AppState.currentState === 'active') refresh(); }, 30000) : undefined;
    return () => { listener.remove(); clearInterval(timer); };
  }, [refresh, online]);
  useEffect(() => {
    const saved = cache.get(key);
    const generation = cacheGeneration;
    const fresh = Boolean(online && version === 0 && saved && Date.now() - saved.at < 8000);
    // Synchronize the visible snapshot with the external cache and network request.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState({ key, data: saved?.data as T | undefined, at: saved?.at, loading: online && !fresh });
    let current = true;
    const controller = new AbortController();
    if (userId) cachedUsers.add(userId);
    if (fresh) return () => { current = false; };
    if (!online) {
      if (!saved && userId && canSaveOffline(path)) void offline.read(userId, key).then(snapshot => {
        if (current && generation === cacheGeneration && snapshot) setState({ key, data: snapshot.data as T, at: snapshot.at, loading: false });
      }).catch(() => { if (current) setState({ key, loading: false, error: 'Saved offline data is unavailable.' }); });
      return () => { current = false; };
    }
    api<T>(path, { userId, businessId, branchId }, undefined, controller.signal).then(data => {
      if (!current || generation !== cacheGeneration) return;
      const at = Date.now();
      const same = saved && JSON.stringify(saved.data) === JSON.stringify(data);
      if (same) data = saved.data as T;
      if (cache.size > 50) cache.clear();
      cache.set(key, { data, at });
      if (userId && canSaveOffline(path)) void offline.save(userId, key, data).catch(() => undefined);
      setState({ key, data, at, loading: false });
    }).catch(error => {
      if (!current) return;
      const denied = error instanceof ApiError && [401, 403].includes(error.status);
      if (denied) { cache.delete(key); if (userId) void offline.clear(userId).catch(() => undefined); }
      setState({ key, denied, data: denied ? undefined : saved?.data as T | undefined, at: denied ? undefined : saved?.at, loading: false, error: error.message });
    });
    return () => { current = false; controller.abort(); };
  }, [key, online, version, path, userId, businessId, branchId]);
  return { ...(state.key === key ? state : { data: undefined, error: undefined, denied: false, at: undefined, loading: online }), refresh };
}


export function useInfiniteData<T extends {rows:{id:string}[];total:number}>(path:string,scope:Scope,online:boolean){
 const key=`${scope.userId}:${scope.businessId}:${scope.branchId}:${path}`;
 const [request,setRequest]=useState({key,page:1});
 const page=request.key===key?request.page:1;
 const source=useData<T>(`${path}&limit=10&page=${page}`,scope,online);
 const [saved,setSaved]=useState<{key:string;pages:Record<number,T>}>({key,pages:{}});
 const waiting=useRef(false);
 useEffect(()=>{waiting.current=false;setRequest({key,page:1});setSaved({key,pages:{}});},[key]);
 useEffect(()=>{
  if(source.loading)return;
  waiting.current=false;
  if(source.denied){setSaved({key,pages:{}});return;}
  if(source.data&&!source.error)setSaved(previous=>({key,pages:{...(previous.key===key?previous.pages:{}),[page]:source.data!}}));
 },[key,page,source.data,source.loading,source.error,source.denied]);
 const pages=saved.key===key&&!source.denied?saved.pages:{};
 const latest=pages[page];
 const rows=[...new Map(Object.keys(pages).map(Number).sort((a,b)=>a-b).flatMap(number=>pages[number].rows).map(row=>[row.id,row])).values()];
 const data=latest?{...latest,rows} as T:pages[1]?{...pages[1],rows} as T:undefined;
 const hasMore=!!latest&&latest.rows.length>0&&page*10<latest.total;
 function more(){if(waiting.current||source.loading||source.error||!online||!hasMore)return;waiting.current=true;setRequest({key,page:page+1});}
 function refresh(){waiting.current=true;setSaved({key,pages:{}});setRequest({key,page:1});source.refresh();}
 return {data,error:source.error,loading:source.loading,hasMore,more,refresh};
}

