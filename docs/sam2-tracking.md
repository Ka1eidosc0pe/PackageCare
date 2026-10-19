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

Next: reduce duplicate seeds using agreement with existing masks, retain uncertainty through occlusion, and validate correct-object continuity on independent recordings. False semantic seeds need separate treatment. A movement threshold or contact proxy tuned on these three clips would not establish handling quality. No training commitment follows; task-data coverage and the PRD's twelve-clip gate remain open.

## Reproduction and software verification

Helpers are under [experiments/local_cv](../experiments/local_cv/README.md). Portable preparation was checked against the original for all **48 frame IDs/times/hashes and all 48 automatic seeds**. It has not received another full model run. Existing-run refusal was exercised before model imports and preserved original receipt/results byte-for-byte. The prototype used for the actual inference remains with its script digest under ignored `data/local-sam2/`; original masks/results are under `attempt-1/`.

Six standard-library tests now cover the earlier evidence/association invariants plus refusal of hand-selected seed tracks and wrong case/time mappings. They do not measure model accuracy. The generalized helper follows the same inference loop; only the original prototype has the full-run receipt. Production application behavior, model allowlist, preview and saved reports remain unchanged.
