# Cancellation Backfill: Smallest End-to-End MVP

## Goal and scope

Fill one cancelled 3:00 PM appointment from a small clinic's waitlist. The demo target is a booking less than 30 seconds after staff cancels the original appointment; this is a measured outcome, not a guaranteed response time.

This prototype covers one fictional physio clinic, one practitioner, one 45-minute follow-up service, and one appointment on the next Tuesday. Staff maintain a waitlist for that appointment date. All patient names are synthetic. The app is the source of truth for the demo slot; message delivery and the clinic's existing scheduling system are simulated.

## Data and input schema

Times are ISO 8601 strings with an offset in the clinic time zone (`America/Los_Angeles`). `urgency` is a staff-entered administrative priority, not clinical triage. `distance_km` is supplied by staff; the prototype does not calculate travel time.

| Table | Fields | Constraint |
| --- | --- | --- |
| `appointments` | `id`, `clinic_id`, `practitioner_id`, `service_id`, `starts_at`, `ends_at`, `patient_name`, `status` (`booked` or `cancelled`), `source_appointment_id?`, `cancelled_at?` | At most one `booked` row per practitioner and start time. A backfill creates a new row and retains the cancelled original. |
| `waitlist` | `id`, `patient_name`, `service_id`, `slot_date`, `urgency` (`routine`, `soon`, `urgent`), `availability` (`morning`, `afternoon`, `anytime`), `distance_km`, `status` (`waiting` or `booked`), `created_at` | One request refers to this date and service. Distance must be nonnegative. |
| `offers` | `id`, `source_appointment_id`, `waitlist_id`, opaque `token`, `status` (`pending`, `accepted`, `declined`, `expired`), `sent_at`, `expires_at`, `accepted_at?` | At most one pending or accepted offer per cancelled appointment; a patient is offered a slot at most once. |

Staff input: `POST /api/waitlist` with `{ "patient_name": "Maya Chen", "urgency": "urgent", "availability": "afternoon", "distance_km": 2.4 }`. The server fills the fixed service and date. Cancellation input: `POST /api/appointments/1/cancel` with `{}`. The patient link carries only an opaque offer token; `POST /api/offers/{token}/accept` or `/decline` takes `{}`.

## Ranking and outputs

Only waiting patients for the same service and date whose daypart matches the slot are eligible. Rank eligible patients by urgency (`urgent`, `soon`, `routine`), then explicit matching daypart ahead of `anytime`, then shorter distance, then earlier waitlist entry. An unavailable patient remains visible to staff with the reason and receives no offer.

`GET /api/state` and cancellation responses return:

```json
{
  "slot": { "source_appointment_id": 1, "status": "offered", "starts_at": "2026-10-27T15:00:00-07:00", "ends_at": "2026-10-27T15:45:00-07:00", "patient_name": null, "filled_in_seconds": null },
  "ranked_waitlist": [{ "id": 2, "patient_name": "Maya Chen", "rank": 1, "urgency": "urgent", "availability": "afternoon", "distance_km": 2.4, "eligible": true, "reason": "Matches 3:00 PM" }],
  "active_offer": { "id": 1, "patient_name": "Maya Chen", "status": "pending", "expires_at": "2026-10-25T14:10:00-07:00", "patient_link": "/offer/opaque-token" }
}
```

The dates above illustrate the shape; the running demo uses the next Tuesday and actual offer timestamps. `GET /api/offers/{token}` returns patient-facing appointment details and offer status. Accept returns `{ "status": "booked", "booking": { "id": 2, "patient_name": "Maya Chen", "starts_at": "..." }, "filled_in_seconds": 8 }`. A rejected or stale offer returns a clear `409` error such as `offer_expired` or `slot_filled`. Invalid input returns `400`.

## User flow

1. Front desk sees the booked 3:00 PM appointment and the waitlist, and can add a waitlist request.
2. Staff cancels the appointment. The original row is retained as cancelled, candidates are ranked, and one 10-minute offer is issued to the top eligible patient.
3. The prototype displays the patient link and a patient preview in place of sending SMS. The patient opens the link and accepts with one click, or declines.
4. Acceptance creates a new booked appointment in one database transaction, marks the offer accepted and the waitlist request booked, and shows the measured fill time to staff. A decline or expiration automatically offers the slot to the next eligible patient. If nobody is eligible, the slot stays open.

## Non-goals

No real SMS/email, real patient data, clinic scheduling system integration, multi-clinic or multi-practitioner calendars, payments, insurance, automatic distance lookup, patient self-registration, or medical triage. This is a functional workflow prototype, not a clinic deployment.

## Acceptance checks

- Cancelling the seeded appointment offers it to the highest-ranked eligible entry; a morning-only request never receives the 3:00 PM offer.
- With equal urgency and availability, the nearer patient ranks first. A matching daypart ranks ahead of `anytime` at equal urgency.
- Accepting a live offer creates exactly one booking for that practitioner and time, updates both views, and reports seconds from cancellation to acceptance. Repeated acceptance cannot create a second booking.
- Declining or expiring an offer issues the next eligible offer. When the eligible list is exhausted, the slot remains open.
- Invalid input is rejected, stale links show an understandable outcome, and refreshing the page preserves state. A demo reset restores the synthetic seed.

## Riskiest dependency

The real clinic calendar must confirm that the opening still exists and commit the accepted booking without a competing scheduler taking it. The local database can enforce this for the demo, but deployment needs one chosen clinic system's read/write integration and a verified conflict strategy. Cliniko, a relevant physio system, documents [available times](https://docs.api.cliniko.com/openapi/available-time/availabletime) and [appointment create, cancel, and conflict endpoints](https://docs.api.cliniko.com/openapi/individual-appointment); the first partner test should prove the cancel-to-book flow and a competing-booking case against its sandbox or test clinic.
