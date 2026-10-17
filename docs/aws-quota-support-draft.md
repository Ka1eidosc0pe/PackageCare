# AWS quota support request — draft, not sent

Use the affected project in the AWS console. Check Amazon Bedrock in **US East (Ohio), us-east-2**, then follow the [official runtime quota request guidance](https://docs.aws.amazon.com/bedrock/latest/userguide/quotas-runtime.html). If a quota is not adjustable through Service Quotas, ask AWS Support to investigate. Do not upgrade the project or purchase capacity as part of this draft.

**Subject:** New project: authorized Nova Lite requests blocked by zero daily token quota in us-east-2

I am building PackageCare for the Amazon developer hackathon. It uses Amazon Nova Lite to describe visible package-handling actions from short, authorized delivery clips, followed by recipient review. We do not identify people or infer intent. We need a small initial validation allowance using in-Region on-demand inference only.

The project is active on the Free plan. Its selected Region is us-east-2, confirmed in AWS Settings. AWS CLI 2.38.1 and the current AWS SDK for JavaScript v3 authenticate successfully.

For `amazon.nova-lite-v1:0`, GetFoundationModel reports ACTIVE and ON_DEMAND support. GetFoundationModelAvailability reports AUTHORIZED, with agreement, entitlement and Region AVAILABLE. However, our first Converse request returned HTTP 429 `ThrottlingException: Too many tokens per day, please wait before trying again.`

Service Quotas in us-east-2 reports:

- Quota: Model invocation max tokens per day for Amazon Nova Lite (doubled for cross-region calls)
- Code: `L-45E0AD92`
- Applied value: **0**
- Adjustable: **false**

The failed request used five images and explicitly capped output at 2,500 tokens. The SDK attempted it once, with no automatic retries. We received no model output or token-usage response. The second planned verification call did not run. The local failure record has the request ID if needed.

Please investigate the zero daily-token allocation and enable an appropriate small in-Region on-demand allowance for initial testing—for example 100,000 daily tokens and 30,000 tokens/minute—or advise the supported process for this project. We have not requested cross-Region inference, provisioned throughput, a plan upgrade or advanced features.

We will keep all application processing in us-east-2 and approve spending separately before further validation. Please clarify any plan or billing changes required before applying them.
