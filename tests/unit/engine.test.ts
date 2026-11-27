import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze, normalize, parseSubstances, resolveSubstances, type Substance } from '../../packages/interaction-engine/index.ts';
import { checkInputs, dataset, heldPairs, identifiers, rules, validateRelease } from '../../datasets/release.ts';
const medicine = (name:string):Substance => ({name,kind:'medicine'});
const result = (...items:Substance[]) => analyze(resolveSubstances(parseSubstances(items),identifiers),rules,dataset);
test('E01 normalizes Unicode and spacing',()=>assert.equal(normalize('  ＳＩＭＶＡＳＴＡＴＩＮ  '),'simvastatin'));
test('E02 finds a verified contraindication regardless of order and alias',()=>{
  const report=result(medicine('Gemfibrozil'),medicine('Zocor'));
  assert.equal(report.highest,'contraindicated');assert.equal(report.matchCount,1);
  assert.equal(report.pairs[0].matches[0].classification,'Contraindicated');
  assert.equal(report.pairs[0].matches[0].evidence,'https://api.fda.gov/drug/label.json?search=id:%2211256523-425c-48e8-afe1-e3a4e28c892e%22');
  assert.equal(report.dataset.version,dataset.version);
});
test('E03 merges aliases and produces each unique pair once',()=>{
  const report=result(medicine('ZOCOR'),medicine('Simvastatin'),medicine('danazol'),medicine('cyclosporine'));
  assert.deepEqual(report.duplicates,['Simvastatin']); assert.equal(report.pairs.length,3);assert.equal(report.matchCount,2);
  assert.equal(report.pairs.find(pair=>pair.left==='danazol')?.status,'no_match');
});
test('E04 rejects ambiguous identities and keeps unknown combinations unresolved',()=>{
  const input=[medicine('Zocor'),medicine('Gemfibrozil')];
  const ambiguous=[...identifiers,{...identifiers[1],source_id:'other'}];
  assert.equal(analyze(resolveSubstances(input,ambiguous),rules,dataset).pairs[0].status,'unresolved');
  assert.equal(result(medicine('Simvastatin'),{name:'Alcohol',kind:'alcohol'}).highest,'unknown');
});
test('E05 classifies supported food results separately and validates the release',()=>{
  const report=result(medicine('Zocor'),{name:'Grapefruit juice',kind:'food'});
  assert.equal(report.highest,'other');assert.equal(report.pairs[0].matches[0].classification,'Avoid grapefruit juice');
  assert.equal(validateRelease(),47);
});
test('E06 rejects malformed input and a pair made of one identity',()=>{
  assert.throws(()=>parseSubstances([null,null]));
  assert.throws(()=>result(medicine('Zocor'),medicine('Simvastatin')),/distinct/);
});

for(const kind of ['alcohol','supplement','food'] as const){
  for(const known of ['Zocor','Gemfibrozil','Cyclosporine','Danazol']){
    test('Withhold findings for '+known+' filed as '+kind,()=>{
      const partner=known==='Zocor'?'Gemfibrozil':'Zocor';
      const report=result({name:known,kind},medicine(partner));
      assert.equal(report.pairs[0].status,'unresolved');
      assert.equal(report.highest,'unknown');
      assert.equal(report.matchCount,0);
    });
  }
}
for(const count of [0,1,2,19,20,21]){
  test('Checker item count '+count,()=>{
    const items=Array.from({length:count},(_,i)=>medicine('Unlisted '+i));
    if(count<2||count>20)assert.throws(()=>parseSubstances(items),/between 2 and 20/);
    else assert.equal(result(...items).pairs.length,count*(count-1)/2);
  });
}
for(const length of [0,1,119,120,121]){
  test('Substance name length '+length,()=>{
    const items=[medicine('A'.repeat(length)),medicine('Zocor')];
    if(length===0||length>120)assert.throws(()=>parseSubstances(items),/valid name/);
    else assert.equal(result(...items).pairs[0].status,'unresolved');
  });
}
test('Release integrity rejects a changed clinical instruction or a missing pair',()=>{
  const instruction=rules[0].management;
  try{
    rules[0].management='Unexpected replacement';
    assert.throws(validateRelease,/differs/);
  }finally{rules[0].management=instruction;}
  const last=rules.pop()!;
  try{assert.throws(validateRelease,/differs/);}finally{rules.push(last);}
  assert.equal(validateRelease(),47);
});
test('E07 withholds unverified pairs and never presents them as confirmed interactions',()=>{
  assert.deepEqual([...heldPairs].sort(),['ibuprofen|lisinopril','vitamin-k|warfarin']);
  const a=checkInputs([medicine('Ibuprofen'),medicine('Lisinopril')]);
  assert.equal(a.pairs[0].status,'unverified');
  assert.equal(a.matchCount,0);
  assert.equal(a.highest,'unknown');
  const b=checkInputs([{name:'Vitamin K',kind:'supplement'},medicine('Warfarin')]);
  assert.equal(b.pairs[0].status,'unverified');
  assert.equal(b.matchCount,0);
  assert.equal(b.highest,'unknown');
});
