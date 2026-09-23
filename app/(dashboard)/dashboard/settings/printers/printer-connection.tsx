'use client';
import {useState} from 'react';
import {Printer,Monitor} from 'lucide-react';
export default function PrinterConnection(){
 const [status,setStatus]=useState('Managed by your computer');
 function test(){
  const preview=window.open('','_blank','width=520,height=650');
  if(!preview){setStatus('Allow pop-ups to open the printer test.');return;}
  preview.opener=null;
  preview.document.write('<!doctype html><html><head><title>Printer test</title><style>body{font:14px Arial;color:#000;background:#fff;margin:20px}article{max-width:72mm}h1{font-size:20px}@media print{button,p.help{display:none}@page{size:80mm auto;margin:4mm}}</style></head><body><article><h1>TENH POS — Printer test</h1><p>Receipt and label printer setup</p><hr><p>Text quality: ABCDEFG 0123456789</p><p>Small text should be sharp and readable.</p><hr><strong>TEST ONLY — NOT A SALE</strong></article><p class="help">Choose your printer in the print dialog. Use 100% scale and the correct paper size.</p><button id="print">Choose printer / Print test</button></body></html>');
  preview.document.close();
  preview.document.getElementById('print')?.addEventListener('click',()=>preview.print());
  setStatus('Test preview opened. Select a printer there; completion is not reported to the website.');
 }
 return <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900"><h2 className="flex items-center gap-2 font-bold"><Monitor size={20}/>Printer connection</h2><p role="status" className="mt-2 text-sm font-semibold text-blue-600">{status}</p><p className="mt-2 text-sm text-slate-500">Add your USB, Bluetooth or network printer in your computer’s printer settings first. Then choose it in the print dialog. This website cannot verify its connection or whether a page was printed.</p><button type="button" onClick={test} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white"><Printer size={17}/>Find printer / Test print</button><p className="mt-3 text-xs text-slate-500">Recommended now: the system print dialog. Automatic device discovery and direct printing require a separately configured desktop print connector, such as QZ Tray.</p></section>;
}
