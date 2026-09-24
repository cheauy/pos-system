import "server-only";
import { createHmac } from "node:crypto";
import { getPaywayConfig, verifyPaywayCallbackSignature } from "@/lib/payway/server";

export type HealthResult = { name: string; status: "ok" | "warning" | "error"; detail: string; durationMs: number };
async function request(url: string, headers: Record<string,string> = {}) {
  return fetch(url, { headers, cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(8000) });
}
async function check(name: string, run: () => Promise<{status:HealthResult["status"];detail:string}>): Promise<HealthResult> {
  const start = Date.now();
  try { return { name, ...await run(), durationMs: Date.now()-start }; }
  catch { return { name, status:"error", detail:"The check could not complete. Check server configuration and connectivity, then retry.", durationMs:Date.now()-start }; }
}
function supabaseConnection() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing configuration");
  return {url:new URL(url).origin,headers:{apikey:key,Authorization:`Bearer ${key}`}};
}
export async function collectHealth(): Promise<HealthResult[]> {
  return Promise.all([
    check("Supabase", async()=>{
      const {url,headers}=supabaseConnection();
      const response=await request(`${url}/auth/v1/health`,headers);
      return response.ok?{status:"ok",detail:"Supabase gateway and authentication service responded."}:{status:"error",detail:`Supabase authentication health failed (HTTP ${response.status}).`};
    }),
    check("Database", async()=>{
      const {url,headers}=supabaseConnection();
      const response=await request(`${url}/rest/v1/businesses?select=id&limit=1`,headers);
      return response.ok?{status:"ok",detail:"Authenticated database read succeeded."}:{status:"error",detail:`Database read failed (HTTP ${response.status}).`};
    }),
    check("ABA PayWay", async()=>{
      if(!process.env.PAYWAY_MERCHANT_ID || !process.env.PAYWAY_API_KEY) return {status:"warning",detail:"Merchant ID or API key is not configured."};
      const config=getPaywayConfig();
      const response=await request(new URL(config.purchaseUrl).origin);
      return {status:response.status>=500?"error":"warning",detail:response.status>=500?"PayWay gateway returned a server error.":`${config.environment === "live"?"Live":"Sandbox"} configuration loaded; gateway responded. Merchant authentication and payment processing require a separate payment test.`};
    }),
    check("Vercel", async()=>{
      const token=process.env.VERCEL_TOKEN;
      const deployment=process.env.VERCEL_DEPLOYMENT_ID || process.env.VERCEL_URL;
      if(!token || !deployment)return {status:"warning",detail:"Deployment health is not verified. Configure VERCEL_TOKEN and a deployment ID or VERCEL_URL on the server."};
      const url=new URL(`https://api.vercel.com/v13/deployments/${encodeURIComponent(deployment)}`);
      if(process.env.VERCEL_TEAM_ID)url.searchParams.set("teamId",process.env.VERCEL_TEAM_ID);
      const response=await request(url.toString(),{Authorization:`Bearer ${token}`});
      if(!response.ok)return {status:"error",detail:`Deployment check failed (HTTP ${response.status}). Check token access and deployment configuration.`};
      const body=await response.json() as {readyState?:string};
      const state=body.readyState;
      return {status:state==="READY"?"ok":state==="ERROR"||state==="CANCELED"?"error":"warning",detail:state==="READY"?"Current deployment is ready. This does not verify every application route.":state==="ERROR"||state==="CANCELED"?"The deployment failed or was canceled.":"The deployment is not ready or its state is unavailable."};
    }),
    check("Background jobs",async()=>{
      if(!process.env.CRON_SECRET)return {status:"warning",detail:"The daily subscription job is disabled: CRON_SECRET is not configured."};
      const {url,headers}=supabaseConnection();
      const response=await request(`${url}/rest/v1/system_job_health?select=status,started_at,finished_at&job_name=eq.subscription-purge&limit=1`,headers);
      if(response.status===404)return {status:"warning",detail:"Job monitoring is not installed. Apply the system job health migration."};
      if(!response.ok)return {status:"error",detail:`Job monitoring read failed (HTTP ${response.status}).`};
      const rows=await response.json() as Array<{status:string;started_at:string;finished_at:string|null}>;
      const job=Array.isArray(rows)?rows[0]:undefined;
      if(!job)return {status:"warning",detail:"No daily subscription job run recorded yet. Check the deployed cron schedule; this check never runs the job."};
      if(job.status==="failed")return {status:"error",detail:"The latest daily subscription job failed. Review server logs."};
      const started=Date.parse(job.started_at),finished=Date.parse(job.finished_at??"");
      const age=Date.now()-(job.status==="running"?started:finished);
      if(!Number.isFinite(age)||age<0)return {status:"warning",detail:"The last job timestamp is unavailable or invalid."};
      if(job.status==="running")return {status:age>15*60_000?"error":"warning",detail:age>15*60_000?"The daily subscription job has not finished for over 15 minutes.":"The daily subscription job is running."};
      if(job.status!=="succeeded")return {status:"warning",detail:"The latest job status is unavailable."};
      return age>26*60*60_000?{status:"error",detail:"The daily subscription job is overdue: no successful completion in 26 hours."}:{status:"ok",detail:`Daily subscription job completed at ${new Date(finished).toISOString()}. Other unscheduled tasks are not monitored.`};
    }),
    check("Email · Resend",async()=>{
      const key=process.env.RESEND_API_KEY,from=process.env.ORDER_EMAIL_FROM;
      if(!key || !from)return {status:"warning",detail:"Configure RESEND_API_KEY and ORDER_EMAIL_FROM."};
      const response=await request("https://api.resend.com/domains",{Authorization:`Bearer ${key}`});
      if(response.status===403)return {status:"warning",detail:"This key cannot list domains. Sender configuration exists; delivery is not verified."};
      if(!response.ok)return {status:"error",detail:`Email provider check failed (HTTP ${response.status}).`};
      const body=await response.json() as {data?:Array<{name:string;status:string}>};
      const domain=from.match(/@([^>\s]+)/)?.[1]?.toLowerCase();
      const verified=body.data?.some(d=>d.name.toLowerCase()===domain&&d.status==="verified");
      return {status:verified?"ok":"warning",detail:verified?"API access and sender domain verified. No email was sent.":"API access succeeded; the sender domain was not found as verified in the returned domain list."};
    }),
    check("OAuth · Google / Facebook",async()=>{
      const {url}=supabaseConnection();
      const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if(!key)return {status:"warning",detail:"Public authentication key is missing."};
      const response=await request(`${url}/auth/v1/settings`,{apikey:key});
      if(!response.ok)return {status:"error",detail:`Authentication settings failed (HTTP ${response.status}).`};
      const settings=await response.json() as {external?:Record<string,boolean>};
      return {status:"warning",detail:`Google ${settings.external?.google?"enabled":"disabled"}; Facebook ${settings.external?.facebook?"enabled":"disabled"}. Complete a sign-in to verify consent and callback redirects.`};
    }),
    check("Storage",async()=>{
      const {url,headers}=supabaseConnection();
      const response=await request(`${url}/storage/v1/bucket`,headers);
      if(!response.ok)return {status:"error",detail:`Storage check failed (HTTP ${response.status}).`};
      const buckets=await response.json();
      return {status:Array.isArray(buckets)&&buckets.length?"ok":"warning",detail:Array.isArray(buckets)?`${buckets.length} storage buckets accessible. Upload/delete operations were not tested.`:"Storage returned an unexpected response."};
    }),
    check("Webhooks",async()=>{
      if(!process.env.PAYWAY_API_KEY || !process.env.PAYWAY_MERCHANT_ID)return {status:"warning",detail:"PayWay callback configuration is incomplete. Manual bank auto-verification is disabled by design."};
      const {apiKey}=getPaywayConfig();
      const payload={tran_id:"TENH-HEALTH-SELF-TEST"};
      const signature=createHmac("sha512",apiKey).update(payload.tran_id).digest("base64");
      const safe=verifyPaywayCallbackSignature(payload,signature)&&!verifyPaywayCallbackSignature({...payload,tran_id:"tampered"},signature)&&!verifyPaywayCallbackSignature(payload,null);
      return {status:safe?"warning":"error",detail:safe?"Signature validation self-test passed. Public callback delivery is not tested; no transaction was processed.":"Callback signature validation self-test failed."};
    }),
    check("External services",async()=>{
      const responses=await Promise.all([request("https://accounts.google.com/.well-known/openid-configuration"),request("https://www.facebook.com")]);
      return responses.every(r=>r.ok)?{status:"ok",detail:"Google identity discovery and Facebook responded. This checks reachability, not OAuth credentials."}:{status:"warning",detail:"An identity provider did not return a successful response. It may block server-side checks; verify browser sign-in."};
    }),
  ]);
}
