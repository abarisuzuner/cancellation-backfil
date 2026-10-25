import test from 'node:test';
import assert from 'node:assert/strict';
import { seed, START, MINUTE, DAY, matches, eligibility, cancelBooking, sendOffer, respondToOffer, reconcile, savePatient, addSlot, togglePatient, metrics, activeBooking } from '../engine.js';
import { parsePreferences } from '../parser.js';

const open = () => cancelBooking(seed(0), 'slot-1500', START);
const topSlot = state => state.slots.find(s => s.id === 'slot-1500');

test('eligibility excludes wrong availability, duration, treatment, and clinician before ranking', () => {
  const state = open();
  const ranked = matches(state, topSlot(state), START);
  assert.deepEqual(ranked.filter(m => m.eligible).map(m => m.patient.id), ['alex', 'sam']);
  for (const id of ['taylor', 'priya', 'jamie', 'oliver']) assert.equal(ranked.find(m => m.patient.id === id).eligible, false);
});
test('full appointment availability is required', () => {
  const s = open(), p = s.patients.find(p => p.id === 'alex');
  p.to = 15 * 60 + 15;
  assert.equal(eligibility(s, p, topSlot(s), START).eligible, false);
});
test('notice and travel time are checked at matching and acceptance', () => {
  const s = open(), p = s.patients.find(p => p.id === 'alex');
  p.notice = 20; p.travel = 121;
  assert.equal(eligibility(s, p, topSlot(s), START).eligible, false);
  p.travel = 15;
  sendOffer(s, 'slot-1500', 'alex', START);
  p.notice = 180;
  assert.throws(() => respondToOffer(s, s.offers[0].id, 'accepted', START + 1000), /notice/);
});
test('ranking uses priority, then waiting time, then distance', () => {
  const s = open(), alex = s.patients[0], sam = s.patients[1];
  sam.priority = 2; sam.joinedAt = alex.joinedAt - DAY;
  assert.equal(matches(s, topSlot(s), START)[0].patient.id, 'sam');
  sam.joinedAt = alex.joinedAt; sam.distance = 1;
  assert.equal(matches(s, topSlot(s), START)[0].patient.id, 'sam');
  alex.priority = 2; sam.priority = 1;
  assert.equal(matches(s, topSlot(s), START)[0].patient.id, 'alex');
});
test('acceptance persists one booking, fulfils waitlist, and records elapsed time', () => {
  const s = open(); sendOffer(s, 'slot-1500', 'alex', START + 5000);
  const id = s.offers[0].id;
  respondToOffer(s, id, 'accepted', START + 25000);
  assert.equal(activeBooking(s, 'slot-1500').patientId, 'alex');
  assert.equal(s.patients[0].status, 'fulfilled');
  assert.equal(s.offers[0].status, 'accepted');
  assert.equal(metrics(s, START).average, 25);
  assert.equal(metrics(s, START).recovered, 75);
  assert.equal(metrics(s, START).filled, 1);
  respondToOffer(s, id, 'accepted', START + 26000);
  assert.equal(s.bookings.filter(b => b.slotId === 'slot-1500' && b.status === 'confirmed').length, 1);
  assert.equal(s.events.filter(e => e.type === 'accepted').length, 1);
});
test('one offer per slot and patient prevents competing bookings', () => {
  const s = open(); sendOffer(s, 'slot-1500', 'alex', START);
  assert.throws(() => sendOffer(s, 'slot-1500', 'sam', START), /already active/);
  cancelBooking(s, 'slot-1600', START);
  assert.throws(() => sendOffer(s, 'slot-1600', 'alex', START), /another offer/);
});
test('decline leaves slot open and moves to next eligible patient', () => {
  const s = open(); sendOffer(s, 'slot-1500', 'alex', START);
  respondToOffer(s, s.offers[0].id, 'declined', START + 1000);
  assert.equal(activeBooking(s, 'slot-1500'), undefined);
  assert.equal(matches(s, topSlot(s), START + 1000).filter(m => m.eligible)[0].patient.id, 'sam');
  assert.throws(() => respondToOffer(s, s.offers[0].id, 'accepted', START + 2000), /declined/);
});
test('expiry at exact deadline rejects acceptance and records one event', () => {
  const s = open(); sendOffer(s, 'slot-1500', 'alex', START);
  const id = s.offers[0].id;
  assert.throws(() => respondToOffer(s, id, 'accepted', START + 2 * MINUTE), /expired/);
  reconcile(s, START + 3 * MINUTE);
  assert.equal(s.events.filter(e => e.type === 'expired').length, 1);
  assert.equal(matches(s, topSlot(s), START + 3 * MINUTE).filter(m => m.eligible)[0].patient.id, 'sam');
});
test('re-cancelling a backfill returns patient to waitlist without reusing old offer', () => {
  const s = open(); sendOffer(s, 'slot-1500', 'alex', START);
  const offerId = s.offers[0].id;
  respondToOffer(s, offerId, 'accepted', START + 1000);
  cancelBooking(s, 'slot-1500', START + 2000);
  assert.equal(s.patients[0].status, 'waiting');
  respondToOffer(s, offerId, 'accepted', START + 3000);
  assert.equal(activeBooking(s, 'slot-1500'), undefined);
  assert.equal(metrics(s, START).filled, 0);
});
test('empty eligible set is a valid manual-follow-up state', () => {
  const s = open(); s.patients.forEach(p => p.days = [1]);
  assert.equal(matches(s, topSlot(s), START).filter(m => m.eligible).length, 0);
  assert.equal(activeBooking(s, 'slot-1500'), undefined);
});
test('conflicting patient bookings are ineligible', () => {
  const s = open();
  s.slots.push({ ...topSlot(s), id: 'other', clinicianId: 'noah' });
  s.bookings.push({ id: 'conflict', slotId: 'other', patientId: 'alex', status: 'confirmed' });
  assert.match(eligibility(s, s.patients[0], topSlot(s), START).reasons.join(), /Conflicting/);
});
test('patient input validation and offer editing restrictions preserve current data', () => {
  const s = open();
  assert.throws(() => savePatient(s, { ...s.patients[0], days: [] }, START), /available day/);
  assert.throws(() => savePatient(s, { ...s.patients[0], from: 1100, to: 1000 }, START), /end after/);
  assert.throws(() => savePatient(s, { ...s.patients[0], distance: -1 }, START), /distance/);
  sendOffer(s, 'slot-1500', 'alex', START);
  assert.throws(() => savePatient(s, { ...s.patients[0], name: 'Edited' }, START), /active offer/);
  assert.throws(() => togglePatient(s, 'alex', START), /active offer/);
});
test('creating slots rejects clinician overlap and past appointments', () => {
  const s = seed(0);
  assert.throws(() => addSlot(s, { clinicianId: 'maya', start: START + 2 * 60 * MINUTE, duration: 30, value: 75 }, START), /already has a slot/);
  assert.throws(() => addSlot(s, { clinicianId: 'maya', start: START - MINUTE, duration: 30, value: 75 }, START), /future/);
  addSlot(s, { clinicianId: 'maya', start: START + 4 * 60 * MINUTE, duration: 30, value: 75, patientName: '' }, START);
  assert.equal(s.slots.length, 7);
  assert.equal(activeBooking(s, s.slots.at(-1).id), undefined);
});
test('the sample note extracts Tuesday afternoons and one hour notice', () => {
  const result = parsePreferences('I can come on Tuesdays between 2 and 5 in the afternoon, and I need at least an hour’s notice.');
  assert.deepEqual(result.draft, { days: [2], from: 840, to: 1020, notice: 60 });
  assert.deepEqual(result.warnings, []);
});
test('explicit 24-hour and am/pm ranges work without inventing unspecified notice', () => {
  assert.deepEqual(parsePreferences('Tuesday 14:00–17:00').draft, { days: [2], from: 840, to: 1020 });
  assert.deepEqual(parsePreferences('Tuesdays 2pm to 5pm, 30 minutes notice').draft, { days: [2], from: 840, to: 1020, notice: 30 });
  assert.deepEqual(parsePreferences('Weekdays 9am–12pm').draft, { days: [1, 2, 3, 4, 5], from: 540, to: 720 });
});
test('ambiguous times, exceptions, and multiple windows require manual review', () => {
  for (const text of ['Tuesday 2 to 5', 'Tuesday afternoons', 'Tuesday 9am-10am or 2pm-5pm', 'Tuesday 11 to 2pm']) {
    const result = parsePreferences(text);
    assert.equal(result.draft.from, undefined, text);
    assert.ok(result.warnings.length);
  }
  assert.equal(parsePreferences('Not Tuesday, Wednesday 14:00-17:00').draft.days, undefined);
  assert.equal(parsePreferences('Monday to Friday 14:00-17:00').draft.days, undefined);
});
test('impossible time values are rejected', () => {
  for (const text of ['Tuesday 25:00-26:00', 'Tuesday 14:80-17:00', 'Tuesday 17:00-14:00']) {
    assert.equal(parsePreferences(text).draft.from, undefined);
  }
});

test('today’s appointment count excludes tomorrow’s slots', () => {
  const s = seed(0);
  addSlot(s, { clinicianId: 'maya', start: START + DAY, duration: 30, value: 75 }, START);
  assert.equal(metrics(s, START).appointments, 6);
  assert.equal(metrics(s, START + DAY).appointments, 1);
});
