export const unresolved = 'Medicine identity could not be confirmed. Please verify the medicine name.';
export const noMatch = 'No matching interaction was found in the available dataset. This does not establish that the combination is safe.';
const allNames = [
  ['Zocor','Simvastatin','ZOCOR','simvastatin','zocor','SIMVASTATIN','ZoCoR','SimVastatin'],
  ['Gemfibrozil','GEMFIBROZIL','gemfibrozil','GemFibrozil','GEmfibrozil','gemFibrozil','GemfibroZil','GEMfibrozil'],
  ['Danazol','DANAZOL','danazol','DanaZol','DaNazol','danaZol','DanazoL','DANazol'],
  ['Cyclosporine','CYCLOSPORINE','cyclosporine','CycloSporine','CyClosporine','cycloSporine','CyclosporinE','CYCLOsporine'],
  ['Grapefruit juice','grapefruit-juice','GRAPEFRUIT JUICE','Grapefruit  juice','grapefruit juice','GRAPEFRUIT-JUICE','Grapefruit Juice','Grapefruit-juice'],
];
const extras = [
  ['Aspirin','Turmeric','Beer','Orange juice','Zocor XR'],
  ['Metformin','Iron','Wine','Grapefruit','Simvastatin 20 mg'],
  ['Warfarin','Magnesium','Cider','Apple juice','Gemfibrozill'],
  ['Ibuprofen','Vitamin C','Rum','Orange','Danazoll'],
  ['Amlodipine','Zinc','Vodka','Milk','Ciclosporin'],
  ['Atorvastatin','Melatonin','Whisky','Pomelo','Zocorr'],
  ['Lisinopril','Vitamin D','Gin','Tea','Simvastat'],
  ['Naproxen','Calcium','Brandy','Coffee','Grapefuit juice'],
];
const knownExtras=new Set(['Aspirin','Beer','Metformin','Iron','Wine','Warfarin','Magnesium','Ibuprofen','Amlodipine','Atorvastatin','Lisinopril','Vitamin D','Naproxen','Calcium','Alcohol']);
export function reportGroups(canonicalAlcohol=false){return extras.map((names,index)=>{
  const inputs = allNames.map((variants,id)=>({name:variants[index],kind:id===4?'food':'medicine',id}));
  names.forEach((name,i)=>inputs.push({name:canonicalAlcohol&&i===2?'Alcohol':name,kind:['medicine','supplement','alcohol','food','medicine'][i],id:null}));
  if(index%2) inputs.reverse();
  const pairs = inputs.flatMap((left,i)=>inputs.slice(i+1).map(right=>{
    const ids=[left.id,right.id];
    let expected=noMatch;
    if([left,right].some(item=>item.id===null&&!knownExtras.has(item.name)))expected=unresolved;
    else if(!ids.includes(null)&&ids.includes(0))expected=ids.includes(4)?'Avoid grapefruit juice':'Contraindicated';
    else if([left,right].some(item=>item.name==='Metformin')&&[left,right].some(item=>item.kind==='alcohol'))expected='Excessive alcohol warning';
    else if([left,right].some(item=>item.name==='Warfarin')&&ids.includes(0))expected='Monitor INR / prothrombin time';
    else if([left,right].some(item=>item.name==='Amlodipine')&&ids.includes(0))expected='Label dose restriction';
    else if([left,right].some(item=>item.name==='Atorvastatin')&&(ids.includes(1)||ids.includes(3)))expected='Avoid concomitant use';
    else if([left,right].some(item=>item.name==='Atorvastatin')&&ids.includes(4))expected='Avoid large quantities of grapefruit juice';
    return {heading:left.name+' + '+right.name,expected};
  }));
  return {key:names[0],inputs:inputs.map(({name,kind})=>({name,kind})),pairs};
});}
export const groups=reportGroups();
