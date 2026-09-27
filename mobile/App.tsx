import {AccountMenu} from './src/account-menu';
import React, { createContext, lazy, Suspense, useContext, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, BackHandler, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, Switch, Text, View, useColorScheme } from 'react-native';
import { Slot, router, usePathname, useGlobalSearchParams } from 'expo-router';
import Constants from 'expo-constants';
import { ChoiceChip } from './src/list-controls';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import NetInfo from '@react-native-community/netinfo';
import type { Session } from '@supabase/supabase-js';
import { api, apiUrl, auth, configured, deviceStorage, type Workspace } from './src/client';
import { ActionArea, SectionTitle, DetailRow, Brand, MenuRow, Button, Card, Field, Label, Theme, styles, useTheme, type Language } from './src/ui';
import { clearCache, Home, Records, Reports, OrderQrScanner } from './src/screens';
import { useFonts, Hanuman_400Regular, Hanuman_700Bold } from '@expo-google-fonts/hanuman';
import { EntryForm } from './src/entry-form';
import { DeviceLock, DeviceLockSettings } from './src/device-lock';
import { offline } from './src/offline';
import { Alerts } from './src/alerts';
import { LaunchLoader, Shimmer } from './src/loading';
import { PushSettings, usePush, disablePush } from './src/push';
import Pos from './src/pos';
import { TeamSetup } from './src/team-setup';

// POS is the frequent cashier entry point: include it in the initial app bundle.

const Management = lazy(() => import('./src/management').then(module => ({ default: module.Management })));

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
  async function appearance(nextDark: boolean, nextLanguage: Language) {
    await deviceStorage.setItem('tenh-display', JSON.stringify({ dark: nextDark, language: nextLanguage }));
    setDark(nextDark); setLanguage(nextLanguage);
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
    {!ready || (!fontsReady && !fontError) ? <LaunchLoader />
      : session ? <DeviceLock key={session.user.id} userId={session.user.id} passwordAuthenticated={passwordUser === session.user.id}><WorkspaceApp userId={session.user.id} onAppearance={appearance} /></DeviceLock> : <SignIn authenticated={setPasswordUser} />}
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
      <View style={{ paddingBottom: 24 }}><Brand /></View><Label large>Welcome back</Label><Label muted>Sign in to manage your store.</Label>
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

function WorkspaceApp({ userId, onAppearance }: { userId: string; onAppearance: (dark:boolean,language:Language) => Promise<void> }) {
  const theme = useTheme();
  const [online, setOnline] = useState(true);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [setupRequired, setSetupRequired] = useState(false);
  const [businessId, setBusinessId] = useState<string>();
  const [branchId, setBranchId] = useState<string>();
  const [businesses, setBusinesses] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const pathname = usePathname();
  const { checkout, posFrom } = useGlobalSearchParams<{ checkout?: string; posFrom?:string }>();
  const page = decodeURIComponent(pathname.slice(1)) || 'Home';
  function setPage(name: string) {
    if (posLocked) return;
    router.replace(name === 'Home' ? '/' : { pathname: '/[page]', params: { page: name, ...(name==='POS'?{posFrom:page==='Home'?'Home':'More'}:{}) } });
  }
  const [picker, setPicker] = useState<'branch' | 'business' | null>(null);
  const [version, setVersion] = useState(0);
  const [signingOut, setSigningOut] = useState(false);
  const [posLocked, setPosLocked] = useState(false);
  const [support, setSupport] = useState(false);
  const [unread, setUnread] = useState(0);
  const [incomingNotice,setIncomingNotice]=useState(false);
  useEffect(()=>{if(!incomingNotice)return;const timer=setTimeout(()=>setIncomingNotice(false),5000);return()=>clearTimeout(timer);},[incomingNotice]);
  usePush({userId,businessId:workspace?.business.id,branchId:workspace?.branchId},online,unread,()=>{if(!posLocked)setPage('Alerts');});
  const currentBusinessId = workspace?.business.id;
  const currentBranchId = workspace?.branchId;
  useEffect(() => {
    if (!currentBusinessId || !currentBranchId || !online) return;
    let seen: Set<string> | null = null;
    let active = true, pending = false;
    const controller = new AbortController();
    const refresh = async () => {
      if (pending || AppState.currentState !== 'active') return;
      pending = true;
      try {
        const result = await api<{ unread: number; rows: {id:string;read:boolean;notification_type:string}[] }>('alerts', { businessId: currentBusinessId, branchId: currentBranchId }, undefined, controller.signal);
        if (active) {
          if(seen===null)setIncomingNotice(false);
          if(seen&&result.rows.some(row=>!row.read&&row.notification_type==='new_order'&&!seen!.has(row.id)))setIncomingNotice(true);
          seen=new Set([...(seen??[]),...result.rows.map(row=>row.id)]);
          setUnread(result.unread);
        }
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
      if (current) { setSetupRequired(false); setWorkspace(data); void offline.save(userId, 'workspace', data).catch(() => undefined); }
    }).catch(error => { if (current) { clearCache(userId); setWorkspace(null); setSetupRequired(error.code === 'team_setup_required'); setError(error.message); } }).finally(() => { if (current) setLoading(false); });
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
      if (page === 'POS' && checkout === '1') { router.setParams({ checkout: '' }); return true; }
      if (posLocked) return true;
      if (picker) { setPicker(null); return true; }
      if (page === 'POS' && posFrom === 'More') { router.replace({pathname:'/[page]',params:{page:'More'}}); return true; }
      if (page !== 'Home') { router.replace('/'); return true; }
      return false;
    });
    return () => subscription.remove();
  }, [page, picker, posLocked, checkout, posFrom]);
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
  const permitted: Record<string, string> = { Users:'users.view',Branches:'locations.manage',Categories:'categories.manage', Products:'products.view',Bundles:'products.view','Online Store':'storefront.view',POS: 'pos.access', Orders: 'orders.view', 'Online Orders': 'orders.view', Stock: 'inventory.view', 'Purchase Orders': 'purchases.view', 'Stock Transfers': 'transfers.manage', Customers: 'customers.view', Expenses: 'expenses.manage', Register: 'register.manage', Reports: 'reports.view' };
  const allowed = (name: string) => !permitted[name] || !!workspace?.permissions.includes(permitted[name]);
  const tabs = ['Home', 'Orders', 'Stock', 'Alerts', 'More'].filter(allowed);
  const icons: Record<string, React.ComponentProps<typeof Ionicons>['name']> = { Home: 'home-outline', Orders: 'receipt-outline', Stock: 'cube-outline', Alerts: 'notifications-outline', More: 'grid-outline' };
  const currentPage = ['Home', 'More', 'Alerts', 'Settings', 'Subscription', 'Profile', ...Object.keys(permitted)].includes(page) && allowed(page) ? page : 'Home';
  function renderPage() {
    if (!workspace) return null;
    return (currentPage === 'Home' ? <Home workspace={workspace} online={online} go={setPage} />
        : currentPage === 'More' ? <ScrollView contentContainerStyle={styles.page}>
          {([
            ['Sales & customers', ['POS', 'Online Orders', 'Customers', 'Register']],
            ['Products & inventory', ['Products', 'Bundles', 'Categories', 'Purchase Orders', 'Stock Transfers']],
            ['Business', ['Reports', 'Expenses', 'Online Store', 'Users', 'Branches']],
          ] as [string, string[]][]).map(([title, names]) => { const visible = names.filter(allowed); return visible.length ? <View key={title} style={{gap:8}}><Label muted>{title}</Label><Card>{visible.map((name,index) => <View key={name} style={index ? {borderTopWidth:1,borderColor:theme.border} : undefined}><MenuRow title={name} onPress={() => setPage(name)} /></View>)}</Card></View> : null; })}
          <Card><MenuRow title="Profile" onPress={()=>setPage('Profile')}/><MenuRow title="Subscription" onPress={()=>setPage('Subscription')}/><MenuRow title="Settings" onPress={()=>setPage('Settings')}/></Card><Label muted>{`Version ${Constants.expoConfig?.version||'1.0.0'}`}</Label>
          {businesses.length > 1 && <Button title="Choose business" secondary disabled={!online} onPress={() => setPicker('business')} />}
          <Button title="Report a bug" secondary disabled={!online} onPress={() => setSupport(true)} />
          <Button title="Sign out" secondary onPress={() => Alert.alert(theme.t('Sign out'), 'Sign out on this device?', [{ text: theme.t('Cancel'), style: 'cancel' }, { text: theme.t('Sign out'), onPress: () => void signOut() }])} busy={signingOut} />
        </ScrollView>
        : currentPage === 'Settings' ? <ScrollView contentContainerStyle={styles.page}>
          <SectionTitle title="Appearance & language" icon="color-palette-outline"/>
          <AppearanceSettings save={onAppearance}/>
          <SectionTitle title="Security" icon="shield-checkmark-outline"/><DeviceLockSettings/>
          <SectionTitle title="Notifications" icon="notifications-outline"/><PushSettings scope={{userId,businessId:workspace.business.id,branchId:workspace.branchId}} online={online}/>
        </ScrollView>
        : currentPage === 'Subscription' ? <ScrollView contentContainerStyle={styles.page}>
          <SectionTitle title="Your subscription" icon="diamond-outline"/><Card><Label large>{workspace.business.name}</Label><DetailRow label="Status" value={workspace.business.subscriptionStatus}/><DetailRow label="Expires" value={workspace.business.expiresAt?new Date(workspace.business.expiresAt).toLocaleDateString():'No expiry supplied'}/><DetailRow label="Accessible branches" value={String(workspace.branches.length)}/></Card>
          <Card><Label>Manage subscription and payments on the TENH POS website.</Label><Button title="Continue on website" onPress={()=>theme.alert('Open subscription website?','Plan changes and payments are completed on the website. You may need to sign in.',[{text:'Cancel',style:'cancel'},{text:'Continue',onPress:()=>void Linking.openURL(`${apiUrl}/dashboard/subscription`).catch(()=>theme.alert('Unable to open website'))}])}/></Card>
        </ScrollView>
        : currentPage === 'Products'||currentPage==='Bundles'||currentPage==='Online Store' ? <Management key={currentPage} workspace={workspace} online={online} feature={currentPage}/>
        : ['Profile','Users','Branches','Categories'].includes(currentPage) ? <AccountMenu key={currentPage} feature={currentPage as 'Profile'|'Users'|'Branches'|'Categories'} workspace={workspace} online={online}/>
        : currentPage === 'Reports' ? <Reports workspace={workspace} online={online} />
        : currentPage === 'POS' ? <Pos workspace={workspace} online={online} onLocked={setPosLocked} />
        : currentPage === 'Alerts' ? <Alerts scope={{ userId, businessId: workspace.business.id, branchId: workspace.branchId }} online={online} onUnread={setUnread} />
        : <Records key={currentPage} feature={currentPage} scope={{ userId: workspace.userId, businessId: workspace.business.id, branchId: workspace.branchId }} online={online} permissions={workspace.permissions} workspace={workspace} />);
  }
  if (setupRequired) return <TeamSetup onComplete={() => setVersion(value => value + 1)} />;
  if (!workspace && loading && online) return <LaunchLoader />;
  return <SafeAreaView edges={workspace && !picker && currentPage!=='POS' ? ['top', 'left', 'right'] : ['top', 'left', 'right', 'bottom']} style={{ flex: 1, backgroundColor: theme.background }}>
    <View style={{ paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderColor: theme.border, backgroundColor: theme.panel }}>
      {workspace && currentPage !== 'Home' ? <View style={[styles.row,{minHeight:44}]}>{!tabs.includes(currentPage)&&<Pressable accessibilityRole="button" accessibilityLabel={currentPage==='POS'&&checkout==='1'?'Back to products':currentPage==='POS'&&posFrom==='Home'?'Back to Home':'Back to More'} disabled={posLocked&&!(currentPage==='POS'&&checkout==='1')} onPress={()=>currentPage==='POS'&&checkout==='1'?router.setParams({checkout:''}):setPage(currentPage==='POS'&&posFrom==='Home'?'Home':'More')} style={{padding:10,opacity:posLocked&&checkout!=='1'?0.4:1}}><Ionicons name="chevron-back" size={23} color={theme.text}/></Pressable>}<View style={{flex:1}}><Label large>{currentPage === 'POS' ? checkout === '1' ? 'Checkout' : 'Point of Sale' : currentPage}</Label></View>{currentPage==='More'&&workspace.permissions.includes('orders.view')&&<OrderQrScanner key={`${userId}:${workspace.business.id}:${workspace.branchId}`} scope={{userId,businessId:workspace.business.id,branchId:workspace.branchId}} online={online} permissions={workspace.permissions}/>}{currentPage==='Expenses'&&workspace.permissions.includes('reports.view')&&<Pressable accessibilityRole="button" accessibilityLabel="Expense analytics" onPress={()=>setPage('Reports')} style={{padding:10,minHeight:44}}><Ionicons name="pie-chart-outline" size={22} color={theme.text}/></Pressable>}{currentPage==='Customers'&&workspace.permissions.includes('business.update')&&<Pressable accessibilityRole="button" accessibilityLabel="Customer fields" onPress={()=>router.setParams({customerFields:'1'})} style={{padding:10,minHeight:44}}><Ionicons name="options-outline" size={22} color={theme.text}/></Pressable>}{['Orders','Online Orders'].includes(currentPage)&&<View style={{flexDirection:'row'}}>{currentPage==='Online Orders'&&<Pressable accessibilityRole="button" accessibilityLabel="Incoming order sound and settings" onPress={()=>router.setParams({orderPanel:'alerts'})} style={{padding:10,minHeight:44}}><Ionicons name="volume-high-outline" size={21} color={theme.text}/></Pressable>}</View>}</View> : <View style={[styles.row, { justifyContent: 'space-between' }]}><Brand compact />
        <Pressable style={{ flexShrink: 1, minHeight: 44, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 12, backgroundColor: theme.background, flexDirection: 'row', gap: 6, alignItems: 'center' }} accessibilityLabel="Choose branch" accessibilityRole="button" disabled={posLocked || !online || loading || !workspace || workspace.branches.length < 2} onPress={() => setPicker('branch')}>
          <Ionicons name="location-outline" size={16} color={theme.muted} /><Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 12, color: theme.text }}>{workspace?.branches.find(branch => branch.id === workspace.branchId)?.name ?? 'Workspace'}</Text>{workspace && workspace.branches.length > 1 && <Ionicons name="chevron-down" size={13} color={theme.muted} />}
        </Pressable>
      </View>}
    </View>
    {!online && <View accessibilityRole="alert" style={{ backgroundColor: theme.dark ? '#713f12' : '#fef3c7', padding: 10 }}><Label>You are offline</Label></View>}
    {picker && workspace ? <ScrollView contentContainerStyle={styles.page}><Label large>{picker === 'branch' ? 'Choose branch' : 'Choose business'}</Label>
      {(picker === 'branch' ? workspace.branches : businesses).map(item => <Button key={item.id} title={`${item.name}${item.id === (picker === 'branch' ? workspace.branchId : workspace.business.id) ? ' ✓' : ''}`} onPress={() => switchTo(item.id)} secondary />)}
      <Button title="Cancel" secondary onPress={() => setPicker(null)} /></ScrollView>
    : !workspace ? <ScrollView contentContainerStyle={styles.page}>{loading && online ? <ActivityIndicator size="large" color="#275de8" /> : <Card><Label>{error || 'Connect to load your workspace.'}</Label><Button title="Retry" onPress={() => setVersion(v => v + 1)} disabled={!online} />
      <Button title="Open website" secondary onPress={() => void Linking.openURL(`${apiUrl}/dashboard`)} /><Button title="Sign out" secondary onPress={() => void signOut()} busy={signingOut} /></Card>}</ScrollView>
    : <View style={{ flex: 1 }} key={`${workspace.business.id}:${workspace.branchId}`}>
      {incomingNotice&&<Pressable accessibilityRole="button" accessibilityLabel="New online order. Open alerts" disabled={posLocked} onPress={()=>{setIncomingNotice(false);setPage('Alerts');}} style={{padding:14,backgroundColor:theme.panel,borderBottomWidth:1,borderColor:theme.border}}><View style={styles.row}><Ionicons name="notifications" size={20} color="#5987ed"/><Label>New online order</Label></View></Pressable>}
      <Suspense fallback={<View style={styles.page}><Shimmer /></View>}><ActionArea enabled={!['Home','Orders','Stock','Alerts','More'].includes(currentPage)}><RouteContent.Provider value={renderPage()}><Slot /></RouteContent.Provider></ActionArea></Suspense>
    </View>}
    {support && workspace && <EntryForm kind="support" scope={{ businessId: workspace.business.id, branchId: workspace.branchId }} online={online} close={() => setSupport(false)} saved={() => { setSupport(false); Alert.alert('Report sent', 'Your report is available to Support.'); }} />}
    {workspace && !picker && currentPage!=='POS' && <SafeAreaView edges={['bottom']} style={{ flexDirection: 'row', borderTopWidth: 1, borderColor: theme.border, backgroundColor: theme.panel }}>
      {tabs.map(name => { const selected = currentPage === name || name === 'More' && !tabs.includes(currentPage); return <Pressable key={name} disabled={posLocked} accessibilityRole="tab" accessibilityState={{ selected, disabled: posLocked }} onPress={() => setPage(name)} style={{ flex: 1, paddingVertical: 9, gap: 4, opacity: posLocked ? 0.4 : 1, alignItems: 'center' }}>
        <View style={{ paddingHorizontal: 17, paddingVertical: 5, borderRadius: 13, backgroundColor: selected ? theme.dark ? '#233858' : '#edf3ff' : 'transparent' }}><Ionicons name={icons[name]} size={22} color={selected ? theme.dark ? '#91b4ff' : '#275de8' : theme.muted} /></View>
        {name === 'Alerts' && unread > 0 && <Text accessibilityLabel={`${unread} unread notifications`} style={{ color: '#fff', backgroundColor: '#e11d48', borderRadius: 9, paddingHorizontal: 5, position: 'absolute', top: 6, right: 12, fontSize: 11 }}>{unread > 99 ? '99+' : unread}</Text>}
        <Text style={{ color: selected ? theme.dark ? '#91b4ff' : '#275de8' : theme.muted, fontFamily: theme.language === 'km' ? 'Hanuman_700Bold' : undefined, fontWeight: '600', fontSize: 11 }}>{theme.t(name)}</Text>
      </Pressable>; })}
    </SafeAreaView>}
  </SafeAreaView>;
}

const RouteContent = createContext<React.ReactNode>(null);
export function WorkspaceRoute() { return useContext(RouteContent); }

function AppearanceSettings({save}:{save:(dark:boolean,language:Language)=>Promise<void>}){
 const theme=useTheme(),[dark,setDark]=useState(theme.dark),[language,setLanguage]=useState<Language>(theme.language),[busy,setBusy]=useState(false),[error,setError]=useState('');
 return <Card><View style={[styles.row,{justifyContent:'space-between'}]}><Label>Dark mode</Label><Switch accessibilityLabel="Dark mode" value={dark} disabled={busy} onValueChange={setDark}/></View><Label>Language</Label><View style={styles.row}><ChoiceChip title="English" selected={language==='en'} disabled={busy} onPress={()=>setLanguage('en')}/><ChoiceChip title="ភាសាខ្មែរ" selected={language==='km'} disabled={busy} onPress={()=>setLanguage('km')}/></View>{!!error&&<Label>{error}</Label>}<Button title="Save appearance" busy={busy} disabled={dark===theme.dark&&language===theme.language} onPress={()=>{setBusy(true);setError('');void save(dark,language).then(()=>theme.alert('Saved','Appearance updated.')).catch(()=>setError('Could not save appearance. Please try again.')).finally(()=>setBusy(false));}}/></Card>;
}
