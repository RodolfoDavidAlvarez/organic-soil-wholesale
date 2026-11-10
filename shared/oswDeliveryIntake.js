/**
 * Fan out a paid OSW delivery order into ops_work_orders for Kerry's
 * Compost Developer intake queue (confirm / propose reschedule).
 *
 * Developer mode: intake SMS/email goes to Rodo only.
 */
import { createClient } from "@supabase/supabase-js";
import { isOswDeveloperMode, DEV_ADMIN_EMAIL, devModeSubject, devModeSmsBody } from "./developerMode.js";
import { resolveSswFrom, SSW_EMAIL_REPLY_TO } from "./sswEmailFrom.js";

function getDb() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error("Supabase not configured for delivery intake");
  return createClient(url, key);
}

function woNumber() {
  const d = new Date();
  const ymd = d.toISOString().slice(0, 10).replace(/-/g, "");
  const r = Math.floor(Math.random() * 9000) + 1000;
  return `OSW-${ymd}-${r}`;
}

function normalizePhone(raw) {
  let phone = String(raw || "").replace(/[^\d+]/g, "");
  if (phone.length === 10) phone = `+1${phone}`;
  else if (phone.length === 11 && phone.startsWith("1")) phone = `+${phone}`;
  else if (!phone.startsWith("+")) phone = `+${phone}`;
  return phone;
}

async function sendSms(to, body) {
  const SID = process.env.TWILIO_ACCOUNT_SID;
  const TOKEN = process.env.TWILIO_AUTH_TOKEN;
  const FROM = process.env.TWILIO_PHONE_NUMBER;
  if (!SID || !TOKEN || !FROM || !to) return;
  try {
    await fetch(`https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${SID}:${TOKEN}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        To: normalizePhone(to),
        From: FROM,
        Body: body,
      }),
    });
  } catch (e) {
    console.error("[oswDeliveryIntake] SMS failed:", e?.message || e);
  }
}

async function sendEmail({ to, subject, html }) {
  if (!process.env.RESEND_API_KEY || !to?.length) return;
  try {
    const { Resend } = await import("resend");
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: resolveSswFrom(process.env.INTAKE_NOTIFY_FROM, "Organic Soil Wholesale"),
      replyTo: SSW_EMAIL_REPLY_TO,
      to,
      subject,
      html,
    });
  } catch (e) {
    console.error("[oswDeliveryIntake] email failed:", e?.message || e);
  }
}

async function notifyIntake(wo) {
  const intakeUrl = process.env.CD_INTAKE_URL || "https://www.compostdeveloper.com/app/ops/intake-queue";
  const when = [wo.preferred_delivery_date, wo.preferred_delivery_time].filter(Boolean).join(" · ") || "TBD";
  const smsBody = `OSW delivery ${wo.source_order_number || wo.wo_number}: ${wo.product_name || "order"} → ${wo.destination_city || "site"} · ${when}. Accept: ${intakeUrl}`;
  const html = `<p>New OSW delivery needs confirm / reschedule in Compost Developer.</p>
    <p><strong>${wo.product_name || "Order"}</strong><br>
    ${wo.client_name || ""} · ${[wo.destination_address, wo.destination_city, wo.destination_state, wo.destination_zip].filter(Boolean).join(", ")}<br>
    Availability: ${when}</p>
    <p><a href="${intakeUrl}">Open intake queue</a></p>
    <pre style="white-space:pre-wrap;font-size:12px;color:#444">${wo.custom_notes || ""}</pre>`;

  if (isOswDeveloperMode()) {
    const rodoPhone = process.env.RODO_PHONE;
    if (rodoPhone) await sendSms(rodoPhone, devModeSmsBody(smsBody));
    await sendEmail({
      to: [DEV_ADMIN_EMAIL],
      subject: devModeSubject(`Delivery intake · ${wo.source_order_number || wo.wo_number}`),
      html,
    });
    return;
  }

  const phones = String(process.env.INTAKE_NOTIFY_PHONES || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const emails = String(process.env.INTAKE_NOTIFY_EMAILS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (!phones.length && !emails.length) {
    console.warn("[oswDeliveryIntake] No recipients — falling back to Rodo");
    if (process.env.RODO_PHONE) await sendSms(process.env.RODO_PHONE, smsBody);
    await sendEmail({
      to: [DEV_ADMIN_EMAIL],
      subject: `Delivery intake · ${wo.source_order_number || wo.wo_number}`,
      html,
    });
    return;
  }

  for (const phone of phones) await sendSms(phone, smsBody);
  if (emails.length) {
    await sendEmail({
      to: emails,
      subject: `New Order · OSW · ${wo.source_order_number || wo.wo_number} — Accept in 15m`,
      html,
    });
  }
}

/**
 * @param {number} orderId
 * @returns {Promise<number|null>} work order id
 */
export async function createDeliveryWorkOrderFromOswOrder(orderId) {
  const db = getDb();
  const { data: order, error: orderErr } = await db.from("orders").select("*").eq("id", orderId).single();
  if (orderErr || !order) {
    console.error("[oswDeliveryIntake] order lookup failed:", orderErr);
    return null;
  }

  if ((order.fulfillment_type || order.delivery_type || "").toLowerCase() !== "delivery") {
    return null;
  }

  const { data: existing } = await db
    .from("ops_work_orders")
    .select("id")
    .eq("source_channel", "osw")
    .eq("source_order_id", orderId)
    .limit(1)
    .maybeSingle();
  if (existing?.id) return existing.id;

  const { data: relItems } = await db
    .from("order_items")
    .select("product_id, quantity, unit_price, total_price, size_option, products(name)")
    .eq("order_id", orderId);

  const lineItems = (relItems || []).map((row) => ({
    product_id: row.product_id,
    product_name: row.products?.name || null,
    quantity: row.quantity,
    size_option: row.size_option,
  }));

  const primary = lineItems[0] || null;
  const isRlsBrand = order.brand_id === "regenerative_landscaper_supply";
  const productName = `${isRlsBrand ? "Regenerative Landscaper Supply · " : ""}${
    lineItems.length > 1 ? `OSW Order Bundle (${lineItems.length} lines)` : primary?.product_name || "OSW Delivery"
  }`;
  const sizeCategory = primary?.size_option || "Truckload";
  const totalQuantity = lineItems.reduce((sum, i) => sum + (i.quantity || 0), 0) || 1;

  const deliveryJson = order.delivery_address_json || {};
  const availFrom = deliveryJson.availabilityFrom || order.preferred_date || null;
  const availTo = deliveryJson.availabilityTo || null;
  const windowLabel = deliveryJson.preferredWindow || order.preferred_time_start || null;
  const rangeLabel =
    availFrom && availTo && availFrom !== availTo
      ? `${availFrom} → ${availTo}`
      : availFrom || "TBD";

  const preferredTime = [windowLabel, availTo && availFrom !== availTo ? `available through ${availTo}` : null]
    .filter(Boolean)
    .join(" · ");

  const acceptDeadline = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  const { data: wo, error: woErr } = await db
    .from("ops_work_orders")
    .insert({
      organization_id: Number.parseInt(process.env.SSW_OPS_ORG_ID || "1", 10) || 1,
      wo_number: woNumber(),
      product_type: "standard",
      product_name: productName,
      product_id: primary?.product_id ? String(primary.product_id) : null,
      size_category: sizeCategory,
      size_category_name: sizeCategory,
      quantity: totalQuantity,
      quantity_type: "unit",
      custom_notes: [
        `${isRlsBrand ? "Regenerative Landscaper Supply" : "OSW"} Order: ${order.order_number || order.id}`,
        `Customer availability: ${rangeLabel}${windowLabel ? ` · ${windowLabel}` : ""}`,
        order.notes ? `Notes: ${order.notes}` : "",
        order.payment_status ? `Payment: ${order.payment_status}` : "",
        "Action: Confirm preferred window or propose a reschedule in Compost Developer.",
      ]
        .filter(Boolean)
        .join("\n"),
      work_order_notes: order.notes || null,
      needs_transportation: true,
      destination_address: order.address || deliveryJson.street || deliveryJson.line1 || null,
      destination_city: deliveryJson.city || null,
      destination_state: deliveryJson.state || null,
      destination_zip: deliveryJson.zip || order.delivery_zip || null,
      preferred_delivery_date: availFrom,
      preferred_delivery_time: preferredTime || null,
      status: "pending",
      priority: Number(order.total_amount || 0) >= 1000 || Number(order.total || 0) >= 100000 ? "high" : "normal",
      order_type: "osw_delivery",
      client_name: order.customer_name || order.business_name || "OSW Customer",
      created_by: order.customer_name || "OSW Customer",
      source_channel: "osw",
      brand_id: order.brand_id || null,
      source_order_id: order.id,
      source_order_number: order.order_number || String(order.id),
      accept_deadline: acceptDeadline,
    })
    .select()
    .single();

  if (woErr || !wo) {
    console.error("[oswDeliveryIntake] WO create failed:", woErr);
    return null;
  }

  if (lineItems.length) {
    const { error: lineErr } = await db.from("ops_work_order_lines").insert(
      lineItems.map((item, index) => ({
        work_order_id: wo.id,
        product_type: "standard",
        product_name: item.product_name || productName,
        product_id: item.product_id ? String(item.product_id) : null,
        size_category: item.size_option || sizeCategory,
        size_category_name: item.size_option || sizeCategory,
        quantity: item.quantity || 1,
        quantity_type: "unit",
        sort_order: index,
      })),
    );
    if (lineErr) console.error("[oswDeliveryIntake] line insert failed:", lineErr);
  }

  try {
    await notifyIntake(wo);
  } catch (e) {
    console.error("[oswDeliveryIntake] notify failed (non-blocking):", e?.message || e);
  }

  return wo.id;
}
