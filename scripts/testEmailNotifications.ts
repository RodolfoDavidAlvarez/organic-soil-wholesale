import dotenv from 'dotenv';
import { sendAdminOrderNotification, sendAdminArrivalNotification, sendAdminTriviaLeadNotification } from '../server/services/email.js';

// Load environment variables
dotenv.config();

// Test data
const testOrderData = {
  orderNumber: 'TEST-001',
  customerName: 'Test Customer',
  customerEmail: 'test@example.com',
  customerPhone: '(555) 123-4567',
  orderType: 'pay_and_pickup',
  items: [
    { name: 'Premium Organic Soil', quantity: 5, price: 250.00, size: '1 Cubic Yard' },
    { name: 'Organic Compost', quantity: 3, price: 150.00, size: '1/2 Cubic Yard' }
  ],
  subtotal: 400.00,
  tax: 32.00,
  total: 432.00,
  deliveryMethod: 'Pickup',
  pickupLocation: 'Phoenix Warehouse',
  estimatedReadyTime: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), // 2 hours from now
  notes: 'Please have ready by 2pm. Customer will call when arriving.'
};

const testArrivalData = {
  customerName: 'John Smith',
  customerPhone: '(555) 987-6543',
  vehicleInfo: 'White Ford F-150',
  arrivalTime: new Date().toISOString(),
  notificationId: 12345
};

const testTriviaLeadData = {
  name: 'Jane Gardener',
  email: 'jane@gardencompany.com',
  interests: ['Organic Growing', 'Commercial Landscaping', 'Bulk Orders', 'Sustainable Practices'],
  score: 4,
  answers: {
    q1: 'correct',
    q2: 'correct',
    q3: 'incorrect',
    q4: 'correct',
    q5: 'correct'
  },
  submittedAt: new Date().toISOString()
};

async function testEmails() {
  console.log('Testing email notifications...\n');
  console.log('Note: Adding 1 second delay between emails to avoid rate limiting\n');

  try {
    // Test 1: Order Notification
    console.log('1. Testing Order Notification Email...');
    await sendAdminOrderNotification(testOrderData);
    console.log('✓ Order notification sent successfully\n');
  } catch (error) {
    console.error('✗ Order notification failed:', error, '\n');
  }

  // Wait 1 second to avoid rate limiting
  await new Promise(resolve => setTimeout(resolve, 1000));

  try {
    // Test 2: Arrival Notification
    console.log('2. Testing Arrival Notification Email...');
    await sendAdminArrivalNotification(testArrivalData);
    console.log('✓ Arrival notification sent successfully\n');
  } catch (error) {
    console.error('✗ Arrival notification failed:', error, '\n');
  }

  // Wait 1 second to avoid rate limiting
  await new Promise(resolve => setTimeout(resolve, 1000));

  try {
    // Test 3: Trivia Lead Notification
    console.log('3. Testing Trivia Lead Notification Email...');
    await sendAdminTriviaLeadNotification(testTriviaLeadData);
    console.log('✓ Trivia lead notification sent successfully\n');
  } catch (error) {
    console.error('✗ Trivia lead notification failed:', error, '\n');
  }

  console.log('Email notification tests complete!');
  console.log(`All emails should have been sent to: ralvarez@soilseedandwater.com`);
  console.log('From: soilseedandwater@bettersystems.ai');
  console.log('\nIf you do not receive the emails, please check:');
  console.log('1. Spam/Junk folder');
  console.log('2. That the domain bettersystems.ai is properly configured in Resend');
  console.log('3. That soilseedandwater@bettersystems.ai is a verified sender in Resend');
  console.log('4. That RESEND_API_KEY environment variable is set with your new API key');
}

// Run the tests
testEmails().catch(console.error);