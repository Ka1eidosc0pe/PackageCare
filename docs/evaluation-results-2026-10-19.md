# Development evaluation — October 19, 2026

This is **one labeled development excerpt**, outside the doorstep-camera domain. It does not pass the PRD's twelve-clip normal/rough/unclear feasibility gate, measure production accuracy, or justify a final input strategy. Expected labels and the action window were written before inference. They are our visual annotations, not independent ground truth.

## Source and annotation

Four-second excerpt from [van-loading footage on Wikimedia Commons](https://commons.wikimedia.org/wiki/File:FedEx荷物積み込み米国宅配で破損が多い理由.ogv), credited to **副業サポート掘 英郎**, [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). First four seconds retained, audio removed and H.264 transcoded; no crop/speed change. Original bytes and hashes remain locally preserved. See [source catalog](footage-sources.md).

Visible sequence: a person on the right moves a light-colored carton upward toward the van interior; the landing/receiving region is partly obscured. A ten-frame-per-second sequence shows a brief interval away from the hands. Development label: `possible_rough_handling`; approximate visible-action interval 1,300–2,300 ms. This supports neither intent nor damage nor worker identification.

All configurations used in-Region Nova Lite (`amazon.nova-lite-v1:0`), prompt v6, observation plus verification, max 2,500 output tokens/request, zero model retries and local storage. The expected label was not included in model prompts. Paid invocation required separate owner approval.

## First three-strategy comparison

| Input | Maximum / actual requests | Result | Supported concern overlaps action? | Analysis time, excluding preparation | Estimated inference USD |
|---|---|---|---|---|---|
| Dense, 4 fps / 16 prepared frames | 8 / 8 | Unable to assess; possible release retained as ambiguous at 1,625 ms | No | 17.082 s | $0.00253116 |
| Sparse, 5 selected frames | 2 / 2 | No concern observed | No | 3.815 s | $0.00064314 |
| Native, four-second video | 2 / 2 | No concern observed | No | 4.526 s | $0.00051906 |

All twelve requests returned and passed validation. No operational failure occurred. **None confirmed the annotated handling concern.** The two “no concern” outputs are false clears against our development annotation; dense input abstained rather than establishing the action. Do not summarize this as successful detection or select sparse/native input because they were cheaper/faster.

Total reported usage: 52,412 input / 2,286 output tokens. Estimated total **$0.00369336** before tax, using previously verified Ohio rates ($0.00006/1K input; $0.00024/1K output). These are usage-based estimates, not invoices. This $0.30 / twelve-request scope is complete and closed.

Local immutable plans, returned replies/usage, completed passes and results:

- Dense: `data/evaluations/10941bb5-35e4-47e4-9ffc-0d2293be4960`
- Sparse: `data/evaluations/15cb9f68-f393-4fd4-911d-4f0544931a04`
- Native: `data/evaluations/edfd236e-33bb-4212-bb3e-3049ba7fcb40`
- Aggregation: `data/online-footage/strategy-comparison.json`

Runtime media and raw model replies remain ignored, rather than published in Git.

## Denser development follow-up

Prepared 32 frames over the same four seconds (8 fps), yielding eight windows per pass and at most sixteen requests. The harness records the requested frame count in its immutable plan and rechecks hashes/call count before invocation. Its updated regression proves denser preparation changes the exact authorized request requirement and refuses an inadequate limit before any provider call.

Owner approved a new ceiling of $0.35 for this single sixteen-request run, no retries, Ohio, local storage, stop on operational/validation failure. All **16 requests returned and passed validation**, but the result was again `unable_to_assess`, with no supported handling concern/action-window overlap. Analysis time excluding preparation was **30.957 s**. Usage: **73,779 input / 2,744 output tokens**, estimated **$0.00508530** before tax. The scope is complete/closed. Plan and receipts: `data/evaluations/47fa23e5-4238-41c7-ab80-6fa6a6e619c6`. This is tuning on the same development event; it never becomes a held-out example.

Full-size input inspection after this run confirms the carton away from the visible hands at 1,813 and 1,938 ms; the receiving/landing area remains partly obscured. Thus increasing samples alone has not established useful detection on this development example. Keep the original expected label and failed results; do not relabel it to make the model look correct. Total estimated cost of both source-excerpt scopes: **$0.00877866** before tax.

No final strategy is selected. A stronger-model comparison is a reasonable next experiment, but capability, adapter compatibility, pricing and spending authorization must be checked first. Read-only Ohio metadata lists Nova Pro/Nova 2 Lite as inference-profile-only; do not silently switch to cross-Region routing. Qwen3-VL 235B, Mistral Large 3 and Kimi K2.5 are listed with in-Region ON_DEMAND image input and AUTHORIZED/AVAILABLE metadata. This is availability, not tested runtime quality or quota readiness. The application remains pinned to Nova Lite until an explicitly approved model evaluation justifies a change.

## Remaining evidence

- Recheck the visible release with full-frame video and sampling offsets; distinguish a missed interval from poor interpretation or annotation disagreement.
- Obtain independent normal placements and ambiguous cases with a suitable license/use path. The catalog's candidate list is not a completed dataset.
- Test the chosen configuration on unused cases; disclose reuse if prompts/input sampling are tuned after inspecting results.
- Full dense processing of the saved Ring at-rest clip stopped before completing observation, most recently on a provider service error. A separate two-pass sparse Ring diagnostic succeeded. These are distinct findings.
