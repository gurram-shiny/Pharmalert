import { createContext,useContext,useEffect,useMemo,useState,type ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { service,type Session } from '@pharmalert/data-services';
const devHost=Constants.expoConfig?.hostUri?.split(':')[0];
const base=process.env.EXPO_PUBLIC_BACKEND_URL ?? (devHost?`http://${devHost}:8787`:(Platform.OS==='android'?'http://10.0.2.2:8787':'http://127.0.0.1:8787'));
const key='pharmalert-session';
type Value={session:Session|null;loading:boolean;restoreError:string|null;api:ReturnType<typeof service>;remember:(value:Session|null)=>Promise<void>};
const Context=createContext<Value|null>(null);
export const useSession=()=>useContext(Context)!;
export function SessionProvider({children}:{children:ReactNode}) {
  const [session,setSession]=useState<Session|null>(null),[loading,setLoading]=useState(true),[restoreError,setRestoreError]=useState<string|null>(null);
  const api=useMemo(()=>service(base,session?.token),[session?.token]);
  useEffect(()=>{void (async()=>{try{const value=await AsyncStorage.getItem(key);if(value){const saved=JSON.parse(value) as Session;if(typeof saved.token!=='string'||!saved.user||typeof saved.user.name!=='string'||typeof saved.user.email!=='string')throw new Error('Saved sign-in data is invalid. Sign in again.');setSession(saved);}}catch(error){setRestoreError(error instanceof Error?error.message:'Could not restore saved sign-in data.');}finally{setLoading(false);}})();},[]);
  async function remember(value:Session|null){if(value)await AsyncStorage.setItem(key,JSON.stringify(value));else await AsyncStorage.removeItem(key);setSession(value);}
  return <Context.Provider value={{session,loading,restoreError,api,remember}}>{children}</Context.Provider>;
}
