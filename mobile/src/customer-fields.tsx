import React, { useEffect, useState } from 'react';
import { Modal, ScrollView, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, type Scope } from './client';
import { Button, Card, Label, styles, useTheme } from './ui';

export type CustomerFields = { emailEnabled: boolean; birthdayEnabled: boolean };
export function CustomerFieldSettings({ scope, online, close, saved }: { scope: Scope; online: boolean; close: () => void; saved: () => void }) {
  const theme=useTheme();
  const [fields,setFields]=useState<CustomerFields|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  useEffect(()=>{const controller=new AbortController();api<CustomerFields>('customer-fields',scope,undefined,controller.signal).then(setFields).catch(e=>{if(!controller.signal.aborted)setError(e.message);});return()=>controller.abort();},[scope]);
  async function save(){if(!fields||busy||!online)return;setBusy(true);setError('');try{await api('customer-fields',scope,fields);saved();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  return <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={()=>{if(!busy)close();}}><SafeAreaView style={{flex:1,backgroundColor:theme.background}}><ScrollView contentContainerStyle={styles.page}><Label large>Customer fields</Label><Label muted>Optional fields for this branch. Saved changes apply to the website and mobile.</Label><Card>{(['emailEnabled','birthdayEnabled'] as const).map(key=><View key={key} style={[styles.row,{justifyContent:'space-between'}]}><Label>{key==='emailEnabled'?'Email':'Birthday'}</Label><Switch accessibilityLabel={key==='emailEnabled'?'Show customer email':'Show customer birthday'} value={fields?.[key]??false} disabled={!fields||busy||!online} onValueChange={value=>setFields(old=>old?{...old,[key]:value}:old)}/></View>)}</Card>{!!error&&<Label>{error}</Label>}<Button title="Save settings" busy={busy} disabled={!fields||!online} onPress={()=>void save()}/><Button title="Close" secondary disabled={busy} onPress={close}/></ScrollView></SafeAreaView></Modal>;
}
