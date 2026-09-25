import { handlePaywayCallback } from "@/lib/payway/callback";
export const runtime="nodejs";
export async function POST(request:Request){return handlePaywayCallback(request,"business_change");}
