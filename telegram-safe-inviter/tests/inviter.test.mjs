import test from 'node:test';
import assert from 'node:assert/strict';
import { createBotSafeInviteLink, handleBotJoinRequestWebhook } from '../src/option1BotInvite.js';
import { safeMtprotoContactAndInvite } from '../src/option2MtprotoInvite.js';
import { evaluateInviteSafety, saveState } from '../src/safetyState.js';

test('Option 1: creates join-request invite link and auto-approves webhook', async () => {
  const calls = [];
  const fakeFetch = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, body });
    if (url.endsWith('/createChatInviteLink')) {
      return {
        json: async () => ({
          ok: true,
          result: {
            invite_link: 'https://t.me/+SafeInviteHash123',
            name: body.name,
            creates_join_request: true,
          },
        }),
      };
    }
    return { json: async () => ({ ok: true, result: true }) };
  };

  const link = await createBotSafeInviteLink({
    botToken: '123:ABC',
    chatId: '-100999',
    label: 'Order #55',
    mode: 'join_request',
    fetchImpl: fakeFetch,
  });

  assert.equal(link.inviteLink, 'https://t.me/+SafeInviteHash123');
  assert.equal(link.createsJoinRequest, true);

  const webhookResult = await handleBotJoinRequestWebhook(
    {
      chat_join_request: {
        chat: { id: -100999 },
        from: { id: 777888, first_name: 'Dara', username: 'dara_kh' },
        invite_link: { name: 'Order #55' },
      },
    },
    { botToken: '123:ABC', fetchImpl: fakeFetch }
  );

  assert.equal(webhookResult.handled, true);
  assert.equal(webhookResult.approvedUserId, 777888);
  assert.equal(webhookResult.welcomed, true);
  assert.equal(calls.length, 3); // createChatInviteLink + approveChatJoinRequest + sendMessage
});

test('Option 2: falls back to sending invite link DM when USER_PRIVACY_RESTRICTED', async () => {
  saveState({
    circuitBrokenUntil: 0,
    floodWaitUntil: 0,
    nextAllowedActionAt: 0,
    inviteTimestamps: [],
    contactImportTimestamps: [],
    history: [],
  });

  const dmMessages = [];
  const fakeClient = {
    async getEntity(id) { return { id }; },
    async invoke(req) {
      if (req.className === 'contacts.ImportContacts') {
        return { users: [{ id: 999111, firstName: 'Sokha' }] };
      }
      if (req.className === 'channels.InviteToChannel') {
        const err = new Error('USER_PRIVACY_RESTRICTED');
        err.errorMessage = 'USER_PRIVACY_RESTRICTED';
        throw err;
      }
      return {};
    },
    async sendMessage(entity, payload) {
      dmMessages.push({ entity, payload });
    },
  };

  const FakeApi = {
    InputPhoneContact: class { constructor(args) { Object.assign(this, args); } },
    contacts: {
      ImportContacts: class { constructor(args) { this.className = 'contacts.ImportContacts'; Object.assign(this, args); } },
      AddContact: class { constructor(args) { this.className = 'contacts.AddContact'; Object.assign(this, args); } },
    },
    channels: {
      InviteToChannel: class { constructor(args) { this.className = 'channels.InviteToChannel'; Object.assign(this, args); } },
    },
  };

  const res = await safeMtprotoContactAndInvite({
    phone: '+85512345678',
    firstName: 'Sokha',
    chatId: '-100999',
    fallbackInviteLink: 'https://t.me/+SafeInviteHash123',
    clientOverride: fakeClient,
    apiClassOverride: FakeApi,
  });

  assert.equal(res.status, 'SENT_LINK_FALLBACK');
  assert.equal(res.contactAdded, true);
  assert.equal(res.dmSent, true);
  assert.equal(dmMessages.length, 1);
  assert.match(dmMessages[0].payload.message, /SafeInviteHash123/);
});

test('Safety state: blocks when hourly cap or PEER_FLOOD circuit breaker is active', () => {
  const now = Date.now();
  const stateWithFourInHour = {
    circuitBrokenUntil: 0,
    floodWaitUntil: 0,
    nextAllowedActionAt: 0,
    inviteTimestamps: [now - 1000, now - 2000, now - 3000, now - 4000],
    contactImportTimestamps: [],
    history: [],
  };

  const capCheck = evaluateInviteSafety(stateWithFourInHour, {
    now,
    limits: { maxInvitesPerHour: 4, maxInvitesPerDay: 15, maxContactsPerDay: 12, minDelayMs: 1000, maxDelayMs: 2000 },
  });
  assert.equal(capCheck.allowed, false);
  assert.equal(capCheck.code, 'HOURLY_CAP_REACHED');

  const circuitState = {
    ...stateWithFourInHour,
    circuitBrokenUntil: now + 3600_000,
    circuitReason: 'PEER_FLOOD',
  };
  const cbCheck = evaluateInviteSafety(circuitState, { now });
  assert.equal(cbCheck.allowed, false);
  assert.equal(cbCheck.code, 'CIRCUIT_BREAKER_ACTIVE');
});
