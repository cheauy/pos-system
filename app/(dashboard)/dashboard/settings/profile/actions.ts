"use server";

import { revalidatePath } from "next/cache";

import { getCurrentBusiness } from "@/lib/business/get-current-business";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { compressPhoto } from "@/lib/images/compress-photo";
import { randomUUID } from "node:crypto";

export async function updateProfilePhoto(_previous: UpdateProfileState, formData: FormData): Promise<UpdateProfileState> {
  let uploaded: string | undefined;
  try {
    const supabase=await createClient();
    const {data:{user},error}=await supabase.auth.getUser();
    if(error||!user)return {success:false,message:'Sign in to update your photo.'};
    const business=await getCurrentBusiness();
    const file=formData.get('photo');
    if(!(file instanceof File)||!file.size)return {success:false,message:'Choose a profile photo.'};
    const photo=await compressPhoto(file);
    const extension=photo.type==='image/png'?'png':photo.type==='image/webp'?'webp':'jpg';
    const path=`${business.id}/${user.id}/profile-${randomUUID()}.${extension}`;
    const bucket=supabaseAdmin.storage.from('product-images');
    const result=await bucket.upload(path,photo,{contentType:photo.type,cacheControl:'31536000',upsert:false});
    if(result.error)throw new Error('Unable to upload your photo. Try again.');
    uploaded=path;
    const avatarUrl=bucket.getPublicUrl(path).data.publicUrl;
    const saved=await supabase.auth.updateUser({data:{avatar_url:avatarUrl}});
    if(saved.error)throw new Error('Unable to save your profile photo. Try again.');
    uploaded=undefined;
    revalidatePath('/dashboard/settings/profile');
    return {success:true,message:'Profile photo saved.'};
  } catch(error) {
    if(uploaded)await supabaseAdmin.storage.from('product-images').remove([uploaded]);
    return {success:false,message:error instanceof Error?error.message:'Unable to save your photo.'};
  }
}

export type UpdateProfileState = {
  success: boolean;
  message: string;
};

export async function updateProfile(
  _previousState: UpdateProfileState,
  formData: FormData,
): Promise<UpdateProfileState> {
  const fullName = String(
    formData.get("full_name") ?? "",
  ).trim();
  if (!fullName) {
    return {
      success: false,
      message: "Full name is required.",
    };
  }

  if (fullName.length < 2) {
    return {
      success: false,
      message: "Full name must contain at least 2 characters.",
    };
  }

  if (fullName.length > 100) {
    return {
      success: false,
      message: "Full name cannot exceed 100 characters.",
    };
  }

  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      success: false,
      message: "You must be logged in.",
    };
  }

  const { error: updateError } = await supabase
    .from("profiles")
    .update({
      full_name: fullName,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (updateError) {
    return {
      success: false,
      message: updateError.message,
    };
  }

  revalidatePath("/dashboard/settings/profile");
  revalidatePath("/dashboard", "layout");
  revalidatePath("/dashboard/settings");

  return {
    success: true,
    message: "Profile updated successfully.",
  };
}
