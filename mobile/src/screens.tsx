import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, FlatList, Image, Linking, Modal, Pressable, RefreshControl, ScrollView, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { api, ApiError, money, type Order, type Scope, type Workspace } from './client';
import { Button, Card, Field, Label, styles, useTheme } from './ui';
import { EntryForm } from './entry-form';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { AdjustStock } from './adjust-stock';
import { ReturnOrder } from './return-order';
import { PurchaseOrder } from './purchase-order';
import { offline } from './offline';
import { canSaveOffline } from './offline-snapshots';
import { ManagementForm } from './management';
import { Donut, SalesChart } from './charts';

type Row = { id: string; [key: string]: unknown };
type Page = { rows: Row[]; total: number; unread?: number; receiveAll?: boolean; categories?: string[]; currency?: string; metrics?: { yesterday: number; pending: number; completed: number } };
const cache = new Map<string, { data: unknown; at: number }>();
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
  const [state, setState] = useState<{ key: string; data?: T; error?: string; loading: boolean; at?: number }>({ key, loading: online });
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion(value => value + 1), []);
  useEffect(() => {
    const listener = AppState.addEventListener('change', value => { if (value === 'active') refresh(); });
    const timer = online ? setInterval(() => { if (AppState.currentState === 'active') refresh(); }, 15000) : undefined;
    return () => { listener.remove(); clearInterval(timer); };
  }, [refresh, online]);
  useEffect(() => {
    const saved = cache.get(key);
    const generation = cacheGeneration;
    // Synchronize the visible snapshot with the external cache and network request.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState({ key, data: saved?.data as T | undefined, at: saved?.at, loading: online });
    let current = true;
    const controller = new AbortController();
    if (userId) cachedUsers.add(userId);
    if (!online) {
      if (!saved && userId && canSaveOffline(path)) void offline.read(userId, key).then(snapshot => {
        if (current && generation === cacheGeneration && snapshot) setState({ key, data: snapshot.data as T, at: snapshot.at, loading: false });
      }).catch(() => { if (current) setState({ key, loading: false, error: 'Saved offline data is unavailable.' }); });
      return () => { current = false; };
    }
    api<T>(path, { userId, businessId, branchId }, undefined, controller.signal).then(data => {
      if (!current || generation !== cacheGeneration) return;
      const at = Date.now();
      if (cache.size > 50) cache.clear();
      cache.set(key, { data, at });
      if (userId && canSaveOffline(path)) void offline.save(userId, key, data).catch(() => undefined);
      setState({ key, data, at, loading: false });
    }).catch(error => {
      if (!current) return;
      const denied = error instanceof ApiError && [401, 403].includes(error.status);
      if (denied) { cache.delete(key); if (userId) void offline.clear(userId).catch(() => undefined); }
      setState({ key, data: denied ? undefined : saved?.data as T | undefined, at: denied ? undefined : saved?.at, loading: false, error: error.message });
    });
    return () => { current = false; controller.abort(); };
  }, [key, online, version, path, userId, businessId, branchId]);
  return { ...(state.key === key ? state : { data: undefined, error: undefined, at: undefined, loading: online }), refresh };
}

export function Home({ workspace, online, go }: { workspace: Workspace; online: boolean; go: (page: string) => void }) {
  const scope = { userId: workspace.userId, businessId: workspace.business.id, branchId: workspace.branchId };
  return <ScrollView contentContainerStyle={styles.page}>
    <View style={{ backgroundColor: '#275de8', padding: 24, borderRadius: 22, gap: 8 }}>
      <Text style={{ color: '#d7e4ff', fontSize: 13 }}>TENH POS · MOBILE</Text>
      <Text style={{ color: '#fff', fontSize: 26, fontWeight: '700' }}>{workspace.business.name}</Text>
      <Text style={{ color: '#d7e4ff', fontSize: 15 }}>{workspace.branches.find(branch => branch.id === workspace.branchId)?.name} · {workspace.business.role}</Text>
    </View>
    {workspace.permissions.includes('orders.view') && <Overview scope={scope} online={online} />}
    {workspace.permissions.includes('reports.view') && <DashboardCharts scope={scope} online={online}/>}
    <Label large>Quick actions</Label>
    {([['POS', 'pos.access'], ['Orders', 'orders.view'], ['Online Orders', 'orders.view'], ['Stock', 'inventory.view'], ['Customers', 'customers.view'], ['Expenses', 'expenses.manage'], ['Register', 'register.manage']] as const)
      .filter(([, permission]) => workspace.permissions.includes(permission)).map(([name]) => <Button key={name} title={name} onPress={() => go(name)} secondary />)}
    <Card><Label>Subscription</Label><Label muted>{workspace.business.subscriptionStatus}</Label>
      <Label muted>{workspace.business.expiresAt ? `Expires ${new Date(workspace.business.expiresAt).toLocaleDateString()}` : 'No expiry supplied'}</Label>
    </Card>
  </ScrollView>;
}
function Overview({ scope, online }: { scope: Scope; online: boolean }) {
  const { data, loading, error, refresh } = useData<Page>('orders', scope, online);
  return <Card><Label large>Orders overview</Label>{loading && <ActivityIndicator />}
    {error && <Label>{error}</Label>}
    {data?.metrics && <><Label>{`Orders yesterday · ${data.metrics.yesterday}`}</Label><Label>{`Pending orders · ${data.metrics.pending}`}</Label><Label>{`Completed sales · ${money(data.metrics.completed, data.currency)}`}</Label><Label muted>Completed sales include all dates.</Label></>}
    <Button title="Refresh" secondary disabled={!online || loading} onPress={refresh} />
  </Card>;
}

type Report = {
  currency: string; from: string; to: string; orders: number; revenue: number; cost: number;
  expenses: number; grossProfit: number; netProfit: number;
  products: { name: string; quantity: number }[];
  payments: { name: string; value: number }[];
  days: { date: string; value: number;profit?:number }[];
  sources: {name:string;value:number}[];
  staff: { id: string; name: string; orders: number; sales: number; refunds: number; units: number; cancelled: number }[];
};
export function Reports({ workspace, online }: { workspace: Workspace; online: boolean }) {
  const theme = useTheme();
  const [range, setRange] = useState('yesterday');
  const scope = { userId: workspace.userId, businessId: workspace.business.id, branchId: workspace.branchId };
  const { data, loading, error, refresh } = useData<Report>(`reports?range=${range}`, scope, online);
  const amount = (value: number) => money(value, data?.currency);
  const maxUnits = Math.max(1, ...data?.products.map(product => product.quantity) || []);
  return <ScrollView contentContainerStyle={styles.page} refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} enabled={online} />}>
    <Label large>Reports</Label><Label muted>{workspace.branches.find(branch => branch.id === workspace.branchId)?.name}</Label>
    <View style={[styles.row, { flexWrap: 'wrap' }]}>{[['yesterday', 'Yesterday'], ['today', 'Today'], ['7days', '7 days'], ['30days', '30 days']].map(([value, title]) => <Button key={value} title={title} secondary={range !== value} onPress={() => setRange(value)} />)}</View>
    {error && <Card><Label>{error}</Label><Button title="Retry" onPress={refresh} disabled={!online} /></Card>}
    {data && <>
      <Label muted>{`${data.from} — ${data.to} · UTC+7`}</Label>
      <Card><Label large>{amount(data.revenue)}</Label><Label>{`${data.orders} completed orders`}</Label>
        <Label>{`Cost of goods · ${amount(data.cost)}`}</Label><Label>{`Gross profit · ${amount(data.grossProfit)}`}</Label>
        <Label>{`Expenses · ${amount(data.expenses)}`}</Label><Label>{`Net profit · ${amount(data.netProfit)}`}</Label>
        <Label muted>Sales totals follow completed orders, as in website Reports.</Label>
      </Card>
      <Card><Label large>Sales trend</Label><SalesChart rows={data.days}/></Card>
      <Card><Label large>Revenue and gross profit</Label><SalesChart rows={data.days} line/></Card>
      <Card><Label large>Top-selling products</Label><Label muted>Ranked by quantity sold</Label>{data.products.map((product, index) => <View key={product.name + index} style={{ gap: 5 }}>
        <Label>{`${index < 3 ? ['🥇', '🥈', '🥉'][index] : index + 1} ${product.name} · ${product.quantity}`}</Label>
        <View style={{ height: 8, backgroundColor: theme.border, borderRadius: 4 }}><View style={{ width: `${product.quantity / maxUnits * 100}%`, height: 8, backgroundColor: '#275de8', borderRadius: 4 }} /></View>
      </View>)}{!data.products.length && <Label muted>No products sold in this period.</Label>}</Card>
      <Card><Label large>Payment methods</Label><Donut rows={data.payments}/></Card>
      <Card><Label large>Sales mix</Label><Donut rows={data.sources||[]}/></Card>
      <Label large>Staff performance</Label>{data.staff.map(staff => <Card key={staff.id}><Label>{staff.name}</Label>
        <Label>{`${staff.orders} orders · ${staff.units} units`}</Label><Label>{`Sales · ${amount(staff.sales)}`}</Label>
        <Label muted>{`Refunds · ${amount(staff.refunds)} · ${staff.cancelled} cancelled orders`}</Label>
      </Card>)}{!data.staff.length && <Card><Label muted>No staff sales in this period.</Label></Card>}
    </>}
  </ScrollView>;
}

function DashboardCharts({scope,online}:{scope:Scope;online:boolean}) {
 const {data,error}=useData<Report>('reports?range=yesterday',scope,online);
 return <><Label large>Yesterday</Label>{error&&<Label>{error}</Label>}{data&&<><Card><Label large>{money(data.revenue,data.currency)}</Label><Label>{`${data.orders} completed orders`}</Label><Label>{`${money(data.netProfit,data.currency)} · Net profit`}</Label><SalesChart rows={data.days}/></Card><Card><Label large>Sales mix</Label><Donut rows={data.sources||[]}/></Card><Card><Label large>Payment methods</Label><Donut rows={data.payments}/></Card></>}</>;
}

export function Records({ feature, scope, online, permissions, onUnread, workspace }: { feature: string; scope: Scope; online: boolean; permissions: string[]; onUnread: (count: number) => void; workspace?:Workspace }) {
  const theme = useTheme();
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [scan, setScan] = useState(false);
  const [form, setForm] = useState<'customer' | 'expense' | 'register-open' | 'register-close' | null>(null);
  const [shiftId, setShiftId] = useState<string>();
  const [adjusting, setAdjusting] = useState<Row | null>(null);
  const [createDraft,setCreateDraft]=useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  useEffect(() => { const timer = setTimeout(() => { setPage(1); setQuery(search); }, 350); return () => clearTimeout(timer); }, [search]);
  const endpoint = ({ 'Online Orders': 'incoming', 'Purchase Orders': 'purchases', 'Stock Transfers': 'transfers' } as Record<string, string>)[feature] || feature.toLowerCase();
  const path = `${endpoint}?page=${page}&search=${encodeURIComponent(query)}`;
  const { data, loading, error, at, refresh } = useData<Page>(path, scope, online);
  useEffect(() => { if (data?.unread !== undefined) onUnread(data.unread); }, [data?.unread, onUnread]);
  async function markRead(id: string) {
    if (busyRef.current || !online) return;
    busyRef.current = true; setBusy(true);
    try { await api('alerts', scope, { ids: [id] }); clearCache(); refresh(); }
    catch (error) { theme.alert('Unable to save', (error as Error).message); }
    finally { busyRef.current = false; setBusy(false); }
  }
  const value = (row: Row, field: string) => String(row[field] ?? '');
  function record(row: Row) {
    if (feature === 'Purchase Orders' || feature === 'Stock Transfers') return <Pressable accessibilityRole="button" onPress={() => setSelected(row.id)}><Card>
      <Label>{value(row, feature === 'Purchase Orders' ? 'po_number' : 'transfer_number')}</Label><Label>{value(row, 'status')}</Label>
      {feature === 'Purchase Orders' ? <><Label muted>{value(row, 'supplier_name')}</Label><Label muted>{`Ordered ${value(row, 'order_date')}${row.expected_date ? ` · Expected ${value(row, 'expected_date')}` : ''}`}</Label></> : <Label muted>{value(row, 'direction')}</Label>}
      <Label muted>View details</Label>
    </Card></Pressable>;
    if (feature === 'Orders' || feature === 'Online Orders') return <Pressable accessibilityRole="button" onPress={() => setSelected(row.id)}><Card>
      <View style={[styles.row, { justifyContent: 'space-between' }]}><Label>{value(row, 'orderNumber')}</Label><Label>{money(Number(row.total), data?.currency)}</Label></View>
      <Label muted>{value(row, 'customerName')}</Label><Label>{`${value(row, 'status')} · ${value(row, 'paymentState')}`}</Label>
      {feature === 'Online Orders' && <Label muted>{`${value(row, 'branchName')} · ${value(row, 'onlineStatus') || 'new'}`}</Label>}
    </Card></Pressable>;
    if (feature === 'Stock') {
      const image = value(row, 'variant_image_url') || value(row, 'image_url');
      return <Card><View style={styles.row}>{image ? <Pressable accessibilityLabel="View product image" onPress={() => setPhoto(image)}><Image source={{ uri: image }} style={{ width: 74, height: 84, borderRadius: 10 }} resizeMode="cover" /></Pressable> : null}
        <View style={{ flex: 1, gap: 4 }}><Label>{value(row, 'name')}</Label><Label muted>{[row.size, row.color, row.sku].filter(Boolean).join(' · ')}</Label>
          <Label>{`${row.stock_quantity} in stock`}</Label>{Number(row.stock_quantity) <= Number(row.low_stock_quantity) && <Label>Low stock</Label>}
        </View></View>{permissions.includes('products.stock_adjust') && <Button title="Count stock" secondary disabled={!online} onPress={() => setAdjusting(row)} />}</Card>;
    }
    if (feature === 'Alerts') return <Card><Label>{`${row.read ? '' : '● '}${value(row, 'title')}`}</Label><Label muted>{value(row, 'message')}</Label>
      <Label muted>{new Date(value(row, 'occurred_at')).toLocaleString()}</Label>
      {!row.read && <Button title="Mark as read" disabled={!online || busy} secondary onPress={() => void markRead(row.id)} />}</Card>;
    if (feature === 'Customers') return <Card><Label>{value(row, 'name')}</Label><Label muted>{value(row, 'phone')}</Label><Label muted>{value(row, 'address')}</Label>
      <Label muted>{value(row, 'email')}</Label><Label>{`${row.loyalty_points ?? 0} loyalty points`}</Label>
      {row.phone ? <Button title="Call customer" secondary onPress={() => void Linking.openURL(`tel:${value(row, 'phone').replace(/[^+\d]/g, '')}`).catch(() => theme.alert('Calling is unavailable on this device.'))} /> : null}</Card>;
    if (feature === 'Expenses') return <Card><Label>{value(row, 'description')}</Label><Label muted>{`${value(row, 'category')} · ${value(row, 'expense_date')}`}</Label><Label>{money(Number(row.amount))}</Label></Card>;
    return <Card><Label>{`Register · ${value(row, 'status')}`}</Label><Label muted>{new Date(value(row, 'opened_at')).toLocaleString()}</Label><Label>{`Opening cash · ${money(Number(row.opening_cash))}`}</Label>
      {row.status === 'open' && <Button title="Close register" secondary disabled={!online} onPress={() => { setShiftId(row.id); setForm('register-close'); }} />}</Card>;
  }
  return <View style={{ flex: 1 }}>
    <View style={{ paddingHorizontal: 20, paddingTop: 16, gap: 12 }}><Label large>{feature}</Label>
      {['Orders', 'Stock', 'Customers', 'Purchase Orders', 'Stock Transfers'].includes(feature) && <Field label="Search" value={search} onChangeText={setSearch} placeholder={feature === 'Purchase Orders' ? 'Purchase number or supplier' : feature === 'Stock Transfers' ? 'Transfer number' : 'Name, SKU or phone'} autoCapitalize="none" />}
      {feature === 'Stock' && <Button title="Scan barcode" secondary onPress={() => setScan(true)} />}
      {feature === 'Online Orders' && data && <View style={[styles.row, { justifyContent: 'space-between' }]}><View style={{ flex: 1 }}><Label>Receive from all branches</Label></View><Switch value={data.receiveAll === true} disabled={!online || busy} onValueChange={value => {
        if (busyRef.current) return;
        busyRef.current = true; setBusy(true);
        api('incoming-scope', scope, { receiveAll: value }).then(() => { clearCache(); refresh(); }).catch(error => theme.alert('Unable to save', error.message)).finally(() => { busyRef.current = false; setBusy(false); });
      }} /></View>}
      {feature === 'Customers' && permissions.includes('customers.create') && permissions.includes('pos.access') && <Button title="Quick Add" disabled={!online} onPress={() => setForm('customer')} />}
      {feature === 'Expenses' && data?.categories && <Button title="Add expense" disabled={!online} onPress={() => setForm('expense')} />}
      {feature === 'Register' && data && !data.rows.some(row => row.status === 'open') && <Button title="Open register" disabled={!online} onPress={() => setForm('register-open')} />}
      {!online && <Label muted>Offline · showing previously loaded records only</Label>}
      {error && <Card><Label>{error}</Label><Button title="Retry" onPress={refresh} disabled={!online} secondary /></Card>}
      {at && <Label muted>{`Updated ${new Date(at).toLocaleTimeString()}`}</Label>}
    </View>
    <FlatList data={data?.rows ?? []} keyExtractor={item => item.id} renderItem={({ item }) => record(item)}
      contentContainerStyle={styles.page} ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} enabled={online} tintColor={theme.text} />}
      ListEmptyComponent={<Card>{loading ? <ActivityIndicator color="#275de8" /> : <Label>{online ? 'No records yet' : 'Connect to load this page.'}</Label>}</Card>}
      ListFooterComponent={<View style={[styles.row, { marginTop: 16 }]}><View style={{ flex: 1 }}><Button title="Previous" secondary disabled={page <= 1 || loading} onPress={() => setPage(page - 1)} /></View>
        <Label>{String(page)}</Label><View style={{ flex: 1 }}><Button title="Next" secondary disabled={loading || !data || page * (feature === 'Orders' ? 20 : 25) >= data.total} onPress={() => setPage(page + 1)} /></View></View>} />
    {selected && (feature === 'Purchase Orders' ? <PurchaseOrder key={selected} id={selected} scope={scope} online={online} canUpdate={permissions.includes('purchases.update')} close={() => setSelected(null)} saved={() => { setSelected(null); clearCache(); refresh(); }} />
      : feature === 'Stock Transfers' ? <TransferSheet id={selected} scope={scope} online={online} workspace={workspace} close={() => {setSelected(null);refresh();}} />
      : <OrderSheet id={selected} scope={scope} online={online} incoming={feature === 'Online Orders'} canUpdate={permissions.includes('orders.update')} canReturn={permissions.includes('orders.return')} onClose={() => { setSelected(null); refresh(); }} currency={data?.currency ?? 'USD'} />)}
    <Photo uri={photo} close={() => setPhoto(null)} />
    {(feature==='Stock Transfers'||feature==='Purchase Orders'&&permissions.includes('purchases.create'))&&<View style={{padding:12}}><Button title={feature==='Stock Transfers'?'New transfer':'New purchase order'} disabled={!online} onPress={()=>setCreateDraft(true)}/></View>}
    {createDraft&&<ManagementForm operation={feature==='Stock Transfers'?'transfer-save':'purchase-create'} workspace={workspace} scope={scope} online={online} close={()=>setCreateDraft(false)} saved={()=>{setCreateDraft(false);clearCache();refresh();}}/>}
    {scan && <Scanner onClose={() => setScan(false)} onScan={barcode => { setSearch(barcode); setScan(false); }} />}
    {form && <EntryForm kind={form} scope={scope} online={online} categories={data?.categories} shiftId={shiftId} close={() => { setForm(null); refresh(); }} saved={() => { setForm(null); clearCache(); refresh(); }} />}
    {adjusting && <AdjustStock product={{ id: adjusting.id, name: String(adjusting.name), quantity: Number(adjusting.stock_quantity) }} scope={scope} online={online} close={() => { setAdjusting(null); clearCache(); refresh(); }} />}
  </View>;
}

function TransferSheet({ id, scope, online, close,workspace }: { id: string; scope: Scope; online: boolean; close: () => void;workspace?:Workspace }) {
  const theme = useTheme();
  const [editing,setEditing]=useState(false);
  type Product = { name: string; sku: string | null; size: string | null; color: string | null };
  const { data, error, loading, refresh } = useData<{ transfer_number: string; status: string; direction: string; note: string | null; updated_at: string | null; canAct: boolean; items: { product_id: string; quantity: number; products: Product | Product[] | null }[] }>(`transfer-detail?id=${id}`, scope, online);
  const [busy, setBusy] = useState(false), [actionError, setActionError] = useState('');
  const working = useRef(false), confirming = useRef(false);
  const action = data?.direction === 'Outgoing' && data.status === 'draft' ? 'send' : data?.direction === 'Incoming' && data.status === 'in_transit' ? 'receive' : null;
  function confirmTransfer() {
    if (!data || !action || !online || !data.canAct || working.current || confirming.current) return;
    const request = { id, action, expected: data.updated_at, items: data.items.map(item => ({ productId:item.product_id,quantity:item.quantity })) };
    confirming.current = true;
    theme.alert(action === 'send' ? 'Send this transfer?' : 'Receive this transfer?', action === 'send' ? 'Items will leave this branch’s available stock.' : 'Confirm the delivered items match this transfer. They will be added to this branch.', [
      {text:'Cancel',style:'cancel',onPress:()=>{confirming.current=false;}},
      {text:action === 'send' ? 'Send' : 'Receive',onPress:()=>{
        confirming.current=false; if(working.current) return; working.current=true;setBusy(true);setActionError('');
        api<{data:{alreadyApplied:boolean}}>('transfer-action',scope,request).then(result=>{clearCache();refresh();theme.alert(result.data.alreadyApplied ? 'Already updated' : 'Transfer updated','The current transfer status is being refreshed.');})
          .catch(error=>{setActionError(`${error.message} Refresh the status before retrying. This transfer cannot send or receive twice.`);refresh();})
          .finally(()=>{working.current=false;setBusy(false);});
      }},
    ],{cancelable:true,onDismiss:()=>{confirming.current=false;}});
  }
  return <Modal visible animationType="slide" onRequestClose={() => { if (!busy) close(); }}><SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}><ScrollView contentContainerStyle={styles.page}>
    <View style={[styles.row, { justifyContent: 'space-between' }]}><Label large>Stock transfer</Label><Button title="Close" secondary disabled={busy} onPress={close} /></View>
    {loading && <ActivityIndicator />}{(error || actionError) && <Card><Label>{error || actionError}</Label></Card>}
    {data && <><Card><Label large>{data.transfer_number}</Label><Label>{`${data.direction} · ${data.status}`}</Label>{data.note && <Label muted>{data.note}</Label>}</Card>
      {data.items.map(item => { const product = Array.isArray(item.products) ? item.products[0] : item.products; return <Card key={item.product_id}><Label>{product?.name || 'Product unavailable'}</Label><Label muted>{[product?.sku, product?.size, product?.color].filter(Boolean).join(' · ')}</Label><Label>{`${item.quantity} units`}</Label></Card>; })}
      {action && data.canAct && <Button title={action === 'send' ? 'Send transfer' : 'Receive transfer'} busy={busy} disabled={!online || loading} onPress={confirmTransfer} />}
      {!data.canAct && <Label muted>Transfer actions need the database safety update.</Label>}
      {data.status==='draft'&&data.direction==='Outgoing'&&<Button title="Edit draft" secondary disabled={!online||busy} onPress={()=>setEditing(true)}/>}
      {editing&&<ManagementForm operation="transfer-save" id={id} scope={scope} online={online} workspace={workspace} close={()=>setEditing(false)} saved={()=>{setEditing(false);clearCache();refresh();}}/>}
      </>}
    <Button title="Refresh" secondary disabled={!online || loading || busy} onPress={refresh} />
  </ScrollView></SafeAreaView></Modal>;
}

function OrderSheet({ id, scope, online, onClose, canUpdate, canReturn, currency, incoming }: { id: string; scope: Scope; online: boolean; onClose: () => void; canUpdate: boolean; canReturn: boolean; currency: string; incoming: boolean }) {
  const theme = useTheme();
  const { data, error, loading, refresh } = useData<Order>(`${incoming ? 'incoming-detail' : 'order'}?id=${encodeURIComponent(id)}`, scope, online);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [returning, setReturning] = useState(false);
  const next: Record<string, [string, string]> = { new: ['accepted', 'Accept order'], accepted: ['preparing', 'Start packing'], preparing: ['ready', 'Ready for delivery'], ready: ['completed', 'Complete order'] };
  const step = data && ['online', 'qr'].includes(data.source) && !['completed', 'cancelled', 'refunded'].includes(data.status) ? next[data.onlineStatus ?? 'new'] : undefined;
  async function update(status: string) {
    if (!data || !online || inFlight.current) return;
    inFlight.current = true; setBusy(true);
    try { await api(incoming ? 'incoming-status' : 'order', scope, { id, updatedAt: data.updatedAt, status }); clearCache(); refresh(); }
    catch (error) { theme.alert('Check order status', `${(error as Error).message}\nRefresh the order before retrying.`); refresh(); }
    finally { setBusy(false); inFlight.current = false; }
  }
  async function printReceipt(share: boolean, shipping = false) {
    if (inFlight.current || !online) return;
    inFlight.current = true; setBusy(true);
    try {
      const result = await api<{ html: string; width?: number; height?: number; size?: string }>(`${shipping ? 'shipping-label' : 'receipt'}?id=${encodeURIComponent(id)}`, scope);
      if (share || shipping) {
        const pdf = await Print.printToFileAsync({ html: result.html, ...(shipping ? { width: result.width, height: result.height, margins: { top: 0, right: 0, bottom: 0, left: 0 } } : {}) });
        if (shipping && pdf.numberOfPages !== 1) throw new Error('This label does not fit on one page. Choose a larger shipping label or smaller font in Printer Settings.');
        if (!share) { await Print.printAsync({ uri: pdf.uri }); return; }
        if (!await Sharing.isAvailableAsync()) throw new Error('Sharing is unavailable on this device.');
        await Sharing.shareAsync(pdf.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: shipping ? 'Share shipping label' : 'Share receipt' });
      } else await Print.printAsync({ html: result.html });
    } catch (error) { theme.alert('Receipt', (error as Error).message); }
    finally { inFlight.current = false; setBusy(false); }
  }
  return <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { if (!busy) onClose(); }}>
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}><ScrollView contentContainerStyle={styles.page}>
      <View style={[styles.row, { justifyContent: 'space-between' }]}><Label large>Order details</Label><Button title="Close" onPress={onClose} secondary disabled={busy} /></View>
      {loading && <ActivityIndicator />}{error && <Label>{error}</Label>}
      {data && <><Card><Label large>{data.orderNumber}</Label><Label>{data.customerName}</Label><Label muted>{data.customerPhone}</Label><Label muted>{data.customerAddress}</Label>
        <Label>{`${data.status} · ${data.paymentState}`}</Label><Label large>{money(data.total, currency)}</Label></Card>
        {incoming && data.paymentMethod === 'khqr' && <Button title="View payment proof" secondary disabled={!online || busy} onPress={() => {
          if (inFlight.current) return; inFlight.current = true; setBusy(true);
          api<{ url: string }>(`proof?id=${id}`, scope).then(result => setPhoto(result.url)).catch(error => theme.alert('Payment proof', error.message)).finally(() => { inFlight.current = false; setBusy(false); });
        }} />}
        {incoming && data.paymentMethod === 'khqr' && data.paymentState === 'pending_verification' && canUpdate && <Button title="Confirm payment received" disabled={!online || busy} onPress={() => theme.alert('Verify your bank account', 'A screenshot does not confirm payment. Only continue after checking that the money arrived in the store bank account.', [
          { text: 'Cancel', style: 'cancel' }, { text: 'Payment received', onPress: () => {
            if (inFlight.current) return; inFlight.current = true; setBusy(true);
            api('payment', scope, { id, status: 'paid' }).then(() => { clearCache(); refresh(); }).catch(error => { theme.alert('Check payment status', error.message); refresh(); }).finally(() => { inFlight.current = false; setBusy(false); });
          } },
        ])} />}
        {(data.items ?? []).map(item => <Card key={item.id}><View style={styles.row}>{item.imageUrl && <Pressable onPress={() => setPhoto(item.imageUrl)} accessibilityLabel="View product image"><Image source={{ uri: item.imageUrl }} style={{ width: 56, height: 66, borderRadius: 8 }} /></Pressable>}
          <View style={{ flex: 1 }}><Label>{item.name}</Label><Label muted>{item.variant}</Label><Label>{`${item.quantity} items · ${money(item.subtotal, currency)}`}</Label></View></View></Card>)}
        {step && canUpdate && <Button title={step[1]} busy={busy} disabled={!online || !data.updatedAt || loading} onPress={() => theme.alert(theme.t(step[1]), `${data.orderNumber} — confirm this change?`, [
          { text: theme.t('Cancel'), style: 'cancel' }, { text: 'Confirm', onPress: () => void update(step[0]) },
        ])} />}
        <Button title="Refresh" secondary disabled={!online || busy || loading} onPress={refresh} />
        <Button title="Print receipt" secondary disabled={!online || busy} onPress={() => void printReceipt(false)} />
        <Button title="Share PDF receipt" secondary disabled={!online || busy} onPress={() => void printReceipt(true)} />
        <Button title="Print shipping label" secondary disabled={!online || busy} onPress={() => void printReceipt(false, true)} />
        <Button title="Share PDF shipping label" secondary disabled={!online || busy} onPress={() => void printReceipt(true, true)} />
        {canReturn && !incoming && <Button title="Return items / check refund" secondary disabled={!online || busy} onPress={() => setReturning(true)} />}
      </>}
    </ScrollView><Photo uri={photo} close={() => setPhoto(null)} />
    {returning && <ReturnOrder id={id} scope={scope} online={online} close={() => { setReturning(false); refresh(); }} saved={() => { setReturning(false); clearCache(); refresh(); }} />}</SafeAreaView>
  </Modal>;
}

function Photo({ uri, close }: { uri: string | null; close: () => void }) {
  return <Modal visible={!!uri} transparent={false} onRequestClose={close} animationType="fade"><SafeAreaView style={{ flex: 1, backgroundColor: '#000', padding: 16 }}>
    <Button title="Close" onPress={close} />{uri && <ScrollView maximumZoomScale={4} minimumZoomScale={1} contentContainerStyle={{ flex: 1 }}><Image source={{ uri }} style={{ flex: 1 }} resizeMode="contain" /></ScrollView>}
  </SafeAreaView></Modal>;
}
function Scanner({ onClose, onScan }: { onClose: () => void; onScan: (value: string) => void }) {
  const [permission, requestPermission] = useCameraPermissions();
  const scanned = useRef(false);
  return <Modal visible onRequestClose={onClose}><SafeAreaView style={{ flex: 1, backgroundColor: '#0f172a', padding: 20, gap: 20 }}>
    <Button title="Close" onPress={onClose} />
    {permission?.granted ? <CameraView style={{ flex: 1 }} barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'code128', 'code39', 'upc_a', 'upc_e', 'qr'] }} onBarcodeScanned={result => {
      if (!scanned.current) { scanned.current = true; onScan(result.data); }
    }} /> : <><Text style={{ color: '#fff' }}>Allow camera access to scan product barcodes.</Text><Button title="Allow camera" onPress={() => void requestPermission()} />
      {permission && !permission.canAskAgain && <Button title="Open device settings" onPress={() => void Linking.openSettings()} />}</>}
  </SafeAreaView></Modal>;
}
