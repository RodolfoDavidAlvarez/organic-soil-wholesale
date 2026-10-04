import { normalizeGardenBedRequest } from '../../shared/gardenBedOrders.js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { randomUUID } from 'node:crypto';
import {
  processLeadSubmission,
  LeadSubmissionError,
} from '../../server/services/leadSubmission.js';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  const startedAt = Date.now();
  const vercelRequestId = Array.isArray(req.headers['x-vercel-id'])
    ? req.headers['x-vercel-id'][0]
    : req.headers['x-vercel-id'];
  const requestId = vercelRequestId || randomUUID();
  res.setHeader('X-OSW-Request-ID', requestId);

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed', requestId });
  }

  console.info(JSON.stringify({ event: 'lead_submission_started', requestId }));

  let payload: unknown = req.body ?? {};

  if (typeof payload === 'string') {
    try {
      payload = payload ? JSON.parse(payload) : {};
    } catch (parseError) {
      console.warn(JSON.stringify({ event: 'lead_submission_rejected', requestId, status: 400, reason: 'invalid_json', durationMs: Date.now() - startedAt }));
      return res.status(400).json({ error: 'Invalid JSON payload', requestId });
    }
  }

  try {
    if ((payload as Record<string, unknown>)?.source === 'osw_garden_bed_order') {
      const normalized = normalizeGardenBedRequest(payload);
      if (normalized.honeypot) return res.status(200).json({ success: true, requestId });
      if (normalized.error) return res.status(400).json({ error: normalized.error, requestId });
      payload = normalized.payload;
    }
    const result = await processLeadSubmission(
      payload as Record<string, unknown>
    );
    console.info(JSON.stringify({ event: 'lead_submission_succeeded', requestId, status: 200, leadId: result.leadId, durationMs: Date.now() - startedAt }));
    return res.status(200).json({
      success: true,
      message: result.message,
      leadId: result.leadId,
      ...(result.quantity ? { quantity: result.quantity } : {}),
      requestId,
    });
  } catch (error: unknown) {
    if (error instanceof LeadSubmissionError) {
      console.warn(JSON.stringify({ event: 'lead_submission_rejected', requestId, status: error.statusCode, reason: error.message, durationMs: Date.now() - startedAt }));
      return res.status(error.statusCode).json({ error: error.message, requestId });
    }

    console.error(JSON.stringify({ event: 'lead_submission_failed', requestId, status: 500, durationMs: Date.now() - startedAt }), error);
    return res.status(500).json({ error: 'Failed to process lead', requestId });
  }
}
