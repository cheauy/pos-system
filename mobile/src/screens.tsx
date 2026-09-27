import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, FlatList, Linking, Modal, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Image as CachedImage } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { api, ApiError, money, type Order, type Scope, type Workspace } from './client';
import { FloatingAdd, ActionArea, DetailRow, Metric, SectionTitle, Badge, MenuTile, ProductPhoto, SearchField, Button, Card, Label, styles, useTheme } from './ui';
import { Ionicons } from '@expo/vector-icons';
import { EntryForm } from './entry-form';
import { AdjustStock } from './adjust-stock';
import { ReturnOrder } from './return-order';
import { PurchaseOrder } from './purchase-order';
import { offline } from './offline';
import { canSaveOffline } from './offline-snapshots';
import { Shimmer } from './loading';
import { router, useLocalSearchParams } from 'expo-router';
import {useViewPreference} from './view-preference';
import { LayoutPicker, Pagination, SelectMenu } from './list-controls';
import { ExpenseAnalytics } from './expense-analytics';
import { CustomerFieldSettings, type CustomerFields } from './customer-fields';
import { RegisterDetail } from './register-detail';
import { IncomingAlerts } from './incoming-alerts';
import { OrderCard } from './order-card';
import { outputOrderDocument } from './order-document';
import { groupProducts } from './product-groups';
import { ProductPanel } from './product-panel';
import { Donut, ItemBars, Ranking, SalesChart } from './charts';

import { ManagementForm } from './management';

type Row = { id: string; variant_group_id?: string | null; [key: string]: unknown };
type Page = { rows: Row[]; total: number; fieldSettings?: CustomerFields; hasOpen?:boolean; alertIds?: string[]; photosUnavailable?: boolean; unread?: number; receiveAll?: boolean; categories?: string[]; currency?: string; metrics?: { yesterday: number; pending: number; completed: number } };
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
  const [state, setState] = useState<{ key: string; data?: T; error?: string; loading: boolean; at?: number }>(() => { const saved = cache.get(key); return { key, data: saved?.data as T | undefined, at: saved?.at, loading: online }; });
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
      setState({ key, data: denied ? undefined : saved?.data as T | undefined, at: denied ? undefined : saved?.at, loading: false, error: error.message });
    });
    return () => { current = false; controller.abort(); };
  }, [key, online, version, path, userId, businessId, branchId]);
  return { ...(state.key === key ? state : { data: undefined, error: undefined, at: undefined, loading: online }), refresh };
}

export function Home({ workspace, online, go }: { workspace: Workspace; online: boolean; go: (page: string) => void }) {
  const theme = useTheme();
  const scope = { userId: workspace.userId, businessId: workspace.business.id, branchId: workspace.branchId };
  return <ScrollView contentContainerStyle={styles.page}>
    <View style={{ gap: 5 }}><Label muted>STORE OVERVIEW</Label><Label large>{workspace.business.name}</Label><View style={styles.row}><Badge title={workspace.business.role} /><Badge title={online ? 'Connected' : 'Offline'} positive={online} /></View></View>
    {workspace.permissions.includes('pos.access') && <Pressable accessibilityRole="button" onPress={() => go('POS')} style={({ pressed }) => ({ backgroundColor: '#275de8', padding: 20, borderRadius: 20, flexDirection: 'row', alignItems: 'center', gap: 16, opacity: pressed ? 0.8 : 1 })}>
      <View style={{ padding: 13, backgroundColor: '#ffffff20', borderRadius: 16 }}><Ionicons name="calculator-outline" size={28} color="#fff" /></View><View style={{ flex: 1 }}><Text style={{ color: '#fff', fontSize: 19, fontWeight: '700' }}>{theme.t('New sale')}</Text><Text style={{ color: '#e1eaff', fontSize: 13, marginTop: 4 }}>{theme.t('Open point of sale')}</Text></View><Ionicons name="arrow-forward" size={23} color="#fff" />
    </Pressable>}
    <Label large>Quick actions</Label>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
      {([['Products', 'products.view'], ['Orders', 'orders.view'], ['Stock', 'inventory.view'], ['Register', 'register.manage']] as const).filter(([, permission]) => workspace.permissions.includes(permission)).map(([name]) => <MenuTile key={name} title={name} onPress={() => go(name)} />)}
    </View>
    {!workspace.permissions.includes('reports.view')&&workspace.permissions.includes('orders.view') && <Overview scope={scope} online={online} />}
    {workspace.permissions.includes('reports.view') && <DashboardCharts scope={scope} online={online}/>}
    <Card><Label>Subscription</Label><Label muted>{workspace.business.subscriptionStatus}</Label>
      <Label muted>{workspace.business.expiresAt ? `Expires ${new Date(workspace.business.expiresAt).toLocaleDateString()}` : 'No expiry supplied'}</Label>
    </Card>
  </ScrollView>;
}
function Overview({ scope, online }: { scope: Scope; online: boolean }) {
  const theme = useTheme();
  const { data, loading, error, refresh } = useData<Page>('orders', scope, online);
  return <Card><View style={[styles.row, { justifyContent: 'space-between' }]}><Label large>Orders overview</Label><Pressable accessibilityRole="button" accessibilityLabel="Refresh orders" disabled={!online || loading} onPress={refresh} style={{ padding: 12 }}>{loading ? <ActivityIndicator color="#275de8" /> : <Ionicons name="refresh-outline" size={20} color={theme.muted} />}</Pressable></View>
    {error && <Label>{error}</Label>}
    {data?.metrics && <><View style={styles.row}>{[['Orders yesterday', data.metrics.yesterday], ['Pending orders', data.metrics.pending]].map(([title, value]) => <View key={title} style={{ flex: 1, backgroundColor: theme.background, padding: 16, borderRadius: 14, gap: 6 }}><Text style={{ color: theme.text, fontSize: 28, fontWeight: '700' }}>{value}</Text><Label muted>{title}</Label></View>)}</View><View style={{ paddingTop: 8 }}><Label muted>Completed sales</Label><Label large>{money(data.metrics.completed, data.currency)}</Label><Label muted>Completed sales include all dates.</Label></View></>}
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
  const [range, setRange] = useState('yesterday');
  const scope = { userId: workspace.userId, businessId: workspace.business.id, branchId: workspace.branchId };
  const { data, loading, error, refresh } = useData<Report>(`reports?range=${range}`, scope, online);
  const amount = (value: number) => money(value, data?.currency);
  return <ScrollView contentContainerStyle={styles.page} refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} enabled={online} />}>
    <Label muted>{workspace.branches.find(branch => branch.id === workspace.branchId)?.name}</Label>
    <View style={[styles.row, { flexWrap: 'wrap' }]}>{[['yesterday', 'Yesterday'], ['today', 'Today'], ['7days', '7 days'], ['30days', '30 days']].map(([value, title]) => <Button key={value} title={title} secondary={range !== value} onPress={() => setRange(value)} />)}</View>
    {error && <Card><Label>{error}</Label><Button title="Retry" onPress={refresh} disabled={!online} /></Card>}
    {loading&&!data&&<Shimmer rows={5}/>}
    {data && <>
      <Label muted>{`${data.from} — ${data.to} · UTC+7`}</Label>
      <View style={{flexDirection:'row',flexWrap:'wrap',gap:12}}><Metric label="Revenue" value={amount(data.revenue)} icon="trending-up-outline"/><Metric label="Net profit" value={amount(data.netProfit)} icon="wallet-outline"/><Metric label="Completed orders" value={String(data.orders)} icon="receipt-outline"/><Metric label="Expenses" value={amount(data.expenses)} icon="card-outline"/></View>
      <Card><SectionTitle title="Profit summary" icon="analytics-outline"/><DetailRow label="Cost of goods" value={amount(data.cost)}/><DetailRow label="Gross profit" value={amount(data.grossProfit)}/><Label muted>Sales totals follow completed orders, as in website Reports.</Label></Card>
      <Card><Label large>Sales trend</Label><SalesChart rows={data.days}/></Card>
      <Card><Label large>Revenue and gross profit</Label><SalesChart rows={data.days} line/></Card>
      <Card><SectionTitle title="Top-selling products" icon="trophy-outline"/><Label muted>Ranked by quantity sold</Label><Ranking rows={data.products.map(product=>({name:product.name,value:product.quantity}))}/></Card>
      <Card><Label large>Payment methods</Label><Donut rows={data.payments}/></Card>
      <Card><Label large>Sales mix</Label><Donut rows={data.sources||[]}/></Card>
      {workspace.permissions.includes('expenses.manage')&&<ExpenseAnalytics scope={scope} online={online} range={range}/>}
      <Label large>Staff performance</Label>{data.staff.map(staff => <Card key={staff.id}><Label>{staff.name}</Label>
        <Label>{`${staff.orders} orders · ${staff.units} units`}</Label><Label>{`Sales · ${amount(staff.sales)}`}</Label>
        <Label muted>{`Refunds · ${amount(staff.refunds)} · ${staff.cancelled} cancelled orders`}</Label>
      </Card>)}{!data.staff.length && <Card><Label muted>No staff sales in this period.</Label></Card>}
    </>}
  </ScrollView>;
}

function DashboardCharts({scope,online}:{scope:Scope;online:boolean}) {
 const [range,setRange]=useState('yesterday');
 const {data,error,loading,refresh}=useData<Report>(`reports?range=${range}`,scope,online);
 const months=new Map<string,{date:string;value:number}>();
 for(const day of data?.days??[]){const date=day.date.slice(0,7)+'-01',previous=months.get(date);months.set(date,{date,value:(previous?.value??0)+day.value});}
 return <><SectionTitle title="Overview" icon="analytics-outline"/><SelectMenu label="Period" value={range} options={[{value:'today',label:'Today'},{value:'yesterday',label:'Yesterday'},{value:'7days',label:'1 week'},{value:'30days',label:'1 month'},{value:'365days',label:'1 year'}]} change={setRange}/>{error&&<Card><Label>{error}</Label><Button title="Retry" onPress={refresh} disabled={!online}/></Card>}{loading&&!data&&<Shimmer rows={4}/>}
 {data&&<><Label muted>{`${data.from} — ${data.to}`}</Label><View style={{flexDirection:'row',flexWrap:'wrap',gap:12}}><Metric label="Revenue" value={money(data.revenue,data.currency)} icon="trending-up-outline"/><Metric label="Net profit" value={money(data.netProfit,data.currency)} icon="wallet-outline"/><Metric label="Orders" value={String(data.orders)} icon="receipt-outline"/><Metric label="Expenses" value={money(data.expenses,data.currency)} icon="card-outline"/></View><Card><SectionTitle title="Sales trend" icon="bar-chart-outline"/><SalesChart rows={range==='365days'?[...months.values()]:data.days}/></Card><Card><SectionTitle title="Top-selling products" icon="trophy-outline"/><Label muted>Ranked by quantity sold</Label><Ranking rows={data.products.map(product=>({name:product.name,value:product.quantity}))}/></Card><Card><SectionTitle title="Sales mix" icon="pie-chart-outline"/><Donut rows={data.sources||[]}/></Card><Card><SectionTitle title="Payment methods" icon="card-outline"/><Donut rows={data.payments}/></Card></>}</>;
}

export function Records({ feature, scope, online, permissions, workspace }: { feature: string; scope: Scope; online: boolean; permissions: string[]; workspace?:Workspace }) {
  const { orderPanel,customerFields } = useLocalSearchParams<{orderPanel?:string;customerFields?:string}>();
  const isOrder = feature === 'Orders' || feature === 'Online Orders';
  const view=useViewPreference(scope,feature,feature==='Online Orders'?2:1,isOrder?2:3);
  const grid=isOrder&&view.value===2;
  const layoutRecords=['Purchase Orders','Stock Transfers'].includes(feature);
  const columns=feature==='Stock'?view.value:feature==='Online Orders'&&grid?2:1;
  const [listSize,setListSize]=useState(10);
  const pageSize=feature==='Orders'?10:feature==='Online Orders'?(grid?8:listSize):feature==='Stock'?(columns===1?10:columns===2?4:9):['Customers','Expenses','Register'].includes(feature)||layoutRecords?10:25;
  const [payment,setPayment]=useState('all');

  const theme = useTheme();
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('all');
  const [selected, setSelected] = useState<string | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [scan, setScan] = useState(false);
  const [form, setForm] = useState<'customer' | 'expense' | 'register-open' | 'register-close' | null>(null);
  const [shiftId, setShiftId] = useState<string>();
  const [adjusting, setAdjusting] = useState<Row | null>(null);
  const [detailRow, setDetailRow] = useState<Row | null>(null);
  const [stockFamily,setStockFamily]=useState<Row[]>([]);
  const [createDraft,setCreateDraft]=useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  useEffect(() => { const timer = setTimeout(() => { setPage(1); setQuery(search); }, 350); return () => clearTimeout(timer); }, [search]);
  const endpoint = ({ 'Online Orders': 'incoming', 'Purchase Orders': 'purchases', 'Stock Transfers': 'transfers' } as Record<string, string>)[feature] || feature.toLowerCase();
  const path = `${endpoint}?grouped=${feature==='Stock'}&limit=${pageSize}&page=${page}&search=${encodeURIComponent(query)}${isOrder ? `&status=${status}&payment=${payment}` : ''}`;
  const { data, loading, error, refresh } = useData<Page>(path, scope, online);
  const value = (row: Row, field: string) => String(row[field] ?? '');
  function record(row: Row) {
    if(layoutRecords)return <Pressable accessibilityRole="button" onPress={()=>setSelected(row.id)} style={{padding:columns===1?12:10,gap:8,borderRadius:14,backgroundColor:theme.panel,borderWidth:1,borderColor:theme.border,flexDirection:columns===1?'row':'column',alignItems:columns===1?'center':'flex-start'}}><Ionicons name={feature==='Purchase Orders'?'clipboard-outline':'swap-horizontal-outline'} size={22} color="#5987ed"/><View style={{flex:columns===1?1:undefined,gap:4}}><Text style={{color:theme.text,fontSize:columns===1?15:12,fontWeight:'600'}}>{value(row,feature==='Purchase Orders'?'po_number':'transfer_number')}</Text><Label muted>{value(row,feature==='Purchase Orders'?'supplier_name':'direction')}</Label></View><Badge title={value(row,'status')} positive={row.status==='received'}/></Pressable>;
    if(feature==='Expenses')return <Pressable accessibilityRole="button" onPress={()=>setDetailRow(row)} style={{padding:12,borderRadius:14,backgroundColor:theme.panel,borderWidth:1,borderColor:theme.border,flexDirection:'row',alignItems:'center',gap:12}}><Ionicons name="wallet-outline" size={23} color="#5987ed"/><View style={{flex:1}}><Label>{value(row,'description')}</Label><Label muted>{`${value(row,'category')} / ${value(row,'expense_date')}`}</Label></View><Label>{money(Number(row.amount),data?.currency)}</Label></Pressable>;
    if (isOrder) return <OrderCard order={row} grid={grid} currency={data?.currency} open={()=>setSelected(row.id)}/>;
    if (feature === 'Stock') {
      const variants=Array.isArray(row.variants)?row.variants as Row[]:[row];
      const stock=variants.reduce((sum,item)=>sum+Number(item.stock_quantity),0);
      return <Pressable accessibilityRole="button" onPress={()=>setStockFamily(variants)} style={{padding:columns===1?12:10,gap:8,borderRadius:14,backgroundColor:theme.panel,borderWidth:1,borderColor:theme.border,flexDirection:columns===1?'row':'column',alignItems:columns===1?'center':undefined}}><ProductPhoto uri={value(row,'variant_image_url')||value(row,'image_url')} size={columns===1?52:undefined} fill={columns!==1}/><View style={{flex:1,gap:4}}><Label>{value(row,'name')}</Label><Label muted>{variants.length>1?`${variants.length} variants`:[row.size,row.color,row.sku].filter(Boolean).join(' · ')}</Label><Label>{`${stock} in stock`}</Label></View>{columns===1&&<Ionicons name="chevron-forward" size={18} color={theme.muted}/>}</Pressable>;
    }
    if(feature==='Customers')return <Pressable accessibilityRole="button" onPress={()=>setDetailRow(row)} style={{flexDirection:'row',alignItems:'center',gap:10,paddingVertical:10,paddingHorizontal:12,backgroundColor:theme.panel,borderBottomWidth:1,borderColor:theme.border}}><Ionicons name="person-circle-outline" size={30} color="#5987ed"/><View style={{flex:1}}><Text numberOfLines={1} style={{color:theme.text,fontSize:15,fontFamily:theme.language==='km'?'Hanuman_400Regular':undefined}}>{value(row,'name')}</Text><Text numberOfLines={1} style={{color:theme.muted,fontSize:12}}>{value(row,'phone')}</Text></View><Ionicons name="chevron-forward" size={18} color={theme.muted}/></Pressable>;
    if(feature==='Register')return <Pressable accessibilityRole="button" onPress={()=>setDetailRow(row)} style={{flexDirection:'row',alignItems:'center',gap:12,padding:12,borderRadius:12,backgroundColor:theme.panel,borderWidth:1,borderColor:theme.border}}><Ionicons name="cash-outline" size={24} color="#5987ed"/><View style={{flex:1}}><Label>Cash register</Label><Label muted>{new Date(value(row,'opened_at')).toLocaleDateString()}</Label></View><View style={{alignItems:'flex-end',gap:4}}><Badge title={value(row,'status')} positive={row.status==='open'}/><Label>{money(Number(row.opening_cash),data?.currency)}</Label></View></Pressable>;
    const icon = feature==='Customers'?'person-outline':feature==='Expenses'?'wallet-outline':'cash-outline';
    return <Pressable accessibilityRole="button" onPress={()=>setDetailRow(row)}><Card><View style={styles.row}><View style={{padding:13,borderRadius:15,backgroundColor:theme.background}}><Ionicons name={icon} size={25} color="#5987ed"/></View><View style={{flex:1}}><Label>{feature==='Customers'?value(row,'name'):feature==='Expenses'?value(row,'description'):'Cash register'}</Label><Label muted>{feature==='Customers'?value(row,'phone'):feature==='Expenses'?value(row,'category'):new Date(value(row,'opened_at')).toLocaleDateString()}</Label></View><Ionicons name="chevron-forward" size={18} color={theme.muted}/></View>{feature==='Customers'?<Badge title={`${row.loyalty_points??0} points`}/>:feature==='Expenses'?<DetailRow label="Amount" value={money(Number(row.amount),data?.currency)}/>:<View style={[styles.row,{justifyContent:'space-between'}]}><Badge title={value(row,'status')} positive={row.status==='open'}/><Label>{money(Number(row.opening_cash),data?.currency)}</Label></View>}</Card></Pressable>;
  }
  return <View style={{ flex: 1 }}>
    <View style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom:8, gap: 12 }}>
      {['Orders', 'Online Orders', 'Stock', 'Customers', 'Purchase Orders', 'Stock Transfers'].includes(feature) && <View style={styles.row}><View style={{flex:1}}><SearchField value={search} onChangeText={setSearch} placeholder={isOrder ? 'Order number, customer or phone' : feature === 'Stock' ? 'Name, SKU or barcode' : feature === 'Purchase Orders' ? 'Purchase number or supplier' : feature === 'Stock Transfers' ? 'Transfer number' : 'Name or phone'} onScan={feature==='Stock'?()=>setScan(true):undefined} scanLabel="Scan product barcode" /></View>{isOrder&&<><Pressable accessibilityRole="button" accessibilityLabel="Filter orders" onPress={()=>router.setParams({orderPanel:'filters'})} style={{padding:10,minHeight:44}}><Ionicons name="options-outline" size={22} color={theme.text}/></Pressable><Pressable accessibilityRole="button" accessibilityLabel={view.value===1?'Switch to grid view':'Switch to list view'} onPress={()=>{view.change(view.value===1?2:1);setPage(1);}} style={{padding:10,minHeight:44}}><Ionicons name={view.value===1?'grid-outline':'list-outline'} size={22} color={theme.text}/></Pressable></>}{layoutRecords&&<View accessibilityLabel="Compact list view" style={{padding:12}}><Ionicons name="list-outline" size={22} color={theme.text}/></View>}</View>}
      {feature==='Stock'&&<LayoutPicker value={view.value} change={value=>{view.change(value);setPage(1);}}/>}
      {view.error&&<Label>{view.error}</Label>}
      {data&&<Badge title={`${data.total} ${theme.t(feature==='Stock'?'products':'records')}`}/>}
      {feature === 'Register' && data && data.hasOpen===false && <Button title="Open register" disabled={!online} onPress={() => setForm('register-open')} />}
      {!online && <Label muted>Offline · showing previously loaded records only</Label>}
      {error && <Card><Label>{error}</Label><Button title="Retry" onPress={refresh} disabled={!online} secondary /></Card>}
      {data?.photosUnavailable&&<Label muted>Product photos could not be loaded. Pull down to retry.</Label>}
      {loading&&data&&<ActivityIndicator size="small" color="#275de8"/>}
    </View>
    {feature==='Online Orders'&&<IncomingAlerts key={`${scope.branchId}:${data?.receiveAll}`} ids={data?.alertIds} scopeKey={`${scope.userId}-${scope.businessId}-${scope.branchId}`} visible={orderPanel==='alerts'} close={()=>router.setParams({orderPanel:''})} receiveAll={data?.receiveAll===true} disabled={!data||!online||busy} saveScope={value=>{
      if(busyRef.current)return;busyRef.current=true;setBusy(true);
      api('incoming-scope',scope,{receiveAll:value}).then(()=>{clearCache();refresh();}).catch(error=>theme.alert('Unable to save',error.message)).finally(()=>{busyRef.current=false;setBusy(false);});
    }}/>}
    {isOrder&&<Modal visible={orderPanel==='filters'} animationType="slide" presentationStyle="pageSheet" onRequestClose={()=>router.setParams({orderPanel:''})}><SafeAreaView style={{flex:1,backgroundColor:theme.background}}><ScrollView contentContainerStyle={styles.page}><SectionTitle title="Order filters" icon="options-outline"/><Label>Status</Label><View style={[styles.row,{flexWrap:'wrap'}]}>{[['all','All'],['pending','Pending'],['completed','Completed'],['refunded','Returned'],['cancelled','Cancelled']].map(([key,label])=><Button key={key} title={label} secondary={status!==key} onPress={()=>{setStatus(key);setPage(1);}}/>)}</View><Label>Payment</Label><View style={[styles.row,{flexWrap:'wrap'}]}>{[['all','All'],['paid','Paid'],['unpaid','Unpaid'],['partial','Partial'],['pending_verification','Verify payment'],['refunded','Refunded']].map(([key,label])=><Button key={key} title={label} secondary={payment!==key} onPress={()=>{setPayment(key);setPage(1);}}/>)}</View>{feature==='Online Orders'&&!grid&&<><Label>Orders per page</Label><View style={styles.row}>{[10,15].map(count=><Button key={count} title={String(count)} secondary={listSize!==count} onPress={()=>{setListSize(count);setPage(1);}}/>)}</View></>}<Button title="Reset filters" secondary onPress={()=>{setStatus('all');setPayment('all');setPage(1);}}/><Button title="Done" onPress={()=>router.setParams({orderPanel:''})}/></ScrollView></SafeAreaView></Modal>}
    <FlatList key={`columns-${columns}`} numColumns={columns} columnWrapperStyle={columns>1?{gap:12}:undefined} data={feature==='Stock'?groupProducts(data?.rows??[]).map(rows=>rows.length>1?{...rows[0],variants:rows}:rows[0]):data?.rows??[]} keyExtractor={item => item.id} renderItem={({ item }) => columns>1?<View style={{flex:1,maxWidth:`${100/columns-1.5}%`}}>{record(item)}</View>:record(item)} initialNumToRender={pageSize} maxToRenderPerBatch={8} windowSize={5}
      contentContainerStyle={[styles.page,['Customers','Register'].includes(feature)?{gap:0,paddingTop:4}:null,['Customers','Expenses'].includes(feature)?{paddingBottom:90}:null]} ItemSeparatorComponent={() => <View style={{ height: ['Customers','Register'].includes(feature)?4:12 }} />}
      refreshControl={<RefreshControl refreshing={loading&&!!data} onRefresh={refresh} enabled={online} tintColor={theme.text} />}
      ListEmptyComponent={loading&&online ? <Shimmer/> : <View style={{paddingVertical:42,alignItems:'center',gap:14}}><Ionicons name={feature==='Stock'?'cube-outline':'receipt-outline'} size={42} color={theme.muted}/><Label large>{online ? 'No records yet' : 'You are offline'}</Label><Label muted>{query||status!=='all'?'Try another search or filter.':'Your records will appear here.'}</Label></View>}
      ListFooterComponent={<Pagination page={page} total={data?.total??0} size={pageSize} loading={loading} change={setPage}/>} />
    {selected && (feature === 'Purchase Orders' ? <PurchaseOrder key={selected} id={selected} scope={scope} online={online} canUpdate={permissions.includes('purchases.update')} close={() => setSelected(null)} saved={() => { setSelected(null); clearCache(); refresh(); }} />
      : feature === 'Stock Transfers' ? <TransferSheet id={selected} scope={scope} online={online} workspace={workspace} close={() => {setSelected(null);refresh();}} />
      : <OrderSheet id={selected} scope={scope} online={online} incoming={feature === 'Online Orders'} canUpdate={permissions.includes('orders.update')} canReturn={permissions.includes('orders.return')} onClose={() => { setSelected(null); refresh(); }} currency={data?.currency ?? 'USD'} />)}
    <ProductPanel visible={stockFamily.length>0} title={String(stockFamily[0]?.name||'Stock variants')} close={()=>setStockFamily([])}>{stockFamily.map(row=><Card key={row.id}><View style={styles.row}><Pressable accessibilityRole="button" accessibilityLabel="View product image" onPress={()=>{setStockFamily([]);setPhoto(value(row,'variant_image_url')||value(row,'image_url'));}}><ProductPhoto uri={value(row,'variant_image_url')||value(row,'image_url')} size={64}/></Pressable><View style={{flex:1}}><Label>{[row.size,row.color].filter(Boolean).join(' · ')||value(row,'name')}</Label><Label muted>{value(row,'sku')}</Label><Label>{`${row.stock_quantity} in stock`}</Label><Label muted>{`Low-stock level · ${row.low_stock_quantity}`}</Label></View></View>{permissions.includes('products.stock_adjust')&&<Button title="Count stock" secondary disabled={!online} onPress={()=>{setStockFamily([]);setAdjusting(row);}}/>}</Card>)}</ProductPanel>
    <Photo uri={photo} close={() => setPhoto(null)} />
    {detailRow&&<Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={()=>setDetailRow(null)}><SafeAreaView style={{flex:1,backgroundColor:theme.background}}><ActionArea><ScrollView contentContainerStyle={styles.page}><View style={[styles.row,{justifyContent:'space-between'}]}><SectionTitle title={feature==='Customers'?'Customer details':feature==='Expenses'?'Expense details':'Register details'} icon={feature==='Customers'?'person-outline':feature==='Expenses'?'wallet-outline':'cash-outline'}/><Button title="Close" secondary onPress={()=>setDetailRow(null)}/></View>
      {feature!=='Register'&&<Card>{(feature==='Customers'?[['Name','name'],['Phone','phone'],...(data?.fieldSettings?.emailEnabled?[['Email','email']]:[]),...(data?.fieldSettings?.birthdayEnabled?[['Birthday','birthday']]:[]),['Address','address'],['Loyalty points','loyalty_points']]:feature==='Expenses'?[['Description','description'],['Category','category'],['Amount','amount'],['Date','expense_date'],['Paid to','payee']]:[['Status','status'],['Opening cash','opening_cash'],['Opened','opened_at'],['Closed','closed_at']]).map(([label,key])=><DetailRow key={key} label={label} value={['amount','opening_cash'].includes(key)?money(Number(detailRow[key]),data?.currency):detailRow[key]==null?'—':String(detailRow[key])}/>)}</Card>}
      {feature==='Customers'&&!!detailRow.phone&&<Button title="Call customer" secondary onPress={()=>void Linking.openURL(`tel:${String(detailRow.phone).replace(/[^+\d]/g,'')}`).catch(()=>theme.alert('Calling is unavailable on this device.'))}/>}
      {feature==='Register'&&<RegisterDetail id={detailRow.id} scope={scope} online={online} onCloseShift={()=>{setShiftId(detailRow.id);setDetailRow(null);setForm('register-close');}}/>}
    </ScrollView></ActionArea></SafeAreaView></Modal>}
    {(feature==='Stock Transfers'||feature==='Purchase Orders'&&permissions.includes('purchases.create'))&&<View style={{padding:12}}><Button title={feature==='Stock Transfers'?'New transfer':'New purchase order'} disabled={!online} onPress={()=>setCreateDraft(true)}/></View>}
    {createDraft&&<ManagementForm operation={feature==='Stock Transfers'?'transfer-save':'purchase-create'} workspace={workspace} scope={scope} online={online} close={()=>setCreateDraft(false)} saved={()=>{setCreateDraft(false);clearCache();refresh();}}/>}
    {scan && <Scanner order={isOrder} onClose={() => setScan(false)} onScan={barcode => { setSearch(barcode); setPage(1); if(isOrder){setStatus('all');setPayment('all');} setScan(false); }} />}
    {form && <EntryForm kind={form} scope={scope} online={online} categories={data?.categories} shiftId={shiftId} close={() => { setForm(null); refresh(); }} saved={() => { setForm(null); clearCache(); refresh(); }} />}
    {feature==='Expenses'&&<FloatingAdd label="Add expense" disabled={!online||!data?.categories} onPress={()=>setForm('expense')}/>}
    {feature==='Customers'&&permissions.includes('customers.create')&&permissions.includes('pos.access')&&<FloatingAdd label="Add customer" disabled={!online} onPress={()=>setForm('customer')}/>}
    {feature==='Customers'&&customerFields==='1'&&permissions.includes('business.update')&&<CustomerFieldSettings scope={scope} online={online} close={()=>router.setParams({customerFields:''})} saved={()=>{router.setParams({customerFields:''});clearCache();refresh();}}/>}
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
      {data && <><Card><SectionTitle title={data.transfer_number} icon="swap-horizontal-outline"/><View style={styles.row}><Badge title={data.direction}/><Badge title={data.status} positive={data.status==='received'}/></View><DetailRow label="Total units" value={String(data.items.reduce((sum,item)=>sum+Number(item.quantity),0))}/>{data.note && <Label muted>{data.note}</Label>}</Card>
      <SectionTitle title="Transfer items" icon="cube-outline"/>{data.items.map(item => { const product = Array.isArray(item.products) ? item.products[0] : item.products; return <Card key={item.product_id}><Label>{product?.name || 'Product unavailable'}</Label><Label muted>{[product?.sku, product?.size, product?.color].filter(Boolean).join(' · ')}</Label><DetailRow label="Quantity" value={`${item.quantity} units`}/></Card>; })}
      {action && data.canAct && <Button title={action === 'send' ? 'Send transfer' : 'Receive transfer'} busy={busy} disabled={!online || loading} onPress={confirmTransfer} />}
      {!data.canAct && <Label muted>Transfer actions need the database safety update.</Label>}
      {data.status==='draft'&&data.direction==='Outgoing'&&<Button title="Edit draft" secondary disabled={!online||busy} onPress={()=>setEditing(true)}/>}
      {editing&&<ManagementForm operation="transfer-save" id={id} scope={scope} online={online} workspace={workspace} close={()=>setEditing(false)} saved={()=>{setEditing(false);clearCache();refresh();}}/>}
      </>}
    <Button title="Refresh" secondary disabled={!online || loading || busy} onPress={refresh} />
  </ScrollView></SafeAreaView></Modal>;
}

function OrderSheet({ id, scope, online, onClose, canUpdate, canReturn, currency, incoming, scanned = false }: { id: string; scope: Scope; online: boolean; onClose: () => void; canUpdate: boolean; canReturn: boolean; currency: string; incoming: boolean; scanned?: boolean }) {
  const theme = useTheme();
  const { data, error, loading, refresh } = useData<Order>(`${incoming ? 'incoming-detail' : 'order'}?id=${encodeURIComponent(id)}`, scope, online);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [returning, setReturning] = useState(false);
  const [charts, setCharts] = useState(false);
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
      const Print = await import('expo-print');
      const result = await api<{ html: string; width?: number; height?: number; size?: string }>(`${shipping ? 'shipping-label' : 'receipt'}?id=${encodeURIComponent(id)}`, scope);
      await outputOrderDocument(result, share, shipping, Print, share ? await import('expo-sharing') : undefined);
    } catch (error) { theme.alert('Receipt', (error as Error).message); }
    finally { inFlight.current = false; setBusy(false); }
  }
  return <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { if (!busy) onClose(); }}>
    <ActionArea><SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}><ScrollView contentContainerStyle={styles.page}>
      <View style={[styles.row, { justifyContent: 'space-between' }]}><Label large>Order details</Label><Button title="Close" onPress={onClose} secondary disabled={busy} /></View>
      {loading && !data && <Shimmer/>}{error && <Label>{error}</Label>}
      {data && <><Card><SectionTitle title={data.orderNumber} icon="receipt-outline"/><View style={[styles.row,{flexWrap:'wrap'}]}><Badge title={data.status==='refunded'?'Returned':data.status} positive={data.status==='completed'}/><Badge title={data.paymentState} positive={data.paymentState==='paid'}/></View><Text style={{fontSize:34,fontWeight:'700',color:theme.text}}>{money(data.total,currency)}</Text><Label muted>Order total</Label></Card>
        <Card><SectionTitle title="Customer & delivery" icon="person-outline"/><DetailRow label="Customer" value={data.customerName}/><DetailRow label="Phone" value={data.customerPhone}/><DetailRow label="Address" value={data.customerAddress}/></Card>
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
        <SectionTitle title="Order items" icon="bag-handle-outline"/>{(data.items ?? []).map(item => <Card key={item.id}><View style={styles.row}><Pressable disabled={!item.imageUrl} accessibilityRole="button" onPress={() => setPhoto(item.imageUrl)} accessibilityLabel="View product image"><ProductPhoto uri={item.imageUrl} size={76}/></Pressable>
          <View style={{ flex: 1 }}><Label>{item.name}</Label><Label muted>{item.variant}</Label><Label>{`${item.quantity} items · ${money(item.subtotal, currency)}`}</Label></View></View></Card>)}
        {step && canUpdate && <Button title={step[1]} busy={busy} disabled={!online || !data.updatedAt || loading} onPress={() => theme.alert(theme.t(step[1]), `${data.orderNumber} — confirm this change?`, [
          { text: theme.t('Cancel'), style: 'cancel' }, { text: 'Confirm', onPress: () => void update(step[0]) },
        ])} />}
        <SectionTitle title="Order actions" icon="options-outline"/>
        <Button title="Print receipt" secondary disabled={!online || busy} onPress={() => void printReceipt(false)} />
        <Button title="Share PDF receipt" secondary disabled={!online || busy} onPress={() => void printReceipt(true)} />
        <Button title="Print shipping label" secondary disabled={!online || busy} onPress={() => void printReceipt(false, true)} />
        {canReturn && !incoming && <Button title="Return items / check refund" secondary disabled={!online || busy} onPress={() => setReturning(true)} />}
        <Button title={charts?'Hide item insights':'View item insights'} secondary onPress={()=>setCharts(value=>!value)}/>
        {charts&&<><Card><SectionTitle title="Item value breakdown" icon="pie-chart-outline"/><Label muted>Line values before order-level discounts and delivery.</Label><Donut rows={(data.items||[]).map(item=>({name:[item.name,item.variant].filter(Boolean).join(' · '),value:Number(item.subtotal)}))}/></Card><Card><SectionTitle title="Item ranking" icon="trophy-outline"/><Label muted>Ranked by quantity in this order.</Label><Ranking rows={(data.items||[]).map(item=>({name:[item.name,item.variant].filter(Boolean).join(' · '),value:Number(item.quantity)}))}/></Card><Card><SectionTitle title="Item quantities" icon="bar-chart-outline"/><ItemBars rows={(data.items||[]).map(item=>({name:[item.name,item.variant].filter(Boolean).join(' · '),value:Number(item.quantity)}))}/></Card></>}
      </>}
      {scanned && <View style={{height:80}}/>}
    </ScrollView>
    {scanned && canUpdate && data && ['new','pending'].includes(data.status) && <View style={{position:'absolute',bottom:28,right:20}}><Button title="Complete" busy={busy} disabled={!online || loading || !data.updatedAt} onPress={() => theme.alert('Complete order?', `Mark ${data.orderNumber} as completed? This does not collect or change payment.`, [{text:'Cancel',style:'cancel'},{text:'Complete',onPress:()=>void update('completed')}])}/></View>}
    <Photo uri={photo} close={() => setPhoto(null)} />
    {returning && <ReturnOrder id={id} scope={scope} online={online} close={() => { setReturning(false); refresh(); }} saved={() => { setReturning(false); clearCache(); refresh(); }} />}</SafeAreaView></ActionArea>
  </Modal>;
}

function Photo({ uri, close }: { uri: string | null; close: () => void }) {
  return <Modal visible={!!uri} transparent={false} onRequestClose={close} animationType="fade"><SafeAreaView style={{ flex: 1, backgroundColor: '#000', padding: 16 }}>
    <Button title="Close" onPress={close} />{uri && <ScrollView maximumZoomScale={4} minimumZoomScale={1} contentContainerStyle={{ flex: 1 }}><CachedImage source={{ uri }} style={{ flex: 1 }} contentFit="contain" cachePolicy="memory-disk" /></ScrollView>}
  </SafeAreaView></Modal>;
}
function Scanner({ onClose, onScan, order = false }: { onClose: () => void; onScan: (value: string) => void | Promise<void>; order?: boolean }) {
  const theme = useTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const scanned = useRef(false);
  return <Modal visible onRequestClose={() => { if (!busy) onClose(); }}><SafeAreaView style={{ flex: 1, backgroundColor: '#0f172a', padding: 20, gap: 20 }}>
    <Button title="Close" disabled={busy} onPress={onClose} /><Text style={{color:'#fff'}}>{order?'Scan a TENH POS order QR code.':'Scan a product barcode.'}</Text>
    {busy ? <View style={{flex:1,alignItems:'center',justifyContent:'center',gap:16}}><ActivityIndicator size="large" color="#fff"/><Text accessibilityRole="alert" style={{color:'#fff'}}>Loading order details…</Text></View> : error ? <View style={{gap:16}}><Text style={{color:'#fff'}}>{error}</Text><Button title="Scan again" onPress={()=>{scanned.current=false;setError(null);}}/></View> : permission?.granted ? <CameraView style={{ flex: 1 }} barcodeScannerSettings={{ barcodeTypes: order ? ['qr'] : ['ean13', 'ean8', 'code128', 'code39', 'upc_a', 'upc_e', 'qr'] }} onBarcodeScanned={async result => {
      if (scanned.current) return;
      scanned.current = true;
      setBusy(true);
      try { await onScan(result.data); }
      catch (failure) { const message = failure instanceof Error ? failure.message : 'Unable to open this order.'; setError(message); theme.alert('Scan failed', message); }
      finally { setBusy(false); }
    }} /> : <><Text style={{ color: '#fff' }}>Allow camera access to scan barcodes.</Text><Button title="Allow camera" onPress={() => void requestPermission()} />
      {permission && !permission.canAskAgain && <Button title="Open device settings" onPress={() => void Linking.openSettings()} />}</>}
  </SafeAreaView></Modal>;
}

export function OrderQrScanner({scope,online,permissions}:{scope:Scope;online:boolean;permissions:string[]}) {
  const theme=useTheme();
  const [scanning,setScanning]=useState(false);
  const [busy,setBusy]=useState(false);
  const [order,setOrder]=useState<{id:string;incoming:boolean;currency:string}|null>(null);
  const active=useRef(true);
  useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
  async function resolve(value:string){
    setBusy(true);
    try{
      const result=await api<{id:string;incoming:boolean;currency:string}>(`order-qr?value=${encodeURIComponent(value)}`,scope);
      const path = `${result.incoming ? 'incoming-detail' : 'order'}?id=${encodeURIComponent(result.id)}`;
      const data = await api<Order>(path, scope);
      if(active.current){
        cache.set(`${scope.userId}:${scope.businessId}:${scope.branchId}:${path}`, { data, at: Date.now() });
        setScanning(false);setOrder(result);
      }
    }
    finally{if(active.current)setBusy(false);}
  }
  return <><Pressable accessibilityRole="button" accessibilityLabel="Scan order QR code" disabled={!online||busy} onPress={()=>setScanning(true)} style={{padding:10,minHeight:44}}>{busy?<ActivityIndicator color={theme.text}/>:<Ionicons name="qr-code-outline" size={23} color={theme.text}/>}</Pressable>
    {scanning&&<Scanner order onClose={()=>setScanning(false)} onScan={resolve}/>}
    {order&&<OrderSheet scanned id={order.id} incoming={order.incoming} scope={scope} online={online} canUpdate={permissions.includes('orders.update')} canReturn={permissions.includes('orders.return')} currency={order.currency} onClose={()=>setOrder(null)}/>}
  </>;
}
