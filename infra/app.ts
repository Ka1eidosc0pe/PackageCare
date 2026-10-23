import {
  App,
  Stack,
  Duration,
  Size,
  CfnParameter,
  CfnOutput,
  RemovalPolicy,
  aws_s3 as s3,
  aws_dynamodb as dynamodb,
  aws_lambda as lambda,
  aws_apigatewayv2 as apigw,
  aws_stepfunctions as sfn,
  aws_stepfunctions_tasks as tasks,
  aws_logs as logs,
  aws_iam as iam,
  aws_events as events,
  aws_events_targets as targets,
  aws_ecr_assets as ecrAssets,
} from "aws-cdk-lib";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import path from "node:path";
import { APPLICATION_REGION, BEDROCK_MODEL } from "../server/aws.js";
const app = new App();
if (process.env.AWS_REGION && process.env.AWS_REGION !== APPLICATION_REGION)
  throw new Error(
    `Deploy PackageCare only in ${APPLICATION_REGION} using --profile pkgcare.`,
  );
const stack = new Stack(app, "PackageCare", {
  env: { region: APPLICATION_REGION },
});
const password = new CfnParameter(stack, "WorkspacePassword", {
  type: "String",
  noEcho: true,
  minLength: 20,
});
const session = new CfnParameter(stack, "SessionSecret", {
  type: "String",
  noEcho: true,
  minLength: 32,
});
const token = new CfnParameter(stack, "RingToken", {
  type: "String",
  noEcho: true,
  minLength: 20,
});
const signing = new CfnParameter(stack, "RingHmacKey", {
  type: "String",
  noEcho: true,
});
const account = new CfnParameter(stack, "RingAccountId", { type: "String" });
const source = new CfnParameter(stack, "RingSourceType", {
  type: "String",
  default: "ring_simulator",
  allowedValues: ["ring_simulator", "ring_device"],
});
const model = new CfnParameter(stack, "BedrockModel", {
  type: "String",
  default: BEDROCK_MODEL,
  allowedValues: [BEDROCK_MODEL],
});
const bucket = new s3.Bucket(stack, "Evidence", {
  blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
  enforceSSL: true,
  encryption: s3.BucketEncryption.S3_MANAGED,
  removalPolicy: RemovalPolicy.RETAIN,
  lifecycleRules: [
    { abortIncompleteMultipartUploadAfter: Duration.days(1) },
    { prefix: "incoming/", expiration: Duration.days(1) },
  ],
});
const table = new dynamodb.Table(stack, "Deliveries", {
  partitionKey: { name: "id", type: dynamodb.AttributeType.STRING },
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
  pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
  removalPolicy: RemovalPolicy.RETAIN,
});
const api = new apigw.HttpApi(stack, "HttpApi", { apiName: "PackageCare" });
bucket.addCorsRule({
  allowedOrigins: [api.apiEndpoint],
  allowedMethods: [s3.HttpMethods.POST],
  allowedHeaders: ["*"],
  maxAge: 300,
});
const common = {
  PACKAGECARE_BUCKET: bucket.bucketName,
  PACKAGECARE_TABLE: table.tableName,
  PACKAGECARE_PASSWORD: password.valueAsString,
  SESSION_SECRET: session.valueAsString,
  RING_ACCESS_TOKEN: token.valueAsString,
  RING_HMAC_KEY: signing.valueAsString,
  RING_ACCOUNT_ID: account.valueAsString,
  RING_SOURCE_TYPE: source.valueAsString,
  BEDROCK_MODEL_ID: model.valueAsString,
  APP_ORIGIN: api.apiEndpoint,
};
const image = path.resolve(".");
// API and Retention never need the classifier files that .dockerignore re-includes for the worker.
// All functions are arm64: the image's native npm/ffmpeg binaries must match the Lambda
// architecture, and an explicit platform keeps builds on Apple Silicon and x86 hosts identical.
const arm = {
  platform: ecrAssets.Platform.LINUX_ARM64,
  architecture: lambda.Architecture.ARM_64,
};
const slim = {
  file: "infra/Dockerfile.lambda",
  exclude: ["data"],
  platform: arm.platform,
};
// The worker runs the local handling classifier (frozen V-JEPA 2 + scikit-learn head) on CPU.
// arm64 (Graviton) is ~20% cheaper per GB-second; 10 GB gives the 6-vCPU maximum.
const worker = new lambda.DockerImageFunction(stack, "Worker", {
  code: lambda.DockerImageCode.fromImageAsset(image, {
    file: "infra/Dockerfile.worker",
    platform: arm.platform,
    cmd: ["lambda/worker.handler"],
  }),
  architecture: arm.architecture,
  timeout: Duration.minutes(10),
  memorySize: 10240,
  ephemeralStorageSize: Size.gibibytes(2),
  environment: { ...common, PACKAGECARE_ANALYZER: "local" },
  reservedConcurrentExecutions: 2,
  logGroup: new logs.LogGroup(stack, "WorkerLogs", {
    retention: logs.RetentionDays.ONE_WEEK,
  }),
});
// Explicit task results replace input, keeping payload small and original footage in S3.
function task(name: string, phase: string) {
  return new tasks.LambdaInvoke(stack, name, {
    lambdaFunction: worker,
    payload: sfn.TaskInput.fromObject({
      id: sfn.JsonPath.stringAt("$.id"),
      generation: sfn.JsonPath.stringAt("$.generation"),
      phase,
      ...(phase === "fail"
        ? { failureCode: sfn.JsonPath.stringAt("$.failure.Error") }
        : {}),
    }),
    payloadResponseOnly: true,
  });
}
const retrieve = task("Retrieve footage", "retrieve"),
  observe = task("Observe handling", "observe"),
  verify = task("Verify evidence", "verify"),
  failure = task("Persist failure", "fail");
retrieve.addRetry({
  errors: ["MediaPending"],
  interval: Duration.seconds(5),
  backoffRate: 2,
  maxAttempts: 4,
});
for (const t of [retrieve, observe, verify]) {
  t.addRetry({
    errors: ["Lambda.ServiceException", "Lambda.TooManyRequestsException"],
    interval: Duration.seconds(3),
    maxAttempts: 2,
  });
  t.addCatch(failure, { resultPath: "$.failure" });
}
const workflow = new sfn.StateMachine(stack, "Processing", {
  definitionBody: sfn.DefinitionBody.fromChainable(
    retrieve.next(observe).next(verify),
  ),
  // Exceeds retrieve + observe + verify (+ fail) at the 10-minute worker timeout plus retries.
  timeout: Duration.minutes(45),
  logs: {
    destination: new logs.LogGroup(stack, "WorkflowLogs", {
      retention: logs.RetentionDays.ONE_WEEK,
    }),
    level: sfn.LogLevel.ERROR,
    includeExecutionData: false,
  },
});
const handler = new lambda.DockerImageFunction(stack, "Api", {
  code: lambda.DockerImageCode.fromImageAsset(image, slim),
  architecture: arm.architecture,
  timeout: Duration.seconds(29),
  memorySize: 1024,
  environment: {
    ...common,
    PACKAGECARE_STATE_MACHINE: workflow.stateMachineArn,
  },
  logGroup: new logs.LogGroup(stack, "ApiLogs", {
    retention: logs.RetentionDays.ONE_WEEK,
  }),
});
api.addRoutes({
  path: "/{proxy+}",
  methods: [apigw.HttpMethod.ANY],
  integration: new HttpLambdaIntegration("PackageCareIntegration", handler),
});
api.addRoutes({
  path: "/",
  methods: [apigw.HttpMethod.ANY],
  integration: new HttpLambdaIntegration("PackageCareRoot", handler),
});
for (const fn of [handler, worker]) {
  bucket.grantReadWrite(fn);
  table.grantReadWriteData(fn);
}
const maintenance = new lambda.DockerImageFunction(stack, "Retention", {
  code: lambda.DockerImageCode.fromImageAsset(image, {
    ...slim,
    cmd: ["lambda/maintenance-worker.handler"],
  }),
  architecture: arm.architecture,
  timeout: Duration.minutes(5),
  memorySize: 512,
  environment: {
    PACKAGECARE_BUCKET: bucket.bucketName,
    PACKAGECARE_TABLE: table.tableName,
    RETENTION_DAYS: "30",
  },
  logGroup: new logs.LogGroup(stack, "RetentionLogs", {
    retention: logs.RetentionDays.ONE_WEEK,
  }),
});
bucket.grantReadWrite(maintenance);
table.grantReadWriteData(maintenance);
new events.Rule(stack, "DailyRetention", {
  schedule: events.Schedule.rate(Duration.days(1)),
  targets: [new targets.LambdaFunction(maintenance)],
});
worker.addToRolePolicy(
  new iam.PolicyStatement({
    actions: ["bedrock:InvokeModel"],
    resources: [
      `arn:aws:bedrock:${APPLICATION_REGION}::foundation-model/${BEDROCK_MODEL}`,
    ],
  }),
);
workflow.grantStartExecution(handler);
workflow.grantExecution(handler, "states:DescribeExecution");
new CfnOutput(stack, "ApplicationUrl", { value: api.apiEndpoint });
new CfnOutput(stack, "WebhookUrl", {
  value: `${api.apiEndpoint}/api/webhooks/ring`,
});
new CfnOutput(stack, "EvidenceBucket", { value: bucket.bucketName });
app.synth();
