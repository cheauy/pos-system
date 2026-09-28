import React from 'react';
import {Pressable,Text,View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {Badge,Label,styles,useTheme} from './ui';
import {money} from './client';

export function RegisterCard({row,currency,open}:{row:{id:string;[key:string]:unknown};currency?:string;open:()=>void}){
 const theme=useTheme(),active=row.status==='open';
 const amount=active?Number(row.opening_cash):row.closing_cash==null?Number(row.expected_cash??row.opening_cash):Number(row.closing_cash);
 return <Pressable accessibilityRole="button" accessibilityLabel={`View register ${row.id}`} onPress={open} style={({pressed})=>({padding:16,borderRadius:20,borderWidth:1,borderColor:theme.border,backgroundColor:theme.panel,gap:14,opacity:pressed?0.7:1})}>
  <View style={styles.row}><View style={{padding:12,borderRadius:14,backgroundColor:active?(theme.dark?'#153c34':'#e8f7ef'):theme.background}}><Ionicons name="cash-outline" size={27} color={active?'#1da776':theme.muted}/></View><View style={{flex:1,gap:4}}><Text numberOfLines={1} style={{color:theme.text,fontWeight:'700',fontSize:16}}>{`Register #${row.id.slice(0,8).toUpperCase()}`}</Text><Label muted>{new Date(String(row.opened_at)).toLocaleString()}</Label></View><Badge title={active?'Open':'Closed'} positive={active}/></View>
  <View style={[styles.row,{justifyContent:'space-between'}]}><Label muted>{active?'Opening cash':row.closing_cash==null?'Expected cash':'Counted cash'}</Label><View style={styles.row}><Text style={{fontSize:20,fontWeight:'700',color:theme.text}}>{money(amount,currency)}</Text><Ionicons name="chevron-forward" size={18} color={theme.muted}/></View></View>
  <View style={{padding:11,borderRadius:12,backgroundColor:theme.background}}><Label muted>{active?'View live totals and cash movements':`Opening cash · ${money(Number(row.opening_cash),currency)}`}</Label></View>
 </Pressable>;
}
