// Android App Links: lets https://app.<domain>/o/<code> open the TENH POS app.
// ANDROID_SHA256_CERT_FINGERPRINTS: comma-separated SHA-256 fingerprints of the
// app signing certificate (EAS: `eas credentials`, or Play Console → App signing).
const PACKAGE = "com.tenhpos.mobile";
const fingerprint = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;

export function GET() {
  const prints = (process.env.ANDROID_SHA256_CERT_FINGERPRINTS ?? "")
    .split(",").map((value) => value.trim().toUpperCase()).filter((value) => fingerprint.test(value));
  if (!prints.length) return new Response("Not Found", { status: 404 });
  return Response.json([{
    relation: ["delegate_permission/common.handle_all_urls"],
    target: { namespace: "android_app", package_name: PACKAGE, sha256_cert_fingerprints: prints },
  }], { headers: { "Cache-Control": "public, max-age=3600" } });
}
