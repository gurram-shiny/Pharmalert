import { Redirect } from 'expo-router';
import { useState } from 'react';
import { Text,TextInput,ActivityIndicator } from 'react-native';
import { useSession } from '../components/session';
import { Page,Button,styles } from '../components/ui';
export default function Account() {
  const {session,loading,restoreError,api,remember}=useSession();
  const [name,setName]=useState(''),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[error,setError]=useState(''),[register,setRegister]=useState(false),[busy,setBusy]=useState(false);
  if(loading)return <Page title="PharmAlert AI"><ActivityIndicator/></Page>;
  if(session)return <Redirect href="/home"/>;
  return <Page title="PharmAlert AI" subtitle="Your medication safety workspace">
    <Text style={styles.h2}>{register?'Create an account':'Sign in'}</Text>
    {register&&<TextInput style={styles.input} accessibilityLabel="Name" placeholder="Name" value={name} onChangeText={setName}/>}
    <TextInput style={styles.input} accessibilityLabel="Email" placeholder="Email" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail}/>
    <TextInput style={styles.input} accessibilityLabel="Password" placeholder="Password" secureTextEntry value={password} onChangeText={setPassword}/>
    <Button title={busy?'Please wait…':register?'Create account':'Sign in'} disabled={busy} onPress={async()=>{setBusy(true);setError('');try{await remember(await api.signIn(register?'register':'login',email,password,name));}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}/>
    <Button secondary title={register?'Sign in instead':'Create an account'} onPress={()=>setRegister(!register)}/>{!!restoreError&&<Text accessibilityLiveRegion="polite" style={styles.error}>{restoreError}</Text>}{!!error&&<Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text>}
  </Page>;
}
