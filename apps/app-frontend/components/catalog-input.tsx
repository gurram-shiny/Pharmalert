import {useEffect,useState} from 'react';
import {Text,TextInput,View} from 'react-native';
import {Button,styles} from './ui';
import {catalogStatus,suggestions,type CatalogKind} from '../../../datasets/catalog/search';
export function CatalogInput({kind,value,label,onChange,disabled}:{kind:CatalogKind;value:string;label:string;onChange:(s:string)=>void;disabled?:boolean}){
  const [open,setOpen]=useState(false);
  useEffect(()=>{setOpen(false);},[kind]);
  const placeholder=kind==='medicine'?'Search brand or ingredient':kind==='supplement'?'Search supplement labels':'Select Grapefruit juice or Caffeine';
  const caption=kind==='food'?catalogStatus('food',value):'US catalog · '+(catalogStatus(kind,value)||'Includes historical records');
  return <View style={{gap:4}}>
    <TextInput accessibilityLabel={label} placeholder={placeholder} style={styles.input} value={value} editable={!disabled} onFocus={()=>setOpen(true)} onChangeText={text=>{setOpen(text!==''||kind==='food');onChange(text);}}/>
    {open&&!disabled&&suggestions(kind,value).filter(name=>name!==value).map(name=><Button key={name} title={name+' · '+catalogStatus(kind,name)} secondary onPress={()=>{onChange(name);setOpen(false);}}/>)}
    <Text style={styles.muted}>{caption}</Text>
  </View>;
}
