import test from 'node:test';
import assert from 'node:assert/strict';
import '../web/editor/providers.js';
const api=globalThis.DuskProviders;
const streamResponse = text => new Response(new ReadableStream({start(c){const bytes=new TextEncoder().encode(text);for(let i=0;i<bytes.length;i+=3)c.enqueue(bytes.slice(i,i+3));c.close();}}));
const event = value => `data: ${JSON.stringify(value)}\r\n\r\n`;
test('custom endpoints require HTTPS and do not allow URL credentials or query secrets',()=>{
  assert.equal(api.baseURL('custom','https://tokify.sale/v1/'),'https://tokify.sale/v1');
  for(const url of ['http://example.com/v1','https://key@example.com/v1','https://example.com/v1?key=secret','https://example.com/#secret'])assert.throws(()=>api.baseURL('custom',url));
});
test('OpenAI-compatible streaming routes directly and rejects truncated or filtered completion',async t=>{
  let request;
  for(const finish of ['stop','length','content_filter',null]){
    t.mock.method(globalThis,'fetch',async(url,options)=>{request={url,options};return streamResponse(event({choices:[{delta:{content:'日本語 translation'}}]})+event({choices:[{finish_reason:finish}]})+'data: [DONE]\n\n');});
    let text='';const result=await api.stream({provider:'custom',custom:'https://tokify.sale/v1/',key:'test-only',model:'chosen-model',prompt:'hello',signal:new AbortController().signal,onText:s=>text+=s,onActivity:()=>{}});
    assert.equal(result,finish==='stop');assert.equal(text,'日本語 translation');assert.equal(request.url,'https://tokify.sale/v1/chat/completions');
    assert.equal(request.options.headers.Authorization,'Bearer test-only');assert.equal(request.options.redirect,'error');assert.equal(JSON.parse(request.options.body).model,'chosen-model');
    t.mock.restoreAll();
  }
});
test('Claude uses Messages authentication and requires a successful stop reason plus message_stop',async t=>{
  for(const reason of ['end_turn','max_tokens','refusal']){
    t.mock.method(globalThis,'fetch',async(url,options)=>{
      assert.equal(url,'https://api.anthropic.com/v1/messages');assert.equal(options.headers['x-api-key'],'test-only');assert.equal(options.headers.Authorization,undefined);assert.equal(options.headers['anthropic-dangerous-direct-browser-access'],'true');assert.equal(JSON.parse(options.body).max_tokens,8192);
      return streamResponse(event({type:'content_block_delta',delta:{type:'text_delta',text:'Hello'}})+event({type:'message_delta',delta:{stop_reason:reason}})+event({type:'message_stop'}));
    });
    assert.equal(await api.stream({provider:'claude',key:'test-only',model:'claude-example',prompt:'hello',signal:new AbortController().signal,onText:()=>{},onActivity:()=>{}}),reason==='end_turn');t.mock.restoreAll();
  }
});
test('stream errors are not swallowed and EOF without a completion is partial',async t=>{
  t.mock.method(globalThis,'fetch',async()=>streamResponse(event({error:{message:'private provider details'}})));
  const config={provider:'openai',key:'test-only',model:'gpt-example',prompt:'hi',signal:new AbortController().signal,onText:()=>{},onActivity:()=>{}};
  await assert.rejects(api.stream(config),/interrupted/);t.mock.restoreAll();
  t.mock.method(globalThis,'fetch',async()=>streamResponse(event({choices:[{delta:{content:'partial'}}]})));
  assert.equal(await api.stream(config),false);
});
test('Claude catalog pagination keeps credentials on the fixed endpoint',async t=>{
  let calls=0;t.mock.method(globalThis,'fetch',async(url)=>{calls++;assert.ok(url.startsWith('https://api.anthropic.com/v1/models'));return Response.json(calls===1?{data:[{id:'a',display_name:'Model A'}],has_more:true,last_id:'a'}:{data:[{id:'b'}],has_more:false});});
  assert.equal((await api.models('claude','test-only')).length,2);assert.equal(calls,2);
});
