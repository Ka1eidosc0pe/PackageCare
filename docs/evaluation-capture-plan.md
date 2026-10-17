# PackageCare footage capture and labeling plan

This prepares the PRD's 12-clip feasibility set. **No evaluation clips have been collected or labeled yet.** AWS quota access, owner spending approval and actual model results remain separate requirements.

Ring Playground device discovery works, but its current event history is empty. Custom-scene/recording support is still unproven. First try to obtain the scenes through the accepted Ring source. If the simulator cannot supply delivery scenes, short staged phone-camera clips can support model development with `uploaded` provenance; they do not establish Ring integration or replace the required Ring demonstration. Consult the owner before changing the submission path.

## Capture

Use a fixed doorway view, with the doorstep, the participant's hands and the parcel path visible. Record 6–12 seconds per clip, including the approach and final resting position. Use an empty carton and consenting participants. Faces and identifying labels are unnecessary. Keep the original files, including any Ring watermark. Record source, consent/permission and capture date locally; keep footage out of Git.

Make distinct recordings, rather than crops or speed changes of the same action. Vary approach direction, lighting or carton appearance where specified. Avoid ground-truth labels or instructions in the video. The model must assess what is visible, without knowing the expected answer.

| Case | Record this visible sequence | Initial split |
|---|---|---|
| normal-01 | Front approach; lower the carton until it touches the step, then let go | Development |
| normal-02 | Two-handed placement with the carton's bottom and hand release visible | Development |
| normal-03 | Side approach and a different carton; keep the entire controlled placement visible | Held out |
| normal-04 | Place the carton, then slide it a short distance along the step while it stays in contact | Held out |
| rough-01 | Clearly release the empty carton above the step; capture the unsupported interval and landing | Development |
| rough-02 | Short underhand toss with a visible arc and landing | Development |
| rough-03 | Toss from a side approach with a different carton and visible release/landing | Held out |
| rough-04 | A brief clear release followed by landing/bounce; capture the whole action without slowing the clip | Held out |
| unclear-01 | A rail or object hides the release/placement; the parcel is visible before and afterward | Development |
| unclear-02 | The participant blocks the key handling moment | Development |
| unclear-03 | Recording starts with the parcel already at rest; placement is absent | Held out |
| unclear-04 | The parcel leaves the frame during the key moment and is visible afterward | Held out |

These are capture intentions, not finished ground truth. Inspect each actual recording before labeling it. If a purported rough-handling action is obscured, label the resulting footage `unable_to_assess` or record another distinct clear case. Do not infer internal damage, intent or force from the scene.

## Label before inference

Copy [the manifest template](../evaluation/manifest.template.json) beside the local `clips/` directory. Replace paths with the actual files and verify every expected assessment. For each visible drop/toss, manually add `actionWindow: [startMs, endMs]` covering the release and landing in the original clip. Do not copy guessed offsets. Keep a short local annotation describing the visible evidence and any disagreement.

Leave the held-out recordings unused while adjusting prompts on development examples. Choose the input strategy using the development set, then run the selected configuration on the held-out cases. If held-out failures lead to further tuning, report that reuse and obtain new independent clips before presenting a fresh held-out result.

The existing harness records expected/actual assessment, action-window overlap, elapsed time and provider usage. Review the actual descriptions and cited frames as well: matching the three-way class alone does not establish a useful or accurate explanation. Report counts and concrete misses/false flags/abstentions, with the small-set limitation.

## Run only after quota and spending approval

The manifest template references files that do not exist. It is not a completed dataset or a command to run immediately.

```sh
ANALYSIS_STRATEGY=dense_frames npm run evaluate -- /absolute/path/to/local-manifest.json
```

Repeat the same approved cases with sparse/native strategies only within a separately prepared cost scope. The evaluation harness makes real billable calls. The prior $0.05 smoke approval does not authorize this dataset run. It must use `pkgcare` and in-Region `amazon.nova-lite-v1:0` in `us-east-2`.
