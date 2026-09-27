import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { money } from './client';
import { Badge, Label, ProductPhoto, styles, useTheme } from './ui';

export function OrderCard({ order, grid, currency, open }: { order: { id: string; [key: string]: unknown }; grid: boolean; currency?: string; open: () => void }) {
  const theme=useTheme(), text=(key:string)=>String(order[key]??'');
  const photos=Array.isArray(order.itemsPreview)?order.itemsPreview as {id:string;name:string;imageUrl:string|null;fallbackImageUrl:string|null}[]:[];
  if(!grid)return <Pressable accessibilityRole="button" accessibilityLabel={`View order ${text('orderNumber')}`} onPress={open} style={{padding:12,borderBottomWidth:1,borderColor:theme.border,backgroundColor:theme.panel,flexDirection:'row',alignItems:'center',gap:10}}><ProductPhoto uri={photos[0]?.imageUrl} fallbackUri={photos[0]?.fallbackImageUrl} size={44}/><View style={{flex:1,gap:3}}><Text numberOfLines={1} style={{color:theme.text,fontSize:14,fontWeight:'600'}}>{text('orderNumber')}</Text><Text numberOfLines={1} style={{color:theme.muted,fontSize:12}}>{text('customerName')||'Walk-in customer'}</Text><Label muted>{text('paymentState').replaceAll('_',' ')}</Label></View><View style={{alignItems:'flex-end',gap:5}}><Label>{money(Number(order.total),currency)}</Label><Badge title={text('status')==='refunded'?'Returned':text('status')} positive={order.status==='completed'}/></View></Pressable>;
  return <Pressable accessibilityRole="button" accessibilityLabel={`View order ${text('orderNumber')}`} onPress={open} style={({pressed})=>({borderRadius:18,borderWidth:1,borderColor:theme.border,backgroundColor:theme.panel,padding:grid?12:18,gap:12,opacity:pressed?0.7:1})}>
    <View style={[styles.row,{gap:6}]}><Ionicons name={order.source==='online'?'bag-handle-outline':'receipt-outline'} size={19} color="#5987ed"/><Text style={{flex:1,color:theme.text,fontWeight:'700',fontSize:grid?12:15}}>{text('orderNumber')}</Text>{!grid&&<Ionicons name="chevron-forward" size={17} color={theme.muted}/>}</View>
    <Label>{text('customerName')||'Walk-in customer'}</Label>
    {!!photos.length&&<View style={[styles.row,{flexWrap:'wrap',gap:8}]}>{photos.slice(0,grid?1:3).map(photo=><ProductPhoto key={photo.id} uri={photo.imageUrl} fallbackUri={photo.fallbackImageUrl} size={grid?64:52}/>)}<View style={{flex:1}}><Label muted>{Number(order.itemCount)>0?`${order.itemCount} items`:photos[0]?.name}</Label></View></View>}
    <Text style={{fontSize:grid?20:26,fontWeight:'700',color:theme.text}}>{money(Number(order.total),currency)}</Text>
    <View style={{gap:6,alignItems:'flex-start'}}><Badge title={text('status')==='refunded'?'Returned':text('status')} positive={order.status==='completed'}/><Badge title={text('paymentState').replaceAll('_',' ')} positive={order.paymentState==='paid'}/></View>
    {!grid&&<View style={{borderTopWidth:1,borderColor:theme.border,paddingTop:10,gap:4}}><Label muted>{[text('branchName'),text('source').toUpperCase(),text('fulfillment')||text('fulfillmentType'),text('onlineStatus')].filter(Boolean).join(' · ')}</Label>{!!order.customerPhone&&<Label muted>{text('customerPhone')}</Label>}{!!order.createdAt&&<Label muted>{new Date(text('createdAt')).toLocaleString()}</Label>}</View>}
  </Pressable>;
}
