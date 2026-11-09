# TENH · Telegram Safe Inviter (2 Options)

Standalone service with both **Option 1 (100% Ban-Proof Bot Invite Link + Auto-Approve)** and **Option 2 (Rate-Limited MTProto Add Contact + Direct Group/Channel Invite)**.

## Files
- [`src/option1BotInvite.js`](./src/option1BotInvite.js) — Official Bot API `createChatInviteLink` + `approveChatJoinRequest` webhook handler + welcome DM.
- [`src/option2MtprotoInvite.js`](./src/option2MtprotoInvite.js) — MTProto `contacts.ImportContacts` / `contacts.AddContact` + `channels.InviteToChannel` with automatic fallback to sending an Option 1 link via DM when a user has `USER_PRIVACY_RESTRICTED`.
- [`src/safetyState.js`](./src/safetyState.js) — Enforces hourly/daily caps (`4/hr`, `15/day`), random human jitter (`60–150s`), `FLOOD_WAIT` backoff, and a 24-hour `PEER_FLOOD` circuit breaker.
- [`src/mtprotoLogin.js`](./src/mtprotoLogin.js) — One-time interactive CLI to generate `TELEGRAM_STRING_SESSION` for Option 2.
- [`src/server.js`](./src/server.js) — Web dashboard (`http://localhost:3040`) and JSON API endpoints.

## Quick Start

```powershell
cd telegram-safe-inviter
npm install
Copy-Item .env.example .env
```

1. Fill in `.env` (`TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` for Option 1; `TELEGRAM_API_ID` and `TELEGRAM_API_HASH` from https://my.telegram.org for Option 2).
2. *(Optional, for Option 2 only)* Generate your user session string once:
   ```powershell
   npm --env-file=.env run login:mtproto
   ```
3. Start the server & web UI:
   ```powershell
   npm --env-file=.env start
   ```
4. Open **http://localhost:3040** to use both Option 1 and Option 2 from the web UI, or call the JSON endpoints directly:
   - `POST /api/option1/create-link`
   - `POST /api/option1/webhook`
   - `POST /api/option2/contact-invite`
   - `GET  /api/status`
