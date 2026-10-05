import 'server-only';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/branch-server';
import { getBranchContext } from '@/lib/branches/context';
import { authorizedOrderBranch } from '@/lib/branches/order-access';
import { shippingCustomTemplates, type NamedShippingTemplate } from './shipping-templates';

const setupError='Apply the reviewed shipping custom template migration before saving named templates.';
function missingMigration(error:{code?:string;message:string}) {
  return ['42P01','42883','PGRST202','PGRST205'].includes(error.code??'');
}
async function templateBranch(businessId:string,orderId?:string) {
  const context=await getBranchContext();
  if(context.business.id!==businessId)throw new Error('The business changed. Reload printer settings.');
  const branchId=orderId?await authorizedOrderBranch(businessId,orderId):context.branchId;
  if(!branchId)throw new Error('Order is unavailable in this branch.');
  return branchId;
}
/** Admin reads are limited to the resolved operating branch or one authorized order. */
export async function loadShippingTemplateCatalog(businessId:string,orderId?:string):Promise<NamedShippingTemplate[]|null> {
  const branchId=await templateBranch(businessId,orderId);
  const {data,error}=await supabaseAdmin.from('branch_shipping_templates').select('templates').eq('business_id',businessId).eq('location_id',branchId).maybeSingle();
  if(error){if(missingMigration(error))return null;throw new Error('Unable to load saved custom templates.');}
  return data?shippingCustomTemplates(JSON.stringify(data.templates),true):null;
}
/** The authenticated RPC merges one entry and compares its revision inside its transaction. */
export async function persistShippingNamedTemplate(businessId:string,entry:NamedShippingTemplate,mode:'create'|'update',expectedRevision:number,legacy:NamedShippingTemplate[]) {
  const branchId=await templateBranch(businessId);
  const [validated]=shippingCustomTemplates(JSON.stringify([{id:entry.id,name:entry.name,layout:entry.layout}]));
  if(!Number.isSafeInteger(expectedRevision)||expectedRevision<0)throw new Error('Reopen the template before saving changes.');
  const seed=shippingCustomTemplates(JSON.stringify(legacy)).map(template=>({...template,revision:0}));
  const db=await createClient();
  const {data,error}=await db.rpc('tenh_save_shipping_template',{
    p_business_id:businessId,p_location_id:branchId,p_mode:mode,p_entry:validated,p_expected_revision:expectedRevision,p_legacy:seed,
  });
  if(error){
    if(missingMigration(error))throw new Error(setupError);
    if(error.message==='Invalid shipping element.'&&[validated,...seed].some(template=>template.layout.elements.some(element=>['tracking','date','logo','shippingType'].includes(element.field))))throw new Error('Printer template storage needs an update. Ask an administrator to apply the shipping editor field migration, then retry. Your changes remain in the editor.');
    throw new Error(error.message);
  }
  const committed=shippingCustomTemplates(JSON.stringify(data),true);
  const saved=committed.find(template=>template.id===validated.id);
  if(!saved||saved.revision!==expectedRevision+1)throw new Error('Could not confirm the saved template revision. Reload settings.');
  return committed;
}
