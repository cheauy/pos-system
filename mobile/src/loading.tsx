import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Animated, AppState, Easing, Text, View } from 'react-native';
import { useTheme } from './ui';
export function LaunchLoader() {
  const theme = useTheme();
  const [phase] = useState(() => new Animated.Value(0));
  const [reduceMotion, setReduceMotion] = useState(true);
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (active) setReduceMotion(value); }).catch(() => undefined);
    const listener = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => { active = false; listener.remove(); };
  }, []);
  useEffect(() => {
    if (reduceMotion) return;
    const animation = Animated.loop(Animated.timing(phase, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.quad), useNativeDriver: true, isInteraction: false }));
    const start = () => { phase.setValue(0); animation.start(); };
    if (AppState.currentState === 'active') start();
    const listener = AppState.addEventListener('change', state => { if (state === 'active') start(); else animation.stop(); });
    return () => { animation.stop(); listener.remove(); };
  }, [phase, reduceMotion]);
  return <View accessibilityRole="progressbar" accessibilityLabel="TENH POS is loading" style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.background }}>
    <Animated.Image source={require('../assets/tenh-pos-loader-transparent.png')} resizeMode="contain" accessible={false} style={{
      width: 150, height: 150,
      opacity: reduceMotion ? 1 : phase.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.75, 1, 0.75] }),
      transform: [{ scale: reduceMotion ? 1 : phase.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.94, 1.03, 0.94] }) }],
    }}/>
  </View>;
}

export function Shimmer({ rows = 4 }: { rows?: number }) {
  const theme = useTheme();
  const [phase] = useState(() => new Animated.Value(0));
  const [reduceMotion, setReduceMotion] = useState(true);
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (active) setReduceMotion(value); }).catch(() => undefined);
    const listener = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => { active = false; listener.remove(); };
  }, []);
  useEffect(() => {
    if (reduceMotion) return;
    const animation = Animated.loop(Animated.timing(phase, { toValue: 1, duration: 1300, easing: Easing.linear, useNativeDriver: true, isInteraction: false }));
    const start = () => { phase.setValue(0); animation.start(); };
    if (AppState.currentState === 'active') start();
    const listener = AppState.addEventListener('change', state => { if (state === 'active') start(); else animation.stop(); });
    return () => { animation.stop(); listener.remove(); };
  }, [phase, reduceMotion]);
  const block = theme.dark ? '#29384e' : '#e9eef5';
  return <View accessibilityRole="progressbar" accessibilityLabel="Loading content" style={{ gap: 12 }}>
    {Array.from({ length: rows }, (_, i) => <View key={i} style={{ overflow: 'hidden', borderRadius: 18, backgroundColor: theme.panel, padding: 18, flexDirection: 'row', gap: 14 }}>
      <View style={{ width: 58, height: 64, borderRadius: 12, backgroundColor: block }} />
      <View style={{ flex: 1, gap: 10, justifyContent: 'center' }}>{[85, 60, 35].map(width => <View key={width} style={{ width: `${width}%`, height: 12, borderRadius: 6, backgroundColor: block }} />)}</View>
      {!reduceMotion && <Animated.View pointerEvents="none" style={{ position: 'absolute', top: 0, bottom: 0, width: 90, backgroundColor: theme.dark ? '#ffffff06' : '#ffffff55', transform: [{ translateX: phase.interpolate({ inputRange: [0, 1], outputRange: [-100, 760] }) }, { skewX: '-18deg' }] }} />}
    </View>)}
  </View>;
}

export function LoadingState({ label = 'Updating…' }: { label?: string }) {
  const theme = useTheme();
  return <View accessibilityRole="progressbar" accessibilityLabel={theme.t(label)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 12, gap: 9 }}><ActivityIndicator color={theme.dark ? '#91b4ff' : '#275de8'} /><Text style={{ fontSize: 13, color: theme.muted }}>{theme.t(label)}</Text></View>;
}

export function UploadProgress({ progress }: { progress: number | null }) {
  const theme = useTheme();
  if (progress === null || progress >= 1) return <LoadingState label={progress === null ? 'Preparing upload…' : 'Upload sent. Saving…'} />;
  const percent = Math.round(Math.max(0, Math.min(1, progress)) * 100);
  return <View accessibilityRole="progressbar" accessibilityLabel="Uploading image" accessibilityValue={{ min: 0, max: 100, now: percent }} style={{ gap: 8 }}>
    <Text style={{ color: theme.muted, fontSize: 13 }}>{`Uploading image · ${percent}%`}</Text>
    <View style={{ height: 6, borderRadius: 3, backgroundColor: theme.border, overflow: 'hidden' }}><View style={{ width: `${percent}%`, height: 6, backgroundColor: '#275de8' }} /></View>
  </View>;
}
