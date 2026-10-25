# Cancellation Backfill — Submission Answers

## What did you build?

We built **Cancellation Backfill**, a web application that helps small dental and physiotherapy clinics fill cancelled appointments with suitable patients from their waitlist. It connects the clinic's scheduling work with a simple patient response: an appointment opens, staff review eligible patients, and an accepted offer becomes a replacement booking.

The application includes an appointment dashboard, appointment creation and cancellation, a searchable and editable waitlist, ranked patient matching, expiring appointment offers, a patient acceptance page, and an activity history. Staff can record each patient's treatment, required duration, clinician preference, availability, minimum notice, travel time, distance, and priority. A local availability assistant can turn common scheduling phrases into a draft for staff to review and save.

The central example is a **3pm physiotherapy appointment** that becomes available. The app identifies Alex Morgan as the highest-ranked eligible patient, explains why other patients cannot attend, and lets staff issue an offer. Alex accepts through the patient preview, the appointment becomes booked, and the dashboard records one recovered appointment with an estimated value of **$75**. The booking survives a page refresh, and the activity history records the steps and elapsed time.

The published version is a working, responsive browser application on GitHub Pages. It uses fictional clinic records and browser-local storage, so a reviewer can try the complete workflow without an account or setup. Offers appear in an in-app inbox and patient preview; external delivery and shared access across devices are future integrations.

## Who has this problem?

The primary user is the **front-desk coordinator at a small dental or physiotherapy clinic**. When an appointment is cancelled, the coordinator has a limited window to find a replacement while continuing to handle arrivals, phone calls, and routine administration. A waitlist contains potential patients, but staff still need to decide who can actually use that specific opening.

That decision involves several constraints. A patient must need the right treatment, fit within the available duration, accept the clinician, be free for the entire appointment, and have enough notice and travel time to attend. Calling patients one by one can take much of the remaining time. A patient may miss the call or decline, and the coordinator must track the response before moving to the next person.

An empty appointment affects three groups: staff spend time on repeated coordination, practice owners lose usable appointment capacity, and patients miss an opportunity to receive care sooner. Appointment capacity is time-sensitive: once the slot begins, the clinic cannot recover that particular opportunity later.

Our initial focus is on clinics where staff manage this process manually and can review a small, understandable set of recommendations. The workflow is a product hypothesis supported by the scenario we implemented; we have not yet collected clinic interview results or measured operational savings. The next discovery step is to work with three to five clinic coordinators to validate the constraints, ranking policy, and response window.

## How does your app solve it?

Cancellation Backfill brings cancellation, patient selection, offers, and booking updates into one workflow. The coordinator can see which step needs attention and why a patient is or is not suitable.

1. **Capture usable preferences.** Staff enter scheduling details directly or review a draft extracted from a note. For example, “I can come on Tuesdays between 2 and 5 in the afternoon, and I need at least an hour's notice” becomes Tuesday availability from 14:00 to 17:00 with 60 minutes' notice. Applying the draft fills editable fields; saving requires a separate confirmation. Ambiguous wording prompts review.
2. **Reopen the appointment.** Cancelling an upcoming booking preserves its history and makes the slot available. The cancellation timestamp starts the backfill measurement.
3. **Filter before ranking.** The app checks treatment, clinician, duration, full-slot availability, notice, travel time, and conflicting bookings. Eligible patients are then ordered by staff-assigned priority, longest waiting time, and shortest distance, with a stable identifier resolving ties. Higher priority cannot make an unavailable patient eligible.
4. **Send a controlled offer.** Staff review the explanation and select an eligible patient. Each slot and patient can have only one active offer at a time. The offer shows appointment details and a configurable response deadline; the sample workspace uses two minutes.
5. **Confirm the replacement.** Acceptance rechecks the current slot, eligibility, and expiry before updating the booking, offer, and waitlist together. Repeated acceptance returns the existing result, preventing a second booking within the browser workspace.
6. **Handle unsuccessful offers.** A decline or expiry closes the offer and allows staff to contact the next eligible patient. If no candidates remain, the slot stays open with explicit manual-follow-up guidance.

The seeded scenario makes these decisions visible. Alex and Sam can attend the 3pm appointment, but Alex ranks first because of staff-assigned priority. Taylor has high priority but is available only in the morning, so the app excludes Taylor with an availability explanation. Accepting Alex's offer fills the appointment and fulfils the waitlist entry. In a separate run, letting Alex's offer expire allows an offer to Sam; declining that offer demonstrates the no-match outcome.

The intended value is less manual searching and coordination, more recovered appointment capacity, and earlier access for waiting patients. The dashboard measures elapsed backfill time, filled appointments, and estimated appointment value. Our reference target is 30 seconds from cancellation to replacement booking in the controlled scenario, including the simulated patient's response. This is a demonstration target, not a claim about real patient response times or collected revenue. A clinic pilot would measure backfill rate and staff effort against the clinic's existing process.

## How did you build it?

We built the published application with **dependency-free JavaScript, HTML, and CSS**. GitHub Pages serves the root `index.html`, which loads application files from `code/`. Relative asset URLs and hash-based navigation keep the application working under the repository's `/cancellation-backfil/` path, including direct links and page refreshes. No package installation or build bundling is required to run it locally.

The implementation separates the interface from the scheduling rules and storage. The app.js and styles.css files in the code folder provide responsive clinic screens, forms, patient previews, and interaction handling. The engine.js module handles eligibility, ranking, cancellation, offer deadlines, acceptance, and metrics.

The store.js module manages versioned browser storage, coordinates writes, and shares updates across tabs. The parser.js module extracts scheduling details into preference drafts for staff to review. Automated checks in the code/tests folder cover scheduling rules, parsing, and persistence behavior.

The main engineering challenge was keeping the appointment, offer, and waitlist consistent when responses are repeated or arrive after conditions change. Before a write, the app acquires a Web Lock and rereads the latest saved workspace. It then validates and saves the resulting state. This coordinates cooperating tabs in the same browser profile and prevents competing actions from creating duplicate active bookings. It is a browser-local guarantee; it does not provide coordination between independent devices.

The availability assistant currently uses a **local rule-based parser**, clearly labelled in the interface. It does not call a live language model or infer clinical priority. We implemented the extraction, validation, review, and confirmation steps so that a future AI service can produce drafts without taking control of booking decisions. Staff remain responsible for confirming preferences and assigning priority.

Verification includes 21 JavaScript tests covering eligibility, ranking, full-slot availability, notice and travel constraints, offer expiry, declines, repeated and concurrent acceptance, input validation, ambiguous notes, and storage failures. We also exercised the booking journey, refresh persistence, waitlist and appointment creation, expiry, and desktop/mobile layouts in the browser. The repository includes a separate Python/SQLite prototype with eight tests; it has its own frontend and records and is not the backend of the GitHub Pages application.

The strongest completed capability is the full cancellation-to-booking journey, including unsuccessful responses and persistent state. The current public release uses fictional data, has no staff authentication, sends no SMS or email, and resolves patient preview links only within the browser workspace that created them. It is ready for repeatable product evaluation, while deployment with real clinic records requires a shared service.

Our next implementation steps are an authenticated API, Oracle-backed persistence with transactional booking constraints, cross-device patient offer links, and notification delivery. We plan to integrate OCI Generative AI for broader scheduling-language extraction while retaining validation, human confirmation, and manual entry. Oracle Database and OCI Generative AI are planned integrations and are not connected to the submitted demo.

## Demo URL

[Open Cancellation Backfill](https://abarisuzuner.github.io/cancellation-backfil/)

No login or credentials are required. The app opens with six fictional appointments and six waitlist entries. **Clinic settings → Reset sample workspace** restores the starting scenario; the clock control allows offer expiry to be tested without waiting. Use the same browser profile for the staff view and patient preview, because the demo stores its workspace locally.

## Repository URL

[View the repository](https://github.com/abarisuzuner/cancellation-backfil)
