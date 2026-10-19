# Frozen whole-clip handling pilot — October 19, 2026

**Approved, invoked once and stopped; scope closed.** The owner approved the exact scope below up to $10. Its first reply failed the required nonempty-observation contract, so the remaining requests did not run. See [evaluation reset](analysis-evaluation-plan.md).

## Product decision

Can one fixed Qwen configuration process all sampled evidence in a supplied clip, find a visible release, recognize controlled placement without a false concern, and abstain when placement is absent? The answer determines whether this candidate merits further evaluation. It does not authorize model adoption, custom training, deployment, or a new prompt-tuning series.

## Frozen sources and labels

The [manifest](../evaluation/handling-pilot.json) and [source/annotation record](../evaluation/handling-pilot-sources.json) were written before this pilot's inference. Inputs are approximately four-second excerpts, preserving the full spatial view. “Whole clip” refers to these supplied excerpts, not the full-length source recordings or continuous-time coverage between sampled frames.

| Case | Annotation | Provenance and limits |
|---|---|---|
| 01: carton release | Possible rough handling; approximate visible action 1,300–2,300 ms | Existing CC BY van-loading excerpt, previously used for development. Landing partly hidden. Outside doorstep domain. |
| 02: controlled placement | No concern observed; visible lowering/support onto a conveyor | New public-domain postal-operation excerpt, source rendition 94.5–98.5 s, no cut within excerpt. Outside doorstep domain. |
| 03: placement absent | Unable to assess | First four seconds of saved actual Ring Playground Package browser capture, encoded excerpt 3,957 ms. Parcel already at rest; no native Ring-download claim. |

Three recordings provide three source groups. They are development controls, not a held-out set, representative field data, or the PRD's twelve-clip gate. Multiple crops from one original may not pad the independent-case count.

Source 02 credit: **U.S. Marine Corps video by MCSN Kelly Meyer / AFN Okinawa, November 23, 2020**, [Okinawa postal service broll package](https://www.dvidshub.net/video/776728/okinawa-postal-service-broll-package). The item lists PUBLIC DOMAIN and remains subject to the [Public Use Notice](https://www.dvidshub.net/about/copyright). Required notice for any shared excerpt: “The appearance of U.S. Department of War (DoW) visual information does not imply or constitute DoW endorsement.” Keep this credit/notice with any demo or report using the source. No public publication has occurred.

## Exact candidate and request scope

- Direct on-demand `qwen.qwen3-vl-235b-a22b`, **us-east-2**, named **pkgcare** profile.
- Prompt `packagecare-vision-json-v3`: existing v2 visual task/schema placed after images, now with automatic window context and schema citation limits matching the validator. No expected label, action annotation, source filename or publisher activity label enters the prompt.
- Exactly **16 uniformly spaced prepared frames per excerpt**. All sixteen enter both passes through **eight overlapping windows**, at most **three images/window**, stride two. No action-time selection or manual region crop.
- One observation pass and one verification pass/case: **16 requests/case**, maximum **48 total**. Maximum **2,500 output tokens/request**. No model retries, larger output limits, additional clips or adaptive prompt changes.
- All three cases are preflighted for source/asset hashes and scope before the first request. Frames freeze in memory for each case's two passes. Exclusive parent and child receipts prevent accidental paid replay.
- Save raw replies and usage before parsing, preserve completed windows/passes, stop the **entire pilot** on any operational/validation failure. Valid semantically wrong results remain measured and do not suppress subsequent cases. An empty-observation reply is a validation failure, not a completed useful assessment.
- Original captures/downloaded renditions, excerpts, extracted frames, replies and results remain local in ignored data. No AWS uploads, resource creation, deployment, external messages or reports sent to carriers. The production application still allows Nova Lite only.

Prepared input-only baseline (its Nova metadata describes extraction preparation, not an inference authorization): `data/evaluations/73eeec58-c7cc-4c49-890b-9cd93f317175/plan.json`.

Actual Qwen pilot scope: `data/vision-pilots/49b8ea4a-2e3b-4a0d-b463-09b3167d39d9/plan.json`, with three hashed child plans. The runner uses the Qwen pilot metadata and validates **48** requests; it does not execute the Nova baseline.

## Cost and approval

October 19 verified Ohio standard Runtime rates: $0.00053/1K input tokens and $0.00266/1K output tokens. The pre-run expected cost was **$0.05–$0.25**. Conservative maximum using the full 262,144-token input context plus 2,500 output tokens for every one of 48 requests: **$6.98814336 before tax**. The owner explicitly approved a **$10** ceiling with the exact request/output limits above. This was a conservative estimate, not an AWS billing hard stop. Actual returned usage estimates to **$0.00111707 before tax**; the scope is now closed and unused requests cannot be reused.

Reproduce free preparation:

```sh
npm run evaluate -- evaluation/handling-pilot.json --strategy dense_frames --split development --frame-count 16
npm run pilot:vision -- /path/to/the/generated/evaluation/plan.json
```

Executed once under that approval (receipt prevents replay; this is not a new invocation instruction):

```sh
npm run pilot:vision -- data/vision-pilots/49b8ea4a-2e3b-4a0d-b463-09b3167d39d9/plan.json --invoke --max-requests 48
```

## Decision and stopping criteria

Inspect the actual descriptions and cited frames, not only the aggregate labels. Report a table for all planned cases: completed/failed/not-run; actual versus annotated result; concern overlap with the visible action; controlled-placement evidence; unsupported statements; latency; requests; returned usage and estimated cost. If a request fails without usage, its cost is unknown rather than zero.

Success requires supported release evidence in 01, controlled-placement evidence without an invented concern in 02, appropriate abstention in 03, and no material unsupported claims. Schema success alone is insufficient. A failure returns to the owner with findings and a recommendation; it does not start another paid configuration. Any next evaluation or production integration needs its own considered scope. The twelve-clip gate, representative camera testing, live AWS deployment and submission deliverables remain open even if this pilot passes.

## Actual outcome — stopped on first reply

| Case | State | Result versus annotation | Requests | Analysis time | Estimated USD |
|---|---|---|---:|---:|---:|
| 01: carton release | Validation failure, first observation window | No assessment. Empty observations; annotated 1,300–2,300 ms action window not reached | 1 | 3.285 s | $0.00111707 |
| 02: controlled placement | Not run | Not measured | 0 | — | — |
| 03: placement absent | Not run | Not measured | 0 | — | — |

The single request used offsets **125, 375 and 625 ms**. It returned normally (`end_turn`), with **1,395 input / 142 output tokens**, an empty observation list and five limitation statements. The JSON parsed, but the evidence contract requires at least one cited visible fact or an explicit `visibility_insufficient` observation. No citations, validated windows, complete pass, verification or final assessment exist. Raw reply and usage were saved before validation. All attempted requests returned usage; there is no unreturned request in this scope.

Full-size input inspection shows visible cartons and changes in arm/carton positions. Occlusion limits precise action attribution; the model's blanket rest/contact statements are not a substitute for cited evidence. Do not label this failed request as a correct ordinary-placement classification, a missed annotated toss, or an accuracy result. Only three of the planned sixteen frames entered inference, so the planned whole-clip coverage was not achieved.

Local evidence: parent `results.json` and `invocation.json` under the pilot directory; first child `case-0/508a9030-28f1-49c4-8d06-c7ce6a9e4cfa/` contains its plan, immutable frames, response journal and failed result. Runtime media/replies remain ignored. No retries, prompt variants, remaining cases, training, uploads or deployment followed.

**Decision:** this Qwen structured candidate does not qualify for application adoption. End this prompt-diagnostic branch rather than automatically spending on another variant. Before any further paid evaluation, discuss a pretrained temporal-CV feasibility baseline and the actual parcel-action data gap with the owner; the newly researched datasets are candidates, not a proven training corpus. No training or product-scope change is authorized by this pilot. The product goal remains incomplete.
