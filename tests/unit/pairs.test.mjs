import test from 'node:test';
import assert from 'node:assert/strict';
import {groups,unresolved,noMatch} from '../report-cases.mjs';
import {analyze,parseSubstances,resolveSubstances} from '../../packages/interaction-engine/index.ts';
import {identifiers,rules,dataset} from '../../datasets/release.ts';
for(const group of groups){
  for(const pair of group.pairs){
    test('Pair resolution: '+pair.heading,()=>{
      const items=pair.heading.split(' + ').map(name=>group.inputs.find(item=>item.name===name));
      const [result]=analyze(resolveSubstances(parseSubstances(items),identifiers),rules,dataset).pairs;
      const expectedStatus=pair.expected===unresolved?'unresolved':pair.expected===noMatch?'no_match':'matched';
      assert.equal(result.status,expectedStatus);
      assert.deepEqual(result.matches.map(rule=>rule.classification),expectedStatus==='matched'?[pair.expected.replace('High · ','')]:[]);
    });
  }
}
