import React, { useEffect, useRef, useState } from 'react';
import { AppState, Image, Modal, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as Crypto from 'expo-crypto';
import { api, type Scope } from './client';
import { ActionArea, SectionTitle, Button, Card, Field, Label, styles, useTheme } from './ui';
import type { CustomerFields } from './customer-fields';
import { UploadProgress } from './loading';

type Kind = 'customer' | 'expense' | 'support' | 'register-open' | 'register-close';
const reasons = ['Bug or Technical Issue', 'Billing or Payment', 'Account & User Access', 'Something Else'];
export function EntryForm({ kind, scope, online, categories = [], shiftId, close, saved }: {
  kind: Kind; scope: Scope; online: boolean; categories?: string[]; shiftId?: string; close: () => void; saved: () => void;
}) {
  const theme = useTheme();
  const [error, setError] = useState('');
  const [customerFields,setCustomerFields]=useState<CustomerFields|null>(null);
  useEffect(()=>{
    if(kind!=='customer'||!online)return;
    let active=true;const controller=new AbortController();
    const load=()=>api<CustomerFields>('customer-fields',scope,undefined,controller.signal).then(value=>{if(active)setCustomerFields(value);}).catch(e=>{if(active)setError(e.message);});
    void load();const listener=AppState.addEventListener('change',state=>{if(state==='active')void load();});
    return()=>{active=false;controller.abort();listener.remove();};
  },[kind,online,scope]);

  const [values, setValues] = useState<Record<string, string>>(() => {
    const date = new Date();
    return { id: Crypto.randomUUID(), expenseDate: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`, reason: reasons[0], category: categories[0] ?? '' };
  });
  const [image, setImage] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [picker, setPicker] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [attempted, setAttempted] = useState(false);
  const working = useRef(false);
  const title = kind === 'customer' ? 'Quick Add customer' : kind === 'expense' ? 'Add expense' : kind === 'support' ? 'Report a bug' : kind === 'register-open' ? 'Open register' : 'Close register';
  const fields = kind === 'customer' ? [['name', 'Name *'], ['phone', 'Phone *'], ['address', 'Address *'], ...(customerFields?.emailEnabled?[['email','Email']]:[]), ...(customerFields?.birthdayEnabled?[['birthday','Birthday (YYYY-MM-DD)']]:[])]
    : kind === 'expense' ? [['description', 'Description *'], ['amount', 'Amount *'], ['expenseDate', 'Date (YYYY-MM-DD) *'], ['payee', 'Paid to']]
    : kind === 'support' ? [['title', 'Title *'], ['description', 'Details']]
    : [[kind === 'register-open' ? 'openingCash' : 'closingCash', kind === 'register-open' ? 'Opening cash *' : 'Counted closing cash *'], ['note', 'Note']];
  async function pick(camera: boolean) {
    try {
      if (camera) {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) { setError('Camera permission is required to take a photo.'); return; }
      }
      const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.8, allowsMultipleSelection: false };
      const result = camera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
      if (!result.canceled) {
        const asset = result.assets[0];
        if ((asset.fileSize ?? 0) > 5 * 1024 * 1024) { setError('Choose an image smaller than 5 MB.'); return; }
        if (asset.mimeType && !['image/jpeg', 'image/png', 'image/webp'].includes(asset.mimeType)) { setError('Choose a JPG, PNG or WebP image.'); return; }
        setImage(asset); setError('');
      }
    } catch (error) { setError((error as Error).message); }
  }
  async function submit() {
    if (working.current || !online || kind==='customer'&&!customerFields) return;
    working.current = true; setBusy(true); setError(''); setProgress(null);
    try {
      if (kind === 'support' && !image) throw new Error('Add an image of the issue.');
      if (kind === 'customer' && ['name', 'phone', 'address'].some(key => !values[key]?.trim())) throw new Error('Name, phone and address are required.');
      setAttempted(true);
      if (kind === 'expense' || kind === 'support') {
        const form = new FormData();
        for (const [key, value] of Object.entries(values)) form.append(key, value);
        if (image) {
          const attachment = { uri: image.uri, name: image.fileName ?? 'photo.jpg', type: image.mimeType ?? 'image/jpeg' };
          // React Native's native FormData accepts a file URI rather than a web Blob.
          form.append(kind === 'expense' ? 'receipt' : 'image', attachment as unknown as Blob);
        }
        await api(kind === 'expense' ? 'expenses' : 'support', scope, form, undefined, image ? setProgress : undefined);
      } else if (kind === 'customer') await api('customers', scope, values);
      else await api('register', scope, { ...values, action: kind === 'register-open' ? 'open' : 'close', shiftId });
      saved();
    } catch (error) { setError(`${(error as Error).message}${kind === 'customer' ? ' Retry this form to reuse the same customer request.' : ' If the connection dropped, check the list before submitting again.'}`); }
    finally { working.current = false; setBusy(false); }
  }
  function leave() {
    if (busy) return;
    if (attempted && error) theme.alert('Check the saved records', 'The last request may have reached the server. Check the list before creating another record.', [{ text: 'Stay', style: 'cancel' }, { text: 'Check list', onPress: close }]);
    else close();
  }
  return <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={leave}><ActionArea><SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled"><Label large>{title}</Label>
      <Card><SectionTitle title={kind==='customer'?'Contact information':kind==='expense'?'Expense information':kind==='support'?'Tell us what happened':'Cash count'} icon={kind==='customer'?'person-outline':kind==='expense'?'wallet-outline':kind==='support'?'help-buoy-outline':'cash-outline'}/>{fields.map(([key, label]) => <Field key={key} label={label} value={values[key] ?? ''} editable={!busy} onChangeText={value => setValues(previous => ({ ...previous, [key]: value }))}
        keyboardType={['amount', 'openingCash', 'closingCash'].includes(key) ? 'decimal-pad' : key === 'phone' ? 'phone-pad' : key === 'email' ? 'email-address' : 'default'}
        autoCapitalize={key === 'email' ? 'none' : 'sentences'} multiline={['description', 'address', 'note'].includes(key)} maxLength={key === 'description' ? 2000 : 500} />)}
        {kind === 'expense' && <Button title={`Category · ${values.category}`} secondary disabled={busy} onPress={() => setPicker('category')} />}
        {kind === 'support' && <Button title={`Reason · ${values.reason}`} secondary disabled={busy} onPress={() => setPicker('reason')} />}
      </Card>
      {['expense', 'support'].includes(kind) && <Card><SectionTitle title={kind === 'support' ? 'Image *' : 'Receipt photo'} icon="image-outline"/>
        {image && <Image source={{ uri: image.uri }} style={{ height: 180, borderRadius: 12 }} resizeMode="contain" />}
        <View style={styles.row}><View style={{ flex: 1 }}><Button title="Choose image" secondary disabled={busy} onPress={() => void pick(false)} /></View><View style={{ flex: 1 }}><Button title="Take photo" secondary disabled={busy} onPress={() => void pick(true)} /></View></View>
      </Card>}
      {error && <Card><Label>{error}</Label></Card>}
      {busy && image && <UploadProgress progress={progress} />}
      <Button title="Save" busy={busy} disabled={!online||kind==='customer'&&!customerFields} onPress={() => theme.alert(title, 'Save these details?', [{ text: 'Cancel', style: 'cancel' }, { text: 'Save', onPress: () => void submit() }])} />
      <Button title="Cancel" secondary disabled={busy} onPress={leave} />
    </ScrollView>
    <Modal visible={!!picker} transparent animationType="fade" onRequestClose={() => setPicker(null)}><View style={{ flex: 1, backgroundColor: '#0008', justifyContent: 'center', padding: 24 }}><Pressable accessibilityRole="button" accessibilityLabel="Close selector" onPress={()=>setPicker(null)} style={{position:'absolute',inset:0}}/><View style={{ maxHeight: '80%', borderRadius: 20, backgroundColor: theme.panel }}><ScrollView contentContainerStyle={styles.page}>
      {(picker === 'reason' ? reasons : categories).map(value => <Button key={value} title={value} secondary onPress={() => { if (picker) setValues(previous => ({ ...previous, [picker]: value })); setPicker(null); }} />)}<Button title="Cancel" secondary onPress={() => setPicker(null)} />
    </ScrollView></View></View></Modal>
  </SafeAreaView></ActionArea></Modal>;
}
