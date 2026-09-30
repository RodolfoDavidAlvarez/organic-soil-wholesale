import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import pg from 'pg';
import dotenv from 'dotenv';

test('delivery suppression cancels later reminders without a newsletter customer row',async()=>{
  const env=dotenv.parse(fs.readFileSync('.env.production.local'));
  const db=new pg.Client({connectionString:env.DATABASE_URL,ssl:{rejectUnauthorized:false}});
  await db.connect();
  try {
    await db.query(fs.readFileSync('supabase/migrations/20260930_giveaway_bounce_suppression.sql','utf8').replace(/COMMIT;\s*$/,''));
    await db.query("SET LOCAL statement_timeout='10s'");
    await db.query(`INSERT INTO giveaway_reminder_campaigns(campaign_key,expires_at)
      VALUES('bounce-fixture',now()+interval '7 days')`);
    await db.query(`INSERT INTO giveaway_reminders(id,campaign_key,channel,audience,content_key,scheduled_at)
      VALUES('bounce-fixture-first','bounce-fixture','email','entrants','email-1',now()+interval '1 day'),
        ('bounce-fixture-next','bounce-fixture','email','entrants','email-2',now()+interval '2 days')`);
    for (const event of ['bounced','complained','suppressed','failed']) {
      const email=`bounce-fixture-${event}@example.invalid`;
      const provider=`bounce-fixture-provider-${event}`;
      assert.equal((await db.query('SELECT count(*)::int n FROM sp_customers WHERE email=$1',[email])).rows[0].n,0);
      await db.query(`INSERT INTO giveaway_reminder_jobs(reminder_id,destination,status,provider_id)
        VALUES('bounce-fixture-first',$1,'scheduled',$2),('bounce-fixture-next',$1,'scheduled',$3)`,[email,provider,provider+'-next']);
      for(let repeat=0;repeat<2;repeat++) await db.query(`INSERT INTO email_events(email,event_type,resend_email_id)
        VALUES($1,$2,$3) ON CONFLICT DO NOTHING`,[email,event,provider]);
      const suppression=(await db.query("SELECT count(*)::int n FROM message_suppressions WHERE channel='email' AND destination=$1",[email])).rows[0].n;
      assert.equal(suppression,event==='failed'?0:1);
      const next=(await db.query("SELECT status,cancel_requested FROM giveaway_reminder_jobs WHERE provider_id=$1",[provider+'-next'])).rows[0];
      assert.equal(next.status,'scheduled'); // cancellation requires provider confirmation
      assert.equal(next.cancel_requested,event!=='failed');
    }
    await db.query(`INSERT INTO email_events(email,event_type,resend_email_id)
      VALUES('unrelated-bounce-fixture@example.invalid','bounced','unrelated-provider')`);
    assert.equal((await db.query("SELECT count(*)::int n FROM message_suppressions WHERE destination='unrelated-bounce-fixture@example.invalid'")).rows[0].n,0);
  } finally {await db.query('ROLLBACK');await db.end();}
});
