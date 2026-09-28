import React,{useRef,useState} from 'react';
import {Modal,Pressable,ScrollView,Text,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Image as CachedImage} from 'expo-image';
import {api,money,type Order,type Scope} from './client';
import {ActionArea,Badge,Button,Card,DetailRow,Field,Label,ProductPhoto,SectionTitle,styles,useTheme} from './ui';
import {useData,clearCache} from './data';
import {Shimmer} from './loading';
import {ReturnOrder} from './return-order';
import {outputOrderDocument} from './order-document';

export function OrderSheet({ id, scope, online, onClose, canUpdate, canReturn, currency, incoming, scanned = false }: { id: string; scope: Scope; online: boolean; onClose: () => void; canUpdate: boolean; canReturn: boolean; currency: string; incoming: boolean; scanned?: boolean }) {
  const theme = useTheme();
  const { data, error, loading, refresh } = useData<Order>(`${incoming ? 'incoming-detail' : 'order'}?id=${encodeURIComponent(id)}`, scope, online);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [returning, setReturning] = useState(false);
  const [editing, setEditing] = useState(false);
  const [edit, setEdit] = useState({ note: '', guestName: '', guestPhone: '', guestAddress: '' });
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
        {canUpdate && <Button title="Edit order" secondary disabled={!online || busy || loading || !data.updatedAt || ['cancelled','refunded'].includes(data.status)} onPress={() => { setEdit({ note: data.note || '', guestName: data.guestName ?? data.customerName, guestPhone: data.guestPhone ?? data.customerPhone ?? '', guestAddress: data.guestAddress ?? data.customerAddress ?? '' }); setEditing(true); }} />}
        {canUpdate && !step && ['new','pending'].includes(data.status) && <Button title="Complete order" disabled={!online || busy || loading || !data.updatedAt} onPress={() => theme.alert('Complete order?', 'This changes the order status without collecting payment.', [{text:'Cancel',style:'cancel'},{text:'Complete',onPress:()=>void update('completed')}])}/>}
        {editing && <Card><SectionTitle title="Edit order" icon="create-outline"/>{([ ['guestName','Customer name'], ['guestPhone','Phone'], ['guestAddress','Address'], ['note','Note'] ] as const).map(([key,label]) => <Field key={key} label={label} value={edit[key]} editable={!busy} onChangeText={value=>setEdit(previous=>({...previous,[key]:value}))} maxLength={key==='note'?2000:500}/>)}<Button title="Save changes" busy={busy} disabled={!online || loading} onPress={()=>theme.alert('Save order changes?', data.orderNumber, [{text:'Cancel',style:'cancel'},{text:'Save',onPress:()=>{if(inFlight.current)return;inFlight.current=true;setBusy(true);void api('order',scope,{id,updatedAt:data.updatedAt,action:'edit',...edit}).then(()=>{setEditing(false);clearCache();refresh();}).catch(error=>theme.alert('Unable to save',error.message)).finally(()=>{inFlight.current=false;setBusy(false);});}}])}/><Button title="Cancel" secondary disabled={busy} onPress={()=>setEditing(false)}/></Card>}
        <Button title="Print receipt" secondary disabled={!online || busy} onPress={() => void printReceipt(false)} />
        <Button title="Share PDF receipt" secondary disabled={!online || busy} onPress={() => void printReceipt(true)} />
        <Button title="Print shipping label" secondary disabled={!online || busy} onPress={() => void printReceipt(false, true)} />
        {canReturn && <Button title="Return items / check refund" secondary disabled={!online || busy} onPress={() => setReturning(true)} />}
      </>}
      {scanned && <View style={{height:80}}/>}
    </ScrollView>
    {scanned && canUpdate && data && ['new','pending'].includes(data.status) && <View style={{position:'absolute',bottom:28,right:20}}><Button title="Complete" busy={busy} disabled={!online || loading || !data.updatedAt} onPress={() => theme.alert('Complete order?', `Mark ${data.orderNumber} as completed? This does not collect or change payment.`, [{text:'Cancel',style:'cancel'},{text:'Complete',onPress:()=>void update('completed')}])}/></View>}
    <Photo uri={photo} close={() => setPhoto(null)} />
    {returning && <ReturnOrder id={id} scope={scope} online={online} close={() => { setReturning(false); refresh(); }} saved={() => { setReturning(false); clearCache(); refresh(); }} />}</SafeAreaView></ActionArea>
  </Modal>;
}

export function Photo({ uri, close }: { uri: string | null; close: () => void }) {
  return <Modal visible={!!uri} transparent={false} onRequestClose={close} animationType="fade"><SafeAreaView style={{ flex: 1, backgroundColor: '#000', padding: 16 }}>
    <Button title="Close" onPress={close} />{uri && <ScrollView maximumZoomScale={4} minimumZoomScale={1} contentContainerStyle={{ flex: 1 }}><CachedImage source={{ uri }} style={{ flex: 1 }} contentFit="contain" cachePolicy="memory-disk" /></ScrollView>}
  </SafeAreaView></Modal>;
}
