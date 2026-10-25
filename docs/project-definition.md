# Cancellation Backfill: project definition

**Event:** Oracle AI Hackathon 2026

**Repository:** https://github.com/abarisuzuner/cancellation-backfil

**Project promise:** Turn a cancelled clinic appointment into an earlier appointment for someone waiting.

This document answers every submission field in [Judge App Text](../Judge%20App%20Text) and develops the concept in [Outcome](Outcome). The judging file is a submission form; it does not provide scoring weights or additional technical requirements.

**Status:** Planning draft. At the time of writing, the repository contains the project description and empty code scaffolding, with no implemented application or demo URL. The clinic problem, waitlist matching, one-click acceptance, and “filled in 30 seconds” demo hook come from `Outcome`. The stack, AI features, matching policy, demo details, and measurements below are **proposals**, not claims of completed work or measured results.

## 1. What did you build?

**Suggested answer, accurate for the current planning stage:**

We are building Cancellation Backfill, an app that helps small dental and physiotherapy clinics fill appointments that become available at short notice. When someone cancels, the app finds suitable patients on the waitlist, ranks them using clinic-assigned priority, availability, and distance, and offers the slot to the best match. The patient accepts with one click, and the clinic sees the appointment become booked again.

Our proposed AI feature turns everyday patient requests into structured availability that staff can review, making the waitlist easier to maintain. The central demo follows one appointment from “a 3pm slot just opened” to “filled in 30 seconds.” That timing is a demo target, not a result we have achieved yet.

**After implementation:** Change “We are building” to “We built” only for features that are actually working. Replace the target with an observed time if the demo supports it.

## 2. Who has this problem?

**Suggested answer:**

The primary user is the receptionist or front-desk coordinator at a small dental or physiotherapy clinic. After a cancellation, they need to find someone who wants that treatment, can attend at that time, and can reach the clinic on short notice. The proposed initial customer is a clinic that handles its waitlist through phone calls and manually maintained records.

Without the app, the coordinator works through the waitlist while also handling patients and other administrative work. Each call can end in no answer, unsuitable timing, or a patient needing time to decide. The slot may stay empty even though someone on the list could have attended. The clinic loses an opportunity to use its available capacity, and patients continue waiting for care they could have received earlier.

The clinic owner or practice manager benefits from better use of available appointments. Patients benefit from convenient offers for earlier appointments without repeatedly calling the clinic. The same workflow could apply to other appointment-based practices, but our first scope is small dental and physiotherapy clinics.

**Evidence boundary:** This problem is described in `Outcome`; the repository does not include customer interviews, cancellation statistics, or validated savings. A useful next step is to interview three to five clinic coordinators about recent cancellations, time spent contacting patients, and the information they need to make a suitable match.

## 3. How does your app solve it?

**Suggested answer:**

Before Cancellation Backfill, staff must search the waitlist, judge who can attend, contact patients individually, and update the calendar manually. After using the app, staff can cancel an appointment, review an ordered list of eligible patients and the reasons for each match, and send an offer from one screen. The patient opens the offer and accepts; the appointment and waitlist update together.

The most important workflow is a complete cancellation-to-booking journey. Judges should see the cancellation create a vacancy, the app identify a suitable patient, the patient accept an offer, and the dashboard show the slot as filled. The app should also show what happens if a patient declines or the offer expires: the next eligible patient can receive an offer without restarting the process.

### Proposed matching and offer workflow

1. **Record preferences.** Store the required appointment type, availability, minimum notice, approximate distance, and clinic-assigned priority. AI can draft availability fields from a note; a person confirms them before they affect matching.
2. **Open the slot.** Staff cancel an existing booking. Keep its cancellation history and make the underlying appointment slot available.
3. **Filter for eligibility.** Require a compatible treatment and clinician, sufficient slot duration, availability for the entire appointment, adequate travel/notice time, and no conflicting appointment.
4. **Rank eligible patients.** Proposed default: clinic-assigned priority first, then longest time waiting, then shorter distance, with a stable identifier as the final tie-breaker. Availability is an eligibility requirement, not something a high score can override. Show the reasons to staff. This ordering needs clinic validation.
5. **Send one offer.** Staff approve the top match or choose another eligible patient. Keep one active offer per slot and show its expiry time. A two-minute response window is an initial demo configuration, not an established clinic policy.
6. **Accept and book.** A patient uses a single-use offer link. The server rechecks eligibility, offer expiry, and slot availability, then confirms the booking in one database transaction. Repeated clicks return the same booking instead of creating duplicates.
7. **Continue when necessary.** A decline or expiry releases the offer and presents the next eligible patient. If nobody qualifies, leave the slot open and tell staff that manual follow-up is needed.

Priority is supplied by clinic staff. The proposed AI feature does not diagnose patients or determine clinical urgency. Distance is only a secondary operational factor; the MVP can use synthetic distances without requiring a mapping service.

### Proposed AI contribution

The AI feature solves a specific administrative task: converting unstructured scheduling requests into fields the matching engine can use.

**Example input:** “I can come on Tuesdays between 2 and 5 in the afternoon, and I need at least an hour's notice.”

**Expected draft:** Tuesday availability, 14:00–17:00 in the clinic's displayed time zone, and 60 minutes' minimum notice. Unknown fields remain unset. The user reviews and confirms this draft before it is saved. Ambiguous phrases require clarification rather than an invented interpretation.

OCI Generative AI is the proposed service for this extraction. Oracle documents structured-output support for extraction use cases; the team must confirm the API, model, region, and access available to its hackathon account. Application validation and human confirmation remain required. See [Oracle's Generative AI quick start](https://docs.oracle.com/en-us/iaas/Content/generative-ai/get-started-agents.htm).

The matching engine then uses the confirmed fields and explicit rules. Match explanations can initially be generated directly from those rules. If AI is unavailable, manual preference entry should keep the booking workflow usable, while the UI clearly reports that AI extraction is unavailable. A mocked response must be labelled as a simulation rather than presented as a live AI call.

## 4. How did you build it?

**Suggested answer — implementation proposal, to update after building:**

We plan to build a React and TypeScript frontend with a Node.js and TypeScript API. Oracle Database will store appointment slots, bookings, waitlist entries, offers, and the event history. The backend will use the official `node-oracledb` driver. OCI Generative AI will help turn patient availability notes into structured preferences for review.

The frontend will provide a clinic dashboard and a simple patient offer page. The API will enforce matching eligibility, offer expiry, and booking rules. Database transactions will protect the final acceptance step from double booking. A small end-to-end test suite will exercise cancellation, matching, acceptance, expiry, and repeat acceptance.

The intended strongest part of the demo is the complete journey from cancellation to a persisted replacement booking. The next improvements would be integration with existing clinic calendars, real message delivery, and evaluation with clinic staff. These capabilities are planned; the repository does not yet demonstrate them.

### Proposed components and scope

| Component | Responsibility | Hackathon scope |
| --- | --- | --- |
| Clinic dashboard | Show appointments, cancellations, waitlist matches, and offer status | One synthetic clinic with resettable demo data |
| Patient offer page | Show appointment details and accept or decline | Expiring, single-use link; no patient account required for the demo |
| Backend API | Validate preferences, rank candidates, manage offers, confirm bookings | Node.js and TypeScript; server-side credentials |
| Oracle Database | Persist slots, bookings, waitlist entries, offers, and events | Real database persistence for the judged workflow |
| AI preference extraction | Convert scheduling notes to a reviewable draft | One real OCI model integration, subject to account availability |
| Notification delivery | Let the patient receive an offer | In-app demo inbox; SMS/email integration is a later extension |
| Verification | Exercise the core journey and important failure paths | Proposed Playwright browser tests plus backend transaction checks |

Oracle maintains `node-oracledb` for JavaScript and TypeScript applications and documents transaction support. These capabilities make it a suitable proposed connection layer; they do not establish that our application has implemented safe booking yet. See [Oracle's driver documentation](https://oracle.github.io/node-oracledb/).

**Suggested data model:** `appointment_slots` for clinician, type, start time, duration, and availability; `bookings` for patient assignments and cancellations; `waitlist_entries` for confirmed preferences and priority; `offers` for recipient, token, expiry, and status; and `events` for the observable cancellation-to-booking history. Enforce one active booking per slot, and perform availability checks and booking updates atomically.

**Scope boundary:** The hackathon prototype demonstrates scheduling with synthetic patients. Real clinic integration, real patient data, automated clinical triage, billing, and production readiness are outside this proposed MVP.

## 5. Demo URL

**Current answer:** Not available yet. No deployed application URL is present in the source files.

**Proposal:** Deploy an HTTPS demo and make its `/demo` page the submission's entry point. Provide a “Start demo” action that creates an isolated session with synthetic data. Initialize a clearly labelled demo clock to 13:00 on a Tuesday in the clinic's configured time zone, then let it advance normally. This keeps the 3pm slot compatible with the example Tuesday availability and one-hour notice requirement, and makes the scenario repeatable after the presentation date.

Replace this section with the actual, tested URL before submission. The repository URL is not a substitute for a working demo URL.

### Proposed demo script

All people, appointments, distances, and values in this scenario are synthetic.

1. Open the demo and start a fresh session. Show a booked 3pm physiotherapy slot and three patients on the waitlist.
2. Demonstrate AI extraction of the example availability note, inspect the resulting fields, and confirm them. Complete this setup before timing the cancellation-to-booking flow.
3. Explain the candidate data: Alex is eligible and has the highest staff-assigned priority; Sam is eligible with lower priority; Taylor is unavailable at 3pm and must be excluded. Seed matching availability, notice, duration, and distance values consistently.
4. Cancel the 3pm appointment. Start measuring time from the persisted cancellation event.
5. Show Alex as the top match and explain why Taylor is excluded. Click “Send offer.”
6. Open Alex's offer in the demo inbox and click “Accept appointment.” This demonstrates the patient experience without claiming that a real SMS was sent.
7. Return to the dashboard. Show the slot booked for Alex, the offer accepted, Alex's waitlist entry fulfilled, and the recorded time between cancellation and booking.
8. Refresh the page to prove persistence. Open the same offer again and show that it cannot create a second booking.

**Target:** Complete steps 4–7 within 30 seconds during the controlled demo. The metric includes the simulated patient's response time. It is not a real-world promise about how quickly patients will respond.

**Optional second scenario:** Reset, send an offer, decline it, and offer the slot to Sam. Also verify that an expired offer cannot be accepted. A labelled demo clock control can advance time without making judges wait for an actual timeout.

## 6. Repo URL

**Answer:** https://github.com/abarisuzuner/cancellation-backfil

The repository is public. The application is intended to live in `code/`, with project and verification documentation in `docs/`. Before submission, add setup instructions, required environment variable names, database initialization, and the commands needed to run the application and its checks.

## 7. Video URL (optional)

**Current answer:** Leave blank until a video exists.

**Proposal:** Record a 60–90 second walkthrough: identify the receptionist's problem, show the AI preference extraction, demonstrate cancellation through acceptance, and finish with the persisted booking and measured elapsed time. Add the actual video URL only after confirming that judges can open it without requesting access.

## 8. Does the app use login?

**Proposed answer for the judge demo:** No login is required to access the isolated synthetic demo. Judges start their own demo session and use the in-app patient inbox. The application should explain that this is a demonstration environment.

If the implemented app requires login, use the form's login option and provide a dedicated demo account through the submission form. Document the exact entry path and any onboarding steps there. Do not put credentials in this public repository. A future real clinic workflow would need authenticated staff access separate from patient offer links.

## 9. Verification instructions

### Suggested extra notes for the submission form

Use the following wording only after the controls and behavior exist:

> Open the demo URL and choose “Start demo” to load an isolated synthetic clinic. The page shows the demo date and clinic time zone. Cancel the booked 3pm physiotherapy appointment, inspect the ranked matches, and send the offer to Alex. Open “Demo inbox,” choose Alex's offer, and accept it. Return to the clinic dashboard and refresh: the same slot should be booked for Alex, the offer should be accepted, and Alex's waitlist entry should be fulfilled. Use “Reset demo” to repeat. Offers are shown in the demo inbox; no real SMS or email is sent.

### Proposed verification cases

These are requirements for the future implementation, not checks that have already passed.

| Check | Action | Expected observable result |
| --- | --- | --- |
| Demo access | Open the submitted URL and start a session | A synthetic clinic loads without special access or onboarding |
| AI extraction | Submit the example availability note | A draft shows Tuesday, 14:00–17:00, and 60 minutes' notice; saving requires confirmation |
| Cancellation | Cancel the booked 3pm appointment | The old booking is marked cancelled, the slot becomes available, and an event is recorded |
| Eligibility and ranking | Inspect candidates for the vacancy | Alex precedes Sam under the proposed policy; unavailable Taylor is excluded with a reason |
| Offer | Send an offer to Alex | One active offer appears with an expiry and a patient link in the demo inbox |
| Acceptance | Accept the valid offer | The slot becomes booked for Alex, the offer becomes accepted, and the waitlist entry is fulfilled |
| Persistence | Refresh the dashboard | The replacement booking remains visible |
| Duplicate or concurrent acceptance | Repeat acceptance or submit competing requests | At most one booking is confirmed for the slot |
| Decline or expiry | Decline an offer or advance the demo clock beyond expiry | The old link cannot book; the next eligible patient can receive an offer |
| No eligible candidate | Use a waitlist with no suitable patient | The slot remains open and staff see an explicit manual-follow-up message |
| AI unavailable | Simulate a failed AI request | An explicit error appears and manual preference entry remains usable |
| Session isolation | Start a second judge session | Cancelling or resetting in one session does not change the other's data |

### “Paste the AI response here” / verification contract

**Current answer:** Leave this optional field blank until the official downloaded prompt has been run against the completed submission details. The supplied judging text does not include that prompt or the required JSON schema, so this document cannot truthfully supply the final verification contract.

Follow the form's stated process:

1. Fill in the project answers, working demo URL, repository URL, and actual login information if needed.
2. Click **Download Prompt** in the judging form.
3. Give the complete downloaded prompt to the AI tool and run it as instructed, using the real demo and access details.
4. Paste the complete returned JSON object into the form exactly as returned. The form says raw JSON or one JSON fenced block is accepted.
5. If it identifies a broken path or missing behavior, fix the app or correct the submission details, then obtain an updated response. Do not turn an unverified expectation into a claimed passing result.

The verification table above provides concrete behaviors to check. It is not a substitute for the official contract format.

## 10. Expected outcome and how we will measure it

**Product outcome:** Help clinics fill otherwise unused appointment capacity while offering waiting patients earlier appointments and reducing repetitive front-desk work.

**Hackathon outcome:** Demonstrate one complete, persistent cancellation-to-booking flow, one working AI-assisted preference-entry flow, and understandable handling of unsuccessful offers.

| Measure | Proposed definition | Evidence to collect |
| --- | --- | --- |
| Time to backfill | Confirmed replacement booking time minus cancellation time | Database event timestamps; aim for 30 seconds in the controlled demo |
| Backfill rate | Reopened cancelled slots filled before their start time divided by all cancelled slots reopened before their start time, including those with no eligible match | A defined set of demo runs first; a clinic pilot later |
| Staff effort | Staff actions and active time spent filling a cancelled slot | Compare a documented manual scenario with the app workflow |
| Appointment value recovered | Sum of stated values for replacement bookings | Clearly labelled synthetic values in the demo; an estimate, not collected revenue |
| AI extraction accuracy | Correct availability and notice fields compared with human-labelled examples | A small test set including ambiguous notes; report errors and corrections |
| Booking integrity | Number of duplicate active bookings for the same slot | Repeat-acceptance and concurrency checks; target zero |

No clinic savings, real-world fill rate, or AI accuracy is established by the current repository. Report those figures only after collecting evidence.

## 11. Decisions proposed to close the gaps

| Missing detail in the source | Proposed decision | What must be confirmed |
| --- | --- | --- |
| Initial demo clinic | One physiotherapy clinic, with dental clinics also described as target users | Seed data and supported appointment types |
| AI role | Extract scheduling preferences for human confirmation | Working OCI account, model access, and extraction quality |
| Technology stack | React/TypeScript, Node.js/TypeScript, Oracle Database, OCI Generative AI | Team familiarity and available hackathon services |
| Ranking policy | Eligibility filters, then staff priority, waiting time, and distance | Feedback from clinic coordinators |
| Patient notification | In-app demo inbox with an expiring offer link | Whether real messaging fits the remaining build time |
| Demo access | Public HTTPS entry point with isolated synthetic sessions | Actual deployment URL and verified access |
| Video | Optional short recording of the same working flow | Actual recording and accessible URL |
| Verification JSON | Use the form's downloaded prompt after deployment | Official prompt and final submission details |

The immediate build priority is the cancellation, matching, offer, and atomic acceptance flow with Oracle-backed persistence. Add the AI preference-entry feature and its review step, then verify the demo from a fresh session. Update this document to describe what actually works before copying answers into the judging form.
