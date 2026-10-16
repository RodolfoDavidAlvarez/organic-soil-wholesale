/** Customer delivery prices approved October 15, 2026. No carrier costs here. */
export const DELIVERY_PRICING_VERSION = '2026-10-15';
export const DELIVERY_MINIMUMS = Object.freeze({ walking_floor: 750, dump_truck: 375 });

export function applyDeliveryPriceMinimums(defaults, overrides = {}) {
  const result = { ...defaults, ...overrides };
  for (const truck of ['walking_floor', 'dump_truck', 'flatbed_moffett', 'hot_shot']) {
    result[truck] = { ...(defaults[truck] || result.walking_floor), ...(truck === 'dump_truck' && !defaults[truck] ? { min_fee: 375 } : {}), ...overrides[truck] };
  }
  const rates = result;
  for (const [truck, minimum] of Object.entries(DELIVERY_MINIMUMS)) {
    const configured = rates[truck] || rates.walking_floor;
    result[truck] = {
      ...configured,
      min_fee: Math.max(minimum, Number(rates[truck]?.min_fee) || 0),
      capacity_label: truck === 'dump_truck' ? 'Up to 6 tons per load' : 'Up to 24 tons per load',
    };
  }
  return result;
}

/** Only a single material with a known quantity qualifies for a small dump truck.
 * Keep unknown / mixed loads on the existing larger-truck route for coordination.
 */
export function bulkDeliveryPlan(items) {
  let loads = 0;
  let smallDump = false;
  for (const item of items) {
    const size = String(item.sizeOption || item.format || '').toLowerCase();
    const unit = String(item.unit || '').toLowerCase();
    const name = String(item.productName || item.name || '').toLowerCase();
    const quantity = Math.max(1, Number(item.quantity) || 1);
    if (size.includes('pallet') || !/bulk|truckload|cubic yard|cu yd|^2-cy$/.test(size)) continue;
    const packaged = size.includes('truckload');
    const isTons = /ton/.test(packaged ? size : unit + ' ' + size);
    const plantpal = /plantpal/.test(name);
    const capacity = isTons ? 24 : plantpal ? 60 : 90;
    const stated = packaged ? size.match(/([\d.]+)\s*(?:tons?|cu\s*yd|cubic\s*yards?)/) : null;
    const amount = packaged ? quantity * (stated ? Number(stated[1]) : capacity) : size === '2-cy' ? quantity * 2 : quantity;
    loads += Math.max(1, Math.ceil(amount / capacity));
    if (items.length === 1 && !packaged) {
      // The email specifies 6 tons / about 15 CY for PlantPal only. Do not
      // apply PlantPal's density to compost, castings or other bulk materials.
      smallDump = isTons ? amount <= 6 : plantpal && amount <= 15;
    }
  }
  return { truck: smallDump ? 'dump_truck' : 'walking_floor', loadCount: smallDump ? 1 : Math.max(1, loads) };
}

/** Used for customer-facing delivered rates; never infer density across products. */
export function deliveryQuantity(items) {
  if (items.length !== 1) return null;
  const item = items[0];
  const size = String(item.sizeOption || item.format || '').toLowerCase();
  const unit = String(item.unit || '').toLowerCase();
  if (size.includes('pallet') || !/bulk|truckload|cubic yard|cu yd|^2-cy$/.test(size)) return null;
  const quantity = Math.max(1, Number(item.quantity) || 1);
  const packaged = size.includes('truckload');
  const stated = packaged ? size.match(/([\d.]+)\s*(tons?|cu\s*yd|cubic\s*yards?)/) : null;
  if (packaged && !stated) return null;
  const tons = /ton/.test(packaged ? stated[2] : unit + ' ' + size);
  return { amount: packaged ? quantity * Number(stated[1]) : size === '2-cy' ? quantity * 2 : quantity, unit: tons ? 'ton' : 'cu yd' };
}

export function calculateDeliveryCharge({ truckRate, oneWayHours, unloadHours = 0.5, roughAccess = false, loadCount = 1 }) {
  const roundTripHours = oneWayHours * 2 + unloadHours;
  const accessModifier = roughAccess ? 1.2 : 1;
  const costCents = Math.round(Math.max(truckRate.min_fee, roundTripHours * truckRate.hourly_rate) * accessModifier * loadCount * 100);
  if (!Number.isFinite(costCents) || costCents < 0) throw new Error('Delivery rate unavailable. Please call for a quote.');
  return { roundTripHours, accessModifier, costCents };
}

/** A fresh server quote must match the amount the customer reviewed. */
export function deliveryPriceChanged(reviewed, current) {
  return reviewed != null && Number(reviewed.costCents) !== current.costCents;
}

export function deliveryRateDescription(items, costCents) {
  const quantity = deliveryQuantity(items);
  if (!quantity) return 'Delivery of your ordered materials';
  const rate = (costCents / 100 / quantity.amount).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  return `Delivery for ${quantity.amount} ${quantity.unit} (equivalent to ${rate} per ${quantity.unit})`;
}
