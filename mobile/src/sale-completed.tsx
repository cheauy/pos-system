import React,{useEffect,useState} from 'react';
import {AccessibilityInfo,Animated,Pressable,Text,View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {money,type Scope,type Order} from './client';
import {useData} from './data';
import {Button,Card,DetailRow,Label,ProductPhoto,styles,useTheme} from './ui';
import {OrderSheet} from './order-detail';

export type CompletedReceipt={
  orderId:string;orderNumber:string;total:number;currency:string;change:number;remaining?:number;
  createdAt?:string;subtotal?:number;discount?:number;deliveryFee?:number;taxAmount?:number;
  shipping?:{method:string};tenders?:{method:string;amount:number}[];
  lines?:{name:string;variant:string|null;quantity:number;subtotal:number}[];
};

function SuccessTick(){
  const [scale]=useState(()=>new Animated.Value(1));
  useEffect(()=>{
    let active=true;let animation:Animated.CompositeAnimation|undefined;
    const animate=(reduced:boolean)=>{animation?.stop();scale.setValue(1);if(reduced||!active)return;scale.setValue(0.6);animation=Animated.spring(scale,{toValue:1,friction:5,tension:80,useNativeDriver:true,isInteraction:false});animation.start();};
    void AccessibilityInfo.isReduceMotionEnabled().then(animate).catch(()=>undefined);
    const listener=AccessibilityInfo.addEventListener('reduceMotionChanged',animate);
    return()=>{active=false;animation?.stop();listener.remove();};
  },[scale]);
  return <Animated.View accessible={false} style={{alignSelf:'center',marginVertical:10,width:94,height:94,borderRadius:47,backgroundColor:'#d9f5e9',padding:9,transform:[{scale}]}}><View style={{flex:1,borderRadius:40,backgroundColor:'#18af7a',alignItems:'center',justifyContent:'center'}}><Ionicons name="checkmark" size={48} color="#fff"/></View></Animated.View>;
}

export function SaleCompleted({receipt,scope,online,busy,permissions,print,next}:{receipt:CompletedReceipt;scope:Scope;online:boolean;busy:boolean;permissions:string[];print:(shipping?:boolean,share?:boolean)=>void;next:()=>void}){
  const theme=useTheme();const [details,setDetails]=useState(false);
  const due=(receipt.remaining??0)>0;
  const method=receipt.tenders?.map(t=>({cash:'Cash',bank_transfer:'Bank Transfer',other:'Other'}[t.method]||t.method)).join(' + ')|| (due?'Payment due':'—');
  const date=receipt.createdAt?new Date(receipt.createdAt):null;
  const fields=[['Order ID',receipt.orderNumber],['Date & time',date&&Number.isFinite(date.getTime())?date.toLocaleString():'—'],['Total',money(receipt.total,receipt.currency)],[due?'Payment due':'Change',money(due?receipt.remaining!:receipt.change,receipt.currency)],['Payment method',method],['Customer type',({in_store:'Walk-in',walk_in:'Walk-in',pickup:'Pickup',delivery:'Delivery'} as Record<string,string>)[receipt.shipping?.method||'']||'—']];
  const canView=permissions.includes('orders.view');
  return <><Card><SuccessTick/><View style={{alignItems:'center',gap:6,marginBottom:12}}><Text accessibilityRole="header" style={{fontSize:28,fontWeight:'700',textAlign:'center',color:theme.text}}>{theme.t(due?'Order recorded':'Sale completed')}</Text><Text style={{color:theme.muted,textAlign:'center',lineHeight:22}}>{theme.t(due?'Your order is saved. Payment remains due.':'Thank you! Your transaction was successful.')}</Text></View>
    <View style={{borderWidth:1,borderColor:theme.border,borderRadius:16,backgroundColor:theme.background,flexDirection:'row',flexWrap:'wrap',padding:10}}>{fields.map(([label,value],index)=><View key={label} style={{width:'50%',padding:10,gap:4,borderTopWidth:index>1?1:0,borderColor:theme.border}}><Label muted>{label}</Label><Text selectable style={{fontSize:label==='Total'?22:14,fontWeight:label==='Total'||label==='Order ID'?'700':'500',color:theme.text}}>{value}</Text></View>)}</View>
    {canView?<SavedItems receipt={receipt} scope={scope} online={online}/>:<ItemSummary receipt={receipt}/>}
    <View style={{flexDirection:'row',flexWrap:'wrap',gap:10}}>{([
      ['print-outline','Print receipt',()=>print()],['share-outline','Share PDF receipt',()=>print(false,true)],
      ['cube-outline','Print shipping label',()=>print(true)],...(canView?[['document-text-outline','View order details',()=>setDetails(true)]]:[])
    ] as [React.ComponentProps<typeof Ionicons>['name'],string,()=>void][]).map(([icon,title,action])=><Pressable key={title} accessibilityRole="button" disabled={busy||!online} onPress={action} style={({pressed})=>({width:'47%',flexGrow:1,minHeight:64,padding:12,borderWidth:1,borderColor:theme.border,borderRadius:14,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,opacity:busy||!online?0.5:pressed?0.7:1})}><Ionicons name={icon} size={21} color="#3878ef"/><Text style={{flexShrink:1,color:theme.dark?'#a5c4ff':'#275de8',fontWeight:'600',textAlign:'center'}}>{theme.t(title)}</Text></Pressable>)}</View>
    <Button title="Next sale" disabled={busy} onPress={next}/>
  </Card>{details&&<OrderSheet id={receipt.orderId} scope={scope} online={online} incoming={false} canUpdate={permissions.includes('orders.update')} canReturn={permissions.includes('orders.return')} currency={receipt.currency} onClose={()=>setDetails(false)}/>}</>;
}

function SavedItems({receipt,scope,online}:{receipt:CompletedReceipt;scope:Scope;online:boolean}){
  const {data}=useData<Order>(`order?id=${encodeURIComponent(receipt.orderId)}`,scope,online);
  // Never replace the confirmed sale totals with later edits or refunds.
  return <ItemSummary receipt={receipt} photos={data?.items}/>;
}
function ItemSummary({receipt,photos}:{receipt:CompletedReceipt;photos?:Order['items']}){
  const theme=useTheme();const lines=receipt.lines||[];
  return <View style={{borderWidth:1,borderColor:theme.border,borderRadius:16,padding:14,gap:12}}><View style={[styles.row,{justifyContent:'space-between'}]}><Label>Items purchased</Label><Label muted>{`${lines.reduce((sum,line)=>sum+line.quantity,0)} ${theme.t('items')}`}</Label></View>
    {lines.map((line,index)=>{const matches=photos?.filter(item=>item.name===line.name&&(item.variant||'')===(line.variant||''));return <View key={index} style={[styles.row,{paddingVertical:8,borderTopWidth:index?1:0,borderColor:theme.border}]}><ProductPhoto uri={matches?.length===1?matches[0].imageUrl:null} fit="contain" size={48}/><View style={{flex:1,gap:3}}><Label>{line.name}</Label>{!!line.variant&&<Label muted>{line.variant}</Label>}</View><Label muted>{`×${line.quantity}`}</Label><Label>{money(line.subtotal,receipt.currency)}</Label></View>;})}
    <View style={{borderTopWidth:1,borderColor:theme.border,paddingTop:10,gap:7}}>{([['Subtotal',receipt.subtotal],['Discount',receipt.discount],['Shipping fee',receipt.deliveryFee],['Tax',receipt.taxAmount]] as const).filter(([,amount])=>amount!==undefined).map(([label,amount])=><DetailRow key={label} label={label} value={money(amount!,receipt.currency)}/>)}<DetailRow label="Total" value={money(receipt.total,receipt.currency)}/></View>
  </View>;
}
