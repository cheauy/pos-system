import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const errors = [];
const warnings = [];
const requiredMigrations = [
  "20260915_tenant_subdomains.sql",
  "20260915_online_storefront_phase2.sql",
  "20260915_online_ordering_phase34.sql",
  "20260915_online_storefront_phase5.sql",
  "20260915_promotions_loyalty_phase6.sql",
  "20260915_pos_configurable_checkout_phase6.sql",
  "20260915_phase6_commerce_operations_expansion.sql",
  "20260915_phase6_operations_finance_expansion.sql",
  "20260915_phase6_launch_prep.sql",
];

function present(name) {
  return Boolean(process.env[name] && process.env[name].trim());
}

if (!present("NEXT_PUBLIC_SUPABASE_URL")) errors.push("Missing NEXT_PUBLIC_SUPABASE_URL");
if (!present("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") && !present("NEXT_PUBLIC_SUPABASE_ANON_KEY")) errors.push("Missing NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY)");
if (!present("SUPABASE_SERVICE_ROLE_KEY")) warnings.push("SUPABASE_SERVICE_ROLE_KEY is missing; Super Admin/server-only admin workflows may fail.");
if (!present("NEXT_PUBLIC_ROOT_DOMAIN")) warnings.push("NEXT_PUBLIC_ROOT_DOMAIN is missing; production subdomain routing will not be configured explicitly.");
if (!present("NEXT_PUBLIC_SITE_URL")) warnings.push("NEXT_PUBLIC_SITE_URL is missing; auth/redirect URLs may fall back incorrectly.");

for (const migration of requiredMigrations) {
  const file = path.join(root, "supabase", "migrations", migration);
  if (!fs.existsSync(file)) errors.push(`Missing migration: ${migration}`);
}

const ops = fs.readFileSync(path.join(root,"supabase","migrations","20260915_phase6_operations_finance_expansion.sql"),"utf8");
if (ops.includes("p.low_stock_threshold")) errors.push("Operations migration still references removed products.low_stock_threshold.");
if (!ops.includes("p.low_stock_quantity")) warnings.push("Operations migration does not seed branch thresholds from products.low_stock_quantity.");

const pkg = JSON.parse(fs.readFileSync(path.join(root,"package.json"),"utf8"));
for (const script of ["build","start"]) if (!pkg.scripts?.[script]) errors.push(`package.json missing ${script} script`);

console.log("TENH-POS prelaunch check");
for (const warning of warnings) console.log(`WARN  ${warning}`);
for (const error of errors) console.log(`ERROR ${error}`);
if (errors.length) process.exit(1);
console.log("PASS  Static launch checks passed.");
