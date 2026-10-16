import { deliveryPriceChanged, deliveryRateDescription } from "../../shared/deliveryPricing.js";
import { Router } from 'express';
import Stripe from 'stripe';
import { supabase } from '../db/supabase.js';
import { sendAdminOrderNotification, sendPurchaseThankYouEmail } from '../services/email.js';
import { assignSswNumberForPurchase } from '../../shared/sswNumber.js';
import { forwardPickupOrderToMos } from '../services/forwardPickupOrderToMos.js';
import { quoteTrucking } from './quoteRequests.js';
import {
  formatReadyLabel,
  PHOENIX_BULK_MAX_TONS,
  PICKUP_LOCATIONS,
  resolveCheckoutPickupTime,
  TONS_PER_CU_YD,
} from '../../shared/pickupSchedule.js';
import { applyFullFlatbedProductDiscount, requiresPickupHeadsUp } from '../../shared/flatbedSpots.js';
import { normalizeV5CheckoutItems } from '../../shared/oswPricing.js';
import { nonBundleProductSubtotal, resolvePromoBundle } from '../../shared/promoBundles.js';
import {
  cartAllowsPhoenixYardPickup,
  PHOENIX_YARD_PICKUP_BLOCKED_MESSAGE,
} from '../../shared/phoenixYardPickup.js';

const router = Router();

// Initialize Stripe lazily to ensure env vars are loaded
let stripe: Stripe;

function getStripe() {
  if (!stripe) {
    if (!process.env.STRIPE_SECRET_KEY) {
      console.warn('STRIPE_SECRET_KEY not configured - payments will not work');
      throw new Error('Stripe is not configured');
    }
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2025-08-27.basil',
    });
  }
  return stripe;
}

// Create checkout session
router.post('/create-session', async (req, res) => {
  try {
    const {
      items: rawItems,
      customerInfo,
      locationId,
      isQuickOrder,
      discountCode,
      fulfillmentType,
      deliveryAddress,
      deliveryQuote,
      pickupLocation,
      brand_id,
    } = req.body;
    const orderBrandId = brand_id === 'regenerative_landscaper_supply' ? brand_id : 'organic_soil_wholesale';
    let { pickupTime, pickupMode } = req.body;

    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      return res.status(400).json({ error: 'No items to check out' });
    }

    // Canonical V5 prices first, then the additional full-flatbed discount.
    let canonicalItems;
    try {
      canonicalItems = normalizeV5CheckoutItems(rawItems);
    } catch (pricingError: any) {
      return res.status(400).json({ error: pricingError?.message || 'Unsupported product format' });
    }
    const flatbedPricing = applyFullFlatbedProductDiscount(canonicalItems);
    const items = flatbedPricing.items;

    const isDelivery = fulfillmentType === 'delivery';
    const checkoutLocationId = locationId || 1;
    const pickupSite = PICKUP_LOCATIONS.find((loc: any) => loc.locationId === checkoutLocationId)
      || PICKUP_LOCATIONS.find((loc: any) => typeof pickupLocation === 'string' && pickupLocation.toLowerCase().includes(loc.id))
      || PICKUP_LOCATIONS[0];
    const bulkPickupTons = items.reduce((sum: number, item: any) => {
      const size = String(item.sizeOption || '').toLowerCase();
      const unit = String(item.unit || '').toLowerCase();
      if (!size.includes('bulk')) return sum;
      return sum + (unit.includes('ton') || size.includes('ton') ? Number(item.quantity || 0) : Number(item.quantity || 0) * TONS_PER_CU_YD);
    }, 0);
    const isPhoenixBulkPickup = pickupSite?.id === 'phoenix' && bulkPickupTons > 0;

    if (!isDelivery) {
      if (pickupSite?.id === 'phoenix' && !cartAllowsPhoenixYardPickup(items)) {
        return res.status(400).json({
          error: PHOENIX_YARD_PICKUP_BLOCKED_MESSAGE,
        });
      }
      if (isPhoenixBulkPickup && bulkPickupTons > PHOENIX_BULK_MAX_TONS) {
        return res.status(400).json({
          error: `Phoenix bulk pickup is limited to ${PHOENIX_BULK_MAX_TONS} tons. Choose Congress pickup or delivery.`,
        });
      }
      const needsHeadsUp = requiresPickupHeadsUp(items);
      const hasBulkPickup = bulkPickupTons > 0;
      const resolved = resolveCheckoutPickupTime({
        pickupMode,
        pickupTime,
        allowAsap: isPhoenixBulkPickup
          ? pickupSite?.bulkAllowAsap !== false
          : hasBulkPickup
            ? pickupSite?.bulkAllowAsap !== false
            : needsHeadsUp
              ? false
              : pickupSite?.allowAsap !== false,
        minLeadDays: isPhoenixBulkPickup ? pickupSite?.bulkMinLeadDays || 7 : pickupSite?.minLeadDays || 0,
      });
      if (!resolved.ok) {
        return res.status(400).json({ error: resolved.message });
      }
      pickupTime = resolved.pickupAtIso;
    }

    // Discount handling — extend here as real codes get added.
    // TEST = 100% off (free order, skips Stripe). Reserved for QA only.
    const normalizedDiscount = typeof discountCode === 'string' ? discountCode.trim().toUpperCase() : null;
    let discountPercent = 0;
    if (normalizedDiscount === 'TEST') discountPercent = 100;

    let truckingQuote: Awaited<ReturnType<typeof quoteTrucking>> | null = null;
    const preferredDeliveryDate = isDelivery && typeof deliveryAddress?.preferredDate === 'string'
      ? deliveryAddress.preferredDate.trim()
      : '';
    const preferredDeliveryDateEnd = isDelivery && typeof deliveryAddress?.preferredDateEnd === 'string'
      ? deliveryAddress.preferredDateEnd.trim()
      : '';
    const preferredDeliveryWindow = isDelivery && typeof deliveryAddress?.preferredWindow === 'string'
      ? deliveryAddress.preferredWindow.trim()
      : '';
    const availabilityLabel = preferredDeliveryDate && preferredDeliveryDateEnd && preferredDeliveryDate !== preferredDeliveryDateEnd
      ? `${preferredDeliveryDate} → ${preferredDeliveryDateEnd}`
      : preferredDeliveryDate;

    if (isDelivery) {
      const deliveryZip = typeof deliveryAddress?.zip === 'string' ? deliveryAddress.zip.trim() : '';
      if (!/^\d{5}$/.test(deliveryZip)) {
        return res.status(400).json({ error: 'Delivery ZIP is required (5 digits)' });
      }

      try {
        truckingQuote = await quoteTrucking({
          items,
          zip: deliveryZip,
          roughAccess: !!deliveryAddress?.roughAccess,
          originKey: deliveryAddress?.originKey,
        });
      } catch (error) {
        return res.status(400).json({
          error: `Could not price delivery: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
      if (deliveryPriceChanged(deliveryQuote, truckingQuote)) {
        return res.status(409).json({ error: 'Your delivery estimate has changed. Review the updated total before continuing.', repricedDelivery: truckingQuote });
      }
    }

    const customerNotes = [
      orderBrandId === 'regenerative_landscaper_supply' ? 'Source brand: Regenerative Landscaper Supply (regenerativelandscapersupply.com)' : null,
      customerInfo?.customerCategory ? `Customer type: ${customerInfo.customerCategory}` : null,
      customerInfo?.company ? `Company/farm: ${customerInfo.company}` : null,
      typeof customerInfo?.marketingOptIn === 'boolean' ? `Marketing contact list: ${customerInfo.marketingOptIn ? 'yes' : 'no'}` : null,
      normalizedDiscount && discountPercent > 0 ? `Discount applied: ${normalizedDiscount} (-${discountPercent}%)` : null,
      flatbedPricing.applied
        ? `Full flatbed (22 spots): 10% product discount (−$${flatbedPricing.discountAmount.toFixed(2)})`
        : null,
      isDelivery && deliveryAddress ? `Delivery to: ${[deliveryAddress.street, deliveryAddress.city, deliveryAddress.state, deliveryAddress.zip].filter(Boolean).join(', ')}` : null,
      isDelivery && truckingQuote ? `Delivery: ${truckingQuote.truckLabel}, ~${truckingQuote.hoursRoundTrip} hr round-trip from ${truckingQuote.originLabel} ($${truckingQuote.costDollars})` : null,
      isDelivery && availabilityLabel ? `Customer availability: ${availabilityLabel}${preferredDeliveryWindow ? ` · ${preferredDeliveryWindow}` : ''}` : null,
      deliveryAddress?.roughAccess ? 'Site access: hard-to-reach / off-pavement (+20% modifier applied)' : null,
      // Semi-truck access: only call out the negative case. Customer opted out
      // of the pre-checked semi-access question, so we MUST call before dispatch.
      isDelivery && deliveryAddress?.semiAccess === false ? 'SEMI-TRUCK ACCESS: customer says NOT enough room — call before dispatching.' : null,
      !isDelivery && pickupLocation ? `Pickup at: ${pickupLocation}` : null,
      items.some((item: any) => resolvePromoBundle(item))
        ? 'Includes already-priced Phoenix pickup garden bundle (no extra percent off that line).'
        : null,
      customerInfo?.notes ? `Customer notes: ${customerInfo.notes}` : null,
    ].filter(Boolean).join('\n');

    // Validate inventory availability — skipped on TEST discount so QA flows don't
    // get blocked by zero inventory rows in dev.
    if (discountPercent < 100) {
      const inventoryChecks = await Promise.all(
        items.map(async (item: any) => {
          if (resolvePromoBundle(item)) {
            return {
              productId: item.productId,
              requested: item.quantity,
              available: item.quantity,
              canFulfill: true,
            };
          }
          const { data } = await supabase
            .from('inventory')
            .select('quantity_available')
            .eq('product_id', item.productId)
            .eq('location_id', checkoutLocationId)
            .eq('size_option', item.sizeOption)
            .single();

          return {
            productId: item.productId,
            requested: item.quantity,
            available: data?.quantity_available || 0,
            // Treat missing inventory rows as "ok to sell" — many products don't
            // have per-size inventory rows yet but are still actively offered.
            canFulfill: data == null ? true : (data.quantity_available ?? 0) >= item.quantity,
          };
        })
      );

      const unavailableItems = inventoryChecks.filter(check => !check.canFulfill);
      if (unavailableItems.length > 0) {
        return res.status(400).json({
          error: 'Some items are not available',
          unavailableItems
        });
      }
    }

    // Total in cents — `orders.total` is integer (legacy schema stores cents)
    const productSubtotalDollars = items.reduce((sum: number, item: any) => sum + (item.price * item.quantity), 0);
    const truckingDollars = isDelivery && truckingQuote ? truckingQuote.costDollars : 0;
    const rawSubtotal = productSubtotalDollars + truckingDollars;
    const discountBase = discountPercent === 100
      ? rawSubtotal
      : nonBundleProductSubtotal(items);
    const totalDollars = Math.max(0, rawSubtotal - discountBase * (discountPercent / 100));
    const totalCents = Math.round(totalDollars * 100);
    const isFreeOrder = totalCents === 0 && discountPercent > 0;

    // Create order in database with pending status
    const orderData: any = {
      brand_id: orderBrandId,
      email: customerInfo.email || null,
      phone: customerInfo.phone,
      status: 'pending_payment',
      payment_status: 'pending',
      delivery_type: isDelivery ? 'delivery' : 'pickup',
      fulfillment_type: isDelivery ? 'delivery' : 'pickup',
      pickup_scheduled_at: isDelivery ? null : (pickupTime || null),
      subtotal: totalCents,
      total: totalCents,
      total_amount: totalDollars,
      location_id: checkoutLocationId,
      pickup_location: !isDelivery && pickupLocation ? pickupLocation : null,
      customer_name: customerInfo.name || customerInfo.businessName || null,
      customer_email: customerInfo.email || null,
      notes: customerNotes || null,
      address: isDelivery && deliveryAddress
        ? [deliveryAddress.street, deliveryAddress.city, deliveryAddress.state, deliveryAddress.zip].filter(Boolean).join(', ')
        : null,
      delivery_address_json: isDelivery && deliveryAddress
        ? {
            line1: deliveryAddress.street || null,
            street: deliveryAddress.street || null,
            city: deliveryAddress.city || null,
            state: deliveryAddress.state || null,
            zip: deliveryAddress.zip || null,
            roughAccess: !!deliveryAddress.roughAccess,
            semiAccess: deliveryAddress.semiAccess !== false,
            originKey: deliveryAddress.originKey || null,
            availabilityFrom: preferredDeliveryDate || null,
            availabilityTo: preferredDeliveryDateEnd || preferredDeliveryDate || null,
            preferredWindow: preferredDeliveryWindow || null,
            availabilityPreset: deliveryAddress.availabilityPreset || null,
          }
        : null,
      preferred_date: isDelivery && preferredDeliveryDate ? preferredDeliveryDate : null,
      preferred_time_start: isDelivery && preferredDeliveryWindow ? preferredDeliveryWindow : null,
      preferred_time_end: null,
      // Legacy NOT NULL JSONB column — mirror line items here too
      order_items: items.map((item: any) => ({
        product_id: item.productId,
        name: item.name,
        size: item.sizeOption,
        unit: item.unit || null,
        quantity: item.quantity,
        price: item.price,
        list_price: item.listUnitPrice ?? item.price,
        savings: (item.savingsPerUnit || 0) * item.quantity,
        discount_percent: item.discountPercent || 0,
        units_per_pallet: item.unitsPerPallet || null,
        total: item.price * item.quantity,
      })),
    };

    // business_name is NOT NULL in legacy schema — always provide a display name.
    orderData.business_name =
      customerInfo.company ||
      customerInfo.businessName ||
      customerInfo.name ||
      "OSW Customer";
    orderData.order_type = isDelivery ? "delivery" : isQuickOrder ? "pickup" : "regular";

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert(orderData)
      .select()
      .single();

    if (orderError) throw orderError;

    // Create order items
    const orderItems = items.map((item: any) => ({
      order_id: order.id,
      product_id: item.productId,
      quantity: item.quantity,
      unit_price: item.price,
      total_price: item.price * item.quantity,
      size_option: item.sizeOption,
      status: 'pending'
    }));

    const { error: itemsError } = await supabase
      .from('order_items')
      .insert(orderItems);

    if (itemsError) throw itemsError;

    // Free order path — skip Stripe entirely. Mark the order paid and fan out to
    // MOS so yard reps see the test order in the iOS sales portal exactly like a
    // real paid order. Customer/admin email sends and inventory reservation
    // happen later via the same payment-success flow that the webhook triggers.
    if (isFreeOrder) {
      await supabase
        .from('orders')
        .update({
          status: 'paid',
          payment_status: 'paid',
          paid_at: new Date().toISOString(),
        })
        .eq('id', order.id);

      // Fan out to MOS pickup-orders so yard reps get the push notification.
      forwardPickupOrderToMos({
        osw_order_id: order.id,
        osw_order_number: order.order_number || undefined,
        customer_name: customerInfo?.name || customerInfo?.company || 'Test Customer',
        customer_phone: customerInfo?.phone || '',
        customer_email: customerInfo?.email || undefined,
        items: items.map((item: any) => ({
          product_id: item.productId,
          product_name: item.name,
          size_option: [item.sizeOption, item.unit].filter(Boolean).join(' · '),
          quantity: item.quantity || 1,
          unit_price_cents: Math.round((item.price || 0) * 100),
          total_price_cents: Math.round((item.price || 0) * (item.quantity || 1) * 100),
        })),
        pickup_at: isDelivery ? undefined : (pickupTime || new Date().toISOString()),
        slot_label: !isDelivery && pickupTime ? formatReadyLabel(pickupTime, { includeDate: true }) : undefined,
        total_cents: 0,
        payment_status: 'paid',
        source: isDelivery ? 'osw_pay_delivery' : 'osw_pay_pickup',
        brand_id: orderBrandId,
        brand_name: orderBrandId === 'regenerative_landscaper_supply' ? 'Regenerative Landscaper Supply' : 'Organic Soil Wholesale',
      });

      if (isDelivery) {
        try {
          const { createDeliveryWorkOrderFromOswOrder } = await import('../../shared/oswDeliveryIntake.js');
          await createDeliveryWorkOrderFromOswOrder(order.id);
        } catch (e) {
          console.error('[checkout free] delivery intake failed:', e);
        }
      }

      return res.json({
        free: true,
        orderId: order.id,
        confirmationCode: order.confirmation_code,
        url: null,
      });
    }

    // Absolutize image URLs — Stripe requires explicit scheme
    const origin = (req.headers.origin as string) || (req.headers.referer as string)?.replace(/(https?:\/\/[^/]+).*/, '$1') || 'https://organicsoilwholesale.com';
    const absolutizeImage = (url: string | undefined) => {
      if (!url) return null;
      if (/^https?:\/\//i.test(url)) return url;
      return `${origin.replace(/\/$/, '')}${url.startsWith('/') ? '' : '/'}${url}`;
    };

    // Create Stripe line items
    const lineItems = items.map((item: any) => {
      const img = absolutizeImage(item.imageUrl);
      return {
        price_data: {
          currency: 'usd',
          product_data: {
            name: item.name,
            description: [item.sizeOption, item.unit].filter(Boolean).join(' · '),
            ...(img ? { images: [img] } : {}),
          },
          unit_amount: Math.round(item.price * 100),
        },
        quantity: item.quantity,
      };
    });

    if (isDelivery && truckingQuote && truckingQuote.costCents > 0) {
      lineItems.push({
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'Delivery',
            description: deliveryRateDescription(items, truckingQuote.costCents),
          },
          unit_amount: truckingQuote.costCents,
        },
        quantity: 1,
      });
    }

    // Stripe requires absolute URLs with explicit scheme. Fall back to the public
    // domain when the request has no Origin header (e.g., server-to-server).
    const stripeOrigin = (req.headers.origin as string)
      || ((req.headers.referer as string)?.replace(/(https?:\/\/[^/]+).*/, '$1'))
      || process.env.PUBLIC_SITE_ORIGIN
      || 'https://organicsoilwholesale.com';

    // Create Stripe checkout session
    const session = await getStripe().checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      success_url: `${stripeOrigin}/order-confirmation?session_id={CHECKOUT_SESSION_ID}&order_id=${order.id}`,
      cancel_url: `${stripeOrigin}/checkout?canceled=true`,
      metadata: {
        order_id: order.id.toString(),
        pickup_time: isDelivery ? '' : pickupTime,
        fulfillment_type: isDelivery ? 'delivery' : 'pickup',
        delivery_zip: isDelivery ? deliveryAddress?.zip || '' : '',
        preferred_delivery_date: isDelivery ? preferredDeliveryDate : '',
        preferred_delivery_date_end: isDelivery ? preferredDeliveryDateEnd : '',
        preferred_delivery_window: isDelivery ? preferredDeliveryWindow : '',
        customer_type: customerInfo.customerCategory || '',
        company: customerInfo.company || '',
        marketing_opt_in: typeof customerInfo.marketingOptIn === 'boolean' ? String(customerInfo.marketingOptIn) : '',
      },
      customer_email: customerInfo.email || undefined,
    });

    // Update order with Stripe session ID
    await supabase
      .from('orders')
      .update({ stripe_checkout_session_id: session.id })
      .eq('id', order.id);

    res.json({ 
      sessionId: session.id, 
      orderId: order.id,
      confirmationCode: order.confirmation_code,
      url: session.url
    });
  } catch (error) {
    console.error('Checkout error:', error);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// Stripe webhook handler
router.post('/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'] as string;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

  let event: Stripe.Event;

  try {
    event = getStripe().webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return res.status(400).send(`Webhook Error: ${err}`);
  }

  // Handle the event
  switch (event.type) {
    case 'checkout.session.completed':
      const session = event.data.object as Stripe.Checkout.Session;
      await handlePaymentSuccess(session);
      break;

    case 'payment_intent.payment_failed':
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      await handlePaymentFailure(paymentIntent);
      break;

    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  res.json({ received: true });
});

// Handle successful payment
async function handlePaymentSuccess(session: Stripe.Checkout.Session) {
  const orderId = parseInt(session.metadata?.order_id || '0');
  
  if (!orderId) {
    console.error('No order ID in session metadata');
    return;
  }

  // Update order status
  const { error: orderError } = await supabase
    .from('orders')
    .update({
      status: 'paid',
      payment_status: 'paid',
      paid_at: new Date().toISOString(),
      stripe_payment_intent_id: session.payment_intent as string
    })
    .eq('id', orderId);

  if (orderError) {
    console.error('Error updating order:', orderError);
    return;
  }

  // Get order details including location_id
  const { data: orderData, error: orderDataError } = await supabase
    .from('orders')
    .select('location_id')
    .eq('id', orderId)
    .single();

  if (orderDataError || !orderData) {
    console.error('Error fetching order data:', orderDataError);
    return;
  }

  const locationId = orderData.location_id || 1; // Default to location 1 if not set

  // Get order items to reserve inventory
  const { data: orderItems, error: itemsError } = await supabase
    .from('order_items')
    .select('product_id, quantity, size_option')
    .eq('order_id', orderId);

  if (itemsError || !orderItems) {
    console.error('Error fetching order items:', itemsError);
    return;
  }

  // Reserve inventory for each item
  for (const item of orderItems) {
    // Get current inventory
    const { data: inventory } = await supabase
      .from('inventory')
      .select('id, quantity_available, quantity_reserved')
      .eq('product_id', item.product_id)
      .eq('location_id', locationId)
      .eq('size_option', item.size_option)
      .single();

    if (inventory) {
      // Update inventory
      await supabase
        .from('inventory')
        .update({
          quantity_available: inventory.quantity_available - item.quantity,
          quantity_reserved: inventory.quantity_reserved + item.quantity
        })
        .eq('id', inventory.id);

      // Record transaction
      await supabase
        .from('inventory_transactions')
        .insert({
          inventory_id: inventory.id,
          transaction_type: 'reservation',
          quantity: -item.quantity,
          reference_type: 'order',
          reference_id: orderId.toString(),
          notes: 'Automatic reservation after payment'
        });

      // Update order item status
      await supabase
        .from('order_items')
        .update({ 
          status: 'reserved',
          reserved_at: new Date().toISOString()
        })
        .eq('order_id', orderId)
        .eq('product_id', item.product_id);
    }
  }

  // Get full order details for email
  const { data: fullOrder, error: fullOrderError } = await supabase
    .from('orders')
    .select(`
      *,
      order_items (
        quantity,
        unit_price,
        total_price,
        products (
          name
        )
      )
    `)
    .eq('id', orderId)
    .single();

  if (!fullOrderError && fullOrder) {
    try {
      const assigned = await assignSswNumberForPurchase(supabase, {
        email: fullOrder.customer_email || fullOrder.email,
        name: fullOrder.customer_name || fullOrder.business_name,
        phone: fullOrder.phone,
      });
      await sendPurchaseThankYouEmail(fullOrder.customer_email || fullOrder.email, {
        fullName: fullOrder.customer_name || fullOrder.business_name,
        customerNumber: assigned?.customerNumber,
        pickupLabel: fullOrder.pickup_scheduled_at
          ? formatReadyLabel(fullOrder.pickup_scheduled_at)
          : (fullOrder.order_type === 'pickup' ? 'Ready within 24-48 hours' : undefined),
        location: fullOrder.pickup_location,
      });
      console.log(`Purchase thank-you sent for order ${orderId}`);
    } catch (emailError) {
      console.error('Failed to send purchase thank-you email:', emailError);
    }

    // Send admin notification email
    try {
      await sendAdminOrderNotification({
        orderNumber: fullOrder.order_number,
        customerName: fullOrder.business_name || 'Customer',
        customerEmail: fullOrder.email || undefined,
        customerPhone: fullOrder.phone || 'Not provided',
        orderType: fullOrder.order_type || 'standard',
        items: fullOrder.order_items.map((item: any) => ({
          name: item.products.name,
          quantity: item.quantity,
          price: item.total_price,
          size: item.size_option
        })),
        subtotal: fullOrder.subtotal || 0,
        tax: fullOrder.tax_amount || 0,
        total: fullOrder.total_amount || fullOrder.total || 0,
        deliveryMethod: fullOrder.order_type === 'pickup' ? 'Pickup' : 'Delivery',
        pickupLocation: fullOrder.pickup_location,
        estimatedReadyTime: fullOrder.pickup_scheduled_at,
        notes: fullOrder.notes
      });
      console.log(`Admin notification email sent for order ${orderId}`);
    } catch (adminEmailError) {
      console.error('Failed to send admin notification email:', adminEmailError);
      // Don't fail the order process if email fails
    }
  }

  // Fan out to MOS so yard reps get a push notification with the full order detail.
  // Phase B will land the matching POST /api/pickup-orders endpoint; until then this
  // fire-and-forget call logs a 404 we can replay later.
  if (fullOrder && Array.isArray(fullOrder.order_items)) {
    forwardPickupOrderToMos({
      osw_order_id: orderId,
      osw_order_number: fullOrder.order_number || undefined,
      customer_name: fullOrder.business_name || 'Customer',
      customer_phone: fullOrder.phone || '',
      customer_email: fullOrder.email || undefined,
      items: fullOrder.order_items.map((item: any) => ({
        product_id: item.product_id,
        product_name: item.products?.name || 'Product',
        size_option: item.size_option || '',
        quantity: item.quantity || 1,
        unit_price_cents: Math.round((item.unit_price || 0) * 100),
        total_price_cents: Math.round((item.total_price || 0) * 100),
      })),
      pickup_at: fullOrder.pickup_scheduled_at || new Date().toISOString(),
      slot_label: fullOrder.pickup_scheduled_at
        ? formatReadyLabel(fullOrder.pickup_scheduled_at, { includeDate: true })
        : undefined,
      total_cents: Math.round((fullOrder.total_amount || fullOrder.total || 0) * 100),
      payment_status: 'paid',
      source: 'osw_pay_pickup',
    });
  }

  console.log(`Order ${orderId} successfully paid and inventory reserved`);
}

// Handle failed payment
async function handlePaymentFailure(paymentIntent: Stripe.PaymentIntent) {
  // Find order by payment intent
  const { data: order } = await supabase
    .from('orders')
    .select('id')
    .eq('stripe_payment_intent_id', paymentIntent.id)
    .single();

  if (order) {
    await supabase
      .from('orders')
      .update({
        payment_status: 'failed',
        status: 'payment_failed'
      })
      .eq('id', order.id);
  }
}

// Generate confirmation code
function generateConfirmationCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

export default router;
