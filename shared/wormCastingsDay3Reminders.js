import {
  WORM_CASTINGS_CAMPAIGN_KEY,
  buildWormCastingsDay3ReminderEmail,
} from './wormCastingsCampaign.js';
import { resolveSswFrom, sswFrom } from './sswEmailFrom.js';

export const DAY3_REMINDER_TEMPLATE = 'worm_castings_day3_reminder';
export const DAY3_THRESHOLD_MS = 3 * 24 * 60 * 60 * 1000;
export const DEFAULT_MAX_ATTEMPTS = 5;
export const DEFAULT_LEASE_MINUTES = 15;
export const DEFAULT_RATE_DELAY_MS = 250;
export const REMINDER_ALERT_TO = process.env.DEVELOPER_ALERT_TO || 'developer@bettersystems.ai';

export function isReminderThresholdReached(distributionSentAt, now = new Date()) {
  const sent = new Date(distributionSentAt).getTime();
  const current = new Date(now).getTime();
  return Number.isFinite(sent) && Number.isFinite(current) && current - sent >= DAY3_THRESHOLD_MS;
}

export function retryDelaySeconds(attemptNumber) {
  const safeAttempt = Math.max(1, Number(attemptNumber) || 1);
  return Math.min(24 * 60 * 60, 60 * (2 ** (safeAttempt - 1)));
}

export function reminderIdempotencyKey(outboxId) {
  return `worm-day3-${outboxId}`;
}

export function reminderUnsubscribeUrl(email) {
  return `https://www.organicsoilwholesale.com/unsubscribe?email=${encodeURIComponent(String(email || '').trim().toLowerCase())}`;
}

export function reminderComplianceHeaders(email) {
  return {
    'List-Unsubscribe': `<${reminderUnsubscribeUrl(email)}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };
}

export async function listDay3ReminderDue(
  client,
  { campaignKey = WORM_CASTINGS_CAMPAIGN_KEY, limit = 200 } = {},
) {
  const { rows } = await client.query(
    `/* worm_day3:list_due */
    SELECT r.id, r.full_name, r.email, r.redemption_token, r.distribution_sent_at
    FROM public.sp_worm_castings_redemptions r
    JOIN public.sp_customers customer
      ON customer.id = r.customer_id
     AND lower(customer.email) = r.email_normalized
    LEFT JOIN public.worm_castings_reminder_outbox outbox
      ON outbox.redemption_id = r.id
     AND outbox.template_name = $2
    WHERE r.campaign_key = $1
      AND r.redeemed_at IS NULL
      AND r.distribution_status = 'sent'
      AND r.distribution_sent_at IS NOT NULL
      AND r.distribution_sent_at <= now() - interval '3 days'
      AND customer.newsletter_subscribed IS TRUE
      AND customer.newsletter_unsubscribed_at IS NULL
      AND r.email_normalized NOT LIKE '%@soilseedandwater.com'
      AND r.email_normalized NOT IN ('test@test.com', 'test@example.com')
      AND outbox.id IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.email_events event
        WHERE lower(event.email) = r.email_normalized
          AND event.event_type IN ('bounced', 'complained', 'suppressed')
      )
    ORDER BY r.distribution_sent_at ASC
    LIMIT $3`,
    [campaignKey, DAY3_REMINDER_TEMPLATE, limit],
  );
  return rows;
}

export async function enqueueDay3Reminders(
  client,
  { campaignKey = WORM_CASTINGS_CAMPAIGN_KEY, maxAttempts = DEFAULT_MAX_ATTEMPTS } = {},
) {
  const { rows } = await client.query(
    `/* worm_day3:enqueue */
    INSERT INTO public.worm_castings_reminder_outbox (
      redemption_id, campaign_key, template_name, recipient, max_attempts,
      provider_idempotency_key
    )
    SELECT
      r.id, r.campaign_key, $2, r.email_normalized, $3,
      'worm-day3-' || r.id::text
    FROM public.sp_worm_castings_redemptions r
    JOIN public.sp_customers customer
      ON customer.id = r.customer_id
     AND lower(customer.email) = r.email_normalized
    WHERE r.campaign_key = $1
      AND r.redeemed_at IS NULL
      AND r.distribution_status = 'sent'
      AND r.distribution_sent_at IS NOT NULL
      AND r.distribution_sent_at <= now() - interval '3 days'
      AND customer.newsletter_subscribed IS TRUE
      AND customer.newsletter_unsubscribed_at IS NULL
      AND r.email_normalized NOT LIKE '%@soilseedandwater.com'
      AND r.email_normalized NOT IN ('test@test.com', 'test@example.com')
      AND NOT EXISTS (
        SELECT 1 FROM public.email_events event
        WHERE lower(event.email) = r.email_normalized
          AND event.event_type IN ('bounced', 'complained', 'suppressed')
      )
    ON CONFLICT (redemption_id, template_name) DO NOTHING
    RETURNING id`,
    [campaignKey, DAY3_REMINDER_TEMPLATE, maxAttempts],
  );
  return rows.length;
}

export async function cancelIneligibleReminders(client) {
  const { rows } = await client.query(
    `/* worm_day3:cancel_ineligible */
    UPDATE public.worm_castings_reminder_outbox outbox
    SET status = 'cancelled', cancelled_at = now(), locked_at = NULL,
        lock_token = NULL, updated_at = now(),
        last_error = CASE
          WHEN r.redeemed_at IS NOT NULL THEN 'redeemed_before_reminder'
          WHEN customer.newsletter_subscribed IS NOT TRUE
            OR customer.newsletter_unsubscribed_at IS NOT NULL THEN 'contact_opted_out'
          ELSE 'contact_or_delivery_ineligible'
        END
    FROM public.sp_worm_castings_redemptions r
    LEFT JOIN public.sp_customers customer
      ON customer.id = r.customer_id
     AND lower(customer.email) = r.email_normalized
    WHERE outbox.redemption_id = r.id
      AND outbox.template_name = $1
      AND outbox.status IN ('pending', 'retry')
      AND (
        r.redeemed_at IS NOT NULL
        OR r.distribution_status <> 'sent'
        OR customer.id IS NULL
        OR customer.newsletter_subscribed IS NOT TRUE
        OR customer.newsletter_unsubscribed_at IS NOT NULL
        OR EXISTS (
          SELECT 1 FROM public.email_events event
          WHERE lower(event.email) = r.email_normalized
            AND event.event_type IN ('bounced', 'complained', 'suppressed')
        )
      )
    RETURNING outbox.id`,
    [DAY3_REMINDER_TEMPLATE],
  );
  return rows.length;
}

export async function recoverStaleReminderClaims(client, { leaseMinutes = DEFAULT_LEASE_MINUTES } = {}) {
  const { rows } = await client.query(
    `/* worm_day3:recover_stale */
    WITH stale AS (
      UPDATE public.worm_castings_reminder_outbox
      SET status = CASE WHEN attempt_count >= max_attempts THEN 'dead_letter' ELSE 'retry' END,
          available_at = CASE WHEN attempt_count >= max_attempts THEN available_at ELSE now() END,
          dead_lettered_at = CASE WHEN attempt_count >= max_attempts THEN now() ELSE dead_lettered_at END,
          last_error = 'stale_sending_lease_recovered',
          locked_at = NULL,
          lock_token = NULL,
          updated_at = now()
      WHERE status = 'sending'
        AND locked_at < now() - make_interval(mins => $1)
      RETURNING id, attempt_count, status
    )
    , abandoned AS (
      UPDATE public.worm_castings_reminder_attempts attempt
      SET status = 'abandoned', error_message = 'stale_sending_lease_recovered', finished_at = now()
      FROM stale
      WHERE attempt.outbox_id = stale.id
        AND attempt.attempt_number = stale.attempt_count
        AND attempt.status = 'sending'
      RETURNING attempt.id
    )
    SELECT stale.id, stale.status FROM stale`,
    [leaseMinutes],
  );
  return {
    recovered: rows.length,
    deadLettered: rows.filter((row) => row.status === 'dead_letter').length,
  };
}

export async function claimNextReminder(client) {
  const { rows } = await client.query(
    `/* worm_day3:claim */
    WITH candidate AS (
      SELECT outbox.id
      FROM public.worm_castings_reminder_outbox outbox
      JOIN public.sp_worm_castings_redemptions r ON r.id = outbox.redemption_id
      JOIN public.sp_customers customer
        ON customer.id = r.customer_id
       AND lower(customer.email) = r.email_normalized
      WHERE outbox.template_name = $1
        AND outbox.status IN ('pending', 'retry')
        AND outbox.available_at <= now()
        AND outbox.attempt_count < outbox.max_attempts
        AND r.redeemed_at IS NULL
        AND r.distribution_status = 'sent'
        AND r.distribution_sent_at <= now() - interval '3 days'
        AND customer.newsletter_subscribed IS TRUE
        AND customer.newsletter_unsubscribed_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM public.email_events event
          WHERE lower(event.email) = r.email_normalized
            AND event.event_type IN ('bounced', 'complained', 'suppressed')
        )
      ORDER BY outbox.available_at, outbox.created_at
      FOR UPDATE OF outbox SKIP LOCKED
      LIMIT 1
    ), claimed AS (
      UPDATE public.worm_castings_reminder_outbox outbox
      SET status = 'sending', attempt_count = outbox.attempt_count + 1,
          locked_at = now(), lock_token = gen_random_uuid(), updated_at = now()
      FROM candidate
      WHERE outbox.id = candidate.id
      RETURNING outbox.*
    ), attempt AS (
      INSERT INTO public.worm_castings_reminder_attempts (
        outbox_id, attempt_number, lock_token, status
      )
      SELECT id, attempt_count, lock_token, 'sending' FROM claimed
      RETURNING outbox_id
    )
    SELECT claimed.*, r.full_name, r.email, r.redemption_token
    FROM claimed
    JOIN attempt ON attempt.outbox_id = claimed.id
    JOIN public.sp_worm_castings_redemptions r ON r.id = claimed.redemption_id`,
    [DAY3_REMINDER_TEMPLATE],
  );
  return rows[0] || null;
}

function providerStatusCode(response, error) {
  const value = error?.statusCode ?? error?.status ?? response?.error?.statusCode ?? response?.error?.status;
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}

export async function recordReminderAccepted(client, item, providerId, sourceApp) {
  const { rows } = await client.query(
    `/* worm_day3:accepted */
    WITH accepted AS (
      UPDATE public.worm_castings_reminder_outbox
      SET status = 'sent', provider_id = $3, sent_at = COALESCE(sent_at, now()),
          last_error = NULL, last_status_code = 200,
          locked_at = NULL, lock_token = NULL, updated_at = now()
      WHERE id = $1 AND status = 'sending' AND lock_token = $2
      RETURNING *
    ), finished_attempt AS (
      UPDATE public.worm_castings_reminder_attempts attempt
      SET status = 'sent', provider_id = $3, status_code = 200, finished_at = now()
      FROM accepted
      WHERE attempt.outbox_id = accepted.id
        AND attempt.attempt_number = accepted.attempt_count
      RETURNING attempt.id
    ), legacy AS (
      UPDATE public.sp_worm_castings_redemptions r
      SET day3_reminder_sent_at = COALESCE(r.day3_reminder_sent_at, accepted.sent_at),
          day3_reminder_provider_id = $3, updated_at = now()
      FROM accepted
      WHERE r.id = accepted.redemption_id
      RETURNING r.id
    )
    INSERT INTO public.notification_log
      (notification_type, template_name, recipient, subject, content, status,
       provider, provider_id, source_app, sent_at)
    SELECT
      'email', $4, accepted.recipient, $5,
      'Day-3 unredeemed worm castings pickup reminder', 'sent',
      'resend', $3, $6, accepted.sent_at
    FROM accepted
    ON CONFLICT DO NOTHING
    RETURNING id`,
    [item.id, item.lock_token, providerId, DAY3_REMINDER_TEMPLATE,
      'Your free worm castings bag is still waiting', sourceApp],
  );
  return rows.length > 0;
}

export async function recordReminderFailure(client, item, error, response) {
  const reason = String(error?.message || response?.error?.message || 'day3_reminder_failed').slice(0, 1000);
  const statusCode = providerStatusCode(response, error);
  const delaySeconds = retryDelaySeconds(item.attempt_count);
  const { rows } = await client.query(
    `/* worm_day3:failed */
    WITH failed AS (
      UPDATE public.worm_castings_reminder_outbox
      SET status = CASE WHEN attempt_count >= max_attempts THEN 'dead_letter' ELSE 'retry' END,
          available_at = CASE
            WHEN attempt_count >= max_attempts THEN available_at
            ELSE now() + make_interval(secs => $5)
          END,
          dead_lettered_at = CASE WHEN attempt_count >= max_attempts THEN now() ELSE dead_lettered_at END,
          last_error = $3, last_status_code = $4,
          locked_at = NULL, lock_token = NULL, updated_at = now()
      WHERE id = $1 AND status = 'sending' AND lock_token = $2
      RETURNING id, attempt_count, status
    )
    UPDATE public.worm_castings_reminder_attempts attempt
    SET status = 'failed', status_code = $4, error_message = $3, finished_at = now()
    FROM failed
    WHERE attempt.outbox_id = failed.id
      AND attempt.attempt_number = failed.attempt_count
    RETURNING failed.id, failed.status`,
    [item.id, item.lock_token, reason, statusCode, delaySeconds],
  );
  return rows[0]?.status || 'lost_claim';
}

export async function sendNextReminder(client, resend, { fromAddress, sourceApp } = {}) {
  const item = await claimNextReminder(client);
  if (!item) return { status: 'empty' };

  const message = buildWormCastingsDay3ReminderEmail({
    fullName: item.full_name,
    token: item.redemption_token,
    email: item.email,
  });
  let response;
  try {
    response = await resend.emails.send({
      from: resolveSswFrom(fromAddress, 'Soil Seed & Water'),
      replyTo: 'ralvarez@soilseedandwater.com',
      to: [item.email],
      subject: message.subject,
      html: message.html,
      headers: reminderComplianceHeaders(item.email),
      tags: [
        { name: 'campaign', value: WORM_CASTINGS_CAMPAIGN_KEY },
        { name: 'template', value: DAY3_REMINDER_TEMPLATE },
      ],
    }, { idempotencyKey: item.provider_idempotency_key });
    const providerId = response?.data?.id;
    if (response?.error || !providerId) {
      const providerError = new Error(response?.error?.message || 'day3_reminder_not_accepted');
      if (response?.error?.statusCode) providerError.statusCode = response.error.statusCode;
      throw providerError;
    }
    const recorded = await recordReminderAccepted(client, item, providerId, sourceApp);
    if (!recorded) throw new Error('day3_reminder_acceptance_lost_claim');
    return { id: item.id, status: 'sent', providerId };
  } catch (error) {
    // If Resend accepted but the DB acknowledgement failed, keep the sending
    // lease. A later recovery retries with the same provider idempotency key.
    if (response?.data?.id) throw error;
    const nextStatus = await recordReminderFailure(client, item, error, response);
    return { id: item.id, status: nextStatus, error: error?.message || String(error) };
  }
}

async function createRun(client, sourceApp) {
  const { rows } = await client.query(
    `/* worm_day3:create_run */
    INSERT INTO public.worm_castings_reminder_runs (source_app)
    VALUES ($1) RETURNING id`,
    [sourceApp],
  );
  return rows[0]?.id;
}

async function finishRun(client, runId, status, metrics, errorMessage = null) {
  await client.query(
    `/* worm_day3:finish_run */
    UPDATE public.worm_castings_reminder_runs
    SET status = $2, metrics = $3::jsonb, error_message = $4,
        finished_at = now()
    WHERE id = $1`,
    [runId, status, JSON.stringify(metrics), errorMessage],
  );
}

async function sendRunAlert(client, resend, runId, summary, { fromAddress }) {
  if (!runId || !resend || (summary.failed === 0 && summary.deadLettered === 0 && summary.recovered === 0)) return false;
  try {
    const response = await resend.emails.send({
      from: resolveSswFrom(fromAddress, 'OSW Alerts'),
      replyTo: 'developer@bettersystems.ai',
      to: [REMINDER_ALERT_TO],
      subject: `OSW Day-3 reminder run needs attention (${summary.failed} failed, ${summary.deadLettered} dead)`,
      text: `Run ${runId}\n${JSON.stringify(summary, null, 2)}`,
    }, { idempotencyKey: `worm-day3-run-alert-${runId}` });
    if (response?.error || !response?.data?.id) throw new Error(response?.error?.message || 'run_alert_not_accepted');
    await client.query(
      `/* worm_day3:alert_sent */
      UPDATE public.worm_castings_reminder_runs SET alert_sent_at = now() WHERE id = $1`,
      [runId],
    );
    return true;
  } catch (error) {
    await client.query(
      `/* worm_day3:alert_failed */
      UPDATE public.worm_castings_reminder_runs SET alert_error = $2 WHERE id = $1`,
      [runId, String(error?.message || error).slice(0, 1000)],
    );
    console.error(JSON.stringify({ event: 'worm_day3_run_alert_failed', runId, error: error?.message || String(error) }));
    return false;
  }
}

export async function processDay3Reminders(client, resend, {
  apply = false,
  limit = 50,
  delayMs = DEFAULT_RATE_DELAY_MS,
  fromAddress = resolveSswFrom(process.env.WORM_CASTINGS_EMAIL_FROM, 'Soil Seed & Water'),
  sourceApp = 'organic_soil_wholesale_day3_reminder',
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
  leaseMinutes = DEFAULT_LEASE_MINUTES,
} = {}) {
  if (!apply) {
    const due = await listDay3ReminderDue(client, { limit });
    return {
      mode: 'dry-run', campaignKey: WORM_CASTINGS_CAMPAIGN_KEY, due: due.length,
      sample: due.slice(0, 5).map((row) => ({ issued_at: row.distribution_sent_at })),
    };
  }

  const runId = await createRun(client, sourceApp);
  const summary = {
    mode: 'apply', runId, campaignKey: WORM_CASTINGS_CAMPAIGN_KEY,
    enqueued: 0, cancelled: 0, recovered: 0, sent: 0,
    failed: 0, deadLettered: 0, empty: 0,
  };
  try {
    summary.enqueued = await enqueueDay3Reminders(client, { maxAttempts });
    summary.cancelled = await cancelIneligibleReminders(client);
    const recovered = await recoverStaleReminderClaims(client, { leaseMinutes });
    summary.recovered = recovered.recovered;
    summary.deadLettered += recovered.deadLettered;

    for (let index = 0; index < limit; index += 1) {
      const result = await sendNextReminder(client, resend, { fromAddress, sourceApp });
      if (result.status === 'empty') {
        summary.empty = 1;
        break;
      }
      if (result.status === 'sent') summary.sent += 1;
      else if (result.status === 'dead_letter') {
        summary.failed += 1;
        summary.deadLettered += 1;
      } else summary.failed += 1;
      if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    const status = summary.failed || summary.deadLettered || summary.recovered ? 'degraded' : 'healthy';
    await finishRun(client, runId, status, summary);
    summary.alerted = await sendRunAlert(client, resend, runId, summary, { fromAddress: sswFrom('OSW Alerts') });
    return summary;
  } catch (error) {
    summary.failed += 1;
    await finishRun(client, runId, 'failed', summary, error?.message || String(error));
    await sendRunAlert(client, resend, runId, summary, { fromAddress: sswFrom('OSW Alerts') });
    throw error;
  }
}

export async function updateReminderDeliveryFromWebhook(supabase, { providerId, kind, now }) {
  if (!providerId) return;
  const mapped = {
    delivered: 'delivered', bounced: 'bounced', complained: 'complained',
    suppressed: 'suppressed', failed: 'failed',
  }[kind];
  if (!mapped) return;
  const patch = {
    status: mapped,
    delivery_event_at: now,
    updated_at: now,
  };
  if (mapped !== 'delivered') patch.last_error = `Resend reported ${kind}`;
  await supabase.from('worm_castings_reminder_outbox').update(patch).eq('provider_id', providerId);
  await supabase.from('worm_castings_reminder_attempts').update({
    status: mapped,
    error_message: mapped === 'delivered' ? null : `Resend reported ${kind}`,
    finished_at: now,
  }).eq('provider_id', providerId);
}
