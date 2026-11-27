import { ScrollView, Text, Pressable, StyleSheet } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ReactNode } from 'react';
export function Page({title,subtitle,children}:{title:string;subtitle?:string;children:ReactNode}) {
  return <SafeAreaView edges={['top','left','right']} style={styles.screen}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
    <Animated.View entering={FadeIn.duration(180)} style={{gap:12}}><Text style={styles.h1}>{title}</Text>{subtitle&&<Text style={styles.muted}>{subtitle}</Text>}{children}</Animated.View>
  </ScrollView></SafeAreaView>;
}
export function Button({title,onPress,secondary,disabled}:{title:string;onPress:()=>void;secondary?:boolean;disabled?:boolean}) {
  return <Pressable accessibilityRole="button" accessibilityState={{disabled:!!disabled}} disabled={disabled} onPress={onPress} style={({pressed})=>[styles.button,secondary&&styles.secondary,{opacity:disabled ? 0.5 : pressed ? 0.72 : 1}]}><Text style={secondary?styles.secondaryText:styles.buttonText}>{title}</Text></Pressable>;
}
export const styles=StyleSheet.create({
  screen:{flex:1,backgroundColor:'#f5f8fa'},content:{padding:20,paddingBottom:44},h1:{fontSize:33,fontWeight:'800',color:'#162840',letterSpacing:-1},h2:{fontSize:20,fontWeight:'700',color:'#162840'},
  muted:{color:'#506477',fontSize:14,lineHeight:21},copy:{color:'#263b50',fontSize:15,lineHeight:22},error:{color:'#962f40',backgroundColor:'#fff0f1',padding:9,borderRadius:8},
  card:{padding:16,borderRadius:15,borderColor:'#e0e9ee',borderWidth:1,backgroundColor:'#fff',gap:10},input:{borderWidth:1,borderColor:'#d5e4e9',borderRadius:9,padding:11,backgroundColor:'#fff',color:'#14283e'},
  button:{alignItems:'center',justifyContent:'center',backgroundColor:'#08785e',padding:12,minHeight:45,borderRadius:10},secondary:{backgroundColor:'#e6f4ee'},buttonText:{color:'#fff',fontWeight:'700'},secondaryText:{color:'#145d4c',fontWeight:'700'},
});
