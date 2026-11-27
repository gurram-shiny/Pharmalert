import { Workbook, SpreadsheetFile } from '@oai/artifact-tool';
import fs from 'node:fs/promises';
import path from 'node:path';

const root=process.argv[2]??process.cwd();
const output=path.join(root,'outputs','pharmalert-qa');
const evidence=path.join(root,'reports','evidence');
await fs.mkdir(output,{recursive:true});
const json=async name=>{try{return JSON.parse(await fs.readFile(path.join(evidence,name),'utf8'));}catch{return null;}};
const selenium=(await json('selenium.json'))??[],appium=(await json('appium.json'))??[],dataset=await json('dataset.json'),performance=await json('k6.json');
const perfTime=performance?(await fs.stat(path.join(evidence,'k6.json'))).mtime.toISOString():'';
const absent=(id,description,expected,evidence)=>({id,description,expected,actual:'',status:'NOT RUN',timestamp:'',evidence});
const standard=['Case ID','Description','Expected result','Actual result','Status','Executed (UTC)','Evidence'];
const fields=['id','description','expected','actual','status','timestamp','evidence'];
const qa=(results,planned)=>[...results,...planned.filter(item=>!results.some(result=>result.id===item.id))].map(item=>fields.map(key=>item[key]));
const W='tests/web/selenium.mjs',M='tests/mobile/appium.mjs';
const webPlan=[
  ['W01','Dashboard and protected route','Dashboard loads and redirects unsigned users to sign-in.'],
  ['W02','Registration','New account accesses the medicine page.'],
  ['W03','Medicine create and list','Saved medicine appears.'],
  ['W04','Checker and history','Pinned label evidence is found and saved.'],
  ['W05','Logout and login','Authentication works and saved data remains available.'],
  ['W06','Supplements, alcohol, reminders','Create, update and delete entries.'],
  ['W07','Prescriptions and health','Upload, download and manage records.'],
  ['W08','Reports and settings','Exports and profile settings work.'],
].map(row=>absent(...row,W));
const mobilePlan=[
  ['M01','Native authentication screen','Sign-in and registration controls are visible.'],['M02','Native registration and tabs','New account reaches the overview.'],
  ['M03','Native medicines and checker','CRUD and evidence confirmation succeed.'],['M04','Native reminders and prescriptions','Native workflows persist scoped records.'],
  ['M05','Native health, reports, history and session','Records and session survive reopening.'],
].map(row=>absent(...row,M));
const datasetRows=[
  dataset?['D01','Pinned SPL provenance and wording','Label ID, version, date and relevant wording match.',dataset.records+' structurally valid records. Checksum recorded.','PASS',dataset.timestamp,'reports/evidence/dataset.json']:fields.map(key=>absent('D01','Verify label provenance','Pinned evidence matches.','datasets/validation/verify-source.ts')[key]),
  ['D02','Pharmacist review','A qualified reviewer signs off.','','NOT RUN','','datasets/dataset-provenance.md'],
  ['D03','Prospective clinical validation','Independent clinical evidence is recorded.','','NOT RUN','','datasets/dataset-provenance.md'],
];
const references=(await json('reference-cases.json'))??[];
const endpoints=[
  ['GET','/api/status','Public','Current source and record count'],
  ['POST','/api/auth/register','Public, rate limited','Register account and start session'],
  ['POST','/api/auth/login','Public, rate limited','Start account session'],
  ['GET','/api/auth/session','Account session','Get current account'],
  ['PATCH','/api/auth/profile','Account session','Edit display name'],
  ['POST','/api/auth/logout','Account session','Revoke session'],
  ['POST','/api/check','Account session, rate limited','Resolve evidence and save result'],
  ['GET','/api/:section','Account session','List own records'],
  ['POST / PATCH','/api/:section[/:id]','Account session','Create / edit permitted sections'],
  ['DELETE','/api/:section/:id','Account session','Delete own record'],
  ['GET','/api/prescriptions/:id/file','Account session','Download own file'],
  ['POST','/api/reminders/:id/dose','Account session','Record dose outcome and advance schedule'],
];
const findings=[
  ['F01','Dataset coverage','Four curated ZOCOR records','Coverage extension and independent review pending.','datasets/dataset-provenance.md'],
  ['F02','Model evaluation','Offline DDI extraction benchmark completed','Validation precision target missed. Clinical validation pending.','ml-research/README.md'],
  ['F03','Device validation',appium.length?'Android x86_64 emulator smoke cases executed':'Expo bundle verification only','Broader mobile workflows, notifications and iOS device runs are pending.','tests/mobile/appium.mjs'],
  ['F04','Deployment','Local service','Configure TLS, encrypted storage and backups before use with sensitive records.','README.md'],
  ['F05','Owner isolation','Backend tests exercise two accounts','Tests cover records, linked reminders, files and history.','tests/integration/backend.test.mjs'],
  ['F06','Dependency audit','Expo tooling has open advisories','Review the audit before deployment and verify a compatible dependency upgrade.','reports/evidence/npm-audit.json'],
];
const stats=performance?.metrics;
const performanceRows=stats?[
  ['P01','Peak virtual users','VU',stats.vus.values.max,'RECORDED',perfTime,'reports/evidence/k6.json'],
  ['P02','HTTP requests','requests',stats.http_reqs.values.count,'RECORDED',perfTime,'reports/evidence/k6.json'],
  ['P03','Request throughput','requests/s',stats.http_reqs.values.rate,'RECORDED',perfTime,'reports/evidence/k6.json'],
  ['P04','Median latency','ms',stats.http_req_duration.values.med,'RECORDED',perfTime,'reports/evidence/k6.json'],
  ['P05','p90 latency','ms',stats.http_req_duration.values['p(90)'],'RECORDED',perfTime,'reports/evidence/k6.json'],
  ['P06','p95 latency','ms',stats.http_req_duration.values['p(95)'],'RECORDED',perfTime,'reports/evidence/k6.json'],
  ['P07','HTTP error rate','%',stats.http_req_failed.values.rate*100,'RECORDED',perfTime,'reports/evidence/k6.json'],
  ['P08','Failed checks','checks',stats.checks.values.fails,'RECORDED',perfTime,'reports/evidence/k6.json'],
  stats.interaction_write_duration?
    ['P09','Paced interaction-write p95','ms',stats.interaction_write_duration.values['p(95)'],'RECORDED',perfTime,'reports/evidence/k6.json']:
    ['P09','Paced interaction-write p95','ms','','NOT RUN','','tests/performance/k6.js'],
]:[['P00','100 VU read baseline','','','NOT RUN','','tests/performance/k6.js']];
const workbooks=[
  ['selenium-test-report','Web QA',standard,qa(selenium,webPlan)],
  ['appium-test-report','Native QA',standard,qa(appium,mobilePlan)],
  ['dataset-validation-report','Dataset QA',standard,datasetRows],
  ['endpoint-inventory','Endpoints',['Method','Endpoint','Access','Purpose'],endpoints],
  ['findings','Findings',['ID','Area','Observation','Follow-up','Evidence'],findings],
  ['performance-summary','Load test',['Case ID','Metric','Unit','Value','Status','Executed (UTC)','Evidence'],performanceRows],
];
for(const [filename,name,headers,rows] of workbooks){
  if(process.argv.length>3&&!process.argv.slice(3).includes(filename))continue;
  const workbook=Workbook.create();
  const sheet=workbook.worksheets.add(name);
  const end=String.fromCharCode(64+headers.length);
  const block=sheet.getRange('A1:'+end+(rows.length+1));
  block.values=[headers,...rows];block.format.wrapText=true;block.format.rowHeight=39;
  const head=sheet.getRange('A1:'+end+'1');head.format.fill='#075A49';head.format.font.color='#FFFFFF';head.format.font.bold=true;head.format.rowHeight=30;
  for(let i=0;i<headers.length;i++){
    const column=String.fromCharCode(65+i);
    sheet.getRange(column+':'+column).format.columnWidth=(headers===standard?[12,29,37,38,13,28,34]:headers.length===7?[12,29,17,16,13,28,34]:[17,34,34,45,32])[i];
  }
  if(filename==='performance-summary') {
    sheet.getRange('D2:D'+(rows.length+1)).setNumberFormat('#,##0');
    if(stats){sheet.getRange('D4:D8').setNumberFormat('#,##0.00');sheet.getRange('D10').setNumberFormat('#,##0.00');}
  }
  if(headers.includes('Executed (UTC)'))sheet.getRange('F2:F'+(rows.length+1)).setNumberFormat('yyyy-mm-dd hh:mm:ss');
  for(let row=2;row<=rows.length+1;row++) if(row%2===0)sheet.getRange('A'+row+':'+end+row).format.fill='#EBF5F1';
  if(filename==='dataset-validation-report'&&references.length) {
    const review=workbook.worksheets.add('Source cases and review');
    const columns=['Case ID','Input pair','Expected label','Actual label','Algorithm status','Source section','Reviewer role','Review date','Agreement','Comments','Resolution'];
    const rows=references.map(item=>[
      item.id,item.inputs,item.expected,item.actual,item.passed?'PASS':'FAIL',item.section,'','','','','Pending',
    ]);
    review.getRange('A1:K'+(rows.length+1)).values=[columns,...rows];
    review.getRange('A1:K1').format.fill='#075A49';
    review.getRange('A1:K1').format.font.color='#FFFFFF';
    review.getRange('A1:K1').format.font.bold=true;
    review.getRange('A:K').format.columnWidth=23;
    review.getRange('B:B').format.columnWidth=31;
    review.getRange('A1:K'+(rows.length+1)).format.wrapText=true;
    review.getRange('A1:K'+(rows.length+1)).format.rowHeight=32;
    review.getRange('G2:K'+(rows.length+1)).format.fill='#E8F4FC';
    review.getRange('H2:H'+(rows.length+1)).setNumberFormat('yyyy-mm-dd');
    review.getRange('A'+(rows.length+3)).values=[['Official source label']];
    review.getRange('B'+(rows.length+3)).values=[[references[0].source]];
  }
  workbook.recalculate();
  await workbook.inspect({kind:'table',range:name+'!A1:'+end+Math.min(4,rows.length+1),include:'values',tableMaxRows:4,tableMaxCols:headers.length});
  const png=await workbook.render({sheetName:name,range:'A1:'+end+Math.min(4,rows.length+1),scale:1});
  await fs.writeFile(path.join(evidence,filename+'.png'),new Uint8Array(await png.arrayBuffer()));
  if(filename==='dataset-validation-report'&&references.length) {
    const reviewPng=await workbook.render({sheetName:'Source cases and review',range:'A1:K'+(references.length+3),scale:1});
    await fs.writeFile(path.join(evidence,'source-cases-and-review.png'),new Uint8Array(await reviewPng.arrayBuffer()));
  }
  const file=await SpreadsheetFile.exportXlsx(workbook);
  await file.save(path.join(output,filename+'.xlsx'));
}
