import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Crypto from 'expo-crypto';
import { api, ApiError, deviceStorage, type Scope } from './client';
import { Button, Card, Field, Label, styles, useTheme } from './ui';

type ReturnRequest = { requestId: string; orderId: string; reason: string; refundMethod: string; items: { order_item_id: string; quantity: number }[] };
type ReturnableOrder = { orderNumber: string; status: string; items: { id: string; name: string; variant: string | null; quantity: number; returnedQuantity: number }[] };
const reasons = ['Incorrect Size or Fit', 'Defective or Damaged', 'Not as Described', 'Wrong Item Sent', "Buyer's Remorse / Changed Mind", 'Other'];

export function ReturnOrder({ id, scope, online, close, saved }: { id: string; scope: Scope; online: boolean; close: () => void; saved: () => void }) {
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
  return <Modal visible animationType="slide" onRequestClose={() => { if (!busy) close(); }}><SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}><ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
    <View style={[styles.row, { justifyContent: 'space-between' }]}><Label large>Return items</Label><Button title="Close" secondary disabled={busy} onPress={close} /></View>
    <Label>{order?.orderNumber}</Label>{!ready && <ActivityIndicator />}{error && <Card><Label>{error}</Label></Card>}
    {pending ? <Card><Label large>Check refund request</Label><Label>Do not pay the customer twice. Check this request or retry the same refund ID.</Label><Label muted>{pending.requestId}</Label>
      <Button title="Check refund" busy={busy} disabled={!online || !ready} onPress={() => void run(async () => { const result = await api<{ data: { returnId?: string; rolledBack?: boolean; error?: string } | null }>(`return-status?id=${pending.requestId}`, scope); if (result.data?.returnId) await finish(); else if (result.data?.rolledBack === true) { setRollback(true); setError(result.data.error || 'Refund not saved. Review the details.'); } else setError('No confirmed refund yet. Retry this same request; do not create a new refund.'); })} />
      <Button title="Retry same refund" secondary disabled={!online || busy || !ready} onPress={() => void run(() => submit(pending))} />
      {rollback && <Button title="Edit return details" secondary disabled={busy} onPress={() => void run(async () => { await deviceStorage.removeItem(key); setPending(null); setRollback(false); setOrder(await api<ReturnableOrder>(`returns?id=${id}`, scope)); })} />}
    </Card> : order && <>
      {order.items.filter(item => item.quantity > item.returnedQuantity).map(item => <Card key={item.id}><Label>{item.name}</Label><Label muted>{item.variant}</Label><Label>{`${item.quantity - item.returnedQuantity} available to return`}</Label><Field label="Return quantity" keyboardType="number-pad" value={quantities[item.id] || ''} editable={!busy} onChangeText={value => setQuantities(rows => ({ ...rows, [item.id]: value }))} /></Card>)}
      <Label>Return reason</Label>{reasons.map(value => <Button key={value} title={value} secondary={reason !== value} disabled={busy} onPress={() => setReason(value)} />)}
      {reason === 'Other' && <Field label="Reason" value={other} maxLength={500} editable={!busy} onChangeText={setOther} />}
      <Label>Refund method</Label><View style={[styles.row, { flexWrap: 'wrap' }]}>{[['cash', 'Cash'], ['bank_transfer', 'Bank transfer'], ['other', 'Other']].map(([value, title]) => <Button key={value} title={title} secondary={method !== value} disabled={busy} onPress={() => setMethod(value)} />)}</View>
      <Label muted>This records the refund in your books. Bank transfers must be paid separately through your bank.</Label>
      <Button title="Review return" disabled={!online || busy || !ready || order.status !== 'completed'} onPress={() => {
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
      {order.status !== 'completed' && <Label>This order cannot be returned in its current status.</Label>}
    </>}
  </ScrollView></SafeAreaView></Modal>;
}
