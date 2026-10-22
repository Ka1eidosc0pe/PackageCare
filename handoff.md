# PackageCare — Astra handoff

Prepared October 19, 2026, approximately 14:55 America/Chicago. This is a handoff for specialized reasoning about **useful package-handling detection**, followed by implementation if a viable approach emerges. The product is not complete. No paid experiment, training job or deployment is running or approved.

## 1. Your assignment and the owner's direction

The owner asked the current agent to continue until specialized assistance would be useful, then write this document for an Astra agent. We have reached that point: tracking can recover some relevant package motion, but neither the tested multimodal prompts nor a generic action classifier establishes reliable handling detection. Please audit the evidence and choose a defensible next approach before another experiment series.

The standing goal remains: implement the entire `prd.md`, with a polished hackathon-quality UI, meaningful passing tests, a private GitHub repository, incremental commits and a maintained development log. Do not redefine success as object detection, a synthetic demonstration, schema-valid API replies or a hand-selected positive image. The owner provides product guidance; agents implement. The owner explicitly chose **validate parcel tracking before training**. No custom training has started, and a training path has not been approved.

The owner is willing to spend on worthwhile work but questioned repeated tiny paid prompt probes. Prefer one frozen, mixed-case experiment with a clear decision over an open-ended chain of formatting/density/model variants. Prior approvals are all closed, including the $10 pilot. A willingness to pay is not an open spending authorization.

**Suggested first task:** inspect the original toss/control clips, actual model inputs and raw replies; decide whether the next step should be a stronger in-Region multimodal model with a better response interface, a tracking-conditioned temporal approach, or another concretely justified design. Mistral Large 3 has been checked as an available candidate, not selected or invoked. You are not obliged to follow that hypothesis.

## 2. Workspace, repository and quick start

| Item | Current value |
|---|---|
| Local workspace | `/Users/adityaselvam/Desktop/Aage/Hackathons/Amazon_BSS2_2026` |
| Repository | https://github.com/Ka1eidosc0pe/PackageCare |
| Visibility / branch | Private, `main`; visibility rechecked October 19 |
| Handoff starting HEAD | `61db981` — completed local action results/docs; this handoff will be committed after that |
| Latest behavior-changing source | `93286515b47f0225e668ed95982e7bee292b10c1` |
| Latest source CI | [39312006857](https://github.com/Ka1eidosc0pe/PackageCare/actions/runs/39312006857), completed **success**, rechecked for this handoff |
| Existing local preview | http://127.0.0.1:3002/ |
| Local platform | Apple Silicon arm64, approximately 36 GiB RAM; isolated CV Python 3.12.14; Node 25.7 locally / Node 24 in CI |

Read `AGENTS.md` first. Two pre-existing edits belong to other work and were deliberately preserved: **`docs/aws-quota-support-draft.md` and `docs/aws-readiness.md`**. Do not revert, overwrite or stage them incidentally. No agent worktree was created here. Use `git status` before editing/staging. Private-repo commits/pushes are authorized; making it public, inviting reviewers, sending external messages and final submission are not authorized by that alone.

```sh
cd /Users/adityaselvam/Desktop/Aage/Hackathons/Amazon_BSS2_2026
git status --short
git log -5 --oneline
```

Use the existing installed dependencies; avoid reinstalling or rerunning completed model jobs to reconstruct context. Free verification commands, when code changes justify them:

```sh
npm test
npm run build
python3 -m unittest discover -s tests -p 'test_local_*.py'
npm run infra:synth -- --quiet
```

Latest source CI includes application tests/build, **23 dependency-free CV/action checks**, Ohio CDK synthesis, Linux AMD64 Lambda image build, FFmpeg and packaged HTTP/frontend runtime smoke. The application suite's last recorded checkpoint is **61 tests**. These verify software behavior, not model accuracy. CI installs no Python ML packages and performs no paid inference. CDK synthesis is local; bootstrap/deploy are different, billable operations requiring approval.

## 3. Product and hackathon

**PackageCare**, a play on “care package,” turns Ring delivery footage into an evidence-linked handling timeline, recipient review, and an exportable incident report. Former name DeliveryProof is retired. Primary track **Ring**; mini challenge **AWS Builder**, integrated into the same product rather than a separate app.

The [hackathon overview](https://amazonappdev2026.devpost.com/) was rechecked October 19: deadline **October 23, 2026, noon Pacific / 14:00 America/Chicago**. Preserve time for final integration, evidence and submission. Ring hardware is not required. Source must actually call Ring technology; demo must show simulator/device integration. Required deliverables include reproducible source, a public English demo under three minutes and tool/product feedback. See `docs/submission.md`; recheck the rules before final entry. The human owns eligibility, registration, reviewer invitations, publication and final submission.

### Agreed MVP

1. Actual Ring simulator/device integration.
2. Ordered visual handling analysis, especially visible drops/throws.
3. A timeline that seeks to supporting footage.
4. Explicit uncertainty for insufficient/obscured handling.
5. Recipient confirmation, correction and dismissal of observations.
6. Separate recipient-provided damage status, notes/shipment reference and optional photos.
7. Preview, frozen report versions and an export with playable evidence.
8. Documented, functioning AWS integration and feedback for AWS Builder.

**Excluded:** faces/identity/driver lookup; theft/removal; weight/bulk/lifting/household routing; automatic complaints or escalation; intent, blame, liability or internal-damage inference; other Amazon device tracks. Recipient-approved carrier escalation is a labeled roadmap concept only, with no verified carrier integration.

**Gate A:** actual Ring WHEP playback, browser recording and saved playback work. The Package scenario captures a parcel already at rest, not a drop/placement action. Native provider-download attestation/webhook onboarding remain separate issues.

**Gate B is not passed:** a viable configuration must produce useful action-linked observations, avoid false concerns on ordinary placements and abstain on ambiguous/handling-absent footage. PRD §11.1 proposes **12 distinct clips: four ordinary, four rough, four unclear**, with grouped tuning/held-out splits where possible. We currently have five reused development source groups, not that set. No measured production accuracy or agreed numerical launch threshold exists.

## 4. What is implemented

The local application supports connections, recording history/import/live capture, durable media preparation and failure recovery, delivery playback/timeline, recipient review and damage photos, preview/finalization and ZIP export. Synthetic examples are clearly marked and have scripted observations. Real imports use Bedrock and fail truthfully; they never fall back to fabricated AI output.

Frontend: React, Vite, TypeScript. Backend: Express/TypeScript. Media: FFmpeg/FFprobe and Sharp. Local records/media: ignored filesystem data. Intended cloud path: API Gateway → Lambda API → Step Functions → Lambda analysis/media worker, with private S3, DynamoDB and Bedrock. Frontend is packaged with the API container. **Infrastructure exists and synthesizes; it has never been deployed.** No AWS media upload has been performed.

| File / area | Role |
|---|---|
| `src/` | Customer UI; source playback/timeline, review/report journeys |
| `shared/domain.ts` | Types, evidence/time validation, derived assessment and review rules |
| `shared/project.ts`, `server/aws.ts` | Ohio/profile/model constants and allowlists |
| `server/analysis.ts` | Production Nova adapter, prompt/schema/parser, input windows, fixture analyzer |
| `server/media.ts` | Original media persistence, decoding/preparation and evidence storage |
| `server/service.ts` | Processing state, retries, review/report orchestration |
| `server/ring.ts`, `server/ring-live.ts` | Ring REST/event/media and live WHEP transport |
| `server/app.ts`, `server/index.ts` | HTTP routes/local process; startup recovery can resume unfinished jobs |
| `server/reports.ts`, `server/report-preview.ts` | Frozen reports, portable evidence export, bound preview receipts |
| `server/store.ts`, `server/uploads.ts`, `server/workflow-store.ts` | Local/cloud records, direct upload authorization, workflow state |
| `server/worker.ts`, `infra/app.ts`, `infra/Dockerfile.lambda` | Cloud worker, Ohio CDK topology, tested container packaging |
| `scripts/lib/evaluation.ts`, `scripts/evaluate.ts` | Prepare-first source-credited production-adapter evaluation |
| `scripts/lib/vision-benchmark.ts`, `scripts/lib/vision-pilot.ts` | Evaluation-only Qwen experiments; historical scopes closed |
| `experiments/local_cv/` | Offline detector/tracker/action research; not app adapters |
| `tests/` | Meaningful application tests and stdlib CV evidence/scope tests |

### Preview state, freshly checked for handoff

Port 3002 is listening (PID 62860 at check). `GET /api/status` reports Ring **disconnected**, Nova Lite, **no verified workspace Bedrock analysis**, local storage, local worker, no session password and 30-day retention. Six records: two failed, one `awaiting_analysis`, three ready synthetic samples; **zero completed Bedrock records**. Prior separately run successful diagnostics do not turn these workspace records into successful model analyses.

The preview was last deliberately started on production source **`c2d9b69680af6f90b8fd9744cc679ac088ece1b1`**, data root `data/production-smoke`; subsequent evaluation-only source changes do not require restarting it. Saved Ring captures and frozen sample reports are intact. Do not wipe this data. A fresh token is unnecessary for tests on saved clips.

If a restart becomes necessary, inspect every record/job first: startup resumes `received`, `waiting_for_media`, `analyzing`, `verifying` records, which may make **billable calls**. `awaiting_analysis` is not automatically processed by that startup loop. Do not restart a token-bearing process casually: connection-form tokens are in memory and are lost on restart. Preserve the current launch environment/data directory. Do not blindly run `cp .env.example .env` over existing configuration.

The ordinary development command is `npm run dev` (API 3001 / frontend 5173); production-style local serving uses `npm run build`, then `PORT=3002 HOST=127.0.0.1 DATA_DIR=./data/production-smoke npm start` after confirming startup is safe. This is a reproduction recipe, **not an instruction to restart now**. No live model work should begin from the UI without scoped spending approval.

## 5. Evidence contract to preserve

Current production model is **`amazon.nova-lite-v1:0`**, prompt **`packagecare-evidence-v6`**. The app and worker IAM policy allow only this model in Ohio. Qwen and local CV models are evaluation-only. Do not silently change the product model or infer that a candidate's availability updates IAM/configuration.

The analysis stages are observation then verification. Dense default: approximately four frames/second, up to 120 frames, overlapping windows of at most five images. Sparse/native alternatives exist but have not demonstrated useful handling quality.

`server/analysis.ts` exports `evidenceTool`, `VISUAL_EVIDENCE_RULES` and `parseEvidenceResponse`. Current actions:

```text
package_visible | controlled_placement | possible_airborne_release |
possible_drop | landing_visible | package_at_rest | visibility_insufficient
```

An observation contains label, concrete description, exact supplied evidence IDs, `supported|ambiguous|rejected`, and limitations. Image-based times are **derived from the cited frames' clip-relative integer millisecond offsets**, not model-guessed times. Video-based intervals must be within clip duration. The parser maps short prompt aliases such as `f1` to the original preserved asset IDs. Recipient damage photos cannot support model claims about delivery handling.

`validateAnalysis` derives the overall assessment from supported observations:

- Supported concern → `possible_rough_handling`.
- Supported controlled placement without ambiguity → `no_concern_observed`.
- Otherwise → `unable_to_assess`.

Arrival, landing or a box at rest does not establish controlled placement. A visible airborne release can be worth review even when landing/damage are unknown. No identity, intent, blame, weight/force or internal-damage certainty. Keep processing state, handling assessment, recipient review and damage status independent. Do not weaken these distinctions merely to obtain a positive demo.

Raw replies/usage must be saved **before** parsing, with attempts including failed transport and partial results retained. Unknown references, invalid critical types/times and truncated output cannot create a completed assessment. A verifier using the same model is not an independent human ground-truth check. Green software tests do not prove factual visual descriptions.

## 6. Footage: five actual source groups

All media/results/models below are in ignored local `data/`; they are **not in a fresh Git clone**. An Astra chat sharing this workspace can use them directly. For a different machine/worktree, copy only authorized local artifacts via an owner-approved path, preserve hashes and licenses, and keep Ring media private. Do not publish/download-reconstruct arbitrary media or send it to another provider without the appropriate scope. No Ring hardware or newly recorded user clips are available.

| Index | Local supplied excerpt | Visible evidence / label / limitation |
|---|---|---|
| 0 | `data/online-footage/clips/loading-development.mp4` | First four seconds, van loading. Clearly airborne carton around 1.8–1.9 s; prewritten rough-action interval **1300–2300 ms**. Landing obscured; outside doorstep domain and heavily reused for development. |
| 1 | `data/online-footage/clips/postal-placement-development.mp4` | Four-second excerpt of postal conveyor activity, original **94.5–98.5 s**. Controlled lowering/support; ordinary placement control, outside doorstep domain. |
| 2 | `data/online-footage/clips/ring-at-rest-development.mp4` | First approximately four seconds of actual connected Ring Playground browser recording. Parcel at rest; placement absent → unable to assess handling. Not native-provider byte attestation. |
| 3 | `data/tracking-validation/clips/office.mp4` | Original **2.5–6.5 s**, distant carton and railing-obscured descent. Unclear; do not infer a throw from the source title. |
| 4 | `data/tracking-validation/clips/porch.mp4` | USDA original **256–260 s**. Approach discontinuity, camera-filling carton, final contact obscured. Unclear; do not turn the source edit/static closeup into careful-placement evidence. |

Excerpt SHA256s, indices 0–4 respectively:

```text
fd93b0742adc0b8aca3023190a6dc227eae6444defbb93fdcdb690f89e3bdf59
f43600e46fd05ff19e828f5cce5814b400e959c2cae3d532510a35e7e620f48a
b8c668be9e849233c48524c893f0a3b5235faa955d5d9bade4137b50f6cc3654
d0689815ba4bcf9eb84dcbb3845e08b106d0af43d2a6cf0741fd92382adb3c47
624b851fe89a05f0e7a2ad326aef4f7914fd22b331db914a8efb866e5ab5f205
```

### Rights, original sources and data quality

- Van: **副業サポート掘 英郎**, CC BY 3.0, [Commons source](https://commons.wikimedia.org/wiki/File:FedEx荷物積み込み米国宅配で破損が多い理由.ogv). Audio removed/transcoded; no crop/speed change. Preserve attribution/modification notice.
- Postal: U.S. Marine Corps video by **MCSN Kelly Meyer / AFN Okinawa**, November 23, 2020; [DVIDS 776728](https://www.dvidshub.net/video/776728/okinawa-postal-service-broll-package), listed public domain. Original locally: `data/research-dvids/okinawa-postal-broll.mp4`. Required notice when shared: **“The appearance of U.S. Department of War (DoW) visual information does not imply or constitute DoW endorsement.”**
- Ring: owner-connected actual Playground capture. Original **11.870 s** local WebM: `data/production-smoke/media/738f18c4-1ddf-48b6-8759-4d75f2c089db.webm`, SHA256 `cacf628862a1d245dafebe9f9a7369441c3bd093c76233d67a8a26b71a07f572`. Keep local. Browser recording provenance must remain explicit.
- Office: **itookmypantsoff1time**, CC BY 3.0, [Commons source](https://commons.wikimedia.org/wiki/File:%C2%ABHigh_level_of_service%C2%BB_offered_by_US_Postal_Service.ogv). Original `data/research-next-sources/originals/office-delivery.ogv`.
- Porch: **USDAgov / Lance Cheung**, listed PD-USDA; [Commons source](https://commons.wikimedia.org/wiki/File:20200824-FNS-LSC-Box_to_Table_(50287966517).webm), [publisher Flickr source](https://www.flickr.com/photos/usdagov/50287966517). Original `data/research-next-sources/originals/usda-box-to-table.webm`.

Full provenance/original hashes/edits: `evaluation/handling-pilot-sources.json`, `evaluation/tracking-additional-sources.json`, `evaluation/tracking-validation-sources.json`, `docs/footage-sources.md`. Read those before sharing media. No public media publication has occurred.

`evaluation/tracking-validation-annotations.json` seals **single-agent provisional** visible-envelope boxes, SHA256 `9fc761fb304d74084d725a415a7bb8e811ce1944de9ea16471dc3197bd1d1c9e`. Office: 8 scoreable / 8 unscorable frames; porch: 10 / 6. Porch discontinuity before frame 7 breaks continuity scoring. These are neither segmentation truth nor action labels. Crops/frames/augmentation from one original never create independent source groups.

### Fresh prepared inputs available to you

The interrupted local preparation completed; its same handle was read to terminal success before this handoff. No inference occurred:

```text
data/evaluations/0ef88f1a-1706-4db9-b566-2fee42954f20/plan.json
SHA256 fbf042029e6d11b92f3bc7887695b84ad16ce2d8dbdb5c71014ed6f5b59044c6
5 source groups × 16 full frames = 80 images; all 90 source/playback/frame assets hash-verified.
```

Generated contact sheets: `data/astra-handoff/case-0-prepared-inputs.jpg` through `case-4-prepared-inputs.jpg`; verification receipt `data/astra-handoff/prepared-input-check.json`. These sheets are for agent review, not model inputs or independent ground truth. The actual preserved JPEGs are under the baseline's `media/` directory, with exact IDs/offsets/hashes in the plan.

**Important:** this is an input-preparation baseline with **Nova metadata / 40-request count**, not an implemented Mistral experiment. **Do not invoke it** as the proposed ten-request Mistral scope. A separate frozen candidate harness/plan still needs implementation, verification, review and owner spending approval. No `evidence-pilot.ts` or Mistral adapter has been added.

## 7. Completed experiments: what the evidence actually says

### A. Paid multimodal work — all scopes closed

| Configuration | Actual result | Local evidence |
|---|---|---|
| Nova Lite, dense 4 fps / sparse / native video, same van excerpt | Dense abstained; sparse/native falsely cleared it against the prewritten release annotation. Combined comparison plus 8 fps follow-up: 28 returned requests, estimated **$0.00877866** before tax. | `docs/evaluation-results-2026-10-19.md`; `data/online-footage/strategy-comparison.json` |
| Nova Lite, denser 8 fps | All 16 requests schema-valid, still unable/no supported action overlap. 30.957 s analysis, excluding preparation. | `data/evaluations/47fa23e5-4238-41c7-ab80-6fa6a6e619c6/` |
| Qwen3-VL 235B, 16 full frames, JSON v1 | Both passes returned empty observations; unable, no useful release detection. Two requests, estimated **$0.00530450**. | `data/vision-benchmarks/27ea257a-aeda-4883-b2ff-e8ef4abbe1d2/` |
| Qwen, 3 hand-selected action frames, neutral caption | Useful scene content about parcel moving away from hand/obscured landing, with details still uncertain. **Not** automatic action localization or a validated assessment. One request, estimated **$0.00111802**. | `data/vision-probes/loading-caption-v1/` |
| Qwen, 16 full frames, structured JSON v2 | First reply empty; nonempty-observation validation stopped verification and conditional Ring control. One request, estimated **$0.00309736**. | `data/vision-benchmarks/94b93a17-5e1c-4fc2-a423-2ef52ec24995/` |
| Qwen, frozen 3-case automatic 3-frame windows, v3 | First reply empty, so whole pilot stopped **before the toss or either control**. One returned request, estimated **$0.00111707**; 47 unused requests cannot be reused. | `data/vision-pilots/49b8ea4a-2e3b-4a0d-b463-09b3167d39d9/`; `docs/handling-pilot.md` |

These estimates are returned-token calculations, not reconciled AWS billing. They omit some earlier synthetic/Ring diagnostics and usage-unknown service failures. Approval ceilings are not actual spend. The application remains Nova Lite only.

The Qwen pilot's sole request used **125/375/625 ms**, before the **1300–2300 ms** annotated action. It returned `end_turn`, 1,395 input / 142 output tokens, `observations: []` and generic limitations. The raw JSON contains no visual facts for the parser to recover. Its exact response journal is:

```text
data/vision-pilots/49b8ea4a-2e3b-4a0d-b463-09b3167d39d9/
  case-0/508a9030-28f1-49c4-8d06-c7ce6a9e4cfa/responses.jsonl
```

Audit the response contract as well as the model. `scripts/lib/vision-benchmark.ts` currently requires ≥1 cited fact or visibility fallback; an empty early window stops the batch. That is an intentional historical contract, **not evidence that this complete three-class test ran and failed**. Decide explicitly how a new candidate handles a valid no-action/empty window versus malformed output. Do not erase historical failures or relax citation/factuality checks to force success. Qwen's successful caption changed image count, format and prompt placement together, so it does not isolate a root cause.

### B. Free detector and tracking work — no training

1. **Grounding DINO Tiny:** all 48 uniform frames from van/postal/Ring; CPU, four threads, 89.544 s after load. Fixed query `cardboard box. parcel. hand.`, thresholds 0.3/0.25. Useful boxes but misses relevant moving carton at 1625 ms; detects airborne carton at 1875 ms. False doormat/background boxes persist. Conservative IoU association makes 10/35/3 candidate tracks, not verified parcel identities.
2. **SAM2.1 Tiny, automatic seeds:** completed all 48 frames, 501 saved object-frame predictions, 299.824 s CPU. Tracks can bridge the detector miss into airborne frames. They also propagate false/duplicate seeds and drift under occlusion.
3. **Duplicate-gated SAM2:** current-mask unique agreement (box IoU ≥0.6, margin ≥0.1, positive/nonempty) suppresses 22 possible duplicate seeds; accepted 7/16/3. CPU 258.716 s; local MPS float32 207.105 s. CPU/MPS outputs agree closely, which checks backend consistency, not accuracy. Runtime is still unsuitable to assume a cheap cloud request.
4. **Two additional sources:** unchanged detector/tracker, annotations frozen before inference. Target-box hits: office **2/8 detector → 4/8 forward tracker**; porch **8/10 → 10/10**. Fourteen frames unscorable. Detector 51.918 s, MPS tracker 44.252 s after load. Cabinet/planter/vehicle false seeds remain.
5. **Offline reverse prefix:** every accepted later seed considered, four jobs / 37 local single-object calls / 21.216 s; zero new detector calls. Office becomes **7/8**, porch remains **10/10**. Original 79 forward masks preserved. Unfiltered reverse masks spill onto legs from boundary-truncated seeds: **not adopted**.
6. **Post-hoc interior-seed replay:** zero model calls, reuses all saved reverse masks; positive seed envelope strictly inside image edges. Withholds observed boundary-seed spill and retains 7/8 and 10/10, but still accepts an interior false vehicle candidate. Chosen after failure: not independent validation. Offline reverse outputs are conditioned on future frames, not earlier live detections.

Details/results: `docs/local-cv-feasibility.md`, `docs/sam2-tracking.md`, `docs/tracking-validation.md`, `docs/reverse-tracking.md`; `evaluation/tracking-validation-results.json`, `evaluation/reverse-prefix-results.json`.

Key local paths:

```text
data/local-cv-baseline/{plan.json,results.json,tracks.json}
data/local-sam2/attempt-1/
data/local-sam2-gated/attempt-1/
data/local-sam2-mps/attempt-1/
data/tracking-validation/detection/
data/tracking-validation/tracking/attempt-1/
data/tracking-reverse-prefix/attempt-1/
data/tracking-reverse-interior/attempt-1/
```

Any-candidate target coverage can switch candidates frame to frame. Locked-ID evaluation uses the first unique match to a human box and is **ground-truth-assisted evaluation association**, not an application method to choose the correct parcel. Target-only box overlap conceals unmatched false tracks/mask spill. Do not equate these ratios with handling accuracy, full tracking precision or a passed Gate B.

### C. Free temporal-action baseline — completed, not adopted

Model **`facebook/vjepa2-vitl-fpc16-256-ssv2`**, native 16 frames / 256 pixels, 174 Something-Something V2 classes. Publisher-listed MIT. All five sources, whole clip, then one preregistered automatic-window comparison: 32 uniform frames/source, all 16-frame views starting at 0/8/16. **5 + 15 total local forwards**, MPS float32/SDPA, fallback disabled. No expected labels, action times, manual boxes/masks or source titles entered the model.

Aspect-preserving **full-frame letterbox**, RGB fill 124/116/104 and ImageNet normalization, intentionally differs from the publisher's center crop. No public benchmark-score transfer is claimed. A smaller parcel may have too little spatial resolution under this choice; that is a hypothesis, not an established cause. Whole and window runs use the **byte-identical runner** and same weights. No additional model/dtype/input variants belong to this completed comparison.

| Source | Whole-clip top class | Window top classes 0 / 1 / 2 | Finding |
|---|---|---|---|
| Van toss | Piling up | Putting into / Putting similar objects / Piling up | Both configurations fail to establish useful clear-toss detection. Best generic release ranks: whole 7; windows 8/7/17. |
| Postal ordinary | Putting similar objects | Pushing with / Putting similar objects / Putting similar objects | Plausible placement context, not damage/support verification. |
| Ring at rest | Showing next to | Showing next to in all three | Forced closed-set action; no native unknown class. |
| Office obscured | Closing | Showing behind / Showing behind / Dropping behind | A drop rank on obscured ground truth is not a confirmed hit. |
| Porch obscured | Covering with | Moving toward camera / Moving toward camera / Covering with | Approach/camera-covering context, final placement unverified. |

Whole run: **4.477 s after load**. Window groups: **3.622/3.555/3.539 s after each separate model load**; their 10.716 s sum is not global elapsed application latency. Approximately 1,445 MiB allocated / 2,113 MiB driver memory after calls, not peak. All 20 actual input arrays match sealed preview arrays/hashes. Existing-output replay attempts refuse before importing ML and preserve original plans/results. No handling adapter adopted.

```text
data/local-action-pilot/plan.json
  SHA256 fcedf5067b271d4a3df592a383100d0a711c4c3609eb80f7455bc93b21f9050e
data/local-action-pilot/attempt-1/results.json
data/local-action-windows/scope/plan.json
  SHA256 0b9c30469f76eb66b755b129c30f498b971c1037cfb57d0ce935753d56f2217e
data/local-action-windows/scope/run-1/results.json
```

See `docs/local-action-baseline.md`, `evaluation/local-action-results.json`, and the two committed action scope JSONs. All 174 raw logits/ranks and exact arrays remain locally. Generic class families/scores are not calibrated concern confidence or action timestamps. Fifteen overlapping windows are not fifteen independent recordings. The unmodified generic-head comparison is closed; this does not prove every specialized temporal model or future trained approach impossible.

## 8. Local ML environment and reproduction

Existing environment: `data/cv-env/bin/python` (Python 3.12.14); requirements pinned in `experiments/local_cv/requirements.txt`: Torch 2.14.1, Torchvision 0.29.1, Transformers 5.20.1, NumPy 2.5.4, Pillow 13.0.0, Hugging Face Hub 2.2.0, plus exact transitive pins. Production Node/Lambda dependencies were not changed for these experiments.

| Component | Model / revision | Existing artifact directory |
|---|---|---|
| Detector | `IDEA-Research/grounding-dino-tiny`, `a2bb814dd30d776dcf7e30523b00659f4f141c71` | `data/local-cv-model/` |
| Tracker | `facebook/sam2.1-hiera-tiny`, `de431c4043854a71d8101e17995dfe596bf101a5` | `data/local-sam2-model/` |
| Action head used | `facebook/vjepa2-vitl-fpc16-256-ssv2`, `4aa02df83918538fc21cfaf576382fa20e489a80` | `data/local-action-small-model/` |

Weights SHA256s in the same order:

```text
1a2412ef99bd74bcd3c2a246fa1e48581f8889a1300c9051974741314fc042f3
48c14467e5cf9e51870511feb72c89688e82dd74523142c0538b663e193ac2a7
35aeab96e8513d9cc60ee08c1642dd121c86452c926ce3599b3317896a320396
```

Each scope contains its own `model-receipt.json`, invocation receipts and source snapshots. Model downloads were anonymous/public and inference offline, safetensors only, remote code disabled. `data/local-action-model/` also contains a **4.5 GB V-JEPA giant checkpoint that finished downloading but was never invoked**. Do not mistake that download for a tested alternative or silently substitute it. VideoMAE was inspected but not acquired/adopted; publisher-listed noncommercial terms informed that choice.

MPS works in the normal local process; the restricted execution sandbox may hide it. Local GPU runs needed execution escalation, with `PYTORCH_ENABLE_MPS_FALLBACK=0`, float32, four threads and explicit availability checks. This is local GPU permission, not paid cloud-compute approval. Do not silently fall back to CPU or restart a long run on an observation timeout. Poll the same confirmed-live handle; preserve partial results. All known experiment/preparation handles have reached terminal completion; no experiment is intentionally running at this handoff.

`experiments/local_cv/README.md` gives complete per-helper preparation/run/scoring commands. Inspect saved outputs first. These commands make **no model calls**:

```sh
python3 -m unittest discover -s tests -p 'test_local_*.py'
python3 -m json.tool evaluation/local-action-results.json
python3 experiments/local_cv/score_tracking.py --help
python3 experiments/local_cv/action_windows.py --help
```

For an actually justified new local run, prepare into a **new** directory, hash all inputs/artifacts, inspect final input contact sheets, commit the frozen scope before inference, run once with the exact final digest and retain raw outputs. Do not overwrite or invoke old directories. Model runs are not necessary merely to read the handoff. New paid compute/training/model services remain subject to owner approval.

## 9. Training-data investigation and remaining gap

User cannot record the requested clips and asked us to search online. Public-source acquisition is authorized within source rights, but broad internet scraping does not automatically confer training/demo rights.

CAP publisher [visym/cap](https://github.com/visym/cap), CC BY 4.0 consented activity data, was investigated. Acquired validation annotations contain **47 recordings / 395 activity instances**, including 37 broad put-down/drop/throw matches. Inspected drop/throw examples were household/play objects, not a suitable parcel corpus. Three drop examples do not mean three package drops. Its large 288/386 GB training archives were not downloaded. Do not train on acquired validation footage and then claim an independent CAP validation result. Local audit/source material: `data/research-cap/`.

MEVA inspected exemplars have burned-in action labels and were excluded; no raw training corpus was acquired. Mixkit was held aside over AI/automated-use policy concerns; stock search results are not granted licenses or a completed dataset. One Commons acquisition stopped on HTTP 429, with no bypass/retry series; that candidate yielded zero bytes. Use `docs/footage-sources.md` and `docs/evaluation-capture-plan.md` to continue source work deliberately.

We still need independent, clearly licensed ordinary/rough/unclear footage, especially actual doorstep views with blur, occlusion, varying parcel size and realistic ordinary handling. The current van/postal sources are outside that domain. Do not train an action head on five recordings and report those same events as validation. Custom training, if recommended, needs a scoped data/label/split/baseline plan and owner agreement before starting.

## 10. AWS access: enough to proceed safely

### Non-negotiable owner rules

- Read `AGENTS.md`. **Explicit owner approval before ANY potentially billable action**, including Bedrock invocation, uploads to AWS, training/paid endpoints, bootstrap, deployment and provisioning. Credits/Free plan/budget/earlier unused approvals do not substitute.
- **No paid scope is open.** Do not reuse historical $0.05/$0.75/$10 ceilings or remaining request counts. Do not treat the goal-resume message as a spending approval.
- Use **`pkgcare`**, selected Region **`us-east-2`**. No default/other project profile changes. No application cross-Region inference profiles or resources. Toolkit control-plane `us-east-1` is separate, not permission for Virginia application deployment.
- Keep AWS credentials, login cache contents, Ring tokens, personal footage and `.env` out of chat/logs/git. Never put credentials into a tool argument or handoff. Existing local login/cache is the access mechanism.
- Owner guidance preference **MEDIUM** is saved. Region was already confirmed in AWS Settings; do not repeatedly ask. If previously working operations suddenly get AccessDenied, investigate project spend status under the AGENTS procedure rather than blindly changing IAM/Regions.

### Toolkit / credentials

AWS CLI installed at **`/Users/adityaselvam/.aws-tooling/bin/aws`**. Native `aws login` profile is `pkgcare` (not an assumed IAM Identity Center SSO setup). Authentication/setup is authorized; if credentials expire, read the `signing-in-to-aws` skill and use the named profile/browser sign-in flow. Do not change the default profile or expose cache secrets.

Official AWS MCP is exposed in this session. Local `~/.codex/config.toml` server **`aws-mcp`** was inspected without printing secrets; its environment **`AWS_MCP_PROXY_PROFILES=pkgcare`** restricts profile selection. Prefer this official server for AWS work. Its tool description explicitly prohibits Bash AWS CLI calls; do not work around that with shell commands. If unavailable in the Astra chat, discover the tools/configuration first and use supported named-profile SDK access when appropriate, rather than silently using another project. `server/aws.ts` provides the local SDK configuration (`region` + `profile`, while deployed Lambda uses its execution role).

Relevant installed skills:

```text
/Users/adityaselvam/.agents/skills/amazon-bedrock/SKILL.md
/Users/adityaselvam/.agents/skills/aws-sdk-js-v3-usage/SKILL.md
/Users/adityaselvam/.agents/skills/aws-sdk-python-usage/SKILL.md
/Users/adityaselvam/.agents/skills/aws-billing-and-cost-management/SKILL.md
/Users/adityaselvam/.agents/skills/signing-in-to-aws/SKILL.md
```

For training recommendations use the installed `aws-ai-ml` skill as applicable; training is not presently authorized. Read relevant skill references before implementation; current source APIs take precedence over memory. No relevant skill requires creating subagents for this handoff.

MCP names currently available include `mcp__aws_mcp__aws___run_script`, `...search_documentation`, `...read_documentation`, `...retrieve_skill`. `run_script` uses asynchronous `call_boto3` with **PascalCase operation names**, fixed `region_name`, and no direct network. Return a `result` object as the final expression and inspect the tool's `api_calls` receipt before trusting its result. It rejects Python dunder attribute access such as `.__name__`; use supported error handling.

Example **read-only** metadata check, if revalidation is needed:

```python
response = await call_boto3(
    service_name="bedrock",
    operation_name="GetFoundationModelAvailability",
    region_name="us-east-2",
    params={"modelId": "mistral.mistral-large-3-675b-instruct"},
)
result = {"availability": response}
result
```

`GetFoundationModel` uses `modelIdentifier`; `GetFoundationModelAvailability` uses `modelId`. `ListFoundationModels` has **no `byInputModality` parameter**; an attempted local validation of that filter failed before AWS, then targeted Get calls succeeded. Filter returned `inputModalities` locally if listing. Do not repeat that invalid call. Read-only status/capability checks are not inference. Cost Explorer queries/log scans/other “reads” may themselves be billable: do not assume every read is free.

### Fresh successful checks and candidate pricing

October 19 official MCP calls actually succeeded for `GetAccountPlanState`, `GetFoundationModelAvailability` and `GetFoundationModel` in Ohio. Project **FREE / ACTIVE**; **Mistral Large 3** lifecycle ACTIVE, TEXT/IMAGE input, TEXT output, ON_DEMAND; agreement AVAILABLE, authorization AUTHORIZED, entitlement AVAILABLE, Region AVAILABLE. This is **not runtime quota or quality proof**. No model request, access mutation, subscription action, upload or resource creation occurred in these checks.

Candidate ID: **`mistral.mistral-large-3-675b-instruct`**, direct Ohio Runtime endpoint. [AWS model card](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-mistral-ai-mistral-large-3.html) documents Converse/image support and native structured output. Unlike the Qwen path, a constrained JSON schema can be requested using `outputConfig.textFormat` ([official format](https://docs.aws.amazon.com/bedrock/latest/userguide/structured-output.html)). Existing installed SDK types contain this field. No Mistral invocation/harness exists yet. Schema syntax correctness cannot guarantee visual factuality; unsupported schema constraints must be checked before a paid call.

Nova Pro and Claude Sonnet 4.6 were excluded from the proposed next test because their current documentation requires cross-Region routing from Ohio. Do not change Region or attach `us.`/`global.` prefixes to bypass the restriction. Other models may be researched but are not automatically authorized/tested.

Non-secret metadata/pricing receipt: **`evaluation/bedrock-candidate-readiness.json`**. Public Ohio price list downloaded without authentication (a public documentation download, not an application action):

```text
https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonBedrock/current/us-east-2/index.json
publicationDate 2026-10-16T21:08:06Z
SHA256 c104fd6526e792c8a1f164a4de90ab7736ae1a55bdd04d2161f48e2a6dda3668
local raw copy data/model-readiness-2026-10-19/ohio-public-pricing.json
```

Filtered **Ohio standard on-demand Runtime**, excluding Mantle/Batch/Flex/Priority:

| Direction | USD / 1,000 tokens | SKU |
|---|---:|---|
| Input | 0.0005000000 | `EJHEJWWG8CPAAQG6` |
| Output | 0.0015000000 | `XFNSVQHVKC23GCM9` |

An **unapproved proposal**, not a ready invocation scope: five existing sources × observation/verification, all 16 frames/request → max **10 requests**, **2500 output tokens each**, zero retries, local storage, no deployment/training. Expected working estimate **$0.05–$0.25**. Decimal-script conservative bound, counting 262,144 input tokens plus 2,500 output tokens on each request: **$1.34822 before tax**. Illustrative 40,000 input + 2,500 output/request → **$0.2375**. A possible approval ceiling is **$1.50**, but the owner has **not approved it**. Counts/prices are estimates and application limits, not an AWS billing hard stop. Recheck rates if scope/model changes.

### Ring access

User has a Ring Developer Playground project, no physical camera. Temporary tokens are entered at the local **Connections** screen, never chat. Tokens can be regenerated only about every 30 minutes; unnecessary restarts/capture requests waste that window. Currently disconnected. Reuse saved footage for analysis rather than requesting another token now.

Playground scenarios: Package/Vehicle/Motion; no custom-video uploads. Actual WHEP playback, browser capture and saved playback succeeded. [Organizer clarification](https://amazonappdev2026.devpost.com/forum_topics/45462-simulator-on-amazon-ring) permits combining real Playground integration with separately collected footage when provenance is clear. Empty recording history was not a fatal integration failure: live sessions are supported and can create `on_demand` history events. Read `docs/live-validation-2026-10-19.md`, `server/ring-live.ts` and the [official starter](https://github.com/AmazonAppDev/ring-api-helloworld) before changing that integration.

## 11. Recommended next decision and useful specialist work

These are hypotheses to assess, not authority to incur spending or start training:

1. **Separate failure causes.** We have real JPEG inputs, source hashes and one useful Qwen caption, so “no images were sent” is not established. Nevertheless, audit exact interleaved image/text payloads, alias/schema requirements, parser behavior and first-window stop logic. Do not treat absence of facts in raw JSON as a parser repair opportunity. Avoid another isolated selected-action prompt probe as a substitute for end-to-end evaluation.
2. **Assess a stronger evidence-capable candidate.** Direct Ohio Mistral with native JSON-schema output is a plausible next bounded comparison. Full-clip 16-frame requests avoid aborting on a pre-action three-frame window. But schema constraints and image/context capacity need a complete local preflight. A valid no-action/uncertain answer must be scored honestly; malformed replies and service errors stop the paid batch.
3. **Assess tracking-conditioned temporal analysis.** A persistent box/mask is not a support or release event. Consider object/hand relation, scene/surface visibility, motion discontinuities, tracker uncertainty and automatic spatial/temporal context. Any crop/window selection must be automatic for all candidates, not supplied from scoring labels or a human-chosen event. Preserve full-frame/source-time mappings and include false-seed controls. Camera motion, perspective and occlusion prevent reading physical force/weight from pixel displacement.
4. **Address data independently.** The five reused sources can debug a candidate, not establish reliability. Acquire licensed unused examples and grouped labels before claiming broader feasibility. If the next approach needs custom training, propose a realistic dataset and evaluation plan before committing to it.

For any new paid proposal, first make the implementation concrete and reviewable: freeze model/region/interface/prompt/schema, exact source groups and frame bytes, source/action annotations for scoring only, full input coverage, total call/output limits and zero-retry policy. Unit-test consequential boundary behavior with mocks: all inputs preserved, annotations excluded from model content, modified bytes/scope refused, replay refused, invalid citations/usage preserved, valid semantic misses continue across planned cases, operational/validation failures stop without extra calls. Then request one explicit owner approval citing `AGENTS.md` and expected/capped scope cost. Do not make the owner approve a vague research direction or isolated formatting probe.

Success for the initial fixed test means supported visible-release evidence on the clear toss, ordinary placement without an invented concern, restraint on at-rest/obscured cases, correct citations and no material invented detail. Inspect descriptions and cited frames yourself; a matching headline is insufficient. This would justify unchanged testing on unused sources, **not Gate B completion or production accuracy**. A failure needs a diagnosis and decision, not automatic prompt variants.

If a candidate genuinely works, integrate it through the existing analysis/domain interface, update allowlists and exact Ohio IAM only as justified, keep recipient review/report behavior, and validate the real-source UI journey. Obtain separate approval before cloud deployment/uploads. A local model route also needs measured runtime/packaging feasibility; a workstation experiment is not an AWS integration by itself.

## 12. Remaining whole-project requirements and stop conditions

- Useful handling detection, independent 12-clip feasibility set, camera-domain limitations and model/input selection remain open.
- Real Ring-source review/timeline/report walkthrough with actual successful handling observations remains unproven. Saved at-rest footage and scripted samples do not fill it.
- Actual AWS deployment/IAM/S3/CORS/orchestration, cloud failure recovery/retention and maximum-size behavior remain unverified. Container CI and mocks do not establish them.
- Demo video, required reviewer access, final product/tool feedback, registration and submission remain with the owner; no invitations/messages/publication have been sent by this work.
- Keep the private repository private; maintain `docs/development-log.md` and `docs/friction-log.md`. Commit explicit own files only. Do not erase historical misses, relabel difficult footage to match output or mark the full goal complete on a narrowed demonstration.

The source agent is stopping after this handoff as requested so the owner can give Astra a fresh attempt. The overall implementation goal remains incomplete; this is not a completion or cloud-spending approval. The rough 60% confidence / 1–2-day integration estimate discussed in chat was subjective and conditional on a candidate passing, not measured reliability or a promised finish date.

## 13. Reading order and historical-document caveats

Start with this document and `AGENTS.md`, then read:

1. `prd.md` §§1–4, 7, 11, 18 — agreed product/invariants; latest evidence is here/progress docs.
2. `server/analysis.ts`, `shared/domain.ts`, `scripts/lib/vision-benchmark.ts` — actual payload/validation/stop rules.
3. `docs/local-action-baseline.md`, `evaluation/local-action-results.json` — terminal action results, not just plans.
4. `docs/handling-pilot.md`, `docs/evaluation-results-2026-10-19.md` — raw multimodal outcomes and closed scopes.
5. `docs/tracking-validation.md`, `docs/reverse-tracking.md`, corresponding evaluation JSONs — useful localization gains and visual failures.
6. `experiments/local_cv/README.md` — reproducible helpers, pinned models and exact source lineage.
7. `docs/progress.md`, `docs/acceptance-audit.md`, `docs/deployment.md`, `docs/submission.md` — whole-product evidence/remaining gates.

Several documents are chronological logs: earlier paragraphs still say “pending,” “not invoked” or describe zero quota even when a later outcome supersedes them. `docs/deployment.md` starts with an old pre-support throttling checkpoint; **do not infer current quota is zero**. Read the terminal outcome, current source/receipts and latest status rather than restarting obsolete diagnostics. The two unrelated AWS doc edits remain untouched. For new live facts, recheck the relevant safe API/source; do not infer authorization or runtime success from stale status text.

**A useful return from Astra:** a short explanation of the failure mechanism supported by inspected evidence, one concrete implemented candidate/protocol, its actual mixed-case results if approved, a clear adopt/reject decision with limitations, and exact remaining integration/data work. Preserve this handoff and add your continuation findings rather than silently replacing the history.

## 14. Specialist continuation — October 19

Inspected all five prepared input sheets and preserved Nova/Qwen results. The clear toss is present in the images; Nova's miss is not explained by missing evidence alone. The Qwen mixed pilot aborted on an empty pre-action window and never reached the later toss. A support-transition candidate is now implemented in `server/handling-evidence.ts`, with a frozen five-case/ten-request Mistral harness in `scripts/lib/handling-pilot.ts`. See `docs/handling-support-pilot.md` for the exact plan, diagnosis, cost and acceptance criteria. It requires ordered visual witnesses before deriving a release or controlled placement and preserves pass disagreement instead of clearing it. Native structured output and full-sequence requests address the separate response/coverage failures.

The owner approved the initial $1.50 test and then a bounded continuation up to $2 total before tax, at most twelve attempted requests. **That paid branch is now closed after five attempts: two successful van replies and three API rejections.** Direct Mistral accepts at most three images, so the sixteen full frames were packed into three unscaled sheets without changing the semantic prompt. Van observation/verification returned structured JSON, but both misidentified the tossed carton as a flat white envelope and invented a different parcel's counter placement. A matching concern headline does not pass the factuality criterion. The postal request then failed the endpoint's undocumented total-body limit; no Mistral quality result exists for the other four clips.

Returned usage totals 14,699 input + 1,658 output tokens, estimated **$0.0098365 before tax**, not a reconciled AWS invoice. The harness now preserves service diagnostics, accepts extra noncritical caveats within domain limits, and can replay byte-matched saved replies locally without repeating successful calls. Twelve focused regression tests and the build pass. See `docs/handling-support-pilot.md` for scope directories, stop reasons and all limitations. Do not spend the unused approval allowance or adopt this model.

A separate local-only Qwen3.8-27B MLX native-image experiment is being prepared in `experiments/local_cv/support_vlm.py`, with an isolated ignored environment/model download. No training, paid inference or footage upload. Its outcome is pending. Production model/worker/IAM and running preview are unchanged; Gate B remains open.
