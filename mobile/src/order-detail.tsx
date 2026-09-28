import React,{useRef,useState} from 'react';
import {Modal,Pressable,ScrollView,Text,View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Image as CachedImage} from 'expo-image';
import {api,money,type Order,type Scope} from './client';
import {ActionArea,Badge,Button,Card,DetailRow,Field,Label,ProductPhoto,SectionTitle,styles,useTheme} from './ui';
import {useData,invalidateCache} from './data';
import {Shimmer} from './loading';
import {ReturnOrder} from './return-order';
import {outputOrderDocument} from './order-document';

export function OrderSheet({ id, scope, online, onClose, canUpdate, canReturn, canCancel = false, currency, incoming, scanned = false }: { id: string; scope: Scope; online: boolean; onClose: () => void; canUpdate: boolean; canReturn: boolean; canCancel?: boolean; currency: string; incoming: boolean; scanned?: boolean }) {
  const theme = useTheme();
  const { data, error, loading, refresh } = useData<Order>(`${incoming ? 'incoming-detail' : 'order'}?id=${encodeURIComponent(id)}`, scope, online);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [returning, setReturning] = useState(false);
  const [cancelItem, setCancelItem] = useState<{id:string;name:string}|null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [editing, setEditing] = useState(false);
  const [edit, setEdit] = useState({ note: '', guestName: '', guestPhone: '', guestAddress: '' });
  const activeStatus = data && ['new', 'pending', 'in_progress'].includes(data.status);
  const display = (value: string) => value === 'pending' || value === 'accepted' ? 'Confirmed' : ['preparing','ready','in_progress'].includes(value) ? 'In Progress' : value.replaceAll('_', ' ').replace(/^./, letter => letter.toUpperCase());
  const nextStatus = !data ? null : incoming
    ? ({new:['accepted','Confirmed'],accepted:['preparing','In Progress'],preparing:['completed','Complete'],ready:['completed','Complete']} as Record<string,string[]>)[data.onlineStatus||'new']
    : ({new:['pending','Confirmed'],pending:['in_progress','In Progress'],in_progress:['completed','Complete']} as Record<string,string[]>)[data.status];
  function action(title: string, description: string, icon: React.ComponentProps<typeof Ionicons>['name'], onPress: () => void, disabled = false, warning = false) {
    const color = warning ? (theme.dark ? '#ffc38b' : '#b45309') : (theme.dark ? '#91b4ff' : '#275de8');
    return <Pressable accessibilityRole="button" accessibilityLabel={theme.t(title)} disabled={disabled} onPress={onPress} style={{flexDirection:'row',alignItems:'center',gap:12,padding:14,borderWidth:1,borderColor:theme.border,borderRadius:14,backgroundColor:warning?(theme.dark?'#362b22':'#fff8f0'):theme.background,opacity:disabled?0.4:1}}>
      <Ionicons name={icon} size={24} color={color}/><View style={{flex:1,gap:4}}><Text style={{color,fontSize:15,fontWeight:'600'}}>{theme.t(title)}</Text><Text style={{color:theme.muted,fontSize:12}}>{theme.t(description)}</Text></View><Ionicons name="chevron-forward" size={18} color={color}/>
    </Pressable>;
  }
  async function update(status: string) {
    if (!data || !online || inFlight.current) return;
    inFlight.current = true; setBusy(true);
    try { await api(incoming ? 'incoming-status' : 'order', scope, { id, updatedAt: data.updatedAt, status: incoming && status === 'pending' ? 'accepted' : status }); invalidateCache(scope,['order?id=','orders?','incoming?','incoming-detail?id=','reports?']); refresh(); }
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
    <ActionArea><SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}><ScrollView contentContainerStyle={[styles.page,{paddingBottom:activeStatus?110:24}]}>
      <View style={[styles.row, { justifyContent: 'space-between' }]}><Label large>Order details</Label><Button title="Close" onPress={onClose} secondary disabled={busy} /></View>
      {loading && !data && <Shimmer/>}{error && <Label>{error}</Label>}
      {data && <><Card><SectionTitle title={data.orderNumber} icon="receipt-outline"/><View style={[styles.row,{flexWrap:'wrap'}]}><Badge title={data.status==='refunded'?'Returned':incoming&&['preparing','ready'].includes(data.onlineStatus||'')?'In Progress':display(data.status)} positive={data.status==='completed'}/><Badge title={display(data.paymentState)} positive={data.paymentState==='paid'}/></View><Text style={{fontSize:34,fontWeight:'700',color:theme.text}}>{money(data.total,currency)}</Text><Label muted>Order total</Label><View style={{borderTopWidth:1,borderColor:theme.border,paddingTop:14,gap:8}}><View style={styles.row}><Ionicons name="calendar-outline" size={18} color={theme.muted}/><Label muted>{new Date(data.createdAt).toLocaleString()}</Label></View><View style={styles.row}><Ionicons name="card-outline" size={18} color={theme.muted}/><Label muted>{display(data.paymentMethod || 'Not specified')}</Label></View></View></Card>
        <Card><SectionTitle title="Customer & delivery" icon="person-outline"/><DetailRow label="Customer" value={data.customerName}/><DetailRow label="Phone" value={data.customerPhone}/><DetailRow label="Address" value={data.customerAddress}/></Card>
        {incoming && data.paymentMethod === 'khqr' && <Button title="View payment proof" secondary disabled={!online || busy} onPress={() => {
          if (inFlight.current) return; inFlight.current = true; setBusy(true);
          api<{ url: string }>(`proof?id=${id}`, scope).then(result => setPhoto(result.url)).catch(error => theme.alert('Payment proof', error.message)).finally(() => { inFlight.current = false; setBusy(false); });
        }} />}
        {incoming && data.paymentMethod === 'khqr' && data.paymentState === 'pending_verification' && canUpdate && <Button title="Confirm payment received" disabled={!online || busy} onPress={() => theme.alert('Verify your bank account', 'A screenshot does not confirm payment. Only continue after checking that the money arrived in the store bank account.', [
          { text: 'Cancel', style: 'cancel' }, { text: 'Payment received', onPress: () => {
            if (inFlight.current) return; inFlight.current = true; setBusy(true);
            api('payment', scope, { id, status: 'paid' }).then(() => { invalidateCache(scope,['order?id=','orders?','incoming?','incoming-detail?id=','reports?']); refresh(); }).catch(error => { theme.alert('Check payment status', error.message); refresh(); }).finally(() => { inFlight.current = false; setBusy(false); });
          } },
        ])} />}
        <Card><SectionTitle title="Order items" icon="bag-handle-outline"/>{(data.items ?? []).map(item => <View key={item.id} style={{paddingVertical:12,borderTopWidth:1,borderColor:theme.border}}><View style={styles.row}><Pressable disabled={!item.imageUrl} accessibilityRole="button" onPress={() => setPhoto(item.imageUrl)} accessibilityLabel="View product image"><ProductPhoto uri={item.imageUrl} size={76}/></Pressable>
          <View style={{ flex: 1 }}><Label>{item.name}</Label><Label muted>{item.variant}</Label><Label>{`${item.quantity} items · ${money(item.subtotal, currency)}`}</Label></View><Label>{money(item.subtotal,currency)}</Label></View>{canCancel&&['online','qr'].includes(data.source)&&data.paymentState==='unpaid'&&!data.discount&&!data.couponCode&&activeStatus&&<Button title="Cancel Item" secondary disabled={!online||busy} onPress={()=>{setCancelItem({id:item.id,name:item.name});setCancelReason('');}}/>}</View>)}</Card>
        <Card><SectionTitle title="Order actions" icon="settings-outline"/>
        {canUpdate && action('Edit order','Update customer or delivery details','create-outline',()=>{setEdit({note:data.note||'',guestName:data.guestName??data.customerName,guestPhone:data.guestPhone??data.customerPhone??'',guestAddress:data.guestAddress??data.customerAddress??''});setEditing(true);},!online||busy||loading||!data.updatedAt||['cancelled','refunded'].includes(data.status))}
        {action('Print','Choose receipt or shipping label','print-outline',()=>theme.alert('Print','Choose a document',[{text:'Receipt',onPress:()=>void printReceipt(false)},{text:'Label',onPress:()=>void printReceipt(false,true)},{text:'Cancel',style:'cancel'}]),!online||busy)}
        {action('Share PDF receipt','Share or save a PDF version','share-outline',()=>void printReceipt(true),!online||busy)}
        {canReturn && action('Return items / check refund','Process a return or check refund status','return-up-back-outline',()=>setReturning(true),!online||busy,true)}
        </Card>

      </>}

    </ScrollView>
    {canUpdate && data && activeStatus && nextStatus && <View style={{position:'absolute',bottom:28,left:24,right:24}}><Button title={nextStatus[1]} busy={busy} disabled={!online||loading||!data.updatedAt} onPress={()=>void update(nextStatus[0])}/></View>}
    {cancelItem && data && <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={()=>{if(!busy)setCancelItem(null);}}><SafeAreaView style={{flex:1,backgroundColor:theme.background}}><ScrollView contentContainerStyle={styles.page}><Card><SectionTitle title={`Cancel ${cancelItem.name}`} icon="close-circle-outline"/><Label muted>Stock is restored. Paid or discounted orders must use Return items / check refund.</Label><Field label="Reason" value={cancelReason} onChangeText={setCancelReason} maxLength={500}/><Button title="Cancel Item" busy={busy} disabled={!online||!cancelReason.trim()||!data.updatedAt} onPress={()=>{if(inFlight.current)return;inFlight.current=true;setBusy(true);void api('order-item-cancel',scope,{id,itemId:cancelItem.id,updatedAt:data.updatedAt,reason:cancelReason}).then(()=>{setCancelItem(null);invalidateCache(scope,['order?id=','orders?','incoming?','incoming-detail?id=','stock?','reports?']);refresh();}).catch(error=>theme.alert('Unable to cancel item',error.message)).finally(()=>{inFlight.current=false;setBusy(false);});}}/><Button title="Keep Item" secondary disabled={busy} onPress={()=>setCancelItem(null)}/></Card></ScrollView></SafeAreaView></Modal>}
    {editing && data && <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={()=>{if(!busy)setEditing(false);}}><SafeAreaView style={{flex:1,backgroundColor:theme.background}}><ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled"><Card><SectionTitle title="Edit order" icon="create-outline"/>{([ ['guestName','Customer name'], ['guestPhone','Phone'], ['guestAddress','Address'], ['note','Note'] ] as const).map(([key,label]) => <Field key={key} label={label} value={edit[key]} editable={!busy} onChangeText={value=>setEdit(previous=>({...previous,[key]:value}))} maxLength={key==='note'?2000:500}/>)}<Button title="Save changes" busy={busy} disabled={!online || loading} onPress={()=>theme.alert('Save order changes?', data.orderNumber, [{text:'Cancel',style:'cancel'},{text:'Save',onPress:()=>{if(inFlight.current)return;inFlight.current=true;setBusy(true);void api('order',scope,{id,updatedAt:data.updatedAt,action:'edit',...edit}).then(()=>{setEditing(false);invalidateCache(scope,['order?id=','orders?','incoming?','incoming-detail?id=']);refresh();}).catch(error=>theme.alert('Unable to save',error.message)).finally(()=>{inFlight.current=false;setBusy(false);});}}])}/><Button title="Cancel" secondary disabled={busy} onPress={()=>setEditing(false)}/></Card></ScrollView></SafeAreaView></Modal>}
    <Photo uri={photo} close={() => setPhoto(null)} />
    {returning && <ReturnOrder currency={currency} id={id} scope={scope} online={online} close={() => { setReturning(false); refresh(); }} saved={() => { setReturning(false); invalidateCache(scope,['order?id=','orders?','incoming?','reports?','stock?']); refresh(); }} />}</SafeAreaView></ActionArea>
  </Modal>;
}

export function Photo({ uri, close }: { uri: string | null; close: () => void }) {
  return <Modal visible={!!uri} transparent={false} onRequestClose={close} animationType="fade"><SafeAreaView style={{ flex: 1, backgroundColor: '#000', padding: 16 }}>
    <Button title="Close" onPress={close} />{uri && <ScrollView maximumZoomScale={4} minimumZoomScale={1} contentContainerStyle={{ flex: 1 }}><CachedImage source={{ uri }} style={{ flex: 1 }} contentFit="contain" cachePolicy="memory-disk" /></ScrollView>}
  </SafeAreaView></Modal>;
}
