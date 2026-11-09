import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.join(process.cwd(), 'data');
const STATE_FILE = path.join(DATA_DIR, 'safety-state.json');

const DEFAULTS = {
  circuitBrokenUntil: 0,
  circuitReason: null,
  floodWaitUntil: 0,
  nextAllowedActionAt: 0,
  inviteTimestamps: [],
  contactImportTimestamps: [],
  history: [],
};

export function loadState() {
  try {
    if (!fs.existsSync(STATE_FILE)) return structuredClone(DEFAULTS);
    const raw = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    return { ...structuredClone(DEFAULTS), ...raw };
  } catch {
    return structuredClone(DEFAULTS);
  }
}

export function saveState(state) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const pruned = pruneTimers(state);
  fs.writeFileSync(STATE_FILE, JSON.stringify(pruned, null, 2));
  return pruned;
}

export function pruneTimers(state, now = Date.now()) {
  const dayAgo = now - 86400_000;
  return {
    ...state,
    inviteTimestamps: (state.inviteTimestamps || []).filter(ts => ts > dayAgo),
    contactImportTimestamps: (state.contactImportTimestamps || []).filter(ts => ts > dayAgo),
    history: (state.history || []).slice(0, 100),
  };
}

export function getSafetyLimits(env = process.env) {
  return {
    maxInvitesPerHour: Number(env.MTPROTO_MAX_INVITES_PER_HOUR || 4),
    maxInvitesPerDay: Number(env.MTPROTO_MAX_INVITES_PER_DAY || 15),
    maxContactsPerDay: Number(env.MTPROTO_MAX_CONTACTS_PER_DAY || 12),
    minDelayMs: Number(env.MTPROTO_MIN_DELAY_MS || 60_000),
    maxDelayMs: Number(env.MTPROTO_MAX_DELAY_MS || 150_000),
  };
}

export function evaluateInviteSafety(state, { addContact = false, now = Date.now(), limits = getSafetyLimits() } = {}) {
  const clean = pruneTimers(state, now);
  const hourAgo = now - 3600_000;
  const invitesLastHour = clean.inviteTimestamps.filter(ts => ts > hourAgo).length;
  const invitesLastDay = clean.inviteTimestamps.length;
  const contactsLastDay = clean.contactImportTimestamps.length;

  if (clean.circuitBrokenUntil > now) {
    const minutesLeft = Math.ceil((clean.circuitBrokenUntil - now) / 60_000);
    return {
      allowed: false,
      code: 'CIRCUIT_BREAKER_ACTIVE',
      message: `Safety circuit breaker active (${clean.circuitReason || 'PEER_FLOOD'}). Paused for ${minutesLeft} more minutes to protect account.`,
      stats: { invitesLastHour, invitesLastDay, contactsLastDay, limits },
    };
  }

  if (clean.floodWaitUntil > now) {
    const secondsLeft = Math.ceil((clean.floodWaitUntil - now) / 1000);
    return {
      allowed: false,
      code: 'FLOOD_WAIT_ACTIVE',
      message: `Telegram FLOOD_WAIT active. Wait ${secondsLeft}s before next request.`,
      stats: { invitesLastHour, invitesLastDay, contactsLastDay, limits },
    };
  }

  if (clean.nextAllowedActionAt > now) {
    const secondsLeft = Math.ceil((clean.nextAllowedActionAt - now) / 1000);
    return {
      allowed: false,
      code: 'JITTER_COOLDOWN',
      message: `Human jitter spacing active. Wait ${secondsLeft}s before next invite.`,
      stats: { invitesLastHour, invitesLastDay, contactsLastDay, limits },
    };
  }

  if (invitesLastHour >= limits.maxInvitesPerHour) {
    return {
      allowed: false,
      code: 'HOURLY_CAP_REACHED',
      message: `Hourly safe limit reached (${invitesLastHour}/${limits.maxInvitesPerHour}). Use Option 1 (Bot Invite Link) or wait <1 hour.`,
      stats: { invitesLastHour, invitesLastDay, contactsLastDay, limits },
    };
  }

  if (invitesLastDay >= limits.maxInvitesPerDay) {
    return {
      allowed: false,
      code: 'DAILY_CAP_REACHED',
      message: `Daily safe limit reached (${invitesLastDay}/${limits.maxInvitesPerDay}). Use Option 1 (Bot Invite Link) for unlimited invites.`,
      stats: { invitesLastHour, invitesLastDay, contactsLastDay, limits },
    };
  }

  if (addContact && contactsLastDay >= limits.maxContactsPerDay) {
    return {
      allowed: false,
      code: 'CONTACT_DAILY_CAP_REACHED',
      message: `Daily contact-import limit reached (${contactsLastDay}/${limits.maxContactsPerDay}). Invite by @username or use Option 1.`,
      stats: { invitesLastHour, invitesLastDay, contactsLastDay, limits },
    };
  }

  return {
    allowed: true,
    code: 'OK',
    message: 'Safe to proceed.',
    stats: { invitesLastHour, invitesLastDay, contactsLastDay, limits },
  };
}

export function recordAction(state, entry, { now = Date.now(), limits = getSafetyLimits() } = {}) {
  const clean = pruneTimers(state, now);
  const jitter = Math.floor(limits.minDelayMs + Math.random() * Math.max(1000, limits.maxDelayMs - limits.minDelayMs));

  if (entry.countedInvite) clean.inviteTimestamps.push(now);
  if (entry.countedContact) clean.contactImportTimestamps.push(now);
  if (entry.countedInvite || entry.countedContact) {
    clean.nextAllowedActionAt = now + jitter;
  }
  if (entry.floodWaitSeconds) {
    clean.floodWaitUntil = now + Math.ceil(entry.floodWaitSeconds * 1.2) * 1000;
  }
  if (entry.circuitBreakHours) {
    clean.circuitBrokenUntil = now + entry.circuitBreakHours * 3600_000;
    clean.circuitReason = entry.circuitReason || 'PEER_FLOOD';
  }

  clean.history.unshift({
    id: `${now}-${Math.random().toString(36).slice(2, 7)}`,
    at: new Date(now).toISOString(),
    ...entry,
  });

  return saveState(clean);
}
