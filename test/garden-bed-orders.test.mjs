import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeGardenBedRequest, GARDEN_BED } from '../shared/gardenBedOrders.js';
const valid = {name:'Garden Test',email:'test@example.com',phone:'(623) 555-0100',quantity:2,fulfillment:'pickup',contact_consent:true,request_token:'e6f8ea50-ec09-4c78-a011-e466599a10ee',notes:'Please call in the afternoon.'};
test('server computes price and preserves all requested order details',()=>{
 const {payload:p}=normalizeGardenBedRequest({...valid,order:{estimated_total:1},unit_price:1});
 assert.equal(p.order.estimated_total,1198);assert.equal(p.order.line_items[0].unit_price,599);
 assert.equal(p.order.line_items[0].quantity,2);assert.match(p.notes,/afternoon/);
 for(const included of GARDEN_BED.included) assert.ok(p.notes.includes(included));
 assert.match(p.notes,/No payment collected/);assert.match(p.notes,/mulch.*not included/);
 assert.match(p.notes,/no marketing subscription/);
});
for(const [field,value] of [['quantity',0],['quantity',1.5],['quantity',101],['quantity','2'],['quantity',null],['email','bad'],['phone','1234'],['name',' '],['fulfillment','free_shipping'],['contact_consent',false],['request_token','anything']]){
 test(`reject invalid ${field}=${value}`,()=>assert.ok(normalizeGardenBedRequest({...valid,[field]:value}).error));
}
test('delivery requires valid ZIP and stores it without inventing delivery price',()=>{
 assert.ok(normalizeGardenBedRequest({...valid,fulfillment:'delivery'}).error);
 const {payload:p}=normalizeGardenBedRequest({...valid,fulfillment:'delivery',zip:'85009'});
 assert.equal(p.order.delivery_zip,'85009');assert.equal(p.order.delivery_fee,undefined);assert.match(p.notes,/separate|not included/);
});
test('honeypot skips request processing',()=>assert.equal(normalizeGardenBedRequest({website:'bot'}).honeypot,true));
test('contact inputs trimmed, email normalized, and notes bounded',()=>{
 const {payload:p}=normalizeGardenBedRequest({...valid,name:'  Garden Test  ',email:' TEST@example.com ',notes:'x'.repeat(3000)});
 assert.equal(p.name,'Garden Test');assert.equal(p.email,'test@example.com');assert.ok(p.notes.length<3000);
});
