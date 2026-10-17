import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { Asset } from "../shared/domain.js";
const run = promisify(execFile);
export class MediaStore {
  constructor(
    public root: string,
    public bucket = process.env.PACKAGECARE_BUCKET,
    public s3 = new S3Client({}),
  ) {}
  local(key: string) {
    if (!/^[a-zA-Z0-9_./-]+$/.test(key) || key.split("/").includes(".."))
      throw new Error("Invalid asset key");
    return path.join(this.root, "media", key);
  }
  async put(
    bytes: Buffer,
    name: string,
    mime: string,
    kind: Asset["kind"],
    offsetMs?: number,
    assetId: string = randomUUID(),
  ): Promise<Asset> {
    const id = assetId,
      extension =
        mime === "video/mp4"
          ? "mp4"
          : mime === "video/webm"
            ? "webm"
            : mime === "video/quicktime"
              ? "mov"
              : mime === "image/png"
                ? "png"
                : mime === "application/octet-stream"
                  ? "bin"
                  : mime === "image/webp"
                    ? "webp"
                    : "jpg";
    const key = `${id}.${extension}`;
    if (this.bucket)
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: bytes,
          ContentType: mime,
          ServerSideEncryption: "AES256",
        }),
      );
    else {
      await fs.mkdir(path.join(this.root, "media"), { recursive: true });
      await fs.writeFile(this.local(key), bytes, { mode: 0o600 });
    }
    return {
      id,
      key,
      name,
      mime,
      kind,
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      ...(offsetMs === undefined ? {} : { offsetMs }),
    };
  }
  async read(a: Asset) {
    return this.bucket
      ? Buffer.from(
          await (
            await this.s3.send(
              new GetObjectCommand({ Bucket: this.bucket, Key: a.key }),
            )
          ).Body!.transformToByteArray(),
        )
      : fs.readFile(this.local(a.key));
  }
  async url(a: Asset) {
    return this.bucket
      ? getSignedUrl(
          this.s3,
          new GetObjectCommand({ Bucket: this.bucket, Key: a.key }),
          { expiresIn: 120 },
        )
      : undefined;
  }
  async remove(a: Pick<Asset, "key">) {
    if (this.bucket)
      await this.s3.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: a.key }),
      );
    else await fs.rm(this.local(a.key), { force: true });
  }
  async *inventory(): AsyncGenerator<{ key: string; modifiedAt: number }> {
    if (this.bucket) {
      let cursor: string | undefined;
      do {
        const page = await this.s3.send(
          new ListObjectsV2Command({
            Bucket: this.bucket,
            ContinuationToken: cursor,
          }),
        );
        for (const object of page.Contents ?? [])
          if (object.Key && object.LastModified)
            yield {
              key: object.Key,
              modifiedAt: object.LastModified.getTime(),
            };
        cursor = page.IsTruncated ? page.NextContinuationToken : undefined;
        if (page.IsTruncated && !cursor)
          throw new Error(
            "Incomplete storage inventory; no cleanup was performed.",
          );
      } while (cursor);
    } else {
      const directory = path.join(this.root, "media");
      for (const entry of await fs
        .readdir(directory, { withFileTypes: true })
        .catch((error: any) => {
          if (error.code === "ENOENT") return [];
          throw error;
        }))
        if (entry.isFile()) {
          const info = await fs.stat(this.local(entry.name));
          yield { key: entry.name, modifiedAt: info.mtimeMs };
        }
    }
  }
  async exportBundle(reportId: string, bytes: Buffer) {
    if (!this.bucket) throw new Error("Cloud storage is not configured.");
    const key = `exports/${reportId}.zip`;
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: bytes,
        ContentType: "application/zip",
        ServerSideEncryption: "AES256",
      }),
    );
    return getSignedUrl(
      this.s3,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ResponseContentDisposition: `attachment; filename="PackageCare-${reportId}.zip"`,
      }),
      { expiresIn: 120 },
    );
  }
  async removeExport(reportId: string) {
    if (this.bucket)
      await this.s3.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: `exports/${reportId}.zip`,
        }),
      );
  }
}
export async function inspectVideo(file: string) {
  const { stdout } = await run(
    process.env.FFPROBE_PATH || "ffprobe",
    [
      "-v",
      "error",
      "-protocol_whitelist",
      "file,pipe",
      "-show_entries",
      "format=duration:stream=codec_type,width,height",
      "-of",
      "json",
      file,
    ],
    { timeout: 15000, maxBuffer: 100000 },
  );
  const info = JSON.parse(stdout),
    durationMs = Math.round(Number(info.format?.duration) * 1000);
  if (
    !Number.isFinite(durationMs) ||
    durationMs < 500 ||
    durationMs > 60000 ||
    !info.streams?.some((s: any) => s.codec_type === "video")
  )
    throw new Error("Use a playable video between 0.5 and 60 seconds.");
  return durationMs;
}
export async function prepareVideo(
  bytes: Buffer,
  media: MediaStore,
  name: string,
  sampleFrames?: number,
  sourceAsset?: Asset,
) {
  const tmp = path.join(media.root, "tmp", randomUUID());
  await fs.mkdir(tmp, { recursive: true });
  const input = path.join(tmp, "input.mp4"),
    output = path.join(tmp, "source.mp4");
  const saved: Asset[] = [];
  try {
    await fs.writeFile(input, bytes);
    const durationMs = await inspectVideo(input);
    // Normalize for reliable browser playback. Original input is retained as source, never silently overwritten.
    await run(
      process.env.FFMPEG_PATH || "ffmpeg",
      [
        "-v",
        "error",
        "-protocol_whitelist",
        "file,pipe",
        "-i",
        input,
        "-an",
        "-vf",
        "scale=w='trunc(min(1280,iw)/2)*2':h=-2",
        "-c:v",
        "libx264",
        "-preset",
        "fast",
        "-crf",
        "22",
        "-movflags",
        "+faststart",
        output,
      ],
      { timeout: 90000, maxBuffer: 100000 },
    );
    const original =
      sourceAsset ??
      (await media.put(bytes, `original-${name}`, videoMime(bytes), "video"));
    if (!sourceAsset) saved.push(original);
    const playback = await media.put(
      await fs.readFile(output),
      `playback-${name}`,
      "video/mp4",
      "video",
    );
    saved.push(playback);
    const frames: Asset[] = [];
    // Cover the whole clip; dense windows are chunked into <=5 images at the model boundary.
    const frameCount =
      sampleFrames ??
      Math.min(120, Math.max(5, Math.ceil((durationMs / 1000) * 4)));
    for (let i = 0; i < frameCount; i++) {
      const offsetMs = Math.min(
          durationMs - 100,
          Math.round((durationMs * (i + 0.5)) / frameCount),
        ),
        frame = path.join(tmp, `${i}.jpg`);
      await run(
        process.env.FFMPEG_PATH || "ffmpeg",
        [
          "-v",
          "error",
          "-ss",
          String(offsetMs / 1000),
          "-i",
          output,
          "-frames:v",
          "1",
          "-q:v",
          "3",
          frame,
        ],
        { timeout: 15000, maxBuffer: 100000 },
      );
      const extracted = await media.put(
        await fs.readFile(frame),
        `frame-${offsetMs}ms.jpg`,
        "image/jpeg",
        "frame",
        offsetMs,
      );
      frames.push(extracted);
      saved.push(extracted);
    }
    return { durationMs, assets: [original, playback, ...frames] };
  } catch {
    await Promise.allSettled(saved.map((a) => media.remove(a)));
    throw new Error(
      "The video could not be decoded. Use a playable clip between 0.5 and 60 seconds.",
    );
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
}
export function videoMime(bytes: Buffer) {
  return bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))
    ? "video/webm"
    : bytes.toString("ascii", 8, 12) === "qt  "
      ? "video/quicktime"
      : "video/mp4";
}
export function imageMime(b: Buffer): string {
  if (b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    return "image/png";
  if (b[0] === 255 && b[1] === 216 && b[2] === 255) return "image/jpeg";
  if (
    b.toString("ascii", 0, 4) === "RIFF" &&
    b.toString("ascii", 8, 12) === "WEBP"
  )
    return "image/webp";
  throw new Error("Upload a JPEG, PNG, or WebP photo.");
}
