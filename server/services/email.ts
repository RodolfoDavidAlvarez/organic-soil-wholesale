import { Resend } from "resend";
import { supabase } from "../db/supabase.js";
import {
  COMPANY_ADDRESS,
  COMPANY_NAME,
  CUSTOMER_SUPPORT_PHONE_DISPLAY,
  CUSTOMER_SUPPORT_PHONE_TEL,
} from "../config/contact.js";
import { guardResend, sswFrom } from "../../shared/sswEmailFrom.js";

// Initialize Resend with API key
const resend = guardResend(new Resend(process.env.RESEND_API_KEY));

// Email configuration
const FROM_EMAIL = sswFrom("Organic Soil Wholesale");
const REPLY_TO_EMAIL = "ralvarez@soilseedandwater.com";
const COMPANY_PHONE = CUSTOMER_SUPPORT_PHONE_DISPLAY;
const COMPANY_PHONE_TEL = CUSTOMER_SUPPORT_PHONE_TEL;

// Get active admin emails for a specific notification type
async function getAdminEmailsForNotification(notificationType: string): Promise<string[]> {
  try {
    const { data, error } = await supabase.from("admin_notifications").select("email").eq("active", true).eq(notificationType, true);

    if (error) {
      console.error("Error fetching admin emails:", error);
      // Fallback to default admin
      return ["ralvarez@soilseedandwater.com"];
    }

    const emails = data?.map((admin) => admin.email) || [];

    // If no admins found, use fallback
    if (emails.length === 0) {
      return ["ralvarez@soilseedandwater.com"];
    }

    return emails;
  } catch (error) {
    console.error("Error in getAdminEmailsForNotification:", error);
    // Fallback to default admin
    return ["ralvarez@soilseedandwater.com"];
  }
}

// Email templates
interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

// Send email helper
export async function sendEmail({ to, subject, html, text }: EmailOptions) {
  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      replyTo: REPLY_TO_EMAIL,
      to,
      subject,
      html,
      text: text || "",
    });

    if (error) {
      console.error("Email send error:", error);
      throw error;
    }

    console.log("Email sent successfully:", data);
    return data;
  } catch (error) {
    console.error("Failed to send email:", error);
    throw error;
  }
}

// Email verification template
export async function sendVerificationEmail(email: string, token: string) {
  const baseUrl =
    process.env.CLIENT_URL ||
    (process.env.NODE_ENV === "production" && process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  const verificationUrl = `${baseUrl}/verify-email/${token}`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #2c5530; color: white; padding: 20px; text-align: center; }
        .content { padding: 30px; background-color: #f9f9f9; }
        .button { display: inline-block; padding: 12px 30px; background-color: #2c5530; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 14px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>${COMPANY_NAME}</h1>
        </div>
        <div class="content">
          <h2>Verify Your Email Address</h2>
          <p>Thank you for creating an account with ${COMPANY_NAME}!</p>
          <p>Please click the button below to verify your email address and activate your account:</p>
          <center>
            <a href="${verificationUrl}" class="button">Verify Email</a>
          </center>
          <p>Or copy and paste this link into your browser:</p>
          <p style="word-break: break-all; background-color: #eee; padding: 10px; border-radius: 5px;">
            ${verificationUrl}
          </p>
          <p>This link will expire in 24 hours.</p>
          <p>If you didn't create an account with us, please ignore this email.</p>
        </div>
        <div class="footer">
          <p>${COMPANY_NAME} • ${COMPANY_ADDRESS} • ${COMPANY_PHONE}</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to: email,
    subject: `Verify your email for ${COMPANY_NAME}`,
    html,
  });
}

// Password reset template
export async function sendPasswordResetEmail(email: string, token: string) {
  const baseUrl =
    process.env.CLIENT_URL ||
    (process.env.NODE_ENV === "production" && process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  const resetUrl = `${baseUrl}/reset-password/${token}`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #2c5530; color: white; padding: 20px; text-align: center; }
        .content { padding: 30px; background-color: #f9f9f9; }
        .button { display: inline-block; padding: 12px 30px; background-color: #2c5530; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 14px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>${COMPANY_NAME}</h1>
        </div>
        <div class="content">
          <h2>Reset Your Password</h2>
          <p>We received a request to reset your password for your ${COMPANY_NAME} account.</p>
          <p>Click the button below to create a new password:</p>
          <center>
            <a href="${resetUrl}" class="button">Reset Password</a>
          </center>
          <p>Or copy and paste this link into your browser:</p>
          <p style="word-break: break-all; background-color: #eee; padding: 10px; border-radius: 5px;">
            ${resetUrl}
          </p>
          <p><strong>This link will expire in 1 hour for security reasons.</strong></p>
          <p>If you didn't request a password reset, please ignore this email. Your password won't be changed.</p>
        </div>
        <div class="footer">
          <p>${COMPANY_NAME} • ${COMPANY_ADDRESS} • ${COMPANY_PHONE}</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to: email,
    subject: `Password Reset Request - ${COMPANY_NAME}`,
    html,
  });
}

// Welcome email for approved wholesale accounts
export async function sendWholesaleApprovalEmail(email: string, companyName: string) {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #2c5530; color: white; padding: 20px; text-align: center; }
        .content { padding: 30px; background-color: #f9f9f9; }
        .button { display: inline-block; padding: 12px 30px; background-color: #2c5530; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 14px; }
        .benefits { background-color: #e8f5e9; padding: 20px; border-radius: 5px; margin: 20px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>${COMPANY_NAME}</h1>
        </div>
        <div class="content">
          <h2>Welcome to Our Wholesale Program!</h2>
          <p>Dear ${companyName},</p>
          <p>Great news! Your wholesale account has been approved.</p>
          
          <div class="benefits">
            <h3>Your Wholesale Benefits:</h3>
            <ul>
              <li>Exclusive wholesale pricing</li>
              <li>Bulk order discounts</li>
              <li>Priority delivery scheduling</li>
              <li>Dedicated account support</li>
              <li>NET payment terms available</li>
            </ul>
          </div>
          
          <p>You can now log in to view wholesale pricing and place orders:</p>
          <center>
            <a href="${process.env.CLIENT_URL || (process.env.NODE_ENV === "production" && process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")}/signin" class="button">Sign In to Your Account</a>
          </center>
          
          <p>If you have any questions, please don't hesitate to contact us at ${COMPANY_PHONE}.</p>
          <p>We look forward to working with you!</p>
        </div>
        <div class="footer">
          <p>${COMPANY_NAME} • ${COMPANY_ADDRESS} • ${COMPANY_PHONE}</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to: email,
    subject: `Welcome to ${COMPANY_NAME} Wholesale Program`,
    html,
  });
}

// Order confirmation email
export async function sendOrderConfirmationEmail(
  email: string,
  orderDetails: {
    orderNumber: string;
    items: Array<{ name: string; quantity: number; price: number }>;
    subtotal: number;
    tax: number;
    total: number;
    deliveryMethod: string;
    estimatedDelivery?: string;
  }
) {
  const itemsHtml = orderDetails.items
    .map(
      (item) => `
        <tr>
          <td style="padding: 10px; border-bottom: 1px solid #eee;">${item.name}</td>
          <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">${item.quantity}</td>
          <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">$${item.price.toFixed(2)}</td>
        </tr>
      `
    )
    .join("");

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #2c5530; color: white; padding: 20px; text-align: center; }
        .content { padding: 30px; background-color: #f9f9f9; }
        .order-info { background-color: white; padding: 20px; border-radius: 5px; margin: 20px 0; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 14px; }
        table { width: 100%; border-collapse: collapse; }
        th { text-align: left; padding: 10px; border-bottom: 2px solid #2c5530; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>${COMPANY_NAME}</h1>
        </div>
        <div class="content">
          <h2>Order Confirmation</h2>
          <p>Thank you for your order!</p>
          
          <div class="order-info">
            <p><strong>Order Number:</strong> ${orderDetails.orderNumber}</p>
            <p><strong>Delivery Method:</strong> ${orderDetails.deliveryMethod}</p>
            ${orderDetails.estimatedDelivery ? `<p><strong>Estimated Delivery:</strong> ${orderDetails.estimatedDelivery}</p>` : ""}
          </div>
          
          <h3>Order Details</h3>
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th style="text-align: center;">Quantity</th>
                <th style="text-align: right;">Price</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
              <tr>
                <td colspan="2" style="padding: 10px; text-align: right;"><strong>Subtotal:</strong></td>
                <td style="padding: 10px; text-align: right;">$${orderDetails.subtotal.toFixed(2)}</td>
              </tr>
              <tr>
                <td colspan="2" style="padding: 10px; text-align: right;"><strong>Tax:</strong></td>
                <td style="padding: 10px; text-align: right;">$${orderDetails.tax.toFixed(2)}</td>
              </tr>
              <tr>
                <td colspan="2" style="padding: 10px; text-align: right;"><strong>Total:</strong></td>
                <td style="padding: 10px; text-align: right;"><strong>$${orderDetails.total.toFixed(2)}</strong></td>
              </tr>
            </tbody>
          </table>
          
          <p style="margin-top: 30px;">We'll send you an update when your order is ready for ${orderDetails.deliveryMethod.toLowerCase()}.</p>
          <p>Questions? Call us at ${COMPANY_PHONE}</p>
        </div>
        <div class="footer">
          <p>${COMPANY_NAME} • ${COMPANY_ADDRESS} • ${COMPANY_PHONE}</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to: email,
    subject: `Order Confirmation #${orderDetails.orderNumber} - ${COMPANY_NAME}`,
    html,
  });
}

export async function sendPurchaseThankYouEmail(
  email: string,
  details: {
    fullName?: string;
    customerNumber?: string | null;
    pickupLabel?: string;
    location?: string;
  }
) {
  const { buildPurchaseThankYouEmail, PURCHASE_THANK_YOU_FROM } = await import("../../shared/purchaseThankYou.js");
  const message = buildPurchaseThankYouEmail(details);
  const { data, error } = await resend.emails.send({
    from: message.from || PURCHASE_THANK_YOU_FROM,
    replyTo: REPLY_TO_EMAIL,
    to: email,
    subject: message.subject,
    html: message.html,
  });
  if (error) {
    console.error("Purchase thank-you send error:", error);
    throw error;
  }
  return data;
}

// Order ready for pickup notification
export async function sendOrderReadyEmail(email: string, orderNumber: string, pickupLocation: string) {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #2c5530; color: white; padding: 20px; text-align: center; }
        .content { padding: 30px; background-color: #f9f9f9; }
        .button { display: inline-block; padding: 12px 30px; background-color: #2c5530; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        .pickup-info { background-color: #e8f5e9; padding: 20px; border-radius: 5px; margin: 20px 0; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 14px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>${COMPANY_NAME}</h1>
        </div>
        <div class="content">
          <h2>Your Order is Ready for Pickup!</h2>
          <p>Good news! Order #${orderNumber} is ready for pickup.</p>
          
          <div class="pickup-info">
            <h3>Pickup Information:</h3>
            <p><strong>Location:</strong> ${pickupLocation}</p>
            <p><strong>Hours:</strong> Monday-Saturday, 7:00 AM - 5:00 PM</p>
            <p><strong>Order Number:</strong> ${orderNumber}</p>
            <p>Please bring this order number and a valid ID for pickup.</p>
          </div>
          
          <p>Your order will be held for 7 days. Please pick up at your earliest convenience.</p>
          
          <center>
            <a href="${COMPANY_PHONE_TEL}" class="button">Call Us: ${COMPANY_PHONE}</a>
          </center>
          
          <p>Thank you for your business!</p>
        </div>
        <div class="footer">
          <p>${COMPANY_NAME} • ${COMPANY_ADDRESS} • ${COMPANY_PHONE}</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to: email,
    subject: `Order #${orderNumber} Ready for Pickup - ${COMPANY_NAME}`,
    html,
  });
}

// Admin notification for new orders
export async function sendAdminOrderNotification(orderDetails: {
  orderNumber: string;
  customerName: string;
  customerEmail?: string;
  customerPhone: string;
  orderType: string;
  items: Array<{ name: string; quantity: number; price: number; size?: string }>;
  subtotal: number;
  tax: number;
  total: number;
  deliveryMethod: string;
  pickupLocation?: string;
  estimatedReadyTime?: string;
  notes?: string;
  paymentMethod?: string;
  paymentStatus?: string;
}) {
  const itemsHtml = orderDetails.items
    .map(
      (item) => `
        <tr>
          <td style="padding: 10px; border-bottom: 1px solid #eee;">${item.name}${item.size ? ` (${item.size})` : ""}</td>
          <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">${item.quantity}</td>
          <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">$${item.price.toFixed(2)}</td>
        </tr>
      `
    )
    .join("");

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { 
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          line-height: 1.6;
          color: #1a1a1a;
          margin: 0;
          padding: 0;
          background-color: #f5f5f5;
        }
        .wrapper {
          background-color: #f5f5f5;
          padding: 40px 20px;
        }
        .container { 
          max-width: 600px;
          margin: 0 auto;
          background-color: #ffffff;
          border-radius: 12px;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
          overflow: hidden;
        }
        .header { 
          background: linear-gradient(135deg, #2c5530 0%, #1e3a21 100%);
          color: white;
          padding: 32px;
          text-align: center;
        }
        .alert-badge { 
          background-color: #ef4444;
          color: white;
          padding: 6px 16px;
          border-radius: 20px;
          display: inline-block;
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 0.5px;
          text-transform: uppercase;
          margin-bottom: 16px;
        }
        h1 {
          margin: 0;
          font-size: 24px;
          font-weight: 300;
          letter-spacing: -0.5px;
        }
        .content { 
          padding: 40px 32px;
        }
        h2 {
          color: #2c5530;
          font-size: 22px;
          margin: 0 0 24px 0;
          font-weight: 600;
        }
        .order-info { 
          background-color: #f9fafb;
          padding: 24px;
          border-radius: 8px;
          margin: 24px 0;
          border: 1px solid #e5e7eb;
        }
        .order-info p {
          margin: 8px 0;
          color: #4b5563;
        }
        .order-info strong {
          color: #1a1a1a;
          font-weight: 600;
        }
        .highlight { 
          background-color: #fef3c7;
          padding: 20px;
          border-left: 4px solid #f59e0b;
          margin: 24px 0;
          border-radius: 4px;
        }
        h3 {
          color: #2c5530;
          font-size: 18px;
          margin: 32px 0 16px 0;
          font-weight: 600;
        }
        table { 
          width: 100%;
          border-collapse: collapse;
          margin: 16px 0;
        }
        th { 
          text-align: left;
          padding: 12px;
          border-bottom: 2px solid #e5e7eb;
          color: #6b7280;
          font-size: 14px;
          font-weight: 600;
          text-transform: uppercase;
        }
        td {
          padding: 16px 12px;
          border-bottom: 1px solid #f3f4f6;
          color: #374151;
        }
        .total-row td {
          border-top: 2px solid #e5e7eb;
          border-bottom: none;
          padding-top: 16px;
          font-size: 18px;
          font-weight: 600;
          color: #1a1a1a;
        }
        .action-required {
          background-color: #2c5530;
          color: white;
          padding: 24px;
          border-radius: 8px;
          margin: 32px 0 0 0;
          text-align: center;
        }
        .footer { 
          text-align: center;
          padding: 24px 32px;
          color: #9ca3af;
          font-size: 13px;
          background-color: #f9fafb;
          border-top: 1px solid #e5e7eb;
        }
        .footer p {
          margin: 4px 0;
        }
      </style>
    </head>
    <body>
      <div class="wrapper">
        <div class="container">
          <div class="header">
            <div class="alert-badge">NEW ORDER</div>
            <h1>${COMPANY_NAME}</h1>
          </div>
          <div class="content">
            <h2>New ${orderDetails.orderType === "pay_and_pickup" ? "Pay & Pickup" : "Order"} Received</h2>
            
            <div class="order-info">
              <p><strong>Order Number:</strong> ${orderDetails.orderNumber}</p>
              <p><strong>Customer:</strong> ${orderDetails.customerName}</p>
              ${orderDetails.customerEmail ? `<p><strong>Email:</strong> ${orderDetails.customerEmail}</p>` : ""}
              <p><strong>Phone:</strong> ${orderDetails.customerPhone}</p>
              <p><strong>Order Type:</strong> ${orderDetails.orderType === "pay_and_pickup" ? "Pay & Pickup" : orderDetails.orderType}</p>
              <p><strong>Delivery Method:</strong> ${orderDetails.deliveryMethod}</p>
              ${orderDetails.paymentMethod ? `<p><strong>Payment Method:</strong> ${orderDetails.paymentMethod}</p>` : ""}
              ${orderDetails.paymentStatus ? `<p><strong>Payment Status:</strong> ${orderDetails.paymentStatus}</p>` : ""}
              ${orderDetails.pickupLocation ? `<p><strong>Pickup Location:</strong> ${orderDetails.pickupLocation}</p>` : ""}
              ${orderDetails.estimatedReadyTime ? `<p><strong>Estimated Ready:</strong> ${new Date(orderDetails.estimatedReadyTime).toLocaleString()}</p>` : ""}
            </div>
            
            ${
              orderDetails.notes
                ? `
            <div class="highlight">
              <strong>Customer Notes:</strong><br>
              ${orderDetails.notes}
            </div>
            `
                : ""
            }
            
            <h3>Order Items</h3>
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th style="text-align: center;">QTY</th>
                  <th style="text-align: right;">Amount</th>
                </tr>
              </thead>
              <tbody>
                ${itemsHtml}
                <tr>
                  <td colspan="2" style="padding: 12px; text-align: right;"><strong>Subtotal:</strong></td>
                  <td style="padding: 12px; text-align: right;">$${orderDetails.subtotal.toFixed(2)}</td>
                </tr>
                <tr>
                  <td colspan="2" style="padding: 12px; text-align: right;"><strong>Tax:</strong></td>
                  <td style="padding: 12px; text-align: right;">$${orderDetails.tax.toFixed(2)}</td>
                </tr>
                <tr class="total-row">
                  <td colspan="2" style="text-align: right;"><strong>Total:</strong></td>
                  <td style="text-align: right;"><strong>$${orderDetails.total.toFixed(2)}</strong></td>
                </tr>
              </tbody>
            </table>
            
            <div class="action-required">
              <strong>ACTION REQUIRED</strong><br>
              Please prepare this order for ${orderDetails.deliveryMethod.toLowerCase()}.
            </div>
          </div>
          <div class="footer">
            <p>${COMPANY_NAME} Order Management System</p>
            <p>This notification was sent to authorized administrators</p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;

  // Get all admins who want order notifications
  const adminEmails = await getAdminEmailsForNotification("notify_new_orders");

  // Send to all admins
  const emailPromises = adminEmails.map((email) =>
    sendEmail({
      to: email,
      subject: `[NEW ORDER] ${orderDetails.paymentStatus === "paid" ? "[PAID] " : ""}#${orderDetails.orderNumber} - $${orderDetails.total.toFixed(2)} - ${orderDetails.customerName}`,
      html,
    })
  );

  return Promise.all(emailPromises);
}

// Admin notification for customer arrival
export async function sendAdminArrivalNotification(arrivalDetails: {
  customerName: string;
  customerPhone: string;
  vehicleInfo?: string;
  arrivalTime: string;
  notificationId: number;
}) {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { 
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          line-height: 1.6;
          color: #1a1a1a;
          margin: 0;
          padding: 0;
          background-color: #f5f5f5;
        }
        .wrapper {
          background-color: #f5f5f5;
          padding: 40px 20px;
        }
        .container { 
          max-width: 600px;
          margin: 0 auto;
          background-color: #ffffff;
          border-radius: 12px;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
          overflow: hidden;
        }
        .header { 
          background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%);
          color: white;
          padding: 32px;
          text-align: center;
        }
        h1 {
          margin: 0;
          font-size: 24px;
          font-weight: 600;
          letter-spacing: -0.5px;
          text-transform: uppercase;
        }
        .content { 
          padding: 40px 32px;
        }
        .action-required { 
          background-color: #fee2e2;
          color: #991b1b;
          padding: 20px;
          border-radius: 8px;
          text-align: center;
          font-weight: 700;
          font-size: 18px;
          margin: 0 0 24px 0;
          border: 2px solid #fca5a5;
        }
        .arrival-info { 
          background-color: #ffffff;
          padding: 32px;
          border-radius: 12px;
          margin: 24px 0;
          border: 2px solid #dc2626;
          box-shadow: 0 4px 6px rgba(220, 38, 38, 0.1);
        }
        .arrival-info h2 {
          color: #1a1a1a;
          font-size: 20px;
          margin: 0 0 20px 0;
          font-weight: 600;
        }
        .info-row {
          display: flex;
          align-items: center;
          padding: 12px 0;
          border-bottom: 1px solid #f3f4f6;
        }
        .info-row:last-child {
          border-bottom: none;
        }
        .info-label {
          font-weight: 600;
          color: #4b5563;
          width: 140px;
        }
        .info-value {
          color: #1a1a1a;
          flex: 1;
        }
        .info-value a {
          color: #2563eb;
          text-decoration: none;
          font-weight: 600;
        }
        .time-stamp {
          background-color: #f3f4f6;
          padding: 16px;
          border-radius: 8px;
          text-align: center;
          margin: 24px 0;
        }
        .time-stamp strong {
          color: #dc2626;
          font-size: 18px;
        }
        .footer { 
          text-align: center;
          padding: 24px 32px;
          color: #9ca3af;
          font-size: 13px;
          background-color: #f9fafb;
          border-top: 1px solid #e5e7eb;
        }
        .footer p {
          margin: 4px 0;
        }
        .call-button {
          display: inline-block;
          background-color: #2563eb;
          color: white;
          padding: 12px 24px;
          border-radius: 8px;
          text-decoration: none;
          font-weight: 600;
          margin: 16px 0;
        }
      </style>
    </head>
    <body>
      <div class="wrapper">
        <div class="container">
          <div class="header">
            <h1>Customer Arrival Alert</h1>
          </div>
          <div class="content">
            <div class="action-required">
              IMMEDIATE ACTION REQUIRED - Customer is waiting at pickup location
            </div>
            
            <div class="arrival-info">
              <h2>Customer Information</h2>
              <div class="info-row">
                <span class="info-label">Name:</span>
                <span class="info-value">${arrivalDetails.customerName}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Phone:</span>
                <span class="info-value">
                  <a href="tel:${arrivalDetails.customerPhone}">${arrivalDetails.customerPhone}</a>
                </span>
              </div>
              ${
                arrivalDetails.vehicleInfo
                  ? `
              <div class="info-row">
                <span class="info-label">Vehicle:</span>
                <span class="info-value">${arrivalDetails.vehicleInfo}</span>
              </div>
              `
                  : ""
              }
              <div class="info-row">
                <span class="info-label">Notification ID:</span>
                <span class="info-value">#${arrivalDetails.notificationId}</span>
              </div>
            </div>

            <div class="time-stamp">
              <p style="margin: 0; color: #6b7280;">Customer arrived at</p>
              <strong>${new Date(arrivalDetails.arrivalTime).toLocaleString()}</strong>
            </div>
            
            <p style="text-align: center; margin: 32px 0;">
              <a href="tel:${arrivalDetails.customerPhone}" class="call-button">
                Call Customer
              </a>
            </p>
          </div>
          <div class="footer">
            <p>${COMPANY_NAME} Pickup Alert System</p>
            <p>Urgent notification sent to authorized administrators</p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;

  // Get all admins who want arrival notifications
  const adminEmails = await getAdminEmailsForNotification("notify_arrivals");

  // Send to all admins
  const emailPromises = adminEmails.map((email) =>
    sendEmail({
      to: email,
      subject: `[URGENT] Customer Arrival: ${arrivalDetails.customerName} - ${arrivalDetails.vehicleInfo || "Vehicle Info Not Provided"}`,
      html,
    })
  );

  return Promise.all(emailPromises);
}

// Admin notification for trivia leads
export async function sendAdminTriviaLeadNotification(leadDetails: {
  name: string;
  email: string;
  interests: string[];
  score: number;
  answers: any;
  submittedAt: string;
}) {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { 
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          line-height: 1.6;
          color: #1a1a1a;
          margin: 0;
          padding: 0;
          background-color: #f5f5f5;
        }
        .wrapper {
          background-color: #f5f5f5;
          padding: 40px 20px;
        }
        .container { 
          max-width: 600px;
          margin: 0 auto;
          background-color: #ffffff;
          border-radius: 12px;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
          overflow: hidden;
        }
        .header { 
          background: linear-gradient(135deg, #16a34a 0%, #059669 100%);
          color: white;
          padding: 32px;
          text-align: center;
        }
        h1 {
          margin: 0;
          font-size: 24px;
          font-weight: 300;
          letter-spacing: -0.5px;
        }
        .content { 
          padding: 40px 32px;
        }
        .lead-info { 
          background-color: #f9fafb;
          padding: 24px;
          border-radius: 8px;
          margin: 24px 0;
          border: 1px solid #e5e7eb;
        }
        .lead-info p {
          margin: 12px 0;
          color: #4b5563;
        }
        .lead-info strong {
          color: #1a1a1a;
          font-weight: 600;
        }
        .lead-info a {
          color: #2563eb;
          text-decoration: none;
        }
        h3 {
          color: #2c5530;
          font-size: 18px;
          margin: 32px 0 16px 0;
          font-weight: 600;
        }
        .score-badge { 
          display: inline-block;
          background: #059669;
          color: white;
          padding: 4px 12px;
          border-radius: 20px;
          font-weight: 600;
          font-size: 13px;
          margin-left: 8px;
          vertical-align: middle;
        }
        .interests-container {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin: 16px 0;
        }
        .interest-tag { 
          background: #e0f2fe;
          color: #0369a1;
          padding: 6px 16px;
          border-radius: 20px;
          font-size: 14px;
          font-weight: 500;
          border: 1px solid #bae6fd;
        }
        .quality-indicator { 
          padding: 20px;
          border-radius: 8px;
          margin: 24px 0;
          border: 2px solid;
          text-align: center;
        }
        .hot-lead { 
          background-color: #fef2f2;
          border-color: #f87171;
          color: #991b1b;
        }
        .warm-lead { 
          background-color: #fffbeb;
          border-color: #fbbf24;
          color: #92400e;
        }
        .cold-lead { 
          background-color: #eff6ff;
          border-color: #93c5fd;
          color: #1e40af;
        }
        .quality-metric {
          display: flex;
          justify-content: space-between;
          padding: 8px 0;
        }
        .cta-button {
          display: inline-block;
          background-color: #059669;
          color: white;
          padding: 14px 32px;
          text-decoration: none;
          border-radius: 8px;
          font-weight: 600;
          font-size: 16px;
          margin: 24px 0;
        }
        .footer { 
          text-align: center;
          padding: 24px 32px;
          color: #9ca3af;
          font-size: 13px;
          background-color: #f9fafb;
          border-top: 1px solid #e5e7eb;
        }
        .footer p {
          margin: 4px 0;
        }
      </style>
    </head>
    <body>
      <div class="wrapper">
        <div class="container">
          <div class="header">
            <h1>Trade Show Lead Notification</h1>
          </div>
          <div class="content">
            <h2 style="margin: 0 0 24px 0; color: #1a1a1a; font-size: 22px;">New Lead Captured</h2>
            
            <div class="lead-info">
              <p><strong>Name:</strong> ${leadDetails.name}</p>
              <p><strong>Email:</strong> <a href="mailto:${leadDetails.email}">${leadDetails.email}</a></p>
              <p><strong>Quiz Score:</strong> ${leadDetails.score}/5 
                <span class="score-badge">${leadDetails.score === 5 ? "PERFECT SCORE" : leadDetails.score >= 4 ? "HIGH SCORE" : leadDetails.score >= 3 ? "GOOD SCORE" : "PARTICIPATED"}</span>
              </p>
              <p><strong>Submitted:</strong> ${new Date(leadDetails.submittedAt).toLocaleString()}</p>
            </div>
            
            <h3>Growing Interests</h3>
            <div class="interests-container">
              ${leadDetails.interests.map((interest) => `<span class="interest-tag">${interest}</span>`).join("")}
            </div>
            
            <div class="quality-indicator ${leadDetails.score >= 4 ? "hot-lead" : leadDetails.score >= 3 ? "warm-lead" : "cold-lead"}">
              <div class="quality-metric">
                <strong>Lead Quality:</strong>
                <span>${leadDetails.score >= 4 ? "HOT LEAD" : leadDetails.score >= 3 ? "WARM LEAD" : "COLD LEAD"}</span>
              </div>
              <div class="quality-metric">
                <strong>Engagement Level:</strong>
                <span>${leadDetails.interests.length > 3 ? "HIGH" : leadDetails.interests.length > 1 ? "MEDIUM" : "LOW"}</span>
              </div>
            </div>
            
            <p style="text-align: center;">
              <a href="mailto:${leadDetails.email}" class="cta-button">Contact This Lead</a>
            </p>
          </div>
          <div class="footer">
            <p>Lead captured at Trade Show 2025</p>
            <p>${COMPANY_NAME} Lead Management System</p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;

  // Get all admins who want trivia lead notifications
  const adminEmails = await getAdminEmailsForNotification("notify_trivia_leads");

  // Send to all admins
  const emailPromises = adminEmails.map((email) =>
    sendEmail({
      to: email,
      subject: `[TRIVIA LEAD] ${leadDetails.name} - Score: ${leadDetails.score}/5 - ${leadDetails.interests.length} interests`,
      html,
    })
  );

  return Promise.all(emailPromises);
}

// Admin invitation email
export async function sendAdminInvitationEmail(invitationDetails: { email: string; full_name: string | null; token: string }) {
  const baseUrl =
    process.env.CLIENT_URL ||
    (process.env.NODE_ENV === "production" && process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  const invitationUrl = `${baseUrl}/admin/invite/${invitationDetails.token}`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { 
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          line-height: 1.6;
          color: #1a1a1a;
          margin: 0;
          padding: 0;
          background-color: #f5f5f5;
        }
        .wrapper {
          background-color: #f5f5f5;
          padding: 40px 20px;
        }
        .container { 
          max-width: 600px;
          margin: 0 auto;
          background-color: #ffffff;
          border-radius: 12px;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
          overflow: hidden;
        }
        .header { 
          background: linear-gradient(135deg, #2c5530 0%, #1e3a21 100%);
          color: white;
          padding: 32px;
          text-align: center;
        }
        h1 {
          margin: 0;
          font-size: 24px;
          font-weight: 300;
          letter-spacing: -0.5px;
        }
        .content { 
          padding: 40px 32px;
        }
        h2 {
          color: #2c5530;
          font-size: 22px;
          margin: 0 0 24px 0;
          font-weight: 600;
        }
        .invitation-info { 
          background-color: #f9fafb;
          padding: 24px;
          border-radius: 8px;
          margin: 24px 0;
          border: 1px solid #e5e7eb;
        }
        .invitation-info p {
          margin: 8px 0;
          color: #4b5563;
        }
        .button { 
          display: inline-block;
          background: linear-gradient(135deg, #2c5530 0%, #1e3a21 100%);
          color: white;
          padding: 14px 32px;
          text-decoration: none;
          border-radius: 8px;
          font-weight: 600;
          font-size: 16px;
          margin: 24px 0;
          text-align: center;
        }
        .button-container {
          text-align: center;
          margin: 32px 0;
        }
        .link-fallback {
          background-color: #f3f4f6;
          padding: 16px;
          border-radius: 8px;
          margin: 24px 0;
          word-break: break-all;
          font-size: 13px;
          color: #6b7280;
        }
        .footer { 
          text-align: center;
          padding: 24px 32px;
          color: #9ca3af;
          font-size: 13px;
          background-color: #f9fafb;
          border-top: 1px solid #e5e7eb;
        }
        .footer p {
          margin: 4px 0;
        }
        .security-note {
          background-color: #fef3c7;
          padding: 16px;
          border-left: 4px solid #f59e0b;
          margin: 24px 0;
          border-radius: 4px;
          font-size: 14px;
          color: #92400e;
        }
      </style>
    </head>
    <body>
      <div class="wrapper">
        <div class="container">
          <div class="header">
            <h1>${COMPANY_NAME}</h1>
          </div>
          <div class="content">
            <h2>You've Been Invited!</h2>
            <p>${invitationDetails.full_name ? `Hi ${invitationDetails.full_name},` : "Hello,"}</p>
            <p>You've been invited to join the ${COMPANY_NAME} admin panel as an administrator.</p>
            
            <div class="invitation-info">
              <p><strong>Email:</strong> ${invitationDetails.email}</p>
              <p><strong>Role:</strong> Administrator</p>
            </div>
            
            <p>Click the button below to accept your invitation and create your account:</p>
            
            <div class="button-container">
              <a href="${invitationUrl}" class="button">Accept Invitation & Create Account</a>
            </div>
            
            <p>Or copy and paste this link into your browser:</p>
            <div class="link-fallback">
              ${invitationUrl}
            </div>
            
            <div class="security-note">
              <strong>Security Note:</strong> This invitation link will expire in 7 days. If you didn't expect this invitation, please ignore this email.
            </div>
            
            <p>Once you accept the invitation, you'll be able to:</p>
            <ul style="color: #4b5563; line-height: 2;">
              <li>Access the admin dashboard</li>
              <li>Manage products and inventory</li>
              <li>Process orders and customer requests</li>
              <li>View analytics and reports</li>
            </ul>
          </div>
          <div class="footer">
            <p>${COMPANY_NAME} Admin System</p>
            <p>${COMPANY_ADDRESS} • ${COMPANY_PHONE}</p>
            <p>If you have questions, please contact your administrator.</p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to: invitationDetails.email,
    subject: `Admin Invitation - ${COMPANY_NAME}`,
    html,
  });
}

// Welcome email for new CRM contacts
export async function sendWelcomeEmail(email: string, name?: string) {
  const baseUrl =
    process.env.CLIENT_URL ||
    (process.env.NODE_ENV === "production" && process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          line-height: 1.6;
          color: #333;
          background-color: #ffffff;
        }
        .email-wrapper {
          max-width: 600px;
          margin: 0 auto;
          background: #ffffff;
        }
        .header {
          background: #2c5530;
          padding: 40px 30px;
          text-align: center;
        }
        .logo {
          color: #ffffff;
          font-size: 28px;
          font-weight: 600;
          letter-spacing: -0.5px;
          margin: 0;
        }
        .hero-image {
          width: 100%;
          height: 300px;
          object-fit: cover;
          display: block;
        }
        .content {
          padding: 50px 40px;
        }
        .greeting {
          font-size: 24px;
          color: #1a1a1a;
          margin-bottom: 20px;
          font-weight: 500;
        }
        .intro {
          font-size: 16px;
          color: #666;
          line-height: 1.8;
          margin-bottom: 40px;
        }
        .divider {
          height: 1px;
          background: #e5e7eb;
          margin: 50px 0;
        }
        .section-title {
          font-size: 20px;
          color: #2c5530;
          margin-bottom: 15px;
          font-weight: 600;
        }
        .section-description {
          font-size: 15px;
          color: #666;
          line-height: 1.7;
          margin-bottom: 30px;
        }
        .product-grid {
          display: table;
          width: 100%;
          margin: 40px 0;
        }
        .product-item {
          display: table-cell;
          width: 50%;
          padding: 0 10px;
          vertical-align: top;
        }
        .product-image {
          width: 100%;
          height: 180px;
          object-fit: cover;
          border-radius: 8px;
          margin-bottom: 15px;
        }
        .product-name {
          font-size: 14px;
          color: #1a1a1a;
          font-weight: 500;
          text-align: center;
          margin-bottom: 5px;
        }
        .product-desc {
          font-size: 13px;
          color: #999;
          text-align: center;
        }
        .features {
          margin: 30px 0;
        }
        .feature {
          display: table;
          width: 100%;
          margin-bottom: 20px;
        }
        .feature-icon {
          display: table-cell;
          width: 40px;
          vertical-align: top;
          padding-top: 2px;
        }
        .feature-icon-circle {
          width: 24px;
          height: 24px;
          background: #2c5530;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-size: 12px;
        }
        .feature-text {
          display: table-cell;
          vertical-align: top;
          font-size: 15px;
          color: #666;
          line-height: 1.6;
        }
        .cta-container {
          text-align: center;
          margin: 50px 0;
          padding: 40px 30px;
          background: #f9fafb;
          border-radius: 8px;
        }
        .cta-title {
          font-size: 22px;
          color: #1a1a1a;
          margin-bottom: 12px;
          font-weight: 600;
        }
        .cta-subtitle {
          font-size: 15px;
          color: #999;
          margin-bottom: 30px;
        }
        .button {
          display: inline-block;
          background: #2c5530;
          color: #ffffff !important;
          padding: 14px 32px;
          text-decoration: none;
          border-radius: 6px;
          font-weight: 500;
          font-size: 15px;
          margin: 8px;
        }
        .button-outline {
          background: transparent;
          border: 2px solid #2c5530;
          color: #2c5530 !important;
          padding: 12px 30px;
        }
        .contact-section {
          padding: 40px 30px;
          background: #f9fafb;
          text-align: center;
        }
        .contact-title {
          font-size: 18px;
          color: #1a1a1a;
          margin-bottom: 20px;
          font-weight: 600;
        }
        .contact-details {
          font-size: 14px;
          color: #666;
          line-height: 2;
        }
        .contact-details a {
          color: #2c5530;
          text-decoration: none;
        }
        .footer {
          text-align: center;
          padding: 30px;
          background: #1a1a1a;
          color: #999;
          font-size: 13px;
        }
        .footer-brand {
          color: #fff;
          font-weight: 500;
          margin-bottom: 10px;
        }
        @media only screen and (max-width: 600px) {
          .content { padding: 40px 25px; }
          .greeting { font-size: 22px; }
          .hero-image { height: 220px; }
          .product-grid { display: block; }
          .product-item {
            display: block;
            width: 100%;
            padding: 0;
            margin-bottom: 30px;
          }
          .product-image { height: 200px; }
          .cta-container { padding: 30px 20px; }
          .button {
            display: block;
            margin: 8px 0;
            width: 100%;
          }
        }
      </style>
    </head>
    <body>
      <div class="email-wrapper">
        <!-- Header -->
        <div class="header">
          <h1 class="logo">Soil, Seed, and Water</h1>
        </div>

        <!-- Hero Image -->
        <img src="${baseUrl}/V2%20Hero%20Page%20Photo.png" alt="Premium Organic Soil" class="hero-image" />

        <!-- Main Content -->
        <div class="content">
          <h2 class="greeting">${name ? `Welcome, ${name}!` : "Welcome!"}</h2>

          <p class="intro">
            Thank you for connecting with us. We're excited to support your growing journey with premium organic soil amendments and professional gardening solutions.
          </p>

          <div class="divider"></div>

          <!-- Wholesale Section -->
          <h3 class="section-title">Organic Soil Wholesale</h3>
          <p class="section-description">
            Professional-grade bulk organic soil amendments for landscapers, contractors, and commercial growers.
          </p>

          <!-- Product Grid -->
          <div class="product-grid">
            <div class="product-item">
              <img src="${baseUrl}/dans-gold-batch-22.png" alt="Premium Worm Castings" class="product-image" />
              <div class="product-name">Premium Worm Castings</div>
              <div class="product-desc">Organic soil enhancement</div>
            </div>
            <div class="product-item">
              <img src="${baseUrl}/dans-gold-batch-24.png" alt="Dairy Compost" class="product-image" />
              <div class="product-name">Organic Dairy Compost</div>
              <div class="product-desc">Rich nutrient blend</div>
            </div>
          </div>

          <!-- Features -->
          <div class="features">
            <div class="feature">
              <div class="feature-icon">
                <div class="feature-icon-circle">✓</div>
              </div>
              <div class="feature-text">
                <strong>Bulk Pricing</strong> — Competitive rates on pallets, totes, and truckloads
              </div>
            </div>
            <div class="feature">
              <div class="feature-icon">
                <div class="feature-icon-circle">✓</div>
              </div>
              <div class="feature-text">
                <strong>Flexible Delivery</strong> — Scheduled delivery or convenient pickup
              </div>
            </div>
            <div class="feature">
              <div class="feature-icon">
                <div class="feature-icon-circle">✓</div>
              </div>
              <div class="feature-text">
                <strong>Professional Support</strong> — Dedicated account managers and product guidance
              </div>
            </div>
          </div>

          <div class="divider"></div>

          <!-- Retail Store Section -->
          <h3 class="section-title">Retail Store in Flagstaff</h3>
          <p class="section-description">
            Visit our local store for gardening supplies, seeds, expert advice, and everything you need to grow successfully.
          </p>

          <!-- CTA Section -->
          <div class="cta-container">
            <h3 class="cta-title">Ready to Get Growing?</h3>
            <p class="cta-subtitle">Explore our products and connect with our team</p>
            <a href="${baseUrl}/products" class="button">Browse Products</a>
            <a href="${baseUrl}/contact" class="button button-outline">Contact Us</a>
          </div>
        </div>

        <!-- Contact Section -->
        <div class="contact-section">
          <h4 class="contact-title">Get in Touch</h4>
          <div class="contact-details">
            <a href="${COMPANY_PHONE_TEL}">${COMPANY_PHONE}</a><br>
            <a href="mailto:ralvarez@soilseedandwater.com">ralvarez@soilseedandwater.com</a><br>
            Flagstaff, Arizona<br>
            Monday-Saturday, 7:00 AM - 5:00 PM
          </div>
        </div>

        <!-- Footer -->
        <div class="footer">
          <div class="footer-brand">Soil, Seed, and Water</div>
          Premium Organic Growing Solutions<br>
          © ${new Date().getFullYear()} All rights reserved
        </div>
      </div>
    </body>
    </html>
  `;

  const textVersion = `
SOIL, SEED, AND WATER

${name ? `Welcome, ${name}!` : "Welcome!"}

Thank you for connecting with us. We're excited to support your growing journey with premium organic soil amendments and professional gardening solutions.

ORGANIC SOIL WHOLESALE
Professional-grade bulk organic soil amendments for landscapers, contractors, and commercial growers.

✓ Bulk Pricing — Competitive rates on pallets, totes, and truckloads
✓ Flexible Delivery — Scheduled delivery or convenient pickup
✓ Professional Support — Dedicated account managers and product guidance

RETAIL STORE IN FLAGSTAFF
Visit our local store for gardening supplies, seeds, expert advice, and everything you need to grow successfully.

READY TO GET GROWING?
Browse Products: ${baseUrl}/products
Contact Us: ${baseUrl}/contact

GET IN TOUCH
Phone: ${COMPANY_PHONE}
Email: ralvarez@soilseedandwater.com
Location: Flagstaff, Arizona
Hours: Monday-Saturday, 7:00 AM - 5:00 PM

© ${new Date().getFullYear()} Soil, Seed, and Water - Premium Organic Growing Solutions
  `;

  return sendEmail({
    to: email,
    subject: `Welcome to Soil, Seed, and Water`,
    html,
    text: textVersion,
  });
}

// Follow-up email - Check in with customers
export async function sendFollowUpEmail(email: string, name?: string) {
  const baseUrl =
    process.env.CLIENT_URL ||
    (process.env.NODE_ENV === "production" && process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          line-height: 1.6;
          color: #333;
          background-color: #ffffff;
        }
        .email-wrapper {
          max-width: 580px;
          margin: 0 auto;
          background: #ffffff;
        }
        .header {
          background: #2c5530;
          padding: 35px 30px;
          text-align: center;
        }
        .logo {
          color: #ffffff;
          font-size: 24px;
          font-weight: 600;
          margin: 0;
        }
        .content {
          padding: 45px 35px;
        }
        .greeting {
          font-size: 22px;
          color: #1a1a1a;
          margin-bottom: 25px;
          font-weight: 500;
        }
        .message {
          font-size: 16px;
          color: #666;
          line-height: 1.8;
          margin-bottom: 25px;
        }
        .question-box {
          background: #f9fafb;
          padding: 30px;
          border-radius: 8px;
          margin: 35px 0;
          border-left: 4px solid #2c5530;
        }
        .question {
          font-size: 17px;
          color: #1a1a1a;
          font-weight: 500;
          margin-bottom: 15px;
        }
        .question-text {
          font-size: 15px;
          color: #666;
          line-height: 1.7;
        }
        .cta-container {
          text-align: center;
          margin: 40px 0;
        }
        .button {
          display: inline-block;
          background: #2c5530;
          color: #ffffff !important;
          padding: 14px 32px;
          text-decoration: none;
          border-radius: 6px;
          font-weight: 500;
          font-size: 15px;
          margin: 8px;
        }
        .help-section {
          background: #f9fafb;
          padding: 30px;
          border-radius: 8px;
          margin: 35px 0;
          text-align: center;
        }
        .help-title {
          font-size: 18px;
          color: #1a1a1a;
          margin-bottom: 12px;
          font-weight: 600;
        }
        .help-text {
          font-size: 15px;
          color: #666;
          margin-bottom: 20px;
        }
        .contact-link {
          color: #2c5530;
          text-decoration: none;
          font-weight: 500;
        }
        .signature {
          margin-top: 40px;
          padding-top: 30px;
          border-top: 1px solid #e5e7eb;
        }
        .signature-text {
          font-size: 15px;
          color: #666;
          line-height: 1.6;
        }
        .signature-name {
          font-weight: 600;
          color: #1a1a1a;
          margin-top: 8px;
        }
        .footer {
          text-align: center;
          padding: 25px;
          background: #f9fafb;
          color: #999;
          font-size: 13px;
          border-top: 1px solid #e5e7eb;
        }
        .footer-contact {
          color: #666;
          margin-top: 10px;
        }
        .footer-contact a {
          color: #2c5530;
          text-decoration: none;
        }
        @media only screen and (max-width: 600px) {
          .content { padding: 35px 25px; }
          .greeting { font-size: 20px; }
          .question-box { padding: 25px 20px; }
          .help-section { padding: 25px 20px; }
        }
      </style>
    </head>
    <body>
      <div class="email-wrapper">
        <div class="header">
          <h1 class="logo">Soil, Seed, and Water</h1>
        </div>

        <div class="content">
          <h2 class="greeting">${name ? `Hi ${name},` : "Hi there,"}</h2>

          <p class="message">
            We wanted to check in and see how your growing season is going!
          </p>

          <p class="message">
            Whether you're working on landscaping projects, managing a commercial operation, or tending to your garden, we'd love to hear about your progress and see if there's anything we can help with.
          </p>

          <div class="question-box">
            <div class="question">How are your projects coming along?</div>
            <div class="question-text">
              We're always here to provide guidance on soil amendments, product recommendations, or answer any questions you might have about getting the best results from your growing efforts.
            </div>
          </div>

          <p class="message">
            Our team has been helping growers throughout Arizona achieve amazing results with our premium organic soil amendments. We'd be happy to share some insights that might help you too.
          </p>

          <div class="help-section">
            <h3 class="help-title">Need Assistance?</h3>
            <p class="help-text">
              Have questions about products, pricing, or delivery? Our team is here to help.
            </p>
            <a href="${baseUrl}/contact" class="button">Get in Touch</a>
            <br><br>
            <span class="help-text">
              Or call us directly at <a href="${COMPANY_PHONE_TEL}" class="contact-link">${COMPANY_PHONE}</a>
            </span>
          </div>

          <p class="message">
            We appreciate your business and look forward to supporting your continued success!
          </p>

          <div class="signature">
            <p class="signature-text">
              Best regards,
            </p>
            <p class="signature-name">
              The Soil, Seed, and Water Team
            </p>
          </div>
        </div>

        <div class="footer">
          <div class="footer-contact">
            <a href="mailto:ralvarez@soilseedandwater.com">ralvarez@soilseedandwater.com</a><br>
            ${COMPANY_PHONE} • Flagstaff, Arizona
          </div>
          <p style="margin-top: 15px; font-size: 12px;">
            © ${new Date().getFullYear()} Soil, Seed, and Water. All rights reserved.
          </p>
        </div>
      </div>
    </body>
    </html>
  `;

  const textVersion = `
SOIL, SEED, AND WATER

${name ? `Hi ${name},` : "Hi there,"}

We wanted to check in and see how your growing season is going!

Whether you're working on landscaping projects, managing a commercial operation, or tending to your garden, we'd love to hear about your progress and see if there's anything we can help with.

HOW ARE YOUR PROJECTS COMING ALONG?
We're always here to provide guidance on soil amendments, product recommendations, or answer any questions you might have about getting the best results from your growing efforts.

Our team has been helping growers throughout Arizona achieve amazing results with our premium organic soil amendments. We'd be happy to share some insights that might help you too.

NEED ASSISTANCE?
Have questions about products, pricing, or delivery? Our team is here to help.

Contact us: ${baseUrl}/contact
Call us: ${COMPANY_PHONE}

We appreciate your business and look forward to supporting your continued success!

Best regards,
The Soil, Seed, and Water Team

---
ralvarez@soilseedandwater.com
${COMPANY_PHONE} • Flagstaff, Arizona
© ${new Date().getFullYear()} Soil, Seed, and Water
  `;

  return sendEmail({
    to: email,
    subject: `How are your projects going?`,
    html,
    text: textVersion,
  });
}

// Specialized email for avocado growers
export async function sendAvocadoGrowersEmail(email: string, name?: string) {
  const baseUrl =
    process.env.CLIENT_URL ||
    (process.env.NODE_ENV === "production" && process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          line-height: 1.6;
          color: #333;
          background-color: #ffffff;
        }
        .email-wrapper {
          max-width: 600px;
          margin: 0 auto;
          background: #ffffff;
        }
        .header {
          background: #2c5530;
          padding: 40px 30px;
          text-align: center;
        }
        .logo {
          color: #ffffff;
          font-size: 26px;
          font-weight: 600;
          margin: 0;
        }
        .tagline {
          color: #a7f3d0;
          font-size: 14px;
          margin-top: 8px;
        }
        .content {
          padding: 45px 35px;
        }
        .greeting {
          font-size: 24px;
          color: #1a1a1a;
          margin-bottom: 20px;
          font-weight: 500;
        }
        .intro {
          font-size: 16px;
          color: #666;
          line-height: 1.8;
          margin-bottom: 30px;
        }
        .highlight-box {
          background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%);
          padding: 30px;
          border-radius: 8px;
          margin: 35px 0;
          border-left: 4px solid #22c55e;
        }
        .highlight-title {
          font-size: 19px;
          color: #166534;
          font-weight: 600;
          margin-bottom: 15px;
        }
        .highlight-text {
          font-size: 15px;
          color: #15803d;
          line-height: 1.7;
        }
        .benefits-section {
          margin: 40px 0;
        }
        .section-title {
          font-size: 20px;
          color: #2c5530;
          margin-bottom: 20px;
          font-weight: 600;
        }
        .benefit-item {
          display: table;
          width: 100%;
          margin-bottom: 20px;
        }
        .benefit-icon {
          display: table-cell;
          width: 35px;
          vertical-align: top;
          padding-top: 3px;
        }
        .benefit-icon-circle {
          width: 20px;
          height: 20px;
          background: #22c55e;
          border-radius: 50%;
          display: inline-block;
        }
        .benefit-text {
          display: table-cell;
          vertical-align: top;
          font-size: 15px;
          color: #666;
          line-height: 1.7;
        }
        .benefit-text strong {
          color: #1a1a1a;
        }
        .cta-section {
          text-align: center;
          margin: 45px 0;
          padding: 40px 30px;
          background: #f9fafb;
          border-radius: 8px;
        }
        .cta-title {
          font-size: 22px;
          color: #1a1a1a;
          margin-bottom: 15px;
          font-weight: 600;
        }
        .cta-subtitle {
          font-size: 15px;
          color: #666;
          margin-bottom: 25px;
        }
        .button {
          display: inline-block;
          background: #2c5530;
          color: #ffffff !important;
          padding: 14px 32px;
          text-decoration: none;
          border-radius: 6px;
          font-weight: 500;
          font-size: 15px;
          margin: 8px;
        }
        .button-outline {
          background: transparent;
          border: 2px solid #2c5530;
          color: #2c5530 !important;
          padding: 12px 30px;
        }
        .expert-tip {
          background: #fef3c7;
          padding: 25px;
          border-radius: 8px;
          margin: 35px 0;
          border-left: 4px solid #f59e0b;
        }
        .tip-label {
          color: #92400e;
          font-weight: 600;
          font-size: 13px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 10px;
        }
        .tip-text {
          color: #78350f;
          font-size: 15px;
          line-height: 1.7;
        }
        .footer {
          text-align: center;
          padding: 30px;
          background: #1a1a1a;
          color: #999;
          font-size: 13px;
        }
        .footer-brand {
          color: #fff;
          font-weight: 500;
          margin-bottom: 10px;
        }
        @media only screen and (max-width: 600px) {
          .content { padding: 35px 25px; }
          .greeting { font-size: 22px; }
          .highlight-box { padding: 25px 20px; }
          .cta-section { padding: 30px 20px; }
          .button {
            display: block;
            margin: 8px 0;
            width: 100%;
          }
        }
      </style>
    </head>
    <body>
      <div class="email-wrapper">
        <div class="header">
          <h1 class="logo">Soil, Seed, and Water</h1>
          <p class="tagline">Premium Organic Solutions for Avocado Growers</p>
        </div>

        <div class="content">
          <h2 class="greeting">${name ? `Hi ${name},` : "Hello Avocado Grower,"}</h2>

          <p class="intro">
            Growing exceptional avocados requires more than just good weather and water—it starts with the right soil foundation. We specialize in providing premium organic soil amendments specifically formulated to help avocado orchards thrive.
          </p>

          <div class="highlight-box">
            <div class="highlight-title">Why Avocado Trees Love Our Organic Amendments</div>
            <div class="highlight-text">
              Avocados need well-draining, nutrient-rich soil with the right microbial balance. Our organic worm castings and dairy compost deliver exactly that—improving soil structure, enhancing water retention, and providing slow-release nutrients that support healthy root development and consistent fruit production.
            </div>
          </div>

          <div class="benefits-section">
            <h3 class="section-title">Perfect for Avocado Orchards</h3>

            <div class="benefit-item">
              <div class="benefit-icon">
                <span class="benefit-icon-circle"></span>
              </div>
              <div class="benefit-text">
                <strong>Improved Drainage & Aeration</strong> — Essential for preventing root rot in avocado trees
              </div>
            </div>

            <div class="benefit-item">
              <div class="benefit-icon">
                <span class="benefit-icon-circle"></span>
              </div>
              <div class="benefit-text">
                <strong>Enhanced Nutrient Availability</strong> — Slow-release organic nutrition for consistent growth and fruiting
              </div>
            </div>

            <div class="benefit-item">
              <div class="benefit-icon">
                <span class="benefit-icon-circle"></span>
              </div>
              <div class="benefit-text">
                <strong>Beneficial Microorganisms</strong> — Living soil biology that supports tree health and disease resistance
              </div>
            </div>

            <div class="benefit-item">
              <div class="benefit-icon">
                <span class="benefit-icon-circle"></span>
              </div>
              <div class="benefit-text">
                <strong>pH Balance</strong> — Helps maintain the slightly acidic soil conditions avocados prefer (6.0-6.5 pH)
              </div>
            </div>

            <div class="benefit-item">
              <div class="benefit-icon">
                <span class="benefit-icon-circle"></span>
              </div>
              <div class="benefit-text">
                <strong>Bulk Availability</strong> — Perfect for orchards of all sizes, from backyard groves to commercial operations
              </div>
            </div>
          </div>

          <div class="expert-tip">
            <div class="tip-label">🌱 Expert Tip</div>
            <div class="tip-text">
              Apply our organic compost around the drip line of your avocado trees 2-3 times per year. This supports the feeder roots where the tree absorbs most of its nutrients and water, leading to healthier trees and better yields.
            </div>
          </div>

          <p class="intro">
            Whether you're managing a commercial avocado operation or tending to a few backyard trees, we have the right products and expertise to help you succeed.
          </p>

          <div class="cta-section">
            <h3 class="cta-title">Ready to Enhance Your Orchard?</h3>
            <p class="cta-subtitle">Get wholesale pricing and delivery options</p>
            <a href="${baseUrl}/products" class="button">View Products</a>
            <a href="${baseUrl}/contact" class="button button-outline">Request Quote</a>
          </div>

          <p class="intro" style="text-align: center;">
            <strong>Questions about application rates or products?</strong><br>
            Call us at ${COMPANY_PHONE} — We're here to help your avocados thrive.
          </p>
        </div>

        <div class="footer">
          <div class="footer-brand">Soil, Seed, and Water</div>
          Premium Organic Growing Solutions<br>
          Flagstaff, Arizona • ${COMPANY_PHONE}<br>
          © ${new Date().getFullYear()} All rights reserved
        </div>
      </div>
    </body>
    </html>
  `;

  const textVersion = `
SOIL, SEED, AND WATER
Premium Organic Solutions for Avocado Growers

${name ? `Hi ${name},` : "Hello Avocado Grower,"}

Growing exceptional avocados requires more than just good weather and water—it starts with the right soil foundation. We specialize in providing premium organic soil amendments specifically formulated to help avocado orchards thrive.

WHY AVOCADO TREES LOVE OUR ORGANIC AMENDMENTS
Avocados need well-draining, nutrient-rich soil with the right microbial balance. Our organic worm castings and dairy compost deliver exactly that—improving soil structure, enhancing water retention, and providing slow-release nutrients that support healthy root development and consistent fruit production.

PERFECT FOR AVOCADO ORCHARDS
• Improved Drainage & Aeration — Essential for preventing root rot in avocado trees
• Enhanced Nutrient Availability — Slow-release organic nutrition for consistent growth and fruiting
• Beneficial Microorganisms — Living soil biology that supports tree health and disease resistance
• pH Balance — Helps maintain the slightly acidic soil conditions avocados prefer (6.0-6.5 pH)
• Bulk Availability — Perfect for orchards of all sizes, from backyard groves to commercial operations

🌱 EXPERT TIP
Apply our organic compost around the drip line of your avocado trees 2-3 times per year. This supports the feeder roots where the tree absorbs most of its nutrients and water, leading to healthier trees and better yields.

Whether you're managing a commercial avocado operation or tending to a few backyard trees, we have the right products and expertise to help you succeed.

READY TO ENHANCE YOUR ORCHARD?
View Products: ${baseUrl}/products
Request Quote: ${baseUrl}/contact

Questions about application rates or products?
Call us at ${COMPANY_PHONE} — We're here to help your avocados thrive.

---
SOIL, SEED, AND WATER
Premium Organic Growing Solutions
Flagstaff, Arizona • ${COMPANY_PHONE}
© ${new Date().getFullYear()} All rights reserved
  `;

  return sendEmail({
    to: email,
    subject: `Premium Organic Solutions for Your Avocado Orchard`,
    html,
    text: textVersion,
  });
}

// Re-export additional notification functions
export { sendAdminContactFormNotification, sendAdminQuoteRequestNotification, sendAdminSpecialRequestNotification } from "./emailNotifications.js";
