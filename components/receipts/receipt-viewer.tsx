 'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Eye, Printer } from 'lucide-react';
import { Modal } from '@/app/(dashboard)/dashboard/pos/pos-workspace-components';
import type { SaleReceipt } from '@/app/(dashboard)/dashboard/pos/pos-workspace-types';
import type { ReceiptContext } from '@/lib/receipts/receipt-model';
import { PosReceipt } from './pos-receipt';
export function ReceiptViewer({receipt,context,printHref,label='View receipt'}:{receipt:SaleReceipt;context:ReceiptContext;printHref?:string;label?:string}) {
 const [open,setOpen]=useState(false);
 return <><button type="button" onClick={()=>setOpen(true)} style={{display:'inline-flex',gap:8,alignItems:'center',padding:'10px 16px',border:'1px solid #1558ff',borderRadius:9,background:'#1558ff',color:'white',fontWeight:600,cursor:'pointer'}}><Eye size={17}/>{label}</button>
 {open && <Modal paper title="View receipt" onClose={()=>setOpen(false)}>
 <PosReceipt receipt={receipt} context={context}/>
 <div style={{display:'flex',justifyContent:'flex-end',marginTop:16}}>{printHref?<Link href={printHref} target="_blank" rel="noopener noreferrer" style={{display:'inline-flex',gap:8,color:'#1558ff'}}><Printer size={17}/>Open printable receipt</Link>:null}</div>
 </Modal>}
 </>;
}
