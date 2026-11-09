/**
 * OPTION 1: Official Telegram Bot API Safe Inviter (100% Ban-Proof)
 * - Generates tracked invite links (`createChatInviteLink`)
 * - Supports Join-Request verification (`creates_join_request: true`) or single-use `member_limit`
 * - Auto-approves `chat_join_request` events and sends a welcome DM
 */

async function callBotApi(botToken, method, payload, fetchImpl = fetch) {
  if (!botToken) throw new Error('TELEGRAM_BOT_TOKEN is required for Option 1 (Bot API).');
  const response = await fetchImpl(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!data.ok) {
    throw new Error(data.description || `Telegram Bot API ${method} failed.`);
  }
  return data.result;
}

export async function createBotSafeInviteLink({
  botToken = process.env.TELEGRAM_BOT_TOKEN,
  chatId = process.env.TELEGRAM_CHAT_ID,
  label = 'Customer Invite',
  mode = 'join_request', // 'join_request' (recommended) | 'single_use'
  expireHours = 168,     // 7 days default
  memberLimit = 1,
  fetchImpl = fetch,
} = {}) {
  if (!chatId) throw new Error('TELEGRAM_CHAT_ID (group or channel ID) is required.');

  const expireDate = Math.floor(Date.now() / 1000) + Math.max(1, Number(expireHours)) * 3600;
  const payload = {
    chat_id: chatId,
    name: String(label).slice(0, 32),
    expire_date: expireDate,
  };

  if (mode === 'join_request') {
    payload.creates_join_request = true;
  } else {
    payload.member_limit = Math.max(1, Math.min(99999, Number(memberLimit) || 1));
  }

  const result = await callBotApi(botToken, 'createChatInviteLink', payload, fetchImpl);
  return {
    option: 'OPTION_1_BOT_LINK',
    inviteLink: result.invite_link,
    name: result.name || label,
    createsJoinRequest: Boolean(result.creates_join_request),
    memberLimit: result.member_limit ?? null,
    expireDate: result.expire_date ? new Date(result.expire_date * 1000).toISOString() : null,
  };
}

export async function handleBotJoinRequestWebhook(update, {
  botToken = process.env.TELEGRAM_BOT_TOKEN,
  welcomeTemplate = process.env.TELEGRAM_WELCOME_TEXT || 'Welcome {name}! Your request to join has been approved.',
  fetchImpl = fetch,
} = {}) {
  const req = update?.chat_join_request;
  if (!req) return { handled: false };

  const chatId = req.chat.id;
  const userId = req.from.id;
  const firstName = req.from.first_name || 'there';
  const inviteName = req.invite_link?.name || 'direct';

  // 1. Auto-approve the user into the group or channel
  await callBotApi(botToken, 'approveChatJoinRequest', {
    chat_id: chatId,
    user_id: userId,
  }, fetchImpl);

  // 2. Send optional welcome DM (Telegram allows bots to DM users who submit a join request)
  let welcomed = false;
  if (welcomeTemplate) {
    try {
      await callBotApi(botToken, 'sendMessage', {
        chat_id: userId,
        text: welcomeTemplate.replace('{name}', firstName),
      }, fetchImpl);
      welcomed = true;
    } catch {
      welcomed = false;
    }
  }

  return {
    handled: true,
    approvedUserId: userId,
    firstName,
    username: req.from.username || null,
    inviteName,
    welcomed,
  };
}
