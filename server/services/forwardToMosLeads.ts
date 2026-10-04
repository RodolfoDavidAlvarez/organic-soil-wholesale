/**
 * Fire-and-forget forwarder: every lead captured on OSW is also POSTed to the
 * MyOrganicSoil sales platform so the rep team can claim it via SMS/app.
 *
 * MOS endpoint:  POST https://myorganicsoil.com/api/leads
 * Auth header:   X-Lead-Source-Key: <MOS_LEAD_INGEST_SECRET>
 *
 * Failures are logged but never bubble up — OSW's own DB insert + notifications
 * are the source of truth; MOS is just a fan-out target.
 */

export type MosLeadSource =
  | 'osw_lead_form'
  | 'osw_contact_form'
  | 'osw_quote_request'
  | 'osw_special_request'
  | 'osw_order_callback';

export interface MosLeadPayload {
  full_name: string;
  email: string;
  phone?: string;
  company?: string;
  message?: string;
  source: MosLeadSource;
  source_url?: string;
  source_data?: Record<string, unknown>;
}

const MOS_ENDPOINT =
  process.env.MOS_LEAD_INGEST_URL || 'https://myorganicsoil.com/api/leads';

export async function forwardToMosLeads(payload: MosLeadPayload): Promise<void> {
  const secret = process.env.MOS_LEAD_INGEST_SECRET;
  if (!secret) {
    console.warn('[mos-lead-forward] MOS_LEAD_INGEST_SECRET not set — skipping');
    return;
  }

  if (!payload.full_name || !payload.email) {
    console.warn('[mos-lead-forward] missing full_name/email — skipping');
    return;
  }

  // Callers handling serverless requests await delivery before returning.
  return fetch(MOS_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Lead-Source-Key': secret,
    },
    body: JSON.stringify(payload),
  })
    .then(async (res) => {
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        console.error(
          `[mos-lead-forward] ${payload.source} → ${res.status}: ${text.slice(0, 200)}`
        );
      } else {
        console.log(`[mos-lead-forward] ${payload.source} → OK`);
      }
    })
    .catch((err) => {
      console.error('[mos-lead-forward] network error:', err?.message || err);
    });
}
