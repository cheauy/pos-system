import React, { createContext, useContext } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import {khmer as extendedKhmer} from './khmer';

export type Language = 'en' | 'km';
const khmer: Record<string, string> = {
  ...extendedKhmer,
  Home: 'ទំព័រដើម', Orders: 'ការបញ្ជាទិញ', Stock: 'ស្តុក', Alerts: 'ការជូនដំណឹង', More: 'បន្ថែម',
  Customers: 'អតិថិជន', Expenses: 'ចំណាយ', Register: 'បញ្ជីសាច់ប្រាក់', Subscription: 'ការជាវ',
  'Sign in': 'ចូលប្រើ', 'Sign out': 'ចាកចេញ', Email: 'អ៊ីមែល', Password: 'ពាក្យសម្ងាត់',
  'Forgot password?': 'ភ្លេចពាក្យសម្ងាត់?', 'Send reset email': 'ផ្ញើអ៊ីមែលកំណត់ពាក្យសម្ងាត់',
  Cancel: 'បោះបង់', Close: 'បិទ', Retry: 'ព្យាយាមម្ដងទៀត', Search: 'ស្វែងរក',
  'No records yet': 'មិនទាន់មានទិន្នន័យ', 'Previous': 'មុន', 'Next': 'បន្ទាប់',
  'Choose branch': 'ជ្រើសរើសសាខា', 'Choose business': 'ជ្រើសរើសអាជីវកម្ម',
  'You are offline': 'មិនមានអ៊ីនធឺណិត', 'Yesterday': 'ម្សិលមិញ', 'Pending': 'កំពុងរង់ចាំ',
  'Accept order': 'ទទួលការបញ្ជាទិញ', 'Start packing': 'ចាប់ផ្ដើមវេចខ្ចប់',
  'Ready for delivery': 'រួចរាល់សម្រាប់ដឹកជញ្ជូន', 'Complete order': 'បញ្ចប់ការបញ្ជាទិញ',
  'Mark as read': 'សម្គាល់ថាបានអាន', 'Scan barcode': 'ស្កេនបារកូដ',
  'Allow camera': 'អនុញ្ញាតកាមេរ៉ា', 'Connection restored': 'អ៊ីនធឺណិតបានភ្ជាប់វិញ',
};
export const Theme = createContext({ dark: false, language: 'en' as Language });
export function useTheme() {
  const value = useContext(Theme);
  const t=(text:string):string=>{
    if(value.language!=='km')return text;
    if(khmer[text])return khmer[text];
    if(text.endsWith(' *'))return `${t(text.slice(0,-2))} *`;
    if(text.includes(' · '))return text.split(' · ').map(part=>khmer[part]||part).join(' · ');
    return text;
  };
  return { ...value, background: value.dark ? '#101827' : '#f4f6fb', panel: value.dark ? '#1e293b' : '#ffffff',
    text: value.dark ? '#f1f5f9' : '#172136', muted: value.dark ? '#a9b9d0' : '#617189', border: value.dark ? '#37465c' : '#dfe6f0',
    t,alert:(title:string,message?:string,buttons?:Parameters<typeof Alert.alert>[2],options?:Parameters<typeof Alert.alert>[3])=>Alert.alert(t(title),message?t(message):message,buttons?.map(button=>({...button,text:button.text?t(button.text):button.text})),options) };
}
export function Label({ children, muted = false, large = false }: { children: React.ReactNode; muted?: boolean; large?: boolean }) {
  const theme = useTheme();
  return <Text style={{ color: muted ? theme.muted : theme.text, fontSize: large ? 23 : 15, fontFamily: theme.language === 'km' ? large ? 'Hanuman_700Bold' : 'Hanuman_400Regular' : undefined, fontWeight: large ? '700' : '400', lineHeight: large ? 36 : 26 }}>{typeof children === 'string' ? theme.t(children) : children}</Text>;
}
export function Button({ title, onPress, disabled = false, secondary = false, busy = false }: { title: string; onPress: () => void; disabled?: boolean; secondary?: boolean; busy?: boolean }) {
  const theme = useTheme();
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled: disabled || busy, busy }} disabled={disabled || busy} onPress={onPress}
    style={({ pressed }) => [styles.button, { backgroundColor: secondary ? theme.panel : '#275de8', borderColor: secondary ? theme.border : '#275de8', opacity: disabled || busy ? 0.5 : pressed ? 0.8 : 1 }]}>
    {busy && <ActivityIndicator color={secondary ? theme.text : '#fff'} />}<Text style={{ color: secondary ? theme.text : '#fff', fontFamily: theme.language === 'km' ? 'Hanuman_700Bold' : undefined, fontWeight: '600', fontSize: 15 }}>{theme.t(title)}</Text>
  </Pressable>;
}
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  const theme = useTheme();
  return <View style={{ gap: 6 }}><Label>{label}</Label><TextInput {...props} accessibilityLabel={theme.t(label)} placeholderTextColor={theme.muted}
    style={[styles.input, { color: theme.text, backgroundColor: theme.panel, borderColor: theme.border, fontFamily: theme.language === 'km' ? 'Hanuman_400Regular' : undefined }, props.style]} /></View>;
}
export function Card({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  return <View style={[styles.card, { backgroundColor: theme.panel, borderColor: theme.border }]}>{children}</View>;
}
export const styles = StyleSheet.create({
  page: { padding: 20, gap: 16, paddingBottom: 32 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  card: { padding: 18, borderRadius: 18, borderWidth: 1, gap: 10 },
  button: { minHeight: 48, padding: 12, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  input: { borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 16, minHeight: 50 },
});
