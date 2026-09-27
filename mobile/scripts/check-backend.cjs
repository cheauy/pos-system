// Read-only: verifies shared configuration and published RPC names. No business writes.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
require(path.join(root, 'node_modules/@next/env')).loadEnvConfig(root);
const mobileEnv = fs.readFileSync(path.join(root, 'mobile/.env.local'), 'utf8');
function mobile(name) {
  const line = mobileEnv.split(/\r?\n/).find(row => row.startsWith(`${name}=`));
  return line?.slice(name.length + 1).trim().replace(/^(['"])(.*)\1$/, '$2');
}
(async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '');
  const same = mobile('EXPO_PUBLIC_SUPABASE_URL')?.replace(/\/$/, '') === url;
  console.log(`Mobile and website use the same Supabase project: ${same ? 'YES' : 'NO'}`);
  if (!same) process.exitCode = 1;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Server configuration is unavailable.');
  const response = await fetch(`${url}/rest/v1/`, { headers: { apikey: key, Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`Schema check failed (HTTP ${response.status}).`);
  const schema = await response.json();
  for (const name of ['tenh_mobile_return','tenh_mobile_return_status','tenh_mobile_receive_purchase','tenh_mobile_purchase_receipt_status','tenh_mobile_transfer_action','send_stock_transfer','receive_stock_transfer']) {
    const published = Boolean(schema.paths?.[`/rpc/${name}`]);
    console.log(`${name}: ${published ? 'published' : 'not published'}`);
    if (!published) process.exitCode = 1;
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
