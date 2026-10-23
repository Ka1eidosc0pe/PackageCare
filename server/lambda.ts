import serverlessExpress from "@codegenie/serverless-express";
import { createApp } from "./app.js";
import { createStore } from "./store.js";
import { MediaStore } from "./media.js";
import { PackageCare } from "./service.js";
import { analyzerFromEnv } from "./local-analysis.js";
const root = "/tmp/packagecare";
const media = new MediaStore(root);
// The API only dispatches to Step Functions; the analyzer here drives status labels.
const service = new PackageCare(createStore(root), media, undefined, analyzerFromEnv(media));
export const handler = serverlessExpress({ app: createApp(service) });
