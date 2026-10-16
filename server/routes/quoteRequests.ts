import { applyDeliveryPriceMinimums, bulkDeliveryPlan, calculateDeliveryCharge, DELIVERY_PRICING_VERSION } from '../../shared/deliveryPricing.js';
import { Router } from 'express';
import { supabase } from '../db/supabase.js';
import { sendAdminQuoteRequestNotification } from '../services/email.js';
import { forwardToMosLeads } from '../services/forwardToMosLeads.js';

const router = Router();

type OriginKey = 'phoenix' | 'congress';
type TruckType = 'dump_truck' | 'walking_floor' | 'flatbed_moffett' | 'hot_shot';

interface QuoteItem {
  sizeOption?: string;
  format?: string;
  quantity?: number;
  unit?: string;
  productName?: string;
}

interface Yard {
  label: string;
  lat: number;
  lng: number;
  zip: string;
}

interface TruckRate {
  hourly_rate: number;
  min_fee: number;
  capacity_label: string;
}

interface TruckingRates {
  walking_floor: TruckRate;
  dump_truck?: TruckRate;
  flatbed_moffett: TruckRate;
  hot_shot: TruckRate;
  avg_speed_mph: number;
  road_factor: number;
  unload_hours: number;
}

interface DistanceResult {
  miles: number;
  hours: number;
  city: string | null;
  state: string | null;
  cached: boolean;
}

const OSW_YARDS: Record<OriginKey, Yard> = {
  phoenix: { label: 'Phoenix, AZ', lat: 33.4675, lng: -112.1000, zip: '85009' },
  congress: { label: 'Congress, AZ', lat: 34.1608, lng: -112.8515, zip: '85332' },
};

const DEFAULT_TRUCK_RATES: TruckingRates = {
  walking_floor: { hourly_rate: 165, min_fee: 400, capacity_label: '24 tons / 90 cu yd per load' },
  flatbed_moffett: { hourly_rate: 150, min_fee: 400, capacity_label: '22 pallets / 22 totes' },
  hot_shot: { hourly_rate: 95, min_fee: 175, capacity_label: '4-10 pallets' },
  avg_speed_mph: 55,
  road_factor: 1.30,
  unload_hours: 0.5,
};

async function getTruckingRates(): Promise<TruckingRates> {
  try {
    const { data } = await supabase
      .from('sp_settings')
      .select('value')
      .eq('key', 'trucking_rates')
      .single();

    if (data?.value && typeof data.value === 'object') {
      return applyDeliveryPriceMinimums(DEFAULT_TRUCK_RATES, data.value);
    }
  } catch {
    // Settings table may not exist in local/dev yet. Defaults keep checkout usable.
  }

  return applyDeliveryPriceMinimums(DEFAULT_TRUCK_RATES);
}

function inferFormat(rawKey: string | undefined): 'bulk' | 'pallet' | 'bag' {
  const key = String(rawKey || '').toLowerCase();
  // Pallet truckloads (e.g. "Truckload (22 pallets)") need a flatbed, not walking-floor.
  if (key.includes('truckload') && key.includes('pallet')) return 'pallet';
  if (key.includes('truckload') || key.includes('bulk')) return 'bulk';
  if (key === '2-cy' || key.includes('cubic yard') || key.includes('cu yd') || key.includes(' cy ')) return 'bulk';
  if (key.includes('pallet') || key.includes('tote') || key.includes('supersack') || key.includes('super sack')) return 'pallet';
  return 'bag';
}

function palletCountFromItem(item: QuoteItem): number {
  const key = String(item.sizeOption || item.format || '');
  const qty = Math.max(1, Number(item.quantity) || 1);
  const match = key.match(/(\d+)\s*pallets?/i);
  // "Truckload (22 pallets)" with qty 1 = 22 pallet spots on the flatbed.
  if (match) return Number(match[1]) * qty;
  if (inferFormat(key) === 'pallet') return qty;
  return 0;
}

function pickTruck(items: QuoteItem[], milesEstimate = 100): { truck: TruckType; split: 'mixed' | null } {
  const formats = items.map((item) => inferFormat(item.sizeOption || item.format));
  const hasBulk = formats.includes('bulk');
  const palletQty = items.reduce((sum, item) => sum + palletCountFromItem(item), 0);

  if (hasBulk && palletQty === 0) return { truck: bulkDeliveryPlan(items).truck, split: null };
  if (hasBulk && palletQty > 0) return { truck: 'walking_floor', split: 'mixed' };
  if (palletQty <= 4 && milesEstimate < 200) return { truck: 'hot_shot', split: null };
  return { truck: 'flatbed_moffett', split: null };
}

function walkingFloorLoads(items: QuoteItem[]) {
  return Math.max(1, items.reduce((sum, item) => {
    if (inferFormat(item.sizeOption || item.format) !== 'bulk') return sum;
    const unit = String(item.unit || item.sizeOption || item.format || '').toLowerCase();
    const quantity = Math.max(1, Number(item.quantity) || 1);
    const capacity = unit.includes('ton') ? 24 : 90;
    return sum + Math.max(1, Math.ceil(quantity / capacity));
  }, 0));
}

function haversineMiles(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const earthRadiusMiles = 3958.7613;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng;
  return 2 * earthRadiusMiles * Math.asin(Math.sqrt(h));
}

async function geocodeZip(zip: string): Promise<{ lat: number; lng: number; city: string; state: string }> {
  const response = await fetch(`https://api.zippopotam.us/us/${encodeURIComponent(zip)}`, {
    signal: AbortSignal.timeout(5000),
  });

  if (!response.ok) throw new Error(`ZIP ${zip} not found`);

  const data = await response.json() as {
    places?: Array<{ latitude: string; longitude: string; 'place name': string; 'state abbreviation': string }>;
  };
  const place = data.places?.[0];
  if (!place) throw new Error(`ZIP ${zip} not found`);

  return {
    lat: Number(place.latitude),
    lng: Number(place.longitude),
    city: place['place name'],
    state: place['state abbreviation'],
  };
}

async function getOneWayDistance(originKey: OriginKey, destZip: string, rates: TruckingRates): Promise<DistanceResult> {
  try {
    const { data: cached } = await supabase
      .from('sp_trucking_distance_cache')
      .select('miles_one_way, hours_one_way')
      .eq('origin_key', originKey)
      .eq('dest_zip', destZip)
      .single();

    if (cached) {
      // Distance cache does not store place names — still resolve city/state for checkout autofill.
      let city: string | null = null;
      let state: string | null = null;
      try {
        const place = await geocodeZip(destZip);
        city = place.city || null;
        state = place.state || null;
      } catch {
        // Non-fatal — checkout can still collect the address manually.
      }
      return {
        miles: Number(cached.miles_one_way),
        hours: Number(cached.hours_one_way),
        city,
        state,
        cached: true,
      };
    }
  } catch {
    // Cache miss or local table missing.
  }

  const yard = OSW_YARDS[originKey];
  const dest = await geocodeZip(destZip);
  const straightMiles = haversineMiles(yard, dest);
  const miles = +(straightMiles * (rates.road_factor || 1.3)).toFixed(1);
  const hours = +(miles / (rates.avg_speed_mph || 55)).toFixed(2);

  try {
    await supabase.from('sp_trucking_distance_cache').upsert({
      origin_key: originKey,
      dest_zip: destZip,
      miles_one_way: miles,
      hours_one_way: hours,
      source: 'haversine',
      refreshed_at: new Date().toISOString(),
    }, { onConflict: 'origin_key,dest_zip' });
  } catch {
    // Best effort only.
  }

  return { miles, hours, city: dest.city, state: dest.state, cached: false };
}

async function pickClosestOrigin(destZip: string, rates: TruckingRates): Promise<{ origin: OriginKey; distance: DistanceResult }> {
  // All customer deliveries dispatch from Congress plant.
  const congress = await getOneWayDistance('congress', destZip, rates);
  return { origin: 'congress', distance: congress };
}

export async function quoteTrucking({
  items,
  zip,
  roughAccess,
  originKey,
}: {
  items: QuoteItem[];
  zip: string;
  roughAccess: boolean;
  originKey?: OriginKey;
}) {
  const rates = await getTruckingRates();
  const { origin, distance } = originKey
    ? { origin: originKey, distance: await getOneWayDistance(originKey, zip, rates) }
    : await pickClosestOrigin(zip, rates);

  const { truck, split } = pickTruck(items || [], distance.miles);
  const truckRate = rates[truck];
  const palletSpots = (items || []).reduce((sum, item) => sum + palletCountFromItem(item), 0);
  const loadCount =
    (truck === 'walking_floor' || truck === 'dump_truck')
      ? bulkDeliveryPlan(items || []).loadCount
      : Math.max(1, Math.ceil(palletSpots / 22));
  const { roundTripHours, accessModifier, costCents } = calculateDeliveryCharge({
    truckRate, oneWayHours: distance.hours, unloadHours: rates.unload_hours || 0.5, roughAccess, loadCount,
  });

  return {
    pricingVersion: DELIVERY_PRICING_VERSION,
    truck,
    truckLabel: {
      walking_floor: 'Walking-floor (bulk dump)',
          dump_truck: 'Dump truck (up to 6 tons)',
      flatbed_moffett: 'Flatbed with onboard forklift',
      hot_shot: 'Hot-shot trailer',
    }[truck],
    originYard: origin,
    originLabel: OSW_YARDS[origin].label,
    milesRoundTrip: +(distance.miles * 2).toFixed(1),
    hoursRoundTrip: +roundTripHours.toFixed(2),
    accessModifier,
    costCents,
    costDollars: +(costCents / 100).toFixed(2),
    split,
    breakdown: {
      milesOneWay: distance.miles,
      hoursOneWay: distance.hours,
      unloadHours: rates.unload_hours || 0.5,
      capacityLabel: truckRate.capacity_label,
      loadCount,
      destinationCity: distance.city,
      destinationState: distance.state,
      cached: distance.cached,
    },
  };
}

// Delivery trucking quote for checkout.
router.post('/trucking', async (req, res) => {
  try {
    const { items, zip, roughAccess, originKey } = req.body || {};
    const cleanZip = typeof zip === 'string' ? zip.trim() : '';

    if (!/^\d{5}$/.test(cleanZip)) {
      return res.status(400).json({ error: 'A 5-digit ZIP is required' });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items[] is required' });
    }
    if (originKey && originKey !== 'phoenix' && originKey !== 'congress') {
      return res.status(400).json({ error: 'originKey must be phoenix or congress' });
    }

    const quote = await quoteTrucking({
      items,
      zip: cleanZip,
      roughAccess: !!roughAccess,
      originKey,
    });

    res.setHeader('Cache-Control', 'public, s-maxage=900, stale-while-revalidate=3600');
    return res.json(quote);
  } catch (error) {
    console.error('[trucking quote]', error);
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to calculate trucking' });
  }
});

router.get('/trucking', async (req, res) => {
  try {
    const zip = typeof req.query.zip === 'string' ? req.query.zip : '';
    const truck = typeof req.query.truck === 'string' ? req.query.truck : 'walking_floor';
    const roughAccess = req.query.rough === '1';
    const originKey = req.query.origin === 'phoenix' || req.query.origin === 'congress' ? req.query.origin : undefined;

    if (!/^\d{5}$/.test(zip)) {
      return res.status(400).json({ error: 'zip query param required (5 digits)' });
    }

    const simulatedItem = truck === 'dump_truck'
      ? { sizeOption: 'Bulk Pickup', quantity: 6, unit: 'per ton' }
      : truck === 'walking_floor'
        ? { sizeOption: 'Truckload', quantity: 1 }
        : truck === 'hot_shot'
          ? { sizeOption: 'Pallet of 1CF Bags', quantity: 2 }
          : { sizeOption: 'Pallet of 1CF Bags', quantity: 12 };

    return res.json(await quoteTrucking({ items: [simulatedItem], zip, roughAccess, originKey }));
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : 'quote failed' });
  }
});

// Submit quote request
router.post('/submit', async (req, res) => {
  try {
    const { name, email, phone, company, products, quantities, deliveryLocation, notes } = req.body;

    // Validate required fields
    if (!name || !email || !products || !quantities) {
      return res.status(400).json({ error: 'Name, email, products, and quantities are required' });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    const submittedAt = new Date().toISOString();

    // Save to database
    const { data, error } = await supabase
      .from('quote_requests')
      .insert({
        name,
        email,
        phone,
        company,
        products,
        quantities,
        delivery_location: deliveryLocation,
        notes,
        status: 'new',
        created_at: submittedAt
      })
      .select()
      .single();

    if (error) {
      console.error('Error saving quote request:', error);
      return res.status(500).json({ error: 'Failed to submit quote request' });
    }

    // Send admin notification
    try {
      await sendAdminQuoteRequestNotification({
        name,
        email,
        phone,
        company,
        products,
        quantities,
        deliveryLocation,
        notes,
        submittedAt
      });
      console.log('Admin notification sent for quote request');
    } catch (emailError) {
      console.error('Failed to send admin notification:', emailError);
      // Don't fail the submission if email fails
    }

    const productSummary = Array.isArray(products)
      ? products.map((p: any, i: number) => `${p} x ${Array.isArray(quantities) ? quantities[i] : ''}`).join(', ')
      : String(products);
    forwardToMosLeads({
      full_name: name,
      email,
      phone: phone || undefined,
      company: company || undefined,
      message:
        `Quote request:\n${productSummary}` +
        (deliveryLocation ? `\nDelivery: ${deliveryLocation}` : '') +
        (notes ? `\nNotes: ${notes}` : ''),
      source: 'osw_quote_request',
      source_url: 'https://organicsoilwholesale.com/quote',
      source_data: { osw_quote_request_id: data.id, products, quantities, deliveryLocation },
    });

    res.json({ 
      success: true, 
      message: 'Your quote request has been received. We\'ll prepare your quote and contact you soon!',
      requestId: data.id
    });
  } catch (error) {
    console.error('Quote request submission error:', error);
    res.status(500).json({ error: 'Failed to process quote request' });
  }
});

// Get quote requests (admin only)
router.get('/requests', async (req, res) => {
  try {
    // Check for admin token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { data, error } = await supabase
      .from('quote_requests')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json(data || []);
  } catch (error) {
    console.error('Error fetching quote requests:', error);
    res.status(500).json({ error: 'Failed to fetch quote requests' });
  }
});

export default router;
