import { CLINICIANS, WEEKDAYS, DAY, MINUTE, uid, clock, clinician, time, dateLabel, sameDay, minutes, asTime, money, activeBooking, activeOffer, slotStatus, matches, metrics, cancelBooking, sendOffer, respondToOffer, savePatient, togglePatient, addSlot, reconcile } from './engine.js';
import { getState, subscribe, transact, resetWorkspace, isPersistent } from './store.js';
import { parsePreferences } from './parser.js';

const $ = selector => document.querySelector(selector);
const app = $('#app');
const modalRoot = $('#modal-root');
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const initials = name => name.split(/\s+/).map(s => s[0]).slice(0, 2).join('').toUpperCase();
const paths = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M16 3v4M8 3v4M3 11h18M8 15h2M14 15h2"/>',
  users: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6M18 15a5 5 0 0 1 3 4v2"/>',
  inbox: '<path d="m4 4-2 10v6h20v-6L20 4zM2 14h6l2 3h4l2-3h6"/>',
  activity: '<path d="M2 12h5l3-8 4 16 3-8h5"/>',
  settings: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3" fill="currentColor" stroke="none"/><circle cx="15" cy="17" r="3" fill="currentColor" stroke="none"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  up: '<path d="M6 18 18 6M6 6h12v12"/>',
  back: '<path d="M20 12H4m6-6-6 6 6 6"/>',
  plus: '<path d="M12 4v16M4 12h16"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
  spark: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5zM20 2v4M18 4h4"/>',
  reset: '<path d="M3 10a9 9 0 1 1 2 9M3 4v6h6"/>',
  search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',
  location: '<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 0 1 14 0Z"/><circle cx="12" cy="10" r="2"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  leaf: '<path d="M20 3c-9 0-16 3-16 10a7 7 0 0 0 7 7c7 0 9-8 9-17ZM4 21l10-11"/>',
  wallet: '<rect x="3" y="5" width="18" height="15" rx="3"/><path d="M3 9h18M17 14h4"/>',
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6zM8 12l3 3 5-6"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  edit: '<path d="m16 3 5 5-12 12-6 1 1-6zM13 6l5 5"/>',
  copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
};
const icon = (name, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.info}</svg>`;
const avatar = (name, cls = '') => `<span class="avatar ${cls}">${escape(initials(name))}</span>`;
const brand = () => `<a class="brand" href="#overview" aria-label="Backfill overview"><img src="./code/favicon.svg" alt="" width="36" height="36"/><span>backfill<span class="brand-dot">.</span></span></a>`;
const badge = (status, label = '') => `<span class="badge ${escape(status)}"><span class="status-dot"></span>${escape(label || ({ booked: 'Booked', available: 'Open slot', offered: 'Offer sent', completed: 'Completed', filled: 'Refilled', elapsed: 'Unfilled', waiting: 'Waiting', paused: 'Paused', fulfilled: 'Booked', pending: 'Awaiting reply', accepted: 'Accepted', declined: 'Declined', expired: 'Expired' })[status] || status)}</span>`;
const priority = p => `<span class="priority priority-${p}">${['Routine', 'Priority', 'High priority'][p]}</span>`;
const countdown = (expiry, now) => { const seconds = Math.max(0, Math.ceil((expiry - now) / 1000)); return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`; };
const duration = seconds => seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
let selectedSlot = 'slot-1500';
let search = '';
let patientFilter = 'all';
let appointmentFilter = 'all';
let currentModal = null;
let modalOpener = null;
let toastTimer;
let inFlight = false;

function route() { const [view = 'overview', id] = location.hash.slice(1).split('/'); return { view: ['overview', 'appointments', 'waitlist', 'inbox', 'activity', 'settings', 'offer'].includes(view) ? view : 'overview', id }; }
function go(view) { if (location.hash === `#${view}`) render(); else location.hash = view; }
function notify(message, error = false) {
  const element = $('#toast');
  element.innerHTML = `${icon(error ? 'info' : 'check')}<span>${escape(message)}</span>`;
  element.className = `toast visible ${error ? 'error' : ''}`;
  element.setAttribute('role', error ? 'alert' : 'status');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => element.classList.remove('visible'), 5000);
}
async function change(operation, message) {
  if (inFlight) return false;
  inFlight = true;
  try { await transact(operation); if (message) notify(message); return true; }
  catch (error) { notify(error.message || 'The change could not be saved.', true); return false; }
  finally { inFlight = false; }
}

function sidebar(view, state, now) {
  const nav = [ ['overview', 'grid', 'Overview'], ['appointments', 'calendar', 'Appointments'], ['waitlist', 'users', 'Waitlist', state.patients.filter(p => p.status === 'waiting').length], ['inbox', 'inbox', 'Patient inbox', state.offers.filter(o => o.status === 'pending' && o.expiresAt > now).length], ['activity', 'activity', 'Activity'] ];
  return `<aside class="sidebar">${brand()}<div class="workspace-label">CLINIC WORKSPACE</div><nav aria-label="Main navigation">${nav.map(([key, glyph, label, count]) => `<a class="nav-item ${view === key ? 'active' : ''}" href="#${key}" ${view === key ? 'aria-current="page"' : ''}>${icon(glyph)}<span>${label}</span>${count ? `<span class="nav-count">${count}</span>` : ''}</a>`).join('')}</nav><div class="sidebar-bottom"><div class="sidebar-note">${icon('leaf')}<p>A little less waiting.<br><strong>A little more living.</strong></p></div><a class="nav-item ${view === 'settings' ? 'active' : ''}" href="#settings">${icon('settings')}<span>Clinic settings</span></a><div class="clinic-switch"><span class="clinic-symbol">W</span><div><strong>${escape(state.settings.clinicName)}</strong><small>Sample clinic workspace</small></div><span class="online-dot"></span></div></div></aside>`;
}
function header(view, state, now) {
  const titles = { overview: 'Overview', appointments: 'Appointments', waitlist: 'Waitlist', inbox: 'Patient inbox', activity: 'Activity', settings: 'Clinic settings' };
  return `<header class="topbar"><div class="breadcrumb">Workspace ${icon('chevron')}<strong>${titles[view]}</strong></div><div class="top-actions"><span class="clinic-clock">${icon('clock')}<span data-clock>${time(now)}</span><span class="clock-label">clinic time</span></span><a class="icon-btn mobile-settings" href="#settings" aria-label="Clinic settings">${icon('settings')}</a><button class="icon-btn help-button" data-action="guide" aria-label="How it works">${icon('info')}</button><span class="user-avatar" aria-label="Sample clinic coordinator">JD</span></div></header>`;
}
function pageHead(eyebrow, title, subtitle, action = '') { return `<div class="page-head"><div><p class="eyebrow">${eyebrow}</p><h1>${title}</h1><p class="page-description">${subtitle}</p></div>${action}</div>`; }
function empty(glyph, title, detail, action = '') { return `<div class="empty-state"><div class="empty-icon">${icon(glyph)}</div><h3>${title}</h3><p>${detail}</p>${action}</div>`; }
function slotRows(state, now, slots) {
  return slots.map(slot => {
    const booking = activeBooking(state, slot.id);
    const status = slotStatus(state, slot, now);
    const provider = clinician(slot.clinicianId);
    return `<tr class="${selectedSlot === slot.id ? 'selected-row' : ''} ${status === 'completed' ? 'past-row' : ''}"><td><button class="time-select" data-action="select-slot" data-id="${slot.id}" aria-label="View ${time(slot.start)} appointment"><strong>${time(slot.start)}</strong><span>${slot.duration} min${sameDay(slot.start, now) ? '' : ' · ' + new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(slot.start)}</span></button></td><td><div class="patient-cell">${booking ? avatar(booking.patientName, status === 'filled' ? 'sage' : '') : `<span class="avatar open-avatar">${icon('plus')}</span>`}<div><strong>${escape(booking?.patientName || 'Ready for a patient')}</strong><small>${escape(slot.treatment)}</small></div></div></td><td class="provider-cell"><span>${escape(provider.name)}</span></td><td>${badge(status)}</td><td class="row-action">${booking && slot.start > now ? `<button class="text-btn cancel-link" data-action="cancel" data-id="${slot.id}" aria-label="Cancel ${time(slot.start)} appointment">Cancel</button>` : !booking && slot.start > now ? `<button class="text-btn" data-action="select-slot" data-id="${slot.id}">Match ${icon('arrow')}</button>` : `<span class="muted">—</span>`}</td></tr>`;
  }).join('');
}
function schedule(state, now, full = false) {
  const all = state.slots.filter(s => full || sameDay(s.start, now)).sort((a, b) => a.start - b.start);
  const slots = full ? all.filter(s => appointmentFilter === 'all' || (appointmentFilter === 'upcoming' ? s.start > now : appointmentFilter === 'available' ? !activeBooking(state, s.id) && s.start > now : slotStatus(state, s, now) === 'filled')) : all;
  return `<section class="card schedule-card"><div class="card-heading"><div><h2>${full ? 'Appointment book' : 'Today’s appointments'}</h2><p>${full ? 'Your calendar, with every opening accounted for.' : `${all.length} appointments · ${CLINICIANS.length} clinicians`}</p></div>${full ? '' : `<a href="#appointments" class="text-btn">View all ${icon('up')}</a>`}</div>${full ? `<div class="filter-bar" role="group" aria-label="Filter appointments">${[['all', 'All appointments'], ['upcoming', 'Upcoming'], ['available', 'Open slots'], ['filled', 'Refilled']].map(([id, label]) => `<button class="filter-tab ${appointmentFilter === id ? 'active' : ''}" data-action="appointment-filter" data-id="${id}" aria-pressed="${appointmentFilter === id}">${label}</button>`).join('')}</div>` : ''}<div class="table-scroll"><table class="schedule-table"><thead><tr><th>TIME</th><th>PATIENT / VISIT</th><th class="provider-cell">CLINICIAN</th><th>STATUS</th><th><span class="sr-only">Actions</span></th></tr></thead><tbody>${slotRows(state, now, slots)}</tbody></table></div>${!slots.length ? empty('calendar', 'Nothing here just yet', 'Appointments that match this filter will appear here.') : ''}<div class="schedule-footer"><span class="mini-dot"></span>Sample appointments · ${dateLabel(now)}<span class="footer-time">All times follow the clinic clock</span></div></section>`;
}
function matchPanel(state, now) {
  const slot = state.slots.find(s => s.id === selectedSlot) || state.slots.find(s => !activeBooking(state, s.id) && s.start > now) || state.slots[0];
  const booking = activeBooking(state, slot.id);
  const offer = activeOffer(state, slot.id, now);
  const heading = `<div class="card-heading"><div><p class="eyebrow">THE NEXT RIGHT MATCH</p><h2>Backfill workspace</h2></div><span class="panel-icon">${icon('spark')}</span></div><div class="selected-slot">${icon('calendar')}<span><strong>${time(slot.start)} · ${slot.treatment}</strong><small>${slot.duration} min with ${escape(clinician(slot.clinicianId).name)}</small></span></div>`;
  if (booking?.backfill) return `<section class="card match-card">${heading}<div class="filled-state"><div class="success-ring">${icon('check')}</div><h3>That’s a good match.</h3><p>${escape(booking.patientName)} is booked.<br>One less empty appointment.</p><div class="result-stat"><strong>${duration(booking.elapsed)}</strong><span>from opening to filled</span></div><a class="button secondary full" href="#activity">View the journey ${icon('arrow')}</a></div></section>`;
  if (booking || slot.start <= now) return `<section class="card match-card">${heading}<div class="ready-state"><div class="orbit"><span>${icon('calendar')}</span><i></i><span>${icon('users')}</span></div><h3>Good care finds a way.</h3><p>${slot.start <= now ? 'Select an upcoming appointment to explore its next match.' : 'When a slot opens, we’ll help you find the right person to fill it.'}</p>${slot.start > now ? `<button class="button secondary full" data-action="cancel" data-id="${slot.id}">Open this appointment ${icon('arrow')}</button>` : ''}<div class="match-hint">${icon('shield')}Priority, availability, and distance.<br>Always reviewed by you.</div></div></section>`;
  if (offer) {
    const patient = state.patients.find(p => p.id === offer.patientId);
    return `<section class="card match-card">${heading}<div class="active-offer"><span class="badge offered"><span class="status-dot"></span>Waiting for a reply</span>${avatar(patient.name, 'large sage')}<h3>${escape(patient.name)}</h3><p>An earlier appointment is one click away.</p><div class="countdown-box">${icon('clock')}<strong data-countdown="${offer.expiresAt}">${countdown(offer.expiresAt, now)}</strong><span>remaining to accept</span></div><a class="button primary full" href="#offer/${offer.id}">Open patient preview ${icon('up')}</a><a class="text-btn centered" href="#inbox">View patient inbox ${icon('arrow')}</a><small>Preview only. No external message is sent.</small></div></section>`;
  }
  const ranked = matches(state, slot, now), eligible = ranked.filter(m => m.eligible), excluded = ranked.filter(m => !m.eligible);
  return `<section class="card match-card">${heading}<div class="matches-header"><strong>${eligible.length} ${eligible.length === 1 ? 'eligible patient' : 'eligible patients'}</strong><span>Best match first</span></div>${eligible.length ? `<div class="candidate-list">${eligible.map(({ patient: p }, i) => `<article class="candidate ${i === 0 ? 'best' : ''}">${i === 0 ? `<div class="best-label">${icon('spark')} RECOMMENDED MATCH</div>` : ''}<div class="candidate-name">${avatar(p.name, i === 0 ? 'sage' : '')}<div><h3>${escape(p.name)}</h3><span>${priority(p.priority)}<small>Waiting ${Math.max(0, Math.floor((now - p.joinedAt) / DAY))}d</small></span></div></div><div class="candidate-facts"><span>${icon('clock')}${asTime(p.from)}–${asTime(p.to)}</span><span>${icon('location')}${p.distance} km away</span></div><button class="button ${i === 0 ? 'primary' : 'secondary'} full" data-action="send-offer" data-slot="${slot.id}" data-id="${p.id}">Offer this appointment ${icon('arrow')}</button></article>`).join('')}</div>` : empty('users', 'No eligible match right now', 'Keep the slot open for manual follow-up, or review the waitlist preferences.', `<a class="button secondary" href="#waitlist">Review waitlist ${icon('arrow')}</a>`)}${excluded.length ? `<details class="excluded"><summary>${excluded.length} patients not eligible ${icon('chevron')}</summary>${excluded.map(({ patient, reasons }) => `<div><strong>${escape(patient.name)}</strong><p>${escape(reasons.join(' · '))}</p></div>`).join('')}</details>` : ''}</section>`;
}
function overview(state, now) {
  const stats = metrics(state, now);
  const filled = state.bookings.find(b => b.slotId === 'slot-1500' && b.status === 'confirmed' && b.backfill);
  const target = state.slots.find(s => s.id === 'slot-1500');
  const scenarioEnded = !filled && target.start <= now;
  return `${pageHead(dateLabel(now).toUpperCase(), 'A little less waiting.', 'A full schedule. Earlier care. Let’s make both happen.', `<button class="button primary" data-action="new-slot">${icon('plus')} New appointment</button>`)}<div class="metrics-grid">${[
    ['calendar', 'Appointments today', stats.appointments, `${state.slots.filter(s => sameDay(s.start, now) && s.start > now).length} still ahead today`, 'neutral'],
    ['users', 'Patients waiting', stats.waiting, 'An earlier visit could make their day', 'neutral'],
    ['wallet', 'Value recovered', money(stats.recovered, state.settings.currency), `${stats.filled} ${stats.filled === 1 ? 'appointment' : 'appointments'} backfilled · estimated`, 'green'],
    ['clock', 'Average time to fill', stats.average === null ? '—' : duration(stats.average), stats.average === null ? 'Your first match starts here' : 'From cancellation to confirmation', 'neutral'],
  ].map(([glyph, label, value, detail, tone]) => `<article class="metric"><div class="metric-top"><span>${label}</span><span class="metric-icon ${tone}">${icon(glyph)}</span></div><strong>${value}</strong><small>${detail}</small></article>`).join('')}</div><section class="journey-banner"><div class="journey-mark">${icon(filled ? 'check' : 'leaf')}</div><div><span class="eyebrow">${filled ? 'ONE LESS EMPTY APPOINTMENT' : 'SMALL OPENINGS. REAL POSSIBILITIES.'}</span><h2>${filled ? `${escape(filled.patientName)} is on the calendar.` : 'A cancellation can be someone’s good news.'}</h2><p>${filled ? `Your 15:00 opening was filled in ${duration(filled.elapsed)}. That’s a little more care, delivered.` : 'Try the 15:00 scenario: open a slot, find a match, and fill it in moments.'}</p></div><button class="button cream" data-action="${filled ? 'show-activity' : scenarioEnded ? 'reset' : activeBooking(state, target.id) ? 'cancel' : 'select-slot'}" data-id="slot-1500">${filled ? 'See the journey' : scenarioEnded ? 'Start a fresh day' : activeBooking(state, target.id) ? 'Try a cancellation' : 'Find a match'} ${icon('arrow')}</button></section><div class="dashboard-grid"><div>${schedule(state, now)}${recentActivity(state)}</div>${matchPanel(state, now)}</div>`;
}
function recentActivity(state) { return `<section class="card recent-card"><div class="card-heading"><div><h2>A little progress, at a glance</h2><p>The latest from your clinic.</p></div><a class="text-btn" href="#activity">All activity ${icon('up')}</a></div>${state.events.slice(0, 3).map(e => `<div class="recent-event"><span class="event-icon ${e.type}">${icon(eventIcon(e.type))}</span><div><strong>${escape(e.title)}</strong><small>${escape(e.detail)}</small></div><time>${time(e.at)}</time></div>`).join('')}</section>`; }
function patientRows(state, now) {
  const patients = state.patients.filter(p => (!search || `${p.name} ${p.treatment}`.toLowerCase().includes(search.toLowerCase())) && (patientFilter === 'all' || p.status === patientFilter));
  if (!patients.length) return `<tr><td colspan="7">${empty('search', 'No patients found', 'Try another name or change the status filter.')}</td></tr>`;
  return patients.map(p => `<tr><td><div class="patient-cell">${avatar(p.name, p.priority === 2 ? 'sage' : '')}<div><strong>${escape(p.name)}</strong><small>${escape(p.treatment)} · ${p.duration} min</small></div></div></td><td>${priority(p.priority)}</td><td><span class="table-detail">${p.days.map(d => WEEKDAYS[d]).join(', ')}</span><small class="table-sub">${asTime(p.from)}–${asTime(p.to)}</small></td><td><span class="table-detail">${p.distance} km</span><small class="table-sub">${p.notice} min notice</small></td><td><span class="table-detail">${Math.max(0, Math.floor((now - p.joinedAt) / DAY))} days</span></td><td>${badge(p.status)}</td><td class="row-action"><button class="icon-btn" data-action="edit-patient" data-id="${p.id}" aria-label="Edit ${escape(p.name)}">${icon('edit')}</button>${p.status !== 'fulfilled' ? `<button class="icon-btn" data-action="toggle-patient" data-id="${p.id}" aria-label="${p.status === 'paused' ? 'Resume' : 'Pause'} ${escape(p.name)}">${icon(p.status === 'paused' ? 'reset' : 'pause')}</button>` : ''}</td></tr>`).join('');
}
function waitlist(state, now) {
  return `${pageHead('THE PEOPLE BEHIND THE OPENINGS', 'Care, worth the wait.', 'Keep preferences up to date. Make the next opening count.', `<button class="button primary" data-action="new-patient">${icon('plus')} Add to waitlist</button>`)}<div class="quiet-banner">${icon('spark')}<span><strong>Less typing. Clearer preferences.</strong> Use the local availability assistant when adding or editing a patient.</span></div><section class="card"><div class="list-toolbar"><div><h2>Your waitlist <span class="heading-count">${state.patients.length}</span></h2><p>Every patient has their own right time.</p></div><div class="list-controls"><label class="search-field">${icon('search')}<input id="patient-search" type="search" placeholder="Search patients…" aria-label="Search patients" value="${escape(search)}"/></label><select id="patient-filter" aria-label="Filter waitlist by status">${[['all', 'All statuses'], ['waiting', 'Waiting'], ['paused', 'Paused'], ['fulfilled', 'Booked']].map(([v, label]) => `<option value="${v}" ${v === patientFilter ? 'selected' : ''}>${label}</option>`).join('')}</select></div></div><div class="table-scroll"><table class="patient-table"><thead><tr><th>PATIENT</th><th>PRIORITY</th><th>AVAILABILITY</th><th>DISTANCE</th><th>WAITING</th><th>STATUS</th><th><span class="sr-only">Actions</span></th></tr></thead><tbody id="patient-rows">${patientRows(state, now)}</tbody></table></div></section><p class="page-footnote">${icon('info')}Use fictional patient details in this sample workspace. Your changes are stored only in this browser.</p>`;
}
function inbox(state, now) {
  const pending = state.offers.filter(o => o.status === 'pending' && o.expiresAt > now).length;
  return `${pageHead('A STEP CLOSER TO AN EARLIER VISIT', 'Patient inbox', 'Follow each offer, from invitation to confirmation.', `<span class="count-pill">${pending} awaiting ${pending === 1 ? 'reply' : 'replies'}</span>`)}<div class="quiet-banner">${icon('inbox')}<span><strong>A preview of the patient experience.</strong> Offers stay in this browser workspace. No SMS or email is sent.</span></div>${state.offers.length ? `<div class="offer-list">${state.offers.map(o => {
    const p = state.patients.find(p => p.id === o.patientId), slot = state.slots.find(s => s.id === o.slotId);
    return `<article class="card inbox-card">${avatar(p.name, 'large sage')}<div class="inbox-details"><div class="inbox-title"><h2>${escape(p.name)}</h2>${badge(o.status)}</div><p>${slot.treatment} with ${escape(clinician(slot.clinicianId).name)}</p><div class="inline-facts"><span>${icon('calendar')}${dateLabel(slot.start)}</span><span>${icon('clock')}${time(slot.start)} · ${slot.duration} min</span></div></div><div class="inbox-action">${o.status === 'pending' ? `<span class="expiry-label">Offer expires in <strong data-countdown="${o.expiresAt}">${countdown(o.expiresAt, now)}</strong></span>` : `<small class="muted">${o.status === 'accepted' ? 'Appointment confirmed' : 'This offer is closed'}</small>`}<a class="button ${o.status === 'pending' ? 'primary' : 'secondary'}" href="#offer/${o.id}">Open patient preview ${icon('up')}</a></div></article>`;
  }).join('')}</div>` : `<section class="card">${empty('inbox', 'Good news starts with an opening.', 'Send an appointment offer from the backfill workspace. It will appear here, ready for the patient to accept.', '<a class="button primary" href="#overview">Find an opportunity ' + icon('arrow') + '</a>')}</section>`}`;
}
const eventIcon = type => ({ accepted: 'check', cancelled: 'calendar', offered: 'inbox', expired: 'clock', declined: 'back', patient: 'users', appointment: 'plus', workspace: 'leaf', settings: 'settings', clock: 'clock' })[type] || 'activity';
function activity(state) {
  return `${pageHead('EVERY STEP, ACCOUNTED FOR', 'The care keeps moving.', 'A clear history of openings, offers, and appointments filled.', `<button class="button secondary" data-action="export">${icon('download')} Export activity</button>`)}<section class="card activity-card"><div class="card-heading"><div><h2>Clinic activity</h2><p>${state.events.length} events in this workspace</p></div><span class="badge waiting"><span class="status-dot"></span>Saved locally</span></div><div class="timeline">${state.events.map(e => `<article class="timeline-event"><div class="timeline-marker ${e.type}">${icon(eventIcon(e.type))}</div><div><div class="timeline-title"><h3>${escape(e.title)}</h3><time>${time(e.at)}</time></div><p>${escape(e.detail)}</p><small>${dateLabel(e.at)}</small></div></article>`).join('')}</div></section>`;
}
function settings(state, now) {
  return `${pageHead('MAKE YOUR WORKSPACE FEEL LIKE YOURS', 'Clinic settings', 'A few thoughtful defaults for a smoother day.')}<div class="settings-grid"><section class="card settings-card"><div class="card-heading"><div><h2>Clinic preferences</h2><p>Settings for this browser workspace.</p></div>${icon('settings')}</div><form id="settings-form"><label>Clinic name<input name="clinicName" required maxlength="60" value="${escape(state.settings.clinicName)}"/></label><div class="form-grid"><label>Offer response window<select name="offerMinutes">${[1, 2, 5, 10, 15].map(m => `<option value="${m}" ${state.settings.offerMinutes === m ? 'selected' : ''}>${m} ${m === 1 ? 'minute' : 'minutes'}</option>`).join('')}</select></label><label>Appointment currency<select name="currency">${['USD', 'EUR', 'GBP'].map(c => `<option ${state.settings.currency === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label></div><p class="field-help">Changing the response window applies to new offers. Existing offers keep their original expiry.</p><button class="button primary" type="submit">Save preferences ${icon('check')}</button></form></section><section class="card settings-card"><div class="card-heading"><div><h2>Explore the workflow</h2><p>A safe space to try every outcome.</p></div>${icon('leaf')}</div><div class="clock-setting"><span>Sample clinic clock</span><strong data-clock>${time(now)}</strong><small>${dateLabel(now)} · simulated local clinic time</small></div><button class="button secondary full" data-action="advance-clock">${icon('clock')} Advance clock by 3 minutes</button><p class="field-help">Try an offer expiry without waiting. This moves the clinic clock and rechecks pending offers.</p><hr/><button class="button danger-light full" data-action="reset">${icon('reset')} Reset sample workspace</button><p class="field-help">Restore the starting appointments and waitlist. Your local changes will be cleared.</p></section><section class="card settings-card wide"><div class="card-heading"><div><h2>About this workspace</h2><p>Built for exploring a better appointment workflow.</p></div>${icon('info')}</div><div class="about-grid"><div><strong>Local, by design</strong><p>Records live in this browser. Tabs share the same workspace; other browsers and devices have their own. Patient preview links work here only.</p></div><div><strong>Scheduling, with clear boundaries</strong><p>The availability assistant uses local parsing rules. No live AI, Oracle database, authentication, or external notifications are connected.</p></div><div><strong>Fictional records only</strong><p>This public application is an interactive sample, not a system for storing or managing real patient information.</p></div></div></section></div>`;
}
function patientView(state, id, now) {
  const offer = state.offers.find(o => o.id === id);
  if (!offer) return `<main class="patient-page"><div class="patient-top">${brand()}<a class="text-btn" href="#overview">${icon('back')} Back to clinic</a></div><section class="patient-offer-card">${empty('inbox', 'This offer isn’t available here.', 'Patient previews belong to the browser workspace that created them. The sample may also have been reset.', '<a class="button primary" href="#inbox">Open inbox ' + icon('arrow') + '</a>')}</section></main>`;
  const p = state.patients.find(p => p.id === offer.patientId), slot = state.slots.find(s => s.id === offer.slotId);
  const status = offer.status === 'pending' && offer.expiresAt <= now ? 'expired' : offer.status;
  const accepted = status === 'accepted';
  const booking = state.bookings.find(b => b.patientId === p.id && b.slotId === slot.id && b.status === 'confirmed');
  const stillBooked = accepted && !!booking;
  return `<main class="patient-page"><div class="patient-top">${brand()}<a class="text-btn" href="#inbox">${icon('back')} Return to clinic</a></div><div class="preview-label">${icon('shield')} PATIENT PREVIEW · SAMPLE APPOINTMENT</div><section class="patient-offer-card"><div class="patient-hero"><div class="patient-hero-icon ${stillBooked ? 'success' : ''}">${icon(stillBooked ? 'check' : status === 'pending' ? 'leaf' : 'clock')}</div><p class="eyebrow">${escape(state.settings.clinicName)}</p><h1>${stillBooked ? `You’re booked,<br>${escape(p.name.split(' ')[0])}.` : accepted ? 'This booking<br>was cancelled.' : status === 'pending' ? 'A little sooner.<br>A little better.' : status === 'declined' ? 'Thanks for letting<br>us know.' : 'This offer<br>has expired.'}</h1><p>${stillBooked ? 'Your earlier appointment is confirmed. We look forward to seeing you.' : accepted ? 'The clinic reopened this appointment. This original offer can no longer be used.' : status === 'pending' ? `Hi ${escape(p.name.split(' ')[0])}, an earlier appointment has opened up. We’re holding it for you.` : status === 'declined' ? 'You’ve declined this appointment. You’ll remain on the waitlist for another opening.' : 'The response window has closed. The clinic can now offer this appointment to another patient.'}</p></div><div class="appointment-ticket"><div class="ticket-date"><span>${new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'UTC' }).format(slot.start).toUpperCase()}</span><strong>${new Date(slot.start).getUTCDate()}</strong><span>${new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'UTC' }).format(slot.start).toUpperCase()}</span></div><div><h2>${slot.treatment}</h2><p>${time(slot.start)}–${time(slot.start + slot.duration * MINUTE)} <span>· ${slot.duration} minutes</span></p><small>With ${escape(clinician(slot.clinicianId).name)}</small></div></div>${status === 'pending' ? `<div class="offer-countdown">${icon('clock')}Reserved for <strong data-countdown="${offer.expiresAt}">${countdown(offer.expiresAt, now)}</strong> more</div><button class="button primary full accept-button" data-action="accept" data-id="${offer.id}">Accept appointment ${icon('check')}</button><button class="text-btn decline-button" data-action="decline" data-id="${offer.id}">This time doesn’t work for me</button>` : `<div class="response-confirmation ${stillBooked ? 'positive' : ''}">${icon(stillBooked ? 'check' : 'info')}${stillBooked ? `Confirmed for ${escape(p.name)}. No further action needed.` : 'This offer is closed.'}</div><a class="button secondary full" href="#overview">Return to clinic ${icon('arrow')}</a>`}<div class="preview-note">This preview uses fictional records saved in this browser. It does not reserve a real appointment.</div></section><button class="text-btn centered copy-link" data-action="copy-offer" data-id="${offer.id}">${icon('copy')} Copy preview link</button><p class="patient-footer">A little less waiting. A little more care.</p></main>`;
}

function render() {
  const state = getState(), now = clock(state), { view, id } = route();
  document.title = `${view === 'offer' ? 'Your appointment' : ({ overview: 'Overview', appointments: 'Appointments', waitlist: 'Waitlist', inbox: 'Patient inbox', activity: 'Activity', settings: 'Clinic settings' })[view]} · Backfill`;
  if (view === 'offer') app.innerHTML = patientView(state, id, now);
  else {
    const content = view === 'overview' ? overview(state, now) : view === 'appointments' ? `${pageHead('A DAY WITH ROOM FOR MORE CARE', 'Your appointment book', 'Manage your schedule and give every open slot a second chance.', `<button class="button primary" data-action="new-slot">${icon('plus')} New appointment</button>`)}<div class="dashboard-grid">${schedule(state, now, true)}${matchPanel(state, now)}</div>` : view === 'waitlist' ? waitlist(state, now) : view === 'inbox' ? inbox(state, now) : view === 'activity' ? activity(state) : settings(state, now);
    app.innerHTML = `<div class="app-shell">${sidebar(view, state, now)}<div class="main-shell">${header(view, state, now)}<main id="main-content" class="main-content">${!isPersistent() ? '<div class="storage-warning" role="alert">Browser storage is unavailable or the saved workspace could not be read. This session is temporary; changes will not survive refresh.</div>' : ''}${content}<footer class="app-footer"><span>${icon('leaf')}Less waiting. More care.</span><span>Sample workspace · Saved in this browser <span class="online-dot"></span></span></footer></main></div></div>`;
  }
}

function openModal(type, title, subtitle, body, extra = {}) {
  modalOpener = document.activeElement;
  currentModal = { type, ...extra };
  modalRoot.innerHTML = `<dialog class="modal ${type === 'patient' ? 'modal-wide' : ''}" aria-labelledby="dialog-title"><div class="modal-heading"><div><h2 id="dialog-title">${title}</h2><p>${subtitle}</p></div><button type="button" class="icon-btn" data-action="close-modal" aria-label="Close dialog">${icon('close')}</button></div>${body}</dialog>`;
  const dialog = modalRoot.querySelector('dialog');
  dialog.addEventListener('close', () => { modalRoot.innerHTML = ''; currentModal = null; if (modalOpener?.isConnected) modalOpener.focus(); });
  dialog.showModal();
}
function closeModal() { modalRoot.querySelector('dialog')?.close(); }
function cancelModal(id) {
  const state = getState(), slot = state.slots.find(s => s.id === id), booking = activeBooking(state, id);
  if (!slot || !booking) return notify('This appointment is already open.', true);
  openModal('cancel', 'Make room for the next patient.', 'Cancel this booking and reopen the appointment.', `<div class="cancel-summary">${avatar(booking.patientName, 'large')}<div><h3>${escape(booking.patientName)}</h3><p>${slot.treatment} · ${time(slot.start)} · ${slot.duration} min</p><small>${escape(clinician(slot.clinicianId).name)}</small></div></div><p class="modal-copy">The original booking stays in the activity history. We’ll check the waitlist for patients who can make this time.</p><form data-form="cancel"><div class="modal-actions"><button type="button" class="button secondary" data-action="close-modal">Keep appointment</button><button class="button primary" type="submit">Cancel & find a match ${icon('arrow')}</button></div></form>`, { id });
}
function patientModal(id = '') {
  const state = getState();
  const p = state.patients.find(p => p.id === id) || { name: '', treatment: 'Physiotherapy', duration: 30, preferredClinician: '', days: [2], from: 840, to: 1020, notice: 60, travel: 15, distance: 2, priority: 1, note: '' };
  openModal('patient', id ? 'A better picture of their availability.' : 'An earlier visit starts here.', id ? 'Review and update this patient’s waitlist preferences.' : 'Add a fictional patient to your sample waitlist.', `<form id="patient-form" data-form="patient"><div class="form-grid"><label>Patient name<input name="name" required maxlength="80" placeholder="e.g. Alex Morgan" value="${escape(p.name)}" autofocus/></label><label>Appointment type<select name="treatment">${['Physiotherapy', 'Dental'].map(t => `<option ${p.treatment === t ? 'selected' : ''}>${t}</option>`).join('')}</select></label></div><div class="assistant-box"><div class="assistant-title">${icon('spark')}<strong>Availability assistant</strong><span>LOCAL PARSER</span></div><p>Turn a scheduling note into a draft. This runs on your device; no AI service is connected.</p><label class="sr-only" for="scheduling-note">Scheduling note</label><textarea id="scheduling-note" name="note" rows="2" maxlength="1000" placeholder="Tuesdays between 2 and 5 in the afternoon, with at least 1 hour notice">${escape(p.note)}</textarea><button class="button small secondary" type="button" data-action="extract">${icon('spark')} Read availability</button><div id="parser-result" aria-live="polite"></div></div><fieldset class="day-field"><legend>Available days</legend><div class="day-options">${WEEKDAYS.map((day, i) => `<label class="day-option"><input type="checkbox" name="days" value="${i}" ${p.days.includes(i) ? 'checked' : ''}/><span>${day}</span></label>`).join('')}</div></fieldset><div class="form-grid"><label>Available from<input name="from" type="time" required value="${asTime(p.from)}"/></label><label>Available until<input name="to" type="time" required value="${asTime(p.to)}"/></label><label>Appointment length<select name="duration">${[15, 30, 45, 60, 90].map(n => `<option value="${n}" ${p.duration === n ? 'selected' : ''}>${n} minutes</option>`).join('')}</select></label><label>Preferred clinician<select name="preferredClinician"><option value="">Any compatible clinician</option>${CLINICIANS.filter(c => c.treatment === p.treatment).map(c => `<option value="${c.id}" ${p.preferredClinician === c.id ? 'selected' : ''}>${c.name}</option>`).join('')}</select></label><label>Minimum notice (minutes)<input name="notice" type="number" required min="0" max="10080" value="${p.notice}"/></label><label>Travel time (minutes)<input name="travel" type="number" required min="0" max="240" value="${p.travel}"/></label><label>Distance from clinic (km)<input name="distance" type="number" required min="0" max="500" step="0.1" value="${p.distance}"/></label><label>Staff-assigned priority<select name="priority">${['Routine', 'Priority', 'High priority'].map((label, i) => `<option value="${i}" ${p.priority === i ? 'selected' : ''}>${label}</option>`).join('')}</select></label></div><p class="field-help">Review all preferences before saving. Priority is assigned by staff, never inferred from the scheduling note.</p><div class="form-error" role="alert"></div><div class="modal-actions"><button type="button" class="button secondary" data-action="close-modal">Cancel</button><button type="submit" class="button primary">${id ? 'Save preferences' : 'Add to waitlist'} ${icon('check')}</button></div></form>`, { id });
}
function slotModal() {
  const state = getState(), now = clock(state), iso = new Date(now).toISOString().slice(0, 10);
  openModal('slot', 'Make space for care.', 'Add a booked appointment or an open slot.', `<form data-form="slot"><div class="form-grid"><label>Date<input name="date" type="date" required min="${iso}" value="${iso}"/></label><label>Start time<input name="time" type="time" required value="17:00"/></label><label>Clinician<select name="clinicianId">${CLINICIANS.map(c => `<option value="${c.id}">${c.name} · ${c.treatment}</option>`).join('')}</select></label><label>Duration<select name="duration">${[15, 30, 45, 60, 90].map(n => `<option value="${n}" ${n === 30 ? 'selected' : ''}>${n} minutes</option>`).join('')}</select></label></div><label>Patient name <span class="optional">optional</span><input name="patientName" maxlength="80" placeholder="Leave blank to create an open slot"/></label><label>Appointment value (${state.settings.currency})<input name="value" type="number" required min="0" max="10000" step="1" value="75"/></label><p class="field-help">Times use the sample clinic clock. The clinician determines the appointment type.</p><div class="form-error" role="alert"></div><div class="modal-actions"><button type="button" class="button secondary" data-action="close-modal">Cancel</button><button type="submit" class="button primary">Add appointment ${icon('plus')}</button></div></form>`);
}
function resetModal() {
  openModal('reset', 'Start with a fresh day?', 'Reset this browser’s sample clinic.', `<p class="modal-copy">Your added patients, appointment changes, offers, and activity will be replaced with the original fictional records. Other browsers are unaffected.</p><form data-form="reset"><div class="modal-actions"><button type="button" class="button secondary" data-action="close-modal">Keep my workspace</button><button type="submit" class="button danger">${icon('reset')} Reset workspace</button></div></form>`);
}
function guideModal() {
  openModal('guide', 'From an opening to a good outcome.', 'Explore the complete journey in about 30 seconds.', `<ol class="guide-steps"><li><span>01</span><div><strong>Open the 15:00 appointment</strong><p>Choose “Try a cancellation” on the overview. The original booking stays in the history.</p></div></li><li><span>02</span><div><strong>Find the next right match</strong><p>Alex is eligible and has high priority. Sam is next. Taylor’s morning availability rules them out.</p></div></li><li><span>03</span><div><strong>Send an offer, then open it</strong><p>The patient preview shows the appointment and a two-minute response window.</p></div></li><li><span>04</span><div><strong>Accept and see the difference</strong><p>One click books the appointment. Return to the clinic and refresh to verify it’s saved.</p></div></li></ol><div class="guide-note">${icon('info')}This workspace uses fictional records saved only in your browser. The availability assistant uses local rules; live AI and external messages are not connected.</div><div class="modal-actions"><button class="button primary" data-action="close-modal">Let’s get started ${icon('arrow')}</button></div>`);
}
function extractPreferences() {
  const note = $('#patient-form [name="note"]').value;
  const result = parsePreferences(note);
  currentModal.draft = result.draft;
  const fields = [];
  if (result.draft.days) fields.push(['Days', result.draft.days.map(d => WEEKDAYS[d]).join(', ')]);
  if (result.draft.from !== undefined) fields.push(['Availability', `${asTime(result.draft.from)}–${asTime(result.draft.to)}`]);
  if (result.draft.notice !== undefined) fields.push(['Notice', `${result.draft.notice} minutes`]);
  $('#parser-result').innerHTML = `<div class="parser-draft"><h4>${fields.length ? 'Here’s what the local parser found' : 'Let’s enter this one manually'}</h4>${fields.length ? `<dl>${fields.map(([label, value]) => `<div><dt>${label}</dt><dd>${escape(value)}</dd></div>`).join('')}</dl>` : ''}${result.warnings.length ? `<ul>${result.warnings.map(w => `<li>${escape(w)}</li>`).join('')}</ul>` : '<p>Review these values before applying them.</p>'}${fields.length ? '<button type="button" class="button small primary" data-action="apply-draft">Use these preferences ' + icon('check') + '</button>' : ''}</div>`;
}
function applyDraft() {
  const draft = currentModal?.draft;
  if (!draft) return;
  const form = $('#patient-form');
  if (draft.days) form.querySelectorAll('[name="days"]').forEach(input => input.checked = draft.days.includes(Number(input.value)));
  if (draft.from !== undefined) { form.elements.from.value = asTime(draft.from); form.elements.to.value = asTime(draft.to); }
  if (draft.notice !== undefined) form.elements.notice.value = draft.notice;
  $('#parser-result').innerHTML = `<div class="draft-applied">${icon('check')}Draft applied. Review the fields below, then save to confirm.</div>`;
}
function exportActivity() {
  const state = getState(), now = clock(state);
  const report = { application: 'Cancellation Backfill', version: 1, environment: 'browser-local sample', exportedAt: new Date().toISOString(), clinicClock: new Date(now).toISOString(), metrics: metrics(state, now), events: state.events };
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = 'backfill-activity.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  notify('Activity report exported.');
}

document.addEventListener('click', async event => {
  const target = event.target.closest('[data-action]');
  if (!target) return;
  const { action, id, slot } = target.dataset;
  if (action === 'close-modal') return closeModal();
  if (action === 'guide') return guideModal();
  if (action === 'cancel') return cancelModal(id);
  if (action === 'new-patient') return patientModal();
  if (action === 'edit-patient') return patientModal(id);
  if (action === 'new-slot') return slotModal();
  if (action === 'reset') return resetModal();
  if (action === 'extract') return extractPreferences();
  if (action === 'apply-draft') return applyDraft();
  if (action === 'show-activity') return go('activity');
  if (action === 'export') return exportActivity();
  if (action === 'select-slot') {
    selectedSlot = id;
    if (!['overview', 'appointments'].includes(route().view)) go('overview');
    else { render(); if (window.innerWidth < 1100) $('.match-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    return;
  }
  if (action === 'appointment-filter') { appointmentFilter = id; render(); return; }
  if (action === 'send-offer') { await change((s, now) => sendOffer(s, slot, id, now), 'Offer ready. Open the patient preview to respond.'); return; }
  if (action === 'toggle-patient') { await change((s, now) => togglePatient(s, id, now), 'Waitlist status updated.'); return; }
  if (action === 'accept' || action === 'decline') {
    target.disabled = true;
    const success = await change((s, now) => respondToOffer(s, id, action === 'accept' ? 'accepted' : 'declined', now), action === 'accept' ? 'Appointment confirmed. One less wait.' : 'Offer declined. The clinic can contact the next match.');
    if (!success) { target.disabled = false; render(); }
    return;
  }
  if (action === 'advance-clock') {
    await change(s => { s.offset += 3 * MINUTE; const now = clock(s); reconcile(s, now); s.events.unshift({ id: uid(), type: 'clock', at: now, title: 'Clinic clock advanced', detail: 'Moved forward three minutes to explore offer expiry.' }); return s; }, 'Clinic clock advanced by three minutes.');
    return;
  }
  if (action === 'copy-offer') {
    const url = new URL(location.href); url.hash = `offer/${id}`;
    try { await navigator.clipboard.writeText(url.href); notify('Preview link copied. It works in this browser workspace.'); }
    catch { openModal('copy', 'Your patient preview link', 'This link works only in this browser workspace.', `<label>Preview URL<input readonly value="${escape(url.href)}" onclick="this.select()"/></label><div class="modal-actions"><button class="button primary" data-action="close-modal">Done</button></div>`); }
  }
});

document.addEventListener('input', event => {
  if (event.target.id === 'patient-search') { search = event.target.value; $('#patient-rows').innerHTML = patientRows(getState(), clock(getState())); }
});
document.addEventListener('change', event => {
  if (event.target.id === 'patient-filter') { patientFilter = event.target.value; $('#patient-rows').innerHTML = patientRows(getState(), clock(getState())); }
  if (event.target.name === 'treatment' && currentModal?.type === 'patient') {
    $('#patient-form [name="preferredClinician"]').innerHTML = '<option value="">Any compatible clinician</option>' + CLINICIANS.filter(c => c.treatment === event.target.value).map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  }
});
document.addEventListener('submit', async event => {
  const form = event.target;
  if (!form.matches('[data-form], #settings-form')) return;
  event.preventDefault();
  const data = new FormData(form);
  const errorBox = form.querySelector('.form-error');
  if (errorBox) errorBox.textContent = '';
  if (inFlight) return;
  const submit = form.querySelector('[type="submit"]');
  if (submit) submit.disabled = true;
  let success = false;
  try {
    if (form.dataset.form === 'cancel') {
      selectedSlot = currentModal.id;
      success = await change((s, now) => cancelBooking(s, selectedSlot, now), 'Appointment reopened. Let’s find its next patient.');
      if (success && !['overview', 'appointments'].includes(route().view)) go('overview');
    } else if (form.dataset.form === 'patient') {
      const value = { id: currentModal.id, name: data.get('name'), treatment: data.get('treatment'), preferredClinician: data.get('preferredClinician'), days: data.getAll('days').map(Number), from: minutes(data.get('from')), to: minutes(data.get('to')), duration: Number(data.get('duration')), notice: Number(data.get('notice')), travel: Number(data.get('travel')), distance: Number(data.get('distance')), priority: Number(data.get('priority')), note: data.get('note') };
      success = await change((s, now) => savePatient(s, value, now), 'Patient preferences saved.');
    } else if (form.dataset.form === 'slot') {
      const input = { start: Date.parse(`${data.get('date')}T${data.get('time')}:00Z`), clinicianId: data.get('clinicianId'), duration: Number(data.get('duration')), value: Number(data.get('value')), patientName: data.get('patientName') };
      success = await change((s, now) => { addSlot(s, input, now); selectedSlot = s.slots.at(-1).id; return s; }, 'Appointment added to your calendar.');
    } else if (form.dataset.form === 'reset') {
      inFlight = true;
      await resetWorkspace(); selectedSlot = 'slot-1500'; search = ''; patientFilter = 'all'; appointmentFilter = 'all';
      success = true; notify('A fresh start. Your sample clinic is ready.'); go('overview');
    } else if (form.id === 'settings-form') {
      const clinicName = String(data.get('clinicName')).trim(), offerMinutes = Number(data.get('offerMinutes')), currency = data.get('currency');
      if (!clinicName || clinicName.length > 60 || ![1, 2, 5, 10, 15].includes(offerMinutes) || !['USD', 'EUR', 'GBP'].includes(currency)) throw new Error('Please enter valid clinic preferences.');
      success = await change((s, now) => { s.settings = { clinicName, offerMinutes, currency }; s.events.unshift({ id: uid(), type: 'settings', at: now, title: 'Clinic preferences updated', detail: `New offers allow ${offerMinutes} minutes to respond.` }); return s; }, 'Clinic preferences saved.');
    }
    if (success && form.dataset.form) closeModal();
    if (!success && errorBox) errorBox.textContent = 'Please review the message above and correct the fields before saving.';
  } catch (error) { if (errorBox) errorBox.textContent = error.message; notify(error.message, true); }
  finally { inFlight = false; if (submit?.isConnected) submit.disabled = false; }
});

subscribe(render);
window.addEventListener('hashchange', () => { closeModal(); render(); window.scrollTo({ top: 0 }); });
let lastMinute = '';
setInterval(async () => {
  const state = getState(), now = clock(state);
  document.querySelectorAll('[data-clock]').forEach(element => element.textContent = time(now));
  document.querySelectorAll('[data-countdown]').forEach(element => element.textContent = countdown(Number(element.dataset.countdown), now));
  if (!inFlight && state.offers.some(o => o.status === 'pending' && o.expiresAt <= now)) {
    await change(s => s);
  } else if (lastMinute !== time(now) && !currentModal && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
    render();
  }
  lastMinute = time(now);
}, 1000);
render();
