export const SUPPORT_REASONS = ['Bug or Technical Issue','Billing or Payment','Account & User Access','Something Else'] as const;
export const SUPPORT_IMAGE_BUCKET = 'support-report-images';
export const SUPPORT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export function readSupportFields(form:FormData){
  const text=(name:string)=>typeof form.get(name)==='string'?String(form.get(name)).trim():'';
  const title=text('title'),reason=text('reason'),description=text('description'),priority=text('priority')||'normal';
  if(title.length<3||title.length>160)return {error:'Enter a title between 3 and 160 characters.'} as const;
  if(!SUPPORT_REASONS.some(value=>value===reason))return {error:'Choose a reason for your report.'} as const;
  if(description.length>6000||!['low','normal','urgent'].includes(priority))return {error:'Review the report details and priority.'} as const;
  const image=form.get('image');
  if(!(image instanceof File)||!image.size||image.size>SUPPORT_IMAGE_MAX_BYTES||!['image/png','image/jpeg','image/webp'].includes(image.type))return {error:'Add a JPG, PNG or WebP image up to 5 MB.'} as const;
  return {title,reason,description,priority,image};
}
