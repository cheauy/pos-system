import * as LocalAuthentication from 'expo-local-authentication';
import { deviceStorage } from './client';

export const deviceLockKey = (userId: string) => `tenh-device-lock-${userId}`;

export async function authenticateDevice() {
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: 'Unlock TENH POS', cancelLabel: 'Cancel',
    fallbackLabel: 'Use device passcode', disableDeviceFallback: false,
    biometricsSecurityLevel: 'strong', requireConfirmation: true,
  });
  if (!result.success) throw new Error('Device verification was not completed. Try again or sign in again.');
}

export async function saveDeviceLock(userId: string, enabled: boolean) {
  if (enabled && (!await LocalAuthentication.hasHardwareAsync() || !await LocalAuthentication.isEnrolledAsync())) {
    throw new Error('Set up fingerprint or Face ID in your phone settings first. Face ID requires the TENH POS development app on iPhone.');
  }
  // Enabling and disabling both require the phone owner's verification.
  await authenticateDevice();
  await deviceStorage.setItem(deviceLockKey(userId), enabled ? 'on' : 'off');
}
