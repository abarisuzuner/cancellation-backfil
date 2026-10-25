# Feedback response and recommendations

This response addresses the feedback in [Judgement comments](Judgement%20comments), reviewed on 26 October 2026. Technical Execution scored 98/100 and Differentiation scored 94/100; Demand Reality scored 82/100 and Solution Fit scored 83/100. The comments call for clearer evidence and a narrower adoption story. They do not establish customer demand or production readiness.

## Changes made in this revision

The submission answers now describe the coordinator's manual workflow and the proposed replacement in a specific 1pm cancellation / 3pm appointment scenario. They name the coordinator as the user, the owner or manager as the buyer, and independent physiotherapy practices as the initial segment. The smallest useful product is recovery of one same-day slot, without requiring a full practice-management replacement.

The overview now has a recovery progress panel with a next action for each stage. It derives progress from the saved appointment, offer, and booking records. Acceptance shows the actual patient, elapsed time, and estimated value; expiry, decline, and a new vacancy do not reuse old completion evidence. A disclosure explains the manual and product-assisted workflows. Matching now states the eligibility and ordering policy beside the candidates. Four additional tests cover successful recovery, unsuccessful responses, reopening, and elapsed or missing slots.

The answers include a transparent bottom-up opportunity example, an outreach plan, a baseline/pilot measurement approach, explicit production boundaries, and an expansion path. The original judge comments remain unchanged. Judge App Questions stays in prose, without tables.

## Demand Reality: prove the problem rather than add adjectives

The before-and-after explanation is now concrete, but demand remains unvalidated. First, interview three to five coordinators and practice owners. Ask them to walk through a recent cancellation: how much notice remained, how they selected patients, how many contacts they attempted, how much active staff time it took, and whether the appointment was eventually used. Record findings with permission and keep identifiable patient data out of the public repository. Do not treat a friendly response to a demo as purchase intent.

Then recruit two design partners willing to share an agreed, de-identified baseline and test the workflow. The evidence to add to the submission is an actual count of practices interviewed, observed cancellation frequency, current recovery rate, active staff time, and a buyer's next commitment. If the evidence contradicts the proposed segment or workflow, change the product focus.

The illustrative model is five practices × 20 unfilled cancellations per month × $75 per appointment = $7,500 of exposed appointment value. Recovering 25 additional slots would represent $1,875 of estimated value. All inputs are assumptions. Replace them with observations before describing market size, ROI, pricing, or customer traction. Keep estimated appointment value separate from collected revenue and from product revenue.

## Target Customer: test a reachable first segment

Focus outreach on independent physiotherapy practices with an existing waitlist and manual cancellation calls. The proposed entry point is a short demonstration to the practice owner or manager, with the coordinator participating. Local outreach and practitioner introductions are proposed channels; no existing distribution advantage or partner relationship is claimed.

Start with one practice, one appointment type, and staff approval of every offer. Before expanding the segment, establish that the clinic can maintain usable preferences and that enough cancellations have eligible patients. A waitlist full of incompatible or unavailable patients would weaken the premise even if the software is reliable.

## Solution Fit: show a complete recovery and a failure path

Use the progress panel to narrate cancellation → eligibility → offer → acceptance → persisted booking. Open the excluded-patient explanation to show why Taylor is rejected despite high priority. Refresh after acceptance and show the event history. Then use a fresh workspace to demonstrate Alex's expiry, Sam's decline, and the resulting open slot. This proves that an unsuccessful offer does not silently count as a filled appointment.

Record a 60–90 second walkthrough of the main path and include a shorter unsuccessful-path clip if the submission permits it. Use observed elapsed time and say that the patient response is simulated. Fill the submission's actual demo URL, repository URL, and product fields; the earlier exported APP DETAILS contained null values. Paste valid verification JSON using CSS selectors with single quotes inside JSON double-quoted strings.

## Code recommendations, in priority order

1. Add a repeatable browser regression suite and CI. Run the cancellation-to-acceptance path, refresh persistence, expiry-to-next-patient path, no-match state, parser review, and mobile layout on every change. Keep the GitHub Pages path prefix in the tests. The current Node tests verify business logic and serialized writes; they do not replace a real browser test for routing, focus, dialogs, or rendering. Completion means CI can reproduce the same persisted booking and unsuccessful paths without manual preparation.

2. Strengthen browser persistence validation before adding more state. The read function in code/store.js checks top-level arrays but does not validate every record, reference, enum, timestamp, or setting. Add a schema validator and versioned migrations, preserve invalid data for explicit recovery, and test malformed JSON, broken references, missing settings, and older versions. Also test failed reads and storage availability changes across tabs. Completion means bad saved data produces a recoverable screen instead of a crash or a success message that implies durable storage.

3. Build the shared booking boundary before real notifications. Keep code/engine.js as the rule reference, but make the server authoritative for time, eligibility, vacancy versions, and acceptance. Use Oracle transactions, a uniqueness constraint for an active booking per slot, idempotency keys, clinic authorization, and expiring patient tokens. Test simultaneous acceptance from independent clients, stale offers after reopening, and cross-clinic access. Browser Web Locks cover cooperating tabs only. GitHub Pages is a static host, so this requires a separate service; see [GitHub's hosting description](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages).

4. Add delivery and calendar reliability as part of that same shared service. Use a transactional outbox, retries with duplicate suppression, delivery receipts, patient contact preferences, and a clinic-visible failure state. Reconcile bookings with the existing calendar and detect slots changed outside the app. Completion means a provider timeout, duplicate callback, or external calendar edit cannot create a double booking or silently lose an offer. Keep these capabilities described as planned until tested end to end.

5. Add live AI only with an evaluation set and a manual fallback. Use a server-side OCI adapter to extract scheduling fields, never expose credentials in the browser, validate output, and retain the existing review/apply/save flow. Measure exact field accuracy, unsupported cases, correction rate, latency, and cost against the local parser. Include ambiguous times, exceptions, multiple windows, and time zones. Oracle documents hosted model access through its APIs in the [OCI Generative AI overview](https://docs.oracle.com/en-us/iaas/Content/generative-ai/overview.htm); the project has no live OCI connection yet. Clinical priority and booking constraints must remain outside model discretion.

6. Add operational outcome measurements after the shared workflow exists. Track each cancellation/vacancy, eligible-candidate count, contact attempts, delivery outcome, accepted booking, and any later re-cancellation. Define the backfill-rate denominator to include openings with no eligible patients and report cancellations separately from newly created open slots. Measure active coordinator time separately from patient response time. Compare a baseline period and a pilot period with comparable cases; do not infer causal improvement from the demo's single successful booking.

## Submission explanation recommendations

Keep the four answers centered on the specific customer and the complete recovery loop. Replace hypothetical inputs with measured evidence as it becomes available. Add a short, attributed customer observation only after an actual interview and permission to use it. State the number of interviews and participating practices precisely; distinguish an introduction, a design partner, a pilot, and a paying customer.

For technical claims, separate what runs in the published app from the independent Python prototype and future services. Describe the local parser honestly. A polished interface and passing unit tests do not establish readiness for real patient operations. Before describing such a deployment as ready, demonstrate shared authorization and booking integrity, appropriate handling of patient records, delivery recovery, monitoring, backups and restoration, and a support process. These are engineering readiness criteria, not a claim of legal or regulatory compliance.

Explain expansion as a sequence with evidence gates: validate recovery at one physiotherapy practice; repeat it at a few practices; integrate their existing calendar; then test dental constraints and multiple locations. A per-practice subscription is a pricing hypothesis to test with the buyer. The eventual differentiation may come from dependable integrations, explainable policies, and measured outcomes, but there is no established moat or competitive advantage yet.

## Recommended next decision

Prioritize customer evidence and a reproducible demo over more screens. If interviews confirm both unfilled capacity and a usable waitlist, build the shared booking service and one notification channel for a narrowly scoped pilot. If coordinators report that preference maintenance or calendar duplication is the main obstacle, solve that adoption barrier first. Broader AI and platform expansion should follow proof that the first recovery loop creates value.

## Verification of this revision

All 25 JavaScript tests and the publication check passed. In the local browser, the new Start recovery and Review eligible patients controls led to the matching panel; Continue as patient led to acceptance; the confirmed record and completed progress remained after refresh. A separate run expired Alex's offer, offered the slot to Sam, declined it, and showed manual follow-up with no recovered booking. At a 390-pixel viewport, the page width remained 390 pixels and the progress panel fit without horizontal page overflow. No browser warnings or errors were reported during these checks. These are controlled sample-workspace checks, not clinic outcome measurements.
