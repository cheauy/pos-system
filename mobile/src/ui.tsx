import React, { createContext, useContext, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image as CachedImage } from 'expo-image';
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
  'Welcome back': 'សូមស្វាគមន៍ការត្រឡប់មកវិញ', 'Sign in to manage your store.': 'ចូលប្រើដើម្បីគ្រប់គ្រងហាងរបស់អ្នក។',
  'Your workspace': 'កន្លែងធ្វើការរបស់អ្នក', 'Everything you need to run your store.': 'អ្វីៗដែលអ្នកត្រូវការសម្រាប់គ្រប់គ្រងហាង។',
  Preferences: 'ការកំណត់', 'STORE OVERVIEW': 'ទិដ្ឋភាពទូទៅនៃហាង', Connected: 'បានភ្ជាប់', Offline: 'គ្មានអ៊ីនធឺណិត',
  'New sale': 'ការលក់ថ្មី', 'Open point of sale': 'បើកកន្លែងលក់', available: 'មាន', 'Out of stock': 'អស់ស្តុក',
  'Sales & customers': 'ការលក់ និងអតិថិជន', 'Products & inventory': 'ផលិតផល និងស្តុក', Business: 'អាជីវកម្ម',
  unread: 'មិនទាន់អាន', 'Updates from your store, in one place.': 'ព័ត៌មានថ្មីៗពីហាងរបស់អ្នកនៅកន្លែងតែមួយ។',
  'Tap to mark as read': 'ចុចដើម្បីសម្គាល់ថាបានអាន', 'All caught up': 'មិនមានព័ត៌មានថ្មី', 'New store updates will appear here.': 'ព័ត៌មានថ្មីៗរបស់ហាងនឹងបង្ហាញនៅទីនេះ។',
  'Connect to load your alerts.': 'ភ្ជាប់អ៊ីនធឺណិតដើម្បីផ្ទុកការជូនដំណឹង។', 'You’re up to date': 'អ្នកបានមើលព័ត៌មានទាំងអស់',
  'Updating…': 'កំពុងធ្វើបច្ចុប្បន្នភាព…', 'Loading alerts…': 'កំពុងផ្ទុកការជូនដំណឹង…', 'Preparing upload…': 'កំពុងរៀបចំការផ្ទុកឡើង…',
  'Upload sent. Saving…': 'បានផ្ទុកឡើង។ កំពុងរក្សាទុក…', 'Saving…': 'កំពុងរក្សាទុក…', 'Opening…': 'កំពុងបើក…',
  records: 'កំណត់ត្រា', products: 'ផលិតផល', units: 'ឯកតា', 'In stock': 'មានស្តុក',
  'Try another search or filter.': 'សាកល្បងស្វែងរក ឬច្រោះផ្សេងទៀត។', 'Your records will appear here.': 'កំណត់ត្រារបស់អ្នកនឹងបង្ហាញនៅទីនេះ។',
};
export const Theme = createContext({ dark: false, language: 'en' as Language });
const ActionContext = createContext(false);
export function ActionArea({ children, enabled = true }: { children: React.ReactNode; enabled?: boolean }) {
  return <ActionContext.Provider value={enabled}>{children}</ActionContext.Provider>;
}
export function useTheme() {
  const value = useContext(Theme);
  const t=(text:string):string=>{
    if(value.language!=='km')return text;
    if(khmer[text])return khmer[text];
    if(text.endsWith(' *'))return `${t(text.slice(0,-2))} *`;
    if(text.includes(' · '))return text.split(' · ').map(part=>khmer[part]||part).join(' · ');
    return text;
  };
  return { ...value, background: value.dark ? '#0e1523' : '#f5f7fb', panel: value.dark ? '#182235' : '#ffffff',
    text: value.dark ? '#f1f5f9' : '#17243b', muted: value.dark ? '#a9b9d0' : '#728096', border: value.dark ? '#2a374e' : '#e8edf5',
    t,alert:(title:string,message?:string,buttons?:Parameters<typeof Alert.alert>[2],options?:Parameters<typeof Alert.alert>[3])=>Alert.alert(t(title),message?t(message):message,buttons?.map(button=>({...button,text:button.text?t(button.text):button.text})),options) };
}
export function FloatingAdd({ label, disabled, onPress, bottom=18 }: { label: string; disabled?: boolean; onPress: () => void; bottom?:number }) {
  const theme = useTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={theme.t(label)} disabled={disabled} onPress={onPress} style={({pressed})=>({position:'absolute',right:20,bottom,width:56,height:56,borderRadius:28,backgroundColor:'#275de8',alignItems:'center',justifyContent:'center',elevation:5,boxShadow:'0 4px 12px #0003',opacity:disabled?0.4:pressed?0.8:1})}><Ionicons name="add" size={29} color="#fff"/></Pressable>;
}
export function Label({ children, muted = false, large = false }: { children: React.ReactNode; muted?: boolean; large?: boolean }) {
  const theme = useTheme();
  return <Text style={{ color: muted ? theme.muted : theme.text, fontSize: large ? 22 : muted ? 13 : 15, fontFamily: theme.language === 'km' ? large ? 'Hanuman_700Bold' : 'Hanuman_400Regular' : undefined, fontWeight: large ? '700' : '400', lineHeight: large ? 32 : 23 }}>{typeof children === 'string' ? theme.t(children) : children}</Text>;
}
export function Button({ title, onPress, disabled = false, secondary = false, busy = false }: { title: string; onPress: () => void; disabled?: boolean; secondary?: boolean; busy?: boolean }) {
  const theme = useTheme();
  const professional = useContext(ActionContext);
  const action = professional ? /^Delete|^Remove|^Clear|^Discard/.test(title) ? { colour: '#c13c4c', icon: 'trash-outline' as const }
    : /^Save|^Confirm|^Complete|^Receive|^Accept|^New sale/.test(title) ? { colour: '#16765a', icon: 'checkmark-circle-outline' as const }
    : /^Edit|^Count/.test(title) ? { colour: '#275de8', icon: 'create-outline' as const }
    : /^Add|^New|^Quick Add/.test(title) ? { colour: '#275de8', icon: 'add-circle-outline' as const }
    : /^Print/.test(title) ? { colour: '#5760ad', icon: 'print-outline' as const }
    : /^Share/.test(title) ? { colour: '#5760ad', icon: 'share-outline' as const }
    : /^Call/.test(title) ? { colour: '#16765a', icon: 'call-outline' as const }
    : /^Choose image|^Take photo/.test(title) ? { colour: '#275de8', icon: 'camera-outline' as const }
    : /^Return|^Refund/.test(title) ? { colour: '#9b640b', icon: 'return-down-back-outline' as const }
    : /^Close|^Cancel|^Back/.test(title) ? { colour: theme.muted, icon: 'close-outline' as const }
    : /^Refresh|^Retry|^Check/.test(title) ? { colour: '#275de8', icon: 'refresh-outline' as const }
    : null : null;
  const accent = action?.colour || '#275de8';
  const foreground = secondary ? action ? theme.dark ? accent==='#c13c4c'?'#fda4af':accent==='#16765a'?'#85dbb9':'#d6e4ff' : accent : theme.text : '#fff';
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled: disabled || busy, busy }} disabled={disabled || busy} onPress={onPress}
    style={({ pressed }) => [styles.button, { backgroundColor: secondary ? theme.panel : accent, borderColor: secondary ? theme.border : accent, opacity: disabled || busy ? 0.5 : pressed ? 0.8 : 1 }]}>
    {busy ? <ActivityIndicator color={foreground} /> : action && <Ionicons name={action.icon} size={18} color={foreground} />}<Text style={{ flexShrink: 1, textAlign: 'center', color: foreground, fontFamily: theme.language === 'km' ? 'Hanuman_700Bold' : undefined, fontWeight: '600', fontSize: 14 }}>{theme.t(title)}</Text>
  </Pressable>;
}
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  const theme = useTheme();
  return <View style={{ gap: 6 }}><Label>{label}</Label><TextInput {...props} accessibilityLabel={theme.t(label)} placeholderTextColor={theme.muted}
    style={[styles.input, { color: theme.text, backgroundColor: theme.panel, borderColor: theme.border, fontFamily: theme.language === 'km' ? 'Hanuman_400Regular' : undefined }, props.style]} /></View>;
}
export function SearchField({ onScan, scanLabel = 'Scan barcode', ...props }: TextInputProps & { onScan?: () => void; scanLabel?: string }) {
  const theme = useTheme();
  return <View style={{flexDirection:'row',alignItems:'center',borderWidth:1,borderColor:theme.border,borderRadius:14,backgroundColor:theme.panel,paddingLeft:14}}>
    <Ionicons name="search-outline" size={20} color={theme.muted}/><TextInput {...props} accessibilityLabel={theme.t('Search')} autoCapitalize="none" placeholderTextColor={theme.muted} style={{flex:1,minHeight:50,paddingHorizontal:12,fontSize:15,color:theme.text,fontFamily:theme.language==='km'?'Hanuman_400Regular':undefined}}/>
    {onScan&&<Pressable accessibilityRole="button" accessibilityLabel={theme.t(scanLabel)} onPress={onScan} style={{minWidth:50,minHeight:48,justifyContent:'center',alignItems:'center',borderLeftWidth:1,borderColor:theme.border}}><Ionicons name="barcode-outline" size={25} color={theme.dark?'#91b4ff':'#275de8'}/></Pressable>}
  </View>;
}
export function Card({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  return <View style={[styles.card, { backgroundColor: theme.panel, borderColor: theme.border }]}>{children}</View>;
}
export function Brand({ compact = false }: { compact?: boolean }) {
  const theme = useTheme();
  return <View style={[styles.row, { gap: 10 }]}>
    <Image accessibilityLabel="TENH POS logo" source={require('../assets/tenh-pos-logo.png')} style={{ width: compact ? 38 : 64, height: compact ? 38 : 64, borderRadius: compact ? 10 : 18 }} resizeMode="contain" />
    <View><Text style={{ fontSize: compact ? 19 : 28, fontWeight: '800', letterSpacing: -0.5, color: theme.text }}>TENH <Text style={{ color: '#275de8' }}>POS</Text></Text>{!compact && <Label muted>Your business, in your pocket.</Label>}</View>
  </View>;
}
export const ProductPhoto = React.memo(function ProductPhoto({ uri, fallbackUri, size = 64, fill = false, fit = 'cover' }: { uri?: string | null; fallbackUri?: string | null; size?: number; fill?: boolean; fit?: 'cover' | 'contain' }) {
  const theme = useTheme();
  const [failed, setFailed] = useState<string[]>([]);
  const source = [uri, fallbackUri].find(value => value && !failed.includes(value));
  const dimensions = fill ? { width: '100%' as const, aspectRatio: 1 } : { width: size, height: size };
  return <View style={[dimensions, { borderRadius: 14, backgroundColor: theme.dark ? '#233148' : '#f0f3f8', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }]}>
    {source ? <CachedImage source={{ uri: source }} style={{ width: '100%', height: '100%' }} contentFit={fit} cachePolicy="memory-disk" recyclingKey={source} transition={120} onError={() => setFailed(previous => [...previous.slice(-1), source])} accessibilityLabel="Product photo" /> : <Ionicons name="image-outline" size={fill ? 34 : 24} color={theme.muted} />}
  </View>;
});
export const menuIcons: Record<string, React.ComponentProps<typeof Ionicons>['name']> = {
 Profile:'person-circle-outline',Users:'people-outline',Branches:'business-outline',Categories:'albums-outline',
  Settings: 'settings-outline', Subscription: 'diamond-outline',
  POS: 'calculator-outline', Products: 'pricetag-outline', Bundles: 'layers-outline', Orders: 'receipt-outline', 'Online Orders': 'bag-handle-outline', Stock: 'cube-outline', Customers: 'people-outline', Expenses: 'wallet-outline', Register: 'cash-outline', Reports: 'bar-chart-outline', 'Purchase Orders': 'clipboard-outline', 'Stock Transfers': 'swap-horizontal-outline', 'Online Store': 'storefront-outline', Alerts: 'notifications-outline',
};
export function MenuTile({ title, onPress }: { title: string; onPress: () => void }) {
  const theme = useTheme();
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => ({ width: '47%', flexGrow: 1, padding: 16, gap: 14, borderRadius: 18, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.panel, opacity: pressed ? 0.65 : 1 })}>
    <View style={[styles.row, { justifyContent: 'space-between' }]}><View style={{ backgroundColor: theme.dark ? '#233858' : '#edf3ff', padding: 11, borderRadius: 13 }}><Ionicons name={menuIcons[title] || 'grid-outline'} size={23} color={theme.dark ? '#91b4ff' : '#275de8'} /></View><Ionicons name="chevron-forward" size={16} color={theme.muted} /></View>
    <Text style={{ fontSize: 14, fontWeight: '600', color: theme.text, fontFamily: theme.language === 'km' ? 'Hanuman_700Bold' : undefined }}>{theme.t(title)}</Text>
  </Pressable>;
}
export function Badge({ title, positive = false }: { title: string; positive?: boolean }) {
  const theme = useTheme();
  const professional=useContext(ActionContext);
  const label=professional&&/^[a-z_]+$/.test(title)?title.replaceAll('_',' ').replace(/^./,value=>value.toUpperCase()):title;
  const waiting=professional&&['pending','draft','in_transit','partial','pending_verification'].includes(title);
  return <View style={{ alignSelf: 'flex-start', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8, backgroundColor: waiting?theme.dark?'#45371f':'#fff4dd':positive ? theme.dark ? '#183e37' : '#e9f7f0' : theme.dark ? '#2a374e' : '#f0f3f8' }}><Text style={{ fontSize: 12, fontWeight: '600', color: waiting?theme.dark?'#f4cb80':'#8b6218':positive ? theme.dark ? '#8cdec0' : '#23785a' : theme.muted }}>{theme.t(label)}</Text></View>;
}
export function MenuRow({ title, onPress, description, color }: { title: string; onPress: () => void; description?: string; color?: string }) {
  const theme = useTheme();
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 56, paddingVertical: 7, opacity: pressed ? 0.6 : 1 })}>
    <View style={{ padding: 10, borderRadius: 12, backgroundColor: theme.dark ? '#233858' : color ? `${color}12` : '#eef3ff' }}><Ionicons name={menuIcons[title] || 'grid-outline'} size={21} color={color || (theme.dark ? '#91b4ff' : '#275de8')} /></View>
    <View style={{ flex: 1, gap: 4 }}><Text style={{color:theme.text,fontSize:14,fontWeight:'600'}}>{theme.t(title)}</Text>{description&&<Text style={{color:theme.muted,fontSize:11}}>{theme.t(description)}</Text>}</View><Ionicons name="chevron-forward" size={16} color={theme.muted} />
  </Pressable>;
}
export function SectionTitle({ title, icon = 'grid-outline' }: { title: string; icon?: React.ComponentProps<typeof Ionicons>['name'] }) {
  const theme = useTheme();
  return <View style={[styles.row,{gap:9,paddingTop:4,flexShrink:1}]}><Ionicons name={icon} size={19} color={theme.dark?'#91b4ff':'#275de8'}/><Text style={{flexShrink:1,color:theme.text,fontSize:16,fontWeight:'700',fontFamily:theme.language==='km'?'Hanuman_700Bold':undefined}}>{theme.t(title)}</Text></View>;
}
export function DetailRow({ label, value }: { label: string; value?: React.ReactNode }) {
  return <View style={[styles.row,{justifyContent:'space-between',alignItems:'flex-start'}]}><View style={{flex:1}}><Label muted>{label}</Label></View><View style={{flex:1.4,alignItems:'flex-end'}}><Label>{value ?? '—'}</Label></View></View>;
}
export function Metric({ label, value, icon }: { label: string; value: string; icon: React.ComponentProps<typeof Ionicons>['name'] }) {
  const theme=useTheme();
  return <View style={{flex:1,minWidth:'45%',backgroundColor:theme.panel,borderColor:theme.border,borderWidth:1,borderRadius:17,padding:16,gap:8}}><Ionicons name={icon} size={21} color={theme.dark?'#91b4ff':'#275de8'}/><Text style={{fontSize:22,fontWeight:'700',color:theme.text}}>{value}</Text><Label muted>{label}</Label></View>;
}
export const styles = StyleSheet.create({
  page: { padding: 20, gap: 16, paddingBottom: 32, width: '100%', maxWidth: 760, alignSelf: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  card: { padding: 16, borderRadius: 18, borderWidth: 1, gap: 12 },
  button: { minHeight: 48, padding: 12, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, minHeight: 50 },
});
