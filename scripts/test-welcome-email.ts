/**
 * Test script for Welcome Email
 * Run: npx tsx scripts/test-welcome-email.ts
 */

import dotenv from 'dotenv';
import { sendWelcomeEmail } from '../server/services/email.js';

// Load environment variables
dotenv.config();

async function testWelcomeEmail() {
  console.log('🌱 Testing Welcome Email for CRM...\n');

  // Check if API key is set
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('❌ ERROR: RESEND_API_KEY environment variable is not set!');
    console.log('\n📝 To set it up:');
    console.log('1. Create a .env file in the root directory');
    console.log('2. Add: RESEND_API_KEY=your_api_key_here');
    console.log('3. Make sure the API key is for the verified domain: bettersystems.ai');
    process.exit(1);
  }

  console.log('✅ RESEND_API_KEY is set');
  console.log('✅ FROM email: soilseedandwater@bettersystems.ai\n');

  // Test recipients
  const testRecipients = [
    { email: 'mike.mcmahon@agave-inc.com', name: 'Mike McMahon' },
    { email: 'rodolfodavid110@gmail.com', name: 'Rodolfo Alvarez' }
  ];

  try {
    console.log('📧 Sending welcome emails to test recipients...\n');

    for (const recipient of testRecipients) {
      console.log(`   Sending to: ${recipient.name} <${recipient.email}>`);

      await sendWelcomeEmail(recipient.email, recipient.name);

      console.log(`   ✅ Sent successfully to ${recipient.email}\n`);
    }

    console.log('\n🎉 All welcome emails sent successfully!\n');
    console.log('📬 Please check the following inboxes:');
    testRecipients.forEach(r => {
      console.log(`   • ${r.email}`);
    });
    console.log('   (Also check spam/junk folders if not received)\n');
    console.log('✨ Welcome email template is working perfectly!');

  } catch (error: any) {
    console.error('\n❌ Failed to send welcome email:', error.message);
    console.log('\n🔍 Troubleshooting:');
    console.log('1. Verify RESEND_API_KEY is correct in your .env file');
    console.log('2. Check that bettersystems.ai domain is verified in Resend');
    console.log('3. Ensure soilseedandwater@bettersystems.ai is added as a verified sender');
    console.log('4. Check Resend dashboard for any domain verification issues');
    console.log('5. Verify recipient email addresses are valid');
    process.exit(1);
  }
}

testWelcomeEmail().catch(console.error);
