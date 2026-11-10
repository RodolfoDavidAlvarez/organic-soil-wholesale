import nodemailer from "nodemailer";
import dotenv from "dotenv";
dotenv.config();

// Test email configuration
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER || "ralvarez@bettersystems.ai",
    pass: process.env.GMAIL_APP_PASSWORD || process.env.GMAIL_PASSWORD,
  },
});

// Test email sending
const mailOptions = {
  from: "Organic Soil Wholesale <soilseedandwater@bettersystems.ai>",
  to: "ralvarez@soilseedandwater.com",
  subject: "Test Email - Organic Soil Wholesale Lead Notification",
  html: `
    <h1>Test Email</h1>
    <p>This is a test email to verify email functionality for Organic Soil Wholesale.</p>
    <p>If you receive this email, the email system is working correctly.</p>
    <p>Time: ${new Date().toLocaleString()}</p>
  `,
};

transporter.sendMail(mailOptions, (error, info) => {
  if (error) {
    console.log("Email send error:", error);
  } else {
    console.log("Email sent successfully:", info.messageId);
    console.log("Response:", info.response);
  }
});
