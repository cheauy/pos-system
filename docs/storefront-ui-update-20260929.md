# TENH POS — Storefront and navigation update

Date: September 29, 2026  
Source baseline: `pos-system(20260929-055415).zip`

## Apply the update

Use either the small patch ZIP **or** the full updated project ZIP; both contain the same code changes.

For the patch, close the local development server, extract the patch into your existing project root (the folder containing `package.json`), and replace matching files. Do not delete or replace the entire `app`, `lib`, or `tests` directories. Keep your environment files and installed dependencies. Start your development server again with `npm run dev`, or run your normal build and deployment process.

No database migration, dependency change, subscription change, payment integration change, or native mobile project change is required by this patch. The new storefront language setting uses the existing `business_storefronts.social_links.profile` JSON field.

## What changed

### Navigation

Selecting a child link closes its submenu, including selecting the current page. The mobile drawer also closes after selection. The existing permission filtering, POS navigation lock and menu destinations are unchanged. The common close handler is also used by search and notification navigation.

### Save Changes and previews

The Online Store Save Changes action is fixed near the bottom center of the viewport, with a safe-area bottom inset and enough bottom page space. It remains attached to the existing settings form and retains pending/permission handling. The redundant Preview action beside Save and Preview store action in the catalog manager are removed. The header's Open Public Store link and SEO / Meta Preview section remain.

### Storefront images and pre-order

Product-card images are contained within a stable frame without cropping or stretching, in both grid and list views. The existing product detail and cart image fitting is preserved.

A product card now shows Pre-order when one of its current variants is marked for pre-order by the existing catalog toggle. Removing the flag removes the label; stale/deleted variant IDs do not label a product. This is a display fix: existing stock restrictions and checkout validation are unchanged. It does not enable selling beyond available stock.

### Opening hours

Enable / Disable buttons replace the checkbox. Enable reveals the timezone and Monday–Sunday setup; Disable hides the setup and public opening hours. Disabling retains the entered schedule so re-enabling restores it. Closed-day flags and times remain part of the submitted form. Opening hours are informational; online order availability still follows the existing online-order switch.

### Branding and language

English and Khmer buttons set the storefront's default language. The initial public render uses that saved setting, with English as the fallback for existing stores. A customer's manual language selection is remembered per store. Changing the merchant's default invalidates a visitor preference tied to the old default on the next visit.

The public storefront is excluded from the dashboard's shared automatic translator, preventing the admin's language cookie from overriding the store's chosen language. Opening-hours weekday labels also follow the storefront language.

The Theme preview card and embedded Order rules card are removed. Pickup/delivery controls remain. Saving Branding preserves existing minimum order, delivery fee, preparation time and checkout message when those removed inputs are absent, rather than silently resetting them. The reusable Order rules component and its existing server action are not deleted; this update does not create another settings page for them.

## Files

Replaced source files:

- `app/(dashboard)/dashboard/sidebar-client.tsx`
- `app/(dashboard)/dashboard/online-store/storefront-settings-form.tsx`
- `app/(dashboard)/dashboard/online-store/ordering/fulfillment-fields.tsx`
- `app/(dashboard)/dashboard/online-store/actions.ts`
- `app/(dashboard)/dashboard/online-store/catalog-manager.tsx`
- `app/(dashboard)/dashboard/online-store/page.tsx`
- `app/(dashboard)/dashboard/online-store/opening-hours-editor.tsx`
- `lib/storefront/profile.ts`
- `app/_sites/[slug]/storefront-language.tsx`
- `app/_sites/[slug]/page.tsx`
- `app/_sites/[slug]/storefront-catalog.tsx`
- `app/_sites/[slug]/storefront.css`
- `app/_sites/[slug]/storefront-contact.tsx`

Added:

- `tests/storefront-ui-settings.test.mjs`
- `docs/storefront-ui-update-20260929.md` (this file)

All other entries in the full archive are preserved from the supplied baseline. No test-runtime dependencies or browser fixtures are added to the delivered project.

## Verification

- Source audit: 495 source files and 1,311 internal imports; no syntax, internal import/export, or async Server Action declaration errors found. This audit is not a full TypeScript type-check.
- Existing focused regression tests: 17 passed.
- New settings/UI regression tests: 9 passed.
- Seven isolated Chromium browser scenarios passed with no page JavaScript errors. They cover all 28 desktop submenu links; same-page keyboard activation; the mobile drawer; fixed Save Changes positioning at 1440, 768 and 390 px widths; hours/language form interactions; read-only controls; storefront language isolation; and portrait, landscape and square images in grid/list layouts.

The automated tests run real project functions/components with explicit test doubles for external services. Browser checks use real Chromium and project components, but mock Next routing, database calls, icons and localStorage. They do not exercise a deployed Next.js server, real account authorization, or a live Supabase database.

The environment could not reach the npm registry (`EAI_AGAIN`). A full Next.js production build and the complete project test suite were therefore **not** verified. Isolated checks used the archive's React/ReactDOM 19.2.3 runtime and installed TypeScript 5.8.3/Tailwind 4.1.10 tools, not a newly installed copy of all declared dependencies. `package.json` is unchanged.

Run these checks in your normal project environment after dependencies are available:

```sh
npm run check:source
node --experimental-strip-types --test tests/storefront-settings-save.test.mjs tests/storefront-cart.test.mjs tests/storefront-theme.test.mjs tests/storefront-bestsellers.test.mjs tests/storefront-catalog-actions.test.mjs tests/storefront-ui-settings.test.mjs
npm run build
```

Then save the settings for a test store, open its public URL in a fresh/private browser, and verify the persisted language, hours and pre-order labels. No live data or deployment was changed during this update.
