/**
 * Quick test script to verify email configuration
 * Run: npx tsx scripts/test-email-setup.ts
 */

import dotenv from 'dotenv';
import { sendEmail } from '../server/services/email.js';

// Load environment variables
dotenv.config();

async function testEmailSetup() {
  console.log('🧪 Testing Email Configuration...\n');
  
  // Check if API key is set
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('❌ ERROR: RESEND_API_KEY environment variable is not set!');
    console.log('\n📝 To set it up:');
    console.log('1. Create a .env file in the root directory (or server/.env)');
    console.log('2. Add: RESEND_API_KEY=your_new_api_key_here');
    console.log('3. Make sure the API key is for the verified domain: bettersystems.ai');
    process.exit(1);
  }
  
  console.log('✅ RESEND_API_KEY is set');
  console.log('✅ FROM email: soilseedandwater@bettersystems.ai\n');
  
  try {
    console.log('📧 Sending test email...');
    
    await sendEmail({
      to: 'ralvarez@soilseedandwater.com',
      subject: 'Test Email - Email Configuration Verified',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #2c5530; color: white; padding: 20px; text-align: center; }
            .content { padding: 30px; background-color: #f9f9f9; }
            .success { background-color: #d4edda; color: #155724; padding: 15px; border-radius: 5px; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Email Configuration Test</h1>
            </div>
            <div class="content">
              <div class="success">
                <strong>✅ Success!</strong><br>
                Your email system is properly configured and working.
              </div>
              <p>This is a test email to verify that automated email notifications are set up correctly.</p>
              <p><strong>Configuration Details:</strong></p>
              <ul>
                <li>From: soilseedandwater@bettersystems.ai</li>
                <li>Domain: bettersystems.ai</li>
                <li>Service: Resend</li>
              </ul>
              <p>All automated notifications (orders, arrivals, leads, etc.) will now be sent from this address.</p>
              <p><em>Sent at: ${new Date().toLocaleString()}</em></p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: 'Email Configuration Test - Your email system is properly configured and working. All automated notifications will now be sent from soilseedandwater@bettersystems.ai',
    });
    
    console.log('✅ Test email sent successfully!\n');
    console.log('📬 Please check your inbox at: ralvarez@soilseedandwater.com');
    console.log('   (Also check spam/junk folder if not received)\n');
    console.log('🎉 Email configuration is complete and ready to use!');
    
  } catch (error: any) {
    console.error('❌ Failed to send test email:', error.message);
    console.log('\n🔍 Troubleshooting:');
    console.log('1. Verify RESEND_API_KEY is correct in your .env file');
    console.log('2. Check that bettersystems.ai domain is verified in Resend');
    console.log('3. Ensure soilseedandwater@bettersystems.ai is a verified sender');
    console.log('4. Check Resend dashboard for any domain verification issues');
    process.exit(1);
  }
}

testEmailSetup().catch(console.error);



