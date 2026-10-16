export class CheckoutConfirmationError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'CheckoutConfirmationError';
    this.status = status;
  }
}

// The returned object is public: explicitly allowlist purchase/fulfillment fields.
// Never spread a database order or a Stripe session into this response.
function purchaseSummary(order, items, session) {
  const amountCents = Number(session.amount_total);
  if (session.amount_total == null || !Number.isSafeInteger(amountCents) || amountCents < 0) {
    throw new Error('Confirmed checkout is missing its paid amount');
  }
  const namedItems = Array.isArray(order.order_items) ? order.order_items : [];
  return {
    ok: true,
    order: {
      id: order.id,
      confirmation_code: order.confirmation_code,
      fulfillment_type: order.fulfillment_type,
      location_id: order.location_id,
      pickup_scheduled_at: order.pickup_scheduled_at,
    },
    value: amountCents / 100,
    items: items.map((item) => {
      const namedItem = namedItems.find((entry) =>
        String(entry.product_id) === String(item.product_id)
        && String(entry.size || '') === String(item.size_option || ''));
      return {
        product_id: item.product_id,
        product_name: namedItem?.name || 'Organic Soil Wholesale product',
        size_option: item.size_option,
        quantity: Number(item.quantity || 0),
        unit_price: Number(item.unit_price || 0),
      };
    }),
  };
}

/** Verify the caller's checkout-session bearer token before returning an order summary. */
export async function confirmPaidCheckout({ db, orderId, sessionId, retrieveSession, fulfillOrder }) {
  const id = Number(orderId);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new CheckoutConfirmationError('A valid orderId is required');
  }

  const { data: order, error: orderError } = await db.from('orders').select('*').eq('id', id).single();
  if (orderError) throw new Error('Failed to read checkout order');
  if (!order) throw new CheckoutConfirmationError('Order not found', 404);

  // Free orders never visit Stripe. Keep their existing acknowledgment minimal;
  // an order number alone cannot reveal a paid order's items or amount.
  if (!sessionId && order.payment_status === 'paid' && !order.stripe_checkout_session_id
      && order.total_amount != null && Number(order.total_amount) === 0) {
    return { payload: { ok: true, alreadyPaid: true }, session: null };
  }
  if (typeof sessionId !== 'string' || !/^cs_(?:live|test)_[A-Za-z0-9]+$/.test(sessionId)) {
    throw new CheckoutConfirmationError('The checkout session is required');
  }
  if (order.stripe_checkout_session_id && order.stripe_checkout_session_id !== sessionId) {
    throw new CheckoutConfirmationError('Checkout session does not match this order', 403);
  }

  const session = await retrieveSession(sessionId);
  if (session?.id !== sessionId || String(session?.metadata?.order_id) !== String(id)
      || session.mode !== 'payment') {
    throw new CheckoutConfirmationError('Checkout session does not match this order', 403);
  }
  if (session.payment_status !== 'paid') {
    return { payload: { ok: false, pending: true, paymentStatus: session.payment_status }, session };
  }

  let confirmedOrder = order;
  let items;
  if (order.payment_status === 'paid') {
    const result = await db.from('order_items')
      .select('product_id, quantity, unit_price, size_option').eq('order_id', id);
    if (result.error) throw new Error('Failed to read confirmed checkout items');
    items = result.data || [];
  } else {
    const result = await fulfillOrder(id, session);
    if (!result?.ok || !result.order) throw new Error('Failed to confirm order payment');
    confirmedOrder = result.order;
    items = Array.isArray(result.items) ? result.items : [];
  }

  return {
    payload: {
      ...purchaseSummary(confirmedOrder, items, session),
      ...(order.payment_status === 'paid' ? { alreadyPaid: true } : {}),
    },
    session,
  };
}
