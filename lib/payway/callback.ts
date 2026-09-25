import { NextResponse } from "next/server";
import {verifyAndConfirmSubscriptionPaywayPayment,verifyPaywayCallbackSignature,type PaywayOrderKind} from "./server";

export async function handlePaywayCallback(request:Request,kind:PaywayOrderKind){
  let payload:Record<string,unknown>;
  try{const parsed=await request.json();if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))return NextResponse.json({ok:false,error:"Invalid payload"},{status:400});payload=parsed;}
  catch{return NextResponse.json({ok:false,error:"Invalid JSON"},{status:400});}
  if(!verifyPaywayCallbackSignature(payload,request.headers.get("x-payway-hmac-sha512")))return NextResponse.json({ok:false,error:"Invalid signature"},{status:401});
  const tranId=typeof payload.tran_id==="string"?payload.tran_id:"";
  if(!tranId)return NextResponse.json({ok:false,error:"Missing transaction ID"},{status:400});
  try{const result=await verifyAndConfirmSubscriptionPaywayPayment({tranId,kind});return NextResponse.json({ok:true,state:result.state});}
  catch(error){return NextResponse.json({ok:false,error:error instanceof Error?error.message:"Verification failed"},{status:503});}
}
