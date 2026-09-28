/** Shared newsletter subscribe / unsubscribe + Resend webhook helpers (Vercel + Express).
 *  Source of truth: Supabase only — no Airtable.
 */

function deviceFromUserAgent(ua) {
  if (!ua) return 'unknown'
  const s = String(ua).toLowerCase()
  if (/mobile|iphone|android|ipad/.test(s)) return 'mobile'
  if (/windows|macintosh|linux|cros/.test(s)) return 'desktop'
  return 'unknown'
}

function normalizeEmail(to) {
  if (!to) return null
  const raw = Array.isArray(to) ? to[0] : to
  return raw?.toLowerCase?.().trim() || null
}

function newsletterIdFromTags(tags) {
  if (!tags) return null
  if (Array.isArray(tags)) {
    const tag = tags.find((t) => t.name === 'newsletter_id' || t.name === 'campaign')
    return tag?.value || null
  }
  if (typeof tags === 'object') {
    return tags.newsletter_id || tags.campaign || null
  }
  return null
}

function eventKind(type) {
  return String(type || '').replace(/^email\./, '')
}

async function recomputeCampaignRates(supabase, newsletterId) {
  if (!newsletterId) return
  const { data: campaign } = await supabase
    .from('newsletter_campaigns')
    .select('id, total_sent, total_delivered, total_opens, total_clicks, status, sent_at')
    .eq('newsletter_id', newsletterId)
    .maybeSingle()
  if (!campaign) return

  const denom = Number(campaign.total_delivered || campaign.total_sent || 0)
  const openRate = denom > 0 ? Math.round((Number(campaign.total_opens || 0) / denom) * 10000) / 100 : null
  const clickRate = denom > 0 ? Math.round((Number(campaign.total_clicks || 0) / denom) * 10000) / 100 : null

  await supabase
    .from('newsletter_campaigns')
    .update({
      open_rate_pct: openRate,
      click_rate_pct: clickRate,
      updated_at: new Date().toISOString(),
    })
    .eq('id', campaign.id)
}

/** When Resend starts delivering an externally scheduled campaign, flip scheduled → sent. */
async function markCampaignLiveIfNeeded(supabase, newsletterId, kind) {
  if (!newsletterId) return
  if (!['sent', 'delivered', 'opened', 'clicked'].includes(kind)) return

  const { data: campaign } = await supabase
    .from('newsletter_campaigns')
    .select('id, status, sent_at, total_sent')
    .eq('newsletter_id', newsletterId)
    .maybeSingle()
  if (!campaign) return
  if (campaign.status !== 'scheduled' && campaign.status !== 'sending') return

  const now = new Date().toISOString()
  await supabase
    .from('newsletter_campaigns')
    .update({
      status: 'sent',
      sent_at: campaign.sent_at || now,
      updated_at: now,
    })
    .eq('id', campaign.id)
}

async function bumpCampaignCounter(supabase, newsletterId, patchBuilder) {
  if (!newsletterId) return
  const { data: campaign } = await supabase
    .from('newsletter_campaigns')
    .select(
      'id, total_sent, total_delivered, total_opens, total_clicks, total_bounced, total_complained, mobile_opens, desktop_opens',
    )
    .eq('newsletter_id', newsletterId)
    .maybeSingle()
  if (!campaign) return

  const campPatch = patchBuilder(campaign)
  if (!campPatch || !Object.keys(campPatch).length) return
  campPatch.updated_at = new Date().toISOString()
  await supabase.from('newsletter_campaigns').update(campPatch).eq('id', campaign.id)
  await recomputeCampaignRates(supabase, newsletterId)
}

async function updateNewsletterSend(supabase, { resendEmailId, email, newsletterId, status, timestamps = {} }) {
  if (!resendEmailId && !email) return

  let query = supabase.from('newsletter_email_sends').select('id, status').limit(1)
  if (resendEmailId) query = query.eq('resend_email_id', resendEmailId)
  else {
    query = query.eq('email', email)
    if (newsletterId) query = query.eq('newsletter_id', newsletterId)
  }

  const { data: rows } = await query
  const row = rows?.[0]
  if (!row) return

  const patch = {
    status,
    updated_at: new Date().toISOString(),
    ...timestamps,
  }
  await supabase.from('newsletter_email_sends').update(patch).eq('id', row.id)
}

export async function subscribeNewsletterContact(
  supabase,
  { email, name, phone, customerCategory, source = 'website_newsletter_signup', zipCode },
) {
  const normalizedEmail = normalizeEmail(email)
  const normalizedName = String(name || '').trim().slice(0, 120)
  const normalizedPhone = String(phone || '').trim().slice(0, 30)
  const normalizedCustomerCategory = String(customerCategory || '').trim().slice(0, 60)
  const normalizedZip = String(zipCode || '').trim().slice(0, 10)
  const now = new Date().toISOString()

  const { data: existing, error: lookupError } = await supabase
    .from('sp_customers')
    .select(
      'id, full_name, newsletter_subscribed, newsletter_unsubscribed_at, newsletter_verification_status, newsletter_source, newsletter_notes, delivery_zip',
    )
    .ilike('email', normalizedEmail)
    .maybeSingle()

  if (lookupError) throw lookupError

  if (existing) {
    const optedOut =
      existing.newsletter_subscribed === false ||
      Boolean(existing.newsletter_unsubscribed_at) ||
      ['Bounced', 'Complained'].includes(existing.newsletter_verification_status)

    if (optedOut) return { status: 'opted_out' }

    const patch = {
      newsletter_subscribed: true,
      newsletter_source: existing.newsletter_source || source,
      newsletter_notes:
        `${existing.newsletter_notes || ''}\n\n[Website opt-in ${now}]\nSource: ${source}\nConsent: explicit checkbox`.trim(),
      updated_at: now,
    }
    if (!existing.full_name && normalizedName) patch.full_name = normalizedName
    if (normalizedPhone) patch.phone = normalizedPhone
    if (normalizedCustomerCategory) patch.newsletter_contact_type = normalizedCustomerCategory
    if (normalizedZip && !String(existing.delivery_zip || '').trim()) patch.delivery_zip = normalizedZip

    const { error } = await supabase.from('sp_customers').update(patch).eq('id', existing.id)
    if (error) throw error
    return { status: 'subscribed', existing: true }
  }

  const { error } = await supabase.from('sp_customers').insert({
    full_name: normalizedName || normalizedEmail.split('@')[0],
    email: normalizedEmail,
    phone: normalizedPhone || null,
    delivery_zip: normalizedZip || null,
    source: 'email_marketing',
    stage: 'lead',
    newsletter_subscribed: true,
    newsletter_label: 'Newsletter',
    newsletter_source: source,
    newsletter_contact_type: normalizedCustomerCategory || null,
    newsletter_verification_status: 'Self-subscribed',
    newsletter_notes: `[Website opt-in ${now}]\nSource: ${source}\nConsent: explicit checkbox`,
    created_at: now,
    updated_at: now,
  })
  if (error) throw error
  return { status: 'subscribed', existing: false }
}

/** DB-only unsubscribe. Airtable sync removed permanently. */
export async function unsubscribeNewsletterContact(supabase, normalizedEmail, reason) {
  const now = new Date().toISOString()
  const { data: existing, error: lookupError } = await supabase
    .from('sp_customers')
    .select('id, newsletter_notes')
    .ilike('email', normalizedEmail)
    .maybeSingle()

  if (lookupError) throw lookupError
  if (!existing) return { updated: false }

  const notes = reason?.trim()
    ? `${existing.newsletter_notes || ''}\n\n[Unsubscribed ${now}]\nReason: ${reason.trim()}`.trim()
    : existing.newsletter_notes

  const { error: updateError } = await supabase
    .from('sp_customers')
    .update({
      newsletter_subscribed: false,
      newsletter_unsubscribed_at: now,
      newsletter_notes: notes || null,
      updated_at: now,
    })
    .eq('id', existing.id)

  if (updateError) throw updateError
  return { updated: true }
}

async function resolveNewsletterId(supabase, newsletterId, resendEmailId, email) {
  if (newsletterId) return newsletterId
  if (resendEmailId) {
    const { data: send } = await supabase
      .from('newsletter_email_sends')
      .select('newsletter_id')
      .eq('resend_email_id', resendEmailId)
      .maybeSingle()
    if (send?.newsletter_id) return send.newsletter_id
  }
  if (email) {
    const { data: send } = await supabase
      .from('newsletter_email_sends')
      .select('newsletter_id')
      .eq('email', email)
      .in('status', ['scheduled', 'sent', 'delivered', 'opened', 'clicked'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (send?.newsletter_id) return send.newsletter_id
  }
  return null
}

export async function handleResendNewsletterWebhook(supabase, event) {
  const { type, data } = event || {}
  const email = normalizeEmail(data?.to)
  if (!email) return { skipped: true }

  const kind = eventKind(type)
  const device = deviceFromUserAgent(data?.user_agent || data?.click?.userAgent)
  const now = new Date().toISOString()
  const resendEmailId = data?.email_id ?? null
  const clickUrl = data?.click?.link || data?.link || null
  const newsletterId = await resolveNewsletterId(
    supabase,
    newsletterIdFromTags(data?.tags),
    resendEmailId,
    email,
  )

  const tracked = new Set([
    'sent',
    'delivered',
    'delivery_delayed',
    'opened',
    'clicked',
    'bounced',
    'complained',
    'failed',
    'suppressed',
  ])
  if (!tracked.has(kind)) return { skipped: true, type, email }

  // Soft/transient bounces: log only — do not unsubscribe.
  const bounceType = String(data?.bounce?.type || data?.bounce?.bounceType || '').toLowerCase()
  const hardBounce =
    kind === 'bounced' &&
    (!bounceType || bounceType.includes('permanent') || bounceType.includes('hard'))
  const suppressContact = kind === 'complained' || kind === 'suppressed' || hardBounce

  const { data: customer } = await supabase
    .from('sp_customers')
    .select('id, newsletter_email_opens, newsletter_email_clicks')
    .ilike('email', email)
    .maybeSingle()

  const { error: insertError } = await supabase.from('email_events').insert({
    email,
    customer_id: customer?.id ?? null,
    event_type: kind,
    newsletter_id: newsletterId,
    resend_email_id: resendEmailId,
    user_agent: data?.user_agent || data?.click?.userAgent || null,
    device_type: device,
    click_url: clickUrl,
    tags: data?.tags || null,
  })

  // Unique (resend_email_id, event_type) — ignore duplicates
  if (insertError && !String(insertError.message || '').includes('duplicate') && insertError.code !== '23505') {
    throw insertError
  }
  if (insertError) return { ok: true, deduped: true, type, email }

  // Transactional campaign coupons also use Resend. Keep their audit row and
  // redemption delivery state aligned with verified provider events.
  if (resendEmailId) {
    const { updateReminderDeliveryFromWebhook } = await import('./wormCastingsDay3Reminders.js')
    await updateReminderDeliveryFromWebhook(supabase, {
      providerId: resendEmailId,
      kind,
      now,
    })

    if (kind === 'delivered') {
      await supabase
        .from('notification_log')
        .update({ status: 'delivered', delivered_at: now })
        .eq('provider_id', resendEmailId)
    }

    if (suppressContact || kind === 'failed') {
      const failureMessage = `Resend reported ${kind}`
      await supabase
        .from('notification_log')
        .update({ status: 'failed', error_message: failureMessage })
        .eq('provider_id', resendEmailId)
      await supabase
        .from('sp_worm_castings_redemptions')
        .update({
          distribution_status: 'failed',
          distribution_last_error: failureMessage,
          updated_at: now,
        })
        .eq('distribution_provider_id', resendEmailId)
    }
  }

  if (customer) {
    const patch = {}
    if (kind === 'opened') {
      patch.newsletter_email_opens = (customer.newsletter_email_opens || 0) + 1
      patch.newsletter_last_opened_at = now
      patch.newsletter_last_open_device = device
    }
    if (kind === 'clicked') {
      patch.newsletter_email_clicks = (customer.newsletter_email_clicks || 0) + 1
      patch.newsletter_last_clicked_at = now
      if (!customer.newsletter_email_opens) patch.newsletter_email_opens = 1
    }
    if (suppressContact) {
      patch.newsletter_subscribed = false
      patch.newsletter_verification_status =
        kind === 'complained' ? 'Complained' : kind === 'suppressed' ? 'Suppressed' : 'Bounced'
      patch.newsletter_unsubscribed_at = now
    }
    if (Object.keys(patch).length) {
      await supabase.from('sp_customers').update(patch).eq('id', customer.id)
    }
  }

  const statusByKind = {
    sent: 'sent',
    delivered: 'delivered',
    opened: 'opened',
    clicked: 'clicked',
    bounced: 'bounced',
    complained: 'complained',
    failed: 'failed',
    suppressed: 'bounced',
  }
  const sendStatus = statusByKind[kind]
  if (sendStatus) {
    const timestamps = {}
    if (kind === 'sent') timestamps.sent_at = now
    if (kind === 'delivered') timestamps.delivered_at = now
    if (kind === 'opened') timestamps.opened_at = now
    if (kind === 'clicked') timestamps.clicked_at = now
    if (kind === 'bounced' || kind === 'suppressed' || kind === 'failed') timestamps.bounced_at = now
    await updateNewsletterSend(supabase, {
      resendEmailId,
      email,
      newsletterId,
      status: sendStatus,
      timestamps,
    })
  }

  if (newsletterId) {
    await markCampaignLiveIfNeeded(supabase, newsletterId, kind)

    if (kind === 'delivered') {
      await bumpCampaignCounter(supabase, newsletterId, (c) => ({
        total_delivered: (c.total_delivered || 0) + 1,
      }))
    }
    if (kind === 'opened') {
      await bumpCampaignCounter(supabase, newsletterId, (c) => {
        const campPatch = { total_opens: (c.total_opens || 0) + 1 }
        if (device === 'mobile') campPatch.mobile_opens = (c.mobile_opens || 0) + 1
        if (device === 'desktop') campPatch.desktop_opens = (c.desktop_opens || 0) + 1
        return campPatch
      })
    }
    if (kind === 'clicked') {
      await bumpCampaignCounter(supabase, newsletterId, (c) => ({
        total_clicks: (c.total_clicks || 0) + 1,
      }))
    }
    if (kind === 'bounced' || kind === 'suppressed' || kind === 'failed') {
      await bumpCampaignCounter(supabase, newsletterId, (c) => ({
        total_bounced: (c.total_bounced || 0) + 1,
      }))
    }
    if (kind === 'complained') {
      await bumpCampaignCounter(supabase, newsletterId, (c) => ({
        total_complained: (c.total_complained || 0) + 1,
      }))
    }
  }

  return { ok: true, type, email, newsletterId, hardBounce: hardBounce || null }
}
