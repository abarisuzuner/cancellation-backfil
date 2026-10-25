# Cancellation Backfill

[Open the application](https://abarisuzuner.github.io/cancellation-backfil/) · [GitHub repository](https://github.com/abarisuzuner/cancellation-backfil)

Cancellation Backfill is an AI-assisted appointment recovery system for small dental and physiotherapy clinics. It connects newly available appointments with patients who are waiting and able to attend, helping clinics recover unused capacity and patients receive earlier appointments. The project was created for the **Oracle AI Hackathon 2026**.

The core experience is simple: **a 3pm slot opens, a suitable patient receives an offer, and one click fills the appointment.**

**Stage:** Working browser application. The current release runs entirely on GitHub Pages with fictional records stored in the visitor’s browser. Oracle persistence, live AI, staff authentication, and external messaging are planned server integrations.

## The problem

A cancellation creates a time-sensitive coordination problem. The receptionist must find a patient who needs the right appointment type, is available for the entire slot, and can reach the clinic with enough notice. Today, the target clinic handles that process through phone calls and manually maintained waitlists, alongside its normal front-desk workload.

Working through the list takes time. Patients may not answer, may be unavailable, or may need time to decide. The appointment can remain empty even when someone on the waitlist could have attended. The clinic loses an opportunity to use its capacity, while patients continue waiting for appointments that could have happened sooner.

The primary user is the **front-desk coordinator** at a small clinic. Practice owners benefit from better use of appointments and less repetitive administrative work. Patients benefit from relevant offers for earlier appointments without repeatedly calling the clinic. Physiotherapy and dental practices share this workflow, with treatment type, clinician, and appointment duration determining which patients are suitable for each vacancy.

## The product experience

Cancellation Backfill brings the waitlist, matching decision, patient offer, and booking update into one workflow.

1. **Maintain the waitlist.** Record each patient's appointment type, availability, minimum notice, approximate distance, and clinic-assigned priority. Staff can enter preferences directly or review a draft from the local availability assistant.
2. **Reopen an appointment.** Cancelling a booking preserves its history and makes the underlying slot available for a replacement patient.
3. **Find suitable patients.** The matching engine filters the waitlist and presents eligible patients in priority order, with a clear explanation of each match.
4. **Offer the slot.** Staff approve the top match or select another eligible patient. The patient receives an expiring offer showing the appointment details.
5. **Confirm with one click.** The patient accepts through the offer link. The booking, offer, and waitlist update together, and the clinic sees the slot filled.
6. **Handle unsuccessful offers.** A decline or expiry releases the offer so the next eligible patient can be contacted. If nobody qualifies, staff see that the slot needs manual follow-up.

The result is a shorter path from cancellation to confirmed booking, with less searching, calling, and duplicate data entry.

The overview’s recovery progress panel follows the 15:00 reference appointment through opening, matching, patient response, and confirmation. It derives progress from saved records, explains unsuccessful offers, and links to the next action. Expand its workflow explanation to compare manual calling with the product-assisted process.

### Matching policy

Eligibility comes before ranking. A patient must need a compatible treatment and clinician, fit the slot's duration, be available for the whole appointment, have sufficient travel and notice time, and have no conflicting booking.

Eligible patients are ordered by clinic-assigned priority, then time spent waiting, then shorter distance. A stable identifier resolves any remaining tie. Availability cannot be overridden by a higher priority, and staff can inspect the reasons before sending an offer. This initial policy will be evaluated with clinic coordinators.

Each slot has at most one active offer. The response window is configurable to suit the clinic's operating policy and the time remaining before the appointment. An expired or declined offer cannot book the slot, and acceptance must recheck availability and eligibility before confirming the appointment.

## Availability assistant

Patient scheduling preferences often arrive as ordinary language. The assistant turns common scheduling phrases into structured fields that staff can review before they affect matching.

> I can come on Tuesdays between 2 and 5 in the afternoon, and I need at least an hour's notice.

The resulting draft contains Tuesday availability from 14:00 to 17:00 and a minimum notice period of 60 minutes. **Use these preferences** fills the editable form; **Save preferences** or **Add to waitlist** confirms the change. Unsupported or ambiguous phrases prompt manual review instead of inventing availability. Priority is always assigned by staff.

The current assistant is a **local rule-based parser**, explicitly labelled in the interface. It does not call a language model. A future backend can use OCI Generative AI for broader language understanding while retaining validation and human confirmation. Oracle's [Generative AI quick start](https://docs.oracle.com/en-us/iaas/Content/generative-ai/get-started-agents.htm) documents structured outputs for extraction workflows.

## Architecture

The application uses dependency-free JavaScript modules, HTML, and CSS. GitHub Pages serves the root `index.html`, which loads files from `code/` using relative paths. Hash routes support direct links and refreshes without server rewrites.

| Component | Implementation | Responsibility |
| --- | --- | --- |
| Interface | `code/app.js` and `code/styles.css` | Responsive dashboard, appointment editor, waitlist, inbox, patient preview, activity, and settings |
| Booking rules | `code/engine.js` | Eligibility, ranking, cancellation, offer lifecycle, booking integrity, and metrics |
| Persistence | `code/store.js` | Versioned localStorage workspace, serialized writes through Web Locks, and updates across tabs |
| Recovery progress | `code/journey.js` | Derives the reference journey from current appointment and offer records |
| Preference extraction | `code/parser.js` | Local parsing, reviewable drafts, and explicit handling of ambiguity |
| Entry point | `index.html` | Static page with relative stylesheet and module URLs |
| Verification | `code/tests/` | Node's built-in tests for business rules, parser behavior, and persistence coordination |

### Data and booking integrity

The workspace stores appointment slots, bookings, waitlist entries, offers, settings, and a timestamped event history. Cancelling a booking preserves its record and opens a new vacancy. Accepting an offer rechecks its expiry, the patient's eligibility, and the current slot before updating the booking, offer, and waitlist together.

Writes acquire a browser Web Lock and reread the latest saved state. Repeated acceptance returns the existing result; competing operations in cooperating tabs cannot create a second active booking. These guarantees apply to this browser workspace, not to independent devices or a shared clinic database.

Different browser profiles have independent workspaces. Tabs in the same profile share data and receive updates. A patient preview link works only in the workspace that created it. No patient details are encoded into the link, and no external notification is sent. Use fictional records only.

### Server integration path

A shared clinic service requires a backend beyond GitHub Pages. The planned service will use an authenticated API, Oracle Database transactions, and server-side OCI inference. Oracle's official [`node-oracledb` driver](https://oracle.github.io/node-oracledb/) is the intended database connection layer. The browser must never contain database credentials or AI API secrets.

The existing eligibility and offer rules provide the domain model for that service. Durable booking constraints, clinic access controls, cross-device patient links, and SMS/email delivery belong in the server integration.

## Product scope

The initial release covers the complete appointment recovery workflow: an appointment calendar, a waitlist, reviewable preference entry, ranked matching, expiring offers, and persistent replacement bookings. The clinic dashboard provides a shared view of each vacancy, the patient currently being contacted, and the next action required.

The first delivery channel is an in-app inbox. SMS and email delivery and integration with existing clinic calendars are subsequent milestones. Billing and clinical decision-making remain outside the product's scheduling responsibilities.

The core engineering priority is reliable booking state: a cancellation, offer, and acceptance must remain consistent across the clinic and patient views. Integration depth and additional notification channels follow once this workflow is established.

## Access and onboarding

Open the [hosted application](https://abarisuzuner.github.io/cancellation-backfil/) to start a sample clinic immediately. No login is required for this browser-local release. The [source repository](https://github.com/abarisuzuner/cancellation-backfil) contains all application files. A video walkthrough is not yet available.

The sample clinic starts with six appointments, six waitlist entries, and a Tuesday 13:00 clinic clock. Clinic settings let you change the clinic name, currency, and response window, advance the clock to test expiry, or reset the workspace. The calendar, waitlist, offers, and activity survive page refreshes.

Navigation uses `#overview`, `#appointments`, `#waitlist`, `#inbox`, `#activity`, and `#settings`. Patient previews use `#offer/<offer-id>`. **Reset sample workspace** restores the original fictional records and clears changes in this browser profile; other browsers are unaffected. Authentication and clinic onboarding remain requirements for a future deployment with real patient records.

## Evaluation walkthrough

The reference scenario uses a physiotherapy appointment at 3pm and six patients on the waitlist. Three patients illustrate the main matching decisions. Its simulated clinic clock starts at 13:00 on a clearly displayed Tuesday and advances normally. This keeps the example Tuesday availability and one-hour notice requirement consistent and makes the workflow repeatable.

1. Start a fresh session and inspect the appointment and waitlist.
2. Enter the example scheduling note for Alex, review the extracted fields, and confirm them. Complete this setup before timing the booking workflow.
3. Inspect the three synthetic candidates: Alex is eligible with the highest staff-assigned priority, Sam is eligible with lower priority, and Taylor is unavailable at 3pm.
4. Cancel the 3pm booking. The cancellation event starts the backfill measurement.
5. Review the matches, see why Taylor is excluded, and send the offer to Alex.
6. Open **Patient inbox**, select Alex's offer, and choose **Accept appointment**.
7. Return to the dashboard. The slot should be booked for Alex, the offer accepted, and Alex's waitlist entry fulfilled. The event history should show the elapsed time.
8. Refresh to confirm persistence, then reopen the same offer to confirm that it cannot create another booking.

The reference benchmark is **30 seconds from cancellation to replacement booking**, including the simulated patient's response. This is an evaluation target; operational results will depend on patient response times and clinic policy.

A second run covers decline and expiry: decline Alex's offer and offer the slot to Sam, or use a labelled clock control to expire the first offer. The evaluation configuration uses a two-minute response window. **Reset sample workspace** in Clinic settings restores the starting scenario. Offers appear in the in-app **Patient inbox**, with no external message delivery. The availability assistant is labelled as a local parser throughout the interface.

A 60–90 second product walkthrough will follow the same sequence: preference entry, cancellation, matching, acceptance, and the persisted booking. The recording will be published alongside the hosted application.

## Reliability and verification

Automated tests cover eligibility, ranking, offer expiry, declines, repeated and concurrent acceptance, storage failures, input validation, and ambiguous scheduling notes. Browser checks cover the complete booking journey, refresh persistence, waitlist creation, appointment creation, expiry, and desktop/mobile layouts.

| Area | Expected result |
| --- | --- |
| Access and isolation | The sample workspace loads without login; browser profiles are independent and tabs within one profile share updates |
| Preference extraction | The example note produces Tuesday, 14:00–17:00, and 60 minutes' notice; confirmation is required before saving |
| Cancellation | The original booking is marked cancelled, its slot is reopened, and an event is recorded |
| Matching | Alex ranks above Sam under the defined policy; Taylor is excluded with an availability explanation |
| Offers | Only one active offer exists per slot, with a visible expiry and an accessible patient link |
| Acceptance | Booking, offer, and waitlist records update together and remain correct after refresh |
| Booking integrity | Repeated clicks and concurrent requests produce at most one active booking for the slot |
| Decline and expiry | The old offer can no longer book; the next eligible patient can receive an offer |
| No suitable match | The slot stays open with an explicit manual-follow-up message |
| Unsupported scheduling note | The parser requests manual review and leaves preference fields editable |

**Export activity** downloads a JSON report containing the sample clock, metrics, and event history. It records observed workspace activity; it is not a claim of production validation or an external verification contract.

## Success measures

The product's success is measured by better use of clinic capacity, earlier appointments for waiting patients, and less repetitive work for front-desk staff. Controlled evaluation results and observations from clinic pilots will be reported separately.

| Measure | Definition |
| --- | --- |
| Time to backfill | Replacement booking timestamp minus cancellation timestamp; a 30-second target for the reference scenario |
| Backfill rate | Slots refilled before their start time divided by all cancelled slots reopened before their start time, including those with no eligible match |
| Staff effort | Staff actions and active time required to fill a vacancy, compared with a documented manual workflow |
| Appointment value recovered | Stated value of replacement bookings; report this as estimated appointment value, separately from collected revenue |
| Extraction accuracy | Correct scheduling fields against human-labelled examples, including ambiguous notes and required corrections |
| Booking integrity | Duplicate active bookings for the same slot; the required result is zero |

Customer interviews and operational measurements are still to be collected. Initial discovery will involve three to five clinic coordinators to validate the cancellation workflow, ranking policy, and offer window.

## Running locally

Node.js 22 or newer is sufficient. No package installation or bundling is needed.

```sh
node code/scripts/serve.mjs
```

Open [the local application](http://127.0.0.1:4173/cancellation-backfil/). The server also supports the root path. Use HTTP or HTTPS rather than opening the HTML file directly, because browser modules and Web Locks require an appropriate origin.

Run the automated checks from the repository root:

```sh
cd code
npm test
npm run build
```

The build command validates JavaScript syntax and root asset references. The source files are already the publishable application.

## Local server prototype

A separate [Python/SQLite prototype](code/README.md) is also available. Run `python3 code/app.py` from the repository root and open `http://127.0.0.1:8765/`. It retains its own single-appointment workflow, database, and API. Its frontend assets are `code/server-app.js` and `code/server-styles.css`; its HTML entry is `code/index.html`.

The GitHub Pages application and this server prototype are independent implementations and do not share records. GitHub Pages cannot execute Python. The prototype's test suite runs with `python3 -m unittest discover -s code -p 'test_*.py'`.

## Publishing to GitHub Pages

Publish the `main` branch from the repository root (`/`). The root `index.html` loads `code/styles.css` and `code/app.js`, and `.nojekyll` disables Jekyll processing. Keep the entire `code/` application alongside the entry file. No environment variables or secrets are required.

The site is served at [abarisuzuner.github.io/cancellation-backfil](https://abarisuzuner.github.io/cancellation-backfil/). Relative assets and hash navigation support this repository subpath. GitHub documents [branch-based publishing](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

## Roadmap

1. Validate the workflow, ranking policy, and response window with clinic coordinators.
2. Add an authenticated API and Oracle-backed persistence for shared clinic records.
3. Integrate OCI preference extraction with validation, confirmation, and manual fallback.
4. Add clinic onboarding, cross-device patient links, and SMS/email delivery.
5. Connect existing clinic calendars and measure operational outcomes in a pilot.

## Repository layout

```text
index.html          GitHub Pages entry point
README.md           Product and deployment documentation
SPEC.md             Implementation scope and boundaries
code/app.js         Screens, forms, and interaction handling
code/engine.js      Scheduling and booking rules
code/store.js       Browser persistence and write coordination
code/parser.js      Local availability extraction
code/styles.css     Responsive visual design
code/tests/         Browser application logic tests
code/app.py         Independent Python/SQLite prototype
code/server-app.js  Python prototype frontend
code/server-styles.css  Python prototype styles
code/scripts/       Local server and publication checks
docs/               Supporting project materials
```
