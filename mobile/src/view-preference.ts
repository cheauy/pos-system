import {useEffect,useRef,useState} from 'react';
import {deviceStorage,type Scope} from './client';
const selectedViews=new Map<string,number>();

export function useViewPreference(scope:Scope,menu:string,initial=1,max=3){
 const key=`tenh-view-${scope.userId}-${scope.businessId}-${menu.replace(/[^a-z0-9]/gi,'-')}`;
 const [value,setValue]=useState(selectedViews.get(key)??initial),[error,setError]=useState('');
 const touched=useRef(false),writes=useRef(Promise.resolve());
 useEffect(()=>{let active=true;if(!selectedViews.has(key))void deviceStorage.getItem(key).then(saved=>{const next=Number(saved);if(active&&!touched.current&&Number.isInteger(next)&&next>=1&&next<=max){selectedViews.set(key,next);setValue(next);}}).catch(()=>{if(active)setError('Could not load the saved view.');});return()=>{active=false;};},[key,max]);
 function change(next:number){
  if(!Number.isInteger(next)||next<1||next>max)return;
  touched.current=true;selectedViews.set(key,next);setValue(next);setError('');
  writes.current=writes.current.catch(()=>undefined).then(()=>deviceStorage.setItem(key,String(next))).catch(()=>setError('Could not save this view. Choose it again to retry.'));
 }
 return {value,change,error};
}
