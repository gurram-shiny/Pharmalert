import {useId,useState} from 'react';
import {catalogStatus,suggestions,type CatalogKind} from '../../../datasets/catalog/search';
export function CatalogInput({kind,value,initial='',onChange,name,disabled,required,saved=[]}:{kind:CatalogKind;value?:string;initial?:string;onChange?:(s:string)=>void;name?:string;disabled?:boolean;required?:boolean;saved?:string[]}){
  const id=useId();
  const [draft,setDraft]=useState(initial);
  const text=value??draft;
  const options=[...new Set([...suggestions(kind,text),...saved.filter(n=>n.toLowerCase().includes(text.toLowerCase()))])].slice(0,16);
  const placeholder=kind==='medicine'?'Search brand or ingredient':kind==='supplement'?'Search supplement labels':'Select Grapefruit juice or Caffeine';
  const caption=kind==='food'?catalogStatus('food',text):'US catalog · '+(catalogStatus(kind,text)||'Includes historical records');
  return <><input name={name} value={text} list={id} required={required} disabled={disabled} placeholder={placeholder} onChange={e=>{setDraft(e.target.value);onChange?.(e.target.value);}}/><datalist id={id}>{options.map(n=><option key={n} value={n} label={[n,catalogStatus(kind,n)].filter(Boolean).join(" · ")}/>)}</datalist><small>{caption}</small></>;
}
