# Private iPhone test file

The `Build iPhone test IPA` workflow builds a Release app for a physical
iPhone on a GitHub macOS runner. It produces `TENH-POS-unsigned.ipa` inside a
downloadable workflow artifact. Push mobile/build changes to `codex/ios-test-build`
to run it; manual dispatch is available once the workflow is on the default branch.
Vercel deployment is disabled only for this test branch. It does not publish to the App Store.

Before running, configure these repository Actions values:

- Variable `EXPO_PUBLIC_API_URL`: the deployed HTTPS TENH POS backend with the mobile API.
- Variable `EXPO_PUBLIC_SUPABASE_URL`: the shared Supabase project's HTTPS URL.
- Variable `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: its publishable or legacy anon key.
  This key is public in the compiled app; never supply a service-role/secret key.

Use a backend compatible with the mobile source in the build. A local PC address
will not work away from that PC's network. No real sale is needed to test building.

The workflow has not yet been run or verified on a cloud Mac. A successful cloud
build and installation are required before calling the file ready for testing.
GitHub macOS runner usage may consume included minutes or incur charges; check
the account's allowance before starting it.

The resulting file is unsigned. Download the artifact to Windows, extract it,
and install the IPA with Sideloadly using your own Apple ID and connected iPhone.
Enter Apple credentials yourself, never in chat or the repository. Downloading
the IPA in Safari alone does not install it. Free signing normally needs refresh
every seven days. Push notifications and other capabilities requiring paid
Apple provisioning are not validated by this free-signing test.
