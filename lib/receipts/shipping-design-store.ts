import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { validateShippingLayout, type ShippingLayout } from "./shipping-layout";
const bucket = "tenh-printer-designs";
// Call only with the business resolved by a server-side permission check.
export async function loadShippingDesign(businessId: string): Promise<ShippingLayout | null> {
  const { data, error } = await supabaseAdmin.storage.from(bucket).download(`${businessId}/shipping.json`);
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
  const {error}=await supabaseAdmin.storage.from(bucket).upload(`${businessId}/shipping.json`,JSON.stringify(validated),{contentType:"application/json",upsert:true,cacheControl:"0"});
  if(error) throw new Error("Could not save the shipping design. Please retry.");
}

const shippingFlags = ['store_name','store_address','store_phone','phone','order_number','cod','item_count','barcode'] as const;
function validateSettings(value: unknown): Record<string,string|boolean> {
 if(!value || typeof value!=='object') throw new Error('Invalid shipping settings.');
 const settings=value as Record<string,unknown>;
 if(!['80x50','100x100','100x150'].includes(String(settings.shipping_label_size))) throw new Error('Invalid shipping label size.');
 const result:Record<string,string|boolean>={shipping_label_size:String(settings.shipping_label_size)};
 for(const flag of shippingFlags){const key=`shipping_show_${flag}`;if(typeof settings[key]!=='boolean') throw new Error('Invalid shipping visibility setting.');result[key]=settings[key] as boolean;}
 return result;
}
export async function loadShippingSettings(businessId:string) {
 const {data,error}=await supabaseAdmin.storage.from(bucket).download(`${businessId}/shipping-settings.json`);
 if(error){if(/not found|does not exist/i.test(error.message))return null;throw new Error('Unable to load shipping settings.');}
 return validateSettings(JSON.parse(await data.text()));
}
export async function persistShippingSettings(businessId:string,settings:Record<string,unknown>) {
 const values=validateSettings(settings);
 const existing=await supabaseAdmin.storage.getBucket(bucket);
 if(existing.error){
  if(!/not found|does not exist/i.test(existing.error.message))throw new Error('Unable to access printer settings storage.');
  const created=await supabaseAdmin.storage.createBucket(bucket,{public:false,fileSizeLimit:131072,allowedMimeTypes:['application/json']});
  if(created.error && !/already exists/i.test(created.error.message))throw new Error(created.error.message);
 }
 const {error}=await supabaseAdmin.storage.from(bucket).upload(`${businessId}/shipping-settings.json`,JSON.stringify(values),{contentType:'application/json',upsert:true,cacheControl:'0'});
 if(error)throw new Error('Could not save shipping settings. Please retry.');
}
