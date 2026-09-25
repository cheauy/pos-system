'use client';
/* eslint-disable @next/next/no-img-element -- Local/private screenshots must not use the public image optimizer. */
import { useEffect, useRef, useState } from 'react';
import { ImagePlus } from 'lucide-react';
import { SUPPORT_IMAGE_MAX_BYTES } from '@/lib/support/reports';

export default function SupportImageInput({className}:{className:string}){
  const input=useRef<HTMLInputElement>(null),url=useRef('');
  const [preview,setPreview]=useState('');
  useEffect(()=>{
    const form=input.current?.form;
    const clear=()=>{URL.revokeObjectURL(url.current);url.current='';setPreview('');};
    form?.addEventListener('reset',clear);
    return()=>{form?.removeEventListener('reset',clear);URL.revokeObjectURL(url.current);};
  },[]);
  return <div><label className="block text-sm font-semibold"><span className="flex items-center gap-2"><ImagePlus size={17}/>Image *</span><input ref={input} type="file" name="image" required accept="image/jpeg,image/png,image/webp" className={className} onChange={event=>{
    const file=event.target.files?.[0];URL.revokeObjectURL(url.current);url.current='';
    event.target.setCustomValidity(file&&file.size>SUPPORT_IMAGE_MAX_BYTES?'Choose an image up to 5 MB.':'');
    if(file&&file.size<=SUPPORT_IMAGE_MAX_BYTES)url.current=URL.createObjectURL(file);
    setPreview(url.current);
  }}/></label><p className="mt-1 text-xs text-slate-500">JPG, PNG or WebP · up to 5 MB</p>{preview&&<img src={preview} alt="Report image preview" className="mt-3 max-h-52 rounded-xl border border-slate-200 object-contain"/>}</div>;
}
