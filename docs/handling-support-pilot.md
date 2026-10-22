# Support-transition detector candidate — October 19, 2026

Status: **Mistral rejected for adoption; paid scope closed after five attempted requests.** Two van replies returned but failed visual factuality review; four cases lack a quality result. A local native-image follow-up is in progress. The production analyzer remains Nova Lite; Gate B remains open. See terminal outcomes below. Earlier commands and pending statements describe historical scopes, not permission to rerun them.

## Diagnosis from inspected evidence

The five actual 16-frame input sheets were inspected, including the clear held-to-airborne transition in the van case at approximately 1.375–1.875 seconds. The sampled evidence contains the action. More frames alone cannot explain or fix all prior failures.

The preserved Nova comparison reports dense abstention and sparse/native false clears. Its ambiguous release description is about lifting a held package, rather than the subsequent visibly detached package. This is a visual/temporal interpretation failure, not merely invalid JSON. The generic action classifier also favors the loading scene's dominant activity over the brief release.

The final three-frame Qwen pilot has a different confound: it returned a valid JSON object with an empty observation list on its first window, before the annotated toss. The harness rejected the empty list and stopped all remaining windows/cases. That particular experiment never tested the complete action. Earlier Qwen v1/v2 experiments **did receive all sixteen frames** and returned empty results; those failures still stand. The selected-three-frame caption produced useful scene content, but changed image count, prompt and output format together. Neither parser repair nor repeating the claim that Qwen has never seen the complete sequence resolves this evidence.

The current product's label-and-citation contract checks valid references but does not require observations of support before/after an asserted release or placement. Verification consumes the proposal, so it can share the initial error. It is not an independent ground-truth check.

## Implemented candidate

`server/handling-evidence.ts` implements an evaluation-only Mistral Large 3 adapter. Each pass receives all sixteen original full frames, in order, with short aliases and source offsets. No source title, scoring label, annotated action time, manual crop or target box enters the model request.

Instead of asking only for a handling verdict, the model returns parcel-specific support traces: held, hand-and-surface contact, surface-supported, visibly airborne, occluded, or not visible. Code derives observations from those traces:

- A release needs distinct ordered held and airborne witnesses, with same-parcel continuity across the release. Hidden landing does not negate a visible release.
- Controlled placement needs held → hand-and-surface contact → surface-supported, without a hidden transition or airborne state.
- A stationary parcel is evidence of rest, never evidence of a preceding placement.
- Missing witnesses downgrade the event to ambiguity. Unknown IDs, reversed/duplicate timestamps, invalid types or malformed output fail validation.
- A valid empty event list with a concrete limitation is an abstention and does not abort the remaining cases.
- When verification drops an initial supported concern, the result retains a disputed observation for review rather than becoming a clean placement.

Native constrained JSON output addresses structural compliance. It cannot make the model's support-state predictions true. Every predicted state and description still requires visual audit, and the same model's verification is correlated. The stricter contract can also miss a real event whose transition falls between sampled frames; that is an explicit limitation, not proof of reliability.

The candidate uses direct `mistral.mistral-large-3-675b-instruct`, Converse, Ohio `us-east-2`, local named profile `pkgcare`, temperature 0, 2,500 maximum output tokens. The [AWS model card](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-mistral-ai-mistral-large-3.html) documents image input, Converse, Ohio in-Region access and structured outputs. The remote schema uses the [documented supported subset](https://docs.aws.amazon.com/bedrock/latest/userguide/structured-output.html); string/count bounds are also enforced locally. No production allowlist/IAM/deployment changes.

Read-only official AWS MCP checks on October 19 succeeded: project FREE/ACTIVE, model agreement/authorization/entitlement/Region available; inference quotas 100 requests/minute and 100,000,000 tokens/minute; invocation logging not configured. This confirms readiness, not runtime success or accuracy.

## Frozen mixed-case test

Same five development source groups from `handoff.md`, in its order: van toss, postal placement, actual Ring at rest, obscured office delivery, obscured USDA porch delivery. Source rights and credits remain in `evaluation/handling-pilot-sources.json` and `evaluation/tracking-validation-sources.json`. No new footage publication.

Input baseline: `data/evaluations/0ef88f1a-1706-4db9-b566-2fee42954f20/plan.json`.

Candidate plan: `data/handling-support-pilots/9e5c1b98-d096-4fd7-8d64-51e95792e37c/plan.json`.

Plan SHA256: `e1390469110a5d8221e20e37d76b33671d71bafd86b538b03293a34002e8f7ef`.

Maximum **10 calls**: one observation and one verification per source, **16 images each / 80 unique frame assets**. Zero retries, no alternative prompts/models, no adaptive crops. All 90 source/playback/frame assets are verified before the first call. The implementation and baseline are fingerprinted; the runner requires the approved plan digest and exact request limit. All images are frozen in memory before dispatch. An exclusive invocation receipt prevents replay. Raw responses and usage are saved before parsing; any operational/structural failure stops the batch. Valid semantic misses continue across the mixed set. Actual airborne witness offsets are scored against the annotation, rather than broad interval overlap alone.

Media and results are stored locally; the eighty frame images would be transmitted to Ohio Bedrock for inference. No S3 upload, training, resources or deployment is included.

The existing October 19 Ohio price receipt lists $0.0005/1,000 input tokens and $0.0015/1,000 output tokens. Expected working cost **$0.05–$0.25 before tax**; illustrative 40,000 input + 2,500 output tokens/call is $0.2375. A deliberately conservative full-context bound is **$1.34822 before tax** for all ten calls. Proposed approval ceiling **$1.50 before tax**. These are application bounds and rate estimates, not an AWS billing hard stop. No prior approval applies.

Free inspection:

```sh
node --import tsx scripts/handling-pilot.ts inspect data/handling-support-pilots/9e5c1b98-d096-4fd7-8d64-51e95792e37c/plan.json
```

After explicit owner approval only:

```sh
node --import tsx scripts/handling-pilot.ts run data/handling-support-pilots/9e5c1b98-d096-4fd7-8d64-51e95792e37c/plan.json --approve-plan e1390469110a5d8221e20e37d76b33671d71bafd86b538b03293a34002e8f7ef --requests 10
```

## Decision and verification

Accept for further validation only if the clear toss has a correct airborne witness, ordinary placement has visible support through contact, all three insufficient/obscured cases avoid invented conclusions, citations are correct, and descriptions have no material fabricated details. A correct headline alone is insufficient. Inspect both passes and the raw support traces before adoption. These five heavily reused sources cannot establish general reliability or satisfy the independent twelve-clip PRD gate.

All **71 application tests pass**, including ten new candidate tests covering evidence transitions, false-clear prevention, all-frame input preservation, label exclusion, changed evidence/scope refusal, replay refusal, semantic-miss continuation, invalid citations, truncation, missing usage, transport failure, partial receipts and frozen bytes. Typecheck and production build pass. Initial localhost test failures were sandbox `listen EPERM`; the permitted rerun passed. Tests use mocks, not live inference. No paid action was taken.

## Initial invocation and diagnostic correction

The owner explicitly approved the ten-call scope up to $1.50 before tax. The first request returned `ValidationException` after 2.647 seconds, with no completed model response or token-usage receipt. The batch stopped after one attempt as promised. Zero returned usage is not an independently verified AWS bill. No retries, subsequent cases or production changes occurred.

The initial error handler persisted only the error type, losing the service explanation. This was a harness mistake. It now stores whitelisted service-error fields in a private local file, redacts credential-shaped values, and never serializes clients, headers or arbitrary error objects. An added test verifies the behavior; all eleven focused tests and typecheck pass. The model request builder, prompt, schema and input images are unchanged.

Diagnostic-corrected plan: `data/handling-support-pilots/3252545b-0f02-4776-8069-2ff653653b35/plan.json`, SHA256 `aee8886a74a203ec28e47b242efbc5eeda0133612fe87048d2061d04814d258c`. This plan is **not yet approved or invoked**.

Proposed bounded continuation: repeat the unchanged request with complete service diagnostics, correct only a reported API incompatibility if necessary, and finish the same five-case test. At most **12 attempted requests across the original and continuation scopes combined**, maximum 2,500 output tokens each, same model/Region/profile/source frames/semantic prompt, no quality-driven prompt variants or automatic retries. Full-context price bound for all twelve attempts is **$1.617864 before tax**, proposed overall ceiling **$2 before tax**. Stop if compatibility cannot be resolved within the two-attempt overhead; stop on malformed output or transport failure after a valid response. No resource creation, S3 upload, training or deployment. This continuation needed explicit owner approval because the original approved scope required zero retries.

## Terminal Bedrock outcome — rejected for adoption

The owner approved the bounded continuation up to **$2 total before tax**. It is now closed, with **five total attempted requests**, two successful model responses and three service rejections. Do not use the unused request allowance for further experiments.

| Scope directory under `data/handling-support-pilots/` | Attempts | Outcome |
|---|---:|---|
| `9e5c1b98-d096-4fd7-8d64-51e95792e37c` | 1 | Initial validation failure; service explanation lost by the original logger. |
| `3252545b-0f02-4776-8069-2ff653653b35` | 1 | Identical request rejected: at most three images per prompt. |
| `73fb4e3a-3643-4ba1-bafa-7a5374cefc76` | 2 | Six/six/four full-frame panels packed into three unscaled sheets; van observation and verification returned native JSON. Local parser rejected six verification caveats against its five-caveat limit. |
| `a06f855d-fd2b-4183-b5d1-deaf6b184113` | 1 | Prior van responses replayed locally after widening only caveat counts. First untouched postal request rejected: request-body length limit exceeded. No other clips inferred. |

`server/handling-sheets.ts` preserves every frame's full geometry with timestamp/alias labels above each panel, JPEG quality 95 and 4:4:4. Packing changes image encoding and presentation; it is an API compatibility change, not evidence that sheets are equivalent to native sequential images. The endpoint's actual total-body limit remains unknown. Do not infer a precise limit from one rejection. Original bytes, packed bytes, lineage and raw responses are preserved in the local scopes.

The two returned replies used **14,699 input + 1,658 output tokens**, an estimated **$0.0098365 before tax** at the recorded Ohio rates. This is returned-usage pricing, not an independently reconciled AWS invoice; failed calls returned no usage.

The van replies both cite the actual held/airborne pair at f7/f8, but describe the released large carton as a **flat white envelope** and invent a small-parcel placement onto a counter. The verification pass repeats those mistakes. The locally reparsed headline becomes `possible_rough_handling`, but fails the predeclared factuality criterion. **This is not a successful detection result.** The postal, Ring, office and porch cases have no Mistral quality result. No model was adopted, no production process restarted, and Gate B remains open.

The parser repair accepts extra caveats within the existing domain limits; it does not edit model facts. Replay requires the original prompt/schema/image request receipt to match exactly and makes no replacement call. Regression tests cover replay, immutable evidence, no implicit retries and whitelisted error diagnostics.

## Local native-image follow-up

An isolated MLX environment (`data/vlm-env`, `mlx-vlm==0.6.3`) and `experiments/local_cv/support_vlm.py` prepare a local-only comparison using `mlx-community/Qwen3.8-27B-4bit`, revision `10c35caafbb80f7dc6a7a432cdd11af10a6d4818`, Apache-2.0, based on the official Qwen checkpoint. The fixed run uses the same semantic support contract, sixteen native images per clip, all five development cases, temperature zero, 4,096 output tokens and a 1,536-token thinking budget. Each full frame is processed at at most 262,144 pixels. This differs from the Bedrock presentation and model; it is a separate candidate, not a repaired Mistral result. No AWS, upload, training or paid inference is involved. Results are pending; a workstation result alone would not establish deployability or independent accuracy.

The first local run (`data/local-vlm-evaluation/native-01`) returned a schema instead of an evidence object on the van, after 261.94 seconds, 5,250 input tokens and 1,568 generated tokens; peak MLX allocation was 19.22 GB. It fails the output contract. The run was interrupted during the second case's prefill; no second answer exists. A fresh run (`native-02`) added MLX's native llguidance JSON constraint, activated only after the thinking delimiter. Its van answer identifies the released carton and f7/f8 transition, but overstates later airborne support at f10/f11; it fails factuality review. The second case was interrupted without a final answer. Partial reasoning is not a returned assessment.

Both early local runs assigned an ineffective `.size` attribute to MLX's custom image processor. Their planned 262,144-pixel cap was **not applied**; correction receipts remain beside the original plans. `native-03` sets the actual `.min_pixels/.max_pixels` settings and verifies all sixteen processed image grids before each inference. The model consumes those same checked tensors. The complete five-case run is in progress. Its van result abstains and invents a scene-wide cascade of boxes; it is not a successful release detector. No production adoption follows from any of these diagnostic runs.
