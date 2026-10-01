"use server";
import { revalidatePath } from "next/cache";
import { getCurrentBusiness } from "@/lib/business/get-current-business";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { compressPhoto } from "@/lib/images/compress-photo";
import { randomUUID } from "node:crypto";

export type UpdateProfileState = {success:boolean;message:string;nameSaved?:boolean};
export async function updateProfile(_previous:UpdateProfileState,formData:FormData):Promise<UpdateProfileState> {
  const fullName=String(formData.get("full_name")??"").trim();
  if(fullName.length<2||fullName.length>100)return {success:false,message:"Full name must contain 2–100 characters."};
  let uploaded:string|undefined,nameSaved=false,photoOutcomeUnknown=false;
  try {
    const supabase=await createClient();
    const {data:{user},error}=await supabase.auth.getUser();
    if(error||!user)return {success:false,message:"You must be logged in."};
    const file=formData.get("photo");
    let avatarUrl:string|undefined;
    if(file instanceof File&&file.size){
      const photo=await compressPhoto(file);
      const business=await getCurrentBusiness();
      const extension=photo.type==='image/png'?'png':photo.type==='image/webp'?'webp':'jpg';
      const path=`${business.id}/${user.id}/profile-${randomUUID()}.${extension}`;
      const bucket=supabaseAdmin.storage.from('product-images');
      const result=await bucket.upload(path,photo,{contentType:photo.type,cacheControl:'31536000',upsert:false});
      if(result.error)throw new Error('Unable to upload your photo. No profile changes were saved.');
      uploaded=path;avatarUrl=bucket.getPublicUrl(path).data.publicUrl;
    }
    const {error:updateError}=await supabase.from('profiles').update({full_name:fullName,updated_at:new Date().toISOString()}).eq('id',user.id);
    if(updateError)throw new Error('Unable to save your profile. Please try again.');
    nameSaved=true;
    if(avatarUrl){
      photoOutcomeUnknown=true;
      const saved=await supabase.auth.updateUser({data:{avatar_url:avatarUrl}});
      photoOutcomeUnknown=false;
      if(saved.error)throw new Error('Your name was saved, but your photo could not be saved. Please retry Save Changes.');
      uploaded=undefined;
    }
    try {
      revalidatePath('/dashboard/settings/profile');revalidatePath('/dashboard','layout');revalidatePath('/dashboard/settings');
    } catch {return {success:true,nameSaved,message:'Profile saved. Refresh to see your updated profile.'};}
    return {success:true,nameSaved,message:'Profile updated successfully.'};
  } catch(error){
    if(uploaded&&!photoOutcomeUnknown){try{await supabaseAdmin.storage.from('product-images').remove([uploaded]);}catch{/* Best-effort cleanup; keep the original save error. */}}
    return {success:false,nameSaved,message:nameSaved?'Your name was saved, but your photo could not be confirmed. Please retry Save Changes.':error instanceof Error?error.message:'Unable to save your profile. Please try again.'};
  }
}
