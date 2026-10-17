import serverlessExpress from "@codegenie/serverless-express";
import { createApp } from "./app.js";
import { createStore } from "./store.js";
import { MediaStore } from "./media.js";
import { PackageCare } from "./service.js";
const root = "/tmp/packagecare";
const service = new PackageCare(createStore(root), new MediaStore(root));
export const handler = serverlessExpress({ app: createApp(service) });
