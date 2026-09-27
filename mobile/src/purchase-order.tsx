import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Crypto from 'expo-crypto';
import { api, ApiError, deviceStorage, type Scope } from './client';
import { Button, Card, Field, Label, styles, useTheme } from './ui';

type Request = { requestId: string; orderId: string; items: { itemId: string; quantity: number; expectedReceived: number }[] };
type Outcome = { purchaseOrderId?: string; rolledBack?: boolean; error?: string };
type Purchase = { po_number: string; supplier_name: string; status: string; notes: string | null; canReceive: boolean;
  items: { id: string; product_name: string; sku: string | null; ordered_quantity: number; received_quantity: number }[] };

export function PurchaseOrder({ id, scope, online, canUpdate, close, saved }: { id: string; scope: Scope; online: boolean; canUpdate: boolean; close: () => void; saved: () => void }) {
  const theme = useTheme();
  const key = `tenh-receiving-${scope.userId}-${scope.businessId}-${scope.branchId}-${id}`;
  const [order, setOrder] = useState<Purchase | null>(null);
  const [pending, setPending] = useState<Request | null>(null);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [rollback, setRollback] = useState(false);
  const [version, setVersion] = useState(0);
  const working = useRef(false), confirming = useRef(false);
  useEffect(() => {
    let active = true;
    if (!scope.userId) return;
    deviceStorage.getItem(key).then(value => { if (active) { if (value) setPending(JSON.parse(value)); setReady(true); } })
      .catch(() => { if (active) setError('Cannot restore receiving requests. Keep this device’s saved data and retry later.'); });
    return () => { active = false; };
  }, [key, scope.userId]);
  useEffect(() => {
    if (!online) return;
    const controller = new AbortController();
    api<Purchase>(`purchase-detail?id=${id}`, { businessId: scope.businessId, branchId: scope.branchId }, undefined, controller.signal)
      .then(data => { if (!controller.signal.aborted) { setOrder(data); setLoading(false); } })
      .catch(error => { if (!controller.signal.aborted) { setError(error.message); setLoading(false); setOrder(null); } });
    return () => controller.abort();
  }, [id, scope.businessId, scope.branchId, online, version]);
  async function run(operation: () => Promise<void>) {
    if (working.current || !online || !ready) return;
    working.current = true; setBusy(true); setError('');
    try { await operation(); } catch (error) { setError((error as Error).message); }
    finally { working.current = false; setBusy(false); }
  }
  async function finish() {
    await deviceStorage.removeItem(key); setPending(null);
    theme.alert('Stock received', 'Purchase quantities and branch stock are updated.'); saved();
  }
  async function submit(request: Request) {
    setRollback(false);
    try {
      const result = await api<{ data: Outcome }>('purchase-receive', scope, request);
      if (result.data?.purchaseOrderId !== id) throw new Error('Receiving is not confirmed. Keep this request.');
      await finish();
    } catch (error) { setRollback(error instanceof ApiError && error.uncertain === false); throw error; }
  }
  function review() {
    if (!order || working.current || confirming.current || pending || !ready || !online || !canUpdate || !order.canReceive) return;
    try {
      const items = order.items.flatMap(item => {
        const raw = quantities[item.id] || '0';
        if (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw)) || Number(raw) > 999999 || Number(raw) > item.ordered_quantity - item.received_quantity) throw new Error('Enter whole quantities within the remaining amount.');
        return Number(raw) ? [{ itemId: item.id, quantity: Number(raw), expectedReceived: item.received_quantity }] : [];
      });
      if (!items.length) throw new Error('Enter the quantities physically received.');
      const request: Request = { requestId: Crypto.randomUUID(), orderId: id, items };
      confirming.current = true;
      theme.alert('Receive stock?', `${items.reduce((sum, item) => sum + item.quantity, 0)} units will be added to this branch. Confirm only goods you have received.`, [
        { text: 'Cancel', style: 'cancel', onPress: () => { confirming.current = false; } },
        { text: 'Receive stock', onPress: () => { confirming.current = false; void run(async () => { await deviceStorage.setItem(key, JSON.stringify(request)); setPending(request); await submit(request); }); } },
      ], { cancelable: true, onDismiss: () => { confirming.current = false; } });
    } catch (error) { setError((error as Error).message); }
  }
  const canReceive = canUpdate && order?.canReceive && ['draft', 'sent', 'partial'].includes(order.status);
  return <Modal visible animationType="slide" onRequestClose={() => { if (!busy) close(); }}><SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}><ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
    <View style={[styles.row, { justifyContent: 'space-between' }]}><Label large>Purchase order</Label><Button title="Close" secondary disabled={busy} onPress={close} /></View>
    {loading && online && <ActivityIndicator />}{error && <Card><Label>{error}</Label></Card>}
    {!online && <Label>Connect to check receiving and update stock.</Label>}
    {pending ? <Card><Label large>Check receiving request</Label><Label>Do not enter these goods again. Check this request or retry the same ID.</Label><Label muted>{pending.requestId}</Label>
      <Button title="Check receiving" busy={busy} disabled={!online || !ready || !canUpdate} onPress={() => void run(async () => {
        const result = await api<{ data: Outcome | null }>(`purchase-receipt-status?id=${pending.requestId}`, scope);
        if (result.data?.purchaseOrderId === id) await finish();
        else if (result.data?.rolledBack === true) { setRollback(true); setError(result.data.error || 'Stock was not received. Review the quantities.'); }
        else setError('No confirmed result yet. Retry this same request; do not enter another receipt.');
      })} />
      <Button title="Retry same request" secondary disabled={!online || busy || !ready || !canUpdate} onPress={() => void run(() => submit(pending))} />
      {rollback && <Button title="Edit quantities" secondary disabled={!online || busy} onPress={() => void run(async () => { await deviceStorage.removeItem(key); setPending(null); setRollback(false); setQuantities({}); setOrder(null); setLoading(true); setVersion(v => v + 1); })} />}
    </Card> : order && <>
      <Card><Label large>{order.po_number}</Label><Label>{order.supplier_name || 'Supplier'}</Label><Label>{order.status}</Label>{order.notes && <Label muted>{order.notes}</Label>}</Card>
      {order.items.map(item => <Card key={item.id}><Label>{item.product_name}</Label><Label muted>{item.sku || ''}</Label>
        <Label>{`Ordered ${item.ordered_quantity} · Received ${item.received_quantity} · Remaining ${item.ordered_quantity - item.received_quantity}`}</Label>
        {canReceive && item.ordered_quantity > item.received_quantity && <Field label="Received now" keyboardType="number-pad" value={quantities[item.id] || ''} editable={!busy && online} onChangeText={value => setQuantities(rows => ({ ...rows, [item.id]: value }))} />}
      </Card>)}
      {canReceive && <Button title="Review received stock" disabled={!online || busy || !ready} onPress={review} />}
      {canUpdate && !order.canReceive && <Label>Mobile receiving needs the database safety update. You can still view this purchase order.</Label>}
    </>}
    <Button title="Refresh" secondary disabled={!online || busy || loading} onPress={() => { setError(''); setLoading(true); setVersion(v => v + 1); }} />
  </ScrollView></SafeAreaView></Modal>;
}
