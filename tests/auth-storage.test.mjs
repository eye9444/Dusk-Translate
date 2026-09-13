import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createAuthStorage} from '../web/src/auth-storage.js';
function memory(){const map=new Map();return {get length(){return map.size;},key:i=>[...map.keys()][i],getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};}
test('remember me moves only auth credentials between persistent and session storage',()=>{
  const local=memory(),session=memory(),storage=createAuthStorage(local,session);storage.setPrefix('sb-example-auth-token');
  storage.setItem('sb-example-auth-token','session');storage.setItem('sb-example-auth-token-code-verifier','verifier');local.setItem('theme','eclipse');
  storage.choose(false);assert.equal(local.getItem('sb-example-auth-token'),null);assert.equal(session.getItem('sb-example-auth-token'),'session');assert.equal(local.getItem('theme'),'eclipse');
  assert.equal(createAuthStorage(local,memory()).getItem('sb-example-auth-token'),null);
  storage.choose(true);assert.equal(local.getItem('sb-example-auth-token'),'session');assert.equal(session.getItem('sb-example-auth-token'),null);
  assert.equal(createAuthStorage(local,memory()).getItem('sb-example-auth-token'),'session');storage.removeItem('sb-example-auth-token');assert.equal(storage.getItem('sb-example-auth-token'),null);
});
test('a stale tab preference cannot hide a remembered login',()=>{
  const local=memory(),staleSession=memory();
  local.setItem('dusk-remember-me','true');local.setItem('sb-example-auth-token','persistent-session');
  staleSession.setItem('dusk-remember-me','false');
  const storage=createAuthStorage(local,staleSession);storage.setPrefix('sb-example-auth-token');
  assert.equal(storage.remembered(),true);assert.equal(storage.getItem('sb-example-auth-token'),'persistent-session');
  storage.choose(true);assert.equal(staleSession.getItem('dusk-remember-me'),null);
});
