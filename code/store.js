import { seed, clock, reconcile } from './engine.js';
export const STORAGE_KEY = 'cancellation-backfill.workspace.v1';
const LOCK_KEY = 'cancellation-backfill.write.v1';
let memory = null;
let persistence = true;
const listeners = new Set();

function read() {
  if (!persistence) return memory || seed();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const value = JSON.parse(raw);
      if (value.version === 1 && typeof value.startedAt === 'number' && Array.isArray(value.slots) && Array.isArray(value.patients) && Array.isArray(value.offers) && Array.isArray(value.bookings) && Array.isArray(value.events) && value.settings) return value;
      throw new Error('Unsupported workspace');
    }
    const value = seed(); localStorage.setItem(STORAGE_KEY, JSON.stringify(value)); return value;
  } catch { persistence = false; return memory || seed(); }
}
memory = read();
export const getState = () => memory;
export const isPersistent = () => persistence;
export function subscribe(callback) { listeners.add(callback); return () => listeners.delete(callback); }
function emit() { for (const fn of listeners) fn(memory); }

export async function transact(operation) {
  const run = () => {
    const current = structuredClone(read());
    const now = clock(current);
    reconcile(current, now);
    const next = operation(current, now) || current;
    // Never report a saved change when the browser refused the write.
    if (persistence) localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    memory = next; emit(); return next;
  };
  if (persistence && !navigator.locks) throw new Error('This browser cannot safely update shared tabs. Use a current browser over HTTPS or localhost.');
  return navigator.locks ? navigator.locks.request(LOCK_KEY, run) : run();
}
export function resetWorkspace() { return transact(() => seed()); }
window.addEventListener('storage', event => {
  if (event.key === STORAGE_KEY) { memory = read(); emit(); }
});
