import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getCurrentBusiness } from '@/lib/business/get-current-business';
import { SUPPORT_IMAGE_BUCKET } from '@/lib/support/reports';

export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
  const {id}=await params;
  const denied=()=>new Response('Image unavailable',{status:404,headers:{'Cache-Control':'private, no-store'}});
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))return denied();
  const db=await createClient();
  const {data:{user},error}=await db.auth.getUser();
  if(error||!user)return denied();
  const profile=await db.from('profiles').select('role,is_active').eq('id',user.id).maybeSingle();
  const isAdmin=!profile.error&&profile.data?.role==='super_admin'&&profile.data?.is_active===true;
  let query=supabaseAdmin.from('platform_support_reports').select('image_path,created_by,business_id').eq('id',id);
  if(!isAdmin){
    try{
      const business=await getCurrentBusiness();
      const membership=await supabaseAdmin.from('business_members').select('id').eq('business_id',business.id).eq('user_id',user.id).eq('is_active',true).maybeSingle();
      if(membership.error||!membership.data)return denied();
      query=query.eq('business_id',business.id).eq('created_by',user.id);
    }catch{return denied();}
  }
  const report=await query.maybeSingle();
  if(report.error||!report.data?.image_path)return denied();
  const {data,error:downloadError}=await supabaseAdmin.storage.from(SUPPORT_IMAGE_BUCKET).download(report.data.image_path);
  if(downloadError||!data)return denied();
  return new Response(data,{headers:{'Content-Type':'image/webp','Content-Disposition':'inline; filename="report.webp"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}
