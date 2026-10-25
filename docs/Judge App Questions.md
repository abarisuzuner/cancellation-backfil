# Cancellation Backfill — Submission Answers

## What did you build?

We built Cancellation Backfill, a working web application that turns a cancelled appointment into an earlier visit for a suitable patient on the clinic's waitlist. The first use case is deliberately narrow: a front-desk coordinator recovering a same-day, 30-minute physiotherapy appointment at one independent practice. Dental appointments are supported in the sample data, but physiotherapy is our proposed first customer segment.

The smallest useful product is one complete recovery loop: maintain scheduling preferences, reopen an appointment, review eligible patients, approve one offer, and record the patient's acceptance. That gives staff a clear next action without requiring a replacement for the clinic's entire practice-management system. The current release includes the appointment book, editable waitlist, ranked matches, patient preview, expiring offers, and activity history needed to demonstrate that loop.

The overview includes a recovery progress panel for the 3pm appointment. It follows the actual saved records through opening, matching, patient response, and confirmation. It explains the next action, displays the confirmed patient's name and estimated appointment value after acceptance, and returns to matching or manual follow-up when an offer is unsuccessful. Its expandable explanation shows how the workflow changes the coordinator's work.

The public application runs on GitHub Pages with fictional records and browser-local persistence. A reviewer can complete the staff and patient journey without login or setup. This is a functional evaluation workspace; it is not a shared service for real clinic records, and no external messages are sent.

## Who has this problem?

The daily user is the front-desk coordinator. The likely buyer is the practice owner or practice manager who is responsible for appointment capacity, staffing costs, and patient access. Our initial customer hypothesis is an independent physiotherapy practice with a small clinician team, an existing waitlist, and cancellations still handled through individual calls. Patients on that waitlist are the beneficiaries and eventual recipients of appointment offers.

Consider a cancellation at 1pm for a 3pm appointment. In the manual workflow, the coordinator opens the waitlist, checks treatment and clinician requirements, checks who can attend for the whole slot, estimates notice and travel constraints, and starts calling. A missed call or decline means another search and another call. Once someone agrees, staff must update the appointment book and waitlist. This all competes with arrivals and routine administration. The example illustrates the workflow we are targeting; we have not yet observed or timed it in a customer clinic.

With Cancellation Backfill, the coordinator reopens the slot, sees a filtered and ordered shortlist with reasons, and approves one offer. Acceptance updates the booking and waitlist together. A decline or deadline expiry makes the next eligible patient available to contact. The intended change is fewer manual checks and handoffs between records, with a visible record of what happened. The demo simulates the patient's response; it does not establish that real patients will respond as quickly.

We would reach the first customers through direct outreach to local independent practices and practitioner introductions, offering a short walkthrough of one cancelled appointment. A practice owner can evaluate this narrow workflow without first agreeing to replace an entire scheduling system. Our initial recruitment target is three to five coordinator interviews and two willing design partners. These are planned outreach targets, not existing customers or partnerships.

To make the opportunity concrete, an illustrative five-practice cohort with 20 unfilled cancellations per practice per month at an assumed $75 appointment value would expose 100 slots and $7,500 of appointment capacity each month. If the product recovered an additional 25 of those slots, that would represent $1,875 of estimated appointment value. The clinic count, cancellation volume, price, and incremental recovery are assumptions, not researched market statistics, traction, revenue, or a total-market estimate. The $75 matches the sample appointment. Interviews and cancellation logs must establish the real values and how many slots the existing process already recovers.

Before a commercial claim, we need evidence of cancellation frequency, current backfill rate, coordinator effort, willingness to pay, and patient willingness to receive offers. An agreed pilot would compare a baseline period with a product-assisted period, account for differences in case mix, and count every eligible cancellation, including those with no suitable waitlist patient.

## How does your app solve it?

The app brings the cancellation, matching decision, patient offer, and booking update into one traceable process. Eligibility comes before ranking: a patient must need a compatible treatment and clinician, fit the duration, be available for the whole appointment, have enough notice and travel time, and have no conflicting booking. Eligible patients are ordered by staff-assigned priority, longest waiting time, and shortest distance, with a stable identifier resolving a final tie. The interface states that policy and shows exclusion reasons. Staff decide who receives an offer; the application does not infer clinical priority.

The reference journey starts with six appointments and six fictional waitlist entries. Reset the sample workspace in Clinic settings, return to Overview, and use Start recovery in the progress panel. Confirm cancellation of the 15:00 booking, then choose Review eligible patients. Alex Morgan and Sam Rivera qualify; Alex ranks first because of staff-assigned priority. Taylor Chen also has high priority but is available only in the morning, so Taylor is excluded. This demonstrates why priority alone is insufficient to fill a specific appointment.

Offer the appointment to Alex, then use Continue as patient in the progress panel or Open patient preview in the matching panel. Accept the appointment and return to Overview. Alex is now booked, the waitlist entry is fulfilled, all four progress steps are complete, and the dashboard shows one backfilled appointment with $75 of estimated value. Refresh the page to check persistence and inspect Activity for the cancellation, offer, and acceptance events. The elapsed time comes from those actions; it is not a preset result. The 30-second reference target remains a controlled demonstration target, not a field result.

The unsuccessful path is equally important. On a fresh run, offer the slot to Alex, advance the sample clock by three minutes in Clinic settings, and return to Overview. Alex's offer is closed, the progress panel explains the expiry, and Sam becomes the next candidate. If Sam declines, the appointment stays open with manual-follow-up guidance. An expired or declined offer cannot confirm a booking. Repeated acceptance is idempotent, and one active offer per slot and patient limits conflicting commitments within the browser workspace.

For preference entry, the local availability assistant turns common scheduling phrases into editable drafts. For example, Thursdays 10am to 12pm with 30 minutes' notice produces those structured fields. Staff must apply the draft and then save it; ambiguous wording prompts manual review. The assistant uses deterministic parsing in this release, not a live language model.

The product's proposed differentiation is the complete, explainable recovery loop: appointment constraints determine eligibility, staff control priority and offers, and acceptance changes the same records used to make the match. A reminder alone does not demonstrate those steps. We have not established competitive superiority or defensibility through customer research. The first test is whether coordinators actually recover more appointments with less active effort.

If that narrow use case succeeds, the same eligibility and offer lifecycle can extend to more appointment types, dental practices, multiple clinicians, and eventually multiple locations. Calendar integration would let clinics adopt recovery alongside their existing systems. The commercial hypothesis is a per-practice subscription justified by measured value and staff time saved; pricing is not validated. Expansion should follow evidence from the first segment, with treatment-specific constraints and clinic feedback guiding each addition.

## How did you build it?

The published application uses dependency-free JavaScript, HTML, and CSS. GitHub Pages serves the root index.html, which loads files from the code folder. Relative asset paths and hash navigation support the repository URL, direct links, and refreshes. No installation or build bundling is needed to run the frontend locally.

The app.js and styles.css files provide the screens and interaction handling. The engine.js module implements eligibility, ranking, cancellation, offers, acceptance, and metrics. The store.js module manages versioned localStorage and coordinates cooperating tabs with Web Locks. Before each write, it rereads the latest workspace, validates the requested change, and saves the resulting booking, offer, and waitlist state. The parser.js module handles preference extraction. The journey.js module derives the progress panel from these records instead of maintaining a separate demonstration state.

The main engineering challenge is consistency when responses repeat, offers expire, or an appointment is reopened. Acceptance rechecks the current slot, vacancy identifier, expiry, and patient eligibility. A previously accepted or closed offer cannot create a second booking for a new vacancy. The progress panel also scopes closed-offer evidence to the current vacancy, so it does not claim an old booking as a new success.

The JavaScript suite contains 25 tests covering eligibility, ordering, availability, notice and travel constraints, expiry, declines, repeated and concurrent acceptance, validation, ambiguous notes, persistence failures, and recovery progress across state changes. Browser verification covers the booking journey and refresh, expiry and decline, preference entry, and responsive layouts. The separate Python/SQLite prototype has eight tests and its own frontend and records; it does not power the published GitHub Pages app.

Production readiness is limited to a deployable static evaluation experience and tested scheduling logic within its stated browser-local scope. The application is not production-ready for real patient operations. Browser storage is not a shared clinic database; preview links work only in the browser workspace that created them. Staff authentication, clinic isolation, real notification delivery, calendar synchronization, operational monitoring, and recovery from server failures remain unimplemented. The local parser is working, while live AI and Oracle services are planned.

The next engineering milestone is an authenticated API with Oracle-backed records, transactional booking constraints, and expiring patient tokens that work across devices. Reliable notification delivery needs retries, delivery status, and duplicate suppression, followed by calendar reconciliation. OCI Generative AI can broaden preference extraction through a server-side service, retaining schema validation, human review, and manual fallback. We will evaluate extraction against labelled scheduling notes before attributing value to AI. The language model should not assign clinical priority or bypass booking rules.

## Demo URL

[Open Cancellation Backfill](https://abarisuzuner.github.io/cancellation-backfil/)

No login or credentials are required. Start with Clinic settings → Reset sample workspace, then follow the 15:00 opening on Overview. Use the same browser profile for staff screens and patient previews. Use fictional details only. A video walkthrough has not yet been published.

## Repository URL

[View the repository](https://github.com/abarisuzuner/cancellation-backfil)
