const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, '.env.local'), 'utf8');
function read(name) {
  const match = source.match(new RegExp(`^${name}=(.*)$`, 'm'));
  return match ? match[1].trim().replace(/^(['"])(.*)\1$/, '$2') : '';
}
const address = Object.values(os.networkInterfaces()).flat().find(item => item && !item.internal && item.family === 'IPv4' && /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(item.address));
const url = read('NEXT_PUBLIC_SUPABASE_URL');
const key = read('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY') || read('NEXT_PUBLIC_SUPABASE_ANON_KEY');
if (!address || !url || !key) throw new Error('A local network address and public Supabase configuration are required.');
const target = path.join(root, 'mobile/.env.local');
if (fs.existsSync(target)) throw new Error('mobile/.env.local already exists; review it before replacing.');
fs.writeFileSync(target, `EXPO_PUBLIC_API_URL=http://${address.address}:3000\nEXPO_PUBLIC_SUPABASE_URL=${url}\nEXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${key}\n`);
console.log('Mobile public connection configured for the local network. No private keys copied.');
