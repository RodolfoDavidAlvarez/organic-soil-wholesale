if(location.hostname.endsWith('organicsoilwholesale.com')&&new URLSearchParams(location.hash.slice(1)).get('staff')==='1'){location.replace('https://sswworld.com/garden-bed-staff.html'+location.hash);throw Error('Opening staff checkout.')}
const $=s=>document.querySelector(s)
const fragment=new URLSearchParams(location.hash.slice(1))
const token=fragment.get('offer')||fragment.get('order')||''
document.querySelector('a[href="#choose"]').addEventListener('click',e=>{e.preventDefault();document.querySelector('#choose').scrollIntoView({behavior:'smooth'})})
let quote=null,busy=false
const money=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n/100)
async function api(action,body){const r=await fetch(`/api/garden-bed?action=${action}`,{method:body?'POST':'GET',credentials:'same-origin',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify({...body,token})}:{})});const d=await r.json();if(!r.ok)throw Error(d.error||'Please try again.');return d}
function error(e){$('#form-error').textContent=e.message;$('#form-error').hidden=false}
function row(parent,a,b,total=false){const x=document.createElement('div');if(total)x.className='total';const l=document.createElement('span'),r=document.createElement('span');l.textContent=a;r.textContent=b;x.append(l,r);parent.append(x)}
function invalidate(){quote=null;$('#review').hidden=true;$('#payment-consent').checked=false;$('#form-error').hidden=true}
$('#customer-form').addEventListener('input',invalidate)
document.querySelectorAll('[name=plan]').forEach(x=>x.addEventListener('change',invalidate))
if(token){$('#access-note').hidden=true}else{$('#review-button').disabled=true}
$('#customer-form').addEventListener('submit',async e=>{
  e.preventDefault();if(busy)return;busy=true;$('#review-button').disabled=true;$('#form-error').hidden=true
  try{
    const data=Object.fromEntries(new FormData(e.target));data.plan=$('[name=plan]:checked').value
    quote=await api('quote',data)
    if(quote.existing_order){location.hash=`order=${token}`;await status();return}
    $('#summary').replaceChildren();row($('#summary'),quote.is_test?'Staff test · no product or delivery':'Package',money(quote.subtotal_cents));row($('#summary'),'Tax',money(quote.tax_cents));row($('#summary'),'Delivery',quote.is_test?'Not applicable':'Free');row($('#summary'),'Order total',money(quote.total_cents),true)
    $('#payment-schedule').replaceChildren();quote.schedule.forEach((s,i)=>row($('#payment-schedule'),i===0?'Due today':`Payment ${i+1} · ${new Date(s.due_date+'T12:00:00').toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})}`,money(s.amount_cents),i===0));$('#consent-text').textContent=quote.terms;$('#payment-consent').checked=false;$('#pay-button').textContent=`Pay ${money(quote.schedule[0].amount_cents)} securely`;$('#review').hidden=false;$('#review').scrollIntoView({behavior:'smooth',block:'start'})
  }catch(e){error(e)}finally{busy=false;$('#review-button').disabled=!token}
})
$('#pay-button').addEventListener('click',async()=>{
  if(busy||!quote)return;if(!$('#payment-consent').checked){error(Error('Please accept the displayed payment authorization.'));return}
  busy=true;$('#pay-button').disabled=true
  try{const d=await api('checkout',{quote_id:quote.id,terms_digest:quote.terms_digest,accepted:true});const u=new URL(d.url);if(u.protocol!=='https:'||!['checkout.stripe.com','www.organicsoilwholesale.com','organicsoilwholesale.com'].includes(u.hostname))throw Error('Could not verify the payment link.');location.assign(u.href)}catch(e){error(e)}finally{busy=false;$('#pay-button').disabled=false}
})
async function status(){
  $('#offer').hidden=true;$('#delivery').hidden=false
  try{const d=await api('status');$('#payment-status').textContent=d.converted?`${d.order_number} · ${money(d.paid_cents)} received · ${money(d.balance_cents)} remaining${d.is_test?' · STAFF TEST — no delivery.':''}`:'Your payment has not been confirmed yet. Refresh this page in a moment or contact your representative.'
    if(d.checkout_url){const u=new URL(d.checkout_url);if(u.protocol==='https:'&&u.hostname==='checkout.stripe.com'){let a=document.createElement('a');a.href=u.href;a.textContent='Resume secure payment';a.className='button';$('#payment-status').after(a)}}
    if(d.status==='manual_review')$('#payment-status').textContent+=' · Office review required.'
    if(d.delivery_allowed){if(d.is_test)$('#delivery-content').querySelector('p').textContent='STAFF TEST — practice delivery preferences only. No product or truck will be scheduled.';$('#delivery-content').hidden=false;const a=d.address;$('#delivery-address').textContent=`Delivery address: ${[a.line1,a.line2,a.city,'AZ',a.postal_code].filter(Boolean).join(', ')}. Contact the office if this needs to change.`;const f=$('#delivery-form');f.elements.contact_name.value=a.name;f.elements.contact_phone.value=a.phone;const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/Phoenix',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(x=>[x.type,x.value]));const today=`${parts.year}-${parts.month}-${parts.day}`;f.elements.preferred_date.min=f.elements.alternative_date.min=today>'2026-11-01'?today:'2026-11-01';const availability=await api('slots');const available=availability.slots.filter(s=>s.available>0);let note=document.createElement('p');note.className='muted';note.textContent=available.length?'Weekday deliveries: two morning and two afternoon. Choose an available date below; the office confirms your request.':'The office is arranging routes. Contact your representative for availability.';$('#delivery-address').after(note);if(available.length){const original=f.elements.preferred_date;const select=document.createElement('select');select.name='preferred_date';select.required=true;const days=[...new Set(available.map(s=>s.day))];days.forEach(day=>{const opt=document.createElement('option');opt.value=day;opt.textContent=day+' · '+available.filter(s=>s.day===day).map(s=>s.window).join(' / ');select.append(opt)});original.replaceWith(select)}if(d.delivery_request){for(const [key,v]of Object.entries(d.delivery_request))if(f.elements[key]&&typeof v==='string')f.elements[key].value=v;$('#delivery-result').textContent=d.delivery_request.status==='confirmed'?'Your delivery is confirmed for '+d.delivery_request.preferred_date+' · '+d.delivery_request.window+'.':'Your preferences are saved. Scheduling is pending confirmation.'}}
  }catch(e){$('#payment-status').textContent=e.message}
}
$('#delivery-form').addEventListener('submit',async e=>{e.preventDefault();if(busy)return;busy=true;const btn=e.target.querySelector('button');btn.disabled=true;try{const b=Object.fromEntries(new FormData(e.target));b.acknowledged=e.target.elements.acknowledged.checked;const d=await api('delivery',b);$('#delivery-result').textContent=d.message}catch(e){$('#delivery-result').textContent=e.message}finally{busy=false;btn.disabled=false}})
if(fragment.has('order'))void status()
// Staff mode uses Stripe-hosted card fields. Raw card data never enters this application.
if(fragment.get('staff')==='1'&&token){
  const conf=await api('config')
  if(conf.manual_entry_enabled&&conf.publishable_key){
    const script=document.createElement('script');script.src='https://js.stripe.com/v3/';document.head.append(script);await new Promise((resolve,reject)=>{script.onload=resolve;script.onerror=reject})
    const stripe=window.Stripe(conf.publishable_key),elements=stripe.elements(),card=elements.create('card',{hidePostalCode:true,style:{base:{fontSize:'16px',color:'#264027'}}})
    const block=document.createElement('div');block.className='panel section';block.innerHTML='<h3>Staff card entry</h3><p class="muted">Read the payment authorization above to the customer. Stop call recording and transcription before collecting card details.</p><div id="stripe-card" class="card-note"></div><label class="check"><input id="recording-stopped" type="checkbox"><span>Call recording and transcription are stopped.</span></label><label class="check"><input id="customer-authorized" type="checkbox"><span>The customer authorized the exact amount, dates and saved-card terms shown above.</span></label><button id="manual-pay" type="button" class="wide">Collect authorized payment</button><p id="manual-result" role="status"></p>'
    $('#review').append(block);card.mount('#stripe-card')
    $('#manual-pay').addEventListener('click',async()=>{
      if(busy||!quote)return
      if(!$('#payment-consent').checked||!$('#recording-stopped').checked||!$('#customer-authorized').checked){$('#manual-result').textContent='Confirm all authorization and recording checkboxes first.';return}
      busy=true;$('#manual-pay').disabled=true
      try{const form=Object.fromEntries(new FormData($('#customer-form')));const result=await stripe.createPaymentMethod({type:'card',card,billing_details:{name:form.name,email:form.email,phone:form.phone,address:{line1:form.line1,line2:form.line2,city:form.city,state:'AZ',postal_code:form.postal_code,country:'US'}}});if(result.error)throw Error(result.error.message);const d=await api('manual-pay',{quote_id:quote.id,terms_digest:quote.terms_digest,accepted:true,customer_authorized:true,recording_stopped:true,payment_method:result.paymentMethod.id});card.clear();if(d.paid){location.hash=`order=${token}`;await status()}else $('#manual-result').textContent='Payment needs attention. Do not submit another charge. Check with the office.'}catch(e){$('#manual-result').textContent=e.message}finally{busy=false;$('#manual-pay').disabled=false}
    })
  }
}
