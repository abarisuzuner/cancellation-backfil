# Cancellation Backfill

Cancellation Backfill is an AI-assisted scheduling project for small dental and physiotherapy clinics, developed for the **Oracle AI Hackathon 2026**. It connects newly available appointments with patients who are waiting and able to attend, helping clinics recover unused capacity and patients receive earlier appointments.

The core experience is simple: **a 3pm slot opens, a suitable patient receives an offer, and one click fills the appointment.**

**Project status:** Project definition. The sections below describe the intended MVP. Application code, a hosted demo, and a walkthrough video are not available yet.

[GitHub repository](https://github.com/abarisuzuner/cancellation-backfil)

## The problem

A cancellation creates a time-sensitive coordination problem. The receptionist must find a patient who needs the right appointment type, is available for the entire slot, and can reach the clinic with enough notice. Today, the target clinic handles that process through phone calls and manually maintained waitlists, alongside its normal front-desk workload.

Working through the list takes time. Patients may not answer, may be unavailable, or may need time to decide. The appointment can remain empty even when someone on the waitlist could have attended. The clinic loses an opportunity to use its capacity, while patients continue waiting for appointments that could have happened sooner.

The primary user is the **front-desk coordinator** at a small clinic. Practice owners benefit from better use of appointments and less repetitive administrative work. Patients benefit from relevant offers for earlier appointments without repeatedly calling the clinic. The first demonstration focuses on a physiotherapy clinic; dental clinics share the same core workflow.

## The product experience

Cancellation Backfill brings the waitlist, matching decision, patient offer, and booking update into one workflow.

1. **Maintain the waitlist.** Record each patient's appointment type, availability, minimum notice, approximate distance, and clinic-assigned priority. Staff can enter preferences directly or review an AI-generated draft from a scheduling note.
2. **Reopen an appointment.** Cancelling a booking preserves its history and makes the underlying slot available for a replacement patient.
3. **Find suitable patients.** The matching engine filters the waitlist and presents eligible patients in priority order, with a clear explanation of each match.
4. **Offer the slot.** Staff approve the top match or select another eligible patient. The patient receives an expiring offer showing the appointment details.
5. **Confirm with one click.** The patient accepts through the offer link. The booking, offer, and waitlist update together, and the clinic sees the slot filled.
6. **Handle unsuccessful offers.** A decline or expiry releases the offer so the next eligible patient can be contacted. If nobody qualifies, staff see that the slot needs manual follow-up.

The result is a shorter path from cancellation to confirmed booking, with less searching, calling, and duplicate data entry.

### Matching policy

Eligibility comes before ranking. A patient must need a compatible treatment and clinician, fit the slot's duration, be available for the whole appointment, have sufficient travel and notice time, and have no conflicting booking.

Eligible patients are ordered by clinic-assigned priority, then time spent waiting, then shorter distance. A stable identifier resolves any remaining tie. Availability cannot be overridden by a higher priority, and staff can inspect the reasons before sending an offer. This initial policy will be evaluated with clinic coordinators.

Each slot has at most one active offer. The demo uses a configurable two-minute response window. An expired or declined offer cannot book the slot, and acceptance must recheck availability and eligibility before confirming the appointment.

## AI-assisted preference entry

Patient scheduling preferences often arrive as ordinary language. The AI feature turns those notes into structured fields that staff or patients can confirm before they affect matching.

For example:

> I can come on Tuesdays between 2 and 5 in the afternoon, and I need at least an hour's notice.

The resulting draft contains Tuesday availability from 14:00 to 17:00 in the clinic's time zone and a minimum notice period of 60 minutes. Unspecified fields remain empty. Ambiguous requests require clarification, and saving the extracted preferences requires confirmation.

The design uses **OCI Generative AI** for extraction and explicit application rules for matching. Clinical priority is assigned by clinic staff; AI handles scheduling language. Match explanations come from the eligibility and ranking rules, making the selection understandable and repeatable.

If extraction fails, the interface reports the failure and keeps manual preference entry available. Any simulated AI response must be labelled in the demo. Model and region selection will depend on the services available to the team's OCI account. Oracle's [Generative AI quick start](https://docs.oracle.com/en-us/iaas/Content/generative-ai/get-started-agents.htm) documents structured outputs for extraction workflows.

## Architecture

The MVP has a clinic dashboard, a patient offer page, and an API backed by Oracle Database. Booking decisions and credentials stay on the server.

| Component | Technology | Responsibility |
| --- | --- | --- |
| Clinic dashboard | React and TypeScript | Appointments, waitlist preferences, ranked matches, and offer status |
| Patient offer page | React and TypeScript | Appointment details, acceptance, and decline |
| Backend API | Node.js and TypeScript | Input validation, eligibility, ranking, offers, and booking transactions |
| Persistence | Oracle Database and `node-oracledb` | Slots, bookings, waitlist entries, offers, and event history |
| Preference extraction | OCI Generative AI | Convert scheduling notes into reviewable structured data |
| Demo notifications | In-app inbox | Deliver offers within the synthetic demo session |
| Verification | Playwright and backend checks | Exercise the complete workflow and booking integrity |

Oracle's official [`node-oracledb` driver](https://oracle.github.io/node-oracledb/) connects the TypeScript backend to the database and supports the transactions needed by the booking workflow.

### Data model and booking integrity

| Entity | Purpose |
| --- | --- |
| `appointment_slots` | Clinician, treatment type, start time, duration, and slot availability |
| `bookings` | Patient assignments, booking status, and cancellation history |
| `waitlist_entries` | Confirmed preferences, clinic-assigned priority, waiting time, and fulfilment status |
| `offers` | Recipient, slot, single-use token, expiry time, and response status |
| `events` | Timestamped history from cancellation through replacement booking |

Acceptance runs in a database transaction that verifies the current offer and slot, creates the replacement booking, and updates the related records atomically. The database must enforce one active booking per slot. Repeated acceptance returns the existing result, and competing requests cannot create duplicate bookings.

## MVP scope

The hackathon release will demonstrate one synthetic clinic, an appointment calendar, a waitlist, AI-assisted preference entry, ranked matching, expiring offers, and persistent replacement bookings. Its central proof is the complete journey from cancellation to a confirmed booking that remains visible after refresh.

An in-app inbox will represent patient notification. Real SMS or email delivery, external clinic-calendar integration, billing, and use of real patient data are outside the initial release. A production clinic workflow would also require authenticated staff access separate from patient offer links.

## Demo experience

The hosted application will expose an HTTPS `/demo` entry point with no login required. **Start demo** will create an isolated session with synthetic patients and appointments. Resetting one session must not affect another visitor's data. The deployment URL will be added here when available.

The demo clock starts at 13:00 on a clearly displayed Tuesday in the clinic's configured time zone and advances normally. The calendar contains a booked 3pm physiotherapy appointment. This setup makes the example Tuesday availability and one-hour notice requirement consistent and keeps the scenario repeatable.

### Walkthrough

1. Start a fresh session and inspect the appointment and waitlist.
2. Enter the example scheduling note for Alex, review the AI-extracted fields, and confirm them. Complete this setup before timing the booking workflow.
3. Inspect the three synthetic candidates: Alex is eligible with the highest staff-assigned priority, Sam is eligible with lower priority, and Taylor is unavailable at 3pm.
4. Cancel the 3pm booking. The cancellation event starts the backfill measurement.
5. Review the matches, see why Taylor is excluded, and send the offer to Alex.
6. Open **Demo inbox**, select Alex's offer, and choose **Accept appointment**.
7. Return to the dashboard. The slot should be booked for Alex, the offer accepted, and Alex's waitlist entry fulfilled. The event history should show the elapsed time.
8. Refresh to confirm persistence, then reopen the same offer to confirm that it cannot create another booking.

The target is **30 seconds from cancellation to replacement booking** in this controlled scenario, including the simulated patient's response. It is a demo goal rather than a measured result or a promise about real patient response times.

A second run covers decline and expiry: decline Alex's offer and offer the slot to Sam, or use a labelled demo clock control to expire the first offer. **Reset demo** restores the starting scenario. Notifications stay inside the demo inbox; no real messages are sent.

A planned 60–90 second walkthrough video will show preference extraction, cancellation, acceptance, and the persisted result. Its link will be added alongside the live demo after recording.

## Acceptance criteria

These checks define completion of the MVP and provide a repeatable way to evaluate the deployed application.

| Area | Expected result |
| --- | --- |
| Access and isolation | A fresh demo loads without login; one session's actions and reset do not affect another |
| Preference extraction | The example note produces Tuesday, 14:00–17:00, and 60 minutes' notice; confirmation is required before saving |
| Cancellation | The original booking is marked cancelled, its slot is reopened, and an event is recorded |
| Matching | Alex ranks above Sam under the defined policy; Taylor is excluded with an availability explanation |
| Offers | Only one active offer exists per slot, with a visible expiry and an accessible patient link |
| Acceptance | Booking, offer, and waitlist records update together and remain correct after refresh |
| Booking integrity | Repeated clicks and concurrent requests produce at most one active booking for the slot |
| Decline and expiry | The old offer can no longer book; the next eligible patient can receive an offer |
| No suitable match | The slot stays open with an explicit manual-follow-up message |
| AI failure | The failure is visible and manual preference entry remains usable |

Release evidence will include the deployed application, the corresponding source revision, test results, and a machine-readable verification report. The report remains pending until a working deployment and the verification specification are available.

## Expected impact

The intended outcome is better use of clinic capacity, earlier appointments for waiting patients, and less repetitive work for front-desk staff. Evaluation will separate controlled demo performance from results observed in a clinic pilot.

| Measure | Definition |
| --- | --- |
| Time to backfill | Replacement booking timestamp minus cancellation timestamp; a 30-second target for the controlled demo |
| Backfill rate | Slots refilled before their start time divided by all cancelled slots reopened before their start time, including those with no eligible match |
| Staff effort | Staff actions and active time required to fill a vacancy, compared with a documented manual workflow |
| Appointment value recovered | Stated value of replacement bookings; synthetic demo values are estimates, not collected revenue |
| Extraction accuracy | Correct scheduling fields against human-labelled examples, including ambiguous notes and required corrections |
| Booking integrity | Duplicate active bookings for the same slot; the required result is zero |

Customer interviews and operational measurements are still to be collected. Initial discovery will involve three to five clinic coordinators to validate the cancellation workflow, ranking policy, and offer window.

## Delivery plan

1. Build the Oracle-backed cancellation, eligibility, offer, and atomic acceptance workflow.
2. Add OCI preference extraction with validation, confirmation, and manual fallback.
3. Create the isolated demo, event timeline, and repeatable verification checks.
4. Deploy the application, publish access and setup instructions, and record the walkthrough.
5. Evaluate the workflow with clinic staff, then extend it with calendar integration and real notification delivery.

The first release prioritizes a complete, observable booking journey. The main implementation dependencies are OCI account access, model and region availability, deployment configuration, and validation of the matching policy with clinic staff.

## Repository layout

```text
README.md   Project definition, architecture, and demo workflow
code/       Application source
docs/       Supporting project materials
```

Local setup instructions, environment variable names, database initialization, and run commands will be added with the application implementation.
