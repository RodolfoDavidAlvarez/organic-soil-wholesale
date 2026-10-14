// Browser fixtures only; no live API or Stripe requests.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import {existsSync} from 'node:fs'
import path from 'node:path'
import {createRequire} from 'node:module'
import {createServer} from 'node:http'
const {chromium}=createRequire(import.meta.url)('playwright')
const storefront=existsSync('client/public/garden-bed-offer.html')
const root=path.resolve(storefront?'client/public':'public'),pagePath=storefront?'/garden-bed-offer.html':'/garden-bed-staff.html'
let browser,server,origin
test.before(async()=>{
 server=createServer(async(req,res)=>{try{const filename=path.join(root,new URL(req.url,'http://local').pathname);res.setHeader('Content-Type',filename.endsWith('.js')?'text/javascript':filename.endsWith('.css')?'text/css':filename.endsWith('.html')?'text/html':'image/jpeg');res.end(await fs.readFile(filename))}catch{res.writeHead(404);res.end()}})
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin=`http://127.0.0.1:${server.address().port}`;browser=await chromium.launch({headless:true})
})
test.after(async()=>{await browser?.close();await new Promise(resolve=>server?.close(resolve))})
async function fixture(){
 const page=await browser.newPage();const requests=[]
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());if(url.origin!==origin)return route.abort()
  if(url.pathname!='/api/garden-bed')return route.continue()
  const action=url.searchParams.get('action'),token=route.request().headers().authorization;requests.push({action,token})
  let data={status:'awaiting_payment'}
  if(action==='config')data={manual_entry_enabled:false,ach_enabled:false}
  if(action==='quote')data={id:'quote-'+token,terms_digest:'digest',subtotal_cents:token==='Bearer B'?94543:100,tax_cents:0,total_cents:token==='Bearer B'?94543:100,terms:'Fixture authorization',schedule:[{number:1,due_date:'2026-10-13',amount_cents:token==='Bearer B'?94543:100}]}
  if(action==='checkout')throw Error('Unexpected payment request')
  return route.fulfill({json:data})
 })
 await page.goto(origin+pagePath+'#offer=A');await page.waitForFunction(()=>!document.querySelector('#review-button').disabled)
 return {page,requests}
}
async function quote(page){
 for(const [name,value]of Object.entries({name:'Fixture',email:'fixture@example.invalid',phone:'6235550100',line1:'1634 N 19th Ave',city:'Phoenix',postal_code:'85009'}))await page.locator(`[name=${name}]`).fill(value)
 await page.locator('#customer-form input[type=checkbox]').check();await page.locator('#review-button').click();await page.locator('#review').waitFor({state:'visible'})
}
async function change(page,hash){
 await Promise.all([page.waitForEvent('load'),page.evaluate(hash=>{location.hash=hash},hash)])
 await page.waitForFunction(()=>!document.querySelector('#review-button').disabled)
}
test('same-document A to B reloads old quote and consent before using the new token',async()=>{
 const {page,requests}=await fixture();await quote(page);await page.locator('#payment-consent').check()
 await change(page,'offer=B')
 assert.equal(await page.locator('#review').isVisible(),false);assert.equal(await page.locator('#payment-consent').isChecked(),false)
 assert.equal(await page.locator('[name=name]').inputValue(),'')
 await quote(page);assert.match(await page.locator('#summary').innerText(),/945\.43/)
 assert.deepEqual(requests.filter(r=>r.action==='quote').map(r=>r.token),['Bearer A','Bearer B'])
 await page.close()
})
test('order and staff identity changes reload even when the underlying token is unchanged',async()=>{
 const {page,requests}=await fixture()
 await change(page,'order=A');assert.equal(requests.filter(r=>r.action==='status').length,2)
 await change(page,'order=A&staff=1');assert.equal(await page.locator('body').evaluate(n=>n.classList.contains('staff-mode')),true)
 assert.equal(requests.filter(r=>r.action==='status').length,3);await page.close()
})
test('Choose payment option only scrolls and preserves the offer token without reload',async()=>{
 const {page,requests}=await fixture();await page.locator('a[href="#choose"]').click()
 assert.equal(new URL(page.url()).hash,'#offer=A');await quote(page)
 assert.equal(requests.filter(r=>r.action==='status').length,1);assert.equal(requests.find(r=>r.action==='quote').token,'Bearer A');await page.close()
})

test('payment click in the same task as a hash change cannot submit the previous offer',async()=>{
 const {page,requests}=await fixture();await quote(page);await page.locator('#payment-consent').check()
 await Promise.all([page.waitForEvent('load'),page.evaluate(()=>{location.hash='offer=B';document.querySelector('#pay-button').click()})])
 await page.waitForFunction(()=>!document.querySelector('#review-button').disabled)
 assert.equal(requests.filter(r=>r.action==='checkout').length,0);assert.equal(await page.locator('#payment-consent').isChecked(),false)
 await page.close()
})
