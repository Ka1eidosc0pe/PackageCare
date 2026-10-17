import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
export class RingError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const ringEventSchema = z.object({
  meta: z.object({
    account_id: z.string(),
    request_id: z.string(),
    time: z.string(),
  }),
  data: z.object({
    id: z.string().min(1),
    type: z.string(),
    attributes: z.object({
      source: z.string().min(1),
      timestamp: z.number().int().positive(),
      component_ids: z.array(z.string()).optional(),
      sub_type: z.string().optional(),
    }),
  }),
});
export function verifySignature(
  raw: Buffer,
  signature: string | undefined,
  key: string,
) {
  if (!key || !signature) return false;
  const hex = signature.replace(/^sha256=/, "");
  if (!/^[a-f0-9]{64}$/i.test(hex)) return false;
  return timingSafeEqual(
    createHmac("sha256", key).update(raw).digest(),
    Buffer.from(hex, "hex"),
  );
}
export class RingClient {
  constructor(
    public token = process.env.RING_ACCESS_TOKEN || "",
    private transport: typeof fetch = fetch,
  ) {}
  async request(endpoint: string, body?: unknown) {
    if (!this.token)
      throw new RingError(401, "Connect Ring with a current Playground token.");
    const response = await this.transport(
      `https://api.amazonvision.com/v1/${endpoint}`,
      {
        method: body ? "POST" : "GET",
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
        redirect: "manual",
        signal: AbortSignal.timeout(30000),
      },
    );
    if (!response.ok && ![301, 302, 303, 307, 308].includes(response.status)) {
      if (response.status === 401) this.token = "";
      const messages: Record<number, string> = {
        401: "Ring token expired. Reconnect with a fresh token.",
        403: "Ring has not authorized this device or media.",
        404: "Ring device or recording not found.",
        416: "Recording not yet available for this time.",
        425: "Ring is still preparing the recording.",
        429: "Ring rate limit reached. Try again shortly.",
      };
      throw new RingError(
        response.status,
        messages[response.status] ||
          `Ring request failed (${response.status}).`,
      );
    }
    return response;
  }
  async devices() {
    return (
      await (await this.request("devices?include=status,capabilities")).json()
    ).data as any[];
  }
  async account() {
    return (await (await this.request("users/me")).json()).data;
  }
  async capabilities(device: string) {
    return (
      await (
        await this.request(`devices/${encodeURIComponent(device)}/capabilities`)
      ).json()
    ).data;
  }
  async events(device: string) {
    return (
      await (
        await this.request(
          `history/devices/${encodeURIComponent(device)}/events`,
        )
      ).json()
    ).data;
  }
  async clip(
    device: string,
    timestamp: number,
    duration: number,
    component?: string,
  ) {
    let response = await this.request(
      `devices/${encodeURIComponent(device)}/media/video/download`,
      {
        timestamp,
        duration,
        video_options: { codec: "avc", frame_rate: 25 },
        ...(component ? { components: [{ component_id: component }] } : {}),
      },
    );
    const mediaTimestamp = response.headers.get("x-media-timestamp");
    for (
      let i = 0;
      i < 4 && response.status >= 300 && response.status < 400;
      i++
    ) {
      const location = response.headers.get("location");
      if (!location) throw new Error("Ring returned an empty media redirect.");
      const url = new URL(location, "https://api.amazonvision.com");
      if (
        url.protocol !== "https:" ||
        !/(^|\.)(amazonvision\.com|amazonaws\.com|ring\.com)$/.test(
          url.hostname,
        )
      )
        throw new Error("Unsupported Ring media redirect host.");
      // Do not forward bearer credentials to the signed download URL.
      response = await this.transport(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(30000),
      });
    }
    if (!response.ok)
      throw new RingError(
        response.status,
        "Ring media could not be downloaded.",
      );
    if (!response.headers.get("content-type")?.includes("video/"))
      throw new Error("Ring returned unreadable or unsupported media.");
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Empty Ring recording.");
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 80 * 1024 * 1024) {
        await reader.cancel();
        throw new Error("Ring clip exceeds the 80 MB limit.");
      }
      chunks.push(value);
    }
    return {
      bytes: Buffer.concat(chunks),
      observedAt: new Date(
        Number(
          response.headers.get("x-media-timestamp") ||
            mediaTimestamp ||
            timestamp,
        ),
      ).toISOString(),
    };
  }
}
