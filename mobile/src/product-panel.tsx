import React from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Label, styles, useTheme } from './ui';

export function ProductPanel({ visible, title, close, children,fullScreen=false }: { visible: boolean; title: string; close: () => void; children: React.ReactNode;fullScreen?:boolean }) {
  const theme = useTheme();
  return <Modal visible={visible} transparent={!fullScreen} animationType={fullScreen?'slide':'fade'} presentationStyle={fullScreen?'pageSheet':'overFullScreen'} onRequestClose={close}>
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: '#0008' }}>
      {!fullScreen&&<Pressable accessibilityRole="button" accessibilityLabel="Close product selection" style={{ flex: 1 }} onPress={close}/>}
      <SafeAreaView style={{ width: fullScreen?'100%':'90%', maxWidth: fullScreen?undefined:440, backgroundColor: theme.background }}>
        <View style={[styles.row, { padding: 16, borderBottomWidth: 1, borderColor: theme.border }]}><View style={{ flex: 1 }}><Label large>{title}</Label></View><Button title="Close" secondary onPress={close}/></View>
        <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">{children}</ScrollView>
      </SafeAreaView>
    </View>
  </Modal>;
}
