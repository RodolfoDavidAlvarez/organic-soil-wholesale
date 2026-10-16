import { Router } from 'express';
import { supabase } from '../db/supabase.js';
import { sendAdminContactFormNotification } from '../services/email.js';
import { forwardToMosLeads } from '../services/forwardToMosLeads.js';

const router = Router();

// Submit contact form
router.post('/submit', async (req, res) => {
  try {
    const { name, email, phone, company, subject, message, source_url } = req.body;

    // Validate required fields
    if (!name || !email || !message) {
      return res.status(400).json({ error: 'Name, email, and message are required' });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    const submittedAt = new Date().toISOString();
    const pageUrl = typeof source_url === 'string' && source_url.trim()
      ? source_url.trim()
      : 'https://organicsoilwholesale.com/contact';
    const utm: Record<string, string> = {};
    try {
      const u = new URL(pageUrl);
      for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'campaign_link_code'] as const) {
        const v = u.searchParams.get(key);
        if (v) utm[key] = v;
      }
    } catch {
      // ignore bad URLs
    }

    // Save to database
    const { data, error } = await supabase
      .from('contact_submissions')
      .insert({
        name,
        email,
        phone,
        company,
        subject,
        message,
        status: 'new',
        created_at: submittedAt
      })
      .select()
      .single();

    if (error) {
      console.error('Error saving contact submission:', error);
      return res.status(500).json({ error: 'Failed to submit contact form' });
    }

    // Send admin notification
    try {
      await sendAdminContactFormNotification({
        name,
        email,
        phone,
        company,
        subject,
        message,
        submittedAt
      });
      console.log('Admin notification sent for contact form submission');
    } catch (emailError) {
      console.error('Failed to send admin notification:', emailError);
      // Don't fail the submission if email fails
    }

    forwardToMosLeads({
      full_name: name,
      email,
      phone: phone || undefined,
      company: company || undefined,
      message: subject ? `${subject}\n\n${message}` : message,
      source: 'osw_contact_form',
      source_url: pageUrl,
      source_data: { osw_contact_submission_id: data.id, subject, ...utm },
    });

    res.json({ 
      success: true, 
      message: 'Thank you for contacting us. We\'ll get back to you soon!',
      submissionId: data.id
    });
  } catch (error) {
    console.error('Contact form submission error:', error);
    res.status(500).json({ error: 'Failed to process contact form' });
  }
});

// Get contact submissions (admin only)
router.get('/submissions', async (req, res) => {
  try {
    // Check for admin token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { data, error } = await supabase
      .from('contact_submissions')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json(data || []);
  } catch (error) {
    console.error('Error fetching contact submissions:', error);
    res.status(500).json({ error: 'Failed to fetch contact submissions' });
  }
});

export default router;
