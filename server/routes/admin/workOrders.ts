/**
 * Work Orders System API
 * Create, manage, and generate PDF Work Orders
 */

import { Router } from "express";
import { supabase } from "../../supabaseClient.js";
import { adminAuthMiddleware, AdminRequest, verifyAdminTokenValue } from "../../middleware/adminAuth.js";
import { AirtableSyncService } from "../../services/airtableSyncService.js";
import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { resolveSswFrom, SSW_EMAIL_REPLY_TO } from "../../../shared/sswEmailFrom.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();
function workOrderFromEmail() {
  return resolveSswFrom(process.env.WORK_ORDER_NOTIFICATION_FROM_EMAIL, "SSW Operations");
}
const PUBLIC_SITE_BASE_URL = process.env.PUBLIC_SITE_BASE_URL || "https://www.organicsoilwholesale.com";

const SIZE_CATEGORY_IMAGE_FALLBACKS: Record<string, string[]> = {
  "9lb": ["/size-categories/9lb-pallet.jpg", "/size-categories/9lb-pallet.png"],
  "7.5qt": ["/size-categories/7.5qt-pallet.jpg", "/size-categories/7.5qt-pallet.png"],
  "1cf": ["/size-categories/1cf-pallet.jpg", "/size-categories/1cf-pallet.png"],
  "1.5cf": ["/size-categories/1cf-pallet.jpg", "/size-categories/1cf-pallet.png"],
  "2cf": ["/size-categories/2cf-pallet.jpg", "/size-categories/2cf-pallet.png"],
  tote: ["/size-categories/tote.jpg", "/size-categories/tote.png"],
  bulk: ["/size-categories/bulk.jpg", "/size-categories/bulk.png"],
};

function imageMimeTypeFromPath(imagePath: string): string {
  const cleanPath = imagePath.split("?")[0].split("#")[0];
  const ext = path.extname(cleanPath).toLowerCase();
  if (ext === ".webp") return "image/webp";
  if (ext === ".png") return "image/png";
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".gif") return "image/gif";
  return "image/jpeg";
}

function toPublicPath(imagePathOrUrl: string): string {
  if (!imagePathOrUrl) return "";
  if (/^https?:\/\//i.test(imagePathOrUrl)) {
    try {
      const parsed = new URL(imagePathOrUrl);
      return `${parsed.pathname}${parsed.search || ""}`;
    } catch {
      return imagePathOrUrl;
    }
  }
  return imagePathOrUrl.startsWith("/") ? imagePathOrUrl : `/${imagePathOrUrl}`;
}

function getSizeCategoryFallbackPaths(code?: string | null): string[] {
  if (!code) return [];
  const normalized = String(code).toLowerCase();
  return SIZE_CATEGORY_IMAGE_FALLBACKS[normalized] || [];
}

async function loadImageAsBase64(imagePathOrUrl?: string | null, fallbackPaths: string[] = []): Promise<string | null> {
  const candidates = [imagePathOrUrl, ...fallbackPaths].filter(Boolean) as string[];

  for (const rawCandidate of candidates) {
    const candidate = rawCandidate.trim();
    if (!candidate) continue;
    if (candidate.startsWith("data:")) return candidate;

    const publicPath = toPublicPath(candidate);

    // Prefer local filesystem when candidate is a local/public path.
    if (!/^https?:\/\//i.test(candidate)) {
      const relativePath = publicPath.replace(/^\//, "");
      const localPath = path.join(__dirname, "../../../client/public", relativePath);
      try {
        if (fs.existsSync(localPath)) {
          const imageBuffer = fs.readFileSync(localPath);
          const mimeType = imageMimeTypeFromPath(publicPath);
          return `data:${mimeType};base64,${imageBuffer.toString("base64")}`;
        }
      } catch (error) {
        console.warn("Could not load local image:", localPath, error);
      }
    }

    const remoteUrl = /^https?:\/\//i.test(candidate) ? candidate : `${PUBLIC_SITE_BASE_URL}${publicPath}`;
    try {
      const response = await fetch(remoteUrl);
      if (!response.ok) continue;
      const contentType = (response.headers.get("content-type") || "").toLowerCase();
      if (!contentType.startsWith("image/")) continue;
      const imageBuffer = Buffer.from(await response.arrayBuffer());
      const mimeType = imageMimeTypeFromPath(candidate);
      return `data:${mimeType};base64,${imageBuffer.toString("base64")}`;
    } catch (error) {
      console.warn("Could not fetch image:", remoteUrl, error);
    }
  }

  return null;
}

type WorkOrderPdfType = "workorder" | "label" | "both";

async function getHydratedWorkOrderForPdf(id: string | number): Promise<any | null> {
  const { data: wo, error } = await supabase.from("ops_work_orders").select("*").eq("id", id).single();

  if (error) throw error;
  if (!wo) return null;

  const { data: woLines } = await supabase.from("ops_work_order_lines").select("*").eq("work_order_id", id).order("sort_order", { ascending: true });
  (wo as any).lines = woLines || [];

  // Hydrate product and size-category illustrations for top-level WO and each line item.
  const lines = ((wo as any).lines || []) as any[];
  const uniqueProductIds = Array.from(
    new Set([wo.product_id, ...lines.map((l) => l.product_id)].filter((value) => typeof value === "string" && value.trim()) as string[]),
  );
  const uniqueSizeCodes = Array.from(
    new Set([wo.size_category, ...lines.map((l) => l.size_category)].filter((value) => typeof value === "string" && value.trim()) as string[]),
  );

  const [productCacheResult, sizeCacheResult] = await Promise.all([
    uniqueProductIds.length
      ? supabase.from("ops_products_cache").select("product_id, illustration_url").in("product_id", uniqueProductIds)
      : Promise.resolve({ data: [], error: null } as any),
    uniqueSizeCodes.length
      ? supabase.from("ops_size_categories_cache").select("code, illustration_url").in("code", uniqueSizeCodes)
      : Promise.resolve({ data: [], error: null } as any),
  ]);

  if (productCacheResult.error) {
    console.warn("Failed to load product illustration cache:", productCacheResult.error.message);
  }
  if (sizeCacheResult.error) {
    console.warn("Failed to load size-category illustration cache:", sizeCacheResult.error.message);
  }

  const productIllustrationPathById = new Map<string, string | null>(
    ((productCacheResult.data || []) as Array<{ product_id: string; illustration_url: string | null }>).map((p) => [
      p.product_id,
      p.illustration_url || null,
    ]),
  );
  const sizeIllustrationPathByCode = new Map<string, string | null>(
    ((sizeCacheResult.data || []) as Array<{ code: string; illustration_url: string | null }>).map((s) => [s.code, s.illustration_url || null]),
  );

  const productBase64ById = new Map<string, string | null>();
  await Promise.all(
    uniqueProductIds.map(async (productId) => {
      const cachedPath = productIllustrationPathById.get(productId) || null;
      const localFallback = `/product-illustrations/${productId.toLowerCase()}-small.webp`;
      const base64 = await loadImageAsBase64(cachedPath, [localFallback]);
      productBase64ById.set(productId, base64);
    }),
  );

  const sizeBase64ByCode = new Map<string, string | null>();
  await Promise.all(
    uniqueSizeCodes.map(async (sizeCode) => {
      const cachedPath = sizeIllustrationPathByCode.get(sizeCode) || null;
      const base64 = await loadImageAsBase64(cachedPath, getSizeCategoryFallbackPaths(sizeCode));
      sizeBase64ByCode.set(sizeCode, base64);
    }),
  );

  wo.illustration_base64 = wo.product_id ? productBase64ById.get(wo.product_id) || null : null;
  wo.size_category_illustration_base64 = wo.size_category ? sizeBase64ByCode.get(wo.size_category) || null : null;

  (wo as any).lines = lines.map((line) => ({
    ...line,
    product_illustration_base64: line.product_id ? productBase64ById.get(line.product_id) || null : null,
    size_category_illustration_base64: line.size_category ? sizeBase64ByCode.get(line.size_category) || null : null,
  }));

  return wo;
}

async function generateWorkOrderPdfBuffer(wo: any, pdfType: WorkOrderPdfType = "workorder"): Promise<{ pdfBuffer: Buffer; filename: string }> {
  let html: string;
  let filename: string;

  switch (pdfType) {
    case "label":
      html = generatePalletLabelHTML(wo);
      filename = `${wo.wo_number}-label.pdf`;
      break;
    case "both":
      html = generateCombinedPDFHTML(wo);
      filename = `${wo.wo_number}-complete.pdf`;
      break;
    case "workorder":
    default:
      html = generateWorkOrderPDFHTML(wo);
      filename = `${wo.wo_number}.pdf`;
      break;
  }

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdf = await page.pdf({
      format: "Letter",
      printBackground: true,
      margin: {
        top: "0.3in",
        right: "0.3in",
        bottom: "0.3in",
        left: "0.3in",
      },
    });
    return { pdfBuffer: Buffer.from(pdf), filename };
  } finally {
    await browser.close();
  }
}

async function generateWorkOrderPdfById(
  id: string | number,
  pdfType: WorkOrderPdfType = "workorder",
): Promise<{ pdfBuffer: Buffer; filename: string; wo: any }> {
  const wo = await getHydratedWorkOrderForPdf(id);
  if (!wo) {
    throw new Error("Work order not found");
  }
  const { pdfBuffer, filename } = await generateWorkOrderPdfBuffer(wo, pdfType);
  return { pdfBuffer, filename, wo };
}

/**
 * Send "new work order" notification emails to all recipients in Operations Settings.
 * Uses Resend; from: SSW Operations on the verified bettersystems.ai mailbox.
 * Does not throw — logs errors so creation still succeeds.
 */
async function sendNewWorkOrderNotifications(wo: {
  id: number;
  wo_number: string;
  product_name: string | null;
  total_weight_lbs?: number | null;
  created_by?: string | null;
  created_at: string;
}): Promise<void> {
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) {
    console.warn("[Work Order Notifications] RESEND_API_KEY not set; skipping email.");
    return;
  }

  const { data: recipients, error } = await supabase
    .from("ops_work_order_notification_recipients")
    .select("id, name, email, notify_by_email")
    .not("email", "is", null);

  if (error || !recipients?.length) {
    if (error) console.warn("[Work Order Notifications] Failed to fetch recipients:", error.message);
    return;
  }

  // Only send email to recipients who have email and have "notify by email" enabled
  const toEmail = recipients.filter(
    (r: { email?: string | null; notify_by_email?: boolean }) => (r.email || "").trim() && r.notify_by_email !== false,
  );
  if (toEmail.length === 0) return;

  let attachmentBase64: string | null = null;
  let attachmentFilename = `${wo.wo_number}.pdf`;
  try {
    const { pdfBuffer, filename } = await generateWorkOrderPdfById(wo.id, "workorder");
    attachmentBase64 = pdfBuffer.toString("base64");
    attachmentFilename = filename;
  } catch (attachmentError) {
    console.warn("[Work Order Notifications] Could not generate attached PDF; sending email without attachment.", attachmentError);
  }

  const createdDate = wo.created_at
    ? new Date(wo.created_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const weightLine =
    wo.total_weight_lbs != null && wo.total_weight_lbs > 0
      ? `<tr><td style="padding: 6px 0; font-size: 13px; color: #666;">Total weight</td><td style="padding: 6px 0; font-size: 14px; color: #111; font-weight: 600;">${Number(wo.total_weight_lbs).toLocaleString()} lbs</td></tr>`
      : "";

  const emailHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin: 0; padding: 0; background-color: #f4f4f4; font-family: 'Helvetica Neue', Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 30px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
          <tr>
            <td style="background-color: #264027; padding: 28px 40px;">
              <h1 style="margin: 0; font-size: 22px; color: #ffffff; font-weight: 700;">Soil Seed &amp; Water</h1>
              <p style="margin: 4px 0 0 0; font-size: 13px; color: #a8c5a0;">SSW Operations – Regenerative Soil Solutions</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 36px 40px 24px 40px;">
              <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6; color: #333;">A new work order has been created and may require your attention.</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 40px 30px 40px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8faf8; border: 1px solid #e0e8e0; border-radius: 8px; overflow: hidden;">
                <tr>
                  <td style="background-color: #264027; padding: 14px 20px;">
                    <span style="font-size: 16px; font-weight: 700; color: #ffffff;">${wo.wo_number}</span>
                    <span style="font-size: 12px; color: #a8c5a0; margin-left: 12px;">Work Order</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 20px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding: 6px 0; font-size: 13px; color: #666; width: 130px;">Created</td>
                        <td style="padding: 6px 0; font-size: 14px; color: #111; font-weight: 600;">${createdDate}</td>
                      </tr>
                      <tr>
                        <td style="padding: 6px 0; font-size: 13px; color: #666;">Product</td>
                        <td style="padding: 6px 0; font-size: 14px; color: #111;">${wo.product_name || "—"}</td>
                      </tr>
                      ${weightLine}
                      ${wo.created_by ? `<tr><td style="padding: 6px 0; font-size: 13px; color: #666;">Created by</td><td style="padding: 6px 0; font-size: 14px; color: #111;">${wo.created_by}</td></tr>` : ""}
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 40px 36px 40px; border-top: 1px solid #eee; padding-top: 24px;">
              <p style="margin: 0 0 2px 0; font-size: 14px; color: #333; font-weight: 600;">SSW Operations</p>
              <p style="margin: 0; font-size: 13px; color: #264027;">operations@soilseedandwater.com</p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8f8f8; padding: 16px 40px; text-align: center;">
              <p style="margin: 0; font-size: 11px; color: #999;">Soil Seed &amp; Water &bull; 1634 N 19th Ave, Phoenix, AZ 85009</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const subject = `New Work Order: ${wo.wo_number}`;
  const text = `A new work order has been created: ${wo.wo_number}\nCreated: ${createdDate}\nProduct: ${wo.product_name || "—"}\n${wo.total_weight_lbs ? `Total weight: ${Number(wo.total_weight_lbs).toLocaleString()} lbs\n` : ""}${wo.created_by ? `Created by: ${wo.created_by}\n` : ""}\n— SSW Operations (operations@soilseedandwater.com)`;

  for (const r of toEmail) {
    const to = (r.email || "").trim().toLowerCase();
    if (!to) continue;
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: workOrderFromEmail(),
          reply_to: SSW_EMAIL_REPLY_TO,
          to: [to],
          subject,
          html: emailHtml,
          text,
          attachments: attachmentBase64
            ? [
                {
                  filename: attachmentFilename,
                  content: attachmentBase64,
                },
              ]
            : undefined,
        }),
      });
      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        console.warn("[Work Order Notifications] Resend error for", to, errBody);
      } else {
        console.log("[Work Order Notifications] Sent new WO notification to", to);
      }
    } catch (e) {
      console.warn("[Work Order Notifications] Failed to send to", to, e);
    }
  }
}

// Apply auth middleware to all routes except PDF endpoint
router.use((req, res, next) => {
  if (req.path.includes("/pdf")) {
    return next();
  }
  return adminAuthMiddleware(req, res, next);
});

/**
 * Generate Work Order number (WO-YYYYMMDD-NNN)
 */
async function generateWONumber(): Promise<string> {
  const today = new Date();
  const dateStr = today.toISOString().split("T")[0].replace(/-/g, "");

  const { count, error } = await supabase
    .from("ops_work_orders")
    .select("id", { count: "exact", head: true })
    .gte("created_at", `${today.toISOString().split("T")[0]}T00:00:00`)
    .lte("created_at", `${today.toISOString().split("T")[0]}T23:59:59`);

  if (error) throw error;

  const sequence = ((count || 0) + 1).toString().padStart(3, "0");
  return `WO-${dateStr}-${sequence}`;
}

/**
 * GET /api/admin/operations/work-orders/products
 * Get products from cache (or Airtable)
 * NOTE: Must be defined BEFORE /:id route
 */
router.get("/products", async (req: AdminRequest, res) => {
  try {
    const products = await AirtableSyncService.getCachedProducts();
    res.json(products);
  } catch (error: any) {
    console.error("Error fetching products:", error);
    res.status(500).json({ message: error.message || "Failed to fetch products" });
  }
});

/**
 * GET /api/admin/operations/work-orders/size-categories
 * Get size categories from cache
 * NOTE: Must be defined BEFORE /:id route
 */
router.get("/size-categories", async (req: AdminRequest, res) => {
  try {
    const categories = await AirtableSyncService.getCachedSizeCategories();
    res.json(categories);
  } catch (error: any) {
    console.error("Error fetching size categories:", error);
    res.status(500).json({ message: error.message || "Failed to fetch size categories" });
  }
});

/**
 * POST /api/admin/operations/work-orders/sync-products
 * Force sync products from Airtable
 * NOTE: Must be defined BEFORE /:id route
 */
router.post("/sync-products", async (req: AdminRequest, res) => {
  try {
    const result = await AirtableSyncService.syncAll();
    res.json({
      success: true,
      products: result.products,
      sizeCategories: result.sizeCategories,
    });
  } catch (error: any) {
    console.error("Error syncing from Airtable:", error);
    res.status(500).json({ message: error.message || "Failed to sync from Airtable" });
  }
});

/**
 * POST /api/admin/operations/work-orders/calculate-mix
 * AI-generate mixing guidelines
 * NOTE: Must be defined BEFORE /:id route
 */
router.post("/calculate-mix", async (req: AdminRequest, res) => {
  try {
    const { productName, ingredientRatios, sizeCategory, sizeCategoryName, unitsPerPallet, estimatedPalletWeight, quantity, quantityType } = req.body;

    // Parse estimated pallet weight (remove commas and "lbs")
    const palletWeightLbs = estimatedPalletWeight ? parseFloat(estimatedPalletWeight.replace(/,/g, "").replace(/\s*lbs?/i, "")) : 0;

    // Calculate total weight
    let totalWeight = 0;
    let palletConfig = "";

    if (quantityType === "pallet" && palletWeightLbs > 0) {
      totalWeight = quantity * palletWeightLbs;
      palletConfig = `${quantity} pallet${quantity > 1 ? "s" : ""} x ${estimatedPalletWeight} = ${totalWeight.toLocaleString()} lbs`;
    } else if (quantityType === "unit" && unitsPerPallet > 0 && palletWeightLbs > 0) {
      const weightPerUnit = palletWeightLbs / unitsPerPallet;
      totalWeight = quantity * weightPerUnit;
      palletConfig = `${quantity} unit${quantity > 1 ? "s" : ""} @ ~${Math.round(weightPerUnit)} lbs each = ${Math.round(totalWeight).toLocaleString()} lbs`;
    }

    // Parse ingredient ratios and calculate breakdown
    let ingredientBreakdown = "";
    if (ingredientRatios && totalWeight > 0) {
      const ratioLines: string[] = [];

      // Try to parse percentage-based ratios like "60% Dan's Gold, 30% Worm Castings, 10% Perlite"
      // or "100% Worm Castings"
      const ratioMatch = ingredientRatios.match(/(\d+)%\s*([^,]+)/g);

      if (ratioMatch) {
        for (const match of ratioMatch) {
          const [, percent, ingredient] = match.match(/(\d+)%\s*(.+)/) || [];
          if (percent && ingredient) {
            const percentage = parseInt(percent);
            const weight = Math.round((percentage / 100) * totalWeight);
            ratioLines.push(`- ${ingredient.trim()}: ${percentage}% → ${weight.toLocaleString()} lbs`);
          }
        }
        ingredientBreakdown = ratioLines.join("\n");
      } else {
        ingredientBreakdown = `- ${ingredientRatios}: 100% → ${Math.round(totalWeight).toLocaleString()} lbs`;
      }
    }

    // Build mixing guidelines text
    const guidelines = `Pallet configuration: ${sizeCategoryName || sizeCategory}${unitsPerPallet ? `, ${unitsPerPallet} units per pallet` : ""}

${palletConfig ? `Total estimated final weight: ${palletConfig}` : ""}

${ingredientBreakdown ? `Ingredient breakdown:\n${ingredientBreakdown}` : ""}

Total anticipated product weight: ${Math.round(totalWeight).toLocaleString()} lbs`.trim();

    res.json({
      mixingGuidelines: guidelines,
      totalWeightLbs: Math.round(totalWeight),
    });
  } catch (error: any) {
    console.error("Error calculating mix:", error);
    res.status(500).json({ message: error.message || "Failed to calculate mixing guidelines" });
  }
});

/**
 * POST /api/admin/operations/work-orders/delete
 * Delete one or more work orders
 * NOTE: Must be defined BEFORE /:id route
 */
router.post("/delete", async (req: AdminRequest, res) => {
  try {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: "No IDs provided" });
    }

    const { error } = await supabase.from("ops_work_orders").delete().in("id", ids);

    if (error) throw error;

    res.json({ success: true, deleted: ids.length });
  } catch (error: any) {
    console.error("Error deleting work orders:", error);
    res.status(500).json({ message: error.message || "Failed to delete work orders" });
  }
});

/**
 * GET /api/admin/operations/work-orders
 * List all work orders with filters
 */
router.get("/", async (req: AdminRequest, res) => {
  try {
    const { status, dateFilter, search } = req.query;

    let query = supabase.from("ops_work_orders").select("*").order("created_at", { ascending: false });

    // Apply status filter
    if (status && status !== "all") {
      query = query.eq("status", status);
    }

    // Apply date filter
    if (dateFilter && dateFilter !== "all") {
      const now = new Date();
      let startDate = new Date();

      switch (dateFilter) {
        case "today":
          startDate.setHours(0, 0, 0, 0);
          break;
        case "week":
          startDate.setDate(now.getDate() - 7);
          break;
        case "month":
          startDate.setMonth(now.getMonth() - 1);
          break;
        case "3months":
          startDate.setMonth(now.getMonth() - 3);
          break;
      }

      query = query.gte("created_at", startDate.toISOString());
    }

    const { data, error } = await query;

    if (error) throw error;

    // Apply search filter client-side (Supabase doesn't support OR across multiple columns easily)
    let filteredData = data || [];
    if (search && typeof search === "string" && search.trim()) {
      const searchLower = search.toLowerCase().trim();
      filteredData = filteredData.filter(
        (wo) =>
          wo.wo_number?.toLowerCase().includes(searchLower) ||
          wo.product_name?.toLowerCase().includes(searchLower) ||
          wo.product_id?.toLowerCase().includes(searchLower),
      );
    }

    res.json(filteredData);
  } catch (error: any) {
    console.error("Error fetching work orders:", error);
    res.status(500).json({ message: error.message || "Failed to fetch work orders" });
  }
});

/**
 * POST /api/admin/operations/work-orders
 * Create a new work order. Accepts either:
 * - body.lines[] (array of { productType, productName, ..., sizeCategory, quantity, ... }) for multi-line orders, or
 * - legacy single product/size/quantity fields.
 */
router.post("/", async (req: AdminRequest, res) => {
  try {
    const createdBy = req.body.createdByName || req.admin?.email || "Operations Team";
    const creatorEmail = req.body.createdByEmail || req.admin?.email || "operations@soilseedandwater.com";
    const woNumber = await generateWONumber();

    const lines = req.body.lines;
    const hasLines = Array.isArray(lines) && lines.length > 0;

    if (hasLines) {
      // Multi-line: validate each line
      for (let i = 0; i < lines.length; i++) {
        const l = lines[i];
        if (!l.sizeCategory) return res.status(400).json({ message: `Line ${i + 1}: size category is required` });
        if (!l.quantity || l.quantity < 1) return res.status(400).json({ message: `Line ${i + 1}: quantity must be at least 1` });
      }

      const first = lines[0];
      const totalWeightLbs = lines.reduce((sum: number, l: any) => sum + (parseFloat(l.totalWeightLbs) || 0), 0);
      const productName = lines.length > 1 ? "Multiple products" : first.productName || first.customNotes || "Custom";
      const mixingGuidelines =
        lines.length === 1
          ? first.mixingGuidelines
          : lines
              .map(
                (l: any, i: number) =>
                  `Line ${i + 1}: ${l.productName || l.customNotes || "Custom"} — ${l.sizeCategoryName || l.sizeCategory}, ${l.quantity} ${l.quantityType}(s)${l.mixingGuidelines ? `\n${l.mixingGuidelines}` : ""}`,
              )
              .join("\n\n");

      const { data: wo, error: woError } = await supabase
        .from("ops_work_orders")
        .insert({
          wo_number: woNumber,
          product_type: first.productType || "standard",
          product_name: productName,
          product_id: lines.length === 1 ? first.productId : null,
          airtable_product_id: lines.length === 1 ? first.airtableProductId : null,
          size_category: first.sizeCategory,
          size_category_name: first.sizeCategoryName,
          units_per_pallet: first.unitsPerPallet,
          estimated_pallet_weight: first.estimatedPalletWeight,
          quantity: lines.reduce((s: number, l: any) => s + parseInt(l.quantity) || 0, 0),
          quantity_type: first.quantityType || "pallet",
          ingredient_ratios: lines.length === 1 ? first.ingredientRatios : null,
          ingredients_list: lines.length === 1 ? first.ingredientsList : null,
          mixing_guidelines: mixingGuidelines,
          total_weight_lbs: totalWeightLbs || null,
          custom_notes: lines.length === 1 ? first.customNotes : null,
          work_order_notes: req.body.workOrderNotes || null,
          needs_transportation: req.body.needsTransportation || false,
          destination_address: req.body.destinationAddress,
          destination_city: req.body.destinationCity,
          destination_state: req.body.destinationState,
          destination_zip: req.body.destinationZip,
          preferred_delivery_date: req.body.preferredDeliveryDate || null,
          preferred_delivery_time: req.body.preferredDeliveryTime,
          linked_bol_id: req.body.linkedBolId || null,
          status: "pending",
          priority: req.body.priority || "normal",
          order_type: req.body.orderType || "wholesale",
          created_by: createdBy,
          created_by_email: creatorEmail,
        })
        .select()
        .single();

      if (woError) throw woError;

      for (let i = 0; i < lines.length; i++) {
        const l = lines[i];
        const { error: lineError } = await supabase.from("ops_work_order_lines").insert({
          work_order_id: wo.id,
          product_type: l.productType || "standard",
          product_name: l.productName || l.customNotes || null,
          product_id: l.productId,
          airtable_product_id: l.airtableProductId,
          ingredient_ratios: l.ingredientRatios,
          ingredients_list: l.ingredientsList,
          size_category: l.sizeCategory,
          size_category_name: l.sizeCategoryName,
          units_per_pallet: l.unitsPerPallet,
          estimated_pallet_weight: l.estimatedPalletWeight,
          quantity: parseInt(l.quantity),
          quantity_type: l.quantityType || "pallet",
          mixing_guidelines: l.mixingGuidelines,
          total_weight_lbs: l.totalWeightLbs ? parseFloat(l.totalWeightLbs) : null,
          sort_order: i,
        });
        if (lineError) throw lineError;
      }

      await sendNewWorkOrderNotifications(wo);
      return res.status(201).json(wo);
    }

    // Legacy single-product payload
    const {
      productType,
      productName,
      productId,
      airtableProductId,
      sizeCategory,
      sizeCategoryName,
      unitsPerPallet,
      estimatedPalletWeight,
      quantity,
      quantityType,
      ingredientRatios,
      ingredientsList,
      mixingGuidelines,
      totalWeightLbs,
      customNotes,
      workOrderNotes,
      needsTransportation,
      destinationAddress,
      destinationCity,
      destinationState,
      destinationZip,
      preferredDeliveryDate,
      preferredDeliveryTime,
      linkedBolId,
      priority,
      orderType,
      createdByName,
      createdByEmail,
    } = req.body;

    if (!sizeCategory) return res.status(400).json({ message: "Size category is required" });
    if (!quantity || quantity < 1) return res.status(400).json({ message: "Quantity must be at least 1" });

    const { data, error } = await supabase
      .from("ops_work_orders")
      .insert({
        wo_number: woNumber,
        product_type: productType || "standard",
        product_name: productName,
        product_id: productId,
        airtable_product_id: airtableProductId,
        size_category: sizeCategory,
        size_category_name: sizeCategoryName,
        units_per_pallet: unitsPerPallet,
        estimated_pallet_weight: estimatedPalletWeight,
        quantity: parseInt(quantity),
        quantity_type: quantityType || "pallet",
        ingredient_ratios: ingredientRatios,
        ingredients_list: ingredientsList,
        mixing_guidelines: mixingGuidelines,
        total_weight_lbs: totalWeightLbs ? parseFloat(totalWeightLbs) : null,
        custom_notes: customNotes,
        work_order_notes: workOrderNotes || null,
        needs_transportation: needsTransportation || false,
        destination_address: destinationAddress,
        destination_city: destinationCity,
        destination_state: destinationState,
        destination_zip: destinationZip,
        preferred_delivery_date: preferredDeliveryDate || null,
        preferred_delivery_time: preferredDeliveryTime,
        linked_bol_id: linkedBolId || null,
        status: "pending",
        priority: priority || "normal",
        order_type: orderType || "wholesale",
        created_by: createdBy,
        created_by_email: creatorEmail,
      })
      .select()
      .single();

    if (error) throw error;

    // Backfill one line for legacy-created WO
    await supabase.from("ops_work_order_lines").insert({
      work_order_id: data.id,
      product_type: data.product_type,
      product_name: data.product_name,
      product_id: data.product_id,
      airtable_product_id: data.airtable_product_id,
      ingredient_ratios: data.ingredient_ratios,
      ingredients_list: data.ingredients_list,
      size_category: data.size_category,
      size_category_name: data.size_category_name,
      units_per_pallet: data.units_per_pallet,
      estimated_pallet_weight: data.estimated_pallet_weight,
      quantity: data.quantity,
      quantity_type: data.quantity_type,
      mixing_guidelines: data.mixing_guidelines,
      total_weight_lbs: data.total_weight_lbs,
      sort_order: 0,
    });

    await sendNewWorkOrderNotifications(data);
    res.status(201).json(data);
  } catch (error: any) {
    console.error("Error creating work order:", error);
    res.status(500).json({ message: error.message || "Failed to create work order" });
  }
});

/**
 * GET /api/admin/operations/work-orders/:id
 * Get a single work order by ID
 */
router.get("/:id", async (req: AdminRequest, res) => {
  try {
    const { id } = req.params;

    const { data: wo, error } = await supabase.from("ops_work_orders").select("*").eq("id", id).single();

    if (error) throw error;
    if (!wo) return res.status(404).json({ message: "Work order not found" });

    const { data: lines } = await supabase.from("ops_work_order_lines").select("*").eq("work_order_id", id).order("sort_order", { ascending: true });

    res.json({ ...wo, lines: lines || [] });
  } catch (error: any) {
    console.error("Error fetching work order:", error);
    res.status(500).json({ message: error.message || "Failed to fetch work order" });
  }
});

/**
 * PATCH /api/admin/operations/work-orders/:id
 * Update a work order
 */
router.patch("/:id", async (req: AdminRequest, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Convert camelCase to snake_case
    const snakeCaseUpdates: Record<string, any> = {};
    const fieldMap: Record<string, string> = {
      productType: "product_type",
      productName: "product_name",
      productId: "product_id",
      airtableProductId: "airtable_product_id",
      sizeCategory: "size_category",
      sizeCategoryName: "size_category_name",
      unitsPerPallet: "units_per_pallet",
      estimatedPalletWeight: "estimated_pallet_weight",
      quantityType: "quantity_type",
      ingredientRatios: "ingredient_ratios",
      ingredientsList: "ingredients_list",
      mixingGuidelines: "mixing_guidelines",
      totalWeightLbs: "total_weight_lbs",
      customNotes: "custom_notes",
      workOrderNotes: "work_order_notes",
      needsTransportation: "needs_transportation",
      destinationAddress: "destination_address",
      destinationCity: "destination_city",
      destinationState: "destination_state",
      destinationZip: "destination_zip",
      preferredDeliveryDate: "preferred_delivery_date",
      preferredDeliveryTime: "preferred_delivery_time",
      linkedBolId: "linked_bol_id",
    };

    for (const [key, value] of Object.entries(updates)) {
      const snakeKey = fieldMap[key] || key;
      snakeCaseUpdates[snakeKey] = value;
    }

    snakeCaseUpdates.updated_at = new Date().toISOString();

    const { data, error } = await supabase.from("ops_work_orders").update(snakeCaseUpdates).eq("id", id).select().single();

    if (error) throw error;

    if (!data) {
      return res.status(404).json({ message: "Work order not found" });
    }

    res.json(data);
  } catch (error: any) {
    console.error("Error updating work order:", error);
    res.status(500).json({ message: error.message || "Failed to update work order" });
  }
});

/**
 * GET /api/admin/operations/work-orders/:id/pdf
 * Generate and download Work Order PDF
 */
/**
 * GET /:id/pdf - Generate PDF for work order
 * Query params:
 *   - token: JWT auth token (required)
 *   - type: 'workorder' | 'label' | 'both' (default: 'workorder')
 */
router.get("/:id/pdf", async (req: AdminRequest, res) => {
  try {
    // Verify token from query param
    const token = req.query.token as string;
    if (!token) {
      return res.status(401).json({ error: "No token provided" });
    }

    const admin = await verifyAdminTokenValue(token);
    if (!admin) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }

    const { id } = req.params;
    const rawPdfType = (req.query.type as string) || "workorder";
    const pdfType: WorkOrderPdfType = rawPdfType === "label" || rawPdfType === "both" ? rawPdfType : "workorder";

    const { pdfBuffer, filename } = await generateWorkOrderPdfById(id, pdfType);

    // Send PDF
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    res.end(pdfBuffer);
  } catch (error: any) {
    console.error("Error generating PDF:", error);
    res.status(500).json({ message: error.message || "Failed to generate PDF" });
  }
});

/**
 * Generate HTML for Work Order PDF
 */
function generateWorkOrderPDFHTML(wo: any): string {
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  };

  const today = formatDate(new Date().toISOString());
  const createdDate = wo.created_at ? formatDate(wo.created_at) : today;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${wo.wo_number} - Production Guide</title>
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600;700&family=Montserrat:wght@400;500;600;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    @page {
      size: letter;
      margin: 0;
    }
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: 'Inter', sans-serif;
      font-size: 11pt;
      line-height: 1.5;
      color: #1a1a1a;
    }

    /* Page 1: Production Guide */
    .page {
      width: 8.5in;
      min-height: 11in;
      padding: 0.5in;
      page-break-after: always;
      position: relative;
    }
    .page:last-child {
      page-break-after: auto;
    }

    /* Header */
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 24px;
      padding-bottom: 16px;
      border-bottom: 3px solid #264027;
    }
    .logo-section {
      flex: 1;
    }
    .company-name {
      font-family: 'Cormorant Garamond', serif;
      font-size: 26pt;
      font-weight: 600;
      color: #264027;
      margin-bottom: 4px;
    }
    .tagline {
      font-family: 'Montserrat', sans-serif;
      font-size: 10pt;
      font-weight: 500;
      color: #6f732f;
      letter-spacing: 1px;
      text-transform: uppercase;
    }
    .doc-info {
      text-align: right;
    }
    .wo-number {
      font-family: 'Montserrat', sans-serif;
      font-size: 28pt;
      font-weight: 700;
      color: #264027;
      letter-spacing: -1px;
    }
    .doc-date {
      font-size: 11pt;
      color: #666;
      margin-top: 4px;
    }

    /* Section styling */
    .section {
      margin-bottom: 20px;
    }
    .section-title {
      font-family: 'Montserrat', sans-serif;
      font-size: 12pt;
      font-weight: 600;
      color: #264027;
      background: linear-gradient(135deg, #f8faf8 0%, #f0f4f0 100%);
      padding: 8px 12px;
      border-left: 4px solid #264027;
      margin-bottom: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    /* Product info */
    .product-header {
      display: flex;
      gap: 24px;
      margin-bottom: 20px;
    }
    .product-image {
      width: 180px;
      height: 180px;
      background: #f5f5f5;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 1px solid #e0e0e0;
    }
    .product-image img {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
    }
    .product-details {
      flex: 1;
    }
    .product-name {
      font-family: 'Cormorant Garamond', serif;
      font-size: 22pt;
      font-weight: 600;
      color: #1a1a1a;
      margin-bottom: 12px;
    }
    .info-grid {
      display: grid;
      grid-template-columns: 140px 1fr;
      gap: 6px 16px;
    }
    .info-label {
      font-weight: 600;
      color: #555;
      font-size: 10pt;
    }
    .info-value {
      color: #1a1a1a;
      font-size: 10pt;
    }

    /* Size & Quantity box */
    .highlight-box {
      background: linear-gradient(135deg, #e8f5e9 0%, #dcedc8 100%);
      border: 2px solid #264027;
      border-radius: 8px;
      padding: 16px 20px;
      margin: 16px 0;
    }
    .highlight-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 0;
    }
    .highlight-row + .highlight-row {
      border-top: 1px solid rgba(38, 64, 39, 0.2);
    }
    .highlight-label {
      font-family: 'Montserrat', sans-serif;
      font-weight: 600;
      color: #264027;
      font-size: 11pt;
    }
    .highlight-value {
      font-family: 'Montserrat', sans-serif;
      font-weight: 700;
      font-size: 14pt;
      color: #264027;
    }
    .size-layout {
      display: flex;
      gap: 14px;
      align-items: stretch;
    }
    .size-photo {
      width: 190px;
      min-width: 190px;
      border: 1px solid #d7dfd7;
      border-radius: 8px;
      background: #f8faf8;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 8px;
    }
    .size-photo img {
      max-width: 100%;
      max-height: 170px;
      object-fit: contain;
    }
    .line-visual-grid {
      margin-top: 14px;
      display: grid;
      gap: 10px;
    }
    .line-visual-card {
      border: 1px solid #d8e2d8;
      border-radius: 8px;
      padding: 10px;
      background: #fbfdfb;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .line-visual-header {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 10px;
      margin-bottom: 8px;
    }
    .line-visual-tile {
      border: 1px solid #d7dfd7;
      border-radius: 6px;
      min-height: 84px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #f8faf8;
      font-size: 10pt;
      text-align: center;
      padding: 6px;
    }
    .line-visual-tile img {
      max-width: 100%;
      max-height: 80px;
      object-fit: contain;
    }
    .line-visual-title {
      font-size: 9pt;
      font-weight: 700;
      color: #264027;
      text-transform: uppercase;
      margin-bottom: 4px;
      letter-spacing: 0.4px;
    }
    .line-visual-meta {
      display: grid;
      grid-template-columns: 140px 1fr;
      gap: 4px 10px;
      font-size: 9.5pt;
    }

    /* Mixing guidelines */
    .mixing-box {
      background: #fafafa;
      border: 1px solid #ddd;
      border-radius: 8px;
      padding: 16px;
    }
    .mixing-content {
      white-space: pre-wrap;
      font-family: 'Inter', sans-serif;
      font-size: 11pt;
      line-height: 1.6;
    }

    /* Notes section */
    .notes-box {
      background: #fff9e6;
      border: 1px solid #f0e0a0;
      border-radius: 8px;
      padding: 12px 16px;
    }

    /* Status badge */
    .status-badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 10pt;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .status-pending { background: #fff3cd; color: #856404; }
    .status-scheduled { background: #cce5ff; color: #004085; }
    .status-in_progress { background: #d4edda; color: #155724; }
    .status-completed { background: #264027; color: white; }

    /* Footer */
    .footer {
      margin-top: 16px;
      padding-top: 12px;
      border-top: 1px solid #ddd;
      font-size: 8pt;
      color: #999;
      text-align: center;
    }

    /* Page 2: Pallet Label */
    .label-page {
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      padding: 1in;
    }
    .pallet-label {
      width: 100%;
      border: 4px solid #264027;
      border-radius: 12px;
      padding: 40px;
      text-align: center;
    }
    .label-company {
      font-family: 'Cormorant Garamond', serif;
      font-size: 20pt;
      color: #264027;
      margin-bottom: 8px;
    }
    .label-wo {
      font-family: 'Montserrat', sans-serif;
      font-size: 48pt;
      font-weight: 700;
      color: #264027;
      margin: 16px 0;
      letter-spacing: -2px;
    }
    .label-product {
      font-family: 'Cormorant Garamond', serif;
      font-size: 28pt;
      font-weight: 600;
      color: #1a1a1a;
      margin: 24px 0;
    }
    .label-info {
      font-size: 16pt;
      margin: 12px 0;
    }
    .label-date {
      font-size: 14pt;
      color: #666;
      margin-top: 24px;
    }
    .label-pallet-number {
      font-family: 'Montserrat', sans-serif;
      font-size: 24pt;
      font-weight: 600;
      color: #264027;
      margin-top: 20px;
    }
    .label-footer {
      margin-top: 32px;
      padding-top: 16px;
      border-top: 2px solid #264027;
      font-size: 10pt;
      color: #666;
    }
  </style>
</head>
<body>
  <!-- Page 1: Production Guide -->
  <div class="page">
    <div class="header">
      <div class="logo-section">
        <div class="company-name">Soil Seed & Water</div>
        <div class="tagline">Regenerative Soil Solutions</div>
      </div>
      <div class="doc-info">
        <div class="wo-number">${wo.wo_number}</div>
        <div class="doc-date">${createdDate}</div>
        <div style="margin-top: 8px;">
          <span class="status-badge status-${wo.status}">${wo.status.replace("_", " ")}</span>
        </div>
      </div>
    </div>

    ${
      (wo as any).lines?.length > 0
        ? `
    <div class="section">
      <div class="section-title">Line Items</div>
      <table style="width: 100%; border-collapse: collapse; font-size: 10pt;">
        <thead>
          <tr style="border-bottom: 2px solid #264027; text-align: left;">
            <th style="padding: 8px;">Product</th>
            <th style="padding: 8px;">Size</th>
            <th style="padding: 8px;">Quantity</th>
            <th style="padding: 8px;">Weight</th>
          </tr>
        </thead>
        <tbody>
          ${(wo as any).lines
            .map(
              (l: any, i: number) => `
          <tr style="border-bottom: 1px solid #e0e0e0;">
            <td style="padding: 8px;">${l.product_name || "Custom"}</td>
            <td style="padding: 8px;">${l.size_category_name || l.size_category}</td>
            <td style="padding: 8px;">${l.quantity} ${l.quantity_type === "pallet" ? "Pallet" : "Unit"}${l.quantity > 1 ? "s" : ""}</td>
            <td style="padding: 8px;">${l.total_weight_lbs ? l.total_weight_lbs.toLocaleString() + " lbs" : "—"}</td>
          </tr>
          `,
            )
            .join("")}
        </tbody>
      </table>
      ${wo.total_weight_lbs ? `<p style="margin-top: 8px; font-weight: 600; color: #264027;">Total estimated weight: ${Number(wo.total_weight_lbs).toLocaleString()} lbs</p>` : ""}
      <div class="line-visual-grid">
        ${(wo as any).lines
          .map(
            (l: any, i: number) => `
        <div class="line-visual-card">
          <div class="line-visual-header">
            <div class="line-visual-tile" style="display:block;">
              <div class="line-visual-title">Work Order</div>
              <div style="font-family: 'Montserrat', sans-serif; font-size: 11pt; font-weight: 700; color: #264027;">${wo.wo_number}</div>
              <div style="font-size: 9pt; color: #666; margin-top: 4px;">Line ${i + 1}</div>
            </div>
            <div class="line-visual-tile" style="display:block;">
              <div class="line-visual-title">Product Illustration</div>
              ${
                l.product_illustration_base64
                  ? `<img src="${l.product_illustration_base64}" alt="${l.product_name || "Product"}" />`
                  : `<span style="color:#999; font-size:9pt;">No Product Image</span>`
              }
            </div>
            <div class="line-visual-tile" style="display:block;">
              <div class="line-visual-title">Size Category Photo</div>
              ${
                l.size_category_illustration_base64
                  ? `<img src="${l.size_category_illustration_base64}" alt="${l.size_category_name || l.size_category || "Size Category"}" />`
                  : `<span style="color:#999; font-size:9pt;">No Size Image</span>`
              }
            </div>
          </div>
          <div class="line-visual-meta">
            <span class="info-label">Product:</span><span class="info-value">${l.product_name || "Custom"}</span>
            <span class="info-label">Size:</span><span class="info-value">${l.size_category_name || l.size_category || "—"}</span>
            <span class="info-label">Quantity:</span><span class="info-value">${l.quantity} ${l.quantity_type === "pallet" ? "Pallet" : "Unit"}${l.quantity > 1 ? "s" : ""}</span>
            <span class="info-label">Estimated Weight:</span><span class="info-value">${l.total_weight_lbs ? `${Number(l.total_weight_lbs).toLocaleString()} lbs` : "—"}</span>
          </div>
        </div>
        `,
          )
          .join("")}
      </div>
    </div>
    <div class="section">
      <div class="section-title">Work Order Details</div>
      <div class="info-grid" style="padding: 0 8px;">
        <span class="info-label">Work Order:</span>
        <span class="info-value">${wo.wo_number}</span>
        <span class="info-label">Order Type:</span>
        <span class="info-value" style="text-transform: capitalize;">${(wo.order_type || "wholesale").replace("_", " ")}</span>
        <span class="info-label">Created:</span>
        <span class="info-value">${createdDate}</span>
        <span class="info-label">Priority:</span>
        <span class="info-value" style="text-transform: capitalize;">${wo.priority || "Normal"}</span>
        ${wo.created_by ? `<span class="info-label">Created By:</span><span class="info-value">${wo.created_by}${wo.created_by_email ? ` (${wo.created_by_email})` : ""}</span>` : ""}
      </div>
    </div>
    `
        : `
    <div class="section">
      <div class="section-title">Product Information</div>
      <div class="product-header">
        <div class="product-image">
          ${
            wo.illustration_base64
              ? `<img src="${wo.illustration_base64}" alt="${wo.product_name}" style="max-width: 100%; max-height: 100%; object-fit: contain;" />`
              : `<span style="color: #999; font-size: 10pt;">No Image</span>`
          }
        </div>
        <div class="product-details">
          <div class="product-name">${wo.product_name || "Custom Product"}</div>
          <div class="info-grid">
            ${wo.product_id ? `<span class="info-label">Product ID:</span><span class="info-value">${wo.product_id}</span>` : ""}
            <span class="info-label">Work Order:</span>
            <span class="info-value">${wo.wo_number}</span>
            <span class="info-label">Order Type:</span>
            <span class="info-value" style="text-transform: capitalize;">${(wo.order_type || "wholesale").replace("_", " ")}</span>
            <span class="info-label">Created:</span>
            <span class="info-value">${createdDate}</span>
            <span class="info-label">Priority:</span>
            <span class="info-value" style="text-transform: capitalize;">${wo.priority || "Normal"}</span>
            ${wo.created_by ? `<span class="info-label">Created By:</span><span class="info-value">${wo.created_by}${wo.created_by_email ? ` (${wo.created_by_email})` : ""}</span>` : ""}
          </div>
        </div>
      </div>
    </div>
    <div class="section">
      <div class="section-title">Size & Quantity</div>
      <div class="size-layout">
        ${
          wo.size_category_illustration_base64
            ? `<div class="size-photo"><img src="${wo.size_category_illustration_base64}" alt="${wo.size_category_name || wo.size_category}" /></div>`
            : ""
        }
        <div class="highlight-box" style="flex: 1;">
          <div class="highlight-row">
            <span class="highlight-label">Size Category</span>
            <span class="highlight-value">${wo.size_category_name || wo.size_category}</span>
          </div>
          <div class="highlight-row">
            <span class="highlight-label">Quantity</span>
            <span class="highlight-value">${wo.quantity} ${wo.quantity_type === "pallet" ? "Pallet" : "Unit"}${wo.quantity > 1 ? "s" : ""}</span>
          </div>
          ${wo.units_per_pallet ? `<div class="highlight-row"><span class="highlight-label">Units per Pallet</span><span class="highlight-value">${wo.units_per_pallet}</span></div>` : ""}
          ${wo.total_weight_lbs ? `<div class="highlight-row"><span class="highlight-label">Total Estimated Weight</span><span class="highlight-value">${wo.total_weight_lbs.toLocaleString()} lbs</span></div>` : ""}
        </div>
      </div>
    </div>
    `
    }

    ${
      wo.ingredient_ratios || wo.ingredients_list
        ? `
    <div class="section">
      <div class="section-title">Ingredients</div>
      <div class="info-grid" style="padding: 0 8px;">
        ${
          wo.ingredient_ratios
            ? `
        <span class="info-label">Ingredient Ratios:</span>
        <span class="info-value">${wo.ingredient_ratios}</span>
        `
            : ""
        }
        ${
          wo.ingredients_list
            ? `
        <span class="info-label">Ingredients:</span>
        <span class="info-value">${wo.ingredients_list}</span>
        `
            : ""
        }
      </div>
    </div>
    `
        : ""
    }

    ${
      wo.mixing_guidelines
        ? `
    <div class="section">
      <div class="section-title">Mixing Guidelines</div>
      <div class="mixing-box">
        <div class="mixing-content">${wo.mixing_guidelines}</div>
      </div>
    </div>
    `
        : ""
    }

    ${
      wo.work_order_notes || wo.custom_notes
        ? `
    <div class="section">
      <div class="section-title">Notes</div>
      <div class="notes-box">
        ${wo.work_order_notes || ""}
        ${wo.work_order_notes && wo.custom_notes ? "<br><br>" : ""}
        ${wo.custom_notes || ""}
      </div>
    </div>
    `
        : ""
    }

    ${
      wo.needs_transportation
        ? `
    <div class="section">
      <div class="section-title">Delivery Information</div>
      <div class="info-grid" style="padding: 0 8px;">
        <span class="info-label">Destination:</span>
        <span class="info-value">${wo.destination_address || ""}${wo.destination_city ? `, ${wo.destination_city}` : ""}${wo.destination_state ? `, ${wo.destination_state}` : ""} ${wo.destination_zip || ""}</span>
        ${
          wo.preferred_delivery_date
            ? `
        <span class="info-label">Preferred Date:</span>
        <span class="info-value">${formatDate(wo.preferred_delivery_date)}</span>
        `
            : ""
        }
        ${
          wo.preferred_delivery_time
            ? `
        <span class="info-label">Preferred Time:</span>
        <span class="info-value">${wo.preferred_delivery_time}</span>
        `
            : ""
        }
      </div>
    </div>
    `
        : ""
    }

    <div class="footer">
      Soil Seed & Water | 18980 Stanton Rd, Congress, AZ 85332 | (928) 632-7125 | info@soilseedandwater.com
    </div>
  </div>
</body>
</html>
  `;
}

/**
 * Generate HTML for Pallet Label PDF (single page)
 */
function generatePalletLabelHTML(wo: any): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${wo.wo_number} - Pallet Label</title>
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600;700&family=Montserrat:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    @page {
      size: letter;
      margin: 0;
    }
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: 'Montserrat', sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 11in;
      width: 8.5in;
      padding: 1in;
    }
    .pallet-label {
      width: 100%;
      border: 4px solid #264027;
      border-radius: 12px;
      padding: 40px;
      text-align: center;
    }
    .label-company {
      font-family: 'Cormorant Garamond', serif;
      font-size: 24pt;
      color: #264027;
      margin-bottom: 8px;
    }
    .label-wo {
      font-family: 'Montserrat', sans-serif;
      font-size: 56pt;
      font-weight: 700;
      color: #264027;
      margin: 20px 0;
      letter-spacing: -2px;
    }
    .label-product {
      font-family: 'Cormorant Garamond', serif;
      font-size: 32pt;
      font-weight: 600;
      color: #1a1a1a;
      margin: 24px 0;
    }
    .label-info {
      font-size: 18pt;
      margin: 12px 0;
    }
    .label-size-image {
      max-width: 210px;
      max-height: 150px;
      object-fit: contain;
      border: 1px solid #d9e2d9;
      border-radius: 8px;
      background: #f8faf8;
      padding: 6px;
      margin: 16px auto 8px auto;
      display: block;
    }
    .label-date {
      font-size: 16pt;
      color: #666;
      margin-top: 28px;
    }
    .label-pallet-number {
      font-family: 'Montserrat', sans-serif;
      font-size: 28pt;
      font-weight: 600;
      color: #264027;
      margin-top: 24px;
    }
    .label-footer {
      margin-top: 36px;
      padding-top: 16px;
      border-top: 2px solid #264027;
      font-size: 11pt;
      color: #666;
    }
  </style>
</head>
<body>
  <div class="pallet-label">
    <div class="label-company">Soil Seed & Water</div>
    <div class="label-wo">${wo.wo_number}</div>
    <div class="label-product">${wo.product_name || "Custom Product"}</div>
    ${wo.size_category_illustration_base64 ? `<img src="${wo.size_category_illustration_base64}" alt="${wo.size_category_name || wo.size_category}" class="label-size-image" />` : ""}
    <div class="label-info">
      <strong>${wo.size_category_name || wo.size_category}</strong>
    </div>
    ${
      wo.units_per_pallet
        ? `
    <div class="label-info">
      ${wo.units_per_pallet} units per pallet
    </div>
    `
        : ""
    }
    <div class="label-date">
      Date Produced: _______________
    </div>
    <div class="label-pallet-number">
      Pallet ___ of ${wo.quantity}
    </div>
    <div class="label-footer">
      SSW BioSoils | Regenerative Soil Solutions | OMRI Listed
    </div>
  </div>
</body>
</html>
  `;
}

/**
 * Generate HTML for Combined PDF (Work Order + Pallet Label)
 */
function generateCombinedPDFHTML(wo: any): string {
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  };

  const today = formatDate(new Date().toISOString());
  const createdDate = wo.created_at ? formatDate(wo.created_at) : today;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${wo.wo_number} - Complete</title>
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600;700&family=Montserrat:wght@400;500;600;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    @page {
      size: letter;
      margin: 0;
    }
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: 'Inter', sans-serif;
      font-size: 11pt;
      line-height: 1.5;
      color: #1a1a1a;
    }
    .page {
      width: 8.5in;
      min-height: 11in;
      padding: 0.5in;
      page-break-after: always;
      position: relative;
    }
    .page:last-child {
      page-break-after: auto;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 24px;
      padding-bottom: 16px;
      border-bottom: 3px solid #264027;
    }
    .logo-section { flex: 1; }
    .company-name {
      font-family: 'Cormorant Garamond', serif;
      font-size: 26pt;
      font-weight: 600;
      color: #264027;
      margin-bottom: 4px;
    }
    .tagline {
      font-family: 'Montserrat', sans-serif;
      font-size: 9pt;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #666;
    }
    .doc-info { text-align: right; }
    .wo-number {
      font-family: 'Montserrat', sans-serif;
      font-size: 18pt;
      font-weight: 700;
      color: #264027;
    }
    .doc-date { font-size: 10pt; color: #666; }
    .status-badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 9pt;
      font-weight: 600;
      text-transform: uppercase;
    }
    .status-pending { background: #FEF3C7; color: #92400E; }
    .status-in_progress { background: #DBEAFE; color: #1E40AF; }
    .status-completed { background: #D1FAE5; color: #065F46; }
    .section { margin-bottom: 20px; }
    .section-title {
      font-family: 'Montserrat', sans-serif;
      font-size: 11pt;
      font-weight: 600;
      color: #264027;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 10px;
      padding-bottom: 4px;
      border-bottom: 1px solid #e5e5e5;
    }
    .product-header {
      display: flex;
      gap: 20px;
      align-items: flex-start;
    }
    .product-image {
      width: 120px;
      height: 120px;
      border: 1px solid #e5e5e5;
      border-radius: 8px;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #fafafa;
    }
    .product-image img {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
    }
    .product-details { flex: 1; }
    .product-name {
      font-family: 'Cormorant Garamond', serif;
      font-size: 22pt;
      font-weight: 600;
      color: #1a1a1a;
      margin-bottom: 8px;
    }
    .info-grid {
      display: grid;
      grid-template-columns: 120px 1fr;
      gap: 4px 12px;
      font-size: 10pt;
    }
    .info-label { color: #666; font-weight: 500; }
    .info-value { color: #1a1a1a; }
    .highlight-box {
      background: #f8fdf8;
      border: 1px solid #264027;
      border-radius: 8px;
      padding: 16px;
    }
    .size-layout {
      display: flex;
      gap: 14px;
      align-items: stretch;
    }
    .size-photo {
      width: 170px;
      min-width: 170px;
      border: 1px solid #d7dfd7;
      border-radius: 8px;
      background: #f8faf8;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 8px;
    }
    .size-photo img {
      max-width: 100%;
      max-height: 145px;
      object-fit: contain;
    }
    .line-visual-grid {
      margin-top: 14px;
      display: grid;
      gap: 10px;
    }
    .line-visual-card {
      border: 1px solid #d8e2d8;
      border-radius: 8px;
      padding: 10px;
      background: #fbfdfb;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .line-visual-header {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 10px;
      margin-bottom: 8px;
    }
    .line-visual-tile {
      border: 1px solid #d7dfd7;
      border-radius: 6px;
      min-height: 84px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #f8faf8;
      font-size: 10pt;
      text-align: center;
      padding: 6px;
    }
    .line-visual-tile img {
      max-width: 100%;
      max-height: 80px;
      object-fit: contain;
    }
    .line-visual-title {
      font-size: 9pt;
      font-weight: 700;
      color: #264027;
      text-transform: uppercase;
      margin-bottom: 4px;
      letter-spacing: 0.4px;
    }
    .line-visual-meta {
      display: grid;
      grid-template-columns: 120px 1fr;
      gap: 4px 10px;
      font-size: 9.5pt;
    }
    .highlight-row {
      display: flex;
      justify-content: space-between;
      padding: 6px 0;
      border-bottom: 1px solid #e8f0e8;
    }
    .highlight-row:last-child { border-bottom: none; }
    .highlight-label { font-weight: 500; color: #264027; }
    .highlight-value { font-weight: 600; color: #1a1a1a; }
    .notes-box {
      background: #fffef0;
      border: 1px solid #e5e0a0;
      border-radius: 6px;
      padding: 12px;
      font-size: 10pt;
    }
    .footer {
      margin-top: 16px;
      font-size: 8pt;
      color: #999;
      text-align: center;
      border-top: 1px solid #ddd;
      padding-top: 8px;
    }
    /* Page 2: Pallet Label */
    .label-page {
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      padding: 1in;
    }
    .pallet-label {
      width: 100%;
      border: 4px solid #264027;
      border-radius: 12px;
      padding: 40px;
      text-align: center;
    }
    .label-company {
      font-family: 'Cormorant Garamond', serif;
      font-size: 24pt;
      color: #264027;
      margin-bottom: 8px;
    }
    .label-wo {
      font-family: 'Montserrat', sans-serif;
      font-size: 56pt;
      font-weight: 700;
      color: #264027;
      margin: 20px 0;
      letter-spacing: -2px;
    }
    .label-product {
      font-family: 'Cormorant Garamond', serif;
      font-size: 32pt;
      font-weight: 600;
      color: #1a1a1a;
      margin: 24px 0;
    }
    .label-info { font-size: 18pt; margin: 12px 0; }
    .label-date { font-size: 16pt; color: #666; margin-top: 28px; }
    .label-pallet-number {
      font-family: 'Montserrat', sans-serif;
      font-size: 28pt;
      font-weight: 600;
      color: #264027;
      margin-top: 24px;
    }
    .label-footer {
      margin-top: 36px;
      padding-top: 16px;
      border-top: 2px solid #264027;
      font-size: 11pt;
      color: #666;
    }
    .label-size-image {
      max-width: 210px;
      max-height: 150px;
      object-fit: contain;
      border: 1px solid #d9e2d9;
      border-radius: 8px;
      background: #f8faf8;
      padding: 6px;
      margin: 16px auto 8px auto;
      display: block;
    }
  </style>
</head>
<body>
  <!-- Page 1: Work Order -->
  <div class="page">
    <div class="header">
      <div class="logo-section">
        <div class="company-name">Soil Seed & Water</div>
        <div class="tagline">Regenerative Soil Solutions</div>
      </div>
      <div class="doc-info">
        <div class="wo-number">${wo.wo_number}</div>
        <div class="doc-date">${createdDate}</div>
        <div style="margin-top: 8px;">
          <span class="status-badge status-${wo.status}">${wo.status.replace("_", " ")}</span>
        </div>
      </div>
    </div>
    ${
      (wo as any).lines?.length > 0
        ? `
    <div class="section">
      <div class="section-title">Line Items</div>
      <table style="width: 100%; border-collapse: collapse; font-size: 10pt;">
        <thead>
          <tr style="border-bottom: 2px solid #264027; text-align: left;">
            <th style="padding: 8px;">Product</th>
            <th style="padding: 8px;">Size</th>
            <th style="padding: 8px;">Quantity</th>
            <th style="padding: 8px;">Weight</th>
          </tr>
        </thead>
        <tbody>
          ${(wo as any).lines
            .map(
              (l: any) => `
          <tr style="border-bottom: 1px solid #e0e0e0;">
            <td style="padding: 8px;">${l.product_name || "Custom"}</td>
            <td style="padding: 8px;">${l.size_category_name || l.size_category}</td>
            <td style="padding: 8px;">${l.quantity} ${l.quantity_type === "pallet" ? "Pallet" : "Unit"}${l.quantity > 1 ? "s" : ""}</td>
            <td style="padding: 8px;">${l.total_weight_lbs ? l.total_weight_lbs.toLocaleString() + " lbs" : "—"}</td>
          </tr>
          `,
            )
            .join("")}
        </tbody>
      </table>
      ${wo.total_weight_lbs ? `<p style="margin-top: 8px; font-weight: 600; color: #264027;">Total estimated weight: ${Number(wo.total_weight_lbs).toLocaleString()} lbs</p>` : ""}
      <div class="line-visual-grid">
        ${(wo as any).lines
          .map(
            (l: any, i: number) => `
        <div class="line-visual-card">
          <div class="line-visual-header">
            <div class="line-visual-tile" style="display:block;">
              <div class="line-visual-title">Work Order</div>
              <div style="font-family: 'Montserrat', sans-serif; font-size: 11pt; font-weight: 700; color: #264027;">${wo.wo_number}</div>
              <div style="font-size: 9pt; color: #666; margin-top: 4px;">Line ${i + 1}</div>
            </div>
            <div class="line-visual-tile" style="display:block;">
              <div class="line-visual-title">Product Illustration</div>
              ${
                l.product_illustration_base64
                  ? `<img src="${l.product_illustration_base64}" alt="${l.product_name || "Product"}" />`
                  : `<span style="color:#999; font-size:9pt;">No Product Image</span>`
              }
            </div>
            <div class="line-visual-tile" style="display:block;">
              <div class="line-visual-title">Size Category Photo</div>
              ${
                l.size_category_illustration_base64
                  ? `<img src="${l.size_category_illustration_base64}" alt="${l.size_category_name || l.size_category || "Size Category"}" />`
                  : `<span style="color:#999; font-size:9pt;">No Size Image</span>`
              }
            </div>
          </div>
          <div class="line-visual-meta">
            <span class="info-label">Product:</span><span class="info-value">${l.product_name || "Custom"}</span>
            <span class="info-label">Size:</span><span class="info-value">${l.size_category_name || l.size_category || "—"}</span>
            <span class="info-label">Quantity:</span><span class="info-value">${l.quantity} ${l.quantity_type === "pallet" ? "Pallet" : "Unit"}${l.quantity > 1 ? "s" : ""}</span>
            <span class="info-label">Estimated Weight:</span><span class="info-value">${l.total_weight_lbs ? `${Number(l.total_weight_lbs).toLocaleString()} lbs` : "—"}</span>
          </div>
        </div>
        `,
          )
          .join("")}
      </div>
    </div>
    <div class="section">
      <div class="section-title">Work Order Details</div>
      <div class="info-grid">
        <span class="info-label">Work Order:</span><span class="info-value">${wo.wo_number}</span>
        <span class="info-label">Order Type:</span><span class="info-value" style="text-transform: capitalize;">${(wo.order_type || "wholesale").replace("_", " ")}</span>
        <span class="info-label">Created:</span><span class="info-value">${createdDate}</span>
        <span class="info-label">Priority:</span><span class="info-value" style="text-transform: capitalize;">${wo.priority || "Normal"}</span>
        ${wo.created_by ? `<span class="info-label">Created By:</span><span class="info-value">${wo.created_by}${wo.created_by_email ? ` (${wo.created_by_email})` : ""}</span>` : ""}
      </div>
    </div>
    `
        : `
    <div class="section">
      <div class="section-title">Product Information</div>
      <div class="product-header">
        <div class="product-image">
          ${
            wo.illustration_base64
              ? `<img src="${wo.illustration_base64}" alt="${wo.product_name}" />`
              : `<span style="color: #999; font-size: 10pt;">No Image</span>`
          }
        </div>
        <div class="product-details">
          <div class="product-name">${wo.product_name || "Custom Product"}</div>
          <div class="info-grid">
            ${wo.product_id ? `<span class="info-label">Product ID:</span><span class="info-value">${wo.product_id}</span>` : ""}
            <span class="info-label">Work Order:</span><span class="info-value">${wo.wo_number}</span>
            <span class="info-label">Order Type:</span><span class="info-value" style="text-transform: capitalize;">${(wo.order_type || "wholesale").replace("_", " ")}</span>
            <span class="info-label">Priority:</span><span class="info-value" style="text-transform: capitalize;">${wo.priority || "Normal"}</span>
            ${wo.created_by ? `<span class="info-label">Created By:</span><span class="info-value">${wo.created_by}${wo.created_by_email ? ` (${wo.created_by_email})` : ""}</span>` : ""}
          </div>
        </div>
      </div>
    </div>
    <div class="section">
      <div class="section-title">Size & Quantity</div>
      <div class="size-layout">
        ${
          wo.size_category_illustration_base64
            ? `<div class="size-photo"><img src="${wo.size_category_illustration_base64}" alt="${wo.size_category_name || wo.size_category}" /></div>`
            : ""
        }
        <div class="highlight-box" style="flex: 1;">
          <div class="highlight-row">
            <span class="highlight-label">Size Category</span>
            <span class="highlight-value">${wo.size_category_name || wo.size_category}</span>
          </div>
          <div class="highlight-row">
            <span class="highlight-label">Quantity</span>
            <span class="highlight-value">${wo.quantity} ${wo.quantity_type === "pallet" ? "Pallet" : "Unit"}${wo.quantity > 1 ? "s" : ""}</span>
          </div>
          ${wo.units_per_pallet ? `<div class="highlight-row"><span class="highlight-label">Units per Pallet</span><span class="highlight-value">${wo.units_per_pallet}</span></div>` : ""}
          ${wo.total_weight_lbs ? `<div class="highlight-row"><span class="highlight-label">Total Estimated Weight</span><span class="highlight-value">${wo.total_weight_lbs.toLocaleString()} lbs</span></div>` : ""}
        </div>
      </div>
    </div>
    `
    }
    ${
      wo.ingredient_ratios || wo.ingredients_list
        ? `
    <div class="section">
      <div class="section-title">Ingredients</div>
      <div class="info-grid" style="padding: 0 8px;">
        ${wo.ingredient_ratios ? `<span class="info-label">Ratios:</span><span class="info-value">${wo.ingredient_ratios}</span>` : ""}
        ${wo.ingredients_list ? `<span class="info-label">Ingredients:</span><span class="info-value">${wo.ingredients_list}</span>` : ""}
      </div>
    </div>
    `
        : ""
    }
    ${
      wo.work_order_notes || wo.custom_notes
        ? `
    <div class="section">
      <div class="section-title">Notes</div>
      <div class="notes-box">
        ${wo.work_order_notes || ""}
        ${wo.work_order_notes && wo.custom_notes ? "<br><br>" : ""}
        ${wo.custom_notes || ""}
      </div>
    </div>
    `
        : ""
    }
    <div class="footer">
      Soil Seed & Water | 18980 Stanton Rd, Congress, AZ 85332 | (928) 632-7125 | info@soilseedandwater.com
    </div>
  </div>
  <!-- Page 2: Pallet Label -->
  <div class="page label-page">
    <div class="pallet-label">
      <div class="label-company">Soil Seed & Water</div>
      <div class="label-wo">${wo.wo_number}</div>
      <div class="label-product">${wo.product_name || "Custom Product"}</div>
      ${wo.size_category_illustration_base64 ? `<img src="${wo.size_category_illustration_base64}" alt="${wo.size_category_name || wo.size_category}" class="label-size-image" />` : ""}
      <div class="label-info"><strong>${wo.size_category_name || wo.size_category}</strong></div>
      ${wo.units_per_pallet ? `<div class="label-info">${wo.units_per_pallet} units per pallet</div>` : ""}
      <div class="label-date">Date Produced: _______________</div>
      <div class="label-pallet-number">Pallet ___ of ${wo.quantity}</div>
      <div class="label-footer">SSW BioSoils | Regenerative Soil Solutions | OMRI Listed</div>
    </div>
  </div>
</body>
</html>
  `;
}

export default router;
