import {
  APPLICATION_REGION,
  AWS_PROFILE_NAME,
  BEDROCK_MODEL,
} from "../shared/project.js";
export { APPLICATION_REGION, BEDROCK_MODEL } from "../shared/project.js";

export function awsConfig() {
  if (process.env.AWS_REGION && process.env.AWS_REGION !== APPLICATION_REGION)
    throw new Error(`PackageCare requires AWS_REGION=${APPLICATION_REGION}.`);
  if (process.env.AWS_LAMBDA_FUNCTION_NAME)
    return { region: APPLICATION_REGION };
  if (process.env.AWS_PROFILE && process.env.AWS_PROFILE !== AWS_PROFILE_NAME)
    throw new Error("PackageCare requires the pkgcare AWS profile locally.");
  return { region: APPLICATION_REGION, profile: AWS_PROFILE_NAME };
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
  if (error?.name === "ModelOutputError")
    return "Bedrock returned an invalid evidence response. No assessment was saved. Review model diagnostics before retrying.";
  if (error?.name === "LocalClassifierError")
    return "The local handling classifier failed. No assessment was saved. Your source footage is preserved; check the local Python environment and retry.";
  if (error?.name === "ServiceUnavailableException")
    return "Bedrock is temporarily unavailable. Your source footage is preserved. Retry this delivery later.";
  return "Processing failed. Check account access, media format, and server logs; then retry.";
}
