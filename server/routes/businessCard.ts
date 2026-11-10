import { Router } from "express";
import { supabase } from "../supabaseClient";
import multer from "multer";
import path from "path";
import fs from "fs";
import { Resend } from "resend";
import {
  classifySegment,
  enrichCompany,
  generateFollowUpEmail,
  validateEmail,
  type ContactInfo,
  type EmailGenerationInput,
} from "../services/aiEmailService";
import { syncCRMContactToHubSpot } from "../services/hubspot";
import { sendEmailViaGmail, isGmailConfigured } from "../services/gmailService";
import { guardResend, sswFrom, SSW_BUSINESS_CARD_FROM_NAME, SSW_EMAIL_REPLY_TO } from "../../shared/sswEmailFrom.js";

const resend = guardResend(new Resend(process.env.RESEND_API_KEY));
const businessCardFrom = () => sswFrom(SSW_BUSINESS_CARD_FROM_NAME);

const router = Router();

// Configure multer for business card uploads
// Use client/public for static file serving compatibility
const uploadDir = path.join(process.cwd(), "client", "public", "uploads", "business-cards");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    cb(null, `${uniqueSuffix}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/heic"];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type. Only JPEG, PNG, WebP, and HEIC are allowed."));
    }
  },
});

import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Configure multer for audio uploads
const audioUploadDir = path.join(process.cwd(), "client", "public", "uploads", "audio");
if (!fs.existsSync(audioUploadDir)) {
  fs.mkdirSync(audioUploadDir, { recursive: true });
}

const audioStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, audioUploadDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    cb(null, `${uniqueSuffix}${path.extname(file.originalname) || '.webm'}`);
  },
});

const audioUpload = multer({
  storage: audioStorage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB limit for audio
  fileFilter: (req, file, cb) => {
    // Accept any audio type - be very permissive for mobile browser compatibility
    // iOS Safari uses audio/mp4, Chrome uses audio/webm, etc.
    console.log('[Audio Upload] Received file:', file.originalname, 'mimetype:', file.mimetype);
    if (file.mimetype.startsWith('audio/') || file.mimetype === 'application/octet-stream') {
      cb(null, true);
    } else {
      console.log('[Audio Upload] Rejected file type:', file.mimetype);
      cb(new Error(`Invalid file type: ${file.mimetype}. Only audio files are allowed.`));
    }
  },
});

// Analyze business card using Claude Vision API (faster, more accurate)
// Accepts EITHER: multipart form with "image" file OR JSON with "imageBase64"
router.post("/:slug/analyze-business-card", upload.single("image"), async (req, res) => {
  try {
    let base64Image: string;
    let mimeType: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
    let imagePath: string | null = null;

    // Check if we received base64 JSON (new flow) or file upload (old flow)
    if (req.body?.imageBase64) {
      // New flow: base64 JSON
      let imageData = req.body.imageBase64;
      mimeType = (req.body.mimeType || "image/jpeg") as typeof mimeType;

      // Extract base64 data from data URL if present
      if (imageData.includes(",")) {
        const parts = imageData.split(",");
        imageData = parts[1];
        // Detect mime type from data URL
        const dataUrlMatch = parts[0].match(/data:([^;]+)/);
        if (dataUrlMatch) {
          mimeType = dataUrlMatch[1] as typeof mimeType;
        }
      }
      base64Image = imageData;
    } else if (req.file) {
      // Old flow: file upload
      imagePath = `/uploads/business-cards/${req.file.filename}`;
      const fullPath = path.join(process.cwd(), "client", "public", imagePath);
      const imageBuffer = fs.readFileSync(fullPath);
      base64Image = imageBuffer.toString("base64");
      mimeType = req.file.mimetype as typeof mimeType;
    } else {
      return res.status(400).json({ error: "No image provided. Send imageBase64 field or upload a file." });
    }

    // Validate mime type
    const validTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!validTypes.includes(mimeType)) {
      mimeType = "image/jpeg";
    }

    // Call Claude Vision API
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicKey) {
      return res.status(500).json({ error: "AI service not configured" });
    }

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 500,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mimeType,
                data: base64Image,
              },
            },
            {
              type: "text",
              text: `Extract contact information from this business card. Return ONLY a valid JSON object with these exact fields (use empty string "" for any field you cannot find or read clearly - DO NOT GUESS or make up information):

{
  "firstName": "first name only",
  "lastName": "last name only",
  "email": "email address exactly as shown",
  "phone": "phone number exactly as shown",
  "companyName": "company or organization name",
  "title": "job title or position",
  "address": "full address if visible",
  "website": "website URL if shown"
}

CRITICAL: Only include information you can clearly read. If a phone number is partially visible or unclear, use "". Never guess or fabricate data.
Return ONLY the JSON object, no other text.`,
            },
          ],
        },
      ],
    });

    const content = (response.content[0] as any).text || "";

    // Parse the JSON response
    let extractedData;
    try {
      // Try to extract JSON from the response (in case there's extra text)
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        extractedData = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No JSON found in response");
      }
    } catch (parseError) {
      console.error("Failed to parse AI response:", content);
      // Return default empty values if parsing fails
      extractedData = {
        firstName: "",
        lastName: "",
        email: "",
        phone: "",
        companyName: "",
        title: "",
        address: "",
        website: "",
      };
    }

    // Ensure all expected fields exist
    const defaultFields = {
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      companyName: "",
      title: "",
      address: "",
      website: "",
    };

    extractedData = { ...defaultFields, ...extractedData };

    res.json({
      success: true,
      extractedData,
      ...(imagePath && { imagePath }),
    });
  } catch (error: any) {
    console.error("Error analyzing business card:", error);
    res.status(500).json({ error: error.message || "Failed to analyze business card" });
  }
});

// Helper function to ensure a representative exists for an admin
async function ensureRepresentativeForAdmin(adminId: string): Promise<number | null> {
  // Check if a representative already exists for this admin
  const { data: existingRep } = await supabase
    .from("representatives")
    .select("id")
    .eq("admin_id", adminId)
    .single();

  if (existingRep) {
    return existingRep.id;
  }

  // Get admin details to create representative (including gallery and video data)
  const { data: admin } = await supabase
    .from("admin_users")
    .select("id, email, full_name, phone, photo_url, slug, title, bio, banner_image_url, gallery_images, video_urls, company_name, address, city, state, zip_code, social_links, contact_button_text, contact_card_button_text, contact_form_title, contact_form_description")
    .eq("id", adminId)
    .single();

  if (!admin) {
    return null;
  }

  // Create a representative entry for this admin with all relevant fields
  const { data: newRep, error } = await supabase
    .from("representatives")
    .insert({
      admin_id: adminId,
      name: admin.full_name || "Admin",
      email: admin.email,
      phone: admin.phone,
      photo_url: admin.photo_url,
      slug: admin.slug,
      title: admin.title || "Team Member",
      bio: admin.bio,
      banner_image_url: admin.banner_image_url,
      gallery_images: admin.gallery_images || [],
      video_urls: admin.video_urls || [],
      company_name: admin.company_name,
      address: admin.address,
      city: admin.city,
      state: admin.state,
      zip_code: admin.zip_code,
      social_links: admin.social_links || {},
      contact_button_text: admin.contact_button_text,
      contact_card_button_text: admin.contact_card_button_text,
      contact_form_title: admin.contact_form_title,
      contact_form_description: admin.contact_form_description,
      is_active: true,
    })
    .select("id")
    .single();

  if (error) {
    console.error("Error creating representative for admin:", error);
    return null;
  }

  return newRep?.id || null;
}

// Submit business card contact
router.post("/:slug/submit-business-card", upload.single("image"), async (req, res) => {
  try {
    const { slug } = req.params;
    const { firstName, lastName, email, phone, companyName, title, address, website } = req.body;

    // Validate required fields
    if (!firstName || !lastName) {
      return res.status(400).json({ error: "First name and last name are required" });
    }

    // Get the image path if uploaded
    let businessCardImageUrl = null;
    if (req.file) {
      businessCardImageUrl = `/uploads/business-cards/${req.file.filename}`;
    }

    // Find the representative or admin by slug
    let adminId = null;
    let representativeId = null;

    // Try representatives first
    const { data: representative, error: repError } = await supabase
      .from("representatives")
      .select("id, admin_id")
      .eq("slug", slug)
      .eq("is_active", true)
      .single();

    if (representative && !repError) {
      representativeId = representative.id;
      adminId = representative.admin_id;
    } else {
      // Try admin_users
      const { data: admin, error: adminError } = await supabase
        .from("admin_users")
        .select("id")
        .eq("slug", slug)
        .eq("has_landing_page", true)
        .eq("is_active", true)
        .single();

      if (admin && !adminError) {
        adminId = admin.id;
        // Auto-create a representative for this admin to satisfy the NOT NULL constraint
        representativeId = await ensureRepresentativeForAdmin(admin.id);
        if (!representativeId) {
          console.error("Failed to create representative for admin:", admin.id);
          return res.status(500).json({ error: "Failed to process contact card" });
        }
      } else {
        return res.status(404).json({ error: "Contact card not found" });
      }
    }

    // Insert contact submission with business card data
    const contactData = {
      representative_id: representativeId,
      admin_id: adminId,
      first_name: firstName,
      last_name: lastName,
      email: email || null,
      phone: phone || null,
      company_name: companyName || null,
      message: `Business card scan - Title: ${title || "N/A"}, Address: ${address || "N/A"}, Website: ${website || "N/A"}`,
      source: "business_card_scan",
      status: "new",
      metadata: {
        title: title || null,
        address: address || null,
        website: website || null,
        business_card_image_url: businessCardImageUrl,
        scanned_at: new Date().toISOString(),
      },
    };

    const { data, error } = await supabase
      .from("representative_contacts")
      .insert(contactData)
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({
      success: true,
      data,
    });
  } catch (error: any) {
    console.error("Error submitting business card:", error);
    res.status(500).json({ error: error.message || "Failed to submit business card" });
  }
});

// ============================================================================
// CRM SEGMENTATION SYSTEM - NEW ENDPOINTS
// ============================================================================

/**
 * Auto-classify a contact into a segment based on title and company
 */
router.post("/classify-segment", async (req, res) => {
  try {
    const { title, company } = req.body;

    if (!title && !company) {
      return res.status(400).json({ error: "Title or company required" });
    }

    const segment = classifySegment(title || "", company || "");

    res.json({ segment });
  } catch (error: any) {
    console.error("Error classifying segment:", error);
    res.status(500).json({ error: error.message || "Failed to classify segment" });
  }
});

/**
 * Enrich company information by fetching website
 * Only returns verified information - never makes up data
 */
router.post("/enrich-company", async (req, res) => {
  try {
    const { company, website } = req.body;

    if (!company && !website) {
      return res.status(400).json({ error: "Company or website required" });
    }

    const companyContext = await enrichCompany(company, website);

    res.json({
      success: true,
      companyContext, // null if couldn't find info
      hasData: !!companyContext,
    });
  } catch (error: any) {
    console.error("Error enriching company:", error);
    res.status(500).json({ error: error.message || "Failed to enrich company" });
  }
});

/**
 * Transcribe audio using OpenAI Whisper
 * For voice notes during lead capture
 * Accepts EITHER: multipart form with "audio" file OR JSON with "audioBase64"
 */
router.post("/transcribe", audioUpload.single("audio"), async (req, res) => {
  let tempAudioPath: string | null = null;

  try {
    // Check if OpenAI API key is configured
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        error: "Voice transcription not configured. Please add OPENAI_API_KEY to enable this feature."
      });
    }

    let audioPath: string;

    // Check if we received base64 JSON (new flow) or file upload (old flow)
    if (req.body?.audioBase64) {
      // New flow: base64 JSON
      let audioData = req.body.audioBase64;
      const mimeType = req.body.mimeType || "audio/webm";

      // Extract base64 data from data URL if present
      if (audioData.includes(",")) {
        audioData = audioData.split(",")[1];
      }

      // Determine file extension from mime type
      const mimeToExt: Record<string, string> = {
        "audio/webm": "webm",
        "audio/webm;codecs=opus": "webm",
        "audio/mp4": "mp4",
        "audio/mpeg": "mp3",
        "audio/mp3": "mp3",
        "audio/wav": "wav",
        "audio/ogg": "ogg",
        "audio/flac": "flac",
        "audio/m4a": "m4a",
      };
      const ext = mimeToExt[mimeType] || mimeToExt[mimeType.split(";")[0]] || "webm";

      // Convert base64 to buffer and write to temp file
      const audioBuffer = Buffer.from(audioData, "base64");
      tempAudioPath = path.join(audioUploadDir, `temp-${Date.now()}.${ext}`);
      fs.writeFileSync(tempAudioPath, audioBuffer);
      audioPath = tempAudioPath;
    } else if (req.file) {
      // Old flow: file upload
      audioPath = path.join(audioUploadDir, req.file.filename);
      tempAudioPath = audioPath;
    } else {
      return res.status(400).json({ error: "No audio provided. Send audioBase64 field or upload a file." });
    }

    // Transcribe using Whisper
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(audioPath),
      model: "whisper-1",
      language: "en",
    });

    // Clean up the audio file after transcription
    if (tempAudioPath && fs.existsSync(tempAudioPath)) {
      fs.unlinkSync(tempAudioPath);
    }

    res.json({
      success: true,
      text: transcription.text,
    });
  } catch (error: any) {
    console.error("Error transcribing audio:", error);
    // Clean up on error
    if (tempAudioPath && fs.existsSync(tempAudioPath)) {
      fs.unlinkSync(tempAudioPath);
    }
    res.status(500).json({ error: error.message || "Failed to transcribe audio" });
  }
});

/**
 * Generate a human-sounding follow-up email using AI
 * CRITICAL: Only uses verified information, never makes up data
 */
router.post("/generate-email", async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      email,
      company,
      title,
      website,
      segment,
      event,
      contextNotes,
      companyContext,
    } = req.body;

    if (!firstName || !email) {
      return res.status(400).json({ error: "First name and email required" });
    }

    const contact: ContactInfo = {
      firstName,
      lastName: lastName || "",
      email,
      company: company || "",
      title: title || "",
      website,
    };

    const input: EmailGenerationInput = {
      contact,
      segment: segment || "other",
      event: event || "the conference",
      contextNotes: contextNotes || undefined,
      companyResearch: companyContext || undefined,
    };

    const generatedEmail = await generateFollowUpEmail(input);

    // Validate the email before returning
    const validation = validateEmail(generatedEmail);
    if (!validation.valid) {
      console.warn("Email validation issues:", validation.issues);
    }

    res.json({
      success: true,
      email: generatedEmail,
      validation,
    });
  } catch (error: any) {
    console.error("Error generating email:", error);
    res.status(500).json({ error: error.message || "Failed to generate email" });
  }
});

/**
 * Send the follow-up email via Gmail API (preferred - appears in Sent folder)
 * Falls back to Resend if Gmail is not configured
 */
router.post("/send-email", async (req, res) => {
  try {
    const { contactId, to, subject, body, useGmail } = req.body;

    if (!to || !subject || !body) {
      return res.status(400).json({ error: "To, subject, and body required" });
    }

    let messageId: string | undefined;
    let method: "gmail" | "resend" = "resend";

    // Try Gmail first if configured (preferred - emails appear in Sent folder)
    if (isGmailConfigured() && useGmail !== false) {
      try {
        const gmailResult = await sendEmailViaGmail({
          to,
          subject,
          body,
          from: businessCardFrom(),
          replyTo: SSW_EMAIL_REPLY_TO,
        });
        messageId = gmailResult.id;
        method = "gmail";
        console.log("[CRM Email] Sent via Gmail:", messageId);
      } catch (gmailError) {
        console.error("[CRM Email] Gmail failed, falling back to Resend:", gmailError);
        // Fall through to Resend
      }
    }

    // Fallback to Resend if Gmail didn't work
    if (!messageId) {
      const { data: emailData, error: emailError } = await resend.emails.send({
        from: businessCardFrom(),
        replyTo: SSW_EMAIL_REPLY_TO,
        to: [to],
        subject,
        text: body,
      });

      if (emailError) {
        throw new Error(emailError.message);
      }
      messageId = emailData?.id;
      method = "resend";
      console.log("[CRM Email] Sent via Resend:", messageId);
    }

    // Update contact record if contactId provided
    if (contactId) {
      await supabase
        .from("representative_contacts")
        .update({
          first_email_sent_at: new Date().toISOString(),
          first_email_subject: subject,
          first_email_body: body,
          status: "contacted",
          pipeline_stage: "awareness",
        })
        .eq("id", contactId);
    }

    res.json({
      success: true,
      messageId,
      method,
      sentAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Error sending email:", error);
    res.status(500).json({ error: error.message || "Failed to send email" });
  }
});

/**
 * Schedule email for later via Resend's scheduled_at parameter
 */
router.post("/schedule-email", async (req, res) => {
  try {
    const { contactId, to, subject, body, scheduledAt } = req.body;

    if (!to || !subject || !body) {
      return res.status(400).json({ error: "To, subject, and body required" });
    }

    // Parse scheduled time - must be in the future
    let scheduleTime: Date;
    if (scheduledAt) {
      scheduleTime = new Date(scheduledAt);
      // Ensure it's at least 1 minute in the future
      const minTime = new Date(Date.now() + 60000);
      if (scheduleTime < minTime) {
        scheduleTime = minTime;
      }
    } else {
      // Default: tomorrow at 9 AM MST (UTC-7)
      scheduleTime = new Date();
      scheduleTime.setDate(scheduleTime.getDate() + 1);
      scheduleTime.setHours(16, 0, 0, 0); // 9 AM MST = 4 PM UTC
    }

    // Schedule email via Resend with scheduled_at
    const { data: emailData, error: emailError } = await resend.emails.send({
      from: businessCardFrom(),
      replyTo: SSW_EMAIL_REPLY_TO,
      to: [to],
      subject,
      text: body,
      scheduledAt: scheduleTime.toISOString(),
    });

    if (emailError) {
      throw new Error(emailError.message);
    }

    // Update contact record if contactId provided
    if (contactId) {
      await supabase
        .from("representative_contacts")
        .update({
          scheduled_email_at: scheduleTime.toISOString(),
          first_email_subject: subject,
          first_email_body: body,
          status: "scheduled",
          pipeline_stage: "awareness",
        })
        .eq("id", contactId);
    }

    res.json({
      success: true,
      messageId: emailData?.id,
      scheduledAt: scheduleTime.toISOString(),
    });
  } catch (error: any) {
    console.error("Error scheduling email:", error);
    res.status(500).json({ error: error.message || "Failed to schedule email" });
  }
});

/**
 * Enhanced submit business card with CRM fields
 * Captures segment, lead source, context notes, and optionally generates/sends email
 */
router.post("/:slug/submit-business-card-enhanced", upload.single("image"), async (req, res) => {
  try {
    const { slug } = req.params;
    const {
      firstName,
      lastName,
      email,
      phone,
      companyName,
      title,
      address,
      website,
      // New CRM fields
      segment,
      leadSource,
      partnerOwner,
      contextNotes,
      companyContext,
      // Email options
      generateEmail,
      sendEmail,
      event,
    } = req.body;

    // Validate required fields
    if (!firstName || !lastName) {
      return res.status(400).json({ error: "First name and last name are required" });
    }

    // Get the image path if uploaded
    let businessCardImageUrl = null;
    if (req.file) {
      businessCardImageUrl = `/uploads/business-cards/${req.file.filename}`;
    }

    // Find the representative or admin by slug
    let adminId = null;
    let representativeId = null;

    const { data: representative } = await supabase
      .from("representatives")
      .select("id, admin_id")
      .eq("slug", slug)
      .eq("is_active", true)
      .single();

    if (representative) {
      representativeId = representative.id;
      adminId = representative.admin_id;
    } else {
      const { data: admin } = await supabase
        .from("admin_users")
        .select("id")
        .eq("slug", slug)
        .eq("has_landing_page", true)
        .eq("is_active", true)
        .single();

      if (admin) {
        adminId = admin.id;
        representativeId = await ensureRepresentativeForAdmin(admin.id);
        if (!representativeId) {
          return res.status(500).json({ error: "Failed to process contact card" });
        }
      } else {
        return res.status(404).json({ error: "Contact card not found" });
      }
    }

    // Auto-classify segment if not provided
    const finalSegment = segment || classifySegment(title || "", companyName || "");

    // Insert contact with enhanced CRM fields
    const contactData = {
      representative_id: representativeId,
      admin_id: adminId,
      first_name: firstName,
      last_name: lastName,
      email: email || null,
      phone: phone || null,
      company_name: companyName || null,
      title: title || null,
      website: website || null,
      message: contextNotes || null,
      source: "business_card_scan",
      status: "new",
      // New CRM fields
      segment: finalSegment,
      lead_source: leadSource || "other",
      partner_owner: partnerOwner || "ssw",
      context_notes: contextNotes || null,
      company_context: companyContext || null,
      pipeline_stage: "awareness",
      metadata: {
        address: address || null,
        business_card_image_url: businessCardImageUrl,
        scanned_at: new Date().toISOString(),
        event: event || null,
      },
    };

    const { data: contact, error: insertError } = await supabase
      .from("representative_contacts")
      .insert(contactData)
      .select()
      .single();

    if (insertError) throw insertError;

    // Sync to HubSpot (non-blocking - don't fail if HubSpot fails)
    let hubspotResult = null;
    if (email) {
      try {
        hubspotResult = await syncCRMContactToHubSpot({
          firstName,
          lastName,
          email,
          phone,
          company: companyName,
          title,
          website,
          segment: finalSegment,
          event: event || leadSource,
          notes: contextNotes,
        });
        console.log('[HubSpot] Sync result:', hubspotResult);
      } catch (hubspotError) {
        console.error('[HubSpot] Sync failed (non-blocking):', hubspotError);
      }
    }

    // Generate and optionally send email
    let emailResult = null;
    if (generateEmail === "true" || generateEmail === true) {
      const contactInfo: ContactInfo = {
        firstName,
        lastName: lastName || "",
        email: email || "",
        company: companyName || "",
        title: title || "",
        website,
      };

      const emailInput: EmailGenerationInput = {
        contact: contactInfo,
        segment: finalSegment,
        event: event || "the conference",
        contextNotes: contextNotes || undefined,
        companyResearch: companyContext || undefined,
      };

      const generatedEmail = await generateFollowUpEmail(emailInput);
      const validation = validateEmail(generatedEmail);

      emailResult = {
        generated: true,
        email: generatedEmail,
        validation,
        sent: false,
      };

      // Send email if requested and valid (prefer Gmail for Sent folder visibility)
      if ((sendEmail === "true" || sendEmail === true) && email && validation.valid) {
        try {
          let messageSent = false;
          let messageId: string | undefined;
          let sendMethod: "gmail" | "resend" = "resend";

          // Try Gmail first (appears in Sent folder)
          if (isGmailConfigured()) {
            try {
              const gmailResult = await sendEmailViaGmail({
                to: email,
                subject: generatedEmail.subject,
                body: generatedEmail.body,
                from: businessCardFrom(),
                replyTo: SSW_EMAIL_REPLY_TO,
              });
              messageId = gmailResult.id;
              messageSent = true;
              sendMethod = "gmail";
            } catch (gmailErr) {
              console.error("[CRM] Gmail send failed:", gmailErr);
            }
          }

          // Fallback to Resend
          if (!messageSent) {
            const { data: sendData, error: sendError } = await resend.emails.send({
              from: businessCardFrom(),
              replyTo: SSW_EMAIL_REPLY_TO,
              to: [email],
              subject: generatedEmail.subject,
              text: generatedEmail.body,
            });
            if (!sendError) {
              messageId = sendData?.id;
              messageSent = true;
              sendMethod = "resend";
            }
          }

          if (messageSent) {
            emailResult.sent = true;
            emailResult.messageId = messageId;
            emailResult.method = sendMethod;

            // Update contact with email info
            await supabase
              .from("representative_contacts")
              .update({
                first_email_sent_at: new Date().toISOString(),
                first_email_subject: generatedEmail.subject,
                first_email_body: generatedEmail.body,
                status: "contacted",
              })
              .eq("id", contact.id);
          }
        } catch (emailError) {
          console.error("Error sending email:", emailError);
          emailResult.sendError = (emailError as Error).message;
        }
      }
    }

    res.status(201).json({
      success: true,
      contact,
      segment: finalSegment,
      email: emailResult,
      hubspot: hubspotResult,
    });
  } catch (error: any) {
    console.error("Error submitting business card:", error);
    res.status(500).json({ error: error.message || "Failed to submit business card" });
  }
});

export default router;
