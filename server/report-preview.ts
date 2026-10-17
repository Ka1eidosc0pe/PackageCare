import { createHmac, timingSafeEqual } from "node:crypto";
import type { Delivery, Report } from "../shared/domain.js";

// A receipt proves that this exact saved revision was served as a preview, not that a person read it.
export class ReportPreviews {
  constructor(private secret: string) {}
  private signature(payload: string) {
    return createHmac("sha256", this.secret).update(payload).digest("hex");
  }
  issue(d: Delivery, report: Report) {
    const payload = Buffer.from(
      JSON.stringify({
        id: d.id,
        revision: d.revision,
        fingerprint: report.fingerprint,
        expires: Date.now() + 600000,
      }),
    ).toString("base64url");
    return `${payload}.${this.signature(payload)}`;
  }
  verify(token: string | undefined, id: string, revision: number): string {
    const invalid = () =>
      Object.assign(
        new Error(
          "Open a fresh preview of your saved review before finalizing.",
        ),
        { status: 409 },
      );
    if (!token) throw invalid();
    const [payload, signature, ...extra] = token.split(".");
    if (
      !payload ||
      !signature ||
      extra.length ||
      !/^[a-f0-9]{64}$/.test(signature) ||
      !timingSafeEqual(
        Buffer.from(signature, "hex"),
        Buffer.from(this.signature(payload), "hex"),
      )
    )
      throw invalid();
    let receipt;
    try {
      receipt = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    } catch {
      throw invalid();
    }
    if (
      !receipt ||
      typeof receipt !== "object" ||
      receipt.id !== id ||
      receipt.revision !== revision ||
      !Number.isFinite(receipt.expires) ||
      receipt.expires < Date.now() ||
      !/^[a-f0-9]{64}$/.test(receipt.fingerprint)
    )
      throw invalid();
    return receipt.fingerprint;
  }
}
