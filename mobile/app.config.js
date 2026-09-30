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
  // Order QR links (https://<app host>/o/<code>) open the app via Universal/App Links.
  // The site must serve /.well-known/apple-app-site-association and assetlinks.json.
  let linkHost = '';
  try { if (api.startsWith('https://')) linkHost = new URL(api).hostname; } catch { /* Links stay off without an HTTPS API. */ }
  return {
    ...config,
    plugins: [...(config.plugins || []), 'expo-image', ['expo-audio', { microphonePermission: false, recordAudioAndroid: false, enableBackgroundPlayback: false }]],
    ios: { ...config.ios,
      ...(linkHost ? { associatedDomains: [`applinks:${linkHost}`] } : {}),
      infoPlist: { ...config.ios.infoPlist,
      ...(api.startsWith('http://') ? { NSAppTransportSecurity: { NSAllowsArbitraryLoads: true } } : {}),
    } },
    android: { ...config.android,
      ...(linkHost ? { intentFilters: [{ action: 'VIEW', autoVerify: true, category: ['BROWSABLE', 'DEFAULT'], data: [{ scheme: 'https', host: linkHost, pathPrefix: '/o/' }] }] } : {}),
    },
  };
};
