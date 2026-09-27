# Mobile testing and release

Updated September 27, 2026. Android and iPhone are available for testing. Expo ownership is `cheauy`; the project ID and app identifiers are already configured in `app.json`. Apple/Google store publishing remains deferred by the owner.

## Verified by automation

- Mobile and website point to the same `pos-system` Supabase project.
- All five mobile database migrations are installed. Management and push tables deny direct customer access; public callers cannot execute management writes or notification dispatch.
- Android and iOS JavaScript exports succeeded. Expo Doctor passed all 21 checks. The production dependency audit reported zero vulnerabilities.
- Focused tests cover authentication, branch isolation, payment math, durable requests, refunds, receiving, stock conservation, transfers, images and notification claims.
- No test sales, refunds, stock movements or management saves were performed in live business data.

## Run locally on the phones

1. Keep the PC and both phones on the same router/network. Start the website with `npm run dev -- --hostname 0.0.0.0` from the repository root.
2. Set `mobile/.env.local` to the PC's LAN API address and the same public Supabase project/key as the website. Do not put server secrets in this file.
3. From `mobile`, run `npx expo start --go --lan`. Scan the displayed QR using Expo Go. The PC and both processes must stay on.
4. Sign in with an existing authorized account. First compare Home, Products, Orders and Stock with the website without changing live transactions.
5. If a phone cannot connect, check its network and the LAN address. Do not disable the firewall globally; use the normal Node/local-network permission prompt.

Expo Go covers the first viewing/camera checks. Push and Face ID need a native development build. Their UI reports this requirement rather than pretending they were enabled.

Phone test started September 27: the Android screenshot identified an unconditional `expo-notifications` import that raised Expo Go's unsupported remote-notifications error before sign-in. The module now loads only outside Expo Go, and notification hooks/settings skip native push APIs in Expo Go. Regression checks cover both runtimes. On September 27, 2026, the owner confirmed that both Android and iPhone open normally after the fix. This confirms startup only; sign-in and the remaining checks still need confirmation.

## Device acceptance record

Fill in Android and iPhone results separately. Automated tests do not count as a hardware pass.

| Check | Expected result | Android | iPhone |
|---|---|---|---|
| Open app | App opens normally without the startup error | Passed — owner confirmed | Passed — owner confirmed |
| Sign in | Existing account opens its correct business | Pending | Pending |
| Staff branch | Assigned staff cannot read or write another branch | Pending | Pending |
| Owner branch switch | Lists and settings follow the chosen branch | Pending | Pending |
| Web/mobile refresh | An authorized real change appears on the other client | Pending | Pending |
| Products and bundles | Correct images, sizes, colours, branch price and visibility | Pending | Pending |
| Khmer/dark mode | Readable labels, dialogs, contrast and large text | Pending | Pending |
| Offline/reconnect | Previously loaded allowed data only; writes blocked offline | Pending | Pending |
| Camera | Permission, barcode scan and denial recovery work | Pending | Pending |
| Receipt/label | Correct saved dimensions; QR/barcode scan from actual paper | Pending | Pending |
| Printer | Record model, connection type and supported print service | Pending | Pending |
| Biometric build | Lock, unlock, cancellation and sign-in recovery | Pending | Pending |
| Push build | One unread alert, correct branch, tap opens Alerts, disable works | Pending | Pending |

Checkout, receiving, packing, transfers, register reconciliation and refunds must be checked during an owner-authorized real transaction or an explicitly designated disposable test business. Do not create fake paid orders or refunds in the live store just to fill the checklist. Simulated interrupted requests are covered in isolated database tests, but still need a controlled device check before public release.

## Background notifications

1. Deploy the mobile API and `app/api/internal/mobile-push/route.ts` to the existing HTTPS website. Preserve normal web authentication and keep the internal endpoint protected by `CRON_SECRET`.
2. Configure APNs and FCM credentials through the owner's Expo/EAS project. Never store private signing keys or service credentials in the app bundle or repository.
3. Set server-only `MOBILE_PUSH_ENABLED=true`. If Expo enhanced push security is enabled, also set server-only `EXPO_ACCESS_TOKEN`.
4. Configure an authorized scheduler to call `GET /api/internal/mobile-push` every few minutes with `Authorization: Bearer <CRON_SECRET>`. This repository has not enabled that production schedule. Choose an interval supported by the host's plan; a daily job is not timely notification delivery.
5. On each signed development build, explicitly enable notifications. Verify provider tickets/receipts and actual arrival. Device tokens are private, and previews contain no customer details.

The dispatcher attempts each device/notification claim once to avoid duplicates after unknown network outcomes. A missed push remains available in the in-app alert feed. Registrations expire from dispatch after 30 days without refresh. The pilot scan covers at most 1,000 active devices per run; add pagination before expanding past that ceiling. Delivery receipts are checked 15 minutes to 24 hours after sending. Reporting a sent ticket is not proof the phone displayed a notification.

## Signed builds and store release

1. Deploy and verify the HTTPS mobile API before making a customer preview/release build. Set `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in the matching EAS environment. Local `.env.local` is not a cloud environment configuration.
2. Use the existing `eas.json` profiles: `development` for device features, `preview` for an internal Android APK, `production` for store builds. Production configuration rejects HTTP API addresses and missing public connection values.
3. Generate/manage Android signing through EAS. Physical iPhone builds need the owner's Apple Developer team, provisioning and device registration. The owner must complete credential/2FA steps; never send passwords in chat.
4. Run `npx eas-cli@latest build --platform android --profile development` and the corresponding iOS build after credentials are ready. Install and fill in the device record above.
5. Before submitting, prepare the privacy policy, support URL, screenshots, privacy/data-safety answers and review account. Verify what the app and its dependencies actually collect; do not copy generic declarations.
6. Submit only when the owner is ready and both device columns pass. No store submission or signed APK/IPA is claimed by the current automated checks.

The Supabase dashboard currently warns that the organization may be restricted from October 10, 2026 if its quota overage remains unresolved. Resolve that before a public release.
