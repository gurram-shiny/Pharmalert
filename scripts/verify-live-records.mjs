import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

// Run with a disposable account via the same HTTP contract as web and mobile.
// Supply the deployment URL and admin key in the environment for account cleanup.
const root = new URL(process.env.SUPABASE_URL);
const admin = process.env.SUPABASE_SERVICE_ROLE_KEY;
assert.ok(admin && root.protocol === 'https:');
const api = new URL('/functions/v1/pharmalert-api/api/',root);
async function request(path,method,token,body,status=200) {
  const response = await fetch(new URL(path,api),{method,headers:{
    ...(token && {Authorization:'Bearer '+token}),...(body && {'Content-Type':'application/json'}),
  },body:body && JSON.stringify(body)});
  assert.equal(response.status,status,method+' '+path);
  return response;
}
const credentials = {email:'qa-'+randomUUID()+'@'+root.hostname,password:randomUUID()+'A!9',name:'Record workflow verification'};
const account = await (await request('auth/register','POST',null,credentials)).json();
try {
  const a = account.token;
  const b = (await (await request('auth/login','POST',null,credentials)).json()).token;
  await request('medicines','POST',a,{name:'Incomplete'},400);
  const med = await (await request('medicines','POST',a,{name:'QA',status:'active',dosage:'sample'},201)).json();
  await request('medicines/'+med.id,'PATCH',b,{name:'Updated'});
  const [updated] = await (await request('medicines','GET',a)).json();
  assert.deepEqual([updated.name,updated.status,updated.dosage],['Updated','active','sample']);
  await request('medicines/'+med.id,'PATCH',b,{status:'invalid'},400);
  console.log('PASS required fields, partial update preservation and invalid choice rejection');
  const date = '2026-11-28T10:00:00.000Z';
  for(const [repeat,next] of [['once',null],['daily','2026-11-29'],['weekly','2026-12-05']]){
    const reminder = await (await request('reminders','POST',a,{medicine_id:med.id,scheduled_at:date,repeat},201)).json();
    const dose = {outcome:'taken',scheduled_at:date};
    await request('reminders/'+reminder.id+'/dose','POST',b,dose);
    await request('reminders/'+reminder.id+'/dose','POST',a,dose,next?409:404);
    const rows = await (await request('reminders','GET',a)).json();
    const row = rows.find(r=>r.id===reminder.id);
    if(next)assert.equal(row.scheduled_at,next+'T10:00:00.000Z');
    else assert.equal(row,undefined);
    const logs = await (await request('reminder_logs','GET',a)).json();
    assert.equal(logs.filter(r=>r.reminder_id===reminder.id).length,1);
    console.log('PASS '+repeat+' dose and duplicate submission');
  }
  const bytes = Buffer.from('%PDF-1.4\n%%EOF');
  const rx = await (await request('prescriptions','POST',a,{doctor:'QA',mime:'application/pdf',file:bytes.toString('base64')},201)).json();
  await request('prescriptions/'+rx.id,'PATCH',b,{notes:'metadata edit'});
  const download = await request('prescriptions/'+rx.id+'/file','GET',b);
  assert.equal(download.headers.get('content-type'),'application/pdf');
  assert.deepEqual(Buffer.from(await download.arrayBuffer()),bytes);
  const [metadata] = await (await request('prescriptions','GET',b)).json();
  assert.equal(metadata.doctor,'QA');
  assert.equal(metadata.notes,'metadata edit');
  for(const field of ['file','file_base64'])assert.ok(!(field in metadata));
  await request('prescriptions','POST',a,{mime:'application/pdf',file:'YWJj'},400);
  await request('prescriptions/'+rx.id,'DELETE',b);
  await request('prescriptions/'+rx.id+'/file','GET',a,undefined,404);
  console.log('PASS file upload, metadata edit, byte-for-byte download, signature validation and deletion');
} finally {
  const response = await fetch(new URL('/auth/v1/admin/users/'+account.user.id,root),{
    method:'DELETE',headers:{apikey:admin,Authorization:'Bearer '+admin}
  });
  assert.ok(response.ok,'QA cleanup failed');
  console.log('QA account removed');
}
