// This project is restricted to Ohio. Toolkit configuration is separate.
export const APPLICATION_REGION = "us-east-2";
export const BEDROCK_MODEL = "amazon.nova-lite-v1:0";

export function awsConfig() {
  if (process.env.AWS_REGION && process.env.AWS_REGION !== APPLICATION_REGION)
    throw new Error(`PackageCare requires AWS_REGION=${APPLICATION_REGION}.`);
  if (process.env.AWS_LAMBDA_FUNCTION_NAME)
    return { region: APPLICATION_REGION };
  if (process.env.AWS_PROFILE && process.env.AWS_PROFILE !== "pkgcare")
    throw new Error("PackageCare requires the pkgcare AWS profile locally.");
  return { region: APPLICATION_REGION, profile: "pkgcare" };
}

export function bedrockModel(
  model = process.env.BEDROCK_MODEL_ID || BEDROCK_MODEL,
) {
  // An allowlist also excludes inference-profile/managed-prompt ARNs that could
  // route to another Region. Revisit only after an approved model evaluation.
  if (model !== BEDROCK_MODEL)
    throw new Error(
      `Use the in-Region model ${BEDROCK_MODEL} for PackageCare.`,
    );
  return model;
}

export function processingErrorMessage(error: {
  name?: string;
  message?: string;
}) {
  if (error?.name === "ThrottlingException")
    return /tokens per day|daily/i.test(error.message || "")
      ? "Bedrock's daily token quota is unavailable or exhausted. Check Amazon Bedrock quotas in us-east-2 before retrying."
      : "Bedrock is rate limited. Check the model's quotas before retrying.";
  return "Processing failed. Check account access, media format, and server logs; then retry.";
}
