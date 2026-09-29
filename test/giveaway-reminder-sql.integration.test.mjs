import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import pg from 'pg';
import dotenv from 'dotenv';

test('transactional queue enrollment, deduplication, opt-outs, late entries, and access controls',async()=>{
  const env=dotenv.parse(fs.readFileSync('.env.production.local'));
  const db=new pg.Client({connectionString:env.DATABASE_URL,ssl:{rejectUnauthorized:false}});
  await db.connect();
  try {
    const migration=fs.readFileSync('supabase/migrations/20260929_giveaway_reminder_queue.sql','utf8').replace(/COMMIT;\s*$/,'');
    await db.query(migration); // Includes BEGIN; every fixture and DDL is rolled back below.
    await db.query("SET LOCAL statement_timeout='10s'");
    const key='queue-integration-fixture';
    await db.query(`INSERT INTO giveaway_reminder_campaigns(campaign_key,expires_at,sms_permission_evidence)
      VALUES($1,now()+interval '7 days','fixture consent')`,[key]);
    await db.query(`INSERT INTO giveaway_reminders(id,campaign_key,channel,audience,content_key,scheduled_at)
      VALUES('fixture-future',$1,'email','entrants','email-2',now()+interval '1 day'),
        ('fixture-past',$1,'email','entrants','email-2',now()-interval '1 day'),
        ('fixture-sms',$1,'sms','entrants','sms-friday',now()+interval '1 day'),
        ('fixture-invitation',$1,'email','invitation','email-invitation',now()+interval '1 day')`,[key]);
    await db.query(`INSERT INTO sp_customers(full_name,email,newsletter_subscribed) VALUES('Test fixture','queue-fixture@example.invalid',true)`);
    await db.query('SELECT reconcile_giveaway_reminders($1)',[key]);
    assert.equal((await db.query("SELECT status FROM giveaway_reminder_jobs WHERE reminder_id='fixture-invitation' AND destination='queue-fixture@example.invalid'")).rows[0].status,'held');
    const entry=async(email,phone)=>db.query(`INSERT INTO sp_giveaway_entries(campaign_key,source,full_name,email,email_normalized,phone,zip_code,customer_type,garden_status,email_consent,rules_consent)
      VALUES($1,'queue-test','Queue Fixture',$2,$2,$3,'85009','homeowner','brand-new',true,true) RETURNING id`,[key,email,phone]);
    await entry('queue-fixture@example.invalid','6025550101');
    await entry('queue-only-fixture@example.invalid','6025550101');
    for(let i=0;i<2;i++)await db.query('SELECT reconcile_giveaway_reminders($1)',[key]);
    const jobs=(await db.query("SELECT reminder_id,status,destination FROM giveaway_reminder_jobs WHERE reminder_id LIKE 'fixture-%'")).rows;
    assert.equal(jobs.filter(j=>j.reminder_id==='fixture-future').length,2);
    assert.equal(jobs.filter(j=>j.reminder_id==='fixture-past').length,0);
    assert.equal(jobs.filter(j=>j.reminder_id==='fixture-sms').length,1);
    assert.equal(jobs.find(j=>j.reminder_id==='fixture-invitation'&&j.destination==='queue-fixture@example.invalid').status,'suppressed');
    await db.query("UPDATE giveaway_reminder_jobs SET status='scheduled',provider_id='fixture-provider' WHERE reminder_id='fixture-future' AND destination='queue-only-fixture@example.invalid'");
    await db.query("SELECT unsubscribe_email_address('QUEUE-ONLY-FIXTURE@example.invalid','fixture')");
    const opted=(await db.query("SELECT newsletter_subscribed,newsletter_unsubscribed_at FROM sp_customers WHERE email='queue-only-fixture@example.invalid'")).rows[0];
    assert.equal(opted.newsletter_subscribed,false);assert.ok(opted.newsletter_unsubscribed_at);
    const canceled=(await db.query("SELECT cancel_requested,status FROM giveaway_reminder_jobs WHERE provider_id='fixture-provider'")).rows[0];
    assert.equal(canceled.cancel_requested,true);assert.equal(canceled.status,'scheduled');
    await db.query("SELECT unsubscribe_email_address('queue-only-fixture@example.invalid','repeat')");
    assert.equal((await db.query("SELECT count(*)::int n FROM sp_customers WHERE email='queue-only-fixture@example.invalid'")).rows[0].n,1);
    await db.query(`UPDATE giveaway_reminder_campaigns SET state='active',approval='{"fixture":true}',sms_sender_ready=true WHERE campaign_key=$1`,[key]);
    await db.query('SELECT reconcile_giveaway_reminders($1)',[key]);
    assert.equal((await db.query("SELECT status FROM giveaway_reminder_jobs WHERE reminder_id='fixture-future' AND destination='queue-fixture@example.invalid'")).rows[0].status,'ready');
    assert.equal((await db.query("SELECT count(*)::int n FROM giveaway_eligible_recipients($1) WHERE channel='email' AND destination='queue-only-fixture@example.invalid'",[key])).rows[0].n,0);
    await db.query("UPDATE giveaway_reminder_campaigns SET state='paused' WHERE campaign_key=$1",[key]);
    await db.query('SELECT reconcile_giveaway_reminders($1)',[key]);
    assert.equal((await db.query("SELECT count(*)::int n FROM giveaway_reminder_jobs WHERE reminder_id LIKE 'fixture-%' AND status='ready'")).rows[0].n,0);
    const acl=await db.query("SELECT has_table_privilege('anon','message_suppressions','SELECT') AS anon,has_function_privilege('anon','unsubscribe_email_address(text,text)','EXECUTE') AS rpc");
    assert.equal(acl.rows[0].anon,false);assert.equal(acl.rows[0].rpc,false);
  } finally {await db.query('ROLLBACK');await db.end();}
});
