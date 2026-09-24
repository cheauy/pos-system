# Performance changes and audit

Implemented against the current Next.js/Supabase application. No production deployment, customer-data rewrite, or infrastructure purchase was performed.

## Applied

| Area | Change |
| --- | --- |
| Image compression | New product, variant, bundle and storefront-banner photos are resized to at most 1600 × 1600 and encoded as WebP when appropriate. Small images are kept when conversion would make them larger. Corrupt, oversized and unsupported input is rejected. |
| Existing images | Responsive Next Image thumbnails on POS, product lists, storefront cards, bundle lists and product pickers. Only the configured public product bucket can use the optimizer. |
| Sensitive images | Payment proofs, QR codes, print artwork, private/signed URLs and upload previews retain their existing behavior. Full-screen originals remain available. |
| Lazy loading and chunks | Product photos lazy-load. Standard, variant, configurable and bundle creation forms load on demand instead of joining the initial list-page bundle. |
| Server caching | React request-scoped caching deduplicates current-business resolution across layouts, pages and permission checks. New requests still validate membership/subscription access. |
| Repeated calculations | POS brand, colour, size and low-stock calculations are memoized against their actual catalog/branch inputs. |
| Pagination | Bundle table renders 20 rows per page. Search uses a deferred value so typing can remain responsive. |
| Loading UI | Shared dashboard skeleton covers slow route navigation; deferred forms have loading messages. |
| Non-critical startup | Optional photo-cache registration waits for idle time; Khmer font files are not preloaded on English pages. Khmer font styling and on-demand loading remain enabled. |
| Dependencies | Removed five unused direct dependencies: `@hookform/resolvers`, `react-hook-form`, `clsx`, `date-fns`, `zod`. Declared the already-installed Sharp version directly because application upload processing now uses it. |
| Build readiness | Restored the sidebar notification hook's existing unread/toast values to its returned interface, fixing the five TypeScript errors that blocked production builds. |

## Already present or deliberately skipped

| Request | Finding / decision |
| --- | --- |
| CDN | Public media already uses Supabase storage URLs and cache headers. Retained the existing photo cache and long-lived unique upload URLs. No second CDN provider was introduced. |
| JS/CSS minification | The production Next.js build already handles this; source files were not manually minified. |
| HTTP/API compression | Kept the framework's compression. A request advertising gzip returned `Content-Encoding: gzip` from the production server. No duplicate compression middleware was added. |
| Debouncing | Global server search already debounces input by 450 ms. Barcode scanning, checkout and payment handlers were not delayed. |
| Existing pagination | Products, inventory, online catalog and POS already limit visible rows/cards. Their established selection/count behavior was preserved. |
| Database indexes | Read-only inspection found 49 indexes across the eight audited business/catalog/order tables. A representative branch/date order query used `orders_business_id_idx` with an estimated cost of 1.27. No evidence justified another index or removal of an existing one. This was an EXPLAIN estimate, not a production load test. |
| Persistent API/data cache | Not added for live prices, stock, orders, permissions or subscriptions. Stale values could affect checkout and branch access. Request-level deduplication is used instead. |
| Connection pool | The application uses Supabase HTTP clients, not application-owned PostgreSQL connections. No new application pool was added. |
| Load balancer | Deployment infrastructure was not changed. There was no traffic/capacity evidence requiring a new load-balancer service. |

## Lighthouse

Mobile-emulated audits used a separate **production** build on `http://127.0.0.1:3101`, leaving the development server's `.next` directory intact. These are single-run local measurements, not production percentiles or a guarantee of the same improvement on every device.

| Metric | Home before | Home after | Login after |
| --- | ---: | ---: | ---: |
| Performance | 87 | 90 | 91 |
| Accessibility | 96 | 96 | 92 |
| Best practices | 100 | 100 | 100 |
| SEO | 100 | 100 | 100 |
| First contentful paint | 1.2 s | 1.2 s | 1.1 s |
| Largest contentful paint | 3.7 s | 3.4 s | 3.4 s |
| Total blocking time | 30 ms | 20 ms | 90 ms |
| Layout shift | 0 | 0 | 0 |
| Total transfer | 400 KiB | 358 KiB | 366 KiB |

Full local HTML/JSON reports are saved in `.performance-reports/` (ignored by Git). Home after: `home-after.report.html`; login: `login-after.report.html`; baseline: `home-before.html`.

The baseline and login CLI runs returned nonzero exit codes despite producing complete reports; the process-exit cause was not confirmed. All three reports contain no Lighthouse runtime error, failed audit or run warning. The home-after run exited normally. Authenticated dashboard/POS pages were not audited with Lighthouse because no signed-in browser session was available; no authentication bypass was used.

## Verification and limits

- Final production build and TypeScript validation passed.
- 57 targeted tests passed: photo compression, safe optimizer routing, cache limits/fallbacks, bundle pagination/actions, storefront presentation, printer settings and branch isolation.
- New/changed standalone performance modules pass lint. A broader lint check still reports 11 existing hook/effect errors in older POS/sidebar/product-list code; this is not a globally lint-clean repository.
- Synthetic 3200 × 2400 test image: **45,269 bytes → 3,498 bytes**. Real compression depends on the photo; this is a test fixture, not a measured average across customer images.
- Existing stored originals were not destructively recompressed. Responsive thumbnails improve their display transfer; compression at upload applies to newly saved photos.
- Pagination added here limits rendered rows, not the server-side size of every catalog payload. Large authenticated catalogs still need workload-specific profiling before redesigning their full variant/stock-fetching flows.
- No private API response was put into a shared persistent cache, and no sale, stock allocation, customer record or payment was changed by the audit.

To repeat the production audit, set `TENH_BUILD_DIR=.next-performance`, run the production build and start it on an unused local port, then run Lighthouse against that port. Lighthouse was installed in the system temporary tools directory, not added to application dependencies.
