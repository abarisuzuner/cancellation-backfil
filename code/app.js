(() => {
  "use strict";

  const app = document.getElementById("app");
  const dialog = document.getElementById("waitlist-dialog");
  const form = document.getElementById("waitlist-form");
  const formError = document.getElementById("form-error");
  const patientMatch = window.location.pathname.match(/^\/offer\/([A-Za-z0-9_-]+)$/);
  const clinicTimeZone = "America/Los_Angeles";
  let state = null;
  let patientState = null;
  let renderKey = "";
  let clockOffsetMs = 0;
  let busy = false;
  let flash = null;

  const urgencyLabels = { routine: "Routine", soon: "Soon", urgent: "Urgent" };
  const availabilityLabels = { morning: "Mornings", afternoon: "Afternoons", anytime: "Any time" };
  const slotLabels = { booked: "Booked", offered: "Offer in progress", filled: "Backfilled", open: "Open" };

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[character]);
  }

  function dateLabel(value, compact = false) {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: clinicTimeZone,
      weekday: compact ? "short" : "long",
      month: compact ? "short" : "long",
      day: "numeric"
    }).format(new Date(value));
  }

  function timeLabel(value) {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: clinicTimeZone,
      hour: "numeric",
      minute: "2-digit"
    }).format(new Date(value));
  }

  function rangeLabel(start, end) {
    return `${timeLabel(start)} - ${timeLabel(end)}`;
  }

  function durationLabel(seconds) {
    if (seconds === null || seconds === undefined) return "-";
    if (seconds < 60) return `${seconds} second${seconds === 1 ? "" : "s"}`;
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds % 60;
    return `${minutes}m ${remainder}s`;
  }

  function countdownLabel(expiresAt) {
    const left = Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now() + clockOffsetMs) / 1000));
    return `${String(Math.floor(left / 60)).padStart(2, "0")}:${String(left % 60).padStart(2, "0")}`;
  }

  function updateCountdowns() {
    document.querySelectorAll("[data-expires-at]").forEach(element => {
      element.textContent = countdownLabel(element.dataset.expiresAt);
    });
  }

  function header(patient = false) {
    return `<header class="app-header"><div class="header-inner">
      <div class="brand-lockup">
        <span class="brand-mark" aria-hidden="true">H</span>
        <span class="brand-name">Harbor Physio</span>
        ${patient ? "" : '<span class="header-divider" aria-hidden="true"></span><span class="header-product">Cancellation backfill</span>'}
      </div>
      <span class="demo-chip">Demo clinic</span>
    </div></header>`;
  }

  function flashMarkup() {
    if (!flash) return "";
    return `<div class="notice ${flash.type === "success" ? "notice-success" : ""}" role="${flash.type === "error" ? "alert" : "status"}">${escapeHtml(flash.message)}</div>`;
  }

  function slotMarkup(data) {
    const slot = data.slot;
    let firstFact;
    let secondFact;
    let footer;

    if (slot.status === "booked") {
      firstFact = `<span class="fact-label">Patient</span><span class="fact-value">${escapeHtml(slot.patient_name)}</span>`;
      secondFact = `<span class="fact-label">Waitlist</span><span class="fact-value">${data.ranked_waitlist.length} requests</span>`;
      footer = `<p>Scheduled appointment</p><button class="button button-danger" type="button" data-action="cancel">Cancel appointment</button>`;
    } else if (slot.status === "offered") {
      firstFact = `<span class="fact-label">Original booking</span><span class="fact-value">${escapeHtml(slot.original_patient_name)}</span><span class="fact-context">Cancelled</span>`;
      secondFact = `<span class="fact-label">Offer sent to</span><span class="fact-value">${escapeHtml(data.active_offer.patient_name)}</span><span class="fact-context">Waiting for a reply</span>`;
      footer = `<p>Offer closes in <strong data-expires-at="${escapeHtml(data.active_offer.expires_at)}">${countdownLabel(data.active_offer.expires_at)}</strong></p><span class="section-meta">One offer at a time</span>`;
    } else if (slot.status === "filled") {
      firstFact = `<span class="fact-label">New booking</span><span class="fact-value">${escapeHtml(slot.patient_name)}</span><span class="fact-context">Confirmed</span>`;
      secondFact = `<span class="fact-label">Original booking</span><span class="fact-value">${escapeHtml(slot.original_patient_name)}</span><span class="fact-context">Cancelled</span>`;
      footer = `<p>Time to fill</p><strong>${durationLabel(slot.filled_in_seconds)}</strong>`;
    } else {
      firstFact = `<span class="fact-label">Original booking</span><span class="fact-value">${escapeHtml(slot.original_patient_name)}</span><span class="fact-context">Cancelled</span>`;
      secondFact = `<span class="fact-label">Current offer</span><span class="fact-value">None</span>`;
      footer = `<p>No eligible patient is waiting for this time.</p>`;
    }

    return `<section aria-labelledby="appointment-heading">
      <div class="section-head"><h2 id="appointment-heading">Appointment</h2><span class="section-meta">${escapeHtml(dateLabel(slot.starts_at, true))}</span></div>
      <div class="panel slot-panel">
        <div class="slot-topline">
          <div><p class="slot-time">${escapeHtml(timeLabel(slot.starts_at))}</p><p class="slot-duration">45 minutes &middot; Pacific time</p></div>
          <span class="status-pill status-${slot.status}" aria-live="polite">${slotLabels[slot.status]}</span>
        </div>
        <p class="slot-service">${escapeHtml(data.service)}</p>
        <p class="slot-practitioner">${escapeHtml(data.practitioner)}</p>
        <div class="slot-facts"><div>${firstFact}</div><div>${secondFact}</div></div>
        <div class="slot-footer">${footer}</div>
      </div>
    </section>`;
  }

  function waitlistMarkup(data) {
    const addDisabled = data.slot.status === "filled" ? "disabled" : "";
    const rows = data.ranked_waitlist.map(item => {
      const priority = urgencyLabels[item.urgency];
      const availability = availabilityLabels[item.availability];
      const rowClass = item.offer_status === "pending" ? "is-offered" : !item.eligible ? "is-ineligible" : "";
      return `<div class="wait-row ${rowClass}">
        <div class="rank-number">${item.rank === null ? "-" : String(item.rank).padStart(2, "0")}</div>
        <div class="wait-identity">
          <div class="wait-name-line"><span class="wait-name">${escapeHtml(item.patient_name)}</span><span class="priority-pill priority-${item.urgency}">${priority}</span></div>
          <span class="wait-mobile-meta">${availability} &middot; ${Number(item.distance_km).toFixed(1)} km</span>
          <span class="wait-reason">${escapeHtml(item.reason)}</span>
        </div>
        <div class="wait-availability">${availability}</div>
        <div class="wait-distance">${Number(item.distance_km).toFixed(1)} km</div>
      </div>`;
    }).join("");
    return `<section aria-labelledby="waitlist-heading">
      <div class="section-head"><h2 id="waitlist-heading">Waitlist</h2><button class="button button-secondary" type="button" data-action="add" ${addDisabled}>Add patient</button></div>
      <div class="panel waitlist-panel">
        <div class="wait-head"><span>Rank</span><span>Patient</span><span>Availability</span><span style="text-align:right">Distance</span></div>
        ${rows || '<div class="empty-waitlist">No one is on the waitlist for this date.</div>'}
      </div>
    </section>`;
  }

  function offerDetailMarkup(start, end, practitioner) {
    return `<div class="offer-detail">
      <p class="offer-date">${escapeHtml(dateLabel(start))}</p>
      <p class="offer-time">${escapeHtml(rangeLabel(start, end))}</p>
      <p class="offer-provider">${escapeHtml(practitioner)} &middot; Physiotherapy follow-up</p>
    </div>`;
  }

  function previewMarkup(data) {
    const slot = data.slot;
    let body;
    if (data.active_offer) {
      const offer = data.active_offer;
      const token = offer.patient_link.split("/").pop();
      body = `<p class="patient-greeting">Hi ${escapeHtml(offer.patient_name)},</p>
        <h3 class="patient-title">A ${escapeHtml(timeLabel(slot.starts_at))} appointment is available</h3>
        ${offerDetailMarkup(slot.starts_at, slot.ends_at, data.practitioner)}
        <p class="expiry-line">Offer expires in <span data-expires-at="${escapeHtml(offer.expires_at)}">${countdownLabel(offer.expires_at)}</span></p>
        <div class="patient-actions">
          <button class="button button-primary" type="button" data-action="accept" data-token="${escapeHtml(token)}">Accept appointment</button>
          <button class="button button-secondary" type="button" data-action="decline" data-token="${escapeHtml(token)}">Decline</button>
        </div>
        <a class="patient-link" href="${escapeHtml(offer.patient_link)}" target="_blank" rel="noopener">Open patient link</a>`;
    } else if (slot.status === "filled") {
      body = `<p class="patient-greeting">Hi ${escapeHtml(slot.patient_name)},</p>
        <h3 class="patient-title">Your appointment is confirmed</h3>
        ${offerDetailMarkup(slot.starts_at, slot.ends_at, data.practitioner)}
        <div class="success-strip">Booked in ${durationLabel(slot.filled_in_seconds)}</div>`;
    } else if (slot.status === "open") {
      body = `<div class="preview-empty"><h3 class="patient-title">No active offer</h3><p class="patient-copy">No eligible requests remain for this appointment.</p></div>`;
    } else {
      body = `<div class="preview-empty"><h3 class="patient-title">No active offer</h3><p class="patient-copy">The ${escapeHtml(timeLabel(slot.starts_at))} appointment is still booked.</p></div>`;
    }
    return `<section aria-labelledby="preview-heading">
      <div class="section-head"><h2 id="preview-heading">Patient view</h2><span class="section-meta">Preview</span></div>
      <div class="panel patient-panel">
        <div class="preview-kicker"><span>Harbor Physio</span><span class="preview-tag">Delivery simulated</span></div>
        ${body}
      </div>
    </section>`;
  }

  function activityMarkup(data) {
    const items = [];
    if (data.slot.cancelled_at) {
      for (const offer of data.offer_history) {
        if (offer.status === "accepted") {
          items.push({ title: `${offer.patient_name} accepted`, time: offer.accepted_at, current: true });
        } else if (offer.status === "declined") {
          items.push({ title: `${offer.patient_name} declined`, time: offer.sent_at });
        } else if (offer.status === "expired") {
          items.push({ title: `Offer to ${offer.patient_name} expired`, time: offer.sent_at });
        }
        items.push({ title: `Offer sent to ${offer.patient_name}`, time: offer.sent_at,
          current: offer.status === "pending" });
      }
      items.push({ title: `${data.slot.original_patient_name}'s appointment cancelled`, time: data.slot.cancelled_at });
    } else {
      items.push({ title: `${data.slot.original_patient_name} booked`, time: data.slot.starts_at, upcoming: true });
    }
    const rows = items.slice(0, 7).map(item => `<div class="activity-row">
      <span class="activity-dot ${item.current ? "is-current" : ""}" aria-hidden="true"></span>
      <div><p class="activity-title">${escapeHtml(item.title)}</p><p class="activity-time">${item.upcoming ? "Upcoming" : escapeHtml(timeLabel(item.time))}</p></div>
    </div>`).join("");
    return `<section aria-labelledby="activity-heading">
      <div class="section-head"><h2 id="activity-heading">Activity</h2></div>
      <div class="panel activity-panel">${rows}</div>
    </section>`;
  }

  function renderStaff() {
    if (!state) return;
    app.className = "";
    app.innerHTML = `${header()}
      <main class="shell">
        <div class="page-heading">
          <div><p class="eyebrow">Front desk</p><h1>Cancellation backfill</h1><p>${escapeHtml(dateLabel(state.slot.starts_at))} &middot; ${escapeHtml(state.practitioner)}</p></div>
          <button class="button button-subtle" type="button" data-action="reset">Reset demo</button>
        </div>
        ${flashMarkup()}
        <div class="workspace-grid">
          <div class="stack">${slotMarkup(state)}${waitlistMarkup(state)}</div>
          <div class="stack">${previewMarkup(state)}${activityMarkup(state)}</div>
        </div>
      </main>`;
    updateCountdowns();
  }

  function patientBodyMarkup(data) {
    const offer = data.offer;
    const detail = offerDetailMarkup(data.slot.starts_at, data.slot.ends_at, data.practitioner);
    if (offer.status === "pending") {
      return `<p class="patient-greeting">Hi ${escapeHtml(offer.patient_name)},</p>
        <h1 class="patient-title">A ${escapeHtml(timeLabel(data.slot.starts_at))} appointment is available</h1>
        <p class="patient-copy">We can see you sooner at Harbor Physio.</p>
        ${detail}
        <p class="expiry-line">Offer expires in <span data-expires-at="${escapeHtml(offer.expires_at)}">${countdownLabel(offer.expires_at)}</span></p>
        <div class="patient-actions">
          <button class="button button-primary" type="button" data-action="accept" data-token="${escapeHtml(patientMatch[1])}">Accept appointment</button>
          <button class="button button-secondary" type="button" data-action="decline" data-token="${escapeHtml(patientMatch[1])}">Decline</button>
        </div>`;
    }
    if (offer.status === "accepted") {
      return `<p class="patient-greeting">Hi ${escapeHtml(offer.patient_name)},</p>
        <h1 class="patient-title">Your appointment is confirmed</h1>
        ${detail}
        <div class="success-strip">You're booked for ${escapeHtml(timeLabel(data.slot.starts_at))}.</div>`;
    }
    const title = offer.status === "declined" ? "You declined this appointment" : "This offer has expired";
    return `<p class="patient-greeting">Hi ${escapeHtml(offer.patient_name)},</p>
      <h1 class="patient-title">${title}</h1>
      ${detail}
      <p class="patient-copy">Contact Harbor Physio if you need a different appointment.</p>`;
  }

  function renderPatient() {
    app.className = "patient-page";
    if (!patientState) {
      app.innerHTML = `${header(true)}<main class="patient-shell"><div class="panel patient-panel"><h1 class="patient-title">Offer unavailable</h1><p class="patient-copy">${escapeHtml(flash?.message || "This link could not be opened.")}</p></div></main>`;
      return;
    }
    app.innerHTML = `${header(true)}
      <main class="patient-shell">
        ${flashMarkup()}
        <div class="panel patient-panel">
          <div class="preview-kicker"><span>Appointment offer</span><span class="preview-tag">Harbor Physio</span></div>
          ${patientBodyMarkup(patientState)}
        </div>
        <p class="patient-footer">${escapeHtml(patientState.service)} &middot; Pacific time</p>
      </main>`;
    updateCountdowns();
  }

  async function request(url, options = {}) {
    const response = await fetch(url, { cache: "no-store", ...options });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || "The request could not be completed.");
    }
    return data;
  }

  function post(url, body = {}) {
    return request(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
  }

  async function loadStaff(force = false) {
    if (busy && !force) return;
    try {
      const data = await request("/api/state");
      state = data;
      clockOffsetMs = Date.now() - new Date(data.server_now).getTime();
      const nextKey = JSON.stringify([data.slot, data.ranked_waitlist, data.active_offer, data.offer_history, flash]);
      if (nextKey !== renderKey || force) {
        renderKey = nextKey;
        renderStaff();
      } else {
        updateCountdowns();
      }
    } catch (error) {
      flash = { type: "error", message: error.message };
      if (state) renderStaff();
      else app.innerHTML = `${header()}<main class="shell">${flashMarkup()}</main>`;
    }
  }

  async function loadPatient(force = false) {
    if (busy && !force) return;
    try {
      const data = await request(`/api/offers/${patientMatch[1]}`);
      patientState = data;
      clockOffsetMs = Date.now() - new Date(data.server_now).getTime();
      const nextKey = JSON.stringify([data.slot, data.offer, flash]);
      if (nextKey !== renderKey || force) {
        renderKey = nextKey;
        renderPatient();
      } else {
        updateCountdowns();
      }
    } catch (error) {
      flash = { type: "error", message: error.message };
      patientState = null;
      renderPatient();
    }
  }

  app.addEventListener("click", async event => {
    const button = event.target.closest("[data-action]");
    if (!button || busy) return;
    const action = button.dataset.action;
    if (action === "add") {
      form.reset();
      formError.hidden = true;
      document.getElementById("dialog-date").textContent = `${dateLabel(state.slot.starts_at)} | Physiotherapy follow-up`;
      dialog.showModal();
      form.elements.patient_name.focus();
      return;
    }
    if (action === "reset" && !window.confirm("Restore the original demo appointment and waitlist?")) return;

    busy = true;
    button.disabled = true;
    flash = null;
    try {
      if (action === "cancel") {
        await post("/api/appointments/1/cancel");
      } else if (action === "reset") {
        await post("/api/demo/reset");
      } else if (action === "accept" || action === "decline") {
        await post(`/api/offers/${button.dataset.token}/${action}`);
      }
      if (patientMatch) await loadPatient(true);
      else await loadStaff(true);
    } catch (error) {
      flash = { type: "error", message: error.message };
      if (patientMatch) await loadPatient(true);
      else await loadStaff(true);
    } finally {
      busy = false;
      button.disabled = false;
    }
  });

  document.getElementById("close-dialog").addEventListener("click", () => dialog.close());
  document.getElementById("cancel-dialog").addEventListener("click", () => dialog.close());
  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (busy || !form.reportValidity()) return;
    busy = true;
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    formError.hidden = true;
    const values = new FormData(form);
    try {
      await post("/api/waitlist", {
        patient_name: values.get("patient_name"),
        urgency: values.get("urgency"),
        availability: values.get("availability"),
        distance_km: Number(values.get("distance_km"))
      });
      dialog.close();
      flash = { type: "success", message: "Patient added to the waitlist." };
      await loadStaff(true);
    } catch (error) {
      formError.textContent = error.message;
      formError.hidden = false;
    } finally {
      busy = false;
      submit.disabled = false;
    }
  });

  if (patientMatch) {
    loadPatient(true);
    setInterval(() => loadPatient(), 2000);
  } else {
    loadStaff(true);
    setInterval(() => loadStaff(), 2000);
  }
  setInterval(updateCountdowns, 1000);
})();
