import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {buildReminderPayload,scheduleReminder,cancelReminder,validTwilioCallback} from '../shared/giveawayReminderQueue.js';

const now=Date.parse('2026-09-29T23:00:00Z');
const env={RESEND_API_KEY:'test',GIVEAWAY_TWILIO_ACCOUNT_SID:'ACtest',GIVEAWAY_TWILIO_AUTH_TOKEN:'test-token',
  GIVEAWAY_TWILIO_PHONE_NUMBER:'+16025550100',GIVEAWAY_TWILIO_MESSAGING_SERVICE_SID:'MG'+'a'.repeat(32)};
const job={id:'fixture-job',reminder_id:'NL-2026-10-GIVEAWAY-2',content_key:'email-2',
  destination:'recipient+test@example.com',channel:'email',scheduled_at:'2026-10-02T16:00:00Z'};

test('email has a personalized unsubscribe page, one-click endpoint, logos, and correct date',()=>{
  const p=buildReminderPayload(job,{now,env});
  assert.match(p.html,/unsubscribe\?email=recipient%2Btest%40example.com/);
  assert.match(p.text,/unsubscribe\?email=recipient%2Btest%40example.com/);
  assert.match(p.headers['List-Unsubscribe'],/api\/unsubscribe\?email=/);
  assert.equal(p.headers['List-Unsubscribe-Post'],'List-Unsubscribe=One-Click');
  assert.deepEqual(p.to,[job.destination]);assert.equal(p.scheduled_at,job.scheduled_at.replace('Z','.000Z'));
  assert.equal(p.attachments.length,2);assert.doesNotMatch(p.html,/Fall Garden Class|INTERNAL TEST/);
  assert.doesNotMatch(p.text,/INTERNAL TEST|DRAFT ·/);
});
test('customer and team texts stay one segment and use the appropriate language',()=>{
  for(const content_key of ['sms-friday','sms-saturday']) for(const is_team of [false,true]) {
    const p=buildReminderPayload({...job,channel:'sms',content_key,is_team,destination:'+16025550101'},{now,env});
    assert.ok(p.Body.length<=160);assert.match(p.Body,/Reply STOP/);assert.match(p.Body,/https:\/\/instagram.com\/soilseedandwater/);
    assert.equal(p.ScheduleType,'fixed');
    if(is_team) assert.match(p.Body,/team:/);else assert.match(p.Body,/Answer .*10-11am.*or we redraw/);
  }
});
test('late scheduling never falls back to an immediate send',()=>{
  assert.throws(()=>buildReminderPayload({...job,scheduled_at:new Date(now-1000).toISOString()},{now,env}),/lead time/);
  assert.throws(()=>buildReminderPayload({...job,channel:'sms',content_key:'sms-friday',scheduled_at:new Date(now+14*60_000).toISOString()},{now,env}),/lead time/);
});
test('email retries use a stable job idempotency key and carry scheduled_at',async()=>{
  let request;
  const result=await scheduleReminder(job,{now,env,fetchImpl:async(url,opts)=>{
    request={url,...opts};return new Response(JSON.stringify({id:'email-provider-id'}),{status:200});
  }});
  assert.equal(result.id,'email-provider-id');
  assert.equal(request.headers['Idempotency-Key'],'giveaway-fixture-job');
  assert.ok(JSON.parse(request.body).scheduled_at);
});
test('ambiguous failures are distinguishable from explicit rejections and never retried internally',async()=>{
  let calls=0;
  await assert.rejects(scheduleReminder(job,{now,env,fetchImpl:async()=>{calls++;throw new Error('Connection lost');}}),/Connection lost/);
  assert.equal(calls,1);
  await assert.rejects(scheduleReminder(job,{now,env,fetchImpl:async()=>new Response('{"code":429}',{status:429})}),e=>e.rejected&&e.retryable);
});
test('SMS must be provider-confirmed scheduled, preserving an ID on ambiguous acceptance',async()=>{
  await assert.rejects(scheduleReminder({...job,channel:'sms',content_key:'sms-friday'},
    {now,env,fetchImpl:async()=>new Response('{"sid":"SM123","status":"queued"}',{status:200})}),e=>e.providerId==='SM123'&&!e.rejected);
});
test('cancel confirms provider state and does not claim a delivered email was canceled',async()=>{
  let calls=0;
  const result=await cancelReminder({...job,provider_id:'existing'}, {env,fetchImpl:async(url,opts)=>{
    calls++;return new Response(JSON.stringify(opts.method==='POST'?{id:'existing'}:{last_event:calls===1?'queued':'canceled'}),{status:200});
  }});
  assert.equal(result,'canceled');assert.equal(calls,3);
  assert.equal(await cancelReminder({...job,provider_id:'existing'},{env,fetchImpl:async()=>new Response('{"last_event":"delivered"}',{status:200})}),'delivered');
});
test('SMS callbacks require a valid signature',()=>{
  const body={MessageSid:'SM'+'1'.repeat(32),MessageStatus:'delivered'};
  const url='https://www.organicsoilwholesale.com/api/giveaway/reminders/sms-status';
  const signature=crypto.createHmac('sha1',env.GIVEAWAY_TWILIO_AUTH_TOKEN).update(url+Object.keys(body).sort().map(k=>k+body[k]).join('')).digest('base64');
  assert.ok(validTwilioCallback(signature,body,env.GIVEAWAY_TWILIO_AUTH_TOKEN));
  assert.equal(validTwilioCallback('invalid',body,env.GIVEAWAY_TWILIO_AUTH_TOKEN),false);
});
