import React from 'react';
import {Linking,ScrollView,Text,View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {apiUrl,type Workspace} from './client';
import {useData} from './data';
import {Badge,Button,Card,DetailRow,Label,styles,useTheme} from './ui';
import {Shimmer} from './loading';

type Plan={id:string;name:string;planName:string;description:string;status:string;expiresAt:string|null;usersUsed:number;userLimit:number;branchesUsed:number;branchLimit:number;teamEnabled:boolean};
export function Subscription({workspace,online}:{workspace:Workspace;online:boolean}){
 const theme=useTheme();
 const {data,loading,error,refresh}=useData<{rows:Plan[]}>('account-subscription',{userId:workspace.userId,businessId:workspace.business.id,branchId:workspace.branchId},online);
 const plan=data?.rows[0];
 return <ScrollView contentContainerStyle={styles.page}>
  <View style={[styles.row,{gap:14}]}><View style={{padding:15,borderRadius:17,backgroundColor:theme.dark?'#233858':'#e6efff'}}><Ionicons name="diamond-outline" size={30} color="#3478ef"/></View><View style={{flex:1,gap:5}}><Text style={{color:theme.text,fontSize:23,fontWeight:'700'}}>{theme.t('Your subscription')}</Text><Label muted>Manage your plan and billing details.</Label></View></View>
  {loading&&!plan&&<Shimmer rows={4}/>}{error&&<Card><Label>{error}</Label><Button title="Retry" secondary disabled={!online} onPress={refresh}/></Card>}
  {plan&&<Card><Text style={{color:theme.muted,fontSize:11,fontWeight:'600',letterSpacing:1}}>{theme.t('SUBSCRIPTION OVERVIEW')}</Text><View style={[styles.row,{gap:14}]}><View style={{padding:15,borderRadius:16,backgroundColor:theme.dark?'#233858':'#e6efff'}}><Ionicons name="bag-handle-outline" size={30} color="#3478ef"/></View><View style={{flex:1,gap:7}}><Text style={{color:theme.text,fontSize:21,fontWeight:'700'}}>{plan.name}</Text><View style={{alignSelf:'flex-start'}}><Badge title={plan.planName}/></View></View></View><Label muted>{plan.description}</Label>
   <DetailRow label="Status" value={plan.status.replace(/^./,c=>c.toUpperCase())}/><DetailRow label="Expires" value={plan.expiresAt?new Date(plan.expiresAt).toLocaleDateString():'No expiry supplied'}/><DetailRow label="Users" value={`${plan.usersUsed} / ${plan.userLimit}`}/><DetailRow label="Active branches" value={`${plan.branchesUsed} / ${plan.branchLimit}`}/><DetailRow label="Team access" value={plan.teamEnabled?'Included':'Single user'}/>
  </Card>}
  <Card><View style={[styles.row,{alignItems:'flex-start'}]}><Ionicons name="open-outline" size={27} color="#3478ef"/><View style={{flex:1,gap:8}}><Text style={{color:theme.text,fontSize:18,fontWeight:'600'}}>{theme.t('Manage subscription and payments on the TENH POS website.')}</Text><Label muted>Upgrade plans, view invoices and manage payments.</Label></View></View><Button title="Continue on website" disabled={!online} onPress={()=>void Linking.openURL(`${apiUrl}/dashboard/subscription`).catch(()=>theme.alert('Unable to open website'))}/></Card>
 </ScrollView>;
}
