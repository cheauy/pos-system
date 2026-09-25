export const posLockCookie=(businessId:string,userId:string)=>`tenh-pos-lock-${businessId}-${userId}`;
export function posLockAllows(path:string){
  const pathname=path.split(/[?#]/)[0].replace(/\/+$/,'')||'/';
  return ['/dashboard/pos','/dashboard/register','/dashboard/orders'].some(base=>pathname===base||pathname.startsWith(`${base}/`));
}
