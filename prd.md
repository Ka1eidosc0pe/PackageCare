# PackageCare — Product Requirements Document

> Context recovery: read Sections 1–4 and 18 first, then the section relevant to your task. This document preserves the product decisions made with the user. It also identifies assumptions that still need validation; do not treat proposed implementation details as completed integrations.

## 1. Document status and working agreement

- **Product:** PackageCare, a play on “care package.”
- **Hackathon:** Build, Ship, Shape: Amazon Developer Hackathon 2026.
- **Primary track:** Ring.
- **Mini challenge:** AWS Builder.
- **Created:** October 16, 2026.
- **Status:** Implementation authorized by the user's subsequent active goal on October 16, 2026; development in progress.
- **Submission deadline:** October 23, 2026, 12:00 p.m. Pacific / 2:00 p.m. America/Chicago.
- **Workspace:** `/Users/adityaselvam/Desktop/Aage/Hackathons/Amazon_BSS2_2026`.
- **Collaboration:** The human provides product direction, feedback, account access, and submission decisions. Coding agents implement, integrate, test, and document the product.
- **Current authorization:** The user subsequently instructed: “Implement [prd.md](prd.md) until the entire product is complete, well tested ... and the tests are passing.” This supersedes the earlier PRD-only stop. Implementation, dependency installation, and meaningful verification are authorized. Live validation still requires account access.

### Decision labels

- **Agreed:** Explicitly selected in the conversation.
- **Proposed default:** A reasonable implementation or product choice that agents may refine after implementation is authorized.
- **Unverified:** Requires an experiment, account access, or documentation check before relying on it.
- **Roadmap:** Presentation material and possible future work; excluded from MVP implementation.

## 2. Executive summary

**PackageCare turns Ring delivery footage into a reviewable handling timeline and, when needed, an evidence-backed incident report.**

A recipient who suspects a delivery was handled roughly currently has to find the right recording, identify the relevant moment, explain what happened, and collect evidence of any damage. PackageCare brings those steps into one workflow.

The product observes delivery handling, highlights possible drops or throws, links each observation to footage, and lets the recipient review the interpretation. The recipient can confirm or reject a concern, add shipment details and damage photos, and export a report.

PackageCare does not infer intent, establish that a person committed wrongdoing, or infer damage to contents from a handling event alone. It describes visible actions and keeps model observations separate from recipient statements.

The AWS Builder entry is part of the same product: AWS orchestrates media processing, multimodal analysis, evidence verification, persistence, and report preparation. There is no separate mini-challenge app.

## 3. Locked scope and exclusions

### 3.1 Agreed MVP

1. A working Ring integration demonstrated through an accepted Ring simulator or device.
2. Delivery handling analysis using ordered visual evidence.
3. A timeline of delivery activity with links to supporting footage.
4. Possible rough-handling flags, particularly visible drops or throws.
5. Explicit handling of unclear or insufficient footage.
6. A recipient review step to accept, correct, or dismiss observations.
7. Recipient-provided damage confirmation and optional photos.
8. A reviewable, exportable incident report.
9. Documented, functioning AWS integration for AWS Builder.

### 3.2 Explicitly excluded

- Bulky-package classification, lifting recommendations, weight estimation, and household routing.
- Package removal, theft detection, pickup authorization, and theft prevention.
- ClearPath accessibility-zone monitoring.
- ArrivalAssist, PorchFlow, and the former DeliveryProof name in customer-facing copy.
- Facial recognition, identity matching, driver identification, or a face-photo collection feature.
- Automatic complaints, customer-service submissions, emails to carriers, or escalation to delivery managers.
- Automatic conclusions about driver intent, negligence, liability, package contents, or internal damage.
- Alexa+, Fire TV, and Bee integrations.
- A separate Open Source mini-challenge deliverable.
- A general surveillance dashboard, continuous 24/7 analysis, or multi-camera tracking.
- Fine-tuning a custom vision model as a prerequisite for MVP.

### 3.3 Roadmap only

With an authorized carrier or commerce integration, a future version could associate reviewed evidence with a shipment and submit a recipient-approved case to customer service or delivery operations. Access to such an integration has not been verified. Do not imply that Amazon driver lookup or escalation is currently available.

The presentation may illustrate this future flow, clearly labeled as a concept. It must not show a fabricated successful submission as a live feature.

## 4. Known constraints and feasibility gates

### 4.1 Hardware and accounts

- The user has no Ring camera, Fire TV, Bee device, or Apple Watch available for the project.
- The user created the required Ring/AWS access; application connections and live acceptance evidence remain distinct.
- Ring simulator use is accepted. Organizer-confirmed sources are Package/Vehicle/Motion live streams, without custom uploads; actual WHEP playback remains under validation.
- October 19 readiness: `pkgcare` authentication works; the owner confirmed Ohio and the project remains FREE/ACTIVE. In-Region `amazon.nova-lite-v1:0` has positive quota and completed a real two-pass synthetic connectivity/schema smoke. Real-footage quality remains unmeasured.
- Explicit owner approval is required before every potentially billable scope, including inference, AWS media upload, CDK bootstrap or deployment. Follow `AGENTS.md`; credits and Free-plan eligibility do not replace approval. Three October 19 smoke attempts each received separate $0.05 approval. The final structured-response attempt succeeded in both passes, estimated $0.00159402. Those approvals do not cover further inference, ordinary dense import/retry, AWS uploads or deployment.
- Ring token authentication, one simulator device and capabilities/history endpoints were verified. History contained zero events; the live-view path now implemented still needs actual playback/capture validation. Custom upload is unavailable per the organizer. Tokens are temporary and local connection-form tokens live in server memory.
- Do not assume free AWS resources or promotional credits. The organizers announced on October 7 that credit codes had run out.
- Never put credentials, personal footage, or account tokens in source control or tool output.

### 4.2 Gate A — usable Ring media

**First implementation milestone after user review.**

Determine what the official Ring Developer Playground/simulator actually supports:

1. Obtain an authorized token through the supported account flow.
2. Discover a simulated device and read its capabilities.
3. Exercise a real supported event/media path.
4. Retrieve and play media through our backend.
5. Determine whether custom footage or suitable delivery scenarios are supported.
6. Check event delivery, media readiness delays, token lifetime, and media restrictions in practice.

**Pass:** We can demonstrate the handling workflow using suitable footage obtained through a supported Ring path.

**Partial:** Ring events and media work, but custom handling footage cannot be supplied. Investigate documented alternatives and explain the limitation to the user before building around a workaround.

**Fail:** There is no suitable supported Ring media path. Record evidence of the blocker and return to the user with concrete options. Do not silently replace the Ring integration with a generic upload analyzer.

Development fixtures can exercise the analysis pipeline. They must be labeled as fixtures and cannot be represented as Ring simulator footage. If the proposed submission combines real Ring integration with separate scenario clips, obtain clarification on acceptance rather than assuming this meets the track requirement.

**October 19 finding:** The [organizer clarification](https://amazonappdev2026.devpost.com/forum_topics/45462-simulator-on-amazon-ring) resolves customization: Playground provides Package, Vehicle and Motion live-view sessions; it cannot accept custom videos. Actual Playground streams may be combined with separately collected footage with clear provenance. Use the documented WHEP live-view path rather than treating empty recorded-event history as failure. Browser-captured Ring streams must be labeled as browser recordings, retain their original captured bytes, and never imply native-provider byte attestation. Saving a live capture does not itself start inference. Actual WHEP playback, browser capture and saved playback were verified on October 19; native download and real handling-quality evaluation remain separate gates.

### 4.3 Gate B — useful handling analysis

Use labeled examples of ordinary placement, clear drops/throws, and ambiguous handling. Check whether the model can distinguish them, point to relevant moments, and abstain appropriately.

**Pass:** A viable analysis configuration produces useful evidence-linked observations across the evaluation set, with measured errors and understood limitations.

**Fail:** The model invents actions, misses short releases consistently, or repeatedly flags normal placement. Improve input selection/model configuration or narrow supported scenarios; do not disguise the problem with polished UI or scripted outputs.

Do not promise production-grade accuracy based on a few staged examples.

## 5. Customer, problem, and value

### Primary customer

A household recipient who wants to understand a delivery concern and assemble a clear record without manually reviewing a long video history.

### Primary job to be done

“When I suspect a delivery was handled roughly, help me see what actually happened, separate it from what I know about damage, and prepare a report I can review and share.”

### Value proposition

- Find the relevant handling moment quickly.
- View a concise timeline with footage at the point of each observation.
- Avoid turning an uncertain model interpretation into an accusation.
- Combine delivery footage with recipient-provided facts in one report.
- Preserve enough provenance for someone else to inspect the source.

### Product differentiation hypothesis

Ring already provides package alerts and intelligent event descriptions. PackageCare's proposed value is a complete handling-review and report workflow: temporal observations, evidence checks, recipient corrections, damage attachments, and export.

This is a differentiation hypothesis, not a claim that no competing product exists.

## 6. User experience and functional requirements

The following screen organization is a proposed default. Preserve the workflow even if the final layout changes.

### 6.1 Connection and readiness

The app shows whether Ring is connected, what device is selected, and whether analysis is ready.

- Distinguish live/simulator connections, development fixtures, and failed connections visibly.
- Keep tokens and AWS credentials on the server.
- Expose actionable states: connection expired, media unavailable, analysis failed, and unsupported device/media.
- Prefer a single configured workspace and one camera for MVP.
- Do not build public multi-tenant onboarding unless it becomes necessary for the demo.

**Acceptance:** A user can tell which source supplies the footage and whether results came from a real model invocation or a labeled development fixture.

### 6.2 Delivery list

Show deliveries in reverse chronological order with:

- Arrival time and camera/source.
- Thumbnail when available.
- Analysis state.
- Review state.
- A concise result: no concern observed, possible rough handling, or unable to assess.

An empty list explains how a delivery will appear. A processing delivery remains visible rather than disappearing while analysis runs.

**Acceptance:** Repeated delivery of the same event does not create duplicate delivery records or duplicate reports.

### 6.3 Delivery detail and handling timeline

Show the original clip, timeline observations, selected evidence frames, and analysis limitations.

Each observation includes:

- A neutral description of visible activity.
- A start/end offset into the source clip.
- Supporting frame references or a playable segment.
- Evidence status, including uncertainty or insufficient visibility.

Clicking an observation seeks the video to the relevant segment. A visible handling sequence might include approach, package release/placement, landing, and final resting position, but the model must not manufacture missing stages.

**Acceptance:** Every displayed observation has valid source references; timestamps stay within the actual clip duration.

### 6.4 Handling assessment

Use three primary outcomes:

| Outcome | Meaning | Example copy |
|---|---|---|
| `no_concern_observed` | Available footage does not support a rough-handling concern | “No handling concern observed in this clip.” |
| `possible_rough_handling` | Footage contains a supported candidate drop/throw or related concern | “Possible drop observed. Review the highlighted segment.” |
| `unable_to_assess` | Visibility, coverage, or analysis is insufficient | “The package is obscured during placement.” |

An inference or media failure is an operational error, not a handling assessment. Do not convert it into “unable to assess” without explaining the processing failure.

Avoid “safe delivery,” “no damage,” “driver mistreated your order,” or other claims beyond the evidence. A model's numeric confidence is not a calibrated probability; prefer evidence and uncertainty explanations over decorative percentages.

**Acceptance:** Occlusion and incomplete coverage can result in an explicit abstention rather than a forced normal/rough classification.

### 6.5 Recipient review

The recipient can:

- Confirm that an observation is useful/accurate.
- Dismiss a false concern.
- Correct the description with their own statement.
- Leave a concern unresolved.
- Record damage as unknown/not inspected, no damage observed, or damage observed.
- Add optional shipment information and photos.

Store model output separately from recipient edits. Do not overwrite the source analysis when a user corrects it.

Dismissed observations remain available in review history but are excluded from the default incident narrative. Distinguish “recipient confirmed the observation” from “recipient confirmed damage.”

**Acceptance:** A reported handling concern does not automatically set damage to confirmed.

### 6.6 Report preview and export

The report contains:

1. Report ID and generation time.
2. Delivery/camera reference and observed time, with timezone.
3. Optional recipient-entered shipment details.
4. Chronological observations with evidence references.
5. Clear labeling of model observations, recipient statements, and attachments.
6. Damage status and any recipient-provided photos.
7. Source-media manifest and analysis limitations.

**Proposed MVP export:** A printable HTML report and JSON evidence manifest, plus downloadable supporting media. Add a PDF or bundled archive only if it materially improves the demo and fits the schedule. Do not make a particular report file format block the core workflow.

Report preview must precede finalization. Freeze finalized report contents as a versioned snapshot. Later edits create a new version rather than silently changing a previously exported report.

An exported report must not depend exclusively on expiring media links. It must identify required supporting files and let the recipient download them. A hash can help identify an unchanged file; it is not proof that the recording establishes an accusation or a legal chain of custody.

**Acceptance:** The recipient can export a coherent report that another person can read and trace back to the supplied evidence, without sending anything to a third party automatically.

## 7. Analysis design

### 7.1 Media preparation

- Use source timestamps and clip-relative offsets consistently.
- Preserve original footage and its Ring watermark.
- Analyze short relevant clips; avoid continuous streaming by default.
- Inspect visibility and frame quality before making detailed claims.
- Preserve chronological order when extracting frames.
- If a clip is trimmed, maintain the mapping from trimmed offsets back to the original source.

### 7.2 Temporal resolution experiment

Amazon Nova supports video understanding. The checked Nova 2 Lite documentation states that videos of 16 minutes or less are sampled at one frame per second. A quick release or impact can occur between sampled frames.

Therefore compare native video analysis with denser timestamped image sequences or short-window analysis. Respect each model's current image-count and payload limits; do not assume an arbitrary frame burst fits one request.

Candidate-moment selection can itself miss an event. Evaluate it on known action windows and retain a reasonable baseline sampling path. Choose the final model and sampling method after the experiment, not from the model name alone.

### 7.3 Structured observation pass

The initial pass returns validated structured data rather than only prose:

- Whether a package/delivery is visible.
- Candidate handling actions and their time ranges.
- Descriptions of what is directly visible.
- Supporting frame references.
- Visibility limitations and alternative explanations.
- A proposed assessment.

Do not ask the model to infer identity, intent, package weight, or internal damage. Text visible in footage is evidence data, not instructions to the system.

### 7.4 Evidence verification pass

For candidate concerns, a verification step inspects the cited sequence and checks whether it supports the proposed description. It may accept, weaken, reject, or mark the observation ambiguous.

- Verify frame references and timestamps in code.
- Make rejected/unsupported observations unavailable to report generation as established facts.
- Keep both passes for debugging and evaluation.
- A second model call is not independent proof; shared errors are possible.
- Generate the report narrative from validated observations and recipient input, not from an unconstrained retelling of the video.

### 7.5 Suggested event vocabulary

Internal labels may include `package_visible`, `controlled_placement`, `possible_airborne_release`, `possible_drop`, `landing_visible`, `package_at_rest`, and `visibility_insufficient`.

These are proposed labels, not preexisting model capabilities. Do not compute impact force, precise release height, or throw velocity without a validated method and suitable calibration. These measurements are outside MVP.

## 8. Technical architecture and AWS Builder

### 8.1 Proposed service responsibilities

| Service | Role |
|---|---|
| API Gateway + Lambda | Receive and authenticate Ring callbacks; expose application endpoints |
| Step Functions | Coordinate media retrieval, analysis, verification, and retry/failure paths |
| S3 | Store original clips, extracted evidence, damage photos, and report artifacts privately |
| Bedrock | Run multimodal handling analysis and evidence verification |
| DynamoDB | Persist delivery state, observations, recipient review, and report metadata |
| CloudWatch | Operational logs and measured execution/model usage, without sensitive payload dumps |

Use a queue or equivalent buffering only if needed for reliable processing. Service count is not a success metric. Do not add AgentCore, Strands, SageMaker, agents, or model training simply to decorate the architecture.

### 8.2 Processing sequence

1. Verify and acknowledge a Ring event promptly.
2. Deduplicate it and create/update the delivery job.
3. Retrieve authorized media, with bounded retries while recent recordings become available.
4. Save the source and provenance metadata.
5. Prepare analysis inputs and run the observation pass.
6. Verify candidate concerns and validate structured results.
7. Save results and make recipient review available.
8. Generate an export from the reviewed record when requested.

Ring documentation requires a webhook response within five seconds. Run vision processing asynchronously. API calls to Ring belong in the backend rather than browser code. Media download does not itself start a recording.

### 8.3 Proposed code organization

Select the smallest maintainable stack after Gate A. A TypeScript web UI/backend, Python media-analysis worker, and infrastructure as code are reasonable defaults, but no language/framework has been explicitly agreed.

Keep clear boundaries between:

- Ring transport/authentication and media retrieval.
- Analysis input preparation and model adapters.
- Domain state and evidence validation.
- Recipient UI and report rendering.
- Infrastructure and deployment configuration.

Local development should support labeled fixtures and a real AWS mode. A mock path must never silently stand in for the live model or Ring path during the demonstration.

### 8.4 AWS mini-challenge evidence

Document actual deployed services, configuration, invocation path, setup/teardown, and integration feedback. Demonstrate one event traveling through the workflow. Record observed processing time, model usage, and cost estimates with stated assumptions.

The customer UI should focus on delivery review. Infrastructure evidence can live in developer documentation and a brief demo segment.

## 9. Domain data model

Names below are proposed implementation contracts, intended to preserve important distinctions.

| Entity | Essential fields |
|---|---|
| `Delivery` | ID, source type, Ring device/event references, observed time, processing state, assessment, review state, source media IDs |
| `MediaAsset` | ID, asset type, private storage key, source, capture time, duration, dimensions, content hash when available, parent/trim mapping |
| `AnalysisRun` | ID, delivery ID, model/version, prompt/schema version, input manifest, timestamps, status, usage, structured output |
| `Observation` | ID, analysis ID, action label, description, source offsets, evidence IDs, verification result, limitations |
| `RecipientReview` | ID, observation/delivery references, decision, recipient statement, damage status, attachment IDs, update time |
| `Report` | ID, delivery ID, version, frozen reviewed observations, recipient inputs, manifest, generated time, export keys |

### Time and provenance rules

- Store absolute times in UTC; display a clearly labeled user timezone.
- Keep capture time separate from event receipt, analysis, and report-generation times.
- Store clip-relative times in a single documented unit, such as integer milliseconds.
- Retain original event IDs for deduplication and audit/debugging.
- A fixture's provenance stays a fixture even if processed through real AWS services.

### State separation

**Processing:** `received → waiting_for_media → analyzing → verifying → ready`, with explicit `failed` or `media_unavailable` outcomes.

**Assessment:** `no_concern_observed | possible_rough_handling | unable_to_assess`.

**Review:** `unreviewed | in_review | reviewed`.

**Damage:** `unknown | none_observed | observed`.

Keep these independent. A successfully processed delivery can be inconclusive; a confirmed visible drop can coexist with no damage observed.

## 10. Reliability, access, and data handling

- Verify callback signatures using the supported Ring mechanism.
- Keep secrets in server-side configuration or a secrets manager; provide placeholder examples only.
- Retry transient failures with bounds and backoff; do not retry unreadable/unsupported media indefinitely.
- Make workflow steps idempotent, including media writes and report creation.
- Preserve valid results if a later step fails; make retry/recovery understandable.
- Treat encrypted/unreadable Ring media as an expected unsupported case where applicable.
- Keep storage private and provide short-lived authorized access to media.
- Protect deployed evidence/review endpoints. An unguessable ID alone is not authorization.
- For local-only development, a clearly documented single-user mode is sufficient.
- Validate photo uploads and impose reasonable type/size limits.
- Configure finite media retention and a deletion path; the exact duration remains a product default to choose before deployment.
- Do not collect face templates or automatically publish footage.
- Capture demo media using consenting participants and footage we have permission to use.
- Include source clips/frames in reports only under the user's explicit export action.

No external complaint or notification delivery is required for MVP. In-app status updates are sufficient. Sending a report to a carrier is a recipient action outside PackageCare's initial scope.

## 11. Evaluation and acceptance

### 11.1 Initial evaluation set

Proposed starting set: at least 12 distinct clips, with four normal placements, four clear rough-handling examples, and four ambiguous/obscured examples. Expand only when gaps justify it. This is a feasibility set, not a statistical claim of production performance.

Include visually similar normal and concerning cases; avoid evaluating only exaggerated throws. Label the visible action and approximate action interval manually before running the model. Keep examples used to tune prompts separate from a held-out check where possible.

Measure:

- False flags on normal placement.
- Misses on clear drops/throws.
- Appropriate abstention on ambiguous footage.
- Whether cited time ranges actually cover the action.
- Unsupported statements in generated descriptions/reports.
- End-to-end processing time and model usage.

Do not invent accuracy percentages or present this small set as representative of all doorbell footage. Set any numerical launch threshold with the user after the first results.

### 11.2 Required product acceptance scenarios

| Scenario | Expected result |
|---|---|
| Normal delivery | Record and timeline; no unsupported concern |
| Clearly visible drop/throw | Candidate concern with correct supporting segment and recipient review |
| Occluded handling | Explicit uncertainty; no invented action |
| Duplicate Ring event | One logical delivery job, no duplicated case |
| Recent media not ready | Bounded wait/retry and visible processing state |
| Expired Ring token | Clear reconnect action; no fabricated media |
| Bedrock/model failure | Visible failure/retry; no fake assessment |
| Invalid model timestamp/reference | Reject or repair through a bounded path; never show unsupported evidence links |
| Recipient dismisses concern | Review preserved; dismissed claim excluded from default report |
| Drop observed, contents intact | Handling concern and damage status remain separate |
| Recipient reports damage | Labeled user statement and attachments, not retroactive model certainty |
| Export downloaded | Report and supporting manifest remain intelligible outside the app |

### 11.3 Engineering verification

Prioritize meaningful tests for state transitions, event deduplication/signature handling, structured-output validation, time mappings, review/report provenance, and export behavior. Add integration smoke checks for actual Ring media retrieval and live Bedrock invocation when credentials are available.

Run the three core user journeys end to end. Verify the finished UI visually and confirm report links seek to the correct moments. Avoid large suites that merely mirror low-impact implementation details.

## 12. Presentation and design direction

- Brand name: **PackageCare**.
- Suggested positioning: “A clearer record of how your delivery was handled.” Final tagline is open to user refinement.
- Tone: calm, practical, factual, and recipient-controlled.
- Let video and evidence carry the experience; avoid decorative risk scores and surveillance theatrics.
- Use readable timeline labels, clear focus states, keyboard-operable controls, and text labels alongside color.
- Make review actions and damage status obvious.
- Do not surface infrastructure jargon in customer copy unless it helps resolve an error.
- Prefer a coherent desktop demo before broad responsive/mobile polish.

Agents implementing the UI should consult applicable frontend skill/repository instructions. The latest implementation goal authorizes this work; the earlier PRD-only stop has been superseded.

## 13. Hackathon submission requirements and strategy

### Published essentials to recheck before submission

- Working Ring demonstration through an accepted simulator/device, with actual runtime integration in source.
- GitHub source, assets, and reproducible run instructions.
- Public repository with an open-source license, or private access for all required reviewers.
- Public YouTube/Vimeo demo under three minutes, in English.
- Project explanation, track/mini-challenge selection, and feedback on each tool used.
- AWS integration described in the submission feedback.

Judging equally weights implementation, design, potential impact, and idea quality. Friction logs can earn up to a 10% bonus. Record actual problems as they occur. Judges must be able to evaluate the project through the judging period ending November 20; plan reproducible setup, and recheck hosting/access guidance before submission.

The user's eligibility and registration are not verified. The human owns registration, final entry details, and submission approval. Do not assume accounts have been created or that the project has been entered.

### Demo outline — proposed, maximum approximately 2:50

| Time | Content |
|---|---|
| 0:00–0:15 | Recipient problem and PackageCare promise |
| 0:15–0:40 | Working Ring source/event and delivery record |
| 0:40–1:20 | Handling timeline and exact supporting footage |
| 1:20–1:50 | Recipient review, damage statement/photo, report export |
| 1:50–2:10 | Normal and ambiguous examples demonstrating restraint |
| 2:10–2:35 | Actual AWS workflow and measured results |
| 2:35–2:50 | Limitations and clearly labeled future escalation concept |

Use the strongest real workflow early. Do not rely on third-party copyrighted footage/music or fabricated carrier integrations.

### Friction log fields

Task attempted; tool/service; steps; expected result; actual result; severity; workaround; actionable suggestion; date/version. Preserve concrete errors with secrets removed. Do not invent friction for bonus points.

## 14. Delivery plan after PRD approval

The phases below are sequential milestones, not guarantees of elapsed time.

1. **Feasibility:** Validate Ring media and run initial labeled analysis experiments. Record findings and decide supported scenarios.
2. **Vertical slice:** One Ring event becomes a persisted delivery with source playback, structured observations, and reviewable evidence.
3. **Recipient workflow:** Add corrections, damage status/photos, report preview, and export.
4. **AWS workflow:** Integrate orchestration and persistence, validate failures/retries, document deployment/teardown and actual usage. Use real AWS early enough that access problems cannot surprise us at the end.
5. **Evaluation and polish:** Run held-out examples and acceptance scenarios; fix correctness gaps and improve the main journey.
6. **Submission:** Freeze the demonstrated version, finish feedback/friction logs, record the demo, and prepare the entry for human submission.

Aim to have the complete demonstrated workflow before the final submission day. Reserve October 23 for final verification/upload rather than core implementation. Reassess scope promptly if Gate A or B consumes substantial time.

## 15. Risks and response

| Risk | Response |
|---|---|
| Simulator cannot supply useful handling footage | Resolve Gate A first; consult documented options and the user before changing submission approach |
| Low-rate sampling misses a toss | Evaluate dense ordered frames/short windows and action-time coverage |
| Normal placement is flagged as mistreatment | Evidence verification, neutral descriptions, measured false positives, recipient review |
| Model invents damage or intent | Restrict schema/prompts; validate report sources; keep user facts separate |
| Timeline claims refer to the wrong instant | Preserve source/trim mapping and validate offsets against duration |
| AWS account/model access blocks integration | Verify early; keep model adapter configurable; do not pass fixtures off as live results |
| Latency/cost grows with all motion events | Analyze relevant short clips, deduplicate, bound retries, measure usage |
| Expiring credentials break judging/demo | Document refresh/setup; preserve reproducible environment and a working recorded demo |
| Export loses access to evidence | Downloadable supporting media and explicit manifest rather than only signed links |
| Scope expands into theft, identity, or routing | Apply the exclusions in Section 3 |
| Too much infrastructure delays user value | Prioritize one working vertical slice; use each service only for a concrete role |

## 16. Open questions

Resolve in this order after the human authorizes implementation:

1. Resolved: three live-view scenarios, no custom uploads; see Gate A and the October 19 validation checkpoint.
2. Which supported event-to-media path can we demonstrate reliably?
3. Access/Region resolved: `pkgcare`, Ohio, in-Region Nova Lite. Each potentially billable scope still needs explicit approval.
4. Which model/input configuration best distinguishes normal, rough, and unclear handling?
5. Can the human supply or record consented scenario footage if needed for evaluation?
6. Should the final export be printable HTML plus files, or is a bundled/PDF export worth the additional work?
7. What minimal deployment access control and retention period fit the demo?
8. Will the code repository be public with a license or private with reviewer invitations?

Do not re-open already agreed scope simply because an agent's context was compacted. Consult the user when a feasibility result materially changes the product or submission.

## 17. Source references

Checked during planning on October 16, 2026. Product/platform details can change; recheck the relevant primary documentation when implementing.

1. Hackathon overview: https://amazonappdev2026.devpost.com/
2. Official rules: https://amazonappdev2026.devpost.com/rules
3. FAQ and simulator/hosting clarifications: https://amazonappdev2026.devpost.com/details/faqs
4. Resources and AWS credit update: https://amazonappdev2026.devpost.com/resources
5. Ring Partner API: https://developer.amazon.com/docs/ring/api-documentation.html
6. Official Ring starter, including Playground onboarding: https://github.com/AmazonAppDev/ring-api-helloworld
7. Ring computer vision guidance: https://developer.amazon.com/docs/ring/computer-vision-guidelines.html
8. Ring existing intelligent features: https://partners.ring.com/support/articles/97l0i/Ring-Video-Descriptions-Beta
9. Nova 2 multimodal input and video sampling: https://docs.aws.amazon.com/nova/latest/nova2-userguide/using-multimodal-models.html
10. Bedrock inference API and video examples: https://docs.aws.amazon.com/bedrock/latest/userguide/inference-api.html

## 18. Coding-agent handoff checklist

Before continuing after context loss:

- Read the latest user instruction; it takes precedence over this document.
- Implementation is now authorized by the active user goal. Preserve any newer steering instructions.
- Inspect actual workspace state and applicable instructions; do not assume prior code or deployments exist.
- Preserve the name PackageCare, Ring track, and AWS Builder mini challenge.
- Keep handling review/evidence/reporting in scope and bulky routing/theft/identity/escalation out of MVP.
- Check documented Gate A/B findings before relying on simulator or model capabilities.
- Separate implemented behavior, tested behavior, assumptions, and roadmap in updates.
- Do not claim success from mocked providers or fabricate evaluation metrics.
- Update this document when the user changes product scope or feasibility findings invalidate an assumption.
- Record verification and remaining limitations before handing work back.

**Current handoff state (October 19):** Implementation is authorized and ongoing. AWS access and a real two-pass Nova Lite synthetic connectivity/schema smoke are verified in Ohio. Ring discovery authenticates; WHEP playback/capture and real-footage model quality are not yet verified. The organizer confirms Playground has live Package/Vehicle/Motion streams, no custom uploads, and allows combining actual Playground integration with separately labeled authorized footage. Read `docs/live-validation-2026-10-19.md` and `docs/progress.md`; do not repeat the obsolete zero-quota diagnosis or infer accuracy from the synthetic smoke.
