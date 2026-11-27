import http from 'k6/http';
import { check } from 'k6';
import { vu } from 'k6/execution';
import { Trend } from 'k6/metrics';
const writes=new Trend('interaction_write_duration',true);
let nextCheck=0;
export const options={ vus:100,duration:'1m',thresholds:{http_req_failed:['rate<0.01'],http_req_duration:['p(95)<1000'],interaction_write_duration:['p(95)<1000']} };
const base=__ENV.BASE_URL || 'http://127.0.0.1:8787';
export function setup(){
  const email='k6-'+Date.now()+'@example.test', password='test-session-password';
  const body=JSON.stringify({email,password,name:'k6 test'});
  const headers={'Content-Type':'application/json'};
  const create=http.post(base+'/api/auth/register',body,{headers});
  if(create.status!==200)throw new Error('Test account registration failed.');
  const login=http.post(base+'/api/auth/login',body,{headers});
  if(login.status!==200)throw new Error('Test account login failed.');
  return {token:login.json('token')};
}
export default function(data){
  const headers={Authorization:'Bearer '+data.token};
  for(const path of ['status','auth/session','medicines','interaction_checks']) {
    const response=http.get(base+'/api/'+path,{headers,tags:{endpoint:path}});
    check(response,{'read succeeded':r=>r.status===200});
  }
  if(vu.idInTest===1&&Date.now()>=nextCheck) {
    nextCheck=Date.now()+5500;
    const substances=[{name:'Zocor',kind:'medicine'},{name:'Gemfibrozil',kind:'medicine'}];
    const response=http.post(base+'/api/check',JSON.stringify({substances}),{headers:{...headers,'Content-Type':'application/json'},tags:{endpoint:'check'}});
    writes.add(response.timings.duration);
    check(response,{'sourced write succeeded':r=>r.status===200&&r.json('matchCount')===1&&r.json('highest')==='contraindicated'});
  }
}
export function handleSummary(data){return {'reports/evidence/k6.json':JSON.stringify(data,null,2)};}
