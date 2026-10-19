import { createHash, randomUUID } from "node:crypto";
import {
  type Delivery,
  type Report,
  sourceLabels,
  timecode,
} from "../shared/domain.js";
const fingerprintOf = (value: unknown) =>
  createHash("sha256")
    .update(
      JSON.stringify(value, (_key, value) =>
        value && typeof value === "object" && !Array.isArray(value)
          ? Object.fromEntries(
              Object.keys(value)
                .sort()
                .map((key) => [key, value[key]]),
            )
          : value,
      ),
    )
    .digest("hex");
export function snapshot(d: Delivery): Report {
  if (d.state !== "ready" || !d.analysis || !d.review.complete)
    throw Object.assign(
      new Error("Complete recipient review before finalizing a report."),
      { status: 409 },
    );
  const basis = {
    delivery: {
      id: d.id,
      title: d.title,
      camera: d.camera,
      source: d.source,
      observedAt: d.observedAt,
      durationMs: d.durationMs,
      eventId: d.eventId,
      ...(d.capture ? { capture: d.capture } : {}),
    },
    analysis: d.analysis,
    review: d.review,
    assets: d.assets,
    runs: d.runs,
  };
  const fingerprint = fingerprintOf(basis);
  // Preserve existing frozen reports written before canonical fingerprints were introduced.
  const previous = d.reports.find(
    (r) =>
      r.fingerprint === fingerprint ||
      fingerprintOf({
        delivery: r.delivery,
        analysis: r.analysis,
        review: r.review,
        assets: r.assets,
        runs: r.runs,
      }) === fingerprint,
  );
  if (previous) return previous;
  return structuredClone({
    id: randomUUID(),
    version: d.reports.length + 1,
    createdAt: new Date().toISOString(),
    fingerprint,
    ...basis,
  });
}
export const escape = (s: unknown) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function renderReport(
  r: Report,
  standalone = false,
  previewAuthorization?: string,
) {
  const assetUrl = (id: string) =>
    standalone
      ? `evidence/${id}.${r.assets
          .find((a) => a.id === id)
          ?.key.split(".")
          .pop()}`
      : `/api/deliveries/${r.delivery.id}/assets/${id}`;
  const observations = r.analysis.observations.filter(
    (o) =>
      o.verification !== "rejected" &&
      r.review.decisions[o.id]?.decision !== "dismissed",
  );
  const previewMeta =
    previewAuthorization && !standalone
      ? `<meta name="packagecare-preview" content="${escape(previewAuthorization)}">`
      : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">${previewMeta}<title>PackageCare report ${escape(r.delivery.id)}</title><style>body{font:15px/1.65 system-ui,sans-serif;color:#253c38;max-width:900px;margin:45px auto;padding:0 24px}h1{font-size:38px;letter-spacing:-1px}h2{font-size:19px;border-bottom:1px solid #d5ddd8;padding-bottom:10px;margin-top:34px}small{color:#52645d}.brand{font-weight:750;color:#0c6358}table{width:100%;border-collapse:collapse}td,th{text-align:left;padding:12px 8px;vertical-align:top;border-bottom:1px solid #e1e6e2}img{max-width:100%;max-height:250px}video{width:100%}code{font-size:10px;overflow-wrap:anywhere}a{color:#0c6358}@media print{video{display:none}h2{break-after:avoid}tr{break-inside:avoid}}</style></head><body><div class="brand">PackageCare / Delivery handling record</div><h1>${escape(r.delivery.title)}</h1><p>${escape(sourceLabels[r.delivery.source])} · ${escape(r.delivery.camera)}<br>${escape(new Date(r.delivery.observedAt).toISOString())} (UTC)</p>${r.delivery.source === "fixture" ? "<p><strong>SYNTHETIC SAMPLE — scripted observations; not a real delivery or model result.</strong></p>" : ""}${r.delivery.capture ? "<p>Browser recording from Ring live view. This file was recorded by the client browser; it is not a native Ring recording download or a provider attestation of the captured bytes. The recorded source file is preserved unchanged.</p>" : ""}<small>Report ${escape(r.id)} · Version ${r.version} · Generated ${escape(r.createdAt)}</small><h2>Shipment & recipient statement</h2><p>Shipment: ${escape(r.review.shipment || "Not provided")}<br>Damage: ${escape({ unknown: "Not inspected / unknown", none_observed: "Recipient reports no damage observed", observed: "Recipient reports damage observed" }[r.review.damage])}</p><p>${escape(r.review.notes || "No additional recipient statement.")}</p><h2>Reviewed observations</h2><p>Descriptions are observations from available footage, not determinations of intent or responsibility. Damage is recorded separately by the recipient.</p><table><thead><tr><th>Clip time</th><th>Observation</th><th>Evidence</th></tr></thead><tbody>${observations
    .map((o) => {
      const review = r.review.decisions[o.id];
      return `<tr><td>${timecode(o.startMs)}–${timecode(o.endMs)}</td><td><strong>${escape(o.description)}</strong><br>${r.delivery.source === "fixture" ? "Scripted evidence" : "Model evidence"}: ${escape(o.verification)}<br>Recipient review: ${escape(review?.decision || "Not individually reviewed")}${review?.statement ? `<br>Recipient statement: ${escape(review.statement)}` : ""}${o.limitations.length ? `<br>${escape(o.limitations.join(" "))}` : ""}</td><td>${o.evidenceIds.map((id) => `<a href="${assetUrl(id)}">${escape(r.assets.find((a) => a.id === id)?.name || id)}</a>`).join("<br>")}</td></tr>`;
    })
    .join("")}</tbody></table><h2>Source footage</h2>${r.assets
    .filter((a) => a.kind === "video")
    .map((a) => `<p><a href="${assetUrl(a.id)}">${escape(a.name)}</a></p>`)
    .join("")}<h2>Recipient photos</h2>${
    r.assets
      .filter((a) => a.kind === "damage")
      .map(
        (a) =>
          `<figure><img src="${assetUrl(a.id)}" alt="Recipient-provided damage photo"><figcaption>${escape(a.name)} — recipient-provided</figcaption></figure>`,
      )
      .join("") || "<p>None supplied.</p>"
  }<h2>Limitations</h2><ul>${r.analysis.limitations.map((l) => `<li>${escape(l)}</li>`).join("")}</ul><h2>Evidence manifest</h2><p>Hashes identify supplied files; they do not establish a legal chain of custody.</p>${r.assets.map((a) => `<p>${escape(a.name)} · ${a.bytes} bytes<br><code>SHA-256 ${escape(a.sha256)}</code></p>`).join("")}<small>Prepared for recipient review and sharing. No report has been submitted to a carrier or Amazon.</small></body></html>`;
}
