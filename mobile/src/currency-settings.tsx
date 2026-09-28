import React,{useState} from 'react';
import {api,type Scope} from './client';
import {useData} from './data';
import {Button,Card,Field,Label,SectionTitle} from './ui';
import {Shimmer} from './loading';
import {decimalInput} from './decimal-input';

export function CurrencySettings({scope,online}:{scope:Scope;online:boolean}){
  const {data,error,refresh}=useData<{currency:string;taxRate:number}>('currency-settings',scope,online);
  const [draft,setDraft]=useState<string|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const value=draft??String(data?.taxRate??'');
  return <Card><SectionTitle title="Currency Settings" icon="cash-outline"/>{data?<><Label>{`Currency · ${data.currency}`}</Label><Field label="Tax %" keyboardType="decimal-pad" value={value} editable={!busy} onChangeText={text=>{setDraft(decimalInput(text,value));setMessage('');}}/><Label muted>Applies to new POS sales in this branch on web and mobile.</Label><Button title="Save tax rate" busy={busy} disabled={!online||!value||!/^\d+(\.\d{1,2})?$/.test(value)||Number(value)>100} onPress={()=>{if(busy)return;setBusy(true);setMessage('');void api('currency-settings',scope,{taxRate:Number(value)}).then(()=>{setMessage('Tax rate saved.');refresh();}).catch(error=>setMessage(error.message)).finally(()=>setBusy(false));}}/></>:error?<Label>{error}</Label>:<Shimmer rows={2}/>}{!!message&&<Label>{message}</Label>}</Card>;
}
