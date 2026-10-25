export const DAY = 86_400_000;
export const MINUTE = 60_000;
export const START = Date.UTC(2026, 9, 27, 13);
export const CLINICIANS = [
  { id: 'maya', name: 'Maya Patel', initials: 'MP', treatment: 'Physiotherapy' },
  { id: 'noah', name: 'Noah Bennett', initials: 'NB', treatment: 'Physiotherapy' },
  { id: 'sofia', name: 'Sofia Williams', initials: 'SW', treatment: 'Dental' },
];
export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const uid = () => crypto.randomUUID();
export const clock = (state, realNow = Date.now()) => START + realNow - state.startedAt + state.offset;
export const clinician = id => CLINICIANS.find(c => c.id === id);
export const time = ms => new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }).format(ms);
export const dateLabel = ms => new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(ms);
export const sameDay = (a, b) => new Date(a).toISOString().slice(0, 10) === new Date(b).toISOString().slice(0, 10);
export const minutes = value => Number(value.split(':')[0]) * 60 + Number(value.split(':')[1]);
export const asTime = value => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
export const money = (value, currency = 'USD') => new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value);
export const activeBooking = (state, slotId) => state.bookings.find(b => b.slotId === slotId && b.status === 'confirmed');
export const activeOffer = (state, slotId, now) => state.offers.find(o => o.slotId === slotId && o.status === 'pending' && o.expiresAt > now);
export const slotStatus = (state, slot, now) => {
  const booking = activeBooking(state, slot.id);
  if (booking) return slot.start + slot.duration * MINUTE <= now ? 'completed' : booking.backfill ? 'filled' : 'booked';
  if (slot.start <= now) return 'elapsed';
  return activeOffer(state, slot.id, now) ? 'offered' : 'available';
};

export function seed(realNow = Date.now()) {
  const patient = (id, name, extra = {}) => ({ id, name, treatment: 'Physiotherapy', duration: 30, preferredClinician: '', days: [2], from: 14 * 60, to: 17 * 60, notice: 60, travel: 15, distance: 2.4, priority: 1, joinedAt: START - 12 * DAY, status: 'waiting', note: '', ...extra });
  const slots = [
    ['0900', 9, 0, 45, 'maya', 95], ['1000', 10, 0, 45, 'noah', 95], ['1115', 11, 15, 30, 'sofia', 85],
    ['1400', 14, 0, 45, 'maya', 95], ['1500', 15, 0, 30, 'maya', 75], ['1600', 16, 0, 45, 'noah', 95],
  ].map(([id, hour, min, duration, provider, value]) => ({ id: `slot-${id}`, start: Date.UTC(2026, 9, 27, hour, min), duration, clinicianId: provider, treatment: clinician(provider).treatment, value, vacancyId: null, openedAt: null }));
  const names = ['Ellie Wilson', 'Marcus Lee', 'Olivia Taylor', 'Grace Adams', 'Cameron Wright', 'Daniel Reed'];
  return {
    version: 1, workspaceId: uid(), startedAt: realNow, offset: 0,
    settings: { clinicName: 'Willow Clinic', offerMinutes: 2, currency: 'USD' },
    slots,
    bookings: slots.map((s, i) => ({ id: uid(), slotId: s.id, patientId: null, patientName: names[i], status: 'confirmed', createdAt: START - DAY, backfill: false })),
    patients: [
      patient('alex', 'Alex Morgan', { priority: 2, joinedAt: START - 18 * DAY }),
      patient('sam', 'Sam Rivera', { notice: 30, travel: 20, distance: 4.1, from: 13 * 60, to: 18 * 60 }),
      patient('taylor', 'Taylor Chen', { priority: 2, joinedAt: START - 21 * DAY, from: 9 * 60, to: 12 * 60, distance: 1.8 }),
      patient('priya', 'Priya Shah', { duration: 45, priority: 0, joinedAt: START - 7 * DAY, distance: 3.2, notice: 30 }),
      patient('jamie', 'Jamie Park', { treatment: 'Dental', preferredClinician: 'sofia', priority: 1, distance: 1.5 }),
      patient('oliver', 'Oliver James', { preferredClinician: 'noah', priority: 0, distance: 6.2, travel: 25, joinedAt: START - 4 * DAY }),
    ],
    offers: [],
    events: [{ id: uid(), type: 'workspace', at: START, title: 'A fresh start for your clinic', detail: 'Sample appointments and six waiting patients are ready.' }],
  };
}

function record(state, type, now, title, detail, extra = {}) {
  state.events.unshift({ id: uid(), type, at: now, title, detail, ...extra });
}

export function reconcile(state, now) {
  for (const offer of state.offers) {
    if (offer.status === 'pending' && offer.expiresAt <= now) {
      offer.status = 'expired';
      offer.respondedAt = now;
      record(state, 'expired', now, 'Offer expired', `${state.patients.find(p => p.id === offer.patientId)?.name || 'Patient'} did not respond in time. The next match can be contacted.`, { slotId: offer.slotId });
    }
  }
  return state;
}

export function eligibility(state, patient, slot, now, ignoreOffer = '') {
  const reasons = [];
  const date = new Date(slot.start);
  const start = date.getUTCHours() * 60 + date.getUTCMinutes();
  if (patient.status !== 'waiting') reasons.push(patient.status === 'fulfilled' ? 'Already booked from the waitlist' : 'Waitlist entry is paused');
  if (patient.treatment !== slot.treatment) reasons.push(`Needs ${patient.treatment.toLowerCase()}`);
  if (patient.preferredClinician && patient.preferredClinician !== slot.clinicianId) reasons.push(`Prefers ${clinician(patient.preferredClinician)?.name}`);
  if (patient.duration > slot.duration) reasons.push(`Needs a ${patient.duration}-minute appointment`);
  if (!patient.days.includes(date.getUTCDay()) || patient.from > start || patient.to < start + slot.duration) reasons.push(`Available ${patient.days.map(d => WEEKDAYS[d]).join(', ')} ${asTime(patient.from)}–${asTime(patient.to)}`);
  if (now + Math.max(patient.notice, patient.travel) * MINUTE > slot.start) reasons.push('Not enough notice or travel time');
  if (slot.start <= now) reasons.push('This appointment has already started');
  const conflict = state.bookings.some(b => {
    if (b.status !== 'confirmed' || b.patientId !== patient.id) return false;
    const other = state.slots.find(s => s.id === b.slotId);
    return other && other.start < slot.start + slot.duration * MINUTE && other.start + other.duration * MINUTE > slot.start;
  });
  if (conflict) reasons.push('Conflicting appointment');
  if (state.offers.some(o => o.id !== ignoreOffer && o.patientId === patient.id && o.status === 'pending' && o.expiresAt > now)) reasons.push('Already considering another offer');
  if (state.offers.some(o => o.id !== ignoreOffer && o.patientId === patient.id && o.slotId === slot.id && o.vacancyId === slot.vacancyId && ['declined', 'expired'].includes(o.status))) reasons.push('Already contacted for this opening');
  return { eligible: reasons.length === 0, reasons };
}

export function matches(state, slot, now) {
  return state.patients.map(patient => ({ patient, ...eligibility(state, patient, slot, now) }))
    .sort((a, b) => Number(b.eligible) - Number(a.eligible) || b.patient.priority - a.patient.priority || a.patient.joinedAt - b.patient.joinedAt || a.patient.distance - b.patient.distance || a.patient.id.localeCompare(b.patient.id));
}

export function cancelBooking(state, slotId, now) {
  reconcile(state, now);
  const slot = state.slots.find(s => s.id === slotId);
  const booking = activeBooking(state, slotId);
  if (!slot || !booking) throw new Error('This appointment is already available.');
  if (slot.start <= now) throw new Error('Only upcoming appointments can be cancelled.');
  booking.status = 'cancelled';
  booking.cancelledAt = now;
  slot.vacancyId = uid();
  slot.openedAt = now;
  if (booking.patientId) {
    const patient = state.patients.find(p => p.id === booking.patientId);
    if (patient) patient.status = 'waiting';
  }
  record(state, 'cancelled', now, `${time(slot.start)} appointment opened`, `${booking.patientName}'s ${slot.treatment.toLowerCase()} appointment was cancelled.`, { slotId });
  return state;
}

export function sendOffer(state, slotId, patientId, now) {
  reconcile(state, now);
  const slot = state.slots.find(s => s.id === slotId);
  const patient = state.patients.find(p => p.id === patientId);
  if (!slot || !patient) throw new Error('The appointment or patient no longer exists.');
  if (activeBooking(state, slotId)) throw new Error('This appointment is already booked.');
  if (activeOffer(state, slotId, now)) throw new Error('An offer is already active for this appointment.');
  const result = eligibility(state, patient, slot, now);
  if (!result.eligible) throw new Error(result.reasons[0]);
  const offer = { id: uid(), slotId, patientId, vacancyId: slot.vacancyId, status: 'pending', createdAt: now, expiresAt: Math.min(now + state.settings.offerMinutes * MINUTE, slot.start) };
  state.offers.unshift(offer);
  record(state, 'offered', now, `Offer sent to ${patient.name}`, `${time(slot.start)} · ${slot.duration} minutes · Patient preview is ready in the inbox.`, { slotId });
  return state;
}

export function respondToOffer(state, offerId, response, now) {
  reconcile(state, now);
  const offer = state.offers.find(o => o.id === offerId);
  if (!offer) throw new Error('This offer is not in this browser workspace.');
  if (offer.status === 'accepted' && response === 'accepted') return state;
  if (offer.status !== 'pending') throw new Error(`This offer has already been ${offer.status}.`);
  if (!['accepted', 'declined'].includes(response)) throw new Error('Unknown response.');
  const patient = state.patients.find(p => p.id === offer.patientId);
  const slot = state.slots.find(s => s.id === offer.slotId);
  if (!patient || !slot || offer.vacancyId !== slot.vacancyId) throw new Error('This opening is no longer available.');
  if (response === 'declined') {
    offer.status = 'declined'; offer.respondedAt = now;
    record(state, 'declined', now, `${patient.name} declined`, `The ${time(slot.start)} appointment is ready for the next match.`, { slotId: slot.id });
    return state;
  }
  if (activeBooking(state, slot.id)) throw new Error('This appointment has already been filled.');
  const result = eligibility(state, patient, slot, now, offer.id);
  if (!result.eligible) throw new Error(`Unable to accept: ${result.reasons[0]}.`);
  offer.status = 'accepted'; offer.respondedAt = now;
  patient.status = 'fulfilled';
  state.bookings.push({ id: uid(), slotId: slot.id, patientId: patient.id, patientName: patient.name, status: 'confirmed', createdAt: now, backfill: true, elapsed: Math.max(0, Math.round((now - slot.openedAt) / 1000)) });
  record(state, 'accepted', now, `${time(slot.start)} slot filled by ${patient.name}`, `Appointment confirmed. ${Math.max(0, Math.round((now - slot.openedAt) / 1000))} seconds from opening to booking.`, { slotId: slot.id });
  return state;
}

export function validatePatient(input) {
  if (!input.name?.trim() || input.name.trim().length > 80) throw new Error('Enter a patient name of 1–80 characters.');
  if (!['Physiotherapy', 'Dental'].includes(input.treatment)) throw new Error('Select an appointment type.');
  if (!Array.isArray(input.days) || !input.days.length || input.days.some(d => !Number.isInteger(d) || d < 0 || d > 6)) throw new Error('Select at least one available day.');
  if (!Number.isInteger(input.from) || !Number.isInteger(input.to) || input.from < 0 || input.to > 1440 || input.from >= input.to) throw new Error('Availability must end after it starts.');
  for (const [field, min, max] of [['duration', 15, 180], ['notice', 0, 10080], ['travel', 0, 240], ['distance', 0, 500]]) {
    if (!Number.isFinite(input[field]) || input[field] < min || input[field] > max) throw new Error(`Enter a valid ${field} (${min}–${max}).`);
  }
  if (![0, 1, 2].includes(input.priority)) throw new Error('Choose a valid priority.');
  if (input.preferredClinician && clinician(input.preferredClinician)?.treatment !== input.treatment) throw new Error('The preferred clinician must offer the selected treatment.');
  return { ...input, name: input.name.trim(), note: String(input.note || '').slice(0, 1000) };
}

export function savePatient(state, input, now) {
  const value = validatePatient(input);
  const current = state.patients.find(p => p.id === input.id);
  if (current && state.offers.some(o => o.patientId === current.id && o.status === 'pending' && o.expiresAt > now)) throw new Error('Resolve this patient’s active offer before editing their preferences.');
  if (current) Object.assign(current, value, { id: current.id, joinedAt: current.joinedAt, status: current.status });
  else state.patients.push({ ...value, id: uid(), joinedAt: now, status: 'waiting' });
  record(state, 'patient', now, current ? 'Waitlist preferences updated' : 'A new patient joined the waitlist', value.name);
  return state;
}

export function togglePatient(state, patientId, now) {
  const p = state.patients.find(p => p.id === patientId);
  if (!p || p.status === 'fulfilled') throw new Error('This patient is already booked.');
  if (state.offers.some(o => o.patientId === patientId && o.status === 'pending' && o.expiresAt > now)) throw new Error('Resolve the active offer before pausing this patient.');
  p.status = p.status === 'paused' ? 'waiting' : 'paused';
  record(state, 'patient', now, p.status === 'paused' ? 'Waitlist entry paused' : 'Waitlist entry resumed', p.name);
  return state;
}

export function addSlot(state, input, now) {
  const provider = clinician(input.clinicianId);
  if (!provider || !Number.isFinite(input.start) || input.start <= now) throw new Error('Choose a clinician and a future appointment time.');
  if (![15, 30, 45, 60, 90].includes(input.duration)) throw new Error('Choose a valid duration.');
  if (!Number.isFinite(input.value) || input.value < 0 || input.value > 10000) throw new Error('Enter an appointment value between 0 and 10,000.');
  if (state.slots.some(s => s.clinicianId === input.clinicianId && s.start < input.start + input.duration * MINUTE && s.start + s.duration * MINUTE > input.start)) throw new Error('This clinician already has a slot at that time.');
  const slot = { id: uid(), start: input.start, duration: input.duration, clinicianId: input.clinicianId, treatment: provider.treatment, value: input.value, vacancyId: uid(), openedAt: now };
  state.slots.push(slot);
  if (input.patientName?.trim()) {
    state.bookings.push({ id: uid(), slotId: slot.id, patientId: null, patientName: input.patientName.trim().slice(0, 80), status: 'confirmed', createdAt: now, backfill: false });
    slot.vacancyId = null; slot.openedAt = null;
  }
  record(state, 'appointment', now, 'Appointment added', `${time(slot.start)} · ${provider.name} · ${slot.duration} minutes`, { slotId: slot.id });
  return state;
}

export function metrics(state, now) {
  const fills = state.bookings.filter(b => b.backfill && b.status === 'confirmed');
  return {
    appointments: state.slots.filter(s => sameDay(s.start, now)).length,
    open: state.slots.filter(s => !activeBooking(state, s.id) && s.start > now).length,
    waiting: state.patients.filter(p => p.status === 'waiting').length,
    filled: fills.length,
    recovered: fills.reduce((sum, b) => sum + (state.slots.find(s => s.id === b.slotId)?.value || 0), 0),
    average: fills.length ? Math.round(fills.reduce((sum, b) => sum + b.elapsed, 0) / fills.length) : null,
  };
}
