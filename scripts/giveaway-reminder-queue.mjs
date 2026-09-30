#!/usr/bin/env node
import fs from 'node:fs';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import pg from 'pg';
import {runGiveawayReminderQueue,GIVEAWAY_REMINDER_KEY} from '../shared/giveawayReminderQueue.js';

const args=Object.fromEntries(process.argv.slice(2).map(x=>x.split(/=(.*)/s).slice(0,2)));
const env={...dotenv.parse(fs.readFileSync(args['--env']||'.env.production.local')),...process.env};
const action=args['--action']||'status';
const db=new pg.Client({connectionString:env.DATABASE_URL,ssl:{rejectUnauthorized:false},connectionTimeoutMillis:5000});
await db.connect();
try {
  if(action==='activate' || action==='activate-and-drain') {
    if(args['--confirm']!=='ACTIVATE-APPROVED-GIVEAWAY' || !args['--approval-note']) throw new Error('Activation requires the final owner approval record');
    if(!('--send' in args) || !('--allow-production' in args)) throw new Error('Public activation requires --send --allow-production');
    if(args['--sms-sender-reviewed']!=='true') throw new Error('Confirm sender registration and capacity before SMS activation');
    const first=Date.parse(args['--first-send-at']);
    const initial=(await db.query(`SELECT count(*)::int n FROM giveaway_reminder_jobs j JOIN giveaway_reminders r ON r.id=j.reminder_id
      WHERE r.campaign_key=$1 AND r.scheduled_at IS NULL AND j.status='held' AND NOT j.cancel_requested`,[GIVEAWAY_REMINDER_KEY])).rows[0].n;
    // Account for individual provider calls and the minute worker before choosing
    // a simultaneous first-send time. Never expire most of a large initial batch.
    const expedited=action==='activate-and-drain';
    // The supervised upload is capped at four new requests/sec.
    // Only use the shorter lead when this same process immediately drains it.
    const minimumLeadMinutes=expedited?Math.ceil(initial/120)+5:Math.ceil(initial/30)+15;
    if(!Number.isFinite(first)||first<Date.now()+minimumLeadMinutes*60_000||first>=Date.parse('2026-10-02T00:00:00-07:00')) {
      throw new Error(`Initial send needs at least ${minimumLeadMinutes} minutes to queue safely and must be before Friday`);
    }
    const hash=crypto.createHash('sha256').update(fs.readFileSync(new URL('../shared/giveawayReminderContent.json',import.meta.url))).digest('hex');
    await db.query('BEGIN');
    const c=(await db.query('SELECT * FROM giveaway_reminder_campaigns WHERE campaign_key=$1 FOR UPDATE',[GIVEAWAY_REMINDER_KEY])).rows[0];
    if(c?.state!=='held'||c.approval) throw new Error('Campaign already approved or not held; inspect before changing it');
    await db.query(`UPDATE giveaway_reminders SET scheduled_at=$2,enroll_until=$2 WHERE campaign_key=$1 AND scheduled_at IS NULL`,[GIVEAWAY_REMINDER_KEY,new Date(first)]);
    await db.query(`UPDATE giveaway_reminder_campaigns SET state='active',sms_sender_ready=true,approval=$2::jsonb,updated_at=now() WHERE campaign_key=$1`,
      [GIVEAWAY_REMINDER_KEY,JSON.stringify({owner:'Rodolfo Alvarez',recorded_at:new Date().toISOString(),note:args['--approval-note'],content_sha256:hash,future_eligible_signups_included:true})]);
    await db.query('SELECT reconcile_giveaway_reminders($1)',[GIVEAWAY_REMINDER_KEY]);
    await db.query('COMMIT');
    console.log('Activation recorded. Cloud worker will schedule approved messages.');
    if(expedited) await drainApprovedQueue();
  } else if(action==='drain') {
    if(!('--send' in args) || !('--allow-production' in args)) throw new Error('Drain requires --send --allow-production');
    await drainApprovedQueue();
  } else if(action==='reconcile') {
    console.log(JSON.stringify((await db.query('SELECT reconcile_giveaway_reminders($1) AS result',[GIVEAWAY_REMINDER_KEY])).rows[0].result));
  } else if(action==='wake') {
    console.log(JSON.stringify(await runGiveawayReminderQueue(db,{env})));
  } else if(action!=='status') throw new Error('Use status, reconcile, wake, activate, activate-and-drain, or drain');
  const campaign=(await db.query('SELECT campaign_key,state,expires_at,approval IS NOT NULL AS approved,sms_sender_ready FROM giveaway_reminder_campaigns WHERE campaign_key=$1',[GIVEAWAY_REMINDER_KEY])).rows;
  const schedule=(await db.query(`SELECT r.id,r.channel,r.scheduled_at,j.status,count(j.id)::int jobs FROM giveaway_reminders r
    LEFT JOIN giveaway_reminder_jobs j ON j.reminder_id=r.id WHERE r.campaign_key=$1 GROUP BY r.id,j.status ORDER BY r.scheduled_at NULLS FIRST,r.id`,[GIVEAWAY_REMINDER_KEY])).rows;
  console.log(JSON.stringify({campaign,schedule},null,2));
} catch(error) {await db.query('ROLLBACK').catch(()=>{});console.error(error.message);process.exitCode=1;}
finally {await db.end();}

async function drainApprovedQueue() {
  const pool=new pg.Pool({connectionString:env.DATABASE_URL,ssl:{rejectUnauthorized:false},connectionTimeoutMillis:5000,max:8});
  try {
    for (;;) {
      const c=(await pool.query('SELECT state,approval FROM giveaway_reminder_campaigns WHERE campaign_key=$1',[GIVEAWAY_REMINDER_KEY])).rows[0];
      if(c?.state!=='active'||!c.approval) throw new Error('Drain requires an active approved campaign');
      const result=await runGiveawayReminderQueue(pool,{env,concurrency:8,maxJobs:200});
      const pending=(await pool.query(`SELECT r.id,j.status,count(*)::int n FROM giveaway_reminder_jobs j JOIN giveaway_reminders r ON r.id=j.reminder_id
        WHERE r.campaign_key=$1 AND j.status IN ('ready','processing','unknown','failed','expired') GROUP BY r.id,j.status`,[GIVEAWAY_REMINDER_KEY])).rows;
      console.log(JSON.stringify({at:new Date().toISOString(),result,pending}));
      if(result.errors||result.hold||result.sms_hold||pending.some(x=>['unknown','failed','expired'].includes(x.status))) throw new Error('Inspect queue errors before continuing the approved upload');
      if(!pending.length) break;
      if(result.skipped) await new Promise(resolve=>setTimeout(resolve,5000));
    }
  } finally {await pool.end();}
}
