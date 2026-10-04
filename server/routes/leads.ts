import { normalizeGardenBedRequest } from '../../shared/gardenBedOrders.js';
import { Router } from 'express';
import {
  processLeadSubmission,
  LeadSubmissionError
} from '../services/leadSubmission.js';

const router = Router();

// Submit lead
router.post('/submit', async (req, res) => {
  try {
    let payload = req.body;
    if (payload?.source === 'osw_garden_bed_order') {
      const normalized = normalizeGardenBedRequest(payload);
      if (normalized.honeypot) return res.json({ success: true });
      if (normalized.error) return res.status(400).json({ error: normalized.error });
      payload = normalized.payload;
    }
    const result = await processLeadSubmission(payload);

    res.json({
      success: true,
      message: result.message,
      leadId: result.leadId,
      ...(result.quantity ? { quantity: result.quantity } : {})
    });
  } catch (error) {
    console.error('Lead submission error:', error);

    if (error instanceof LeadSubmissionError) {
      res.status(error.statusCode).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'Failed to process lead' });
    }
  }
});

export default router;
