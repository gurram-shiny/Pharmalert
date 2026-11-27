import {checkInputs} from '../release.ts';
import audit from '../interaction-audit.json' with {type:'json'};
import type {Kind} from '../../packages/interaction-engine/index.ts';
const supplements=new Set(['potassium','calcium','iron','st-johns-wort','vitamin-k']);
const kind=(id:string):Kind=>id==='alcohol'?'alcohol':(id==='grapefruit-juice'||id==='caffeine')?'food':supplements.has(id)?'supplement':'medicine';
const results=audit.map((row,i)=>{
  const inputs=[row.left_id,row.right_id].map(name=>({name,kind:kind(name)}));
  const expected=row.verification_status==='VERIFIED'?'matched':'unverified';
  const reports=[checkInputs(inputs),checkInputs([...inputs].reverse())];
  const passed=reports.every(report=>{
    const pair=report.pairs[0];
    if(report.pairs.length!==1||pair.status!==expected)return false;
    if(expected==='unverified')return pair.matches.length===0&&report.matchCount===0&&report.highest==='unknown';
    const [rule]=pair.matches;
    return report.matchCount===1&&pair.matches.length===1&&rule.rule_id===row.rule_id&&rule.source_id===row.source_id&&
      rule.evidence===row.evidence&&rule.evidence_passage===row.passage&&rule.classification===row.classification;
  });
  return {id:'R'+String(i+1).padStart(2,'0'),inputs:inputs.map(s=>s.name).join(' + '),expected,actual:reports[0].pairs[0].status,source:row.evidence??'',section:row.section??'',description:row.passage??row.reason,passed,timestamp:new Date().toISOString()};
});
console.log(JSON.stringify(results,null,2));
if(results.length!==audit.length||results.some(r=>!r.passed))process.exitCode=1;
