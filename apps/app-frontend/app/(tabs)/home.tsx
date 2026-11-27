import { useCallback,useState } from 'react';
import { Text,View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSession } from '../../components/session';
import { Page,Button,styles } from '../../components/ui';
import type { RecordRow } from '@pharmalert/shared';
import type { Analysis } from '@pharmalert/interaction-engine';
export default function Home(){
  const {session,api}=useSession();
  const router=useRouter();
  const [data,setData]=useState<Record<string,RecordRow[]>>({}),[error,setError]=useState('');
  useFocusEffect(useCallback(()=>{let live=true; setError('');void Promise.all(['medicines','reminders','interaction_checks','prescriptions'].map(async key=>[key,await api.list(key)] as const)).then(rows=>{if(live)setData(Object.fromEntries(rows));}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[api]));
  const reports=data.interaction_checks?.map(row=>row.report as Analysis);
  const activity=Array.from({length:7},(_,i)=>{const day=new Date();day.setDate(day.getDate()+i-6);return {day:day.toLocaleDateString(undefined,{weekday:'short'}),total:data.interaction_checks?.filter(row=>new Date(row.created_at).toDateString()===day.toDateString()).length??0};});
  const max=Math.max(1,...activity.map(item=>item.total));
  return <Page title={'Welcome, '+(session?.user.name.split(' ')[0]??'')} subtitle={new Date().toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'})}>
    <View style={[styles.card,{backgroundColor:'#09463e'}]}><Text style={[styles.h2,{color:'#fff'}]}>Check for medication interactions</Text><Text style={[styles.muted,{color:'#daf1e7'}]}>Look up a combination against sourced interaction evidence.</Text><Button title="Check interactions" onPress={()=>router.push('/checker')}/></View>
    {!!error&&<Text style={styles.error}>{error}</Text>}<View style={styles.card}><Text style={styles.h2}>At a glance</Text>{[['Medicines',data.medicines?.length],['Reminders',data.reminders?.length],['Checks',reports?.length],['Potential interactions',reports?.reduce((total,r)=>total+r.matchCount,0)],['Prescriptions',data.prescriptions?.length]].map(([label,value])=><Text key={label} style={styles.copy}>{label} · {value??'—'}</Text>)}</View>
    {reports&&<View style={styles.card}><Text style={styles.h2}>Check activity</Text><View style={{flexDirection:'row',alignItems:'flex-end',gap:6}}>{activity.map(item=><View accessibilityLabel={item.day+', '+item.total+' checks'} key={item.day} style={{flex:1,alignItems:'center'}}><View style={{height:Math.max(3,item.total/max*70),width:'65%',backgroundColor:'#1e9b77',borderRadius:4}}/><Text style={styles.muted}>{item.day}</Text></View>)}</View></View>}
  </Page>;
}
