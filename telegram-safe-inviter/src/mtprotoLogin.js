/**
 * Interactive CLI helper to generate TELEGRAM_STRING_SESSION once for Option 2.
 * Usage: npm run login:mtproto
 */
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';

const rl = readline.createInterface({ input, output });

async function main() {
  console.log('=== Telegram MTProto Session Generator (Option 2) ===');
  const apiId = Number(process.env.TELEGRAM_API_ID || (await rl.question('Enter TELEGRAM_API_ID (from my.telegram.org): ')));
  const apiHash = (process.env.TELEGRAM_API_HASH || (await rl.question('Enter TELEGRAM_API_HASH: '))).trim();

  const client = new TelegramClient(new StringSession(''), apiId, apiHash, {
    connectionRetries: 5,
  });

  await client.start({
    phoneNumber: async () => (await rl.question('Enter your Telegram phone number (with +country code): ')).trim(),
    password: async () => (await rl.question('Enter your 2FA password (if enabled): ')).trim(),
    phoneCode: async () => (await rl.question('Enter the login code Telegram sent you: ')).trim(),
    onError: err => console.error('Login error:', err.message),
  });

  console.log('\n✅ Login successful! Copy the line below into your .env file:\n');
  console.log(`TELEGRAM_STRING_SESSION=${client.session.save()}\n`);
  await client.disconnect();
  rl.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
