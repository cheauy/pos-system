/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/globals, react-hooks/immutability, @next/next/no-img-element -- Synthetic services and camera instrumentation, never production data. */
import React, { createContext, useContext, useState } from 'react';
import { createRoot } from 'react-dom/client';
import LanguageProvider, { useLanguage } from '../../components/providers/language-provider';
import GlobalSearchClient from '../../app/(dashboard)/dashboard/search/global-search-client';
import OrderQrScanner from '../../components/order-qr-scanner';
import StockTransfersClient from '../../app/(dashboard)/dashboard/stock-transfers/stock-transfers-client';

const Scope = createContext({branchId:'branch-a',changing:false,path:'/dashboard/search'});
const events:any = { requests:[], cameraStarts:0, tracks:[], stops:0, navigation:[], formats:[], constraints:[], cameraMode:'ready', cameraDelay:0 };
(window as any).searchFixture=events;
let changeScope:(value:any)=>void;
export function useWorkspaceBranch(){return useContext(Scope);}
export function usePathname(){return useContext(Scope).path;}
const router={push:(path:string)=>{events.navigation.push(path);changeScope((s:any)=>({...s,path}));}};
export function useRouter(){return router;}
export function Link({href,children,...props}:any){return <a href={href} {...props}>{children}</a>;} export default Link;
export function Image({src,alt,...props}:any){delete props.fill;delete props.unoptimized;delete props.priority;delete props.sizes;return <img src={src} alt={alt} {...props}/>;} // fixture thumbnail
export const BarcodeFormat:any={QR_CODE:0,EAN_13:1,EAN_8:2,UPC_A:3,CODE_128:4,CODE_39:5,0:'QR_CODE',1:'EAN_13',2:'EAN_8',3:'UPC_A',4:'CODE_128',5:'CODE_39'};
export class BrowserMultiFormatReader {
  set possibleFormats(formats:any){events.formats.push(formats);}
  async decodeFromStream(stream:MediaStream,video:HTMLVideoElement,callback:any){
    const controls={stop:()=>{events.stops++;stream.getTracks().forEach(track=>track.stop());video.srcObject=null;}};
    video.srcObject=stream;await video.play();events.decode=(raw:string,format='EAN_13',errorName?:string)=>callback(raw?{getText:()=>raw,getBarcodeFormat:()=>BarcodeFormat[format]}:undefined,errorName?Object.assign(new Error('synthetic decoder error'),{name:errorName}):undefined,controls);
    return controls;
  }
}
Object.defineProperty(navigator,'mediaDevices',{value:{getUserMedia:async(constraints:any)=>{
  events.cameraStarts++;events.constraints.push(constraints);
  await new Promise(resolve=>setTimeout(resolve,events.cameraDelay));
  if(events.cameraMode!=='ready')throw Object.assign(new Error('Synthetic camera failure'),{name:events.cameraMode});
  const canvas=document.createElement('canvas');canvas.width=800;canvas.height=600;
  const c=canvas.getContext('2d')!;c.fillStyle='#475569';c.fillRect(0,0,800,600);c.fillStyle='#e2e8f0';c.fillRect(110,60,580,480);c.fillStyle='#0f172a';
  for(let i=0;i<90;i++)if(i%3!==1)c.fillRect(160+i*5,190,2+(i%3),170);
  c.font='24px sans-serif';c.fillText('SYNTHETIC BARCODE',235,440);
  const stream=canvas.captureStream(10);events.tracks.push(...stream.getTracks());return stream;
}},configurable:true});
export async function runGlobalSearch(input:any){
  const payload={...input,branchId:events.branchId};events.requests.push(payload);
  const response=await fetch('/fixture/search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  if(!response.ok)throw Error('Synthetic network failure');return response.json();
}
export async function resolveOrderQr(value:string){events.navigationLookup=(events.navigationLookup||0)+1;return value.includes('123456789012')?{id:'11111111-1111-4111-8111-111111111111'}:{error:'Order not found or unavailable in this branch.'};}
export async function createTransfer(){throw Error('Fixture prohibits mutations');} export const cancelDraftTransfer=createTransfer,receiveTransfer=createTransfer,sendTransfer=createTransfer,updateTransferDraft=createTransfer;
function Controls(){const {setLanguage}=useLanguage();return <div className="fixture-tools"><button onClick={()=>setLanguage('en')}>EN fixture</button><button onClick={()=>setLanguage('km')}>KM fixture</button><button onClick={()=>changeScope((s:any)=>({...s,branchId:s.branchId==='branch-a'?'branch-b':'branch-a'}))}>Switch fixture branch</button><button onClick={()=>changeScope((s:any)=>({...s,path:'/dashboard/other'}))}>Navigate fixture</button><span className="navigation-scanner"><OrderQrScanner/></span></div>;}
function App(){
 const [scope,setScope]=useState({branchId:'branch-a',changing:false,path:window.location.pathname==='/'?'/dashboard/search':window.location.pathname});changeScope=setScope;events.navigate=(path:string)=>setScope(s=>({...s,path}));events.branchId=scope.branchId;
 return <Scope.Provider value={scope}><LanguageProvider initialLanguage="en"><header className="fixture-header"><span>☰</span><div><small>TENH POS · Synthetic fixture</small><strong>Global Search</strong></div><span>{scope.branchId}</span></header><Controls/><div className="fixture-content">{scope.path==='/dashboard/search'&&<GlobalSearchClient initialQuery={new URLSearchParams(window.location.search).get('q')||''} initialBarcode={new URLSearchParams(window.location.search).get('barcode')==='1'}/>}{scope.path==='/dashboard/stock-transfers'&&<StockTransfersClient initialTransferId={new URLSearchParams(window.location.search).get('transfer')||undefined} locations={[{id:'branch-a',name:'Main'},{id:'branch-b',name:'Second'}]} products={[{id:'product',name:'Synthetic product',sku:'00ABC123',size:'M',color:'Black',imageUrl:null,categoryId:null,categoryName:'General',businessStock:8}]} locationStock={[]} transfers={[{id:'transfer',transferNumber:'TR-0007',status:'draft',sourceLocationId:'branch-a',destinationLocationId:'branch-b',note:'Synthetic fixture',createdAt:'2026-10-11T12:00:00Z',createdBy:null,items:[{productId:'product',quantity:2}]}]}/>}</div></LanguageProvider></Scope.Provider>;
}
createRoot(document.getElementById('root')!).render(<App/>);

