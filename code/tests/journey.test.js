import test from 'node:test';
import assert from 'node:assert/strict';
import { seed, START, MINUTE, cancelBooking, sendOffer, respondToOffer, reconcile } from '../engine.js';
import { recoveryJourney } from '../journey.js';

const view = (state, now = START) => recoveryJourney(state, 'slot-1500', now);

test('journey follows real cancellation, offer and acceptance records after serialization', () => {
  const state = seed(0);
  assert.equal(view(state).completedSteps, 0);
  cancelBooking(state, 'slot-1500', START);
  assert.equal(view(state).status, 'matching');
  assert.deepEqual(view(state).eligible.map(m => m.patient.id), ['alex', 'sam']);
  sendOffer(state, 'slot-1500', 'alex', START + 1000);
  assert.equal(view(state).status, 'pending');
  assert.equal(view(state).completedSteps, 2);
  respondToOffer(state, state.offers[0].id, 'accepted', START + 25000);
  const restored = view(JSON.parse(JSON.stringify(state)), START + 26000);
  assert.equal(restored.status, 'filled');
  assert.equal(restored.completedSteps, 4);
  assert.equal(restored.booking.patientName, 'Alex Morgan');
  assert.equal(restored.booking.elapsed, 25);
  assert.equal(restored.slot.value, 75);
});

test('expiry and decline return to matching or manual follow-up, never completion', () => {
  const state = seed(0);
  cancelBooking(state, 'slot-1500', START);
  sendOffer(state, 'slot-1500', 'alex', START);
  const later = START + 3 * MINUTE;
  // A render at the deadline must not show an expired offer as pending.
  assert.equal(view(state, later).status, 'matching');
  assert.equal(view(state, later).closed.status, 'expired');
  assert.equal(view(state, later).eligible[0].patient.id, 'sam');
  assert.equal(state.offers[0].status, 'pending');
  reconcile(state, later);
  assert.equal(view(state, later).eligible[0].patient.id, 'sam');
  sendOffer(state, 'slot-1500', 'sam', later);
  respondToOffer(state, state.offers[0].id, 'declined', later + 1000);
  const result = view(state, later + 1000);
  assert.equal(result.status, 'manual');
  assert.equal(result.completedSteps, 1);
  assert.equal(result.booking, undefined);
  assert.deepEqual(result.closed, { patientName: 'Sam Rivera', status: 'declined' });
});

test('a reopened vacancy does not reuse old completion or closed-offer evidence', () => {
  const state = seed(0);
  cancelBooking(state, 'slot-1500', START);
  sendOffer(state, 'slot-1500', 'alex', START);
  respondToOffer(state, state.offers[0].id, 'declined', START + 1000);
  sendOffer(state, 'slot-1500', 'sam', START + 2000);
  respondToOffer(state, state.offers[0].id, 'accepted', START + 3000);
  cancelBooking(state, 'slot-1500', START + 4000);
  assert.equal(view(state).status, 'matching');
  assert.equal(view(state).completedSteps, 1);
  assert.equal(view(state).closed, null);
});

test('a missed opening is elapsed and a missing slot has no journey', () => {
  const state = seed(0);
  cancelBooking(state, 'slot-1500', START);
  assert.equal(view(state, START + 120 * MINUTE).status, 'elapsed');
  assert.equal(recoveryJourney(state, 'missing', START), null);
});
