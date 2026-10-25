# Web application scope

## Delivery

Build a dependency-free JavaScript application in `code/`. A root `index.html` loads its CSS and browser modules with relative asset URLs so the repository can be published from `main` / root on GitHub Pages. Hash routes support direct navigation without server rewrites. Package installation is unavailable in the development environment, so the implementation uses browser APIs and Node's built-in test runner.

GitHub Pages is a static host. This release is a functional, synthetic-data evaluation workspace with browser-local persistence, not a shared clinic backend. It does not send external messages, authenticate real clinic staff, connect to Oracle Database, or call an AI service. The availability assistant is explicitly labelled as a local rule-based parser. No API secrets belong in the browser.

## Inputs and state

- Clinic settings: name and offer response window.
- Slots: identifier, date/time, duration, treatment, clinician, appointment value, and vacancy timestamp.
- Bookings: slot, patient, status, timestamps, and whether the booking backfilled a cancellation.
- Waitlist: name, treatment, required duration, clinician preference, available weekdays and hours, minimum notice, travel time, distance, staff-assigned priority, waiting-since date, and waiting/paused/fulfilled status.
- Offers: identifier, slot, patient, vacancy identifier, expiry, and pending/accepted/declined/expired status.
- Activity: timestamped events for cancellations, offers, acceptance, expiry, and waitlist changes.

Store a versioned workspace in localStorage. Different browser profiles are isolated; tabs in the same profile share the workspace. Serialize writes with the Web Locks API and reread the latest state inside the lock. A patient preview link resolves within the same browser workspace; it is not an externally delivered appointment invitation.

## Main workflow

1. Seed a Tuesday clinic day at 13:00 with a booked 15:00 physiotherapy slot and a mixed waitlist.
2. Cancel an upcoming booking through a confirmation dialog.
3. Filter candidates by treatment, clinician, duration, full availability, notice/travel time, and booking conflicts. Rank eligible patients by assigned priority, waiting time, distance, and stable ID.
4. Send one active offer per slot and patient. Show it in the inbox and open its patient preview.
5. Accept once, atomically updating the booking, offer, and waitlist in the local workspace. Repeated acceptance is idempotent.
6. Declined/expired offers cannot book. Move on to the next eligible candidate; show manual follow-up when none remain.
7. Refresh to verify persistence. Reset the sample workspace or advance its clock to exercise expiry.

## Additional screens

Dashboard with record-derived recovery progress and a manual/product workflow comparison, appointment list and creation, waitlist search/add/edit/pause, patient inbox, individual offer page, activity history with JSON export, clinic settings, and an accessible quick-start guide. Availability text extraction produces a reviewable draft; applying it populates editable fields and saving requires an explicit action. Unsupported or ambiguous text leaves manual entry available.

## Verification

Test full-slot availability, incompatible clinician/type/duration, notice/travel constraints, priority ordering, one active offer, accept/decline/expiry, stale links, duplicate/concurrent acceptance, no-match behavior, parser ambiguity, persistence, and GitHub Pages subpath assets. Visually inspect desktop and mobile layouts and exercise the main journey in a browser.

## Risk and limits

The main constraint is static hosting: real patient links across devices, authentication, notifications, Oracle transactions, and OCI inference require a server. Browser-local locking protects cooperating tabs, not independent users or devices. Use fictional records only. The 30-second journey is a measurable evaluation target, not a production claim.

## Existing server prototype

The independently developed Python/SQLite prototype remains at `code/app.py`, with its original frontend preserved as `code/server-app.js` and `code/server-styles.css`. Its public routes and API remain unchanged. It is documented by `code/README.md` and `code/SPEC.md`; it is not used by the static Pages application.
