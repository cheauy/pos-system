import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api, ApiError, type Scope } from './client';
import { Button, Label, SearchField, styles, useTheme } from './ui';
import { LoadingState, Shimmer } from './loading';
import { cache } from './data';

type Notice = { id: string; title: string; message: string; occurred_at: string; read: boolean };
export function Alerts({ scope, online, onUnread }: { scope: Scope; online: boolean; onUnread: (count: number) => void }) {
  const theme = useTheme();
  const { userId, businessId, branchId } = scope;
  const [search,setSearch] = useState(''), [query,setQuery] = useState('');
  useEffect(()=>{const timer=setTimeout(()=>setQuery(search.trim()),350);return()=>clearTimeout(timer);},[search]);
  const cacheKey=`${userId}:${businessId}:${branchId}:alerts?search=${query}`;
  const cached=cache.get(cacheKey)?.data as {rows:Notice[];total:number;unread:number}|undefined;
  const [rows, setRows] = useState<Notice[]>(()=>cached?.rows??[]), [hasMore, setHasMore] = useState(()=>!!cached&&cached.rows.length<cached.total), [unread, setUnread] = useState(()=>cached?.unread??0), [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(online&&!cached), [error, setError] = useState(''), [reading, setReading] = useState<string | null>(null);
  const page = useRef(cached?1:0), inFlight = useRef(false), request = useRef<AbortController | null>(null), readLock = useRef(false);
  const { markAllAlerts } = useLocalSearchParams<{ markAllAlerts?: string }>();
  useEffect(() => {
    if (!markAllAlerts || !online || loading || reading !== null) return;
    router.setParams({ markAllAlerts: '' });
    if (readLock.current || inFlight.current) return;
    readLock.current = true; setReading('all');
    void (async () => {
      try {
        const ids = new Set<string>();
        let total = 1;
        for (let next = 1; next <= total; next++) {
          const result = await api<{rows: Notice[]; total: number}>(`alerts?page=${next}&limit=15`, {userId,businessId,branchId});
          if (next === 1) total = Math.ceil(result.total / 15);
          result.rows.filter(row => !row.read).forEach(row => ids.add(row.id));
        }
        const selected = [...ids];
        for (let i = 0; i < selected.length; i += 25) await api('alerts', {userId,businessId,branchId}, {ids:selected.slice(i,i+25)});
      } catch (error) { theme.alert('Unable to mark all read', (error as Error).message); }
      finally { readLock.current = false; setReading(null); void load(true); }
    })();
  }, [markAllAlerts, online, loading, reading]);
  const load = useCallback(async (reset = false) => {
    if (!online || inFlight.current || readLock.current) return;
    inFlight.current = true; setLoading(true); setRefreshing(reset); setError('');
    const controller = new AbortController(); request.current = controller;
    const next = reset ? 1 : page.current + 1;
    try {
      const result = await api<{ rows: Notice[]; total: number; unread: number }>(`alerts?page=${next}&limit=15&search=${encodeURIComponent(query)}`, { userId, businessId, branchId }, undefined, controller.signal);
      if (controller.signal.aborted) return;
      if (reset) { if (!cache.has(cacheKey) && cache.size>=50) cache.delete(cache.keys().next().value!); cache.set(cacheKey,{data:result,at:Date.now()}); }
      setRows(previous => reset ? result.rows : [...new Map([...previous, ...result.rows].map(row => [row.id, row])).values()]);
      page.current = next; setHasMore(next * 15 < result.total); setUnread(result.unread); onUnread(result.unread);
    } catch (error) {
      if (!controller.signal.aborted) {
        if (error instanceof ApiError && [401, 403].includes(error.status)) { cache.delete(cacheKey); setRows([]); setHasMore(false); setUnread(0); onUnread(0); }
        setError((error as Error).message);
      }
    } finally { if (request.current === controller) { inFlight.current = false; setLoading(false); } }
  }, [online, userId, businessId, branchId, onUnread, query, cacheKey]);
  useEffect(()=>{const saved=cache.get(cacheKey)?.data as {rows:Notice[];total:number;unread:number}|undefined;setRows(saved?.rows??[]);setHasMore(!!saved&&saved.rows.length<saved.total);page.current=saved?1:0;},[cacheKey]);
  useEffect(() => {
    if (online) void load(true);
    const listener = AppState.addEventListener('change', state => { if (state === 'active') void load(true); });
    const timer=setInterval(()=>{if(AppState.currentState==='active')void load(true);},30000);
    return () => { clearInterval(timer); request.current?.abort(); request.current = null; inFlight.current = false; listener.remove(); };
  }, [load, online]);
  async function markRead(row: Notice) {
    if (!online || row.read || readLock.current || inFlight.current) return;
    readLock.current = true; setReading(row.id);
    try {
      await api('alerts', { businessId, branchId }, { ids: [row.id] });
      setRows(previous => previous.map(item => item.id === row.id ? { ...item, read: true } : item));
      const count = Math.max(0, unread - 1); setUnread(count); onUnread(count);
      const saved=cache.get(cacheKey);if(saved){const data=saved.data as {rows:Notice[];total:number;unread:number};cache.set(cacheKey,{data:{...data,unread:count,rows:data.rows.map(item=>item.id===row.id?{...item,read:true}:item)},at:Date.now()});}
    } catch (error) { theme.alert('Unable to save', (error as Error).message); }
    finally { readLock.current = false; setReading(null); }
  }
  return <View style={{ flex: 1 }}>
    <View style={{ padding: 20, paddingBottom: 8, gap: 14 }}>{reading === 'all' && <LoadingState label="Marking all read…"/>}<Label muted>Updates from your store, in one place.</Label><SearchField placeholder="Search alerts…" value={search} onChangeText={setSearch}/></View>
    <FlatList data={rows} keyExtractor={row => row.id} contentContainerStyle={styles.page} initialNumToRender={10} maxToRenderPerBatch={8} windowSize={5}
      refreshControl={<RefreshControl refreshing={online && loading && refreshing && rows.length > 0} onRefresh={() => void load(true)} enabled={online} tintColor="#275de8" />}
      onEndReached={() => { if (!loading && !error && hasMore) void load(); }} onEndReachedThreshold={0.4}
      ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
      renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={`${item.title}${item.read ? '' : ', unread, tap to mark as read'}`} disabled={item.read || !online || loading || reading !== null} onPress={() => void markRead(item)} style={({ pressed }) => ({ padding: 18, borderRadius: 20, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.panel, opacity: pressed ? 0.75 : 1 })}>
        <View style={[styles.row, { alignItems: 'flex-start',gap:12 }]}><View style={{ padding: 12, borderRadius: 14, backgroundColor: theme.dark?'#233047':/stock/i.test(item.title)?'#fff5e8':/approved/i.test(item.title)?'#eaf9f0':'#eef0ff' }}><Ionicons name={/stock/i.test(item.title)?'cube-outline':/approved/i.test(item.title)?'card-outline':/cancel/i.test(item.title)?'close-circle-outline':/expir/i.test(item.title)?'time-outline':'notifications-outline'} size={25} color={/stock/i.test(item.title)?'#dc7a22':/approved/i.test(item.title)?'#238060':/cancel/i.test(item.title)?'#dc4545':'#6876bd'} /></View>
          <View style={{ flex: 1, gap: 9 }}><View style={{flexDirection:'row',alignItems:'center',gap:6}}><Text style={{ flex:1,color: theme.text, fontSize: 16, fontWeight: '700' }}>{item.title}</Text>{!item.read&&<View accessibilityLabel="Unread" style={{width:7,height:7,borderRadius:4,backgroundColor:'#275de8'}}/>}</View><Label muted>{item.message}</Label><View style={{flexDirection:'row',alignItems:'center',gap:5}}><Ionicons name="time-outline" size={13} color={theme.muted}/><Text style={{ flex:1,fontSize: 11, color: theme.muted }}>{new Date(item.occurred_at).toLocaleString()}</Text></View>{reading === item.id && <LoadingState label="Saving…" />}</View>
        </View>
      </Pressable>}
      ListEmptyComponent={loading && online ? <Shimmer /> : <View style={{ alignItems: 'center', paddingVertical: 50, gap: 12 }}><Ionicons name="notifications-off-outline" size={42} color={theme.muted} /><Label large>{online ? query ? 'No matching alerts' : 'All caught up' : 'You are offline'}</Label><Label muted>{online ? query ? 'Try another search.' : 'New store updates will appear here.' : 'Connect to load your alerts.'}</Label></View>}
      ListFooterComponent={<>{error ? <View style={{ gap: 10 }}><Label>{error}</Label><Button title="Retry" secondary disabled={!online} onPress={() => void load(refreshing || page.current === 0)} /></View> : online && loading && rows.length > 0 ? <LoadingState label="Loading alerts…" /> : rows.length > 0 && !hasMore ? <View style={{ padding: 16, alignItems: 'center' }}><Label muted>You’re up to date</Label></View> : null}</>}
    />
  </View>;
}
