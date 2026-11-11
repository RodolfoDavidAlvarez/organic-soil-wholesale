import test from 'node:test';
import assert from 'node:assert/strict';
import {validateSampleRequest} from '../shared/sampleProgram.js';
const base={name:'QA Person',email:'QA@example.com',phone:'6232633386',address:'1634 N 19th Ave',city:'Phoenix',state:'AZ',postal_code:'85009',country:'United States',product:'PlantPal Plus',customer_type:'Nursery / garden center',volume:'Pallets',consent:true,request_id:'43a6e512-3241-4ac1-8953-d26152254f21'};
test('valid request is normalized',()=>assert.equal(validateSampleRequest(base).data.email,'qa@example.com'));
test('reject missing address, consent, invalid contact and product',()=>{for(const change of [{address:''},{consent:false},{email:'bad'},{phone:'1'},{product:'Unknown'}]) assert.ok(validateSampleRequest({...base,...change}).error);});
test('feedback does not require another mailing address',()=>assert.ok(validateSampleRequest({...base,kind:'feedback',address:'',project:'Trial completed.'}).data));
test('empty feedback and oversized input rejected',()=>{assert.ok(validateSampleRequest({...base,kind:'feedback'}).error);assert.ok(validateSampleRequest({...base,project:'x'.repeat(2001)}).error)});
test('honeypot has no data to persist',()=>assert.deepEqual(validateSampleRequest({...base,website:'spam'}),{honeypot:true}));
