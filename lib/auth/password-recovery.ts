const RECOVERY_KEY = "tenh_password_recovery";
const RECOVERY_WINDOW = 15 * 60 * 1000;

// UI continuity only. Supabase still verifies the session for password updates.
export function recordPasswordRecovery(storage: Storage, userId: string, now = Date.now()) {
  try { storage.setItem(RECOVERY_KEY, JSON.stringify({ userId, expiresAt: now + RECOVERY_WINDOW })); } catch { /* Recovery events still work without storage. */ }
}
export function clearPasswordRecovery(storage: Storage) {
  try { storage.removeItem(RECOVERY_KEY); } catch { /* Storage can be disabled. */ }
}
export function hasPasswordRecovery(storage: Storage, userId: string, now = Date.now()) {
  try {
    const saved = JSON.parse(storage.getItem(RECOVERY_KEY) ?? "null");
    return saved?.userId === userId && typeof saved.expiresAt === "number" && saved.expiresAt > now;
  } catch { return false; }
}
