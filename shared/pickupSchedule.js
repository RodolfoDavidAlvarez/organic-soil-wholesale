/**
 * OSW pickup schedule — single source of truth (America/Phoenix).
 * Bulk pickup rules: Congress can be ready in about 30 minutes. Phoenix loose
 * bulk is appointment-only (~1 week) and only for products the yard can load
 * (Simon's Gold and Nature's Blanket). See shared/phoenixYardPickup.js.
 */

export const PICKUP_TIMEZONE = 'America/Phoenix';
export const OPEN_DAYS = new Set([2, 3, 4, 5, 6]); // Tue–Sat
/** Hourly pickup starts; skip 1 PM (lunch). Last slot 3–4 PM. */
export const SLOT_START_HOURS = [8, 9, 10, 11, 12, 14, 15];
export const LUNCH_START_HOUR = 13;
export const LUNCH_END_HOUR = 14;
export const OPEN_HOUR = 8;
export const CLOSE_HOUR = 16;
export const MIN_NOTICE_MS = 30 * 60 * 1000;
export const READY_IN_MINUTES = 30;
export const READY_IN_MS = READY_IN_MINUTES * 60 * 1000;
export const ASAP_VALIDATION_TOLERANCE_MS = 2 * 60 * 1000;
export const SAME_DAY_CUTOFF_HOUR = 16;
export const HOURS_LABEL = 'Tue–Sat, 8 AM–4 PM (closed 1–2 PM)';
export const PICKUP_ADDRESS = '18980 Stanton Rd, Congress, AZ 85332';

export function pickupDirectionsUrl(addressLine) {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addressLine)}`;
}

/** Public pickup locations.
 *  Congress Processing Plant has the truck scale and handles bulk pickup.
 *  Phoenix handles bags, pallets, and totes normally; loose bulk there is by
 *  appointment only. */
export const PICKUP_LOCATIONS = [
  {
    id: 'congress',
    locationId: 2,
    name: 'Congress Processing Plant',
    shortLabel: 'Congress, AZ',
    addressLine: '18980 Stanton Rd, Congress, AZ 85332',
    pickupLocationLabel: 'Congress Plant',
    // Remote site — navigate by exact pin (34°10'42.1"N 112°47'18.2"W), the
    // street address geocodes unreliably. Pin per _reference/plant-locations.md
    directionsUrl: pickupDirectionsUrl('34.178361,-112.788389'),
    mapsShortUrl: 'https://maps.app.goo.gl/TkrzEwmyxXqPeNGeA',
    pickupNote: 'Bulk pickup by scale · ready in about 30 min',
    minLeadDays: 0,
    allowAsap: true,
    bulkMinLeadDays: 0,
    bulkAllowAsap: true,
  },
  {
    id: 'phoenix',
    locationId: 1,
    name: 'Phoenix Yard',
    shortLabel: 'Phoenix, AZ',
    addressLine: '1634 N 19th Ave, Phoenix, AZ 85009',
    pickupLocationLabel: 'Phoenix Yard',
    // Exact customer entrance pin: 33°28'02.4"N 112°06'04.5"W.
    directionsUrl: pickupDirectionsUrl('33.467333,-112.101250'),
    pickupNote: "Bags ready in about 30 min · loose compost & mulch by appointment",
    minLeadDays: 0,
    allowAsap: true,
    bulkMinLeadDays: 7,
    bulkAllowAsap: false,
  },
];

/** Cu yd estimated at 50 lb/cf
 *  (1 cu yd = 27 cf × 50 lb = 1,350 lb ≈ 0.675 ton). */
export const PHOENIX_BULK_MAX_TONS = 12;
export const TONS_PER_CU_YD = 0.675;

export const PICKUP_SLOTS = SLOT_START_HOURS.map((startHour) => ({
  startHour,
  label: formatSlotLabel(startHour),
}));

function formatSlotLabel(startHour) {
  const endHour = startHour + 1;
  const fmt = (h) => {
    if (h === 12) return '12 PM';
    if (h < 12) return `${h} AM`;
    return `${h - 12} PM`;
  };
  return `${fmt(startHour)} – ${fmt(endHour)}`;
}

export function phoenixYmd(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: PICKUP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function phoenixParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: PICKUP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value ?? '';
  let hour = Number(get('hour'));
  if (hour === 24) hour = 0;
  return {
    ymd: `${get('year')}-${get('month')}-${get('day')}`,
    hour,
    minute: Number(get('minute')),
  };
}

export function phoenixWeekday(ymd) {
  return new Date(`${ymd}T12:00:00-07:00`).getUTCDay();
}

export function isOpenPickupDay(ymdOrDate) {
  const ymd = typeof ymdOrDate === 'string' ? ymdOrDate : phoenixYmd(ymdOrDate);
  return OPEN_DAYS.has(phoenixWeekday(ymd));
}

export function slotStartMs(ymd, startHour) {
  return Date.parse(`${ymd}T${String(startHour).padStart(2, '0')}:00:00-07:00`);
}

export function prettyDateLabel(ymd, todayYmd, tomorrowYmd) {
  if (ymd === todayYmd) return 'Today';
  if (ymd === tomorrowYmd) return 'Tomorrow';
  const d = new Date(`${ymd}T12:00:00-07:00`);
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: PICKUP_TIMEZONE,
  });
}

export function getBookableSlots(ymd, earliestMs = Date.now() + MIN_NOTICE_MS) {
  if (!isOpenPickupDay(ymd)) return [];
  return PICKUP_SLOTS.filter((slot) => slotStartMs(ymd, slot.startHour) >= earliestMs);
}

export function getBookableDates({ daysAhead = 7, earliestMs = Date.now() + MIN_NOTICE_MS } = {}) {
  const now = new Date();
  const todayYmd = phoenixYmd(now);
  const tomorrowYmd = phoenixYmd(new Date(now.getTime() + 86400000));
  const out = [];

  for (let i = 0; out.length < daysAhead && i < daysAhead + 14; i++) {
    const d = new Date(now.getTime() + i * 86400000);
    const ymd = phoenixYmd(d);
    if (getBookableSlots(ymd, earliestMs).length > 0) {
      out.push({ ymd, label: prettyDateLabel(ymd, todayYmd, tomorrowYmd) });
    }
  }
  return out;
}

export function computeLeadDays({ allYardAvailable, maxLeadDays = 7 }) {
  const { hour } = phoenixParts();
  if (allYardAvailable && hour < SAME_DAY_CUTOFF_HOUR) return 0;
  return maxLeadDays;
}

function addDaysYmd(startYmd, days) {
  const d = new Date(`${startYmd}T12:00:00-07:00`);
  d.setUTCDate(d.getUTCDate() + days);
  return phoenixYmd(d);
}

export function advanceYmdToOpenDay(ymd) {
  let cur = ymd;
  for (let i = 0; i < 14; i++) {
    if (isOpenPickupDay(cur)) return cur;
    cur = addDaysYmd(cur, 1);
  }
  return cur;
}

export function getAvailableDatesForProducts({
  allYardAvailable = false,
  maxLeadDays = 7,
  maxDates = 20,
} = {}) {
  const leadDays = computeLeadDays({ allYardAvailable, maxLeadDays });
  const startYmd = advanceYmdToOpenDay(addDaysYmd(phoenixYmd(), leadDays));
  const dates = [];
  let cur = startYmd;

  for (let i = 0; i < 45 && dates.length < maxDates; i++) {
    if (isOpenPickupDay(cur)) dates.push(cur);
    cur = addDaysYmd(cur, 1);
  }

  return {
    earliest_date: dates[0] ?? startYmd,
    available_dates: dates,
    max_lead_days: maxLeadDays,
    all_yard_available: allYardAvailable,
  };
}

export function getTimeSlotsForDate(dateYmd) {
  if (!isOpenPickupDay(dateYmd)) {
    return { slots: [], message: `Pickup available ${HOURS_LABEL}` };
  }
  const earliestMs = Date.now() + MIN_NOTICE_MS;
  const slots = getBookableSlots(dateYmd, earliestMs).map((slot) => ({
    time: slot.label,
    available: true,
    startHour: slot.startHour,
  }));
  return { date: dateYmd, slots };
}

/**
 * @returns {{ ok: true, pickupAtIso: string } | { ok: false, reason: string, message: string }}
 */
export function validatePickupIso(pickupAtIso) {
  if (!pickupAtIso || typeof pickupAtIso !== 'string') {
    return { ok: false, reason: 'missing', message: 'Pickup time is required.' };
  }

  const requested = new Date(pickupAtIso);
  if (Number.isNaN(requested.getTime())) {
    return { ok: false, reason: 'invalid_date', message: 'That pickup time is not valid.' };
  }

  const diffMs = requested.getTime() - Date.now();
  if (diffMs < MIN_NOTICE_MS) {
    return {
      ok: false,
      reason: 'lead_time',
      message: 'Pickup must be at least 30 minutes from now.',
    };
  }

  const parts = phoenixParts(requested);
  const { ymd, hour, minute } = parts;

  if (!isOpenPickupDay(ymd)) {
    return {
      ok: false,
      reason: 'closed_day',
      message: `Pickup is available ${HOURS_LABEL}.`,
    };
  }

  if (minute !== 0) {
    return {
      ok: false,
      reason: 'invalid_slot',
      message: 'Please choose a full-hour pickup slot.',
    };
  }

  if (!SLOT_START_HOURS.includes(hour)) {
    return {
      ok: false,
      reason: 'outside_hours',
      message: `Pickup slots are ${HOURS_LABEL}.`,
    };
  }

  if (hour >= LUNCH_START_HOUR && hour < LUNCH_END_HOUR) {
    return {
      ok: false,
      reason: 'lunch_break',
      message: 'We are closed 1-2 PM for lunch.',
    };
  }

  const expectedMs = slotStartMs(ymd, hour);
  if (requested.getTime() !== expectedMs) {
    return {
      ok: false,
      reason: 'invalid_slot',
      message: 'Please choose a valid pickup slot from the list.',
    };
  }

  return { ok: true, pickupAtIso: requested.toISOString() };
}

function phoenixLocalMs(ymd, hour, minute = 0) {
  return Date.parse(
    `${ymd}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00-07:00`,
  );
}

function formatClockTime(hour, minute) {
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  const ampm = hour < 12 ? 'AM' : 'PM';
  const minPart = minute === 0 ? '' : `:${String(minute).padStart(2, '0')}`;
  return `${h12}${minPart} ${ampm}`;
}

function formatShortWeekday(ymd) {
  return new Date(`${ymd}T12:00:00-07:00`).toLocaleDateString('en-US', {
    weekday: 'short',
    timeZone: PICKUP_TIMEZONE,
  });
}

/**
 * Normalize a candidate ready timestamp to respect yard hours (Tue–Sat, 8–4, lunch 1–2).
 * @param {number} candidateMs
 * @returns {number}
 */
export function normalizeAsapReadyMs(candidateMs) {
  let readyMs = candidateMs;

  for (let i = 0; i < 20; i += 1) {
    const parts = phoenixParts(new Date(readyMs));
    const { ymd, hour, minute } = parts;
    const openPlusPrepMs = phoenixLocalMs(ymd, OPEN_HOUR, READY_IN_MINUTES);
    const lunchStartMs = phoenixLocalMs(ymd, LUNCH_START_HOUR, 0);
    const lunchEndMs = phoenixLocalMs(ymd, LUNCH_END_HOUR, 0);
    const closeMs = phoenixLocalMs(ymd, CLOSE_HOUR, 0);

    if (!isOpenPickupDay(ymd)) {
      const nextOpen = advanceYmdToOpenDay(addDaysYmd(ymd, 1));
      readyMs = phoenixLocalMs(nextOpen, OPEN_HOUR, READY_IN_MINUTES);
      continue;
    }

    if (readyMs < openPlusPrepMs) {
      readyMs = openPlusPrepMs;
      continue;
    }

    if (readyMs >= lunchStartMs && readyMs < lunchEndMs) {
      readyMs = lunchEndMs;
      continue;
    }

    if (readyMs >= closeMs) {
      const nextOpen = advanceYmdToOpenDay(addDaysYmd(ymd, 1));
      readyMs = phoenixLocalMs(nextOpen, OPEN_HOUR, READY_IN_MINUTES);
      continue;
    }

    // Guard: hour 13 from phoenixParts edge cases
    if (hour >= LUNCH_START_HOUR && hour < LUNCH_END_HOUR) {
      readyMs = lunchEndMs;
      continue;
    }

    if (hour >= CLOSE_HOUR) {
      const nextOpen = advanceYmdToOpenDay(addDaysYmd(ymd, 1));
      readyMs = phoenixLocalMs(nextOpen, OPEN_HOUR, READY_IN_MINUTES);
      continue;
    }

    break;
  }

  return readyMs;
}

/**
 * Restaurant-style ASAP pickup ready time.
 * @param {number} [nowMs]
 * @returns {{ ok: true, readyAtIso: string, readyLabel: string, status: 'asap' | 'scheduled' } | { ok: false, reason: string, message: string }}
 */
export function computeAsapPickup(nowMs = Date.now()) {
  const readyMs = normalizeAsapReadyMs(nowMs + READY_IN_MS);
  const readyAtIso = new Date(readyMs).toISOString();
  const parts = phoenixParts(new Date(readyMs));
  const todayYmd = phoenixYmd(new Date(nowMs));
  const naiveAsapMs = nowMs + READY_IN_MS;
  const yardOpenNow = isOpenPickupDay(todayYmd) && (() => {
    const nowParts = phoenixParts(new Date(nowMs));
    const openMs = phoenixLocalMs(todayYmd, OPEN_HOUR, 0);
    const lunchStart = phoenixLocalMs(todayYmd, LUNCH_START_HOUR, 0);
    const lunchEnd = phoenixLocalMs(todayYmd, LUNCH_END_HOUR, 0);
    const close = phoenixLocalMs(todayYmd, CLOSE_HOUR, 0);
    const t = nowMs;
    return t >= openMs && t < lunchStart || t >= lunchEnd && t < close;
  })();

  const status =
    yardOpenNow &&
    Math.abs(readyMs - naiveAsapMs) < 60 * 1000 &&
    parts.ymd === todayYmd
      ? 'asap'
      : 'scheduled';

  return {
    ok: true,
    readyAtIso,
    readyLabel: formatReadyLabel(readyAtIso, { nowMs, status }),
    status,
  };
}

/**
 * @param {string} readyAtIso
 * @param {{ nowMs?: number, status?: 'asap' | 'scheduled', includeDate?: boolean }} [opts]
 */
export function formatReadyLabel(readyAtIso, opts = {}) {
  const { nowMs = Date.now(), status, includeDate = false } = opts;
  try {
    const readyMs = new Date(readyAtIso).getTime();
    const parts = phoenixParts(new Date(readyMs));
    const todayYmd = phoenixYmd(new Date(nowMs));
    const tomorrowYmd = phoenixYmd(new Date(nowMs + 86400000));
    const clock = formatClockTime(parts.hour, parts.minute);
    const resolvedStatus =
      status ??
      (Math.abs(readyMs - (nowMs + READY_IN_MS)) < 60 * 1000 && parts.ymd === todayYmd
        ? 'asap'
        : 'scheduled');

    let label =
      resolvedStatus === 'asap'
        ? 'Ready in about 30 minutes'
        : parts.ymd === todayYmd
          ? `Ready around ${clock}`
          : parts.ymd === tomorrowYmd
            ? `Ready tomorrow ~${clock}`
            : `Ready ${formatShortWeekday(parts.ymd)} ~${clock}`;

    if (includeDate) {
      const datePart = new Date(`${parts.ymd}T12:00:00-07:00`).toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        timeZone: PICKUP_TIMEZONE,
      });
      if (resolvedStatus === 'asap') {
        return `Ready in about 30 minutes, ${datePart}`;
      }
      return `Ready ~${clock}, ${datePart}`;
    }

    return label;
  } catch {
    return readyAtIso;
  }
}

/**
 * Validate client-supplied ASAP ready time (optional — server should recompute at checkout).
 * @returns {{ ok: true, pickupAtIso: string, readyLabel: string } | { ok: false, reason: string, message: string }}
 */
export function validateAsapPickupIso(pickupAtIso, nowMs = Date.now()) {
  if (!pickupAtIso || typeof pickupAtIso !== 'string') {
    return { ok: false, reason: 'missing', message: 'Pickup ready time is required.' };
  }

  const requested = new Date(pickupAtIso);
  if (Number.isNaN(requested.getTime())) {
    return { ok: false, reason: 'invalid_date', message: 'That pickup time is not valid.' };
  }

  const expected = computeAsapPickup(nowMs);
  if (!expected.ok) {
    return expected;
  }

  const diff = Math.abs(requested.getTime() - new Date(expected.readyAtIso).getTime());
  if (diff > ASAP_VALIDATION_TOLERANCE_MS) {
    return {
      ok: false,
      reason: 'stale_ready_time',
      message: 'Pickup ready time expired — please refresh and try again.',
    };
  }

  return {
    ok: true,
    pickupAtIso: expected.readyAtIso,
    readyLabel: expected.readyLabel,
  };
}

/**
 * Checkout pickup time — ASAP (default) or scheduled slot within business hours.
 * @returns {{ ok: true, pickupAtIso: string, pickupMode: 'asap' | 'schedule', readyLabel?: string } | { ok: false, reason: string, message: string }}
 */
export function resolveCheckoutPickupTime({
  pickupMode = 'asap',
  pickupTime = null,
  nowMs = Date.now(),
  allowAsap = true,
  minLeadDays = 0,
} = {}) {
  const mode = pickupMode === 'schedule' ? 'schedule' : 'asap';

  if (mode === 'asap' && allowAsap === false) {
    return {
      ok: false,
      reason: 'schedule_required',
      message: 'Please schedule this pickup in advance.',
    };
  }

  if (mode === 'schedule') {
    if (!pickupTime) {
      return { ok: false, reason: 'missing', message: 'Please choose a pickup slot.' };
    }
    const check = validatePickupIso(pickupTime);
    if (!check.ok) {
      return { ok: false, reason: check.reason, message: check.message };
    }
    const minLeadMs = minLeadDays * 24 * 60 * 60 * 1000;
    if (minLeadMs > 0 && new Date(check.pickupAtIso).getTime() < nowMs + minLeadMs) {
      return {
        ok: false,
        reason: 'lead_days',
        message: `Please choose a pickup slot at least ${minLeadDays} days out.`,
      };
    }
    const parts = phoenixParts(new Date(check.pickupAtIso));
    const slot = PICKUP_SLOTS.find((s) => s.startHour === parts.hour);
    return {
      ok: true,
      pickupAtIso: check.pickupAtIso,
      pickupMode: 'schedule',
      readyLabel: slot ? `Pickup ${slot.label}` : formatReadyLabel(check.pickupAtIso, { nowMs }),
    };
  }

  const asap = computeAsapPickup(nowMs);
  if (!asap.ok) {
    return asap;
  }
  if (pickupTime) {
    const stale = validateAsapPickupIso(pickupTime, nowMs);
    if (!stale.ok) {
      return { ok: false, reason: stale.reason, message: stale.message };
    }
  }
  return {
    ok: true,
    pickupAtIso: asap.readyAtIso,
    pickupMode: 'asap',
    readyLabel: asap.readyLabel,
  };
}
