// Runs inside the built Linux image, with no account credentials or deployed resources.
const assert = require('node:assert/strict');
const { handler } = require('/var/task/lambda/lambda.js');
function event(path) {
  return { version:'2.0',routeKey:`GET ${path}`,rawPath:path,rawQueryString:'',headers:{host:'localhost'},requestContext:{accountId:'local',apiId:'smoke',domainName:'localhost',domainPrefix:'local',http:{method:'GET',path,protocol:'HTTP/1.1',sourceIp:'127.0.0.1',userAgent:'PackageCare smoke'},requestId:'smoke',routeKey:`GET ${path}`,stage:'$default',time:'',timeEpoch:Date.now()},isBase64Encoded:false };
}
(async()=>{
  const context={getRemainingTimeInMillis:()=>30000};
  const session=await handler(event('/api/session'),context);
  assert.equal(session.statusCode,200);assert.equal(JSON.parse(session.body).required,false);
  const home=await handler(event('/'),context);
  assert.equal(home.statusCode,200);assert.match(home.body,/PackageCare/);
  console.log('Lambda image: HTTP adapter and built frontend smoke checks passed. No live provider calls made.');
})().catch(e=>{console.error(e.name,e.message);process.exitCode=1;});
