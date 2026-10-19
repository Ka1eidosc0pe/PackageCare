import {
  createHash,
  createCipheriv,
  createDecipheriv,
  randomBytes,
  randomUUID,
} from "node:crypto";
import { z } from "zod";
import type { RingClient } from "./ring.js";

const ticketSchema = z.object({
  id: z.string().uuid(),
  deviceId: z.string().min(1).max(300),
  componentId: z.string().max(100).optional(),
  sessionUrl: z.string().url(),
  startedAt: z.number().int(),
  expiresAt: z.number().int(),
});
export class RingLive {
  constructor(
    private ring: RingClient,
    private secret: string,
  ) {}
  private key() {
    return createHash("sha256").update(this.secret).digest();
  }
  private seal(value: unknown) {
    const nonce = randomBytes(12),
      cipher = createCipheriv("aes-256-gcm", this.key(), nonce);
    const bytes = Buffer.concat([
      cipher.update(JSON.stringify(value), "utf8"),
      cipher.final(),
    ]);
    return [nonce, bytes, cipher.getAuthTag()]
      .map((part) => part.toString("base64url"))
      .join(".");
  }
  read(ticket: string) {
    let result: z.infer<typeof ticketSchema>;
    try {
      const parts = ticket.split(".");
      if (parts.length !== 3 || parts.some((p) => !/^[A-Za-z0-9_-]+$/.test(p)))
        throw new Error();
      const [nonce, bytes, tag] = parts.map((p) => Buffer.from(p, "base64url"));
      if (nonce.length !== 12 || tag.length !== 16) throw new Error();
      const decipher = createDecipheriv("aes-256-gcm", this.key(), nonce);
      decipher.setAuthTag(tag);
      const plaintext = Buffer.concat([
        decipher.update(bytes),
        decipher.final(),
      ]);
      result = ticketSchema.parse(JSON.parse(plaintext.toString("utf8")));
    } catch {
      throw Object.assign(
        new Error("Invalid live-view session. Start a new live view."),
        { status: 409 },
      );
    }
    if (Date.now() > result.expiresAt)
      throw Object.assign(
        new Error("Live-view session expired. Start a new live view."),
        { status: 409 },
      );
    return result;
  }
  async start(deviceId: string, offer: string, componentId?: string) {
    const devices = await this.ring.devices();
    if (!devices.some((d) => d.id === deviceId))
      throw Object.assign(
        new Error("Device is not in your connected Ring workspace."),
        { status: 403 },
      );
    const caps = await this.ring.capabilities(deviceId),
      components = caps?.attributes?.components?.items;
    if (
      components?.length &&
      !components.some((c: any) => c.component_id === componentId)
    )
      throw new Error("Select a valid camera component for this device.");
    const { answer, sessionUrl } = await this.ring.startLive(
      deviceId,
      offer,
      componentId,
    );
    const startedAt = Date.now();
    return {
      answer,
      ticket: this.seal({
        id: randomUUID(),
        deviceId,
        componentId,
        sessionUrl,
        startedAt,
        expiresAt: startedAt + 5 * 60_000,
      }),
      viewSeconds: 25,
    };
  }

  async close(ticket: string) {
    await this.ring.closeLive(this.read(ticket).sessionUrl);
  }
}
