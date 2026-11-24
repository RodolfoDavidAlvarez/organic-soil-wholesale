import test from 'node:test';
import assert from 'node:assert/strict';
import { CLOSED_DATES, computeAsapPickup, getBookableSlots, isOpenPickupDay, validatePickupIso, slotStartMs } from '../shared/pickupSchedule.js';

test('Thanksgiving 2026 is closed everywhere the schedule is used', () => {
  assert.ok(CLOSED_DATES.has('2026-11-26'));
  assert.equal(isOpenPickupDay('2026-11-26'), false);
  assert.equal(getBookableSlots('2026-11-26', 0).length, 0);
  assert.equal(validatePickupIso(new Date(slotStartMs('2026-11-26', 10)).toISOString()).ok, false);
  assert.equal(isOpenPickupDay('2026-11-25'), true);
  assert.equal(isOpenPickupDay('2026-11-27'), true);
  assert.equal(isOpenPickupDay('2026-11-28'), true);
});

test('ASAP after Wednesday close rolls to Friday, skipping Thanksgiving', () => {
  const asap = computeAsapPickup(Date.parse('2026-11-25T16:30:00-07:00'));
  assert.equal(asap.ok, true);
  assert.match(asap.readyAtIso, /^2026-11-27T/);
});
