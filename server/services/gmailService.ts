/**
 * Gmail Service for CRM Emails
 * Sends emails via Gmail API so they appear in Sent folder
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { resolveSswFrom, SSW_BUSINESS_CARD_FROM_NAME, SSW_EMAIL_REPLY_TO } from '../../shared/sswEmailFrom.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Gmail credentials location (shared with SSW Gmail setup)
const GMAIL_CREDS_DIR = process.env.GMAIL_CREDS_DIR || path.join(process.env.HOME || '', '.gmail-ssw-mcp');
const credsPath = path.join(GMAIL_CREDS_DIR, 'credentials.json');
const keysPath = path.join(GMAIL_CREDS_DIR, 'gcp-oauth.keys.json');

interface GmailCredentials {
  access_token: string;
  refresh_token: string;
  expiry_date: number;
}

interface SendEmailOptions {
  to: string;
  subject: string;
  body: string;
  html?: string;
  from?: string;
  replyTo?: string;
}

async function refreshToken(credentials: GmailCredentials): Promise<GmailCredentials> {
  try {
    const keys = JSON.parse(fs.readFileSync(keysPath, 'utf8'));

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: keys.installed.client_id,
        client_secret: keys.installed.client_secret,
        refresh_token: credentials.refresh_token,
        grant_type: 'refresh_token'
      })
    });

    const data = await response.json();
    
    if (data.error) {
      throw new Error(`Token refresh failed: ${data.error_description || data.error}`);
    }

    credentials.access_token = data.access_token;
    credentials.expiry_date = Date.now() + (data.expires_in * 1000);
    fs.writeFileSync(credsPath, JSON.stringify(credentials));
    
    return credentials;
  } catch (error) {
    console.error('Failed to refresh Gmail token:', error);
    throw error;
  }
}

async function getAccessToken(): Promise<string> {
  if (!fs.existsSync(credsPath)) {
    throw new Error(`Gmail credentials not found at ${credsPath}. Run Gmail OAuth setup first.`);
  }

  let credentials: GmailCredentials = JSON.parse(fs.readFileSync(credsPath, 'utf8'));

  // Refresh if expired or expiring soon (within 1 minute)
  if (Date.now() >= credentials.expiry_date - 60000) {
    credentials = await refreshToken(credentials);
  }

  return credentials.access_token;
}

/**
 * Build RFC 2822 email message
 */
function buildEmail(options: SendEmailOptions): string {
  const { to, subject, body, html, from, replyTo } = options;
  
  const fromAddress = resolveSswFrom(from, SSW_BUSINESS_CARD_FROM_NAME);
  const replyAddress = replyTo || SSW_EMAIL_REPLY_TO;
  const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).substr(2)}`;
  
  const headers = [
    `From: ${fromAddress}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `Reply-To: ${replyAddress}`,
    'MIME-Version: 1.0',
  ].filter(Boolean);

  if (html) {
    // Multipart email with HTML and plain text
    headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
    
    const parts = [
      headers.join('\r\n'),
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset=utf-8',
      'Content-Transfer-Encoding: quoted-printable',
      '',
      body,
      '',
      `--${boundary}`,
      'Content-Type: text/html; charset=utf-8',
      'Content-Transfer-Encoding: quoted-printable',
      '',
      html,
      '',
      `--${boundary}--`
    ];
    
    return parts.join('\r\n');
  } else {
    // Plain text only
    headers.push('Content-Type: text/plain; charset=utf-8');
    
    return [
      headers.join('\r\n'),
      '',
      body
    ].join('\r\n');
  }
}

/**
 * Send email via Gmail API
 */
export async function sendEmailViaGmail(options: SendEmailOptions): Promise<{ id: string; threadId: string }> {
  const token = await getAccessToken();
  
  const email = buildEmail(options);
  
  // Base64 URL encode
  const encodedEmail = Buffer.from(email)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ raw: encodedEmail })
  });

  const result = await response.json();

  if (result.error) {
    console.error('Gmail API error:', result.error);
    throw new Error(result.error.message || 'Failed to send email via Gmail');
  }

  console.log(`[Gmail] Email sent to ${options.to}, Message ID: ${result.id}`);
  
  return {
    id: result.id,
    threadId: result.threadId
  };
}

/**
 * Check if Gmail credentials are configured
 */
export function isGmailConfigured(): boolean {
  return fs.existsSync(credsPath) && fs.existsSync(keysPath);
}

export default {
  sendEmailViaGmail,
  isGmailConfigured
};
