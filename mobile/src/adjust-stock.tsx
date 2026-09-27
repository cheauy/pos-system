import React, { useEffect, useRef, useState } from 'react';
import { Modal, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Crypto from 'expo-crypto';
import { api, ApiError, deviceStorage, type Scope } from './client';
import { Button, Card, Field, Label, styles, useTheme } from './ui';

export function AdjustStock({ product, scope, online, close }: { product: { id: string; name: string; quantity: number }; scope: Scope; online: boolean; close: () => void }) {
  const theme = useTheme();
  const key = `adjust-${scope.userId}-${scope.businessId}-${scope.branchId}-${product.id}`;
  const [quantity, setQuantity] = useState(String(product.quantity));
  const [reason, setReason] = useState('Stock count');
  const [pending, setPending] = useState<Record<string, string> | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const working = useRef(false);
  useEffect(() => {
    let active = true;
    deviceStorage.getItem(key).then(value => {
      if (!active) return;
      if (value) { const data = JSON.parse(value); setPending(data); setQuantity(data.quantity); setReason(data.reason); }
      setReady(true);
    }).catch(() => { if (active) setError('The saved adjustment cannot be read. Check this product on the website before making another adjustment.'); });
    return () => { active = false; };
  }, [key]);
  async function save() {
    if (working.current || !online || !ready) return;
    if (!/^\d+$/.test(quantity) || !Number.isSafeInteger(Number(quantity)) || Number(quantity) > 2147483647 || reason.trim().length < 2) { setError('Enter a whole-number stock count and a reason.'); return; }
    working.current = true; setBusy(true); setError('');
    try {
      const body = pending ?? { requestId: Crypto.randomUUID(), productId: product.id, mode: 'set', expectedQuantity: String(product.quantity), quantity, reason };
      if (!pending) { await deviceStorage.setItem(key, JSON.stringify(body)); setPending(body); }
      await api('adjustment', scope, body);
      await deviceStorage.removeItem(key);
      close();
    } catch (error) {
      if (error instanceof ApiError && error.status === 409 && error.uncertain !== true) {
        await deviceStorage.removeItem(key).catch(() => undefined); setPending(null);
      }
      setError(`${(error as Error).message} An unconfirmed request must be retried with the same details.`);
    } finally { working.current = false; setBusy(false); }
  }
  return <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { if (!busy) close(); }}><SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}><ScrollView contentContainerStyle={styles.page}>
    <Label large>Count stock</Label><Card><Label>{product.name}</Label><Label muted>{`Last loaded stock: ${product.quantity}`}</Label>
      <Field label="Actual quantity *" value={quantity} onChangeText={setQuantity} keyboardType="number-pad" editable={ready && !busy && !pending} />
      <Field label="Reason *" value={reason} onChangeText={setReason} maxLength={100} editable={ready && !busy && !pending} />
    </Card>{pending && <Card><Label>A saved adjustment is waiting for confirmation. Retry reuses its request ID.</Label></Card>}{error && <Label>{error}</Label>}
    <Button title={pending ? 'Retry same adjustment' : 'Save stock count'} busy={busy} disabled={!online || !ready} onPress={() => theme.alert('Confirm stock count', 'This sets the branch stock to the counted quantity. A changed stock balance will require a fresh count.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Confirm', onPress: () => void save() }])} />
    <Button title="Close" secondary disabled={busy} onPress={close} />
  </ScrollView></SafeAreaView></Modal>;
}
