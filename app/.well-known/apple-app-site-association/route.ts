// iOS Universal Links: lets https://app.<domain>/o/<code> open the TENH POS app.
// Requires APPLE_TEAM_ID (Apple Developer → Membership → Team ID).
const BUNDLE_ID = "com.tenhpos.mobile";

export function GET() {
  const team = process.env.APPLE_TEAM_ID?.trim();
  if (!team || !/^[A-Z0-9]{10}$/.test(team)) return new Response("Not Found", { status: 404 });
  const body = { applinks: { details: [{ appIDs: [`${team}.${BUNDLE_ID}`], components: [{ "/": "/o/*", comment: "Order QR codes" }] }] } };
  return Response.json(body, { headers: { "Cache-Control": "public, max-age=3600" } });
}
