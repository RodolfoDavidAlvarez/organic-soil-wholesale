import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';

export const GIVEAWAY_REMINDER_KEY = 'phoenix-fall-garden-2026';
const CONTENT_SOURCE = readFileSync(new URL('./giveawayReminderContent.json', import.meta.url), 'utf8');
const CONTENT = JSON.parse(CONTENT_SOURCE);
const CONTENT_HASH = crypto.createHash('sha256').update(CONTENT_SOURCE).digest('hex');
const PUBLIC_ORIGIN = 'https://www.organicsoilwholesale.com';
const FROM = 'Soil Seed & Water <info@soilseedandwater.com>';

export function buildReminderPayload(job, { now = Date.now(), env = process.env } = {}) {
  const template = CONTENT[job.content_key];
  if (!template) throw new Error('Unknown reminder content');
  const at = new Date(job.scheduled_at);
  const lead = at.getTime() - now;
  if (!Number.isFinite(at.getTime()) || lead < (job.channel === 'sms' ? 15 * 60_000 : 60_000)) {
    throw new Error('Insufficient scheduling lead time; no immediate-send fallback');
  }
  if (job.channel === 'email') {
    const unsubscribe = `${PUBLIC_ORIGIN}/unsubscribe?email=${encodeURIComponent(job.destination)}`;
    const personalize = value => value.replaceAll(`${PUBLIC_ORIGIN}/unsubscribe`, unsubscribe);
    return {
      from: FROM, to: [job.destination], reply_to: 'ralvarez@soilseedandwater.com',
      subject: template.subject, html: personalize(template.html), text: personalize(template.text),
      scheduled_at: at.toISOString(), attachments: CONTENT.assets,
      headers: {
        'List-Unsubscribe': `<${PUBLIC_ORIGIN}/api/unsubscribe?email=${encodeURIComponent(job.destination)}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
      tags: [{ name: 'source', value: 'giveaway-reminder-queue' },
        { name: 'newsletter_id', value: job.reminder_id }, { name: 'campaign', value: GIVEAWAY_REMINDER_KEY }],
    };
  }
  const body = job.is_team ? template.team : template.text;
  if (!/^[\x20-\x7E]+$/.test(body) || body.length > 160 || !/Reply STOP/i.test(body)) {
    throw new Error('SMS must remain one reviewed ASCII segment with STOP');
  }
  if (!/^MG[0-9a-f]{32}$/i.test(env.GIVEAWAY_TWILIO_MESSAGING_SERVICE_SID || '')) {
    throw new Error('Verified giveaway Messaging Service is missing');
  }
  if (!env.GIVEAWAY_TWILIO_ACCOUNT_SID || !env.GIVEAWAY_TWILIO_AUTH_TOKEN || !/^\+1\d{10}$/.test(env.GIVEAWAY_TWILIO_PHONE_NUMBER || '')) {
    throw new Error('Giveaway SMS credentials or sender are missing');
  }
  return {
    To: job.destination, From: env.GIVEAWAY_TWILIO_PHONE_NUMBER, Body: body,
    MessagingServiceSid: env.GIVEAWAY_TWILIO_MESSAGING_SERVICE_SID,
    ScheduleType: 'fixed', SendAt: at.toISOString(),
    StatusCallback: `${PUBLIC_ORIGIN}/api/giveaway/reminders/sms-status`,
  };
}

function smsHeaders(env) {
  return { Authorization: `Basic ${Buffer.from(`${env.GIVEAWAY_TWILIO_ACCOUNT_SID}:${env.GIVEAWAY_TWILIO_AUTH_TOKEN}`).toString('base64')}` };
}
function smsUrl(env, id = '') {
  return `https://api.twilio.com/2010-04-01/Accounts/${env.GIVEAWAY_TWILIO_ACCOUNT_SID}/Messages${id ? `/${id}` : ''}.json`;
}
async function providerRequest(url, options, fetchImpl) {
  const response = await fetchImpl(url, { ...options, signal: AbortSignal.timeout(8000) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(`Provider HTTP ${response.status} (${result.code || result.name || 'error'})`);
    error.rejected = response.status < 500;
    error.retryable = response.status === 429;
    error.providerCode = result.code;
    throw error;
  }
  return result;
}

export async function scheduleReminder(job, { env = process.env, fetchImpl = fetch, now = Date.now(), deadline = Infinity } = {}) {
  const payload = buildReminderPayload(job, { now, env });
  if (job.channel === 'email') {
    const request = {
      method: 'POST', headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json',
        'Idempotency-Key': `giveaway-${job.id}` }, body: JSON.stringify(payload),
    };
    let result;
    try {
      result = await providerRequest('https://api.resend.com/emails', request, fetchImpl);
    } catch (error) {
      // Resend retains this exact request key for 24 hours. Replaying the same
      // key/body after a connection failure returns the original receipt or
      // creates it once. SMS has no equivalent guarantee and is never replayed.
      if (error.rejected || Date.now()+8500>deadline) throw error;
      await new Promise(resolve=>setTimeout(resolve,400));
      result = await providerRequest('https://api.resend.com/emails', request, fetchImpl);
    }
    if (!result.id) throw new Error('Provider accepted email without an ID; reconcile before retry');
    return { id: result.id, status: 'scheduled' };
  }
  const result = await providerRequest(smsUrl(env), {
    method: 'POST', headers: { ...smsHeaders(env), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(payload).toString(),
  }, fetchImpl);
  if (!result.sid || result.status !== 'scheduled') {
    const error = new Error('SMS schedule not confirmed; reconcile before retry');
    error.providerId = result.sid;
    throw error;
  }
  return { id: result.sid, status: result.status };
}

export async function cancelReminder(job, { env = process.env, fetchImpl = fetch } = {}) {
  if (!job.provider_id) throw new Error('Cannot cancel without provider ID');
  if (job.channel === 'email') {
    const headers = { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' };
    const current = await providerRequest(`https://api.resend.com/emails/${job.provider_id}`, { headers }, fetchImpl);
    if (current.last_event === 'canceled') return 'canceled';
    if (['sent','delivered','opened','clicked','bounced','complained'].includes(current.last_event)) return current.last_event;
    await providerRequest(`https://api.resend.com/emails/${job.provider_id}/cancel`, { method: 'POST', headers }, fetchImpl);
    const verified = await providerRequest(`https://api.resend.com/emails/${job.provider_id}`, { headers }, fetchImpl);
    if (verified.last_event !== 'canceled') throw new Error('Email cancellation not yet confirmed');
    return 'canceled';
  }
  const headers = smsHeaders(env);
  const current = await providerRequest(smsUrl(env, job.provider_id), { headers }, fetchImpl);
  if (current.status === 'canceled') return 'canceled';
  if (['sent','delivered','undelivered','failed'].includes(current.status)) return current.status;
  await providerRequest(smsUrl(env, job.provider_id), {
    method: 'POST', headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ Status: 'canceled' }).toString(),
  }, fetchImpl);
  const verified = await providerRequest(smsUrl(env, job.provider_id), { headers }, fetchImpl);
  if (verified.status !== 'canceled') throw new Error('SMS cancellation not yet confirmed');
  return 'canceled';
}

async function cancelPending(db, options, summary) {
  const { rows } = await db.query(`SELECT j.*,r.channel FROM giveaway_reminder_jobs j
    JOIN giveaway_reminders r ON r.id=j.reminder_id WHERE j.cancel_requested
    AND j.provider_id IS NOT NULL AND j.status IN ('scheduled','unknown','processing')
    ORDER BY j.updated_at LIMIT 30`);
  for (const job of rows) {
    if (Date.now() > options.deadline) break;
    try {
      const status = await cancelReminder(job, options);
      const terminal = status === 'canceled' ? 'canceled' : status === 'delivered' ? 'delivered'
        : ['sent','opened','clicked'].includes(status) ? 'sent' : 'failed';
      await db.query(`UPDATE giveaway_reminder_jobs SET status=$2,provider_status=$3,updated_at=now(),last_error=NULL WHERE id=$1`, [job.id,terminal,status]);
      summary.canceled += terminal === 'canceled' ? 1 : 0;
      summary.already_dispatched += terminal !== 'canceled' ? 1 : 0;
    } catch (error) {
      await db.query('UPDATE giveaway_reminder_jobs SET last_error=$2,updated_at=now() WHERE id=$1', [job.id,error.message]);
      summary.errors++;
    }
  }
}

// Twilio enforces STOP itself. Mirror inbound opt-outs locally without changing
// Agave's existing inbound webhook, so later enrollments also honor the opt-out.
async function syncSmsOptOuts(db, options) {
  const { env, fetchImpl } = options;
  if (!env.GIVEAWAY_TWILIO_ACCOUNT_SID) return;
  const start = new Date(Date.now() - 7 * 86400_000).toISOString().slice(0,10);
  const query = new URLSearchParams({ To: env.GIVEAWAY_TWILIO_PHONE_NUMBER, PageSize: '1000', 'DateSent>': start });
  const result = await providerRequest(`${smsUrl(env)}?${query}`, { headers: smsHeaders(env) }, fetchImpl);
  if (result.next_page_uri) throw new Error('Inbound opt-out history requires pagination; SMS scheduling held');
  for (const message of result.messages || []) {
    if (message.direction !== 'inbound' || !/^(STOP|STOPALL|UNSUBSCRIBE|CANCEL|END|QUIT|REVOKE|OPTOUT)$/i.test(String(message.body).trim())) continue;
    await db.query(`INSERT INTO message_suppressions(channel,destination,reason) VALUES('sms',$1,'Twilio inbound STOP')
      ON CONFLICT(channel,destination) DO NOTHING`, [message.from]);
  }
}

export async function runGiveawayReminderQueue(db, {
  env = process.env, fetchImpl = fetch, cancellationOnly = false, deadline = Date.now()+45_000,
  concurrency = 1, maxJobs = 50,
} = {}) {
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8 ||
      !Number.isInteger(maxJobs) || maxJobs < 1 || maxJobs > 200) {
    throw new Error('Worker limits must be 1–8 lanes and 1–200 jobs');
  }
  const options = { env, fetchImpl, deadline };
  const summary = { added: 0, scheduled: 0, canceled: 0, already_dispatched: 0, expired: 0, errors: 0 };
  // A durable lease also works through a transaction-mode connection pooler.
  const workerToken = crypto.randomUUID();
  const lock = await db.query(`UPDATE giveaway_reminder_campaigns SET worker_token=$2,
    worker_lease_until=now()+interval '90 seconds' WHERE campaign_key=$1
    AND (worker_lease_until IS NULL OR worker_lease_until<now()) RETURNING campaign_key`, [GIVEAWAY_REMINDER_KEY,workerToken]);
  if (!lock.rows.length) return { skipped: 'worker_already_running_or_campaign_missing' };
  let runId;
  try {
    runId = (await db.query('INSERT INTO giveaway_reminder_runs DEFAULT VALUES RETURNING id')).rows[0].id;
    const result = await db.query('SELECT reconcile_giveaway_reminders($1) AS result', [GIVEAWAY_REMINDER_KEY]);
    summary.added = result.rows[0].result.added || 0;
    summary.campaign_state = result.rows[0].result.campaign_state;
    await db.query(`UPDATE giveaway_reminder_jobs SET status='unknown',last_error='Interrupted dispatch; inspect provider before retry',updated_at=now()
      WHERE status='processing' AND claimed_at < now()-interval '5 minutes'`);
    await cancelPending(db, options, summary);
    if (cancellationOnly || summary.campaign_state !== 'active') return summary;
    const approved = (await db.query('SELECT approval FROM giveaway_reminder_campaigns WHERE campaign_key=$1',[GIVEAWAY_REMINDER_KEY])).rows[0]?.approval;
    if (approved?.content_sha256 !== CONTENT_HASH) {
      summary.hold='Content changed or not approved; review before scheduling';
      return summary;
    }
    // A request can lose its receipt near a worker deadline. Resend's original
    // key/body can be replayed for 24 hours without a duplicate; never do this
    // for SMS, opted-out recipients, changed content, or an expired key.
    const uncertainEmails = await db.query(`SELECT j.*,r.channel,r.content_key,r.scheduled_at,r.audience
      FROM giveaway_reminder_jobs j JOIN giveaway_reminders r ON r.id=j.reminder_id
      WHERE r.campaign_key=$1 AND r.channel='email' AND r.enabled
        AND j.status='unknown' AND NOT j.cancel_requested AND j.provider_id IS NULL
        AND j.claimed_at>now()-interval '23 hours' AND j.attempts<4
        AND r.scheduled_at>now()+interval '1 minute' ORDER BY j.claimed_at LIMIT 5`,[GIVEAWAY_REMINDER_KEY]);
    for (const job of uncertainEmails.rows) {
      if (Date.now()+8500>deadline) break;
      const eligible = (await db.query(`SELECT EXISTS(SELECT 1 FROM giveaway_eligible_recipients($1)
        WHERE channel='email' AND destination=$2 AND audience=$3) ok`,[GIVEAWAY_REMINDER_KEY,job.destination,job.audience])).rows[0].ok;
      if (!eligible) continue;
      await db.query('UPDATE giveaway_reminder_jobs SET attempts=attempts+1,updated_at=now() WHERE id=$1',[job.id]);
      try {
        const receipt = await scheduleReminder(job,options);
        await db.query(`UPDATE giveaway_reminder_jobs SET status='scheduled',provider_id=$2,provider_status=$3,
          provider_send_at=$4,last_error=NULL,updated_at=now() WHERE id=$1`,[job.id,receipt.id,receipt.status,job.scheduled_at]);
        summary.scheduled++;
        summary.recovered=(summary.recovered||0)+1;
      } catch(error) {
        await db.query(`UPDATE giveaway_reminder_jobs SET status=$2,last_error=$3,updated_at=now() WHERE id=$1`,
          [job.id,error.rejected&&!error.retryable?'failed':'unknown',error.message]);
        summary.errors++;
      }
    }
    let smsAllowed = true;
    try { await syncSmsOptOuts(db, options); } catch(error) { smsAllowed=false;summary.sms_hold=error.message; }
    // At one segment/person, reserve 200 of the shared sender's 1,000/day
    // T-Mobile allowance for other traffic. Never silently drop excess people.
    const smsCount = await db.query(`SELECT count(*)::int AS n FROM giveaway_eligible_recipients($1) WHERE channel='sms'`, [GIVEAWAY_REMINDER_KEY]);
    if (smsCount.rows[0].n > 800) {smsAllowed=false;summary.sms_hold='Audience exceeds reviewed one-segment SMS capacity; review required';}
    // The cloud worker retains one lane/50 jobs. A supervised initial upload
    // may overlap I/O with a shared lease and atomic SKIP LOCKED claims.
    // A shared gate caps new uploads at four/sec. At most one idempotent
    // email replay per upload stays below the verified ten requests/sec limit.
    let claimedCount = 0;
    let stopDispatch = false;
    let nextProviderStart = 0;
    let providerGate = Promise.resolve();
    function waitForProviderSlot() {
      const turn = providerGate.then(async()=>{
        const delay = nextProviderStart-Date.now();
        if (delay>0) await new Promise(resolve=>setTimeout(resolve,delay));
        nextProviderStart = Date.now()+250;
      });
      providerGate = turn.catch(()=>{});
      return turn;
    }
    async function drainLane() {
      while (!stopDispatch && claimedCount < maxJobs && Date.now()<deadline) {
        claimedCount++;
        const claimed = await db.query(`WITH candidate AS (
          SELECT j.id FROM giveaway_reminder_jobs j JOIN giveaway_reminders r ON r.id=j.reminder_id
          JOIN giveaway_reminder_campaigns c ON c.campaign_key=r.campaign_key
          WHERE j.status='ready' AND NOT j.cancel_requested AND c.state='active' AND c.approval IS NOT NULL
            AND c.expires_at>now() AND r.enabled AND (r.channel='email' OR (c.sms_sender_ready AND $1))
          ORDER BY r.scheduled_at,j.created_at,j.id FOR UPDATE OF j SKIP LOCKED LIMIT 1
        ) UPDATE giveaway_reminder_jobs j SET status='processing',claimed_at=now(),attempts=attempts+1,updated_at=now()
          FROM candidate x WHERE j.id=x.id RETURNING j.*`, [smsAllowed]);
        if (!claimed.rows.length) { stopDispatch = true; break; }
        const job = (await db.query(`SELECT j.*,r.channel,r.content_key,r.scheduled_at,r.audience FROM giveaway_reminder_jobs j
          JOIN giveaway_reminders r ON r.id=j.reminder_id WHERE j.id=$1`, [claimed.rows[0].id])).rows[0];
        const lead = new Date(job.scheduled_at).getTime()-Date.now();
        if (lead < (job.channel==='sms'?15*60_000:60_000)) {
          await db.query("UPDATE giveaway_reminder_jobs SET status='expired',last_error='Missed native scheduling lead time',updated_at=now() WHERE id=$1", [job.id]);
          summary.expired++;continue;
        }
        const eligible = await db.query(`SELECT EXISTS(SELECT 1 FROM giveaway_eligible_recipients($1)
          WHERE channel=$2 AND destination=$3 AND audience=$4) AS ok`,[GIVEAWAY_REMINDER_KEY,job.channel,job.destination,job.audience]);
        if (!eligible.rows[0].ok) {
          await db.query("UPDATE giveaway_reminder_jobs SET status='suppressed',cancel_requested=true,updated_at=now() WHERE id=$1",[job.id]);continue;
        }
        try {
          await waitForProviderSlot();
          const receipt = await scheduleReminder(job, options);
          await db.query(`UPDATE giveaway_reminder_jobs SET status='scheduled',provider_id=$2,provider_status=$3,
            provider_send_at=$4,last_error=NULL,updated_at=now() WHERE id=$1`,[job.id,receipt.id,receipt.status,job.scheduled_at]);
          summary.scheduled++;
        } catch(error) {
          const status = error.rejected ? (error.retryable && job.attempts<3?'ready':'failed') : 'unknown';
          await db.query(`UPDATE giveaway_reminder_jobs SET status=$2,provider_id=coalesce($3,provider_id),last_error=$4,updated_at=now() WHERE id=$1`,
            [job.id,status,error.providerId||null,error.message]);
          if (Number(error.providerCode)===21610) await db.query(`INSERT INTO message_suppressions(channel,destination,reason)
            VALUES('sms',$1,'Twilio opt-out 21610') ON CONFLICT DO NOTHING`,[job.destination]);
          summary.errors++;
          if (status==='unknown'||error.retryable) { stopDispatch = true; break; }
        }
        await new Promise(resolve=>setTimeout(resolve,550));
      }
    }
    // Settle every in-flight lane before releasing the lease, even if one fails.
    const lanes = await Promise.allSettled(Array.from({length:concurrency},()=>drainLane()));
    const failed = lanes.find(lane=>lane.status==='rejected');
    if (failed) throw failed.reason;
    await cancelPending(db, options, summary);
    return summary;
  } finally {
    if (runId) await db.query('UPDATE giveaway_reminder_runs SET finished_at=now(),summary=$2::jsonb WHERE id=$1',[runId,JSON.stringify(summary)]);
    await db.query('UPDATE giveaway_reminder_campaigns SET worker_token=NULL,worker_lease_until=NULL WHERE campaign_key=$1 AND worker_token=$2', [GIVEAWAY_REMINDER_KEY,workerToken]);
  }
}

export function validTwilioCallback(signature, body, authToken) {
  if (!authToken || !signature || !body || typeof body !== 'object') return false;
  const data = `${PUBLIC_ORIGIN}/api/giveaway/reminders/sms-status`+
    Object.keys(body).sort().map(key=>key+String(body[key])).join('');
  const expected = crypto.createHmac('sha1',authToken).update(data).digest('base64');
  const actual = String(signature);
  return expected.length===actual.length && crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(actual));
}

export async function recordSmsStatus(db, body) {
  const status = String(body.MessageStatus || body.SmsStatus || '');
  const terminal = {delivered:'delivered',failed:'failed',undelivered:'failed',canceled:'canceled',sent:'sent'}[status];
  if (!terminal || !/^SM[0-9a-f]{32}$/i.test(body.MessageSid || '')) return;
  await db.query(`UPDATE giveaway_reminder_jobs SET status=$2,provider_status=$3,updated_at=now()
    WHERE provider_id=$1 AND status NOT IN ('delivered','canceled')`,[body.MessageSid,terminal,status]);
  if (Number(body.ErrorCode)===21610 && body.To) await db.query(`INSERT INTO message_suppressions(channel,destination,reason)
    VALUES('sms',$1,'Twilio opt-out 21610') ON CONFLICT DO NOTHING`,[body.To]);
}
