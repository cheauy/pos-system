import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { money } from './client';
import { Badge, ProductPhoto, useTheme } from './ui';

export function OrderCard({ order, grid, currency, open }: { order: { id: string; [key: string]: unknown }; grid: boolean; currency?: string; open: () => void }) {
  const theme = useTheme(), text = (key: string) => String(order[key] ?? '');
  const photos = Array.isArray(order.itemsPreview) ? order.itemsPreview as { imageUrl: string | null; fallbackImageUrl: string | null }[] : [];
  const customer = text('customerName').trim() || 'Walk-in customer';
  const created = order.createdAt ? new Date(text('createdAt')) : null;
  const paid = order.paymentState === 'paid';
  const display = (value: string) => value.replaceAll('_', ' ').replace(/^./, letter => letter.toUpperCase());
  return <Pressable accessibilityRole="button" accessibilityLabel={`View order ${text('orderNumber')}, ${customer}`} onPress={open} style={({ pressed }) => ({ padding: 12, borderRadius: 16, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.panel, flexDirection: grid ? 'column' : 'row', alignItems: grid ? 'stretch' : 'center', gap: 10, height:grid?'100%':undefined, opacity: pressed ? 0.7 : 1 })}>
    <ProductPhoto uri={photos[0]?.imageUrl} fallbackUri={photos[0]?.fallbackImageUrl} size={grid ? 56 : 46}/>
    <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
      <Text numberOfLines={1} style={{ color: theme.text, fontSize: 14, fontWeight: '700' }}>{customer}</Text>
      <Text numberOfLines={1} style={{ color: theme.muted, fontSize: 12 }}>{text('orderNumber')}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}><Ionicons name="card-outline" size={13} color={paid ? (theme.dark ? '#8cdec0' : '#23785a') : theme.muted}/><Text numberOfLines={1} style={{ flex: 1, fontSize: 11, color: paid ? (theme.dark ? '#8cdec0' : '#23785a') : theme.muted }}>{theme.t(display(text('paymentState')))}</Text></View>
      {created && Number.isFinite(created.getTime()) && <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}><Ionicons name="time-outline" size={12} color={theme.muted}/><Text numberOfLines={1} style={{ flex: 1, fontSize: 10, color: theme.muted }}>{created.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · {created.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</Text></View>}
    </View>
    <View style={{ alignItems: grid ? 'flex-start' : 'flex-end', gap: 8, maxWidth: grid ? '100%' : '30%', flexShrink: 1 }}>
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={{ color: theme.text, fontSize: 15, fontWeight: '700' }}>{money(Number(order.total), currency)}</Text>
      <Badge title={text('status') === 'refunded' ? 'Returned' : display(text('status'))} positive={order.status === 'completed'}/>
    </View>
    {!grid&&<Ionicons name="chevron-forward" size={16} color={theme.muted}/>}
  </Pressable>;
}
