import { afterEach, describe, expect, it, vi } from "vitest";
import { awsConfig, bedrockModel, BEDROCK_MODEL } from "../server/aws.js";
import { BedrockAnalyzer } from "../server/analysis.js";
import { MediaStore } from "../server/media.js";

afterEach(() => vi.unstubAllEnvs());

describe("project AWS boundaries", () => {
  it("uses the named local profile, switches to the Lambda role, and rejects another Region/profile", () => {
    vi.stubEnv("AWS_REGION", "us-east-2");
    vi.stubEnv("AWS_PROFILE", "pkgcare");
    vi.stubEnv("AWS_LAMBDA_FUNCTION_NAME", "");
    expect(awsConfig()).toEqual({ region: "us-east-2", profile: "pkgcare" });
    vi.stubEnv("AWS_PROFILE", "unrelated-project");
    expect(() => awsConfig()).toThrow("pkgcare");
    vi.stubEnv("AWS_LAMBDA_FUNCTION_NAME", "PackageCare-Worker");
    expect(awsConfig()).toEqual({ region: "us-east-2" });
    vi.stubEnv("AWS_REGION", "us-east-1");
    expect(() => awsConfig()).toThrow("us-east-2");
  });

  it("rejects cross-Region routing and has no automatic inference retries", async () => {
    vi.stubEnv("AWS_REGION", "us-east-2");
    vi.stubEnv("AWS_PROFILE", "pkgcare");
    expect(bedrockModel(BEDROCK_MODEL)).toBe(BEDROCK_MODEL);
    for (const model of [
      "us.amazon.nova-lite-v1:0",
      "us.amazon.nova-2-lite-v1:0",
      "global.amazon.nova-2-lite-v1:0",
      "arn:aws:bedrock:us-east-2:123456789012:inference-profile/example",
    ]) {
      expect(
        () => new BedrockAnalyzer(new MediaStore("/tmp/unused"), model),
      ).toThrow("in-Region");
    }
    const adapter = new BedrockAnalyzer(
      new MediaStore("/tmp/unused"),
      BEDROCK_MODEL,
    );
    expect(await adapter.client.config.region()).toBe("us-east-2");
    expect(await adapter.client.config.maxAttempts()).toBe(1);
  });
});
