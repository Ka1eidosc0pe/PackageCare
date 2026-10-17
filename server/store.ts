import { awsConfig } from "./aws.js";
import { promises as fs } from "node:fs";
import path from "node:path";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  ScanCommand,
  DeleteCommand,
} from "@aws-sdk/lib-dynamodb";
import type { Delivery } from "../shared/domain.js";

export interface Store {
  list(): Promise<Delivery[]>;
  get(id: string): Promise<Delivery | undefined>;
  change(id: string, fn: (current?: Delivery) => Delivery): Promise<Delivery>;
  remove(id: string): Promise<void>;
}
export class LocalStore implements Store {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(public root: string) {}
  private file(id: string) {
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error("Invalid identifier");
    return path.join(this.root, "records", `${id}.json`);
  }
  async get(id: string) {
    try {
      return JSON.parse(await fs.readFile(this.file(id), "utf8")) as Delivery;
    } catch (e: any) {
      if (e.code === "ENOENT") return undefined;
      throw e;
    }
  }
  async list() {
    await fs.mkdir(path.join(this.root, "records"), { recursive: true });
    const names = (await fs.readdir(path.join(this.root, "records"))).filter(
      (n) => n.endsWith(".json"),
    );
    return (await Promise.all(names.map((n) => this.get(n.slice(0, -5)))))
      .filter((x): x is Delivery => !!x)
      .sort((a, b) => b.observedAt.localeCompare(a.observedAt));
  }
  async change(id: string, fn: (current?: Delivery) => Delivery) {
    const result = this.queue.then(async () => {
      await fs.mkdir(path.join(this.root, "records"), { recursive: true });
      const old = await this.get(id),
        next = fn(old && structuredClone(old));
      if (old && JSON.stringify(old) === JSON.stringify(next)) return old;
      next.revision = (old?.revision ?? -1) + 1;
      const file = this.file(id),
        temp = `${file}.tmp`;
      await fs.writeFile(temp, JSON.stringify(next), { mode: 0o600 });
      await fs.rename(temp, file);
      return next;
    });
    this.queue = result.catch(() => {});
    return result;
  }
  async remove(id: string) {
    const result = this.queue.then(() => fs.rm(this.file(id), { force: true }));
    this.queue = result.catch(() => {});
    await result;
  }
}
export class CloudStore implements Store {
  private db = DynamoDBDocumentClient.from(new DynamoDBClient(awsConfig()), {
    marshallOptions: { removeUndefinedValues: true },
  });
  constructor(private table: string) {}
  async get(id: string) {
    return (
      await this.db.send(
        new GetCommand({
          TableName: this.table,
          Key: { id },
          ConsistentRead: true,
        }),
      )
    ).Item?.record as Delivery | undefined;
  }
  async list() {
    let cursor: any;
    const records: Delivery[] = [];
    do {
      const out = await this.db.send(
        new ScanCommand({
          TableName: this.table,
          ExclusiveStartKey: cursor,
          ConsistentRead: true,
        }),
      );
      records.push(...(out.Items ?? []).map((x) => x.record as Delivery));
      cursor = out.LastEvaluatedKey;
    } while (cursor);
    return records.sort((a, b) => b.observedAt.localeCompare(a.observedAt));
  }
  async change(id: string, fn: (current?: Delivery) => Delivery) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const old = await this.get(id),
        record = fn(old && structuredClone(old));
      if (old && JSON.stringify(old) === JSON.stringify(record)) return old;
      record.revision = (old?.revision ?? -1) + 1;
      if (Buffer.byteLength(JSON.stringify(record)) > 350000)
        throw new Error(
          "Record exceeds storage limit. Export and start a new case.",
        );
      try {
        await this.db.send(
          new PutCommand({
            TableName: this.table,
            Item: { id, revision: record.revision, record },
            ConditionExpression: old
              ? "revision = :r"
              : "attribute_not_exists(id)",
            ExpressionAttributeValues: old ? { ":r": old.revision } : undefined,
          }),
        );
        return record;
      } catch (e: any) {
        if (e.name !== "ConditionalCheckFailedException") throw e;
      }
    }
    throw Object.assign(new Error("Concurrent update. Try again."), {
      status: 409,
    });
  }
  async remove(id: string) {
    await this.db.send(
      new DeleteCommand({ TableName: this.table, Key: { id } }),
    );
  }
}
export const createStore = (root: string): Store =>
  process.env.PACKAGECARE_TABLE
    ? new CloudStore(process.env.PACKAGECARE_TABLE)
    : new LocalStore(root);
