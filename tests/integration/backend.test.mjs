import {groups,noMatch,unresolved} from '../report-cases.mjs';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import test, { before, after } from 'node:test';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
let processHandle, origin;
before(async()=>{
  const probe=createServer().listen(0,'127.0.0.1');await once(probe,'listening');
  const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));origin='http://127.0.0.1:'+port+'/api/';
  processHandle=spawn(process.execPath,['--experimental-transform-types','backend/index.ts'],{env:{...process.env,PORT:String(port),PHARMALERT_DB:':memory:',PHARMALERT_HOST:'127.0.0.1'}});
  const started=Promise.race([once(processHandle.stdout,'data'),once(processHandle,'exit').then(([code])=>{throw new Error('Server exited '+code);})]);
  await started;
});
after(()=>{processHandle?.kill();});
const request=(path,method='GET',values,token)=>fetch(origin+path,{method,headers:{...(values?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{})},body:values?JSON.stringify(values):undefined});
const account=async()=>{
  const response=await request('auth/register','POST',{name:'Test account',email:randomUUID()+'@example.test',password:'test-session-password'});
  assert.equal(response.status,200);return response.json();
};
test('B01 authenticates, persists the session, and rejects a logged-out session',async()=>{
  const {token,user}=await account();assert.equal((await request('medicines')).status,401);
  const login=await request('auth/login','POST',{email:user.email,password:'test-session-password'});assert.equal(login.status,200);
  assert.equal((await (await request('auth/session','GET',undefined,token)).json()).id,user.id);
  assert.equal((await request('auth/logout','POST',undefined,token)).status,200);
  assert.equal((await request('medicines','GET',undefined,token)).status,401);
});
test('B02 scoped CRUD and linked reminder isolation across accounts',async()=>{
  const a=(await account()).token,b=(await account()).token;
  const response=await request('medicines','POST',{name:'Zocor',status:'active'},a);assert.equal(response.status,201);
  const row=await response.json();
  assert.deepEqual(await (await request('medicines','GET',undefined,b)).json(),[]);
  assert.equal((await request('medicines/'+row.id,'DELETE',undefined,b)).status,404);
  const reminder={medicine_id:row.id,repeat:'daily',scheduled_at:'2026-11-27T09:00:00.000Z'};
  assert.equal((await request('reminders','POST',reminder,b)).status,400);
  const registered=await request('reminders','POST',reminder,a);assert.equal(registered.status,201);
  const dose=await registered.json();const log={outcome:'taken',scheduled_at:reminder.scheduled_at};
  assert.equal((await request('reminders/'+dose.id+'/dose','POST',log,a)).status,200);
  assert.equal((await request('reminders/'+dose.id+'/dose','POST',log,a)).status,409);
});
test('B03 private files enforce ownership and reject mismatched content',async()=>{
  const a=(await account()).token,b=(await account()).token;
  const create=file=>request('prescriptions','POST',{file:Buffer.from(file).toString('base64'),mime:'application/pdf'},a);
  assert.equal((await create('plain')).status,400);
  const uploaded=await create('%PDF-1.7 test');assert.equal(uploaded.status,201);
  const row=await uploaded.json();
  assert.equal((await request('prescriptions/'+row.id+'/file','GET',undefined,b)).status,404);
  assert.equal(await (await request('prescriptions/'+row.id+'/file','GET',undefined,a)).text(),'%PDF-1.7 test');
});
test('B04 stores only server-generated evidence reports with private history',async()=>{
  const a=(await account()).token,b=(await account()).token;
  assert.equal((await request('interaction_checks','POST',{report:{highest:'high'}},a)).status,405);
  const response=await request('check','POST',{substances:[{name:'Zocor',kind:'medicine'},{name:'Gemfibrozil',kind:'medicine'},{name:'Alcohol',kind:'alcohol'}],highest:'moderate'},a);
  assert.equal(response.status,200);
  const report=await response.json();assert.equal(report.highest,'contraindicated');assert.equal(report.matchCount,1);
  assert.equal(report.pairs.filter(pair=>pair.status==='no_match').length,2);
  assert.equal((await (await request('interaction_checks','GET',undefined,a)).json()).length,1);
  assert.deepEqual(await (await request('interaction_checks','GET',undefined,b)).json(),[]);
});
test('B05 offline ML research screening endpoint scores a real label passage',async()=>{
  const a=(await account()).token;
  const response=await request('research/screen','POST',{text:'Concomitant use of gemfibrozil with simvastatin is contraindicated.',drug1:'simvastatin',drug2:'gemfibrozil'},a);
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.research_only,true);
  assert.equal(typeof body.decision_margin,'number');
  assert.ok(['research_candidate','below_review_threshold'].includes(body.status));
});
for(const path of ['medicines','supplements','alcohol_entries','health_records','reminders','prescriptions','interaction_checks','reminder_logs']){
  for(const [method,suffix] of [['GET',''],['POST',''],['PATCH','/unowned'],['DELETE','/unowned']]){
    test(method+' '+path+suffix+' requires an account',async()=>{
      assert.equal((await request(path+suffix,method,undefined,undefined)).status,401);
    });
  }
}
let reportAccount;
for(const group of groups){
  test('Saved multi-substance report with '+group.key,async()=>{
    reportAccount??=await account();
    const response=await request('check','POST',{substances:group.inputs},reportAccount.token);
    assert.equal(response.status,200);
    const report=await response.json();
    assert.equal(report.pairs.length,45);
    assert.equal(report.matchCount,group.pairs.filter(p=>p.expected!==noMatch&&p.expected!==unresolved).length);
    for(const [index,pair] of report.pairs.entries()){
      const fixture=group.pairs[index];
      assert.equal(pair.left+' + '+pair.right,fixture.heading);
      assert.equal(pair.status,fixture.expected===noMatch?'no_match':fixture.expected===unresolved?'unresolved':'matched');
    }
    const history=await (await request('interaction_checks','GET',undefined,reportAccount.token)).json();
    const saved=history.find(entry=>JSON.stringify(entry.inputs)===JSON.stringify(group.inputs));
    assert.deepEqual(saved.report,report);
  });
}
