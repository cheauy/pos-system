import React from 'react';
import {View} from 'react-native';
import {Card,DetailRow,Field,Label,SectionTitle} from './ui';
import {money} from './client';
import {decimalInput} from './decimal-input';
import type {RegisterDetailData} from './register-detail';
import {Shimmer} from './loading';

export function closingVariance(value:string,expected:number):number|null{
  if(!/^\d+(\.\d{1,2})?$/.test(value)||!Number.isFinite(Number(value))||!Number.isFinite(expected))return null;
  return (Math.round(Number(value)*100)-Math.round(expected*100))/100;
}
export function RegisterClosing({data,values,busy,change}:{data:RegisterDetailData|null;values:Record<string,string>;busy:boolean;change:(key:string,value:string)=>void}){
  if(!data)return <Shimmer rows={3}/>;
  const variance=closingVariance(values.closingCash??'',data.summary.expected);
  return <><Label muted>Count the cash in your drawer before ending this shift.</Label><Card><SectionTitle title="Shift summary" icon="receipt-outline"/><DetailRow label="Opened" value={new Date(data.openedAt).toLocaleString()}/><DetailRow label="Transactions" value={String(data.orderCount)}/><DetailRow label="Opening cash" value={money(data.openingCash,data.currency)}/><DetailRow label="Expected cash" value={money(data.summary.expected,data.currency)}/></Card>
    <Card><SectionTitle title="Closing cash count" icon="cash-outline"/><Field label={`Counted cash (${data.currency}) *`} value={values.closingCash??''} placeholder="0.00" keyboardType="decimal-pad" editable={!busy&&data.status==='open'} onChangeText={value=>change('closingCash',decimalInput(value,values.closingCash??''))}/><Field label="Closing note (optional)" placeholder="Explain any cash difference…" multiline maxLength={500} value={values.note??''} editable={!busy} onChangeText={value=>change('note',value)}/></Card>
    <Card><SectionTitle title="Closing summary" icon="calculator-outline"/><DetailRow label="Expected cash" value={money(data.summary.expected,data.currency)}/><DetailRow label="Counted cash" value={variance===null?'Not counted':money(Number(values.closingCash),data.currency)}/><DetailRow label="Difference" value={variance===null?'—':money(variance,data.currency)}/><View><Label muted>{variance===null?'Enter your cash count to compare.':variance===0?'Your cash count matches.':variance<0?'The drawer has less cash than expected.':'The drawer has more cash than expected.'}</Label></View><Label muted>Final totals are checked again when you confirm. New payments may change the expected amount.</Label></Card>
  </>;
}
