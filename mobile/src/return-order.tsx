import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';
import { api, ApiError, money, deviceStorage, type Scope } from './client';
import { Button, Card, DetailRow, Field, Label, ProductPhoto, SectionTitle, styles, useTheme } from './ui';

type ReturnRequest = { requestId: string; orderId: string; reason: string; refundMethod: string; items: { order_item_id: string; quantity: number }[] };
type ReturnableOrder = { orderNumber: string; status: string; items: { id: string; name: string; variant: string | null; quantity: number; returnedQuantity: number; imageUrl: string | null; unitPrice: number }[] };
const reasons = ['Incorrect Size or Fit', 'Defective or Damaged', 'Not as Described', 'Wrong Item Sent', "Buyer's Remorse / Changed Mind", 'Other'];

export function ReturnOrder({ id, scope, online, close, saved, currency }: { id: string; scope: Scope; online: boolean; close: () => void; saved: () => void; currency: string }) {
  const theme = useTheme();
  const key = `tenh-return-${scope.userId}-${scope.businessId}-${scope.branchId}-${id}`;
  const [order, setOrder] = useState<ReturnableOrder | null>(null);
  const [pending, setPending] = useState<ReturnRequest | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reason, setReason] = useState(reasons[0]);
  const [other, setOther] = useState('');
  const [method, setMethod] = useState('cash');
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [rollback, setRollback] = useState(false);
  const working = useRef(false);
  const confirming = useRef(false);
  useEffect(() => {
    let active = true;
    if (!scope.userId) return;
    deviceStorage.getItem(key).then(value => { if (active) { if (value) setPending(JSON.parse(value)); setReady(true); } })
      .catch(() => { if (active) setError('Cannot restore refund requests. Keep this device’s saved data and retry later.'); });
    return () => { active = false; };
  }, [key, scope.userId]);
  useEffect(() => {
    if (!online) return;
    const controller = new AbortController();
    api<ReturnableOrder>(`returns?id=${id}`, { businessId: scope.businessId, branchId: scope.branchId }, undefined, controller.signal)
      .then(data => { if (!controller.signal.aborted) { setOrder(data); setError(''); } })
      .catch(error => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, [id, scope.businessId, scope.branchId, online]);
  async function run(operation: () => Promise<void>) {
    if (working.current || !online || !ready) return;
    working.current = true; setBusy(true); setError('');
    try { await operation(); }
    catch (error) { setError((error as Error).message); }
    finally { working.current = false; setBusy(false); }
  }
  async function finish() {
    await deviceStorage.removeItem(key); setPending(null);
    theme.alert('Return recorded', 'Items returned and refund recorded.'); saved();
  }
  async function submit(request: ReturnRequest) {
    setRollback(false);
    try { const result = await api<{ data: { returnId: string } }>('returns', scope, request); if (!result.data?.returnId) throw new Error('Refund result is not confirmed. Keep this request.'); await finish(); }
    catch (error) { setRollback(error instanceof ApiError && error.uncertain === false); throw error; }
  }
  const selectedItems = order?.items.reduce((sum,item)=>sum+(Number(quantities[item.id])||0),0) ?? 0;
  const estimatedRefund = order?.items.reduce((sum,item)=>sum+(Number(quantities[item.id])||0)*item.unitPrice,0) ?? 0;
  return <Modal visible animationType="slide" onRequestClose={() => { if (!busy) close(); }}><SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}><ScrollView contentContainerStyle={[styles.page,{paddingBottom:24}]} keyboardShouldPersistTaps="handled">
    <View style={[styles.row, { justifyContent: 'space-between' }]}><Label large>Return items</Label><Button title="Close" secondary disabled={busy} onPress={close} /></View>
    <Label>{order?.orderNumber}</Label>{!ready && <ActivityIndicator />}{error && <Card><Label>{error}</Label></Card>}
    {pending ? <Card><Label large>Check refund request</Label><Label>Do not pay the customer twice. Check this request or retry the same refund ID.</Label><Label muted>{pending.requestId}</Label>
      <Button title="Check refund" busy={busy} disabled={!online || !ready} onPress={() => void run(async () => { const result = await api<{ data: { returnId?: string; rolledBack?: boolean; error?: string } | null }>(`return-status?id=${pending.requestId}`, scope); if (result.data?.returnId) await finish(); else if (result.data?.rolledBack === true) { setRollback(true); setError(result.data.error || 'Refund not saved. Review the details.'); } else setError('No confirmed refund yet. Retry this same request; do not create a new refund.'); })} />
      <Button title="Retry same refund" secondary disabled={!online || busy || !ready} onPress={() => void run(() => submit(pending))} />
      {rollback && <Button title="Edit return details" secondary disabled={busy} onPress={() => void run(async () => { await deviceStorage.removeItem(key); setPending(null); setRollback(false); setOrder(await api<ReturnableOrder>(`returns?id=${id}`, scope)); })} />}
    </Card> : order && <>
      {order.items.filter(item => item.quantity > item.returnedQuantity).map(item => <Card key={item.id}>
        <View style={styles.row}><ProductPhoto uri={item.imageUrl} size={76}/><View style={{flex:1,gap:6}}><Label>{item.name}</Label><Label muted>{item.variant}</Label><Label muted>{`${item.quantity-item.returnedQuantity} available to return`}</Label></View></View>
        <View style={{borderTopWidth:1,borderColor:theme.border,paddingTop:14}}><Field label="Return quantity" placeholder={`Enter quantity (max ${item.quantity-item.returnedQuantity})`} keyboardType="number-pad" value={quantities[item.id] || ''} editable={!busy} onChangeText={value => {if(/^\d*$/.test(value)&&Number(value)<=item.quantity-item.returnedQuantity)setQuantities(rows=>({...rows,[item.id]:value}));}} /></View>
      </Card>)}
      <SectionTitle title="Return reason" icon="document-text-outline"/><Label muted>Why is this item being returned?</Label>
      {reasons.map(value=><Pressable key={value} accessibilityRole="radio" accessibilityState={{checked:reason===value,disabled:busy}} disabled={busy} onPress={()=>setReason(value)} style={{flexDirection:'row',alignItems:'center',gap:14,padding:16,borderRadius:14,borderWidth:1,borderColor:reason===value?'#3970ff':theme.border,backgroundColor:reason===value?(theme.dark?'#233858':'#e9f0ff'):theme.panel}}>
        <Ionicons name={reason===value?'radio-button-on':'radio-button-off'} size={24} color={reason===value?'#275de8':theme.muted}/><Text style={{flex:1,color:reason===value?(theme.dark?'#91b4ff':'#275de8'):theme.text,fontSize:14,fontWeight:'600'}}>{theme.t(value)}</Text>
      </Pressable>)}
      {reason === 'Other' && <Field label="Reason" value={other} maxLength={500} editable={!busy} onChangeText={setOther} />}
      <SectionTitle title="Refund method" icon="card-outline"/><Label muted>How should the customer be refunded?</Label><View style={[styles.row, { flexWrap: 'wrap' }]}>{[['cash', 'Cash'], ['bank_transfer', 'Bank transfer'], ['other', 'Other']].map(([value, title]) => <Button key={value} title={title} secondary={method !== value} disabled={busy} onPress={() => setMethod(value)} />)}</View>
      <Label muted>This records the refund in your books. Bank transfers must be paid separately through your bank.</Label>
      <Card><SectionTitle title="Order summary" icon="receipt-outline"/><Label muted>Review the details before continuing.</Label><DetailRow label="Items to return" value={String(selectedItems)}/><DetailRow label="Estimated refund" value={money(estimatedRefund,currency)}/><DetailRow label="Method" value={method==='bank_transfer'?'Bank transfer':method==='cash'?'Cash':'Other'}/></Card>
    </>}
  </ScrollView>{order&&!pending&&<View style={{padding:16,gap:8,borderTopWidth:1,borderColor:theme.border,backgroundColor:theme.panel}}>
      <Button title="Review return" disabled={!online || busy || !ready || selectedItems===0 || order.status !== 'completed'} onPress={() => {
        if (confirming.current || working.current || pending) return;
        try {
          const items = order.items.flatMap(item => {
            const raw = quantities[item.id] || '0';
            if (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw)) || Number(raw) > item.quantity - item.returnedQuantity) throw new Error('Choose whole quantities within the remaining items.');
            return Number(raw) ? [{ order_item_id: item.id, quantity: Number(raw) }] : [];
          });
          const text = (reason === 'Other' ? other : reason).trim();
          if (!items.length || text.length < 3) throw new Error('Choose return items and enter a reason.');
          const request = { requestId: Crypto.randomUUID(), orderId: id, reason: text, refundMethod: method, items };
          confirming.current = true;
          theme.alert('Record return and refund?', `${items.reduce((sum, item) => sum + item.quantity, 0)} items · ${method.replace('_', ' ')}. Stock and refund records will update.`, [{ text: 'Cancel', style: 'cancel', onPress: () => { confirming.current = false; } }, { text: 'Confirm refund', onPress: () => { confirming.current = false; void run(async () => { await deviceStorage.setItem(key, JSON.stringify(request)); setPending(request); await submit(request); }); } }], { cancelable: true, onDismiss: () => { confirming.current = false; } });
        } catch (error) { setError((error as Error).message); }
      }} />
      {order.status !== 'completed' && <Label>This order cannot be returned in its current status.</Label>}</View>}</SafeAreaView></Modal>;
}
