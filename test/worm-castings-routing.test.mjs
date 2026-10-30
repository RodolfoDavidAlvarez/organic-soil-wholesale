import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { STAFF_SIGNUP_SUBJECT, buildNewsletterAdminNotification } from '../shared/newsletterNotifications.js';
import {
  WORM_CASTINGS_GROWING_OPTIONS,
  WORM_CASTINGS_OFFER,
  nextActionForGardenStatus,
  parseCampaignPrefill,
  persistWormCastingsRouting,
  propertyProfileFromGrowing,
  routingRecordColumns,
  validateWormCastingsRouting,
} from '../shared/wormCastingsRouting.js';
import {
  SSW_FIRST_DIGIT_ALPHABET,
  SSW_NUMBER_RE,
  assignSswNumberForPurchase,
  ensureSswNumber,
  findCustomerBySswLookup,
  generateSswNumber,
  isSswNumber,
  normalizeLegacySswNumber,
  normalizeSswNumber,
} from '../shared/sswNumber.js';
import { buildWormCastingsCouponEmail } from '../shared/wormCastingsCampaign.js';
import { buildPurchaseThankYouEmail, PURCHASE_THANK_YOU_FROM } from '../shared/purchaseThankYou.js';

const validBody = {
  customerType: 'homeowner',
  gardenStatus: 'brand-new',
  growing: ['food-garden', 'citrus-avocado'],
  growingOther: 'figs',
  zipCode: '85009',
};

test('routing questions accept Mike plant list and reject invented SKUs', () => {
  const labels = WORM_CASTINGS_GROWING_OPTIONS.map(([, label]) => label);
  assert.deepEqual(labels, [
    'Food garden',
    'Turf/grass',
    'Ornamentals',
    'Trees',
    'Citrus/avocado',
    'Palms',
    'Roses',
    'Succulents',
    'Indoor plants',
  ]);
  assert.equal(validateWormCastingsRouting(validBody).ok, true);
  assert.equal(validateWormCastingsRouting({ ...validBody, growing: ['bacchus'] }).ok, false);
  assert.equal(validateWormCastingsRouting({ ...validBody, customerType: 'home-gardener' }).ok, false);
  assert.equal(validateWormCastingsRouting({ ...validBody, zipCode: '8500' }).ok, false);
});

test('ZIP, property profile, offer, and next action are derived honestly', () => {
  const { routing } = validateWormCastingsRouting({ ...validBody, zipCode: '85009-1234' });
  assert.equal(routing.zipCode, '85009-1234');
  assert.equal(routing.propertyProfile, 'Food garden, Citrus/avocado, Other: figs');
  assert.equal(routing.offer, WORM_CASTINGS_OFFER);
  assert.equal(routing.nextAction, 'yard_pickup_then_intro_prescription');
  assert.equal(nextActionForGardenStatus('existing'), 'yard_pickup_then_existing_garden_upsell');
  assert.equal(
    propertyProfileFromGrowing(['turf', 'turf', 'unknown'], ''),
    'Turf/grass',
  );
});

test('signup record columns match CRM fields due Aug 25', () => {
  const { routing } = validateWormCastingsRouting(validBody);
  const columns = routingRecordColumns(routing, 'community-print');
  assert.deepEqual(Object.keys(columns).sort(), [
    'customer_type',
    'garden_status',
    'growing',
    'growing_other',
    'next_action',
    'offer',
    'property_profile',
    'signup_notes',
    'source',
    'zip_code',
  ]);
  assert.equal(columns.offer, 'free-9lb-mikeys-worm-poop');
  assert.equal(columns.source, 'community-print');
  assert.equal(columns.customer_type, 'homeowner');
});

test('persist writes routing onto the existing redemption and fills ZIP only when missing', async () => {
  const updates = [];
  const db = {
    from(table) {
      return {
        update(patch) {
          updates.push({ table, patch });
          return this;
        },
        eq() { return this; },
        select() { return this; },
        maybeSingle: async () => ({ data: { id: 'redemption-1' }, error: null }),
      };
    },
  };

  const { routing } = validateWormCastingsRouting(validBody);
  await persistWormCastingsRouting({
    db,
    customer: { id: 88, delivery_zip: '85007', newsletter_notes: 'prior' },
    redemptionId: 'redemption-1',
    routing,
    source: 'ig-ads',
  });

  const redemption = updates.find((item) => item.table === 'sp_worm_castings_redemptions');
  const customer = updates.find((item) => item.table === 'sp_customers');
  assert.equal(redemption.patch.zip_code, '85009');
  assert.equal(redemption.patch.customer_type, 'homeowner');
  assert.deepEqual(redemption.patch.growing, ['food-garden', 'citrus-avocado']);
  assert.equal(customer.patch.delivery_zip, undefined);
  assert.match(customer.patch.newsletter_notes, /ZIP: 85009/);
  assert.equal(customer.patch.newsletter_contact_type, 'homeowner');

  updates.length = 0;
  await persistWormCastingsRouting({
    db,
    customer: { id: 89, delivery_zip: null, newsletter_notes: '' },
    redemptionId: 'redemption-2',
    routing,
    source: 'ig-ads',
  });
  const filled = updates.find((item) => item.table === 'sp_customers');
  assert.equal(filled.patch.delivery_zip, '85009');
});

test('staff signup alerts keep generic subject and still omit Dan Nowell', async () => {
  const { routing } = validateWormCastingsRouting(validBody);
  const message = buildNewsletterAdminNotification({
    subscriber: {
      name: 'Sam Patel',
      email: 'sam@example.com',
      source: 'community-print',
      customerCategory: routing.customerType,
      zipCode: routing.zipCode,
      gardenStatus: routing.gardenStatus,
      propertyProfile: routing.propertyProfile,
      offer: routing.offer,
      nextAction: routing.nextAction,
    },
    testing: false,
  });
  assert.equal(message.subject, STAFF_SIGNUP_SUBJECT);
  assert.equal(message.subject, 'SSW signup');
  assert.match(message.html, /85009/);
  assert.match(message.html, /Food garden/);
  assert.match(message.html, /Yard pickup, then intro soil prescription/);
  assert.doesNotMatch(message.html, /nowell/i);
  assert.doesNotMatch(message.subject, /Sam/);

  const notifications = await readFile(new URL('../shared/newsletterNotifications.js', import.meta.url), 'utf8');
  assert.doesNotMatch(notifications, /nowell/i);
});

test('/free-worm-castings is expired: no public signup route, API returns 410', async () => {
  const app = await readFile(new URL('../client/src/App.tsx', import.meta.url), 'utf8');
  const main = await readFile(new URL('../client/src/main.tsx', import.meta.url), 'utf8');
  const campaignEntry = await readFile(new URL('../client/src/CampaignEntry.tsx', import.meta.url), 'utf8');
  const survey = await readFile(new URL('../client/src/pages/ClientSurvey.tsx', import.meta.url), 'utf8');
  const expired = await readFile(new URL('../client/src/pages/ExpiredAugustGift.tsx', import.meta.url), 'utf8');
  const instagram = await readFile(new URL('../client/src/pages/InstagramLinks.tsx', import.meta.url), 'utf8');
  const newsletter = await readFile(new URL('../client/src/pages/NewsletterSignup.tsx', import.meta.url), 'utf8');
  const workshop = await readFile(new URL('../client/src/pages/FallGardenWorkshop.tsx', import.meta.url), 'utf8');
  const offers = await readFile(new URL('../shared/promoBundles.js', import.meta.url), 'utf8');
  const campaign = await readFile(new URL('../shared/wormCastingsCampaign.js', import.meta.url), 'utf8');
  const api = await readFile(new URL('../api/index.js', import.meta.url), 'utf8');
  const serverNewsletter = await readFile(new URL('../server/routes/newsletter.ts', import.meta.url), 'utf8');

  assert.match(app, /path="\/free-worm-castings" component=\{ExpiredAugustGift\}/);
  assert.doesNotMatch(app, /FreeWormCastingsRoute/);
  assert.doesNotMatch(main, /CampaignEntry/);
  assert.match(campaignEntry, /ExpiredAugustGift/);
  assert.match(expired, /This offer is no longer available/);
  assert.doesNotMatch(expired, /Claim My Free Bag/);
  assert.doesNotMatch(expired, /newsletter\/subscribe/);
  assert.match(instagram, /\/offers\?source=instagram-bio/);
  assert.doesNotMatch(instagram, /Free community gift/);
  assert.match(campaign, /WORM_CASTINGS_PUBLIC_SIGNUP_OPEN = false/);
  assert.match(api, /status\(410\)/);
  assert.match(api, /WORM_CASTINGS_CAMPAIGN_ENDED_MESSAGE/);
  assert.match(serverNewsletter, /status\(410\)/);

  assert.doesNotMatch(survey, /free-worm-castings/);
  assert.doesNotMatch(instagram, /free-worm-castings/);
  assert.doesNotMatch(instagram, /Claim your free 9-lb bag/);
  assert.doesNotMatch(newsletter, /WormCastingsCampaign/);
  assert.doesNotMatch(newsletter, /Subscribe for My Free Bag/);
  assert.doesNotMatch(workshop, /free-worm-castings/);
  assert.doesNotMatch(offers, /Walked in with a free worm bag/);

  assert.match(survey, /\/api\/survey\/submit/);
  assert.doesNotMatch(survey, /newsletter\/subscribe/);
  assert.match(api, /persistWormCastingsRouting/);
  assert.match(api, /validateWormCastingsRouting/);
  assert.match(api, /ensureSswNumber/);
  assert.doesNotMatch(api, /Dan Nowell/);
});

test('query params prefill name, email, phone, zip, and known routing answers', () => {
  const prefill = parseCampaignPrefill(
    '?email=rodolfodavid110@gmail.com&name=Rodo&phone=6232633386&zip=85009&customerType=homeowner&gardenStatus=existing&growing=food-garden,palms&other=figs',
  );
  assert.equal(prefill.name, 'Rodo');
  assert.equal(prefill.email, 'rodolfodavid110@gmail.com');
  assert.equal(prefill.phone, '6232633386');
  assert.equal(prefill.zipCode, '85009');
  assert.equal(prefill.customerType, 'homeowner');
  assert.equal(prefill.gardenStatus, 'existing');
  assert.deepEqual(prefill.growing, ['food-garden', 'palms']);
  assert.equal(prefill.growingOther, 'figs');
  assert.equal(parseCampaignPrefill('?customerType=home-gardener&growing=bacchus').customerType, '');
  assert.deepEqual(parseCampaignPrefill('?growing=bacchus').growing, []);
});

test('SSW numbers are random SSW-###-### values and are reused for the same customer', async () => {
  assert.equal(SSW_FIRST_DIGIT_ALPHABET, '23456789');
  const first = generateSswNumber(Buffer.from([0, 1, 2, 3, 4, 5]));
  const second = generateSswNumber(Buffer.from([10, 20, 30, 40, 50, 60]));
  assert.match(first, SSW_NUMBER_RE);
  assert.match(second, SSW_NUMBER_RE);
  assert.notEqual(first, second);
  assert.equal(first.startsWith('SSW-0') || first.startsWith('SSW-1'), false);
  assert.equal(isSswNumber('SSW-082-194'), false);
  assert.equal(isSswNumber('SSW-182-194'), false);
  assert.equal(isSswNumber('SSW-NGHW'), false);
  assert.equal(normalizeLegacySswNumber('SSW-NGHW'), 'SSW-NGHW');
  assert.equal(normalizeSswNumber('SSW-582-194'), 'SSW-582-194');
  assert.equal(normalizeSswNumber('582-194'), 'SSW-582-194');
  assert.equal(normalizeSswNumber('582194'), 'SSW-582-194');

  const reused = await ensureSswNumber({}, { id: 290, ssw_number: 'SSW-582-194' });
  assert.equal(reused, 'SSW-582-194');

  const updates = [];
  const db = {
    from() {
      return {
        update(patch) {
          updates.push(patch);
          return this;
        },
        eq() { return this; },
        is() { return this; },
        select() { return this; },
        maybeSingle: async () => ({ data: { ssw_number: updates.at(-1)?.ssw_number }, error: null }),
      };
    },
  };
  const minted = await ensureSswNumber(db, { id: 88, ssw_number: null }, () => 'SSW-582-194');
  assert.equal(minted, 'SSW-582-194');
  assert.equal(updates[0].ssw_number, 'SSW-582-194');

  const remintUpdates = [];
  const remintDb = {
    from() {
      return {
        update(patch) {
          remintUpdates.push(patch);
          return this;
        },
        eq() { return this; },
        is() { return this; },
        select() { return this; },
        maybeSingle: async () => ({ data: { ssw_number: remintUpdates.at(-1)?.ssw_number }, error: null }),
      };
    },
  };
  const reminted = await ensureSswNumber(
    remintDb,
    { id: 290, ssw_number: 'SSW-NGHW' },
    () => 'SSW-704-338',
  );
  assert.equal(reminted, 'SSW-704-338');
  assert.equal(remintUpdates[0].ssw_number, 'SSW-704-338');
  assert.equal(remintUpdates[0].ssw_number_alias, 'SSW-NGHW');
});

test('SSW lookup accepts SSW-###-###, ###-###, digits only, and the old alias', async () => {
  const matches = [];
  const db = {
    from() {
      return {
        select() { return this; },
        or(filter) {
          matches.push(filter);
          return this;
        },
        maybeSingle: async () => ({
          data: { id: 290, ssw_number: 'SSW-582-194', ssw_number_alias: 'SSW-NGHW' },
          error: null,
        }),
      };
    },
  };
  const byFull = await findCustomerBySswLookup(db, 'SSW-582-194');
  const byGrouped = await findCustomerBySswLookup(db, '582-194');
  const byDigits = await findCustomerBySswLookup(db, '582194');
  const byAlias = await findCustomerBySswLookup(db, 'SSW-NGHW');
  assert.equal(byFull.id, 290);
  assert.equal(byGrouped.ssw_number, 'SSW-582-194');
  assert.equal(byDigits.ssw_number, 'SSW-582-194');
  assert.equal(byAlias.ssw_number_alias, 'SSW-NGHW');
  assert.equal(matches[0], 'ssw_number.eq.SSW-582-194');
  assert.equal(matches[1], 'ssw_number.eq.SSW-582-194');
  assert.equal(matches[2], 'ssw_number.eq.SSW-582-194');
  assert.equal(matches[3], 'ssw_number_alias.eq.SSW-NGHW');
  assert.equal(await findCustomerBySswLookup(db, 'not-a-number'), null);
});

test('purchase checkout reuses an existing number and does not subscribe the buyer', async () => {
  const inserts = [];
  const existingDb = {
    from() {
      return {
        select() { return this; },
        ilike() { return this; },
        maybeSingle: async () => ({
          data: { id: 290, ssw_number: 'SSW-582-194', email: 'buyer@example.com' },
          error: null,
        }),
        insert() { throw new Error('should reuse existing customer'); },
      };
    },
  };
  const reused = await assignSswNumberForPurchase(existingDb, {
    email: 'buyer@example.com',
    name: 'Buyer',
  });
  assert.equal(reused.customerNumber, 'SSW-582-194');
  assert.equal(reused.created, false);

  const newDb = {
    from() {
      return {
        select() { return this; },
        ilike() { return this; },
        maybeSingle: async () => ({ data: null, error: null }),
        insert(row) {
          inserts.push(row);
          return {
            select() { return this; },
            single: async () => ({ data: { id: 401, ssw_number: null, email: row.email }, error: null }),
          };
        },
        update(patch) {
          return {
            eq() { return this; },
            is() { return this; },
            select() { return this; },
            maybeSingle: async () => ({ data: { ssw_number: patch.ssw_number }, error: null }),
          };
        },
      };
    },
  };
  const created = await assignSswNumberForPurchase(newDb, {
    email: 'newbuyer@example.com',
    name: 'New Buyer',
    phone: '6232633386',
  });
  assert.equal(created.created, true);
  assert.match(created.customerNumber, SSW_NUMBER_RE);
  assert.equal(inserts[0].newsletter_subscribed, false);
  assert.equal(inserts[0].source, 'osw_checkout');
});

test('gift email shows the customer number large with the yard phone', () => {
  const coupon = buildWormCastingsCouponEmail({
    fullName: 'Rodo',
    token: '11111111-1111-4111-8111-111111111111',
    customerNumber: 'SSW-582-194',
  });
  assert.equal(coupon.subject, 'Your free 9-lb worm castings coupon');
  assert.match(coupon.html, /SSW-582-194/);
  assert.match(coupon.html, /This is your number. Call us with it and we will pull you up./);
  assert.match(coupon.html, /tel:\+16232633386/);
  assert.match(coupon.html, /\(623\) 263-3386/);
});

test('purchase thank-you is short, from info@, and does not use Founder or em dashes', () => {
  const email = buildPurchaseThankYouEmail({
    fullName: 'Rodo',
    customerNumber: 'SSW-582-194',
    pickupLabel: 'Ready today by 2:00 PM',
    location: '1634 N 19th Ave, Phoenix, AZ 85009',
  });
  assert.equal(email.from, PURCHASE_THANK_YOU_FROM);
  assert.match(email.from, /info@soilseedandwater\.com/);
  assert.equal(email.subject, 'Thank you. Your number is SSW-582-194');
  assert.match(email.html, /Thank you for buying/);
  assert.match(email.html, /SSW-582-194/);
  assert.match(email.html, /Call \(623\) 263-3386 with this number and we will pull you up/);
  assert.match(email.html, /tel:\+16232633386/);
  assert.doesNotMatch(email.html, /Founder/);
  assert.doesNotMatch(email.html, /—/);
  assert.doesNotMatch(email.subject, /—/);
  assert.doesNotMatch(email.html, /Show this at pickup/);
});

test('purchase thank-you includes the unique receipt QR when an order number is present', () => {
  const email = buildPurchaseThankYouEmail({
    fullName: 'Rodo',
    customerNumber: 'SSW-582-194',
    orderNumber: 'OSW-TEST-ORDER',
    qrImageUrl: 'https://www.organicsoilwholesale.com/api/public/receipt-qr/OSW-TEST-ORDER.png',
  });
  assert.match(email.html, /Show this at pickup/);
  assert.match(email.html, /OSW-TEST-ORDER\.png/);
  assert.match(email.html, /Order OSW-TEST-ORDER/);
});
