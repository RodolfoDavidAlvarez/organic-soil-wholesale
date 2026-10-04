import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {transformSync} from 'esbuild';
import * as garden from '../shared/gardenBedOrders.js';
const require=createRequire(import.meta.url);
const source=await readFile(new URL('../api/leads/submit.ts',import.meta.url),'utf8');
const compiled=transformSync(source,{loader:'ts',format:'cjs',target:'node20'}).code;
const valid={source:'osw_garden_bed_order',name:'Fixture Gardener',email:'fixture@example.com',phone:'6235550100',quantity:2,fulfillment:'pickup',contact_consent:true,request_token:'e6f8ea50-ec09-4c78-a011-e466599a10ee'};
test('file-based Vercel route validates before invoking the lead service',async()=>{
 const calls=[];const module={exports:{}};
 new Function('require','module','exports',compiled)((path)=>{
  if(path.includes('gardenBedOrders'))return garden;
  if(path.includes('leadSubmission'))return {processLeadSubmission:async p=>{calls.push(p);return {leadId:123,quantity:p.order.line_items[0].quantity}},LeadSubmissionError:class extends Error{}};
  return require(path);
 },module,module.exports);
 const handler=module.exports.default;
 const run=async body=>{const res={code:200,setHeader(){},status(n){this.code=n;return this},json(x){this.body=x;return this}};await handler({method:'POST',headers:{},body},res);return res};
 for(const override of [{quantity:0},{quantity:1.5},{contact_consent:false},{fulfillment:'delivery'}])assert.equal((await run({...valid,...override})).code,400);
 assert.equal(calls.length,0);
 const result=await run(JSON.stringify({...valid,unit_price:1}));assert.equal(result.code,200);assert.equal(result.body.quantity,2);assert.equal(calls[0].order.estimated_total,1198);
});
