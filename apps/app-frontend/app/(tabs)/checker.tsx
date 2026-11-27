import { CatalogInput } from '../../components/catalog-input';
import { useState } from 'react';
import { Text,View,Linking } from 'react-native';
import { Page,Button,styles } from '../../components/ui';
import { useSession } from '../../components/session';
import { evidenceMessages,type Analysis,type Kind,type Substance } from '@pharmalert/interaction-engine';
import { disclaimer } from '@pharmalert/shared';
const kinds:Kind[]=['medicine','supplement','alcohol','food'];
export function Evidence({report}:{report:Analysis}) {
  return <View style={styles.card}><Text style={styles.h2}>Interaction report</Text><Text selectable style={styles.muted}>{report.dataset.name} · {report.dataset.version} · {report.dataset.license}</Text>
    {!!report.duplicates.length&&<Text style={styles.copy}>Duplicate entries merged: {report.duplicates.join(', ')}</Text>}
    {report.pairs.map((pair,i)=><View key={i} style={styles.card}><Text style={styles.h2}>{pair.left} + {pair.right}</Text>{pair.status==='matched'?pair.matches.map(rule=><View key={rule.rule_id} style={{gap:6}}>
      <Text style={rule.display==='contraindicated'?styles.error:styles.copy}>{rule.classification}</Text><Text style={styles.copy}>{rule.description}</Text><Text style={styles.copy}>{rule.management}</Text>
      <Button title={'Source label · '+rule.updated_on} secondary onPress={()=>void Linking.openURL(rule.evidence)}/>
    </View>):<Text style={styles.muted}>{evidenceMessages[pair.status as keyof typeof evidenceMessages]}</Text>}</View>)}
    <Text style={styles.muted}>{disclaimer}</Text></View>;
}
export default function Checker(){
  const {api}=useSession();
  const [items,setItems]=useState<Substance[]>([{name:'',kind:'medicine'},{name:'',kind:'medicine'}]),[result,setResult]=useState<Analysis|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const change=(index:number,patch:Partial<Substance>)=>{setResult(null);setItems(items.map((item,i)=>i===index?{...item,...patch}:item));};
  return <Page title="Interaction checker" subtitle={disclaimer}>{items.map((item,i)=><View style={styles.card} key={i}>
    <Text style={styles.h2}>Substance {i+1}</Text>
    <View style={{flexDirection:'row',flexWrap:'wrap',gap:6}}>{kinds.map(kind=><Button key={kind} title={kind.charAt(0).toUpperCase()+kind.slice(1)} secondary={kind!==item.kind} disabled={busy} onPress={()=>{if(kind!==item.kind)change(i,{kind,name:kind==='alcohol'?'Alcohol':''});}}/>)}</View>
    {item.kind!=='alcohol'?<CatalogInput kind={item.kind} label={'Substance '+(i+1)} disabled={busy} value={item.name} onChange={name=>change(i,{name})}/>:null}
    {items.length>2&&<Button disabled={busy} secondary title="Remove substance" onPress={()=>{setItems(items.filter((_,index)=>index!==i));setResult(null);}}/>}
  </View>)}
  <Button title="Add substance" secondary disabled={busy||items.length===20} onPress={()=>{setItems([...items,{name:'',kind:'medicine'}]);setResult(null);}}/>
  <Button title={busy?'Checking…':'Check interactions'} disabled={busy} onPress={async()=>{setBusy(true);setResult(null);setError('');try{setResult(await api.check(items));}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}/>
  {!!error&&<Text style={styles.error}>{error}</Text>}{result&&<Evidence report={result}/>}</Page>;
}
