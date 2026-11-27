import {CatalogInput} from './catalog-input';
import { useCallback,useState } from 'react';
import { Text, View, TextInput, Alert } from 'react-native';
import { useFocusEffect } from 'expo-router';
import * as Picker from 'expo-document-picker';
import { File,Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { formatDate,sections,type RecordRow,type Section } from '@pharmalert/shared';
import { recordValues,reportHtml,toCsv } from '@pharmalert/data-services';
import { useSession } from './session';
import { Button,styles } from './ui';
import { clearDoseAlerts,scheduleDoseAlerts } from './reminder-notifications';
import { HealthTrends } from './health-trends';

export async function shareReport(title:string,rows:Record<string,unknown>[],pdf:boolean) {
  if(pdf){const result=await Print.printToFileAsync({html:reportHtml(title,rows)});await Sharing.shareAsync(result.uri,{mimeType:'application/pdf'});return;}
  const file=new File(Paths.cache,title.replace(/[^a-z0-9]+/gi,'-')+'.csv');
  file.create({overwrite:true});file.write(toCsv(rows));await Sharing.shareAsync(file.uri,{mimeType:'text/csv'});
}
export function Records({section}:{section:Section}) {
  const {api}=useSession();
  const [rows,setRows]=useState<RecordRow[]>([]),[medicines,setMedicines]=useState<RecordRow[]>([]),[logs,setLogs]=useState<RecordRow[]>([]);
  const [form,setForm]=useState<Record<string,string>|null>(null),[id,setId]=useState<string>(),[asset,setAsset]=useState<Picker.DocumentPickerAsset|null>(null);
  const [search,setSearch]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const [alertStatus,setAlertStatus]=useState('');
  const definition=sections[section];
  const refresh=useCallback(async()=>{setRows(await api.list(section));if(section==='reminders'){setMedicines(await api.list('medicines'));setLogs(await api.list('reminder_logs'));}},[api,section]);
  useFocusEffect(useCallback(()=>{void refresh().catch(e=>setError(e.message));},[refresh]));
  async function run(action:()=>Promise<unknown>){setBusy(true);setError('');try{await action();await refresh();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  function edit(row?:RecordRow){setId(row?.id);setAsset(null);setForm(Object.fromEntries(definition.fields.map(field=>{
    const [key,,type]=field as readonly [string,string,string?];
    return [key,String(row?.[key]??(section==='alcohol_entries'&&key==='name'?'Alcohol':type?.startsWith('choice:')?type.slice(7).split(',')[0]:''))];
  })));}
  return <View style={{gap:10}}><Button title="Add record" onPress={()=>edit()} disabled={busy}/>{!!error&&<Text style={styles.error}>{error}</Text>}{form&&<View style={styles.card}>
    <Text style={styles.h2}>{id?'Edit record':'New record'}</Text>{definition.fields.map(field=>{const [key,title,type]=field as readonly [string,string,string?];
      const options=type==='medicine'?medicines.map(row=>[row.id,String(row.name)]):type?.startsWith('choice:')?type.slice(7).split(',').map(value=>[value,value]):null;
      return <View key={key} style={{gap:5}}><Text style={styles.copy}>{title}</Text>{options?options.map(([value,name])=><Button key={value} title={(form[key]===value?'✓ ':'')+name} secondary={form[key]!==value} onPress={()=>setForm({...form,[key]:value})}/>):key==='name'&&(section==='medicines'||section==='supplements')?<CatalogInput kind={section==='medicines'?'medicine':'supplement'} label={title} value={form[key]} onChange={name=>setForm({...form,[key]:name})}/>:<TextInput style={styles.input} accessibilityLabel={title} placeholder={type==='date'?'YYYY-MM-DD':type==='datetime-local'?'YYYY-MM-DDTHH:mm':title} value={form[key]} onChangeText={value=>setForm({...form,[key]:value})}/>}</View>;
    })}
    {section==='prescriptions'&&!id&&<Button title={asset?.name??'Choose file'} secondary onPress={async()=>{try{const picked=await Picker.getDocumentAsync({type:['application/pdf','image/png','image/jpeg']});if(!picked.canceled)setAsset(picked.assets[0]);}catch(e){setError((e as Error).message);}}}/>}
    <Button title="Save record" disabled={busy} onPress={()=>void run(async()=>{const values=recordValues(form,definition.fields.filter(field=>field[2]==='datetime-local').map(([key])=>key));
      if(section==='prescriptions'&&!id){if(!asset||!asset.mimeType||(asset.size??0)>10485760)throw new Error('Choose a PDF, PNG or JPEG up to 10 MB.');Object.assign(values,{file:await new File(asset.uri).base64(),mime:asset.mimeType});}
      await api.save(section,values,id);setForm(null);
    })}/><Button title="Cancel" secondary onPress={()=>setForm(null)}/></View>}
    <TextInput style={styles.input} accessibilityLabel="Search records" placeholder="Search records" value={search} onChangeText={setSearch}/>
    {rows.filter(row=>JSON.stringify(row).toLowerCase().includes(search.toLowerCase())).map(row=><View style={styles.card} key={row.id}>
      {definition.fields.filter(([key])=>row[key]!=null).map(field=><Text key={field[0]} style={styles.copy}>{field[1]} · {field[2]==='datetime-local'?formatDate(row[field[0]]):field[2]==='medicine'?String(medicines.find(medicine=>medicine.id===row.medicine_id)?.name??'—'):String(row[field[0]])}</Text>)}
      <Button title="Edit" secondary disabled={busy} onPress={()=>edit(row)}/>
      {section==='reminders'&&['taken','skipped'].map(outcome=><Button key={outcome} title={'Mark '+outcome} secondary disabled={busy} onPress={()=>void run(()=>api.dose(row,outcome))}/>)}
      {section==='prescriptions'&&<Button title="Download prescription" secondary onPress={()=>void run(async()=>{const response=await api.file(row.id);const mime=response.headers.get('content-type')??'application/octet-stream';const ext=mime==='application/pdf'?'pdf':mime==='image/png'?'png':'jpg';const file=new File(Paths.cache,'prescription-'+row.id+'.'+ext);file.create({overwrite:true});try{file.write(new Uint8Array(await response.arrayBuffer()));await Sharing.shareAsync(file.uri,{mimeType:mime});}finally{file.delete();}})}/>}
      <Button title="Delete" secondary disabled={busy} onPress={()=>Alert.alert('Delete this record?','',[{text:'Cancel'},{text:'Delete',style:'destructive',onPress:()=>void run(()=>api.remove(section,row.id))}])}/>
    </View>)}
    {!rows.length&&<Text style={styles.muted}>No records yet.</Text>}
    {section==='health_records'&&<HealthTrends rows={rows}/>}
    <Button title="Share CSV" secondary onPress={()=>void run(()=>shareReport(definition.title,rows,false))}/><Button title="Share PDF" secondary onPress={()=>void run(()=>shareReport(definition.title,rows,true))}/>
    {section==='reminders'&&<View style={styles.card}><Text style={styles.h2}>Device alerts</Text><Text style={styles.muted}>Sync upcoming doses after changes. Delivery depends on notification permission and device settings.</Text><Button title="Sync alerts on this device" secondary disabled={busy} onPress={()=>void run(async()=>setAlertStatus((await scheduleDoseAlerts(await api.list('reminders')))+' upcoming alerts scheduled.'))}/><Button title="Clear device alerts" secondary disabled={busy} onPress={()=>void run(async()=>{await clearDoseAlerts();setAlertStatus('Device alerts cleared.');})}/>{!!alertStatus&&<Text style={styles.copy}>{alertStatus}</Text>}<Text style={styles.h2}>Dose history</Text>{logs.map(row=><Text key={row.id} style={styles.copy}>{String(row.outcome)} · {formatDate(row.scheduled_at)}</Text>)}<Button title="Share dose history CSV" secondary onPress={()=>void run(()=>shareReport('Dose history',logs,false))}/><Button title="Share dose history PDF" secondary onPress={()=>void run(()=>shareReport('Dose history',logs,true))}/></View>}
  </View>;
}
