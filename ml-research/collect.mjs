import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const directory=new URL('./',import.meta.url);
const fields=['drug_interactions','adverse_reactions','warnings_and_cautions','indications_and_usage'];
const drugs=('simvastatin|atorvastatin calcium|digoxin|lisinopril|warfarin sodium|clopidogrel bisulfate|apixaban|losartan potassium|amlodipine besylate|metformin hydrochloride|glipizide|gabapentin|pregabalin|lamotrigine|topiramate|levetiracetam|sertraline hydrochloride|fluoxetine hydrochloride|citalopram hydrobromide|duloxetine hydrochloride|quetiapine fumarate|olanzapine|risperidone|omeprazole|pantoprazole sodium|famotidine|ondansetron hydrochloride|ciprofloxacin hydrochloride|clarithromycin|fluconazole|doxycycline hyclate|colchicine|allopurinol|celecoxib|meloxicam|tamsulosin hydrochloride|finasteride|montelukast sodium|pramipexole dihydrochloride|baclofen').split('|');
const urlFor=search=>{
  const url=new URL('https://api.fda.gov/drug/label.json');
  url.searchParams.set('search',search);url.searchParams.set('limit','1');
  return url;
};
const existing=await readFile(new URL('corpus.json',directory),'utf8').then(JSON.parse).catch(error=>{if(error.code!=='ENOENT')throw error;return [];});
const records=[];
for(const drug of drugs){
  const pin=existing.find(row=>row.drug===drug);
  const url=urlFor(pin?'id:"'+pin.id+'"':'openfda.generic_name.exact:"'+drug.toUpperCase()+'" AND '+fields.map(f=>'_exists_:'+f).join(' AND '));
  let response;
  for(let attempt=0;attempt<4;attempt++){
    response=await fetch(url,{signal:AbortSignal.timeout(30000)});
    if(response.status!==429&&response.status<500)break;
    await new Promise(resolve=>setTimeout(resolve,1500*(attempt+1)));
  }
  if(response.status===404&&!pin){console.log('Unavailable:',drug);continue;}
  if(!response.ok)throw Error(drug+' HTTP '+response.status);
  const label=(await response.json()).results[0];
  if(label.openfda.substance_name?.length!==1||!label.openfda.generic_name.some(v=>v.toLowerCase()===drug)){
    if(pin)throw Error('Pinned identity changed: '+drug);
    continue;
  }
  const sections=Object.fromEntries(fields.map(f=>[f,label[f].join(' ')]));
  const checksum=createHash('sha256').update(JSON.stringify(sections)).digest('hex');
  if(pin&&pin.checksum!==checksum)throw Error('Source sections changed: '+drug);
  records.push({drug,id:label.id,set_id:label.set_id,version:label.version,effective_time:label.effective_time,source:urlFor('id:"'+label.id+'"').href,checksum,sections});
}
if(records.length<20)throw Error('Insufficient single-ingredient label coverage: '+records.length);
await writeFile(new URL('corpus.json',directory),JSON.stringify(records,null,2));
console.log(records.length+' verified label records');
