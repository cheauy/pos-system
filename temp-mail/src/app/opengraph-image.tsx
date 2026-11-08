import { ImageResponse } from "next/og";

export const alt = "Tenh Temp Mail — free temporary email and OTP inbox";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(<div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: 90, background: "#10131c", color: "#f0f1f7" }}>
    <div style={{ display: "flex", fontSize: 34, color: "#a39bff", marginBottom: 32 }}>Tenh Temp Mail</div>
    <div style={{ display: "flex", fontSize: 74, fontWeight: 700, lineHeight: 1.15 }}>Your instant OTP inbox.</div>
    <div style={{ display: "flex", fontSize: 30, marginTop: 32, color: "#b7bac9" }}>Free disposable email · Receive OTP · Test email flows</div>
    <div style={{ display: "flex", fontSize: 25, marginTop: 52, color: "#37d9b0" }}>temp-mail.tenh-pos.com</div>
  </div>, size);
}
