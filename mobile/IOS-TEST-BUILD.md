# iPhone test file

The `Build iPhone test IPA` workflow builds a Release app for a physical
iPhone on a GitHub macOS runner. It produces `TENH-POS-unsigned.ipa` inside a
downloadable workflow artifact. Push mobile code or workflow changes to `codex/ios-test-build`
to run it; manual dispatch is available once the workflow is on the default branch.
Vercel deployment is disabled only for this test branch. It does not publish to the App Store.

Before running, configure these repository Actions values:

- Variable `EXPO_PUBLIC_API_URL`: the deployed HTTPS TENH POS backend with the mobile API.
- Variable `EXPO_PUBLIC_SUPABASE_URL`: the shared Supabase project's HTTPS URL.
- Variable `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: its publishable or legacy anon key.
  This key is public in the compiled app; never supply a service-role/secret key.

Use a backend compatible with the mobile source in the build. A local PC address
will not work away from that PC's network. No real sale is needed to test building.

Cloud build verified on September 28, 2026: GitHub Actions run `36427049567`,
app source commit `c89e2a076186a1b17b2a6ee4ec1e161fdd6dce0b`.
The clean-install decoder tests, iOS bundle export, native build, and IPA packaging passed.
The downloaded IPA was checked for ZIP integrity, the physical-iPhone arm64 executable,
the bundled JavaScript, and the hosted API/Supabase URLs. App version: 1.0.0;
bundle identifier: `com.tenhpos.mobile`; minimum iOS: 16.4.
SHA-256: `7936d96da69b7808eb5d9b92da538ccc45cd64e9efa549377ff75cdfb32dd460`.
Signing, installation, and launch on a physical iPhone still need verification.
This update keeps cached lists visible, limits polling to operational lists, avoids
interrupting slow reads, and separates keychain queues by record. Eighteen focused
mobile checks and the mobile TypeScript check passed. The broader mobile-foundation
API suite is blocked by an existing missing tax-actions mock; those API checks were
not claimed as passing. On-device performance still needs verification.
GitHub macOS runner usage may consume included minutes or incur charges; check
the account's allowance before starting it.

The resulting file is unsigned. Download the artifact to Windows, extract it,
and install the IPA with Sideloadly using your own Apple ID and connected iPhone.
Enter Apple credentials yourself, never in chat or the repository. Downloading
the IPA in Safari alone does not install it. Free signing normally needs refresh
every seven days. Push notifications and other capabilities requiring paid
Apple provisioning are not validated by this free-signing test.
