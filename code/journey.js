import { activeBooking, activeOffer, matches } from './engine.js';

// Derive progress from saved records, so refreshes and unsuccessful offers tell
// the same story as the appointment book. Never store a separate demo result.
export function recoveryJourney(state, slotId, now) {
  state = { ...state, offers: state.offers.map(o => o.status === 'pending' && o.expiresAt <= now ? { ...o, status: 'expired' } : o) };
  const slot = state.slots.find(s => s.id === slotId);
  if (!slot) return null;
  const booking = activeBooking(state, slotId);
  const offer = activeOffer(state, slotId, now);
  const eligible = !booking && slot.start > now ? matches(state, slot, now).filter(m => m.eligible) : [];
  const closed = state.offers.find(o => o.slotId === slotId && o.vacancyId === slot.vacancyId &&
    (['declined', 'expired'].includes(o.status) || (o.status === 'pending' && o.expiresAt <= now)));
  const status = booking?.backfill ? 'filled' : slot.start <= now ? 'elapsed' : booking ? 'booked' : offer ? 'pending' : eligible.length ? 'matching' : 'manual';
  return {
    status, slot, booking, offer, eligible,
    completedSteps: status === 'filled' ? 4 : status === 'pending' ? 2 : slot.openedAt !== null ? 1 : 0,
    closed: closed ? { patientName: state.patients.find(p => p.id === closed.patientId)?.name || 'The patient', status: closed.status === 'declined' ? 'declined' : 'expired' } : null,
  };
}
