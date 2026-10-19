# Alternative vision benchmark — October 19, 2026

Status: **completed under a separate owner-approved $0.40 scope; that scope is now closed.** Two requests returned valid JSON but empty observations; the final result abstained. No further invocation is authorized by this document. See [actual results](evaluation-results-2026-10-19.md#alternative-vision-development-experiment).

## Reason for the experiment

Nova Lite did not establish the annotated carton toss in our four-second CC BY development excerpt. Dense 4 fps and 8 fps abstained; sparse images and native video falsely cleared the excerpt against our annotation. See [actual results](evaluation-results-2026-10-19.md). Additional density alone has not resolved the miss.

Test Qwen3-VL 235B using the exact sixteen already prepared 4 fps JPEGs. Both observation and verification receive the entire ordered sequence, within Converse's twenty-image request limit. This changes **model and sequence context**, so it cannot isolate the model's contribution. It is one development example outside the doorstep domain, not a held-out evaluation or an accuracy gate. Do not change the annotation after seeing model output.

## Prepared scope

- Local plan: `data/vision-benchmarks/27ea257a-aeda-4883-b2ff-e8ef4abbe1d2/plan.json`.
- Baseline: `data/evaluations/10941bb5-35e4-47e4-9ffc-0d2293be4960/plan.json`.
- Source excerpt SHA-256: `fd93b0742adc0b8aca3023190a6dc227eae6444defbb93fdcdb690f89e3bdf59`.
- Model: `qwen.qwen3-vl-235b-a22b`, direct on-demand Bedrock Runtime Converse in **us-east-2**, named **pkgcare** profile. No inference profile or cross-Region routing.
- At most **two requests**: observation, then verification only if observation validates. Maximum **2,500 output tokens per request**; zero model retries. Stop on any operational or validation failure. No paid replay of the same plan.
- All source, prepared evidence, receipts, results and reports stay in ignored local storage. No S3, deployment, resource creation, automatic complaint or external message.
- Expected labels, action window and source filename are excluded from prompts. Supplied aliases map exactly to preserved frame IDs; intervals derive from cited offsets. Both passes use the same frozen, hash-verified image bytes.
- Raw response and usage journal precedes parsing; completed passes survive later failure. Invalid citations or malformed critical fields produce no completed assessment.
- Qwen does not support Bedrock Runtime structured outputs according to its model card. Request plain JSON and apply the shared evidence validator; do not assume Nova's forced-tool response interface works.

The ordinary application's model allowlist remains Nova Lite. This evaluation does not authorize changing the application model or deploying Qwen access.

## Read-only availability and pricing evidence

AWS metadata on October 19 reports Qwen3-VL active, on-demand, image/text, authorized and available in Ohio. This is not proof that runtime quota or inference succeeds. Nova Pro and Nova 2 Lite list inference-profile-only availability here; the project prohibits cross-Region processing, so those were not silently substituted.

The [official Qwen model card](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-qwen-qwen3-vl-235b-a22b.html) documents image/text input, Converse, a 262,144-token context and 8,192-token maximum output. Native video and Runtime structured outputs are unsupported.

The AWS Price List API returned the following **Ohio standard on-demand Bedrock Runtime** rates, effective October 1, 2026. Batch, Flex, Priority and Mantle entries were excluded:

| Direction | USD / 1,000 tokens | Price List SKU |
|---|---:|---|
| Input | $0.00053 | `YEVHP7NXG6NZYX2H` |
| Output | $0.00266 | `8F4PU22YHX3V3G2J` |

Expected inference cost for two sixteen-image requests is under **$0.05**; actual usage is not known in advance. A deliberately conservative ceiling using the full 262,144-token input context plus 2,500 output tokens for each request is **$0.29117264 before tax**. Proposed owner approval ceiling: **$0.40**. These are estimates rather than an AWS billing hard stop. No retries, larger output limits or extra requests are included. See [Bedrock pricing](https://aws.amazon.com/bedrock/pricing/).

## Reproduction

Preparation makes no model calls:

```sh
npm run benchmark:vision -- data/evaluations/10941bb5-35e4-47e4-9ffc-0d2293be4960/plan.json
```

Historical command, executed once under the separate approval (the exclusive invocation receipt now prevents replay):

```sh
npm run benchmark:vision -- data/vision-benchmarks/27ea257a-aeda-4883-b2ff-e8ef4abbe1d2/plan.json --invoke --max-requests 2
```

Record both pass outputs, usage, latency, validation failures and correspondence to the prewritten action window. A successful positive would justify further independent normal/rough/unclear evaluation, not production readiness. A miss or failed response must stay visible; do not spend again without a new explained scope and approval.

## Source credit

Excerpt from [FedEx荷物積み込み米国宅配で破損が多い理由](https://commons.wikimedia.org/wiki/File:FedEx荷物積み込み米国宅配で破損が多い理由.ogv), **副業サポート掘 英郎**, [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). First four seconds retained, audio removed, H.264 transcoded; no crop or speed change. Preserve credit and modification notice when sharing. See [source catalog](footage-sources.md).
