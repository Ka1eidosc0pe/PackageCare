// Runs inside the built Linux image, with no account credentials or deployed resources.
const assert = require("node:assert/strict");
const http = require("node:http");
const { spawn } = require("node:child_process");
const { handler } = require("/var/task/lambda/lambda.js");
function event(path) {
  return {
    version: "2.0",
    routeKey: `GET ${path}`,
    rawPath: path,
    rawQueryString: "",
    headers: { host: "localhost" },
    requestContext: {
      accountId: "local",
      apiId: "smoke",
      domainName: "localhost",
      domainPrefix: "local",
      http: {
        method: "GET",
        path,
        protocol: "HTTP/1.1",
        sourceIp: "127.0.0.1",
        userAgent: "PackageCare smoke",
      },
      requestId: "smoke",
      routeKey: `GET ${path}`,
      stage: "$default",
      time: "",
      timeEpoch: Date.now(),
    },
    isBase64Encoded: false,
  };
}
(async () => {
  const context = { getRemainingTimeInMillis: () => 30000 };
  const session = await handler(event("/api/session"), context);
  assert.equal(session.statusCode, 200);
  assert.equal(JSON.parse(session.body).required, false);
  const home = await handler(event("/"), context);
  assert.equal(home.statusCode, 200);
  assert.match(home.body, /PackageCare/);
  // Exercise the actual runtime-client executable against a local Runtime API stand-in.
  // This validates our packaged entrypoint without deploying or making provider calls.
  let child, server, timeout;
  try {
    await new Promise((resolve, reject) => {
      let delivered = false;
      server = http.createServer((req, res) => {
        if (req.method === "GET" && req.url.endsWith("/invocation/next")) {
          if (delivered) return;
          delivered = true;
          res.writeHead(200, {
            "Content-Type": "application/json",
            "Lambda-Runtime-Aws-Request-Id": "smoke",
            "Lambda-Runtime-Deadline-Ms": String(Date.now() + 30000),
            "Lambda-Runtime-Invoked-Function-Arn":
              "arn:aws:lambda:us-east-1:000000000000:function:packagecare-smoke",
          });
          res.end(JSON.stringify(event("/api/session")));
        } else {
          const chunks = [];
          req.on("data", (c) => chunks.push(c));
          req.on("end", () => {
            res.writeHead(202, { "Content-Type": "application/json" });
            res.end("{}");
            try {
              const result = JSON.parse(Buffer.concat(chunks).toString());
              if (!req.url.endsWith("/smoke/response"))
                throw new Error(
                  `Runtime reported ${req.url}: ${JSON.stringify(result)}`,
                );
              assert.equal(result.statusCode, 200);
              resolve();
            } catch (e) {
              reject(e);
            }
          });
        }
      });
      server.listen(0, "127.0.0.1", () => {
        child = spawn("/var/task/entrypoint.sh", ["lambda/lambda.handler"], {
          cwd: "/var/task",
          env: {
            ...process.env,
            AWS_LAMBDA_RUNTIME_API: `127.0.0.1:${server.address().port}`,
            AWS_LAMBDA_FUNCTION_NAME: "packagecare-smoke",
            AWS_LAMBDA_FUNCTION_VERSION: "$LATEST",
            AWS_LAMBDA_FUNCTION_MEMORY_SIZE: "1024",
            AWS_LAMBDA_LOG_GROUP_NAME: "/aws/lambda/packagecare-smoke",
            AWS_LAMBDA_LOG_STREAM_NAME: "local-smoke",
            AWS_REGION: "us-east-1",
          },
          stdio: ["ignore", "pipe", "pipe"],
        });
        let logs = "";
        child.stdout.on("data", (c) => (logs += c));
        child.stderr.on("data", (c) => (logs += c));
        child.on("error", reject);
        child.on("exit", (code) => {
          if (code)
            reject(new Error(`Runtime exited ${code}: ${logs.slice(-3000)}`));
        });
      });
      timeout = setTimeout(
        () =>
          reject(
            new Error(
              "Packaged runtime did not return an invocation response within 30 seconds.",
            ),
          ),
        30000,
      );
    });
  } finally {
    clearTimeout(timeout);
    child?.kill("SIGTERM");
    server?.closeAllConnections();
    server?.close();
  }
  console.log(
    "Lambda image: packaged runtime client, HTTP adapter, and built frontend smoke checks passed. No live provider calls made.",
  );
})().catch((e) => {
  console.error(e.name, e.message);
  process.exitCode = 1;
});
