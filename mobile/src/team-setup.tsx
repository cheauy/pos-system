import React, { useRef, useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, auth } from './client';
import { Button, Card, Field, Label, styles, useTheme } from './ui';

export async function saveTeamPassword(password: string, confirm: string) {
  if (!auth) throw new Error('Sign in again to continue.');
  if (password.length < 8 || password.length > 72 || password !== confirm) {
    throw new Error('Use matching passwords of 8–72 characters.');
  }
  const changed = await auth.auth.updateUser({ password });
  // Retry activation after a lost response without forcing another password change.
  if (changed.error && changed.error.code !== 'same_password') throw changed.error;
  await api('team-setup', {}, {});
}

export function TeamSetup({ onComplete }: { onComplete: () => void }) {
  const theme = useTheme();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);
  async function submit(signOut = false) {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError('');
    try {
      if (signOut) {
        const result = await auth?.auth.signOut({ scope: 'local' });
        if (result?.error) throw result.error;
      } else {
        await saveTeamPassword(password, confirm);
        setPassword(''); setConfirm(''); onComplete();
      }
    } catch (error) { setError((error as Error).message); }
    finally { pending.current = false; setBusy(false); }
  }
  return <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
    <ScrollView contentContainerStyle={[styles.page, { flexGrow: 1, justifyContent: 'center' }]} keyboardShouldPersistTaps="handled">
      <Label large>Set your team password</Label>
      <Label muted>Replace your temporary password before entering your workspace.</Label>
      <Card>
        <Field label="New password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" maxLength={72} editable={!busy} />
        <Field label="Confirm password" value={confirm} onChangeText={setConfirm} secureTextEntry autoComplete="new-password" maxLength={72} editable={!busy} onSubmitEditing={() => void submit()} />
        <Label muted>Use 8–72 characters.</Label>
        {error ? <Text accessibilityRole="alert" style={{ color: theme.dark ? '#fda4af' : '#be123c' }}>{error}</Text> : null}
        <Button title="Save password and continue" busy={busy} onPress={() => void submit()} />
        <Button title="Sign out" secondary disabled={busy} onPress={() => void submit(true)} />
      </Card>
    </ScrollView>
  </SafeAreaView>;
}
