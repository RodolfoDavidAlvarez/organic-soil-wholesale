import { type Express } from "express";
import { createServer, type Server } from "http";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Serve uploads directory statically (business card images, etc.)
const uploadsPath = path.join(__dirname, "../../client/public/uploads");

// Import actual route modules
import publicProductRoutes from "./publicProducts.js";
import payAndPickupRoutes from "./payAndPickup.js";
import triviaLeadsRoutes from "./triviaLeads.js";
import driveThruAdminRoutes from "./driveThruAdmin.js";
import adminAuthRoutes from "./admin/auth.js";
import adminDashboardRoutes from "./admin/dashboard.js";
import adminProductRoutes from "./admin/products.js";
import adminOrderRoutes from "./admin/orders.js";
import simpleAuthRoutes from "./admin/simpleAuth.js";
import adminUploadRoutes from "./admin/uploads.js";
import adminNotificationRoutes from "./admin/notifications.js";
import adminRepresentativeRoutes from "./admin/representatives.js";
import adminRepresentativeContactsRoutes from "./admin/representativeContacts.js";
import adminInvitationRoutes from "./admin/invitations.js";
import adminAnalyticsRoutes from "./admin/analytics.js";
import adminOperationsRoutes from "./admin/operations.js";
import adminSurveyRoutes from "./admin/surveys.js";
import contactRoutes from "./contact.js";
import quoteRequestRoutes from "./quoteRequests.js";
import addressSuggestRoutes from "./addressSuggest.js";
import specialRequestRoutes from "./specialRequests.js";
import leadRoutes from "./leads.js";
import representativeRoutes from "./representatives.js";
import businessCardRoutes from "./businessCard.js";
import authRoutes from "./auth.js";
import checkoutRoutes from "./checkout.js";
import inventoryRoutes from "./inventory.js";
import grokRoutes from "./grok.js";
import unsubscribeRoutes from "./unsubscribe.js";
import newsletterRoutes from "./newsletter.js";
import workshopRoutes from "./workshops.js";
import giveawayRoutes from "./giveaway.js";
import jobApplicationRoutes from "./jobApplications.js";
import { handleSurveyCouponQr, handleSurveySubmit } from "./survey.js";
import { SURVEY_SUBMIT_POST_PATHS } from "../../shared/surveySubmitPaths.js";
import schedulingRoutes from "./scheduling.js";
import webhookRoutes from "./webhooks.js";
import campaignRedirectRoutes from "./campaignRedirect.js";
// import pricingRoutes from "./pricing.js";

export function registerRoutes(app: Express): Promise<Server> {
  // Serve uploads directory explicitly for business card images
  app.use("/uploads", express.static(uploadsPath));

  // Serve static files from client/public in development
  if (process.env.NODE_ENV !== "production") {
    app.use(express.static(path.join(__dirname, "../../client/public")));
  }

  // Health check endpoint
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  app.get("/api/site-config", async (_req, res) => {
    const { getDevSiteConfig } = await import("../../shared/developerMode.js");
    res.json(getDevSiteConfig());
  });

  app.use("/r", campaignRedirectRoutes);

  // Register route modules
  app.use("/api/public/products", publicProductRoutes);
  app.use("/api/pay-and-pickup", payAndPickupRoutes);
  app.use("/api/drive-through", payAndPickupRoutes);
  app.use("/api/drive-thru/admin", driveThruAdminRoutes);
  app.use("/api/admin/auth", adminAuthRoutes);
  app.use("/api/admin/simple", simpleAuthRoutes);
  app.use("/api/admin/dashboard", adminDashboardRoutes);
  app.use("/api/admin/products", adminProductRoutes);
  app.use("/api/admin/orders", adminOrderRoutes);
  app.use("/api/admin/uploads", adminUploadRoutes);
  app.use("/api/admin/notifications", adminNotificationRoutes);
  app.use("/api/admin/representatives", adminRepresentativeRoutes);
  app.use("/api/admin/representative-contacts", adminRepresentativeContactsRoutes);
  app.use("/api/admin/invitations", adminInvitationRoutes);
  app.use("/api/admin/analytics", adminAnalyticsRoutes);
  app.use("/api/admin/operations", adminOperationsRoutes);
  app.use("/api/admin/surveys", adminSurveyRoutes);
  app.use("/api/representatives", representativeRoutes);
  app.use("/api/representatives", businessCardRoutes);
  app.use("/api/contact", contactRoutes);
  app.use("/api/quote", quoteRequestRoutes);
  app.use("/api/address", addressSuggestRoutes);
  app.use("/api/special-request", specialRequestRoutes);
  app.use("/api/leads", leadRoutes);
  app.use("/api", triviaLeadsRoutes);
  app.use("/api/auth", authRoutes);
  app.use("/api/checkout", checkoutRoutes);
  app.use("/api/inventory", inventoryRoutes);
  app.use("/api/grok", grokRoutes);
  app.use("/api/unsubscribe", unsubscribeRoutes);
  app.use("/api/newsletter", newsletterRoutes);
  app.use("/api/workshops", workshopRoutes);
  app.use("/api/giveaway", giveawayRoutes);
  app.use("/api/job-applications", jobApplicationRoutes);
  app.post(SURVEY_SUBMIT_POST_PATHS, handleSurveySubmit);
  app.get("/api/public/survey-coupon/qr/:code.:format", handleSurveyCouponQr);
  app.use("/api/portal/scheduling", schedulingRoutes);
  app.use("/api/webhooks", webhookRoutes);
  // app.use("/api/pricing", pricingRoutes);

  // Catch-all for API routes that don't exist
  app.use("/api/*", (req, res) => {
    res.status(404).json({
      error: "API endpoint not found",
      path: req.originalUrl,
    });
  });

  const server = createServer(app);
  return Promise.resolve(server);
}
