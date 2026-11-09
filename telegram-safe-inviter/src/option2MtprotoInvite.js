/**
 * OPTION 2: MTProto Client API Safe Contact + Group/Channel Inviter
 * - Uses official Telegram Client protocol (GramJS `telegram` package)
 * - Supports adding by phone number (`contacts.ImportContacts`) or `@username`
 * - Enforces hourly/daily caps, random human jitter, FLOOD_WAIT backoff, and 24h PEER_FLOOD circuit breaker
 * - Automatically falls back to sending an Option 1 Invite Link DM if the target user has `USER_PRIVACY_RESTRICTED`
 */

import { evaluateInviteSafety, loadState, recordAction } from './safetyState.js';

let cachedClient = null;

async function getMtprotoClient() {
  if (cachedClient) return cachedClient;
  const apiId = Number(process.env.TELEGRAM_API_ID);
  const apiHash = process.env.TELEGRAM_API_HASH;
  const sessionStr = process.env.TELEGRAM_STRING_SESSION || '';

  if (!apiId || !apiHash || !sessionStr) {
    throw new Error(
      'Option 2 requires TELEGRAM_API_ID, TELEGRAM_API_HASH, and TELEGRAM_STRING_SESSION in .env. Run `npm run login:mtproto` first.'
    );
  }

  const { TelegramClient } = await import('telegram');
  const { StringSession } = await import('telegram/sessions/index.js');

  const client = new TelegramClient(new StringSession(sessionStr), apiId, apiHash, {
    connectionRetries: 3,
  });
  await client.connect();
  cachedClient = client;
  return client;
}

export async function safeMtprotoContactAndInvite({
  phone = '',
  username = '',
  firstName = 'Customer',
  lastName = '',
  chatId = process.env.TELEGRAM_CHAT_ID,
  fallbackInviteLink = '',
  clientOverride = null,
  apiClassOverride = null,
} = {}) {
  const cleanPhone = String(phone).trim();
  const cleanUsername = String(username).trim().replace(/^@/, '');

  if (!cleanPhone && !cleanUsername) {
    throw new Error('Provide either a phone number (e.g. +85512345678) or a @username.');
  }
  if (!chatId) {
    throw new Error('TELEGRAM_CHAT_ID (target group or supergroup) is required.');
  }

  const state = loadState();
  const safety = evaluateInviteSafety(state, { addContact: Boolean(cleanPhone) });
  if (!safety.allowed) {
    const err = new Error(safety.message);
    err.code = safety.code;
    err.stats = safety.stats;
    throw err;
  }

  const client = clientOverride || (await getMtprotoClient());
  const Api = apiClassOverride || (await import('telegram')).Api;

  let userEntity = null;
  let contactAdded = false;

  try {
    // Step 1: Resolve by Phone (contacts.ImportContacts) or Username
    if (cleanPhone) {
      const importResult = await client.invoke(
        new Api.contacts.ImportContacts({
          contacts: [
            new Api.InputPhoneContact({
              clientId: BigInt(Date.now()),
              phone: cleanPhone,
              firstName: firstName || 'Customer',
              lastName: lastName || '',
            }),
          ],
        })
      );

      if (!importResult?.users?.length) {
        recordAction(state, {
          option: 'OPTION_2_MTPROTO',
          target: cleanPhone,
          status: 'PHONE_NOT_FOUND_ON_TELEGRAM',
          countedContact: true,
        });
        return {
          option: 'OPTION_2_MTPROTO',
          status: 'PHONE_NOT_FOUND',
          message: 'Phone number was not found on Telegram or hides phone discovery. Send them an Option 1 Invite Link instead.',
          fallbackInviteLink: fallbackInviteLink || null,
        };
      }
      userEntity = importResult.users[0];
      contactAdded = true;
    } else {
      userEntity = await client.getEntity(cleanUsername);
      await client.invoke(
        new Api.contacts.AddContact({
          id: userEntity,
          firstName: firstName || cleanUsername,
          lastName: lastName || '',
          phone: '',
          addPhonePrivacyException: false,
        })
      );
      contactAdded = true;
    }

    // Step 2: Invite to Supergroup / Channel (`channels.InviteToChannel`)
    const channelEntity = await client.getEntity(chatId);
    await client.invoke(
      new Api.channels.InviteToChannel({
        channel: channelEntity,
        users: [userEntity],
      })
    );

    const updated = recordAction(state, {
      option: 'OPTION_2_MTPROTO',
      target: cleanPhone || `@${cleanUsername}`,
      status: 'DIRECT_INVITED',
      contactAdded,
      countedInvite: true,
      countedContact: Boolean(cleanPhone),
    });

    return {
      option: 'OPTION_2_MTPROTO',
      status: 'DIRECT_INVITED',
      contactAdded,
      target: cleanPhone || `@${cleanUsername}`,
      nextAllowedActionAt: new Date(updated.nextAllowedActionAt).toISOString(),
    };
  } catch (err) {
    const rawCode = String(err?.errorMessage || err?.message || 'UNKNOWN_ERROR');

    // Privacy block -> Automatically fall back to sending the safe invite link via DM
    if (
      rawCode.includes('USER_PRIVACY_RESTRICTED') ||
      rawCode.includes('USER_NOT_MUTUAL_CONTACT') ||
      rawCode.includes('USERS_TOO_MUCH') ||
      rawCode.includes('CHAT_ADMIN_REQUIRED')
    ) {
      let dmSent = false;
      if (fallbackInviteLink && userEntity) {
        try {
          await client.sendMessage(userEntity, {
            message: `Hi ${firstName || 'there'}! Tap this invite link to join our group: ${fallbackInviteLink}`,
          });
          dmSent = true;
        } catch {
          dmSent = false;
        }
      }

      recordAction(state, {
        option: 'OPTION_2_MTPROTO',
        target: cleanPhone || `@${cleanUsername}`,
        status: dmSent ? 'PRIVACY_RESTRICTED_SENT_LINK_DM' : 'PRIVACY_RESTRICTED',
        contactAdded,
        countedInvite: true,
        countedContact: Boolean(cleanPhone),
      });

      return {
        option: 'OPTION_2_MTPROTO',
        status: dmSent ? 'SENT_LINK_FALLBACK' : 'PRIVACY_RESTRICTED',
        contactAdded,
        reason: rawCode,
        dmSent,
        fallbackInviteLink: fallbackInviteLink || null,
        message: dmSent
          ? `User's privacy blocks direct group adds (${rawCode}), so we added them to contacts and DM'd the safe invite link.`
          : `User's privacy blocks direct group adds (${rawCode}). Share an Option 1 Invite Link with them.`,
      };
    }

    // Flood wait -> Back off for exact duration + 20% safety margin
    const floodMatch = rawCode.match(/FLOOD_WAIT_(\d+)/);
    if (floodMatch) {
      const waitSeconds = Number(floodMatch[1]) || 300;
      recordAction(state, {
        option: 'OPTION_2_MTPROTO',
        target: cleanPhone || `@${cleanUsername}`,
        status: `FLOOD_WAIT_${waitSeconds}S`,
        floodWaitSeconds: waitSeconds,
      });
      return {
        option: 'OPTION_2_MTPROTO',
        status: 'FLOOD_WAIT',
        retryAfterSeconds: Math.ceil(waitSeconds * 1.2),
        message: `Telegram requested a ${waitSeconds}s pause. Safety timer engaged.`,
      };
    }

    // Peer flood -> Trip 24-hour circuit breaker immediately to save the phone number
    if (rawCode.includes('PEER_FLOOD')) {
      recordAction(state, {
        option: 'OPTION_2_MTPROTO',
        target: cleanPhone || `@${cleanUsername}`,
        status: 'PEER_FLOOD_CIRCUIT_BREAK_24H',
        circuitBreakHours: 24,
        circuitReason: 'PEER_FLOOD',
      });
      return {
        option: 'OPTION_2_MTPROTO',
        status: 'CIRCUIT_BREAK_24H',
        message: 'Telegram returned PEER_FLOOD. Option 2 is automatically paused for 24 hours to protect your account. Use Option 1 (Bot Invite Link) in the meantime.',
      };
    }

    throw err;
  }
}
