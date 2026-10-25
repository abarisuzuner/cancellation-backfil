import test from 'node:test';
import assert from 'node:assert/strict';
import { cancelBooking, sendOffer, respondToOffer } from '../engine.js';

// Exercise the persistence adapter with the same queued lock semantics as Web Locks.
const saved = new Map();
globalThis.localStorage = { getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value) };
globalThis.window = { addEventListener() {} };
let queue = Promise.resolve();
let requests = 0;
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { locks: { request: (_name, callback) => {
  requests += 1;
  const current = queue.then(callback);
  queue = current.catch(() => {});
  return current;
} } } });
const { transact, resetWorkspace, getState, STORAGE_KEY } = await import('../store.js');

test('serialized competing offers read the newest persisted state', async () => {
  await resetWorkspace();
  await transact((s, now) => cancelBooking(s, 'slot-1500', now));
  const results = await Promise.allSettled([
    transact((s, now) => sendOffer(s, 'slot-1500', 'alex', now)),
    transact((s, now) => sendOffer(s, 'slot-1500', 'sam', now)),
  ]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.filter(r => r.status === 'rejected').length, 1);
  assert.equal(getState().offers.filter(o => o.status === 'pending').length, 1);
  assert.equal(JSON.parse(saved.get(STORAGE_KEY)).offers.length, 1);
});

test('concurrent acceptance is idempotent across serialized writes', async () => {
  await resetWorkspace();
  await transact((s, now) => cancelBooking(s, 'slot-1500', now));
  await transact((s, now) => sendOffer(s, 'slot-1500', 'alex', now));
  const id = getState().offers[0].id;
  await Promise.all([
    transact((s, now) => respondToOffer(s, id, 'accepted', now)),
    transact((s, now) => respondToOffer(s, id, 'accepted', now)),
  ]);
  const restored = JSON.parse(saved.get(STORAGE_KEY));
  assert.equal(restored.bookings.filter(b => b.slotId === 'slot-1500' && b.status === 'confirmed').length, 1);
  assert.equal(restored.events.filter(e => e.type === 'accepted').length, 1);
  assert.ok(requests >= 9);
});

test('a refused storage write does not report a successful in-memory update', async () => {
  const oldName = getState().settings.clinicName;
  const save = localStorage.setItem;
  localStorage.setItem = () => { throw new Error('Storage quota exceeded'); };
  await assert.rejects(transact(s => { s.settings.clinicName = 'Not saved'; return s; }), /quota/);
  assert.equal(getState().settings.clinicName, oldName);
  localStorage.setItem = save;
});
