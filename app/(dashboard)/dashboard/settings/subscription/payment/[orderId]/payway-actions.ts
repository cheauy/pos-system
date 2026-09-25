'use server';

import { getCurrentBusinessForSubscription } from '@/lib/business/get-current-business';
import { createClient } from '@/lib/supabase/server';
import { prepareSubscriptionPaywayCheckout, verifyAndConfirmSubscriptionPaywayPayment, type PaywayOrderKind } from '@/lib/payway/server';

async function owner(orderId:string) {
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId))throw new Error('Invalid payment order.');
  const business=await getCurrentBusinessForSubscription({startTrial:false});
  if(business.role!=='owner')throw new Error('Only the business owner can manage this payment.');
  const db=await createClient();
  const {data:{user}}=await db.auth.getUser();
  if(!user)throw new Error('Please sign in again.');
  return {business,user};
}
export async function startPaywayPopup(orderId:string, kind?:PaywayOrderKind) {
  try {
    const {business,user}=await owner(orderId);
    return {checkout:await prepareSubscriptionPaywayCheckout({orderId,businessId:business.id,email:user.email,...(kind==='business_change'?{kind}: {})}),error:null};
  } catch(error) {return {checkout:null,error:error instanceof Error?error.message:'Unable to open ABA PayWay.'};}
}
export async function checkPaywayPopup(orderId:string, kind?:PaywayOrderKind) {
  try {
    const {business}=await owner(orderId);
    const result=await verifyAndConfirmSubscriptionPaywayPayment({orderId,businessId:business.id,...(kind==='business_change'?{kind}: {})});
    return {state:result.state,error:null};
  } catch(error) {return {state:null,error:error instanceof Error?error.message:'Unable to check payment. Please try again.'};}
}
