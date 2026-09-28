import React,{useEffect,useState} from 'react';
import {AppState,Platform} from 'react-native';
import type { NotificationResponse } from 'expo-notifications';
import * as Device from 'expo-device';
import * as Crypto from 'expo-crypto';
import Constants from 'expo-constants';
import {isRunningInExpoGo} from 'expo';
import {api,deviceStorage,type Scope} from './client';
import {Button,Card,Label} from './ui';
// Expo Go throws while evaluating the remote-notification module, before registration can be checked.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Notifications:typeof import('expo-notifications')|null=isRunningInExpoGo()?null:require('expo-notifications');
Notifications?.setNotificationHandler({handleNotification:async()=>({shouldShowBanner:false,shouldShowList:true,shouldPlaySound:false,shouldSetBadge:false})});
async function deviceId(){let id=await deviceStorage.getItem('tenh-device-id');if(!id){id=Crypto.randomUUID();await deviceStorage.setItem('tenh-device-id',id);}return id;}
async function register(scope:Scope,ask:boolean){
 if(!Device.isDevice||!Notifications)throw new Error('Use a TENH POS development build on a physical phone for push notifications.');
 if(Platform.OS==='android')await Notifications.setNotificationChannelAsync('workspace',{name:'Workspace alerts',importance:Notifications.AndroidImportance.DEFAULT});
 let permissions=await Notifications.getPermissionsAsync();
 if(!permissions.granted&&ask)permissions=await Notifications.requestPermissionsAsync();
 if(!permissions.granted)throw new Error('Allow notifications in your phone settings.');
 const projectId=Constants.easConfig?.projectId||Constants.expoConfig?.extra?.eas?.projectId;
 if(!projectId)throw new Error('The app build is missing its Expo project.');
 const token=(await Notifications.getExpoPushTokenAsync({projectId})).data;
 await api('push-register',scope,{deviceId:await deviceId(),token});
}
export async function disablePush(userId?:string){
 const id=await deviceStorage.getItem('tenh-device-id');
 if(id)await api('push-unregister',{}, {deviceId:id});
 if(userId)await deviceStorage.removeItem(`tenh-push-${userId}`);
 await Notifications?.setBadgeCountAsync(0);
}
export function PushSettings({scope,online}:{scope:Scope;online:boolean}){
 const[enabled,setEnabled]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{let active=true;void deviceStorage.getItem(`tenh-push-${scope.userId}`).then(v=>{if(active)setEnabled(v==='true');});return()=>{active=false;};},[scope.userId]);
 async function change(){if(busy||!online)return;setBusy(true);setError('');try{if(enabled)await disablePush(scope.userId);else{await register(scope,true);await deviceStorage.setItem(`tenh-push-${scope.userId}`,'true');}setEnabled(!enabled);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 if(!Notifications)return <Card><Label>Background notifications</Label><Label muted>Push notifications require a TENH POS development build. In-app alerts still work in Expo Go.</Label></Card>;
 return <Card><Label>Background notifications</Label><Label muted>Receive workspace alerts while the app is closed. Notification previews contain no customer details.</Label>{error&&<Label>{error}</Label>}<Button title={enabled?'Disable notifications':'Enable notifications'} secondary disabled={!online} busy={busy} onPress={()=>void change()}/></Card>;
}
export function usePush(scope:Scope,online:boolean,unread:number,openAlerts:()=>void){
 const{userId,businessId,branchId}=scope;
 useEffect(()=>{if(!Notifications||!online||!userId||!businessId||!branchId)return;let current=true;
 let last=0,pending=false;
 const refresh=()=>{if(pending||Date.now()-last<300000)return;pending=true;void deviceStorage.getItem(`tenh-push-${userId}`).then(enabled=>{if(current&&enabled==='true')return register({userId,businessId,branchId},false);}).then(()=>{last=Date.now();}).catch(()=>undefined).finally(()=>{pending=false;});};
 refresh();const listener=AppState.addEventListener('change',state=>{if(state==='active')refresh();});return()=>{current=false;listener.remove();};
 },[online,userId,businessId,branchId]);
 useEffect(()=>{if(Notifications)void Notifications.setBadgeCountAsync(unread).catch(()=>undefined);},[unread]);
 useEffect(()=>{if(!Notifications||!userId||!businessId)return;let current=true;
  const handle=(response:NotificationResponse|null)=>{if(current&&response?.notification.request.content.data?.screen==='Alerts'){openAlerts();void Notifications.clearLastNotificationResponseAsync().catch(()=>undefined);}};
  const listener=Notifications.addNotificationResponseReceivedListener(handle);
  void Notifications.getLastNotificationResponseAsync().then(handle).catch(()=>undefined);
  return()=>{current=false;listener.remove();};
 },[openAlerts,userId,businessId]);
}
