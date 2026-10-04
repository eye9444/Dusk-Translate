import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { Paddle } from '@paddle/paddle-node-sdk';

test('Paddle verifies the exact raw body and rejects tampering and the wrong signing secret',async()=>{
  const paddle=new Paddle('pdl_sdbx_apikey_unit_test_only');
  const secret='unit-test-not-a-deployed-secret';
  const ts=Math.floor(Date.now()/1000);
  const raw=JSON.stringify({event_id:'evt_test',event_type:'customer.created',occurred_at:new Date().toISOString(),
    data:{id:'ctm_test',email:'example@test.invalid',created_at:new Date().toISOString(),updated_at:new Date().toISOString()}});
  const signature=`ts=${ts};h1=${createHmac('sha256',secret).update(ts+':'+raw).digest('hex')}`;
  assert.equal((await paddle.webhooks.unmarshal(raw,secret,signature)).eventType,'customer.created');
  await assert.rejects(paddle.webhooks.unmarshal(raw+' ',secret,signature));
  await assert.rejects(paddle.webhooks.unmarshal(raw,'wrong-secret',signature));
});
