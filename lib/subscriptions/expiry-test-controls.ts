import 'server-only';

// Server-only configuration: never expose these controls through NEXT_PUBLIC_*.
export function expiryTestsEnabled() {
  const enabled = process.env.ENABLE_SUBSCRIPTION_EXPIRY_TEST_CONTROLS;
  if (enabled === 'false') return false;
  if (process.env.NODE_ENV === 'production' && enabled !== 'true') return false;
  return true;
}
