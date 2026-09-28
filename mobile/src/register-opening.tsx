import React from 'react';
import {Pressable,Text,View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {money} from './client';
import {Badge,Card,DetailRow,Field,Label,SectionTitle,styles,useTheme} from './ui';
import {decimalInput} from './decimal-input';

export type RegisterContext={branchName:string;cashierName:string;currency:string;hasOpen:boolean};
export function RegisterOpening({context,values,busy,change}:{context?:RegisterContext;values:Record<string,string>;busy:boolean;change:(key:string,value:string)=>void}){
  const theme=useTheme();const currency=context?.currency||'USD';
  const presets=currency==='KHR'?[0,20000,50000,100000]:[0,20,50,100];
  return <><Label muted>Start a new shift by setting the opening cash in drawer.</Label>
    <Card><View style={styles.row}><View style={{padding:12,borderRadius:12,backgroundColor:theme.dark?'#153c34':'#e6f6ef'}}><Ionicons name="storefront-outline" size={23} color="#179669"/></View><View style={{flex:1,gap:4}}><Label>{context?.branchName||'Loading branch…'}</Label><Label muted>{context?.cashierName?`Cashier: ${context.cashierName}`:'Loading cashier…'}</Label></View><View style={{alignItems:'flex-end',gap:4}}><Badge title={!context?'Checking':context.hasOpen?'Open':'Ready'} positive={!!context&&!context.hasOpen}/><Label muted>{context?.hasOpen?'Register open':'New shift'}</Label></View></View></Card>
    <Card><SectionTitle title="Cash count" icon="cash-outline"/><Label muted>Enter the amount of cash in your drawer to begin.</Label>
      <Field label={`Opening cash (${currency}) *`} placeholder="0.00" value={values.openingCash??''} keyboardType="decimal-pad" editable={!busy} onChangeText={value=>change('openingCash',decimalInput(value,values.openingCash??''))}/>
      <View style={[styles.row,{gap:8}]}>{presets.map(amount=><Pressable key={amount} accessibilityRole="button" accessibilityLabel={`Set opening cash to ${money(amount,currency)}`} disabled={busy} onPress={()=>change('openingCash',String(amount))} style={({pressed})=>({flex:1,minHeight:40,paddingVertical:7,borderRadius:9,alignItems:'center',justifyContent:'center',backgroundColor:theme.background,opacity:busy?0.5:pressed?0.7:1})}><Text style={{fontSize:12,color:theme.text}}>{money(amount,currency)}</Text></Pressable>)}</View>
      <Field label="Note (optional)" placeholder="Add a note (e.g. shift handover)…" value={values.note??''} multiline maxLength={200} editable={!busy} style={{minHeight:88,textAlignVertical:'top'}} onChangeText={value=>change('note',value)}/><View style={{alignItems:'flex-end'}}><Label muted>{`${values.note?.length??0}/200`}</Label></View>
    </Card><Card><SectionTitle title="Opening summary" icon="document-text-outline"/><Label muted>Here’s what will be recorded when you open the register.</Label><DetailRow label="Branch" value={context?.branchName||'—'}/><DetailRow label="Opening cash" value={values.openingCash&&Number.isFinite(Number(values.openingCash))?money(Number(values.openingCash),currency):'—'}/><DetailRow label="Shift start" value="When confirmed"/><DetailRow label="Opened by" value={context?.cashierName||'—'}/></Card>
  </>;
}
