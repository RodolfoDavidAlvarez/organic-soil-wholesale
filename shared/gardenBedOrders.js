export const GARDEN_BED = Object.freeze({
  name: '4 × 8 Garden Bed Kit', slug: 'garden-bed-kit', price: 599,
  image: '/images/garden-bed/garden-bed-kit.webp',
  included: ['Four steel corner posts', 'Lumber for one 4 × 8 ft bed', 'Pea gravel', 'Soil cloth'],
  exclusions: 'Delivery, assembly, soil, mulch, soil amendments, plants, and irrigation are not included. Applicable tax is extra.',
});

// Prices and contents are built on the server; never trust a submitted total.
export function normalizeGardenBedRequest(input = {}) {
  const fail = error => ({ error });
  const clean = (v, max) => typeof v === 'string' ? v.trim().slice(0, max) : '';
  if (input.website) return { honeypot: true };
  const name = clean(input.name, 120);
  const email = clean(input.email, 254).toLowerCase();
  const phone = clean(input.phone, 30);
  const digits = phone.replace(/\D/g, '');
  const quantity = input.quantity;
  const fulfillment = input.fulfillment;
  const zip = clean(input.zip, 10);
  const notes = clean(input.notes, 2000);
  const token = clean(input.request_token, 36);
  if (name.length < 2) return fail('Please enter your full name.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail('Please enter a valid email address.');
  if (!(digits.length === 10 || (digits.length === 11 && digits[0] === '1'))) return fail('Please enter a valid US phone number.');
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) return fail('Choose a whole number of beds from 1 to 100.');
  if (!['pickup', 'delivery', 'discuss'].includes(fulfillment)) return fail('Please choose pickup, delivery, or help deciding.');
  if (fulfillment === 'delivery' && !/^\d{5}$/.test(zip)) return fail('Please enter a five-digit delivery ZIP code.');
  if (input.contact_consent !== true) return fail('Please allow our team to contact you about this request.');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token)) return fail('Please reload the page and try again.');
  const fulfillmentLabel = { pickup: 'Local pickup — coordinate with team', delivery: `Delivery quote requested — ZIP ${zip}`, discuss: 'Please help me decide pickup or delivery' }[fulfillment];
  return { payload: {
    name, email, phone: '+1' + digits.slice(-10), lead_type: 'order_callback', source: 'osw_garden_bed_order',
    source_url: 'https://www.organicsoilwholesale.com/products/garden-bed-kit',
    request_token: token,
    notes: [
      'GARDEN BED ORDER REQUEST — limited-time $599 launch offer.',
      'No payment collected. Availability, timing, and final total require team confirmation.',
      `Includes: ${GARDEN_BED.included.join('; ')}.`,
      GARDEN_BED.exclusions,
      `Fulfillment: ${fulfillmentLabel}.`,
      'Customer agreed to follow-up about this request; no marketing subscription requested.',
      notes ? `Customer notes: ${notes}` : '',
      `Request reference: ${token}`,
    ].filter(Boolean).join('\n'),
    order: {
      line_items: [{product_name: GARDEN_BED.name, product_slug: GARDEN_BED.slug, format: 'Launch kit', quantity, unit_price: GARDEN_BED.price, line_total: GARDEN_BED.price * quantity, unit: 'bed', mode: 'quote'}],
      item_count: 1, estimated_total: GARDEN_BED.price * quantity,
      ...(fulfillment === 'delivery' ? {delivery_zip: zip} : {}),
    },
  }};
}

// The database may already mirror contact_messages into the sales queue.
// Enrich that row instead of creating a second lead via the HTTP intake.
export async function enrichMirroredGardenBedLead(sb, contactId, payload) {
  const existing = await sb.from('sp_leads').select('id, source_data')
    .eq('source_data->>contact_message_id', String(contactId)).limit(1).maybeSingle();
  if (existing.error) throw new Error('Could not check mirrored garden-bed lead');
  if (!existing.data) return false;
  const updated = await sb.from('sp_leads').update({
    source: 'osw_order_callback', source_url: payload.source_url,
    source_data: { ...existing.data.source_data, osw_contact_message_id: contactId,
      campaign: 'garden_bed_launch', request_token: payload.request_token,
      lead_type: 'order_callback', order: payload.order },
  }).eq('id', existing.data.id);
  if (updated.error) console.error('[garden-bed] Mirror retained; order metadata update failed');
  return true;
}
