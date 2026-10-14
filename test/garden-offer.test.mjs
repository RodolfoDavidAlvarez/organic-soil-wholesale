import test from 'node:test'
import assert from 'node:assert/strict'
import handler from '../api/garden-offer.js'

function response() {
  return {headers:{},statusCode:200,setHeader(k,v){this.headers[k]=v},status(v){this.statusCode=v;return this},json(v){this.body=v;return this}}
}
const token='a'.repeat(43)
const origin='https://www.organicsoilwholesale.com'
test('storefront never exposes staff actions, even with an SSW cookie',async()=>{
  for(const action of ['manual-pay','create-link','test-link','dashboard','gift-redeem','delivery-confirm','slot-save','plan-resume']){
    const res=response();await handler({method:'POST',query:{action},headers:{origin,cookie:'occ_session=not-forwarded'},body:{token}},res);assert.equal(res.statusCode,405)
  }
})
test('cross-site, invalid tokens and raw card fields stop before forwarding',async()=>{
  for(const [headers,body,status] of [[{origin:'https://example.invalid'},{token},403],[{origin,'sec-fetch-site':'cross-site'},{token},403],[{origin},{token:'bad'},404],[{origin},{token,cvc:'123'},400]]){
    const res=response();await handler({method:'POST',query:{action:'checkout'},headers,body},res);assert.equal(res.statusCode,status)
  }
})
test('public checkout forwards only the fixed payment action and approved fields',async(t)=>{
  let received
  t.mock.method(globalThis,'fetch',async(url,opts)=>{received={url,opts};return {status:200,json:async()=>({url:'https://checkout.stripe.com/c/pay/fixture'})}})
  const res=response();await handler({method:'POST',query:{action:'checkout',destination:'https://example.invalid'},headers:{origin,cookie:'occ_session=private','x-actor-id':'1',authorization:`Bearer ${token}`},body:{quote_id:'quote-fixture',terms_digest:'digest',accepted:true,role:'admin',amount:1}},res)
  assert.equal(received.url,'https://sswworld.com/api/garden-bed?action=checkout')
  assert.equal(received.opts.headers.Cookie,undefined);assert.equal(received.opts.headers.cookie,undefined)
  assert.equal(received.opts.headers.Origin,origin)
  assert.deepEqual(JSON.parse(received.opts.body),{quote_id:'quote-fixture',terms_digest:'digest',accepted:true,token})
  assert.equal(res.headers['Cache-Control'],'private, no-store');assert.equal(res.statusCode,200)
})
test('public configuration cannot enable staff card entry or expose its key',async(t)=>{
  t.mock.method(globalThis,'fetch',async()=>({status:200,json:async()=>({prices:{upfront:94543},version:'v1',payments_enabled:true,manual_entry_enabled:true,publishable_key:'pk_live_fixture'})}))
  const res=response();await handler({method:'GET',query:{action:'config'},headers:{}},res)
  assert.equal(res.body.manual_entry_enabled,false);assert.equal(res.body.publishable_key,undefined)
})
test('provider failures are safe to retry only after status review',async(t)=>{
  t.mock.method(globalThis,'fetch',async()=>{throw Error('private infrastructure details')})
  const res=response();await handler({method:'GET',query:{action:'status'},headers:{authorization:`Bearer ${token}`}},res)
  assert.equal(res.statusCode,503);assert.doesNotMatch(JSON.stringify(res.body),/private infrastructure/)
})

test('optional future-card permission forwards only through customer checkout',async(t)=>{
  const received=[]
  t.mock.method(globalThis,'fetch',async(url,opts)=>{received.push({url,opts});return {status:200,json:async()=>({ok:true})}})
  for(const action of ['checkout','quote']){
    const res=response();await handler({method:'POST',query:{action},headers:{origin},body:{token,quote_id:'q',accepted:true,future_card_accepted:true,future_card_terms_digest:'separate-consent',payment_method:'pm_never_forward',test_schedule:'accelerated'}},res)
  }
  assert.deepEqual(JSON.parse(received[0].opts.body),{quote_id:'q',accepted:true,future_card_accepted:true,future_card_terms_digest:'separate-consent',token})
  assert.deepEqual(JSON.parse(received[1].opts.body),{token})
})


test('ACH config and method forward without exposing bank details or staff timing',async(t)=>{
  const received=[]
  t.mock.method(globalThis,'fetch',async(url,opts)=>{received.push({url,opts});return {status:200,json:async()=>({ach_enabled:true,preferred_payment_method:'us_bank_account',manual_entry_enabled:true})}})
  const config=response();await handler({method:'GET',query:{action:'config'},headers:{}},config)
  assert.equal(config.body.ach_enabled,true);assert.equal(config.body.preferred_payment_method,'us_bank_account');assert.equal(config.body.manual_entry_enabled,false)
  const res=response();await handler({method:'POST',query:{action:'quote'},headers:{origin},body:{token,payment_method_type:'us_bank_account',plan:'monthly',test_schedule:'accelerated'}},res)
  assert.deepEqual(JSON.parse(received[1].opts.body),{payment_method_type:'us_bank_account',plan:'monthly',token})
  for(const key of ['account_number','routing_number','bank_account','us_bank_account','bank_details','iban']){
    const blocked=response();await handler({method:'POST',query:{action:'quote'},headers:{origin},body:{token,[key]:'fixture-never-forward'}},blocked);assert.equal(blocked.statusCode,400)
  }
  assert.equal(received.length,2)
})
