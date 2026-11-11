import crypto from 'node:crypto';
export const PRODUCTS = ['PlantPal Plus', "Nature’s Blanket Premium Mulch", "Simon’s Gold", "Mikey’s Worm Poop", 'SuperBooster', 'Help me choose'];
export function validateSampleRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Please complete the form.' };
  if (JSON.stringify(body).length > 12000) return { error: 'Your request is too long.' };
  if (body.website) return { honeypot: true };
  const fields = ['name','email','phone','company','customer_type','address','address2','city','state','postal_code','country','volume','project','product','request_id','campaign'];
  const data = Object.fromEntries(fields.map(k => [k, typeof body[k] === 'string' ? body[k].trim() : '']));
  for (const [k,v] of Object.entries(data)) if (v.length > (k === 'project' ? 2000 : 200)) return {error: 'Please shorten the '+k.replaceAll('_',' ')+ ' field.'};
  data.email = data.email.toLowerCase();
  if (!data.name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email) || data.phone.replace(/\D/g,'').length < 7) return {error:'Enter your name, a valid email, and phone number.'};
  if (!PRODUCTS.includes(data.product)) return {error:'Choose a product or “Help me choose.”'};
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(data.request_id)) return {error:'Please refresh the page and try again.'};
  if (body.consent !== true) return {error:'Please acknowledge the sample program terms.'};
  const feedback = body.kind === 'feedback';
  if (!feedback && ['address','city','state','postal_code','country','customer_type','volume'].some(k=>!data[k])) return {error:'Complete your mailing address and project details.'};
  if (feedback && !data.project) return {error:'Please tell us how your trial went.'};
  return {data, feedback};
}
export async function handleSampleRequest(req, res) {
  res.setHeader('Cache-Control','no-store');
  if (req.method !== 'POST') {res.setHeader('Allow','POST');return res.status(405).json({error:'Use the sample request form.'});}
  const check = validateSampleRequest(req.body);
  if (check.honeypot) return res.json({success:true});
  if (check.error) return res.status(400).json({error:check.error});
  const {data,feedback} = check;
  const source = feedback ? 'osw_sample_feedback' : 'osw_sample_program';
  const ip = String(req.headers['x-vercel-forwarded-for'] || req.headers['x-forwarded-for'] || '').split(',')[0];
  const abuseKey = crypto.createHmac('sha256',process.env.JWT_SECRET).update(ip).digest('hex');
  const {default:pg} = await import('pg');
  const db = new pg.Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false},connectionTimeoutMillis:5000,statement_timeout:10000});
  try {
    await db.connect(); await db.query('BEGIN');
    // Serialize requests across server instances, without a new database table.
    await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',['sample-ip:'+abuseKey]);
    await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',['sample-email:'+data.email]);
    const prior = await db.query("SELECT id FROM sp_leads WHERE source=$1 AND lower(email)=$2 AND (source_data->>'request_id'=$3 OR created_at > now()-interval '24 hours') LIMIT 1",[source,data.email,data.request_id]);
    if (prior.rows.length) {await db.query('COMMIT');return res.json({success:true});}
    const rate = await db.query("SELECT count(*)::int n FROM sp_leads WHERE source IN ('osw_sample_program','osw_sample_feedback') AND source_data->>'abuse_key'=$1 AND created_at>now()-interval '1 hour'",[abuseKey]);
    if (rate.rows[0].n >= 8) {await db.query('ROLLBACK');return res.status(429).json({error:'Please try again later, or call (623) 263-3386.'});}
    const address = [data.address,data.address2,[data.city,data.state,data.postal_code].filter(Boolean).join(', '),data.country].filter(Boolean).join('\n');
    const message = [`${feedback?'SAMPLE FEEDBACK':'FREE SAMPLE REQUEST'} — team review required`, `Product: ${data.product}`,`Customer type: ${data.customer_type}`,`Typical volume: ${data.volume}`,`Phone: ${data.phone}`,`Mailing address:\n${address}`,`Project / feedback: ${data.project}`, 'Sample quantity, availability and shipping/delivery costs must be confirmed before fulfillment.'].join('\n\n');
    await db.query("INSERT INTO sp_leads (full_name,company,email,phone,message,source,source_url,source_data,status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'new')",[data.name,data.company,data.email,data.phone,message,source,'https://organicsoilwholesale.com/'+(feedback?'sample-feedback':'free-sample'),JSON.stringify({...data,abuse_key:abuseKey,brand_id:'organic_soil_wholesale',program:'sample-program-2026-11',consent:true,consent_version:'2026-11-11',fulfillment_status:'needs_review',kind:feedback?'feedback':'request'})]);
    await db.query('COMMIT');
    return res.status(201).json({success:true});
  } catch (e) {await db.query('ROLLBACK').catch(()=>{});console.error('sample_program_save_failed',e.code||'database_error');return res.status(503).json({error:'We could not save your request. Please try again or call (623) 263-3386.'});}
  finally {await db.end().catch(()=>{});}
}
