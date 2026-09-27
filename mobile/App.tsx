import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, BackHandler, Image, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, Switch, Text, View, useColorScheme } from 'react-native';
import { Slot, router, usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import NetInfo from '@react-native-community/netinfo';
import type { Session } from '@supabase/supabase-js';
import { api, apiUrl, auth, configured, deviceStorage, type Workspace } from './src/client';
import { Button, Card, Field, Label, Theme, styles, useTheme, type Language } from './src/ui';
import { clearCache, Home, Records, Reports } from './src/screens';
import Pos from './src/pos';
import { useFonts, Hanuman_400Regular, Hanuman_700Bold } from '@expo-google-fonts/hanuman';
import { EntryForm } from './src/entry-form';
import { DeviceLock, DeviceLockSettings } from './src/device-lock';
import { offline } from './src/offline';
import { Management } from './src/management';
import { PushSettings, usePush, disablePush } from './src/push';

export default function App() {
  const [fontsReady, fontError] = useFonts({ Hanuman_400Regular, Hanuman_700Bold });
  const systemDark = useColorScheme() === 'dark';
  const [dark, setDark] = useState(systemDark);
  const [language, setLanguage] = useState<Language>('en');
  const [session, setSession] = useState<Session | null>(null);
  const [passwordUser, setPasswordUser] = useState<string | null>(null);
  const signedInUser = useRef<string | undefined>(undefined);
  const [ready, setReady] = useState(!auth);
  useEffect(() => {
    let active = true;
    deviceStorage.getItem('tenh-display').then(value => {
      if (!value || !active) return;
      const saved = JSON.parse(value);
      if (typeof saved.dark === 'boolean') setDark(saved.dark);
      if (saved.language === 'en' || saved.language === 'km') setLanguage(saved.language);
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);
  function appearance(nextDark: boolean, nextLanguage: Language) {
    setDark(nextDark); setLanguage(nextLanguage);
    void deviceStorage.setItem('tenh-display', JSON.stringify({ dark: nextDark, language: nextLanguage })).catch(() => Alert.alert('Settings', 'This device could not save the appearance preference.'));
  }
  useEffect(() => {
    if (!auth) return;
    let active = true;
    auth.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) Alert.alert('Sign-in unavailable', error.message);
      signedInUser.current = data.session?.user.id; setSession(data.session); setReady(true);
    }).catch(error => { if (active) { Alert.alert('Unable to restore sign-in', error.message); setReady(true); } });
    const { data: { subscription } } = auth.auth.onAuthStateChange((_event, next) => {
      if (active) { if (!next) { clearCache(signedInUser.current); setPasswordUser(null); } signedInUser.current = next?.user.id; setSession(next); }
    });
    auth.auth.startAutoRefresh();
    return () => { active = false; subscription.unsubscribe(); };
  }, []);
  return <SafeAreaProvider><Theme.Provider value={{ dark, language }}><StatusBar style={dark ? 'light' : 'dark'} />
    {!ready || (!fontsReady && !fontError) ? <SafeAreaView style={{ flex: 1, justifyContent: 'center' }}><ActivityIndicator /></SafeAreaView>
      : session ? <DeviceLock key={session.user.id} userId={session.user.id} passwordAuthenticated={passwordUser === session.user.id}><WorkspaceApp userId={session.user.id} onTheme={value => appearance(value, language)} onLanguage={value => appearance(dark, value)} /></DeviceLock> : <SignIn authenticated={setPasswordUser} />}
  </Theme.Provider></SafeAreaProvider>;
}

function SignIn({ authenticated }: { authenticated: (userId: string) => void }) {
  const theme = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);
  async function signIn() {
    if (!auth || pending.current) return;
    if (!email.trim() || !password) { setError('Enter your email and password.'); return; }
    pending.current = true; setBusy(true); setError('');
    try {
      const result = await auth.auth.signInWithPassword({ email: email.trim(), password });
      if (result.error) throw result.error;
      if (result.data.user) authenticated(result.data.user.id);
      setPassword('');
    } catch (error) { setError((error as Error).message); }
    finally { pending.current = false; setBusy(false); }
  }
  return <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView contentContainerStyle={[styles.page, { flexGrow: 1, justifyContent: 'center' }]} keyboardShouldPersistTaps="handled">
      <Image source={require('./assets/tenh-pos-logo.png')} style={{ width: 80, height: 80, borderRadius: 18 }} /><Text style={{ color: '#275de8', fontWeight: '800', fontSize: 34 }}>TENH POS</Text><Label large>Your business, in your pocket.</Label><Label muted>Sign in with your existing business account.</Label>
      {!configured ? <Card><Label>Mobile setup is required. Configure the public API URL and Supabase connection in mobile/.env.local.</Label></Card> : <Card>
        <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" editable={!busy} />
        <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" editable={!busy} onSubmitEditing={() => void signIn()} />
        {error ? <Text accessibilityRole="alert" style={{ color: theme.dark ? '#fda4af' : '#be123c' }}>{error}</Text> : null}
        <Button title="Sign in" onPress={() => void signIn()} busy={busy} />
        <Button title="Forgot password?" secondary onPress={() => void Linking.openURL(`${apiUrl}/forgot-password`).catch(() => setError('Unable to open password reset.'))} />
      </Card>}
    </ScrollView>
  </KeyboardAvoidingView></SafeAreaView>;
}

function WorkspaceApp({ userId, onTheme, onLanguage }: { userId: string; onTheme: (value: boolean) => void; onLanguage: (value: Language) => void }) {
  const theme = useTheme();
  const [online, setOnline] = useState(true);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [businessId, setBusinessId] = useState<string>();
  const [branchId, setBranchId] = useState<string>();
  const [businesses, setBusinesses] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const pathname = usePathname();
  const page = decodeURIComponent(pathname.slice(1)) || 'Home';
  function setPage(name: string) {
    if (posLocked) return;
    router.replace(name === 'Home' ? '/' : { pathname: '/[screen]', params: { screen: name } });
  }
  const [picker, setPicker] = useState<'branch' | 'business' | null>(null);
  const [version, setVersion] = useState(0);
  const [signingOut, setSigningOut] = useState(false);
  const [posLocked, setPosLocked] = useState(false);
  const [support, setSupport] = useState(false);
  const [unread, setUnread] = useState(0);
  usePush({userId,businessId:workspace?.business.id,branchId:workspace?.branchId},online,unread,()=>{if(!posLocked)setPage('Alerts');});
  const currentBusinessId = workspace?.business.id;
  const currentBranchId = workspace?.branchId;
  useEffect(() => {
    if (!currentBusinessId || !currentBranchId || !online) return;
    let active = true, pending = false;
    const controller = new AbortController();
    const refresh = async () => {
      if (pending || AppState.currentState !== 'active') return;
      pending = true;
      try {
        const result = await api<{ unread: number }>('alerts', { businessId: currentBusinessId, branchId: currentBranchId }, undefined, controller.signal);
        if (active) setUnread(result.unread);
      } catch { /* Keep the known unread count during temporary network failures. */ }
      finally { pending = false; }
    };
    void refresh(); const timer = setInterval(() => void refresh(), 30000);
    return () => { active = false; clearInterval(timer); controller.abort(); };
  }, [currentBusinessId, currentBranchId, online]);
  useEffect(() => NetInfo.addEventListener(state => setOnline(state.isConnected !== false && state.isInternetReachable !== false)), []);
  useEffect(() => {
    const listener = AppState.addEventListener('change', value => { if (value === 'active') setVersion(v => v + 1); });
    return () => listener.remove();
  }, []);
  useEffect(() => {
    if (!online) {
      let current = true;
      offline.read(userId, 'workspace').then(saved => {
        const data = saved?.data as Workspace | undefined;
        if (current) setWorkspace(previous => {
          const candidate = data ?? previous;
          return candidate?.userId === userId && (!candidate.business.expiresAt || Date.parse(candidate.business.expiresAt) > Date.now())
            && (!businessId || candidate.business.id === businessId) && (!branchId || candidate.branchId === branchId) ? candidate : null;
        });
        if (current) setLoading(false);
      }).catch(() => { if (current) setLoading(false); });
      return () => { current = false; };
    }
    let current = true;
    const controller = new AbortController();
    // Expose the state of the external workspace refresh while preserving its last snapshot.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true); setError('');
    api<Workspace>('session', { businessId, branchId }, undefined, controller.signal).then(data => {
      if (current) { setWorkspace(data); void offline.save(userId, 'workspace', data).catch(() => undefined); }
    }).catch(error => { if (current) { clearCache(userId); setWorkspace(null); setError(error.message); } }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; controller.abort(); };
  }, [businessId, branchId, version, online, userId]);
  useEffect(() => {
    if (!online) return;
    let current = true;
    api<{ business_id: string; businesses: { id: string; name: string } | { id: string; name: string }[] | null }[]>('businesses')
      .then(rows => { if (current) setBusinesses(rows.flatMap(row => row.businesses ? Array.isArray(row.businesses) ? row.businesses : [row.businesses] : [])); })
      .catch(() => { if (current) setBusinesses([]); });
    return () => { current = false; };
  }, [online]);
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (posLocked) return true;
      if (picker) { setPicker(null); return true; }
      if (page !== 'Home') { router.replace('/'); return true; }
      return false;
    });
    return () => subscription.remove();
  }, [page, picker, posLocked]);
  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      if(online&&await deviceStorage.getItem(`tenh-push-${userId}`)==='true')await disablePush(userId);
      const result = await auth?.auth.signOut({ scope: 'local' });
      if (result?.error) throw result.error;
      clearCache();
    } catch (error) { Alert.alert('Unable to sign out', (error as Error).message); }
    finally { setSigningOut(false); }
  }
  function switchTo(id: string) {
    if (workspace && id === (picker === 'branch' ? workspace.branchId : workspace.business.id)) { setPicker(null); return; }
    clearCache(); setWorkspace(null); setUnread(0); setPage('Home');
    if (picker === 'business') { setBusinessId(id); setBranchId(undefined); }
    else setBranchId(id);
    setPicker(null);
  }
  const permitted: Record<string, string> = { Products:'products.view',Bundles:'products.view','Online Store':'storefront.view',POS: 'pos.access', Orders: 'orders.view', 'Online Orders': 'orders.view', Stock: 'inventory.view', 'Purchase Orders': 'purchases.view', 'Stock Transfers': 'transfers.manage', Customers: 'customers.view', Expenses: 'expenses.manage', Register: 'register.manage', Reports: 'reports.view' };
  const allowed = (name: string) => !permitted[name] || !!workspace?.permissions.includes(permitted[name]);
  const tabs = ['Home', 'Orders', 'Stock', 'Alerts', 'More'].filter(allowed);
  const icons: Record<string, React.ComponentProps<typeof Ionicons>['name']> = { Home: 'home-outline', Orders: 'receipt-outline', Stock: 'cube-outline', Alerts: 'notifications-outline', More: 'grid-outline' };
  const currentPage = ['Home', 'More', 'Alerts', ...Object.keys(permitted)].includes(page) && allowed(page) ? page : 'Home';
  function renderPage() {
    if (!workspace) return null;
    return (currentPage === 'Home' ? <Home workspace={workspace} online={online} go={setPage} />
        : currentPage === 'More' ? <ScrollView contentContainerStyle={styles.page}><Label large>More</Label>
          {['POS', 'Products', 'Bundles', 'Online Store', 'Online Orders', 'Purchase Orders', 'Stock Transfers', 'Customers', 'Expenses', 'Register', 'Reports'].filter(allowed).map(name => <Button title={name} key={name} secondary onPress={() => setPage(name)} />)}
          <Card><Label>Subscription</Label><Label>{workspace.business.subscriptionStatus}</Label><Label muted>{workspace.business.expiresAt ? `Expires ${new Date(workspace.business.expiresAt).toLocaleDateString()}` : 'No expiry supplied'}</Label></Card>
          <Card><View style={[styles.row, { justifyContent: 'space-between' }]}><Label>Dark mode</Label><Switch accessibilityLabel="Dark mode" value={theme.dark} onValueChange={onTheme} /></View>
            <Button title={theme.language === 'en' ? 'ភាសាខ្មែរ' : 'English'} secondary onPress={() => onLanguage(theme.language === 'en' ? 'km' : 'en')} /></Card>
          <DeviceLockSettings />
          <PushSettings scope={{userId,businessId:workspace.business.id,branchId:workspace.branchId}} online={online}/>
          {businesses.length > 1 && <Button title="Choose business" secondary disabled={!online} onPress={() => setPicker('business')} />}
          <Button title="Report a bug" secondary disabled={!online} onPress={() => setSupport(true)} />
          <Button title="Sign out" secondary onPress={() => Alert.alert(theme.t('Sign out'), 'Sign out on this device?', [{ text: theme.t('Cancel'), style: 'cancel' }, { text: theme.t('Sign out'), onPress: () => void signOut() }])} busy={signingOut} />
        </ScrollView>
        : currentPage === 'Products'||currentPage==='Bundles'||currentPage==='Online Store' ? <Management workspace={workspace} online={online} feature={currentPage}/>
        : currentPage === 'Reports' ? <Reports workspace={workspace} online={online} />
        : currentPage === 'POS' ? <Pos workspace={workspace} online={online} onLocked={setPosLocked} />
        : <Records key={currentPage} feature={currentPage} scope={{ userId: workspace.userId, businessId: workspace.business.id, branchId: workspace.branchId }} online={online} permissions={workspace.permissions} workspace={workspace} onUnread={setUnread} />);
  }
  return <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
    <View style={{ paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderColor: theme.border, backgroundColor: theme.panel }}>
      <View style={[styles.row, { justifyContent: 'space-between' }]}><Text style={{ color: '#275de8', fontSize: 20, fontWeight: '800' }}>TENH POS</Text>
        <Pressable style={{ flex: 1, alignItems: 'flex-end' }} accessibilityRole="button" disabled={posLocked || !online || loading || !workspace || workspace.branches.length < 2} onPress={() => setPicker('branch')}>
          <Label>{workspace?.branches.find(branch => branch.id === workspace.branchId)?.name ?? 'Workspace'}{workspace && workspace.branches.length > 1 ? ' ▾' : ''}</Label>
        </Pressable>
      </View>
    </View>
    {!online && <View accessibilityRole="alert" style={{ backgroundColor: theme.dark ? '#713f12' : '#fef3c7', padding: 10 }}><Label>You are offline</Label></View>}
    {picker && workspace ? <ScrollView contentContainerStyle={styles.page}><Label large>{picker === 'branch' ? 'Choose branch' : 'Choose business'}</Label>
      {(picker === 'branch' ? workspace.branches : businesses).map(item => <Button key={item.id} title={`${item.name}${item.id === (picker === 'branch' ? workspace.branchId : workspace.business.id) ? ' ✓' : ''}`} onPress={() => switchTo(item.id)} secondary />)}
      <Button title="Cancel" secondary onPress={() => setPicker(null)} /></ScrollView>
    : !workspace ? <ScrollView contentContainerStyle={styles.page}>{loading && online ? <ActivityIndicator size="large" color="#275de8" /> : <Card><Label>{error || 'Connect to load your workspace.'}</Label><Button title="Retry" onPress={() => setVersion(v => v + 1)} disabled={!online} />
      <Button title="Open website" secondary onPress={() => void Linking.openURL(`${apiUrl}/dashboard`)} /><Button title="Sign out" secondary onPress={() => void signOut()} busy={signingOut} /></Card>}</ScrollView>
    : <View style={{ flex: 1 }} key={`${workspace.business.id}:${workspace.branchId}`}>
      <RouteContent.Provider value={renderPage()}><Slot /></RouteContent.Provider>
    </View>}
    {support && workspace && <EntryForm kind="support" scope={{ businessId: workspace.business.id, branchId: workspace.branchId }} online={online} close={() => setSupport(false)} saved={() => { setSupport(false); Alert.alert('Report sent', 'Your report is available to Support.'); }} />}
    {workspace && !picker && <View style={{ flexDirection: 'row', borderTopWidth: 1, borderColor: theme.border, backgroundColor: theme.panel }}>
      {tabs.map(name => <Pressable key={name} disabled={posLocked} accessibilityRole="tab" accessibilityState={{ selected: currentPage === name, disabled: posLocked }} onPress={() => setPage(name)} style={{ flex: 1, paddingVertical: 16, opacity: posLocked ? 0.4 : 1, alignItems: 'center', borderTopWidth: 3, borderColor: currentPage === name ? '#275de8' : 'transparent' }}>
        <Ionicons name={icons[name]} size={22} color={currentPage === name ? '#275de8' : theme.muted} />
        {name === 'Alerts' && unread > 0 && <Text accessibilityLabel={`${unread} unread notifications`} style={{ color: '#fff', backgroundColor: '#e11d48', borderRadius: 9, paddingHorizontal: 5, position: 'absolute', top: 6, right: 12, fontSize: 11 }}>{unread > 99 ? '99+' : unread}</Text>}
        <Text style={{ color: currentPage === name ? '#275de8' : theme.muted, fontFamily: theme.language === 'km' ? 'Hanuman_700Bold' : undefined, fontWeight: '600', fontSize: 13 }}>{theme.t(name)}</Text>
      </Pressable>)}
    </View>}
  </SafeAreaView>;
}

const RouteContent = createContext<React.ReactNode>(null);
export function WorkspaceRoute() { return useContext(RouteContent); }
