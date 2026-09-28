"use client";
import {useActionState} from 'react';
import {updateProfilePhoto} from './actions';

export default function ProfilePhotoForm(){
 const [state,action,pending]=useActionState(updateProfilePhoto,{success:false,message:''});
 return <form action={action} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
  <h2 className="font-semibold">Profile photo</h2><p className="text-sm text-slate-500">This photo also appears on your mobile profile.</p>
  <input aria-label="Profile photo" name="photo" type="file" accept="image/jpeg,image/png,image/webp" required disabled={pending} className="block w-full text-sm"/>
  <p className="text-xs text-slate-500">JPG, PNG or WebP, up to 5 MB.</p>
  <button disabled={pending} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{pending?'Saving…':'Save photo'}</button>
  {state.message&&<p role="status" className={state.success?'text-sm text-emerald-600':'text-sm text-red-600'}>{state.message}</p>}
 </form>;
}
