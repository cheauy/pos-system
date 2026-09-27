module.exports = ({ config }) => {
  const api = process.env.EXPO_PUBLIC_API_URL || '';
  const publicKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';
  let role;
  try { role = JSON.parse(Buffer.from(publicKey.split('.')[1], 'base64url').toString()).role; } catch { /* Publishable keys are not JWTs. */ }
  if (publicKey.startsWith('sb_secret_') || role === 'service_role') throw new Error('Private Supabase keys must never be bundled into a mobile app.');
  if (process.env.EAS_BUILD_PROFILE === 'production') {
    if (!api.startsWith('https://') || !process.env.EXPO_PUBLIC_SUPABASE_URL || !process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
      throw new Error('Production builds require an HTTPS API and the public Supabase environment variables.');
    }
  }
  return {
    ...config,
    ios: { ...config.ios, infoPlist: { ...config.ios.infoPlist,
      ...(api.startsWith('http://') ? { NSAppTransportSecurity: { NSAllowsArbitraryLoads: true } } : {}),
    } },
  };
};
