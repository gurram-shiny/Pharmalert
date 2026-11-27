import test from 'node:test';
import assert from 'node:assert/strict';
import {signOutOnDevice} from '../../packages/data-services/sign-out.ts';
test('Device session clears during a delayed logout request',async()=>{
  let finish!:()=>void;
  let signedIn=true;
  const delayed=new Promise<void>(resolve=>{finish=resolve;});
  const pending=signOutOnDevice(()=>delayed,()=>{signedIn=false;});
  assert.equal(signedIn,false);
  finish();
  await pending;
});
test('Device session clears when the logout request fails offline',async()=>{
  let signedIn=true;
  await signOutOnDevice(async()=>{throw Error('offline');},()=>{signedIn=false;});
  assert.equal(signedIn,false);
});
