# Automatic parcel tracking checkpoint — October 19, 2026

**Owner direction: validate parcel tracking before training.** A free local SAM2 experiment now recovers the moving carton through a frame missed by the detector. This is useful tracking evidence on the existing development sources, not a trained handling classifier, passed quality gate or production adoption.

## Frozen experiment

Used public [SAM2.1 Hiera Tiny](https://huggingface.co/facebook/sam2.1-hiera-tiny), publisher-listed Apache-2.0, revision `de431c4043854a71d8101e17995dfe596bf101a5`. Safetensors SHA256 `48c14467e5cf9e51870511feb72c89688e82dd74523142c0538b663e193ac2a7`; six downloaded artifacts / 155,935,207 bytes. [Official video API](https://huggingface.co/docs/transformers/model_doc/sam2_video). Dependencies reuse the isolated local CV environment; production dependencies/container unchanged.

Same three development excerpts, all sixteen prepared frames each. Seeded **every** automatic parcel candidate track from the previous detector/association output at its first detection: **10 / 35 / 3 seeds**. No manually selected action time, object or region, later correction, reverse propagation or training. Seeds are candidate identities, not counts of physical parcels. Some duplicate the same object; some are false parcel detections.

Sources, source results/association, model artifacts and images were hashed before inference. Source image bytes froze in memory. Inference ran offline on CPU with four threads, eval/inference mode, threshold zero on mask logits. New seeds entered only at their own frame. Original plan hash `882eae4a727bf136449d419aca7a031fef5ba5a32bd29101d483a51aa6d52283`. One attempt completed all **48 frame updates / 501 object-frame predictions**; no retry or model variant. Raw masks, boxes, areas and uncalibrated object-presence logits remain local. No image upload, AWS/model-service billing call, training or deployment.

## Observed result

| Case | Reviewed evidence | Finding and limitation |
|---|---|---|
| Van loading | Automatic object 1 seeded at 125 ms; object 5 independently seeded at 1,375 ms | Both follow the carton through the detector's 1,625 ms miss and the visibly airborne 1,875 ms frame. Useful localization through the release region. Later occlusion/mask spill makes the landing and continued identity uncertain. |
| Controlled postal placement | Objects 1, 3 and 24 | Tracks follow visible conveyor cartons, including the large foreground carton and later arriving parcel. Object 24 begins at 2,628 ms, so its earlier approach is not established by that track. Tracking is not an automatic “no concern” classification or proof of hand support. |
| Ring already at rest | All three seeded candidates | Object 2 follows the actual resting parcel. Object 1 follows the doormat; object 3 follows a door/background region. The tracker cannot turn false semantic seeds into parcels. Placement remains absent. |

Review selection occurred **after all inference** and affects only illustrations. Other predictions are retained but are not exhaustively ground-truth scored. No segmentation ground truth, held-out tracking accuracy or twelve-source evaluation exists. Nonempty masks and high presence logits do not prove parcel identity, release, support or safety.

Precision correction: earlier notes called the 1,625 ms carton airborne. Full-frame inspection leaves hand contact at that exact frame uncertain; describe it as **moving**. The 1,875 ms frame shows clear separation. The prewritten `possible_rough_handling` development label and 1,300–2,300 ms interval remain unchanged. Mask output does not establish intent, force, mass, landing or damage.

Source credits/edits/hashes remain in [the frozen provenance record](../evaluation/handling-pilot-sources.json). The loading recording is credited to **副業サポート掘 英郎**, [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/), first four seconds/audio removed/transcoded, no crop/speed change. Postal source: **U.S. Marine Corps video by MCSN Kelly Meyer / AFN Okinawa**. Required notice: “The appearance of U.S. Department of War (DoW) visual information does not imply or constitute DoW endorsement.” Ring remains the existing owner-connected local Playground capture. No media was publicly published.

## Latency and remaining engineering work

Tracking took **299.824 s** after model load, including processing and local checkpoints/mask files. Median frame update **2.8525 s**; per-case frame processing approximately **59.964 / 205.377 / 34.095 s**. These are workstation results, not an AWS benchmark. The cluttered postal scene accumulates duplicate/background seeds; following 35 candidates is costly. Do not adopt this latency as the product experience or hide it behind an unmeasured cloud claim.

Next: retain uncertainty through occlusion and validate correct-object continuity on independent recordings. False semantic seeds need separate treatment. A movement threshold or contact proxy tuned on these three clips would not establish handling quality. No training commitment follows; task-data coverage and the PRD's twelve-clip gate remain open.

## Duplicate-seed and local GPU comparison

Two subsequent **free local** runs kept the original weights, all 48 images, the automatic candidate pool (10 / 35 / 3) and forward direction. No labels, manual box selection, later corrections or training entered either plan. The new `mask_agreement_v1` policy considers every scheduled seed: suppress a new seed only when its box agrees with one positive-presence, nonempty current mask at IoU ≥ 0.6, with a ≥ 0.1 margin over the next match. Otherwise retain it. A suppressed seed is recorded as `possible_duplicate`; spatial agreement is not proof of physical identity. Original detector inputs remain intact.

| Run | Device | Accepted seeds by case | Forward calls | Object evaluations | Saved object-frame predictions | Time after model load |
|---|---|---|---:|---:|---:|---:|
| Original, every seed | CPU | 10 / 35 / 3 | 48 | 501 | 501 | 299.824 s |
| Mask agreement | CPU | 7 / 16 / 3 | 61 | 432 | 330 | 258.716 s |
| Same mask agreement | Local Apple GPU / MPS | 7 / 16 / 3 | 61 | 432 | 330 | 207.105 s |

The original run's call/object-evaluation counts follow from its one-forward-per-frame loop and saved objects. Later runs explicitly count both the probe of existing masks and any same-frame recomputation after accepting new seeds. Thus 22 fewer seeds do **not** imply a proportional compute reduction. CPU gating was approximately 13.7% faster than the original; MPS was approximately 19.9% faster than gated CPU and 30.9% faster than the original. These are single sequential workstation measurements, including preprocessing/checkpoint/mask saving, excluding model initialization. No repeated timing distribution, end-to-end app latency or cloud estimate is established.

Review confirms object 1 still follows the loading carton through the detector miss and visibly airborne frame; duplicate seeds 5 and 7 are suppressed. Postal objects 1, 3 and the newly arriving 24 remain; all three Ring seeds remain, including false mat/background candidates. Later loading occlusion/mask spill remains. CPU/MPS accepted seed IDs agree. Across all 330 corresponding saved masks, mean IoU is 0.9999919 and minimum 0.9990421. **This measures backend consistency against CPU predictions, not accuracy against ground truth.** Selected MPS masks were also visually reviewed. There is no new semantic classification result.

CPU scope SHA256 `954471454e9278e1bbe24713b493b6805a4afcb729b61eb05ff02eebef1dd594`; MPS scope `33e696c46a3607cfc05991104b049befb2c8551fbaf74301a77945bf5caa9cff`. Complete receipts/results/masks and invocation-time source snapshots remain under ignored `data/local-sam2-gated/` and `data/local-sam2-mps/`; each has one `attempt-1/`, no retries. [Portable measured summary](../evaluation/local-tracking-comparison.json).

MPS was available in the normal local process but hidden by the restricted process. The GPU run used float32, four CPU threads, CPU preprocessing/video storage and explicit MPS inference. CPU fallback was disabled before importing PyTorch, and the runner refuses unavailable MPS. All 48 frames completed without fallback. This does not make the current runtime suitable for the product: roughly 3.5 minutes for twelve sampled seconds, in addition to detector initialization/inference, remains an engineering issue.

## Reproduction and software verification

Helpers are under [experiments/local_cv](../experiments/local_cv/README.md). Portable preparation was checked against the original for all **48 frame IDs/times/hashes and all 48 automatic seeds**. It has not received another full model run. Existing-run refusal was exercised before model imports and preserved original receipt/results byte-for-byte. The prototype used for the actual inference remains with its script digest under ignored `data/local-sam2/`; original masks/results are under `attempt-1/`.

Eight standard-library tests now cover evidence/association invariants, refusal of hand-selected seed tracks and wrong case/time mappings, and conservative seed gating for unique versus ambiguous/absent/different masks. They do not measure model accuracy. The original baseline used the preserved prototype; the generalized helper received the complete gated CPU and MPS runs above. Production application behavior, model allowlist, preview and saved reports remain unchanged.
