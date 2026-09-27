# Mobile performance pass — 27 September 2026

## Applied
- Orders and stock: virtualized rows, small render batches and paginated queries; existing debounced search retained.
- Alerts: virtualized infinite scroll, duplicate-ID merging, pull-to-refresh, cancellation on exit, and no Previous/Next buttons. Read status is saved before the UI confirms it.
- Initial loads: shimmer placeholders respecting Reduce Motion; animations stop while the app is backgrounded.
- Refreshes: keep existing records visible, with an indeterminate spinner.
- Image uploads: actual byte progress, followed by a saving spinner. Upload completion alone does not mean the record was saved.
- Product thumbnails: reuse native image caching and downsample decoding; memoized photo rendering.
- Read cache: existing user/business/branch keys retained; reuse reads for up to eight seconds on initial visits, forced manual refresh, foreground-only polling every 30 seconds, unchanged response object reuse. Mutations retain existing invalidation and server checks.
- Defer POS, management screens, and print/share modules until needed. Native release bundles are still Metro bundles; this is not a promise of separate production downloads.

## Already present
- Mobile product image uploads pass through the server image compressor (maximum 1600 px, WebP quality 82), then immutable storage paths with public CDN cache headers.
- Image-picker compression for expense/support photos; bounded upload sizes.
- Encrypted, limited offline read snapshots; server-authoritative stock, totals and permission checks.
- Expo/Metro release compilation and minification; no browser scripts or CSS on native screens.
- API access through Supabase HTTP clients, without opening a direct database connection per phone.

## Skipped deliberately
- No speculative database indexes, extra caches for financial/permission responses, load balancer or connection-pool changes without a measured backend bottleneck.
- No extra CDN: existing public product storage is already served through Supabase; private receipts/proofs retain their access controls.
- No broad dependency removals without confirming unused native/build dependencies.
- No custom payload-compression protocol; hosting/network transport handles compression where enabled.
- Lighthouse targets browser pages, not the Android/iOS native app, so no Lighthouse score is claimed. Physical scrolling, memory, network and release-build profiling remain unmeasured.

Header and Home layout were kept. No real sales, payments, returns, or stock adjustments were performed during this pass.
