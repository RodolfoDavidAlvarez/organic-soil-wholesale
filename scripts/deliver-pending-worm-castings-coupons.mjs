#!/usr/bin/env node
/**
 * Sends only pending/failed August worm-castings coupons.
 * Default mode is read-only. Use --apply after reviewing the count.
 */
import dotenv from 'dotenv';
import pg from 'pg';
import { Resend } from 'resend';
import { buildWormCastingsCouponEmail, WORM_CASTINGS_CAMPAIGN_KEY } from '../shared/wormCastingsCampaign.js';
import { resolveSswFrom, SSW_EMAIL_REPLY_TO } from '../shared/sswEmailFrom.js';

dotenv.config({ path: '.env', quiet: true });

const apply = process.argv.includes('--apply');
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
const resend = new Resend(process.env.RESEND_API_KEY);

await client.connect();
try {
  const pending = await client.query(`
    SELECT r.id, r.full_name, r.email, r.redemption_token, r.distribution_status, r.distribution_attempts, customer.ssw_number
    FROM public.sp_worm_castings_redemptions r
    LEFT JOIN public.sp_customers customer ON customer.id = r.customer_id
    WHERE r.campaign_key = $1
      AND r.distribution_status IN ('pending', 'failed')
    ORDER BY r.issued_at ASC
  `, [WORM_CASTINGS_CAMPAIGN_KEY]);

  if (!apply) {
    console.log(JSON.stringify({ mode: 'dry-run', campaignKey: WORM_CASTINGS_CAMPAIGN_KEY, pending_or_failed: pending.rowCount }));
    process.exit(0);
  }

  const results = [];
  for (const row of pending.rows) {
    const claimed = await client.query(`
      UPDATE public.sp_worm_castings_redemptions
      SET distribution_status = 'sending',
          distribution_attempts = distribution_attempts + 1,
          distribution_last_error = NULL,
          updated_at = now()
      WHERE id = $1 AND distribution_status IN ('pending', 'failed')
      RETURNING *
    `, [row.id]);
    if (!claimed.rowCount) continue;

    const coupon = claimed.rows[0];
    const message = buildWormCastingsCouponEmail({
      fullName: coupon.full_name,
      token: coupon.redemption_token,
      customerNumber: coupon.ssw_number || row.ssw_number,
    });
    try {
      const response = await resend.emails.send({
        from: resolveSswFrom(process.env.WORM_CASTINGS_EMAIL_FROM, 'Soil Seed & Water'),
        replyTo: SSW_EMAIL_REPLY_TO,
        to: [coupon.email],
        subject: message.subject,
        html: message.html,
      });
      const providerId = response?.data?.id;
      if (response?.error || !providerId) throw new Error(response?.error?.message || 'coupon_delivery_not_accepted');
      await client.query(`
        UPDATE public.sp_worm_castings_redemptions
        SET distribution_status = 'sent', distribution_provider_id = $2,
            distribution_sent_at = now(), updated_at = now()
        WHERE id = $1
      `, [coupon.id, providerId]);
      await client.query(`
        INSERT INTO public.notification_log
          (notification_type, template_name, recipient, subject, content, status, provider, provider_id, source_app, sent_at)
        VALUES ('email', 'worm_castings_qr_distribution', $1, $2,
          'Unique worm castings redemption QR coupon', 'sent', 'resend', $3,
          'organic_soil_wholesale_campaign_backfill', now())
      `, [coupon.email, message.subject, providerId]);
      results.push({ id: coupon.id, status: 'sent' });
    } catch (error) {
      const reason = error?.message || 'coupon_delivery_failed';
      await client.query(`
        UPDATE public.sp_worm_castings_redemptions
        SET distribution_status = 'failed', distribution_last_error = $2, updated_at = now()
        WHERE id = $1
      `, [coupon.id, reason]);
      results.push({ id: coupon.id, status: 'failed' });
    }
  }
  console.log(JSON.stringify({
    mode: 'apply',
    campaignKey: WORM_CASTINGS_CAMPAIGN_KEY,
    sent: results.filter((row) => row.status === 'sent').length,
    failed: results.filter((row) => row.status === 'failed').length,
  }));
} finally {
  await client.end();
}
