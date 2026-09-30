import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getBranchContext } from "@/lib/branches/context";
import { authorizedOrderBranch } from "@/lib/branches/order-access";
import { validateShippingLayout, type ShippingLayout } from "./shipping-layout";
import { validateShippingSettings } from './shipping-templates';
const bucket = "tenh-printer-designs";
async function branchPath(businessId:string,file:string,orderId?:string) {
 const context=await getBranchContext();
 if(context.business.id!==businessId)throw new Error('The business changed. Reload printer settings.');
 const branchId=orderId?await authorizedOrderBranch(businessId,orderId):context.branchId;
 if(!branchId)throw new Error('Order is unavailable in this branch.');
 return `${businessId}/${branchId}/${file}`;
}
async function downloadSettings(businessId:string,file:string,orderId?:string) {
 const result=await supabaseAdmin.storage.from(bucket).download(await branchPath(businessId,file,orderId));
 // Existing stores keep their saved design until this branch saves its own copy.
 if(result.error && /not found|does not exist/i.test(result.error.message))return supabaseAdmin.storage.from(bucket).download(`${businessId}/${file}`);
 return result;
}
// Call only with the business resolved by a server-side permission check.
export async function loadShippingDesign(businessId: string): Promise<ShippingLayout | null> {
  const { data, error } = await downloadSettings(businessId,'shipping.json');
  if(error){
    if(/not found|does not exist/i.test(error.message)) return null;
    throw new Error("Unable to load the saved shipping design.");
  }
  return validateShippingLayout(JSON.parse(await data.text()));
}
export async function persistShippingDesign(businessId: string, layout: ShippingLayout) {
  const validated=validateShippingLayout(layout);
  const existing=await supabaseAdmin.storage.getBucket(bucket);
  if(existing.error){
    if(!/not found|does not exist/i.test(existing.error.message)) throw new Error("Unable to access printer design storage.");
    const created=await supabaseAdmin.storage.createBucket(bucket,{public:false,fileSizeLimit:131072,allowedMimeTypes:["application/json"]});
    if(created.error && !/already exists/i.test(created.error.message)) throw new Error(created.error.message);
  }
  const {error}=await supabaseAdmin.storage.from(bucket).upload(await branchPath(businessId,'shipping.json'),JSON.stringify(validated),{contentType:"application/json",upsert:true,cacheControl:"0"});
  if(error) throw new Error("Could not save the shipping design. Please retry.");
}

export async function loadShippingSettings(businessId:string,orderId?:string) {
 const {data,error}=await downloadSettings(businessId,'shipping-settings.json',orderId);
 if(error){if(/not found|does not exist/i.test(error.message))return null;throw new Error('Unable to load shipping settings.');}
 return validateShippingSettings(JSON.parse(await data.text()));
}
export async function persistShippingSettings(businessId:string,settings:Record<string,unknown>) {
 const values=validateShippingSettings(settings);
 const existing=await supabaseAdmin.storage.getBucket(bucket);
 if(existing.error){
  if(!/not found|does not exist/i.test(existing.error.message))throw new Error('Unable to access printer settings storage.');
  const created=await supabaseAdmin.storage.createBucket(bucket,{public:false,fileSizeLimit:131072,allowedMimeTypes:['application/json']});
  if(created.error && !/already exists/i.test(created.error.message))throw new Error(created.error.message);
 }
 const {error}=await supabaseAdmin.storage.from(bucket).upload(await branchPath(businessId,'shipping-settings.json'),JSON.stringify(values),{contentType:'application/json',upsert:true,cacheControl:'0'});
 if(error)throw new Error('Could not save shipping settings. Please retry.');
}
