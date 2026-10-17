# AWS and Ring readiness — October 16, 2026

## Verified without billable operations

- AWS CLI 2.38.1: `pkgcare` sign-in succeeds. The owner confirmed Ohio (`us-east-2`). Plan metadata reports `FREE`, `ACTIVE`.
- The installed JavaScript SDK resolves temporary credentials from `pkgcare`. No credential values were displayed or saved by the agent.
- Bedrock `GetFoundationModel` reports `amazon.nova-lite-v1:0` active with text/image/video inputs and on-demand support. `GetFoundationModelAvailability` reports agreement/entitlement/Region available and authorization authorized. These metadata calls do not establish a successful invocation.
- AWS Agent Toolkit default skills and AWS MCP configuration installed. The generated Codex MCP command/arguments were preserved; `AWS_MCP_PROXY_PROFILES=pkgcare` restricts its profile selection. Its `us-east-1` endpoint is toolkit control plane only. This running chat does not yet expose the new MCP tools; local skills and CLI are usable.
- Ring discovery authenticated through the application's existing token without exposing it. One simulated device; capabilities and history HTTP 200. History returned zero events. Video capability advertises AVC, 1080p, 16:9. No actual recording downloaded, no custom-scene support proven.

## Configuration correction

The old Nova 2 Lite US inference profile could route outside Ohio. That conflicts with the owner's Region restriction. Application clients now require Ohio; local clients use `pkgcare`, Lambda uses its execution role. Model IDs/profiles are allowlisted to the in-Region Nova Lite candidate. CDK pins every Regional resource to Ohio and grants the worker invocation of that exact foundation model only. Quality still needs evaluation.

The Ring session later expired: the backend requires a current Playground token and reports disconnected. With four terminal records and no cloud storage/workflow configured, restarted the local preview on the tested worker/assessment source. Four records and the frozen report were preserved. The Connections screen now shows Ohio, pkgcare, the in-Region model and “No successful analysis yet.” Reconnect a fresh Ring token when live validation can resume.

## First paid test — approved, attempted, quota blocked

Prepared locally with:

```sh
npm run bedrock:smoke -- data/fixtures/drop.mp4
```

The input is our original eight-second synthetic animation. Five JPEG frames, original and playback video were written only to ignored local storage. No inference ran.

The owner explicitly approved up to $0.05. The same command with `--invoke` makes at most **two** Nova Lite Converse requests: observe, then verify. Each request has five frames and a 2,500-output-token cap. Automatic SDK retries are disabled. No S3, DynamoDB, Step Functions, deployment, provisioned throughput or other resource is used. Results and token usage stay under `data/bedrock-smoke/`. The approved attempt stopped on the first response: HTTP 429 `ThrottlingException`, “Too many tokens per day.” SDK metadata confirms one attempt and zero retry delay; the second pass never ran. No model usage/result was returned. The actual response is preserved in ignored local `failure.json`. This approval is not blanket permission for more calls.

AWS's [public Ohio price list](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonBedrock/current/us-east-2/index.json), published 2026-10-16T21:08:06Z, lists Nova Lite on-demand input at $0.00006/1K tokens and output at $0.00024/1K tokens. Expected smoke cost is below $0.01. Even budgeting the model's full 300K context as input for each request plus both maximum outputs is $0.0372 before taxes. Approved ceiling for the attempted test: **$0.05**. This is an estimate with bounded requests, not a billing-system hard cap. Recheck prices if the test is delayed materially.

This failed test establishes that the authenticated request reaches Bedrock but runtime quota prevents analysis. It does not establish successful response/schema behavior. Synthetic results do not satisfy the real-footage quality gate or demonstrate Ring provenance. Full evaluation and AWS deployment require separately prepared cost scopes and explicit approval.

## Sources

- [In-Region Nova Lite availability and context](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-amazon-nova-lite.html)
- [Services supported on the new AWS Free plan](https://docs.aws.amazon.com/accounts/latest/reference/supported-services-sign-up-new.html)
- [AWS Toolkit setup](https://raw.githubusercontent.com/aws/agent-toolkit-for-aws/refs/heads/main/setup-instructions/setup.md)
- [Ring release notes: temporary Playground tokens and event simulation](https://developer.amazon.com/docs/ring/release-notes.html)
- [Ring media and event contracts](https://developer.amazon.com/docs/ring/api-documentation.html)
- [Owner spending restrictions](../AGENTS.md)

## Quota diagnosis and next action

Free Service Quotas reads report Nova Lite daily token quota `L-45E0AD92` = **0**, adjustable **false**. Nova Pro and other Nova daily entries checked are also zero. This explains the runtime rejection despite authorized/available model metadata; changing model or retrying is not an established fix. No quota or plan changes were made. AWS documents that applied quotas can be below defaults and describes [runtime quota increase/support handling](https://docs.aws.amazon.com/bedrock/latest/userguide/quotas-runtime.html#quotas-runtime-increase).

A [support request draft](aws-quota-support-draft.md) is ready for owner review. It has not been sent. Ask AWS to enable modest in-Region on-demand daily capacity for this project. Do not change Regions, enable paid/advanced features or purchase capacity as a workaround. After quota access changes, prepare and approve a fresh bounded inference attempt.
