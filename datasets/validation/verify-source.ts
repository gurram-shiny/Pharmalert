import audit from '../interaction-audit.json' with {type:'json'};
import {validateRelease} from '../release.ts';
import {createHash} from 'node:crypto';

validateRelease();
const labels=new Map<string,any>();
const results=[];
const sleep=(milliseconds:number)=>new Promise(resolve=>setTimeout(resolve,milliseconds));
async function fetchLabel(url:string,ruleId:string){
  let lastError:unknown;
  for(let attempt=0;attempt<3;attempt++){
    try{
      const response=await fetch(url,{signal:AbortSignal.timeout(20000)});
      if(response.ok)return response;
      lastError=new Error('HTTP '+response.status);
      if(response.status!==429&&response.status<500)break;
    }catch(error){lastError=error;}
    if(attempt<2)await sleep(500*(attempt+1));
  }
  throw Error('openFDA label request failed for '+ruleId+': '+(lastError instanceof Error?lastError.message:String(lastError)));
}
for(const row of audit){
  if(row.verification_status==='UNVERIFIED'){
    results.push({id:row.rule_id,status:'UNVERIFIED',reason:row.reason});continue;
  }
  if(!labels.has(row.source_id!)){
    const response=await fetchLabel(row.evidence!,row.rule_id);
    const record=(await response.json()).results?.[0];
    if(!record||record.id!==row.source_id)throw Error('Unexpected SPL ID');
    const latest=new URL('https://api.fda.gov/drug/label.json');
    latest.searchParams.set('search','set_id:"'+row.set_id+'"');
    latest.searchParams.set('sort','effective_time:desc');
    latest.searchParams.set('limit','1');
    const current=await fetchLabel(latest.toString(),row.rule_id);
    if((await current.json()).results?.[0]?.id!==record.id)throw Error('Review newer label for '+row.rule_id);
    labels.set(row.source_id!,record);
  }
  const record=labels.get(row.source_id!);
  const section=record[row.section!]?.join(' ');
  if(record.set_id!==row.set_id||String(record.version)!==String(row.label_version)||
     record.effective_time!==row.updated_on!.replaceAll('-','')||!section?.includes(row.passage))throw Error('Evidence mismatch for '+row.rule_id);
  results.push({id:row.rule_id,status:'VERIFIED',source:row.evidence,version:record.version,section:row.section,section_sha256:createHash('sha256').update(section).digest('hex')});
}
console.log(JSON.stringify({timestamp:new Date().toISOString(),records:validateRelease(),results},null,2));
