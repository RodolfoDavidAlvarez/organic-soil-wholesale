/**
 * Phase 3: Notification fan-out for the unified order intake queue.
 *
 * When ANY channel (OSW, MOS, social) creates a pending ops_work_orders row,
 * call notifyIntakeTeam(wo) to fire SMS + Email to Kerry/Sabrina/Rodo so they
 * see the order in CompostDeveloper.com/app/ops/intake-queue within 15 minutes.
 *
 * Recipient lists live in env:
 *   INTAKE_NOTIFY_PHONES  - comma-separated E.164 (e.g. "+19285501649,+16025550100")
 *   INTAKE_NOTIFY_EMAILS  - comma-separated emails
 *
 * Twilio + Resend creds are required (RESEND_API_KEY, TWILIO_ACCOUNT_SID,
 * TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER). If not configured the call is a noop.
 *
 * Phase 7: every send is recorded in `notification_log` (best-effort, non-blocking).
 */

import { supabase } from "../supabaseClient.js";
import { resolveSswFrom, SSW_EMAIL_REPLY_TO } from "../../shared/sswEmailFrom.js";

interface WorkOrder {
  id: number;
  wo_number: string;
  product_name: string | null;
  size_category_name: string | null;
  size_category: string | null;
  quantity: number | null;
  quantity_type: string | null;
  client_name: string | null;
  source_channel: string | null;
  source_order_number: string | null;
  destination_address: string | null;
  destination_city: string | null;
  destination_state: string | null;
  preferred_delivery_date: string | null;
  priority: string | null;
  accept_deadline: string | null;
  custom_notes: string | null;
}

const SOURCE_LABEL: Record<string, string> = {
  mos: "MyOrganicSoil (Rep)",
  osw: "OSW Customer",
  cd: "Direct",
  social: "Social",
};

const SOURCE_SHORT: Record<string, string> = {
  mos: "MOS",
  osw: "OSW",
  cd: "DIRECT",
  social: "SOCIAL",
};

function intakeUrl(): string {
  return process.env.CD_INTAKE_URL || "https://www.compostdeveloper.com/app/ops/intake-queue";
}

function formatDeadlineAz(iso: string | null): string {
  if (!iso) return "no deadline";
  try {
    return new Date(iso).toLocaleString("en-US", {
      timeZone: "America/Phoenix",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return "—";
  }
}

function escapeHtml(s: string | null | undefined): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function logNotification(row: {
  channel: "sms" | "email";
  recipient: string;
  subject?: string | null;
  body: string;
  status: "sent" | "failed";
  provider: string;
  provider_id?: string | null;
  error?: string | null;
  related_wo_id?: number | null;
}) {
  try {
    const { error } = await supabase.from("notification_log").insert({
      notification_type: row.channel,
      template_name: `osw_intake_${row.channel}`,
      recipient: row.recipient,
      subject: row.subject ?? null,
      content: row.body,
      status: row.status,
      provider: row.provider,
      provider_id: row.provider_id ?? null,
      error_message: row.error ?? null,
      source_app: "osw_intake",
      related_wo_id: row.related_wo_id ?? null,
      sent_at: new Date().toISOString(),
    });
    if (error) console.error("[intakeNotify] log insert error:", error.message);
  } catch (e) {
    console.error("[intakeNotify] log write failed (non-blocking):", e);
  }
}

async function sendSMS(
  to: string,
  body: string,
  woId?: number | null,
): Promise<{ success: boolean; error?: string }> {
  const SID = process.env.TWILIO_ACCOUNT_SID;
  const TOKEN = process.env.TWILIO_AUTH_TOKEN;
  const FROM = process.env.TWILIO_PHONE_NUMBER;
  if (!SID || !TOKEN || !FROM) {
    await logNotification({
      channel: "sms",
      recipient: to,
      body,
      status: "failed",
      provider: "twilio",
      error: "twilio_not_configured",
      related_wo_id: woId ?? null,
    });
    return { success: false, error: "twilio_not_configured" };
  }

  let phone = String(to).replace(/[^+\d]/g, "");
  if (phone.length === 10) phone = "+1" + phone;
  else if (phone.length === 11 && phone.startsWith("1")) phone = "+" + phone;
  else if (!phone.startsWith("+")) phone = "+" + phone;

  try {
    const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(SID + ":" + TOKEN).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: phone, From: FROM, Body: body }),
    });
    const data: any = await resp.json();
    if (data.sid) {
      await logNotification({
        channel: "sms",
        recipient: phone,
        body,
        status: "sent",
        provider: "twilio",
        provider_id: data.sid,
        related_wo_id: woId ?? null,
      });
      return { success: true };
    }
    console.error("[intakeNotify] Twilio error:", data.message || data);
    await logNotification({
      channel: "sms",
      recipient: phone,
      body,
      status: "failed",
      provider: "twilio",
      error: data.message || "send_failed",
      related_wo_id: woId ?? null,
    });
    return { success: false, error: data.message || "send_failed" };
  } catch (e: any) {
    console.error("[intakeNotify] SMS send error:", e);
    await logNotification({
      channel: "sms",
      recipient: to,
      body,
      status: "failed",
      provider: "twilio",
      error: e?.message || "exception",
      related_wo_id: woId ?? null,
    });
    return { success: false, error: e.message };
  }
}

async function sendEmail(
  to: string[],
  subject: string,
  html: string,
  woId?: number | null,
): Promise<boolean> {
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY || !to.length) {
    for (const r of to) {
      await logNotification({
        channel: "email",
        recipient: r,
        subject,
        body: html,
        status: "failed",
        provider: "resend",
        error: !RESEND_API_KEY ? "resend_not_configured" : "no_recipients",
        related_wo_id: woId ?? null,
      });
    }
    return false;
  }
  const from = resolveSswFrom(process.env.INTAKE_NOTIFY_FROM, "Soil Seed & Water");
  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to, subject, html, reply_to: SSW_EMAIL_REPLY_TO }),
    });
    const ok = resp.ok;
    const data: any = await resp.json().catch(() => ({}));
    for (const r of to) {
      await logNotification({
        channel: "email",
        recipient: r,
        subject,
        body: html,
        status: ok ? "sent" : "failed",
        provider: "resend",
        provider_id: data?.id ?? null,
        error: ok ? null : data?.message || `http_${resp.status}`,
        related_wo_id: woId ?? null,
      });
    }
    return ok;
  } catch (e: any) {
    console.error("[intakeNotify] Email send error:", e);
    for (const r of to) {
      await logNotification({
        channel: "email",
        recipient: r,
        subject,
        body: html,
        status: "failed",
        provider: "resend",
        error: e?.message || "exception",
        related_wo_id: woId ?? null,
      });
    }
    return false;
  }
}

function buildItemLine(wo: WorkOrder): string {
  const sizeStr = wo.size_category_name || wo.size_category;
  const parts = [
    wo.quantity != null ? String(wo.quantity) : null,
    wo.quantity_type || null,
    wo.product_name || null,
  ].filter(Boolean);
  let line = parts.join(" ").replace(/\s+/g, " ").trim();
  if (sizeStr) line = line ? `${line} (${sizeStr})` : `(${sizeStr})`;
  return line;
}

function buildSmsBody(wo: WorkOrder): string {
  const source = SOURCE_SHORT[wo.source_channel || "cd"] || "ORDER";
  const orderRef = wo.source_order_number || wo.wo_number;
  const priority =
    wo.priority === "high" || wo.priority === "urgent"
      ? ` [${wo.priority.toUpperCase()}]`
      : "";
  const client = wo.client_name || "—";
  const item = buildItemLine(wo) || "See intake queue for details";
  const city = [wo.destination_city, wo.destination_state].filter(Boolean).join(", ");
  const deadline = formatDeadlineAz(wo.accept_deadline);

  const lines = [
    `NEW ORDER · ${source}${priority}`,
    `${orderRef} · ${client}`,
    item,
  ];
  if (city) lines.push(city);
  lines.push(`Accept by ${deadline} AZ (15-min SLA)`);
  lines.push(intakeUrl());
  return lines.join("\n");
}

function buildEmailHtml(wo: WorkOrder): string {
  const sourceLabel = SOURCE_LABEL[wo.source_channel || "cd"] || "Order";
  const orderRef = escapeHtml(wo.source_order_number || wo.wo_number);
  const client = escapeHtml(wo.client_name);
  const deadline = escapeHtml(formatDeadlineAz(wo.accept_deadline));
  const item = escapeHtml(buildItemLine(wo));
  const sizeStr = escapeHtml(wo.size_category_name || wo.size_category);
  const deliveryAddr = escapeHtml(
    [wo.destination_address, wo.destination_city, wo.destination_state].filter(Boolean).join(", ")
  );
  const prefDate = escapeHtml(wo.preferred_delivery_date);
  const url = intakeUrl();
  const isPriority = wo.priority === "high" || wo.priority === "urgent";

  const priorityBadge = isPriority
    ? `<span style="display:inline-block;background:rgba(220,38,38,0.92);color:#ffffff;font-size:10px;font-weight:700;padding:3px 9px;border-radius:99px;letter-spacing:0.5px;margin-left:6px;text-transform:uppercase">${escapeHtml(wo.priority)}</span>`
    : "";

  const sourcePill = `<span style="display:inline-block;background:rgba(255,255,255,0.18);color:#ffffff;font-size:11px;font-weight:600;padding:4px 10px;border-radius:99px;letter-spacing:0.4px">${escapeHtml(sourceLabel)}</span>`;

  const notesBlock = wo.custom_notes
    ? `<div style="margin-top:18px;padding:12px 14px;background:#fffbea;border-left:3px solid #f59e0b;border-radius:6px;color:#92400e;font-size:13px;white-space:pre-wrap;line-height:1.5">${escapeHtml(wo.custom_notes)}</div>`
    : "";

  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f4f6f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px"><tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.06)">

<tr><td style="background:linear-gradient(135deg,#264027,#3a5a3c);padding:22px 28px">
  <div style="color:rgba(255,255,255,0.75);font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1.2px">New Intake</div>
  <div style="margin-top:8px">${sourcePill}${priorityBadge}</div>
  <h1 style="margin:12px 0 0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.3px">${orderRef}</h1>
  ${client ? `<div style="margin-top:2px;color:rgba(255,255,255,0.85);font-size:15px;font-weight:500">${client}</div>` : ""}
</td></tr>

<tr><td style="background:#fff7e0;padding:12px 28px;border-bottom:1px solid #fde68a">
  <div style="color:#92400e;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px">Accept by ${deadline} AZ</div>
  <div style="color:#a16207;font-size:11px;margin-top:2px">15-minute SLA · flagged overdue after that</div>
</td></tr>

<tr><td style="padding:24px 28px">
  <div style="font-size:17px;font-weight:600;color:#111;margin-bottom:14px;line-height:1.4">${item || "See queue for details"}</div>

  <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
    ${sizeStr ? `<tr><td style="padding:6px 0;color:#6b7280;font-size:12px;width:110px">Size</td><td style="padding:6px 0;color:#111;font-size:13px">${sizeStr}</td></tr>` : ""}
    ${deliveryAddr ? `<tr><td style="padding:6px 0;color:#6b7280;font-size:12px">Delivery</td><td style="padding:6px 0;color:#111;font-size:13px">${deliveryAddr}</td></tr>` : ""}
    ${prefDate ? `<tr><td style="padding:6px 0;color:#6b7280;font-size:12px">Pref Date</td><td style="padding:6px 0;color:#111;font-size:13px">${prefDate}</td></tr>` : ""}
  </table>

  ${notesBlock}

  <div style="margin-top:24px">
    <a href="${url}" style="display:inline-block;background:#264027;color:#ffffff;text-decoration:none;padding:13px 28px;border-radius:8px;font-size:14px;font-weight:600;box-shadow:0 2px 6px rgba(38,64,39,0.25)">Accept or Reject →</a>
  </div>
  <div style="margin-top:10px;color:#6b7280;font-size:11px">
    Or open the <a href="${url}" style="color:#264027;text-decoration:underline">CompostDeveloper Intake Queue</a> directly.
  </div>
</td></tr>

<tr><td style="padding:14px 28px;background:#f9fafb;border-top:1px solid #e5e7eb;color:#9ca3af;font-size:11px;text-align:center">
  Soil Seed &amp; Water · Intake notification · You're on the SSW intake roster
</td></tr>

</table>
</td></tr></table>
</body>
</html>`;
}

export async function notifyIntakeTeam(wo: WorkOrder): Promise<void> {
  const { isOswDeveloperMode } = await import("../../shared/developerMode.js");

  let phones = (process.env.INTAKE_NOTIFY_PHONES || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  let emails = (process.env.INTAKE_NOTIFY_EMAILS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // While testing: never fan out to Kerry/Sabrina — Rodo only.
  if (isOswDeveloperMode()) {
    phones = process.env.RODO_PHONE ? [process.env.RODO_PHONE] : [];
    emails = ["ralvarez@soilseedandwater.com"];
  }

  if (phones.length === 0 && emails.length === 0) {
    console.warn(
      "[intakeNotify] No recipients configured. Set INTAKE_NOTIFY_PHONES and/or INTAKE_NOTIFY_EMAILS in env.",
    );
    return;
  }

  const src = SOURCE_SHORT[wo.source_channel || "cd"] || "ORDER";
  const ref = wo.source_order_number || wo.wo_number;
  const clientSuffix = wo.client_name ? ` · ${wo.client_name}` : "";
  const subjectPriority =
    wo.priority === "high" || wo.priority === "urgent" ? `[${wo.priority.toUpperCase()}] ` : "";
  const emailSubject = `${subjectPriority}New Order · ${src} · ${ref}${clientSuffix} — Accept in 15m`;

  const smsBody = buildSmsBody(wo);
  const emailHtml = buildEmailHtml(wo);

  const tasks: Promise<any>[] = [];
  for (const phone of phones) tasks.push(sendSMS(phone, smsBody, wo.id));
  if (emails.length) tasks.push(sendEmail(emails, emailSubject, emailHtml, wo.id));

  await Promise.allSettled(tasks);
}
