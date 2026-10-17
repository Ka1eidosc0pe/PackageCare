# Validation plan

## Local product checks

1. Start from an empty local `data/records` directory in a disposable test environment.
2. Generate fixtures and load the three samples through the app.
3. Verify that every sample is labeled synthetic/scripted in the workspace and reports.
4. Play footage; seek via a timeline item and slider; inspect a frame.
5. Confirm a possible release, set damage to `none_observed`, save a completed review, and verify those facts remain separate.
6. Correct or dismiss an observation; verify that the original model record remains while the report excludes dismissed claims.
7. Add a valid damage photo; reject a spoofed/non-image upload; verify dirty review changes are not silently lost.
8. Preview, finalize, and download a report. Unzip and inspect relative evidence links and manifest hashes.
   Finalization stays disabled until the preview loads successfully. The API requires its signed receipt for the same saved revision and report contents. Missing/tampered/expired or cross-delivery receipts fail; an unchanged repeated finalization returns the existing snapshot. Editing the review requires a new preview. Finalized/exported HTML must contain no preview receipt.
9. Change recipient notes and create v2; verify v1 did not change.
10. Reload/restart and verify persistence. Exercise list filters, search, report library, and connection failure states.
    For an imported clip, stop after receipt but before decoding, restart, and verify the persisted original is prepared. Fail the model call, retry, and verify evidence identifiers do not change.
11. Check narrow and desktop breakpoints, keyboard focus, reduced motion, and readable labels/errors.

## Gate A — actual Ring

- Establish an authorized Playground session. Never put the token in a command argument, log, commit, or chat.
- Run `npm run ring:probe` with environment-file configuration.
- Verify discovery, device capabilities, camera module selection, event history, and an actual existing recording.
- Save the non-secret result (endpoint class, status, timestamp handling, duration, readiness latency) in the development/friction logs.
- Determine custom media/scenario support through the official UI/docs. The current answer is unknown.
- Show the footage playing in PackageCare with accurate `ring_simulator` or `ring_device` provenance.
- Exercise expired-token, not-ready, unsupported/encrypted-media cases.
- If suitable footage is unavailable, consult the owner before changing the intended submission path.

## Gate B — actual Bedrock

Create a JSON manifest using footage the owner has rights to use:

```json
[
  {"id":"normal-01","file":"clips/normal-01.mp4","expected":"no_concern_observed","split":"development"},
  {"id":"drop-01","file":"clips/drop-01.mp4","expected":"possible_rough_handling","actionWindow":[3000,3700],"split":"held_out"},
  {"id":"occluded-01","file":"clips/occluded-01.mp4","expected":"unable_to_assess","split":"held_out"}
]
```

Start with at least 12 distinct cases as described in the PRD. Do not count minor variants of a synthetic scene as independent real-world evidence. Keep tuning and held-out cases separate.

Run the evaluation harness separately with `ANALYSIS_STRATEGY=dense_frames`, `sparse_frames`, and `native_video`. Each run makes real billable Bedrock calls. Set a budget first. Record false alarms, misses, abstention, action-window coverage, usage, latency, and unsupported statements. The harness saves detailed local JSON and does not claim production accuracy.

## AWS runtime

CDK synthesis is only structural validation. The Linux container build, FFmpeg, packaged HTTP/frontend handler, and actual production entrypoint passed the account-free CI smoke in [run 38990693461](https://github.com/Ka1eidosc0pe/PackageCare/actions/runs/38990693461). Before claiming deployment works, deploy to the authorized account and exercise authentication, source media download, Step Functions success/failure, persistence, and export. Confirm actual deployment limitations and document them rather than treating source code or the simulated Runtime API as evidence of live AWS success.
