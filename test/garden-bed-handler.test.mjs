import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeGardenBedRequest } from '../shared/gardenBedOrders.js';
const source=await readFile(new URL('../api/index.js',import.meta.url),'utf8');
const route=source.slice(source.indexOf("    // POST /api/leads/submit\n"),source.indexOf('    // ========== SCHEDULING ENDPOINTS'));
const execute=new (Object.getPrototypeOf(async function(){}).constructor)('req','res','normalizeGardenBedRequest','enrichMirroredGardenBedLead','getSupabase','getResend','fetch','process','escapeHtml',"const path='/api/leads/submit', requestId='fixture', startedAt=Date.now();\n"+route);
function fixture({dbFailure=false, emailFailure=false}={}){
 const rows=[],emails=[],leads=[];
 const sb={from(table){let inserted,reference;return {
  select(){return this},eq(){return this},limit(){return this},like(_k,v){reference=v.slice(1);return this},
  insert(row){inserted=row;return this},
  async maybeSingle(){return {data:rows.find(x=>x.message.endsWith(reference))||null}},
  async single(){if(dbFailure)return {error:{message:'fixture failure'}};const row={...inserted,id:rows.length+1};rows.push(row);return {data:row}},
  then(resolve){return Promise.resolve({data:table==='admin_notifications'?[{email:'fixture@example.com'}]:[]}).then(resolve)}
 }}};
 return {rows,emails,leads,async request(body){const res={code:200,setHeader(){},status(n){this.code=n;return this},json(body){this.body=body;return this}};
 await execute({body,method:'POST'},res,normalizeGardenBedRequest,async()=>false,async()=>sb,async()=>({emails:{async send(message){if(emailFailure)throw Error('fixture email failure');emails.push(message);return {data:{id:'fixture'}};}}}),async(url,options)=>{leads.push(JSON.parse(options.body));return {ok:true}}, {env:{MOS_LEAD_INGEST_SECRET:'test-only'}},value=>String(value).replaceAll('<','&lt;').replaceAll('>','&gt;'));
 return res;
 }};
}
const valid={source:'osw_garden_bed_order',name:'Fixture Gardener',email:'fixture@example.com',phone:'6235550100',quantity:3,fulfillment:'delivery',zip:'85009',contact_consent:true,notes:'<script>fixture</script>',request_token:'e6f8ea50-ec09-4c78-a011-e466599a10ee'};
test('actual deployed handler saves, routes, escapes notification, and deduplicates retry',async()=>{
 const f=fixture();const first=await f.request({...valid,order:{estimated_total:0}});
 assert.equal(first.code,200);assert.equal(first.body.leadId,1);assert.equal(f.rows.length,1);
 assert.match(f.rows[0].subject,/Garden bed order request/);assert.match(f.rows[0].message,/1797/);
 assert.match(f.rows[0].message,/85009/);assert.equal(f.emails.length,1);assert.ok(!f.emails[0].html.includes('<script>'));
 assert.equal(f.leads.length,1);assert.equal(f.leads[0].source_data.order.line_items[0].quantity,3);
 assert.equal(f.leads[0].source_data.order.estimated_total,1797);
 const second=await f.request({...valid,quantity:4});assert.equal(second.body.leadId,1);assert.equal(second.body.quantity,3);assert.equal(f.rows.length,1);assert.equal(f.emails.length,1);assert.equal(f.leads.length,1);
});
test('invalid quantities and missing consent cause no writes or notifications',async()=>{
 const f=fixture();for(const override of [{quantity:0},{quantity:1.2},{contact_consent:false},{zip:'x'}]){const r=await f.request({...valid,...override});assert.equal(r.code,400)}
 assert.equal(f.rows.length,0);assert.equal(f.emails.length,0);assert.equal(f.leads.length,0);
});
test('database failure is never shown as a successful request',async()=>{
 const f=fixture({dbFailure:true});const r=await f.request(valid);assert.equal(r.code,500);assert.equal(f.emails.length,0);assert.equal(f.leads.length,0);
});
test('saved requests stay successful if email fails and still reach sales intake',async()=>{
 const f=fixture({emailFailure:true});const r=await f.request(valid);assert.equal(r.code,200);assert.equal(f.rows.length,1);assert.equal(f.leads.length,1);
});
