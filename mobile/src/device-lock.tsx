import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth, deviceStorage } from './client';
import { authenticateDevice, deviceLockKey, saveDeviceLock } from './device-auth';
import { Button, Card, Label, styles, useTheme } from './ui';

const LockContext = createContext({ enabled: false, busy: false, error: '', toggle: () => {}, lock: () => {} });

export function DeviceLock({ userId, passwordAuthenticated, children }: { userId: string; passwordAuthenticated: boolean; children: React.ReactNode }) {
  const theme = useTheme();
  const [ready, setReady] = useState(false), [enabled, setEnabled] = useState(false), [locked, setLocked] = useState(true);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const inFlight = useRef(false), active = useRef(true);
  useEffect(() => {
    active.current = true;
    deviceStorage.getItem(deviceLockKey(userId)).then(value => {
      if (!active.current) return;
      const lock = value !== null && value !== 'off'; setEnabled(lock); setLocked(lock && !passwordAuthenticated); setReady(true);
    }).catch(() => { if (active.current) setError('Unable to read device protection. Sign in again to continue.'); });
    return () => { active.current = false; };
  }, [userId, passwordAuthenticated]);
  useEffect(() => {
    let leftAt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const listener = AppState.addEventListener('change', state => {
      if (!enabled || inFlight.current) return;
      if (state === 'background') {
        leftAt = Date.now();
        clearTimeout(timer);
        timer = setTimeout(() => setLocked(true), 60000);
      } else if (state === 'active') {
        clearTimeout(timer);
        if (leftAt && Date.now() - leftAt >= 60000) setLocked(true);
        leftAt = 0;
      }
    });
    return () => { clearTimeout(timer); listener.remove(); };
  }, [enabled]);
  async function run(action: () => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError('');
    try { await action(); } catch (error) { if (active.current) setError((error as Error).message); }
    finally { inFlight.current = false; if (active.current) setBusy(false); }
  }
  if (!ready || locked) return <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}><ScrollView contentContainerStyle={[styles.page, { flexGrow: 1, justifyContent: 'center' }]}>
    <Card><Label large>TENH POS locked</Label><Label>Verify with your fingerprint, Face ID or device passcode.</Label>
      {!ready && !error && <ActivityIndicator />}{error && <Label>{error}</Label>}
      <Button title="Unlock" busy={busy} disabled={!ready} onPress={() => void run(async () => { await authenticateDevice(); if (active.current) setLocked(false); })} />
      <Button title="Sign in again" secondary disabled={busy} onPress={() => void run(async () => { const result = await auth?.auth.signOut({ scope: 'local' }); if (result?.error) throw result.error; })} />
    </Card>
  </ScrollView></SafeAreaView>;
  return <LockContext.Provider value={{ enabled, busy, error,
    toggle: () => void run(async () => { await saveDeviceLock(userId, !enabled); if (active.current) setEnabled(!enabled); }),
    lock: () => setLocked(true),
  }}>{children}</LockContext.Provider>;
}

export function DeviceLockSettings() {
  const lock = useContext(LockContext);
  return <Card><Label large>Device protection</Label><Label>Lock on app restart or after one minute in the background. Saved checkout requests remain on this device.</Label>
    <Button title={lock.enabled ? 'Disable device lock' : 'Enable fingerprint / Face ID'} secondary busy={lock.busy} onPress={lock.toggle} />
    {lock.enabled && <Button title="Lock now" secondary disabled={lock.busy} onPress={lock.lock} />}
    {lock.error && <Label>{lock.error}</Label>}
  </Card>;
}
