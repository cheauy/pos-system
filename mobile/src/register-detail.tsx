import React from 'react';
import {Shimmer} from './loading';
import { View } from 'react-native';
import { money, type Scope } from './client';
import { useData } from './screens';
import { Button, Card, DetailRow, Label, SectionTitle } from './ui';

type Detail={status:string;openingCash:number;closingCash:number|null;variance:number|null;openedAt:string;closedAt:string|null;openingNote:string|null;closingNote:string|null;summary:{cash:number;noncash:number;incoming:number;outgoing:number;refunds:number;expected:number};orderCount:number;movements:{id:string;type:string;amount:number;reason:string}[];currency:string};
export function RegisterDetail({id,scope,online,onCloseShift}:{id:string;scope:Scope;online:boolean;onCloseShift:()=>void}){
 const {data,error,loading,refresh}=useData<Detail>(`register-detail?id=${id}`,scope,online);
 return <View style={{gap:14}}>{loading&&!data&&<Shimmer rows={4}/>}{error&&<Card><Label>{error}</Label><Button title="Retry" disabled={!online} onPress={refresh}/></Card>}{data&&<>
  <Card><SectionTitle title="Shift summary" icon="cash-outline"/><DetailRow label="Opened" value={new Date(data.openedAt).toLocaleString()}/>{data.closedAt&&<DetailRow label="Closed" value={new Date(data.closedAt).toLocaleString()}/>}<DetailRow label="Orders counted" value={String(data.orderCount)}/><DetailRow label="Opening cash" value={money(data.openingCash,data.currency)}/><DetailRow label="Cash payments" value={money(data.summary.cash,data.currency)}/><DetailRow label="Non-cash payments" value={money(data.summary.noncash,data.currency)}/><DetailRow label="Cash added" value={money(data.summary.incoming,data.currency)}/><DetailRow label="Cash removed" value={money(data.summary.outgoing,data.currency)}/><DetailRow label="Refunds included in cash removed" value={money(data.summary.refunds,data.currency)}/><DetailRow label="Expected cash" value={money(data.summary.expected,data.currency)}/>{data.status==='closed'&&<><DetailRow label="Counted closing cash" value={data.closingCash===null?'—':money(data.closingCash,data.currency)}/><DetailRow label="Variance" value={data.variance===null?'—':money(data.variance,data.currency)}/></>}{data.openingNote&&<DetailRow label="Opening note" value={data.openingNote}/>} {data.closingNote&&<DetailRow label="Closing note" value={data.closingNote}/>}</Card>
  <Card><SectionTitle title="Recent cash movements" icon="swap-horizontal-outline"/>{data.movements.length?data.movements.map(row=><DetailRow key={row.id} label={`${row.type==='cash_in'?'Cash in':'Cash out'} · ${row.reason}`} value={money(row.amount,data.currency)}/>):<Label>No cash movements</Label>}</Card>
  {data.status==='open'&&<Button title="Close register" disabled={!online||loading||!!error} onPress={onCloseShift}/>}
 </>}</View>;
}
