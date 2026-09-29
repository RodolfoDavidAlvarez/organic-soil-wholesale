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
  if(action==='activate') {
    if(args['--confirm']!=='ACTIVATE-APPROVED-GIVEAWAY' || !args['--approval-note']) throw new Error('Activation requires the final owner approval record');
    if(args['--sms-sender-reviewed']!=='true') throw new Error('Confirm sender registration and capacity before SMS activation');
    const first=Date.parse(args['--first-send-at']);
    if(!Number.isFinite(first)||first<Date.now()+10*60_000||first>=Date.parse('2026-10-02T00:00:00-07:00')) throw new Error('Choose a future initial send at least 10 minutes ahead and before Friday');
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
  } else if(action==='reconcile') {
    console.log(JSON.stringify((await db.query('SELECT reconcile_giveaway_reminders($1) AS result',[GIVEAWAY_REMINDER_KEY])).rows[0].result));
  } else if(action==='wake') {
    console.log(JSON.stringify(await runGiveawayReminderQueue(db,{env})));
  } else if(action!=='status') throw new Error('Use status, reconcile, wake, or activate');
  const campaign=(await db.query('SELECT campaign_key,state,expires_at,approval IS NOT NULL AS approved,sms_sender_ready FROM giveaway_reminder_campaigns WHERE campaign_key=$1',[GIVEAWAY_REMINDER_KEY])).rows;
  const schedule=(await db.query(`SELECT r.id,r.channel,r.scheduled_at,j.status,count(j.id)::int jobs FROM giveaway_reminders r
    LEFT JOIN giveaway_reminder_jobs j ON j.reminder_id=r.id WHERE r.campaign_key=$1 GROUP BY r.id,j.status ORDER BY r.scheduled_at NULLS FIRST,r.id`,[GIVEAWAY_REMINDER_KEY])).rows;
  console.log(JSON.stringify({campaign,schedule},null,2));
} catch(error) {await db.query('ROLLBACK').catch(()=>{});console.error(error.message);process.exitCode=1;}
finally {await db.end();}
