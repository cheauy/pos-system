import React from 'react';
import {type Scope,money} from './client';
import {useData} from './screens';
import {Donut} from './charts';
import {Shimmer} from './loading';
import {Button,Card,Label} from './ui';
export function ExpenseAnalytics({scope,online,range}:{scope:Scope;online:boolean;range:string}){
 const {data,error,loading,refresh}=useData<{rows:{name:string;value:number}[];count:number;currency:string}>(`expense-breakdown?range=${range}`,scope,online);
 return <Card><Label large>Expense Breakdown</Label>{loading&&!data&&<Shimmer rows={2}/>} {error&&<><Label>{error}</Label><Button title="Retry" disabled={!online} onPress={refresh}/></>}{data&&<><Label large>{money(data.rows.reduce((sum,row)=>sum+row.value,0),data.currency)}</Label><Label muted>{`${data.count} expenses`}</Label><Donut rows={data.rows}/></>}</Card>;
}
