import { Redirect, useLocalSearchParams } from 'expo-router';

// Universal/App Link or tenhpos://o/<code>: hand the code to the order scanner on More,
// which opens the native order sheet once the workspace is signed in and unlocked.
export default function OrderLink() {
  const { code } = useLocalSearchParams<{ code?: string }>();
  const orderCode = typeof code === 'string' && /^[1-9][0-9]{11}$/.test(code) ? code : '';
  return <Redirect href={{ pathname: '/[page]', params: { page: 'More', ...(orderCode ? { orderCode } : {}) } }} />;
}
