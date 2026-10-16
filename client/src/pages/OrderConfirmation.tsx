import React, { useEffect, useRef, useState } from 'react';
import SEO from '@/components/layout/SEO';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Check, Phone, MapPin, Clock, Home, Truck } from 'lucide-react';
import { useLocation } from 'wouter';
import {
  CUSTOMER_SUPPORT_PHONE_DISPLAY,
  CUSTOMER_SUPPORT_PHONE_TEL,
  PHOENIX_YARD_ADDRESS,
} from '@/config/contact';
import { type EcommerceItem, trackEcommerceEvent, trackPhoneClick } from '@/lib/analytics';
import { recordCheckoutMonitorEvent } from '@/lib/checkoutMonitor';
import { HOURS_LABEL, PICKUP_LOCATIONS } from '@shared/pickupSchedule.js';

interface OrderDetails {
  orderId: string;
  confirmationCode?: string;
  items: number;
  pickupTime?: string | null;
  pickupReadyLabel?: string | null;
  /** 'pickup' | 'delivery' (older orders may not have this) */
  fulfillment?: 'pickup' | 'delivery';
  /** Which yard the customer selected for pickup — 'phoenix' | 'congress'. */
  pickupSiteId?: string | null;
  deliveryZip?: string | null;
  orderItems?: EcommerceItem[];
  value?: number;
  productSubtotal?: number;
  deliveryFee?: number;
  paymentConfirmed?: boolean;
  freeOrder?: boolean;
}

const DEFAULT_PICKUP_SITE_ID = 'phoenix';
const resolvePickupSite = (siteId?: string | null, locationId?: number | null) =>
  PICKUP_LOCATIONS.find((loc: any) => loc.id === siteId) ||
  PICKUP_LOCATIONS.find((loc: any) => loc.locationId === locationId) ||
  PICKUP_LOCATIONS.find((loc: any) => loc.id === DEFAULT_PICKUP_SITE_ID) ||
  PICKUP_LOCATIONS[0];

const PHOENIX_YARD_PHONE_DISPLAY = CUSTOMER_SUPPORT_PHONE_DISPLAY;
const PHOENIX_YARD_PHONE_TEL = CUSTOMER_SUPPORT_PHONE_TEL;
const PURCHASE_TRACKED_PREFIX = 'osw-purchase-tracked:';

const OrderConfirmation: React.FC = () => {
  const [, navigate] = useLocation();
  const [orderDetails, setOrderDetails] = useState<OrderDetails | null>(null);
  const [confirmationStatus, setConfirmationStatus] = useState<'checking' | 'confirmed' | 'pending' | 'error' | 'missing'>('checking');
  const [confirmationAttempt, setConfirmationAttempt] = useState(0);
  const trackedPurchases = useRef(new Set<string>());

  useEffect(() => {
    let active = true;
    setConfirmationStatus('checking');
    const params = new URLSearchParams(window.location.search);
    const orderId = params.get('order_id');
    const sessionId = params.get('session_id');

    const trackPurchaseOnce = (details: OrderDetails) => {
      if (!details.orderId) return;
      if (!details.value || details.value <= 0) return;
      const storageKey = `${PURCHASE_TRACKED_PREFIX}${details.orderId}`;
      if (trackedPurchases.current.has(storageKey)) return;
      try {
        if (sessionStorage.getItem(storageKey)) return;
        sessionStorage.setItem(storageKey, '1');
      } catch { /* Storage restrictions must not block a paid confirmation. */ }
      trackedPurchases.current.add(storageKey);

      trackEcommerceEvent('purchase', {
        transaction_id: details.orderId,
        value: Number(details.value || 0),
        items: details.orderItems || [],
        fulfillment: details.fulfillment || 'pickup',
        delivery_zip: details.deliveryZip || undefined,
        pickup_sales_channel: 'osw_yard',
      });
    };

    const mergeConfirmedOrder = (payload: any, fallback: OrderDetails): OrderDetails => {
      const order = payload?.order;
      const orderItems = Array.isArray(payload?.items)
        ? payload.items.map((item: any) => ({
            item_id: item.product_id || item.item_id || 'unknown',
            item_name: item.product_name || item.name || 'Organic Soil Wholesale product',
            item_variant: item.size_option || item.item_variant || '',
            item_category: order?.fulfillment_type || fallback.fulfillment || 'pickup',
            price: Number(item.unit_price || item.price || 0),
            quantity: Number(item.quantity || 1),
          }))
        : fallback.orderItems;

      const confirmedSite = order?.location_id
        ? resolvePickupSite(null, Number(order.location_id))
        : null;

      return {
        ...fallback,
        orderId: String(order?.id || fallback.orderId),
        confirmationCode: order?.confirmation_code || fallback.confirmationCode,
        items: Array.isArray(payload?.items) ? payload.items.length : fallback.items,
        fulfillment: order?.fulfillment_type || fallback.fulfillment,
        pickupSiteId: confirmedSite?.id || fallback.pickupSiteId,
        pickupTime: order?.pickup_scheduled_at || fallback.pickupTime,
        deliveryZip: order?.delivery_zip || fallback.deliveryZip,
        value: Number(payload?.value ?? order?.total_amount ?? fallback.value ?? 0),
        orderItems,
        paymentConfirmed: true,
      };
    };

    let fallbackOrder: OrderDetails | null = null;
    try {
      const savedOrder = localStorage.getItem('lastOrder');
      if (savedOrder) fallbackOrder = JSON.parse(savedOrder);
      if (orderId && String(fallbackOrder?.orderId) !== orderId) fallbackOrder = null;
    } catch { /* A verified Stripe return works without browser storage. */ }
    if (!fallbackOrder && orderId) {
      fallbackOrder = { orderId, items: 0 };
    }
    setOrderDetails(fallbackOrder);

    if (orderId) {
      fetch('/api/checkout/confirm-paid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: Number(orderId),
          sessionId: sessionId || undefined,
        }),
      })
        .then((response) => (response.ok ? response.json() : null))
        .then((payload) => {
          if (!active || !fallbackOrder) return;
          const confirmed = payload?.ok ? mergeConfirmedOrder(payload, fallbackOrder) : fallbackOrder;
          setOrderDetails(confirmed);
          if (payload?.ok || confirmed.freeOrder) {
            setConfirmationStatus('confirmed');
            trackPurchaseOnce(confirmed);
            try {
              recordCheckoutMonitorEvent('payment_completed', {
                orderId: Number(confirmed.orderId),
                fulfillment: confirmed.fulfillment,
                itemCount: confirmed.items,
                cartValue: confirmed.value,
                stripeSessionId: sessionId || undefined,
              });
            } catch { /* Monitoring must not hide a successful payment. */ }
          } else {
            setConfirmationStatus(payload?.pending ? 'pending' : 'error');
          }
        })
        .catch(() => {
          if (!active) return;
          setConfirmationStatus(fallbackOrder?.freeOrder ? 'confirmed' : 'error');
        });
    } else {
      setConfirmationStatus(fallbackOrder?.freeOrder ? 'confirmed' : fallbackOrder ? 'error' : 'missing');
    }

    return () => { active = false; };
  }, [confirmationAttempt]);

  if (confirmationStatus !== 'confirmed') {
    const checking = confirmationStatus === 'checking';
    const missing = confirmationStatus === 'missing';
    const heading = checking ? 'Checking your payment'
      : missing ? 'No order found'
      : confirmationStatus === 'pending' ? 'Payment confirmation is pending'
      : 'We couldn’t confirm your payment';
    return (
      <>
        <SEO title="Order Confirmation" canonical="https://organicsoilwholesale.com/order-confirmation" robots="noindex, nofollow" />
        <div className="min-h-screen bg-stone-50 flex items-center justify-center p-4">
          <Card className="max-w-md w-full">
            <CardContent className="text-center py-10 space-y-5">
              <div role="status" aria-live="polite">
                <h1 className="text-2xl font-bold mb-3">{heading}</h1>
                <p className="text-stone-600">
                  {checking ? 'Please wait while we check the payment status for your order.'
                    : missing ? 'Open the confirmation link from your receipt, or call us for help.'
                    : 'If you already paid, don’t place another order. Check again or call us for help.'}
                </p>
                {orderDetails?.orderId && <p className="mt-3 text-sm text-stone-600">Order #{orderDetails.orderId}</p>}
              </div>
              {!missing && (
                <Button size="lg" className="w-full min-h-[48px]" disabled={checking}
                  onClick={() => setConfirmationAttempt((attempt) => attempt + 1)}>
                  {checking ? 'Checking…' : 'Check payment status again'}
                </Button>
              )}
              <Button asChild size="lg" variant="outline" className="w-full min-h-[48px]">
                <a href={PHOENIX_YARD_PHONE_TEL}><Phone className="w-5 h-5 mr-2" />Call {PHOENIX_YARD_PHONE_DISPLAY}</a>
              </Button>
              <Button variant="ghost" size="lg" className="w-full min-h-[48px]" onClick={() => navigate('/')}>
                Return to Home
              </Button>
            </CardContent>
          </Card>
        </div>
      </>
    );
  }

  if (!orderDetails) {
    return (
      <>
        <SEO title="Order Confirmation" canonical="https://organicsoilwholesale.com/order-confirmation" robots="noindex, nofollow" />
        <div className="min-h-screen bg-stone-50 flex items-center justify-center p-4">
          <Card className="max-w-md w-full">
            <CardContent className="text-center py-12">
              <h2 className="text-2xl font-bold mb-4">No order found</h2>
              <Button onClick={() => navigate('/')} size="lg" className="min-h-[48px]">
                Return to Home
              </Button>
            </CardContent>
          </Card>
        </div>
      </>
    );
  }

  const isDelivery = orderDetails.fulfillment === 'delivery';
  const pickupSite = resolvePickupSite(orderDetails.pickupSiteId);

  const formatPickupTime = (isoString?: string | null) => {
    if (!isoString) return null;
    const date = new Date(isoString);
    return date.toLocaleString('en-US', {
      timeZone: 'America/Phoenix',
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const pickupTimeLabel =
    orderDetails.pickupReadyLabel || formatPickupTime(orderDetails.pickupTime);

  return (
    <>
      <SEO title="Order Confirmation" canonical="https://organicsoilwholesale.com/order-confirmation" robots="noindex, nofollow" />
      <div className="min-h-screen bg-stone-50">
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        {/* Success header */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4 animate-bounce">
            <Check className="w-10 h-10 text-green-600" />
          </div>
          <h1 className="text-3xl font-bold text-stone-900 mb-2">Order Confirmed</h1>
          <p className="text-stone-600">
            {isDelivery
              ? "We'll call to schedule delivery shortly."
              : "Your order has been placed."}
          </p>
        </div>

        {/* Order details */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Order Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {orderDetails.confirmationCode && (
              <div className="flex justify-between items-center">
                <span className="text-stone-600">Confirmation Code</span>
                <span className="font-mono font-bold text-lg text-primary">
                  {orderDetails.confirmationCode}
                </span>
              </div>
            )}

            <div className="flex justify-between items-center">
              <span className="text-stone-600">Order ID</span>
              <span className="font-mono">#{orderDetails.orderId}</span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-stone-600">Items</span>
              <span>{orderDetails.items} {orderDetails.items === 1 ? 'item' : 'items'}</span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-stone-600">Fulfillment</span>
              <span className="font-medium text-stone-900 inline-flex items-center gap-1.5">
                {isDelivery ? <Truck className="w-4 h-4" /> : <MapPin className="w-4 h-4" />}
                {isDelivery ? 'Delivery' : 'Pickup'}
              </span>
            </div>

            {isDelivery && orderDetails.deliveryZip && (
              <div className="flex justify-between items-center">
                <span className="text-stone-600">Delivery ZIP</span>
                <span className="font-medium text-stone-900">{orderDetails.deliveryZip}</span>
              </div>
            )}

            {!isDelivery && pickupTimeLabel && (
              <div className="flex justify-between items-center">
                <span className="text-stone-600">Estimated ready</span>
                <span className="font-medium text-green-700">{pickupTimeLabel}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pickup vs Delivery instructions */}
        {isDelivery ? (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Truck className="w-5 h-5" />
                What happens next
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <Step n={1} title="We'll call you within 1 business day" body="To confirm delivery date and any site access details." />
                <Step n={2} title="Driver dispatch from Phoenix yard" body={`Loading from ${PHOENIX_YARD_ADDRESS}.`} />
                <Step n={3} title="Truck arrives on your scheduled day" body="Walking-floor or flatbed depending on what you ordered." />
                <Step n={4} title="Material delivered to your site" body="We'll handle unloading per truck type. Please be available to direct placement." />
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="w-5 h-5" />
                Pickup Instructions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <Step n={1} title={`Drive to the ${pickupSite.name}`} body={pickupSite.addressLine} />
                <Step n={2} title="Pull into the yard" body="Look for the loading area." />
                <Step
                  n={3}
                  title="Call when you arrive"
                  body={`Have your ${orderDetails.confirmationCode ? 'confirmation code' : `order number #${orderDetails.orderId}`} ready.`}
                />
                <Step n={4} title="We'll load your order" body="Stay with your vehicle, we'll handle the rest." />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Actions */}
        <div className="space-y-3">
          <Button
            size="lg"
            className="w-full min-h-[48px]"
            onClick={() => {
              trackPhoneClick({ location: 'order_confirmation', phone_href: PHOENIX_YARD_PHONE_TEL });
              window.location.href = PHOENIX_YARD_PHONE_TEL;
            }}
          >
            <Phone className="w-5 h-5 mr-2" />
            Call {PHOENIX_YARD_PHONE_DISPLAY}
          </Button>

          {!isDelivery && (
            <Button
              size="lg"
              variant="outline"
              className="w-full min-h-[48px]"
              onClick={() => { window.open(pickupSite.directionsUrl, '_blank'); }}
            >
              <MapPin className="w-5 h-5 mr-2" />
              Get Directions
            </Button>
          )}

          <Button
            size="lg"
            variant="ghost"
            className="w-full min-h-[48px]"
            onClick={() => navigate('/')}
          >
            <Home className="w-5 h-5 mr-2" />
            Return to Home
          </Button>
        </div>

        {/* Yard hours */}
        <div className="mt-8 bg-stone-100 rounded-lg p-4">
          <h3 className="font-medium text-stone-900 mb-2 flex items-center gap-2">
            <Clock className="w-4 h-4" />
            {isDelivery ? 'Yard hours' : `${pickupSite.name} hours`}
          </h3>
          <div className="text-sm text-stone-700 space-y-1">
            <p>{HOURS_LABEL}</p>
            <p>Sunday & Monday: Closed</p>
          </div>
        </div>
      </div>
      </div>
    </>
  );
};

interface StepProps { n: number; title: string; body: string }
const Step: React.FC<StepProps> = ({ n, title, body }) => (
  <div className="flex items-start gap-3">
    <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
      <span className="text-sm font-bold text-primary">{n}</span>
    </div>
    <div>
      <p className="font-medium text-stone-900">{title}</p>
      <p className="text-sm text-stone-600">{body}</p>
    </div>
  </div>
);

export default OrderConfirmation;
