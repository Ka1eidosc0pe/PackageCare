import { awsConfig } from "./aws.js";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import {
  S3Client,
  HeadObjectCommand,
  CopyObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import type { Asset } from "../shared/domain.js";

export const uploadRequest = z
  .object({
    purpose: z.enum(["video", "photo"]),
    name: z.string().min(1).max(200),
    bytes: z
      .number()
      .int()
      .positive()
      .max(80 * 1024 * 1024),
    mime: z.enum([
      "video/mp4",
      "video/webm",
      "video/quicktime",
      "image/jpeg",
      "image/png",
      "image/webp",
    ]),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    deliveryId: z
      .string()
      .regex(/^[a-zA-Z0-9_-]+$/)
      .max(100)
      .optional(),
  })
  .superRefine((value, ctx) => {
    if (
      value.purpose === "photo"
        ? !value.mime.startsWith("image/") ||
          value.bytes > 10 * 1024 * 1024 ||
          !value.deliveryId
        : !value.mime.startsWith("video/") || !!value.deliveryId
    )
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Invalid file type, size or destination.",
      });
  });
const ticketSchema = z.object({
  id: z.string().uuid(),
  request: uploadRequest,
  expires: z.number().int(),
});
export type UploadTicket = z.infer<typeof ticketSchema>;

// A ticket binds one exact object, content digest and destination. It contains no AWS credentials.
export class CloudUploads {
  constructor(
    public bucket: string,
    private secret: string,
    public client = new S3Client(awsConfig()),
  ) {
    if (secret.length < 32)
      throw new Error(
        "Configure a stable SESSION_SECRET of at least 32 characters for cloud uploads.",
      );
  }
  private mac(payload: string) {
    return createHmac("sha256", this.secret).update(payload).digest("hex");
  }
  async authorize(input: unknown) {
    const request = uploadRequest.parse(input);
    const ticket: UploadTicket = {
      id: randomUUID(),
      request: {
        ...request,
        name: request.name.replace(/[^a-zA-Z0-9._-]/g, "_"),
      },
      expires: Date.now() + 300000,
    };
    const payload = Buffer.from(JSON.stringify(ticket)).toString("base64url");
    const checksum = Buffer.from(request.sha256, "hex").toString("base64");
    const post = await createPresignedPost(this.client, {
      Bucket: this.bucket,
      Key: `incoming/${ticket.id}`,
      Expires: 300,
      Fields: {
        "Content-Type": request.mime,
        "x-amz-checksum-algorithm": "SHA256",
        "x-amz-checksum-sha256": checksum,
        "x-amz-server-side-encryption": "AES256",
      },
      Conditions: [
        ["content-length-range", request.bytes, request.bytes],
        ["eq", "$Content-Type", request.mime],
        ["eq", "$x-amz-checksum-algorithm", "SHA256"],
        ["eq", "$x-amz-checksum-sha256", checksum],
        ["eq", "$x-amz-server-side-encryption", "AES256"],
      ],
    });
    return { ...post, ticket: `${payload}.${this.mac(payload)}` };
  }
  verify(token: string): UploadTicket {
    const [payload, signature, ...extra] = token.split(".");
    if (
      !payload ||
      !signature ||
      extra.length ||
      !/^[a-f0-9]{64}$/.test(signature) ||
      !timingSafeEqual(
        Buffer.from(signature, "hex"),
        Buffer.from(this.mac(payload), "hex"),
      )
    )
      throw Object.assign(
        new Error("Upload authorization is invalid. Choose the file again."),
        { status: 403 },
      );
    const ticket = ticketSchema.parse(
      JSON.parse(Buffer.from(payload, "base64url").toString("utf8")),
    );
    if (ticket.expires < Date.now())
      throw Object.assign(
        new Error("Upload authorization expired. Choose the file again."),
        { status: 410 },
      );
    return ticket;
  }
  async accept(ticket: UploadTicket): Promise<Asset> {
    const source = `incoming/${ticket.id}`,
      r = ticket.request;
    const object = await this.client.send(
      new HeadObjectCommand({
        Bucket: this.bucket,
        Key: source,
        ChecksumMode: "ENABLED",
      }),
    );
    if (
      object.ContentLength !== r.bytes ||
      object.ChecksumSHA256 !==
        Buffer.from(r.sha256, "hex").toString("base64") ||
      object.ContentType !== r.mime ||
      !object.ETag
    )
      throw new Error(
        "The uploaded file did not match its authorized size, type or checksum. Choose it again.",
      );
    const extension = r.mime
      .split("/")[1]
      .replace("quicktime", "mov")
      .replace("jpeg", "jpg");
    const key = `uploads/${ticket.id}.${extension}`;
    // Copy out of the short-lived incoming prefix before storing a durable delivery reference.
    await this.client.send(
      new CopyObjectCommand({
        Bucket: this.bucket,
        Key: key,
        CopySource: `${this.bucket}/${source}`,
        CopySourceIfMatch: object.ETag,
        ServerSideEncryption: "AES256",
      }),
    );
    return {
      id: ticket.id,
      key,
      name: r.purpose === "video" ? `original-${r.name}` : r.name,
      mime: r.mime,
      bytes: r.bytes,
      sha256: r.sha256,
      kind: r.purpose === "video" ? "video" : "damage",
    };
  }
  async discardIncoming(ticket: UploadTicket) {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: `incoming/${ticket.id}`,
      }),
    );
  }
}
