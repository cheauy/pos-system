import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api, ApiError, type Scope } from './client';
import { Badge, Button, Label, styles, useTheme } from './ui';
import { LoadingState, Shimmer } from './loading';

type Notice = { id: string; title: string; message: string; occurred_at: string; read: boolean };
export function Alerts({ scope, online, onUnread }: { scope: Scope; online: boolean; onUnread: (count: number) => void }) {
  const theme = useTheme();
  const [rows, setRows] = useState<Notice[]>([]), [hasMore, setHasMore] = useState(false), [unread, setUnread] = useState(0), [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(online), [error, setError] = useState(''), [reading, setReading] = useState<string | null>(null);
  const page = useRef(0), inFlight = useRef(false), request = useRef<AbortController | null>(null), readLock = useRef(false);
  const { userId, businessId, branchId } = scope;
  const load = useCallback(async (reset = false) => {
    if (!online || inFlight.current || readLock.current) return;
    inFlight.current = true; setLoading(true); setRefreshing(reset); setError('');
    const controller = new AbortController(); request.current = controller;
    const next = reset ? 1 : page.current + 1;
    try {
      const result = await api<{ rows: Notice[]; total: number; unread: number }>(`alerts?page=${next}`, { userId, businessId, branchId }, undefined, controller.signal);
      if (controller.signal.aborted) return;
      setRows(previous => reset ? result.rows : [...new Map([...previous, ...result.rows].map(row => [row.id, row])).values()]);
      page.current = next; setHasMore(next * 25 < result.total); setUnread(result.unread); onUnread(result.unread);
    } catch (error) {
      if (!controller.signal.aborted) {
        if (error instanceof ApiError && [401, 403].includes(error.status)) { setRows([]); setHasMore(false); setUnread(0); onUnread(0); }
        setError((error as Error).message);
      }
    } finally { if (request.current === controller) { inFlight.current = false; setLoading(false); } }
  }, [online, userId, businessId, branchId, onUnread]);
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
    } catch (error) { theme.alert('Unable to save', (error as Error).message); }
    finally { readLock.current = false; setReading(null); }
  }
  return <View style={{ flex: 1 }}>
    <View style={{ padding: 20, paddingBottom: 8, gap: 8 }}><Badge title={`${unread} ${theme.t('unread')}`} positive={unread > 0} /><Label muted>Updates from your store, in one place.</Label></View>
    <FlatList data={rows} keyExtractor={row => row.id} contentContainerStyle={styles.page} initialNumToRender={10} maxToRenderPerBatch={8} windowSize={5}
      refreshControl={<RefreshControl refreshing={online && loading && refreshing && rows.length > 0} onRefresh={() => void load(true)} enabled={online} tintColor="#275de8" />}
      onEndReached={() => { if (!loading && !error && hasMore) void load(); }} onEndReachedThreshold={0.4}
      ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
      renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={`${item.title}${item.read ? '' : ', unread, tap to mark as read'}`} disabled={item.read || !online || loading || reading !== null} onPress={() => void markRead(item)} style={({ pressed }) => ({ padding: 16, borderRadius: 18, borderWidth: 1, borderColor: item.read ? theme.border : theme.dark ? '#365180' : '#d4e2ff', backgroundColor: item.read ? theme.panel : theme.dark ? '#1b2c48' : '#f0f5ff', opacity: pressed ? 0.75 : 1 })}>
        <View style={[styles.row, { alignItems: 'flex-start' }]}><View style={{ padding: 11, borderRadius: 14, backgroundColor: theme.panel }}><Ionicons name={item.read ? 'notifications-outline' : 'notifications'} size={20} color={item.read ? theme.muted : '#5987ed'} /></View>
          <View style={{ flex: 1, gap: 7 }}><Text style={{ color: theme.text, fontSize: 15, fontWeight: item.read ? '500' : '700' }}>{item.title}</Text><Label muted>{item.message}</Label><Text style={{ fontSize: 11, color: theme.muted }}>{new Date(item.occurred_at).toLocaleString()}</Text>{reading === item.id ? <LoadingState label="Saving…" /> : !item.read && <Text style={{ color: theme.dark ? '#91b4ff' : '#275de8', fontSize: 12 }}>{theme.t('Tap to mark as read')}</Text>}</View>
        </View>
      </Pressable>}
      ListEmptyComponent={loading && online ? <Shimmer /> : <View style={{ alignItems: 'center', paddingVertical: 50, gap: 12 }}><Ionicons name="notifications-off-outline" size={42} color={theme.muted} /><Label large>{online ? 'All caught up' : 'You are offline'}</Label><Label muted>{online ? 'New store updates will appear here.' : 'Connect to load your alerts.'}</Label></View>}
      ListFooterComponent={<>{error ? <View style={{ gap: 10 }}><Label>{error}</Label><Button title="Retry" secondary disabled={!online} onPress={() => void load(refreshing || page.current === 0)} /></View> : online && loading && rows.length > 0 ? <LoadingState label="Loading alerts…" /> : rows.length > 0 && !hasMore ? <View style={{ padding: 16, alignItems: 'center' }}><Label muted>You’re up to date</Label></View> : null}</>}
    />
  </View>;
}
