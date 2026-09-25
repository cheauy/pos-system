import 'server-only';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { readSupportFields, SUPPORT_IMAGE_BUCKET } from './reports';

export async function saveSupportReport(form:FormData,userId:string,businessId:string|null):Promise<{ok:boolean;message:string}>{
  const fields=readSupportFields(form);
  if('error' in fields)return {ok:false,message:fields.error||'Review the report fields.'};
  let bytes:Buffer;
  try {
    const input=sharp(Buffer.from(await fields.image.arrayBuffer()),{limitInputPixels:40_000_000});
    const metadata=await input.metadata();
    if(!['jpeg','png','webp'].includes(metadata.format??'')||(metadata.pages??1)>1)throw new Error('Invalid image');
    bytes=await input.rotate().resize({width:2400,height:2400,fit:'inside',withoutEnlargement:true}).webp({quality:90}).toBuffer();
  }catch{return {ok:false,message:'This image could not be read. Choose a valid JPG, PNG or WebP image.'};}
  const id=randomUUID(),path=`${businessId??'platform'}/${userId}/${id}.webp`;
  const storage=supabaseAdmin.storage.from(SUPPORT_IMAGE_BUCKET);
  const uploaded=await storage.upload(path,bytes,{contentType:'image/webp',upsert:false,cacheControl:'0'});
  if(uploaded.error)return {ok:false,message:'Image upload failed. Your details have been kept; please try again.'};
  const {error}=await supabaseAdmin.from('platform_support_reports').insert({id,business_id:businessId,created_by:userId,title:fields.title,description:fields.description,reason:fields.reason,priority:fields.priority,image_path:path,page_path:'',status:'open'});
  if(error){
    // Verify ambiguous failures before removing an attachment that may be saved.
    const saved=await supabaseAdmin.from('platform_support_reports').select('id').eq('id',id).maybeSingle();
    if(!saved.data){
      if(!saved.error)await storage.remove([path]);
      return {ok:false,message:'Unable to confirm your report. Refresh My reports before trying again.'};
    }
  }
  return {ok:true,message:'Report sent to Support. You can track its status below.'};
}
