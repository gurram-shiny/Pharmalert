import {signOutOnDevice} from '../../../../packages/data-services/sign-out';
import { useCallback,useState } from 'react';
import { Text,TextInput,View,Alert } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Records,shareReport } from '../../components/records';
import { Page,Button,styles } from '../../components/ui';
import { useSession } from '../../components/session';
import { formatDate,sections,type RecordRow,type Section } from '@pharmalert/shared';
import { type Analysis,type Substance } from '@pharmalert/interaction-engine';
import { Evidence } from './checker';
const names=['supplements','alcohol_entries','reminders','prescriptions','health_records','history','account'] as const;
export default function Workspace(){
  const {api,session,remember}=useSession();const [selected,setSelected]=useState<(typeof names)[number]>('supplements');
  const [rows,setRows]=useState<RecordRow[]>([]),[report,setReport]=useState<Analysis|null>(null),[error,setError]=useState(''),[name,setName]=useState(session?.user.name??''),[query,setQuery]=useState('');
  const load=useCallback(async()=>{if(selected==='history')setRows(await api.list('interaction_checks'));},[api,selected]);
  useFocusEffect(useCallback(()=>{void load().catch(e=>setError(e.message));},[load]));
  const run=async(action:()=>Promise<unknown>)=>{setError('');try{await action();}catch(e){setError((e as Error).message);}};
  return <Page title="Records"><View style={{flexDirection:'row',flexWrap:'wrap',gap:6}}>{names.map(key=><Button key={key} title={key==='history'?'Check history':key==='account'?'Account':sections[key].title} secondary={key!==selected} onPress={()=>{setSelected(key);setReport(null);setError('');}}/>)}</View>
    {!!error&&<Text style={styles.error}>{error}</Text>}
    {selected==='history'?<><TextInput style={styles.input} accessibilityLabel="Search history" placeholder="Search history" value={query} onChangeText={setQuery}/>{rows.filter(row=>JSON.stringify(row.inputs).toLowerCase().includes(query.toLowerCase())).map(row=><View style={styles.card} key={row.id}><Text style={styles.copy}>{(row.inputs as Substance[]).map(item=>item.name).join(' + ')}</Text><Text style={styles.muted}>{formatDate(row.created_at)} · {(row.report as Analysis).highest}</Text><Button title="View report" secondary onPress={()=>setReport(row.report as Analysis)}/><Button title="Delete" secondary onPress={()=>Alert.alert('Delete this check?','',[{text:'Cancel'},{text:'Delete',style:'destructive',onPress:()=>void run(async()=>{await api.remove('interaction_checks',row.id);setReport(null);await load();})}])}/></View>)}
    <Button title="Share history CSV" secondary onPress={()=>void run(()=>shareReport('Check history',rows,false))}/><Button title="Share history PDF" secondary onPress={()=>void run(()=>shareReport('Check history',rows,true))}/>{report&&<Evidence report={report}/>}</>:selected==='account'?<View style={styles.card}><Text style={styles.copy}>{session?.user.email}</Text><TextInput style={styles.input} accessibilityLabel="Display name" value={name} onChangeText={setName}/><Button title="Save profile" onPress={()=>void run(async()=>{if(session)await remember({...session,user:await api.profile(name)});})}/><Button title="Sign out" secondary onPress={()=>void run(async()=>{await signOutOnDevice(api.logout,()=>remember(null));})}/></View>:<Records key={selected} section={selected as Section}/>}
  </Page>;
}
