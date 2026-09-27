import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Label, styles, useTheme } from './ui';

export function SelectMenu({label,value,options,change,disabled=false}:{label:string;value:string;options:{value:string;label:string}[];change:(value:string)=>void;disabled?:boolean}){
 const theme=useTheme(),[open,setOpen]=useState(false);
 return <><Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{expanded:open,disabled}} disabled={disabled} onPress={()=>setOpen(true)} style={[styles.row,{padding:12,borderWidth:1,borderColor:theme.border,borderRadius:12,justifyContent:'space-between'}]}><View style={{flex:1}}><Label>{options.find(option=>option.value===value)?.label||label}</Label></View><Ionicons name="chevron-down" size={18} color={theme.text}/></Pressable><Modal visible={open} transparent animationType="fade" onRequestClose={()=>setOpen(false)}><View style={{flex:1,justifyContent:'center',padding:24,backgroundColor:'#0008'}}><Pressable accessibilityRole="button" accessibilityLabel="Close selector" onPress={()=>setOpen(false)} style={{position:'absolute',inset:0}}/><View style={{maxHeight:'75%',backgroundColor:theme.panel,borderRadius:16,padding:12}}><ScrollView keyboardShouldPersistTaps="handled">{options.map(option=><Pressable key={option.value} accessibilityRole="button" accessibilityState={{selected:option.value===value}} onPress={()=>{change(option.value);setOpen(false);}} style={[styles.row,{padding:14,justifyContent:'space-between'}]}><Label>{option.label}</Label>{option.value===value&&<Ionicons name="checkmark" size={20} color="#5987ed"/>}</Pressable>)}</ScrollView></View></View></Modal></>;
}

export function ChoiceChip({title,selected,disabled,onPress}:{title:string;selected:boolean;disabled?:boolean;onPress:()=>void}){
 const theme=useTheme();
 return <Pressable accessibilityRole="button" accessibilityState={{selected,disabled}} disabled={disabled} onPress={onPress} style={{minHeight:44,paddingHorizontal:14,paddingVertical:10,borderRadius:11,borderWidth:1,borderColor:selected?'#275de8':theme.border,backgroundColor:selected?'#275de8':theme.panel,opacity:disabled?0.4:1}}><Text style={{fontSize:14,fontWeight:'600',color:selected?'#fff':theme.text,fontFamily:theme.language==='km'||/[\u1780-\u17ff]/.test(title)?'Hanuman_700Bold':undefined}}>{theme.t(title)}</Text></Pressable>;
}
export function LayoutPicker({value,change,choices=[['list-outline','Compact rows'],['grid-outline','Two-column grid'],['apps-outline','Three-column grid']]}:{value:number;change:(value:number)=>void;choices?:readonly (readonly [React.ComponentProps<typeof Ionicons>['name'],string])[]}){
 const theme=useTheme();
 return <View style={styles.row}>{choices.map(([icon,label],index)=><Pressable key={icon} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{selected:value===index+1}} onPress={()=>change(index+1)} style={{padding:12,borderRadius:10,backgroundColor:value===index+1?'#275de8':theme.panel}}><Ionicons name={icon} size={21} color={value===index+1?'#fff':theme.text}/></Pressable>)}</View>;
}
export function Pagination({page,total,size,loading,change}:{page:number;total:number;size:number;loading?:boolean;change:(page:number)=>void}){
 const theme=useTheme(),pages=Math.max(1,Math.ceil(total/size));
 return <View style={[styles.row,{justifyContent:'space-between',paddingVertical:12}]}><Pressable accessibilityRole="button" accessibilityLabel="Previous page" disabled={page<=1||loading} onPress={()=>change(page-1)} style={{padding:12,borderRadius:12,backgroundColor:theme.panel,opacity:page<=1||loading?0.35:1}}><Ionicons name="chevron-back" size={22} color={theme.text}/></Pressable><View style={{alignItems:'center'}}><Label>{`${page} / ${pages}`}</Label><Label muted>{total?`${Math.min((page-1)*size+1,total)}–${Math.min(page*size,total)} of ${total}`:'0 records'}</Label></View><Pressable accessibilityRole="button" accessibilityLabel="Next page" disabled={page>=pages||loading} onPress={()=>change(page+1)} style={{padding:12,borderRadius:12,backgroundColor:theme.panel,opacity:page>=pages||loading?0.35:1}}><Ionicons name="chevron-forward" size={22} color={theme.text}/></Pressable></View>;
}
