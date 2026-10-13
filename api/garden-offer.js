const ORIGIN = 'https://www.organicsoilwholesale.com'
const METHODS = Object.freeze({config:'GET',slots:'GET',status:'GET',quote:'POST',checkout:'POST',delivery:'POST'})
const FIELDS = Object.freeze({quote:['plan','name','email','phone','line1','line2','city','state','postal_code','discount_code'],checkout:['quote_id','terms_digest','accepted','future_card_accepted','future_card_terms_digest'],delivery:['preferred_date','alternative_date','window','contact_name','contact_phone','access_notes','acknowledged']})
export default async function handler(req,res) {
  res.setHeader('Cache-Control','private, no-store')
  res.setHeader('Referrer-Policy','no-referrer')
  res.setHeader('X-Content-Type-Options','nosniff')
  const action=String(req.query?.action||req.body?.action||'config')
  if(!Object.hasOwn(METHODS,action)||METHODS[action]!==req.method)return res.status(405).json({error:'Action not supported.'})
  if(req.headers?.['sec-fetch-site']==='cross-site'||(req.headers?.origin&&![ORIGIN,'https://organicsoilwholesale.com'].includes(req.headers.origin)))return res.status(403).json({error:'Open your offer on Organic Soil Wholesale.'})
  const body=req.body||{}
  if(typeof body!=='object'||Array.isArray(body)||Buffer.byteLength(JSON.stringify(body))>10000)return res.status(400).json({error:'Invalid request.'})
  if(Object.keys(body).some(k=>/^(card_number|number|cvc|cvv|card|pan|exp_month|exp_year)$/i.test(k)))return res.status(400).json({error:'Use secure Stripe checkout for card details.'})
  const token=String(req.headers?.authorization?.replace(/^Bearer /,'')||body.token||'')
  if(!['config','slots'].includes(action)&&!/^[-\w]{43}$/.test(token))return res.status(404).json({error:'Open your personal offer link from your representative.'})
  const payload=Object.fromEntries((FIELDS[action]||[]).filter(k=>Object.hasOwn(body,k)).map(k=>[k,body[k]]))
  try {
    const upstream=await fetch(`https://sswworld.com/api/garden-bed?action=${action}`,{method:req.method,redirect:'error',signal:AbortSignal.timeout(50000),headers:{'Content-Type':'application/json',Origin:ORIGIN,...(token?{Authorization:`Bearer ${token}`}:{})},...(req.method==='POST'?{body:JSON.stringify({...payload,token})}:{})})
    const data=await upstream.json()
    if(action==='config')return res.status(upstream.status).json({prices:data.prices,version:data.version,payments_enabled:data.payments_enabled,manual_entry_enabled:false,future_card_reuse_enabled:data.future_card_reuse_enabled===true})
    return res.status(upstream.status).json(data)
  }catch{return res.status(503).json({error:'The payment service is temporarily unavailable. Check your payment status before trying again or call (623) 263-3386.'})}
}
