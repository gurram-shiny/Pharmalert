import { Tabs,Redirect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSession } from '../../components/session';
const tabs=[['home','Overview','grid-outline'],['checker','Check','shield-checkmark-outline'],['medications','Medicines','medkit-outline'],['workspace','Records','folder-outline']] as const;
export default function Layout(){
  const {session,loading}=useSession();
  if(loading)return null;
  if(!session)return <Redirect href="/"/>;
  return <Tabs screenOptions={{headerShown:false,tabBarActiveTintColor:'#08785e',tabBarInactiveTintColor:'#536778'}}>{tabs.map(([name,title,icon])=><Tabs.Screen key={name} name={name} options={{title,tabBarIcon:({color,size})=><Ionicons name={icon} color={typeof color==='string'?color:undefined} size={size}/>}}/>)}</Tabs>;
}
