import React, { useEffect, useRef, useState } from 'react';
import { AppState, Modal, ScrollView, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAudioPlayer } from 'expo-audio';
import { deviceStorage } from './client';
import { Button, Card, Label, styles, useTheme } from './ui';

export function IncomingAlerts({ ids, scopeKey, visible, close, receiveAll, saveScope, disabled }: { ids?: string[]; scopeKey: string; visible: boolean; close: () => void; receiveAll: boolean; saveScope: (value: boolean) => void; disabled: boolean }) {
  const theme = useTheme();
  const player = useAudioPlayer(require('../assets/incoming-order.wav'));
  const [sound, setSound] = useState(false), [ready, setReady] = useState(false), [saving, setSaving] = useState(false);
  const seen = useRef<Set<string> | null>(null);
  const key = `tenh-incoming-sound-${scopeKey}`;
  useEffect(() => {
    let active = true;
    deviceStorage.getItem(key).then(value => { if (active) { setSound(value !== 'off'); setReady(true); } }).catch(() => { if(active)setReady(true); });
    return () => { active = false; };
  }, [key]);
  useEffect(() => {
    if (!ids) return;
    const fresh = seen.current !== null && ids.some(id => !seen.current!.has(id));
    if (!seen.current) seen.current = new Set();
    ids.forEach(id => seen.current!.add(id));
    if (fresh && ready && sound && AppState.currentState === 'active') void player.seekTo(0).then(() => player.play()).catch(() => undefined);
  }, [ids, ready, sound, player]);
  async function toggle(value: boolean) {
    if (saving) return;
    setSaving(true);
    try { await deviceStorage.setItem(key, value ? 'on' : 'off'); setSound(value); }
    catch { theme.alert('Unable to save sound preference', 'Please try again.'); }
    finally { setSaving(false); }
  }
  return <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}><SafeAreaView style={{flex:1,backgroundColor:theme.background}}><ScrollView contentContainerStyle={styles.page}>
    <Label large>Incoming order alerts</Label>
    <Card><View style={[styles.row,{justifyContent:'space-between'}]}><Label>Sound alert</Label><Switch accessibilityLabel="Incoming order sound" value={sound} disabled={!ready||saving} onValueChange={value=>void toggle(value)}/></View><Label muted>Plays once for new orders while this screen is open. Uses your phone volume and silent-mode setting.</Label><Button title="Test sound" secondary disabled={!ready} onPress={()=>void player.seekTo(0).then(()=>player.play()).catch(()=>theme.alert('Sound unavailable','Check your phone volume and try again.'))}/></Card>
    <Card><View style={[styles.row,{justifyContent:'space-between'}]}><View style={{flex:1}}><Label>Receive from all branches</Label></View><Switch accessibilityLabel="Receive orders from all branches" value={receiveAll} disabled={disabled} onValueChange={saveScope}/></View></Card>
    <Button title="Close" secondary onPress={close}/>
  </ScrollView></SafeAreaView></Modal>;
}
