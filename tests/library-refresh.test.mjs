import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../web/src/main.js',import.meta.url),'utf8');
const refresh=source.slice(source.indexOf('async function refresh()'),source.indexOf('\nfunction render()'));
const body=refresh.slice(refresh.indexOf("  setLoading(true, 'Refreshing library"),refresh.lastIndexOf('}'));
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const run=new AsyncFunction('context',`
  const {local,remote,setLoading,request,libraryRequest}=context;
  const user={id:'owner'}, libraryOwner='owner', owner=()=>libraryOwner;
  let cached=[],projects=[],invitations=[];
  const status=()=>{},render=()=>{},scheduleWhatsNew=()=>{},errorMessage=String;
  const $=()=>({}), libraryView='projects';
  const donations={update:()=>{}}, readerOpen=false, active=null;
  ${body}
`);

for(const stale of [false,true])for(const fails of [false,true]){
  test(`refresh releases its loader slot: stale=${stale}, failure=${fails}`,async()=>{
    const calls=[];
    await run({
      request:1,libraryRequest:stale?2:1,setLoading:value=>calls.push(value),
      local:{list:async()=>[]},
      remote:{inbox:async()=>[],list:async()=>{if(fails)throw new Error('Unavailable');return [];}},
    });
    assert.deepEqual(calls,[true,false]);
  });
}
