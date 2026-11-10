import { Router } from 'express';
import { supabase } from '../supabaseClient.js';
import Stripe from 'stripe';
import { Resend } from 'resend';
import { guardResend, sswFrom } from '../../shared/sswEmailFrom.js';

const router = Router();

// POST /stripe — handle Stripe webhook for deposit payments
router.post('/stripe', async (req, res) => {
  try {
    let event = req.body;
    const sig = req.headers['stripe-signature'] as string | undefined;
    if (process.env.STRIPE_WEBHOOK_SECRET && sig) {
      try {
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
        event = stripe.webhooks.constructEvent(
          typeof req.body === 'string' ? req.body : JSON.stringify(req.body),
          sig,
          process.env.STRIPE_WEBHOOK_SECRET
        );
      } catch (err: any) {
        console.error('Webhook signature verification failed:', err.message);
        return res.status(400).json({ error: 'Invalid signature' });
      }
    }

    if (!event || !event.type) return res.status(400).json({ error: 'Invalid event' });

    if (event.type === 'checkout.session.completed') {
      const session = event.data?.object;
      const orderId = session?.metadata?.order_id;

      if (orderId && session?.metadata?.type === 'deposit') {
        await supabase.from('orders').update({
          deposit_paid: true,
          deposit_paid_at: new Date().toISOString(),
          stripe_payment_intent_id: session.payment_intent || null,
          updated_at: new Date().toISOString(),
        }).eq('id', parseInt(orderId));

        await supabase.from('order_status_history').insert({
          order_id: parseInt(orderId),
          old_status: 'pending',
          new_status: 'deposit_paid',
          notes: `Deposit paid via Stripe. Payment Intent: ${session.payment_intent || 'N/A'}`,
        });

        // Notify Rodo via SMS
        try {
          // Twilio is optional in the legacy Express server. Keep the import
          // indirect so the Vercel API is not activated by a server-only fix.
          const twilioModuleName: string = 'twilio';
          const twilio = (await import(twilioModuleName)).default;
          const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!);
          const { data: order } = await supabase.from('orders').select('order_number, customer_name, deposit_amount').eq('id', parseInt(orderId)).single();
          if (order) {
            await twilioClient.messages.create({
              body: `Deposit paid! Order #${order.order_number?.slice(0, 8)} - $${order.deposit_amount} from ${order.customer_name}`,
              from: process.env.TWILIO_PHONE_NUMBER!,
              to: process.env.RODO_PHONE!,
            });
          }
        } catch (smsErr) {
          console.error('SMS notification error:', smsErr);
        }

        // Send confirmation email
        try {
          const { data: order } = await supabase.from('orders').select('*').eq('id', parseInt(orderId)).single();
          if (order) {
            const resend = guardResend(new Resend(process.env.RESEND_API_KEY));
            await resend.emails.send({
              from: sswFrom('Organic Soil Wholesale'),
              replyTo: 'ralvarez@soilseedandwater.com',
              to: order.customer_email || order.email,
              subject: `Deposit confirmed - Order #${order.order_number?.slice(0, 8) || order.id}`,
              html: `<p>Hi ${order.customer_name || 'there'},</p>
                <p>Your deposit of <strong>$${order.deposit_amount}</strong> has been received for Order #${order.order_number?.slice(0, 8) || order.id}.</p>
                <p>We'll notify you when your order is ready for ${order.fulfillment_type === 'delivery' ? 'delivery' : 'pickup'}.</p>
                <p>Thanks,<br>Rodo Alvarez<br>Soil Seed & Water</p>`,
            });
          }
        } catch (emailErr) {
          console.error('Deposit confirmation email error:', emailErr);
        }
      }
    }

    res.json({ received: true });
  } catch (err) {
    console.error('Webhook error:', err);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

export default router;
