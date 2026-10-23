import { createHash, randomUUID } from "node:crypto";
import {
  type Assessment,
  type Asset,
  type Delivery,
  labels,
  type Observation,
  type Report,
  type Review,
  type Run,
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
// Text for CSS string literals (print page header): every non-alphanumeric character is hex-escaped.
const cssString = (s: unknown) =>
  `"${String(s ?? "").replace(/[^a-zA-Z0-9 .\-]/g, (c) => `\\${c.codePointAt(0)!.toString(16)} `)}"`;
const actionLabels: Record<Observation["label"], string> = {
  package_visible: "Package visible",
  controlled_placement: "Controlled placement",
  possible_airborne_release: "Possible airborne release",
  possible_drop: "Possible drop",
  landing_visible: "Landing visible",
  package_at_rest: "Package at rest",
  visibility_insufficient: "Visibility insufficient",
};
const assessmentTone: Record<Assessment, string> = {
  no_concern_observed: "ok",
  possible_rough_handling: "concern",
  unable_to_assess: "unclear",
};
const assessmentDetail: Record<Assessment, string> = {
  no_concern_observed:
    "A controlled placement was supported and no handling concern was supported.",
  possible_rough_handling:
    "At least one possible handling concern was supported by the verification pass.",
  unable_to_assess:
    "The available footage does not support a handling assessment either way.",
};
const damageLabels: Record<Review["damage"], string> = {
  unknown: "Not inspected / unknown",
  none_observed: "Recipient reports no damage observed",
  observed: "Recipient reports damage observed",
};
const damageTone: Record<Review["damage"], string> = {
  unknown: "unclear",
  none_observed: "ok",
  observed: "concern",
};
const decisionLabels: Record<Review["decisions"][string]["decision"], string> =
  {
    confirmed: "Confirmed by recipient",
    corrected: "Corrected by recipient",
    unresolved: "Unresolved",
    dismissed: "Dismissed by recipient",
  };
const providerLabel = (run: Run) =>
  ({
    scripted_fixture: "Scripted sample scenario (no model was run)",
    local_classifier:
      "Local video classifier trained on synthetic clips (runs on this computer)",
    bedrock: "Amazon Bedrock vision model",
  })[run.provider] ?? run.provider;
const brandMark = `<svg class="mark" viewBox="0 0 40 40" aria-hidden="true"><rect width="40" height="40" rx="12" fill="#0c6358"/><path d="m10 15 10-5 10 5v12l-10 5-10-5V15Zm0 0 10 5 10-5M20 20v12m-5-19 10 5" fill="none" stroke="#fff" stroke-width="2" stroke-linejoin="round"/></svg>`;
const styles = (pageHeader: string) => `
:root{--accent:#0c6358;--accent-soft:#e6f0ed;--ink:#1f332f;--muted:#5a6b65;--line:#dde4e0;--paper:#fff;--wash:#f5f8f6;--ok:#1d7a4f;--ok-soft:#e5f3eb;--concern:#a4520c;--concern-soft:#fbeedd;--unclear:#5f6b68;--unclear-soft:#eef1f0}
*{box-sizing:border-box}
html{background:#eef2f0}
body{margin:0;font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;color:var(--ink);-webkit-print-color-adjust:exact;print-color-adjust:exact}
.page{max-width:920px;margin:32px auto;background:var(--paper);padding:48px 56px 40px;border-radius:14px;box-shadow:0 1px 3px rgba(20,50,45,.08),0 12px 40px rgba(20,50,45,.06)}
a{color:var(--accent)}
h1{font-size:34px;line-height:1.15;letter-spacing:-.6px;margin:6px 0 4px}
h2{font-size:13px;letter-spacing:.09em;text-transform:uppercase;color:var(--accent);margin:44px 0 14px;padding-bottom:8px;border-bottom:2px solid var(--accent-soft);break-after:avoid}
h3{font-size:15px;margin:0 0 6px}
p{margin:0 0 10px}
small,.muted{color:var(--muted)}
.masthead{display:flex;justify-content:space-between;align-items:center;gap:16px;padding-bottom:18px;border-bottom:1px solid var(--line)}
.brand{display:flex;align-items:center;gap:10px;font-weight:750;color:var(--accent);font-size:16px}
.brand span{display:block;font-weight:500;color:var(--muted);font-size:12px;letter-spacing:.04em;text-transform:uppercase}
.mark{width:36px;height:36px;flex:none}
.meta-id{text-align:right;font-size:12px;color:var(--muted);line-height:1.5}
.meta-id code{font-size:11px}
.eyebrow{margin-top:28px;font-size:12px;font-weight:650;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
.facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:4px 24px;margin:16px 0 0;padding:0}
.facts div{padding:8px 0;border-top:1px solid var(--line)}
.facts dt{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
.facts dd{margin:2px 0 0;font-weight:550}
.banner{margin:20px 0 0;padding:12px 16px;border-radius:10px;border:1px solid;font-size:14px}
.banner.synthetic{background:#fff4d6;border-color:#e8c15a;color:#5c4300}
.banner.capture{background:var(--wash);border-color:var(--line)}
.summary{display:grid;grid-template-columns:1.4fr 1fr 1fr;gap:12px;margin-top:26px}
.card{border:1px solid var(--line);border-radius:12px;padding:16px 18px;background:var(--wash);break-inside:avoid}
.card .k{font-size:11px;letter-spacing:.07em;text-transform:uppercase;color:var(--muted);margin-bottom:6px}
.card .v{font-size:18px;font-weight:700;line-height:1.25;margin-bottom:6px}
.card p{font-size:13px;color:var(--muted);margin:0}
.card.ok{background:var(--ok-soft);border-color:#bcdcc9}.card.ok .v{color:var(--ok)}
.card.concern{background:var(--concern-soft);border-color:#eac9a2}.card.concern .v{color:var(--concern)}
.card.unclear{background:var(--unclear-soft);border-color:#d3dad7}.card.unclear .v{color:var(--unclear)}
.dot{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:8px;vertical-align:1px;background:currentColor}
.note{font-size:13px;color:var(--muted);margin:0 0 14px}
.frames{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:0;padding:0}
figure{margin:0;break-inside:avoid}
.frames figure{border:1px solid var(--line);border-radius:10px;overflow:hidden;background:var(--wash)}
.frames img{display:block;width:100%;aspect-ratio:16/10;object-fit:cover;background:#dfe6e3}
.frames figcaption{padding:6px 10px;font-size:12px;line-height:1.35}
.frames figcaption b{font-variant-numeric:tabular-nums;color:var(--accent)}
.timeline{border:1px solid var(--line);border-radius:12px;padding:14px 16px 8px;break-inside:avoid}
.timeline svg{display:block;width:100%;height:auto}
.legend{display:flex;flex-wrap:wrap;gap:16px;font-size:12px;color:var(--muted);margin:6px 0 4px}
.legend i{display:inline-block;width:14px;height:10px;border-radius:3px;margin-right:6px;vertical-align:0}
table{width:100%;border-collapse:collapse;font-size:14px}
th{font-size:11px;letter-spacing:.07em;text-transform:uppercase;color:var(--muted);text-align:left;padding:8px 10px;border-bottom:2px solid var(--line);font-weight:650}
td{text-align:left;padding:14px 10px;vertical-align:top;border-bottom:1px solid var(--line)}
tr{break-inside:avoid}
.time{white-space:nowrap;font-variant-numeric:tabular-nums;font-weight:600}
.label{font-weight:700}
.chip{display:inline-block;padding:1px 8px;border-radius:999px;font-size:12px;font-weight:600;border:1px solid;white-space:nowrap;margin:2px 0}
.chip.supported{color:var(--ok);background:var(--ok-soft);border-color:#bcdcc9}
.chip.ambiguous{color:var(--unclear);background:var(--unclear-soft);border-color:#d3dad7}
.chip.concern{color:var(--concern);background:var(--concern-soft);border-color:#eac9a2}
.chip.recipient{color:var(--accent);background:var(--accent-soft);border-color:#b8d4cc}
.voice{margin-top:8px;padding:8px 12px;border-left:3px solid var(--accent);background:var(--accent-soft);border-radius:0 8px 8px 0;font-size:13px}
.voice b{display:block;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--accent)}
.lim{margin-top:6px;font-size:12px;color:var(--muted)}
.evidence{font-size:12px;line-height:1.5;white-space:nowrap}
.statement{border:1px solid var(--line);border-radius:12px;padding:18px 20px;break-inside:avoid}
.statement dl{display:grid;grid-template-columns:150px 1fr;gap:6px 16px;margin:0 0 14px}
.statement dt{color:var(--muted);font-size:13px}
.statement dd{margin:0;font-weight:550}
.statement blockquote{margin:0;padding:12px 16px;background:var(--accent-soft);border-left:3px solid var(--accent);border-radius:0 8px 8px 0;white-space:pre-wrap}
.photos{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px}
.photos img{display:block;width:100%;max-height:260px;object-fit:contain;background:var(--wash);border:1px solid var(--line);border-radius:10px}
.photos figcaption{font-size:12px;color:var(--muted);margin-top:4px}
ul.limits{margin:0;padding-left:20px}ul.limits li{margin-bottom:6px}
.manifest td{font-size:12px;padding:8px 10px}
.manifest code{font:11px/1.4 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;overflow-wrap:anywhere;word-break:break-all}
.footer{margin-top:44px;padding-top:20px;border-top:1px solid var(--line);display:grid;grid-template-columns:1fr 1fr;gap:20px;font-size:13px;color:var(--muted);break-inside:avoid}
.footer h3{color:var(--ink);font-size:13px}
.footer ul{margin:0;padding-left:18px}
.footer .sent{grid-column:1/-1;font-weight:650;color:var(--ink);background:var(--wash);border:1px solid var(--line);border-radius:10px;padding:10px 14px}
video{width:100%}
@media (max-width:720px){.frames{grid-template-columns:repeat(2,1fr)}.page{padding:28px 20px;margin:0;border-radius:0}.summary,.footer{grid-template-columns:1fr}.masthead{flex-direction:column;align-items:flex-start}.meta-id{text-align:left}}
@page{margin:16mm 14mm 16mm;@top-left{content:${pageHeader};font:9pt -apple-system,"Segoe UI",Arial,sans-serif;color:#5a6b65}@bottom-right{content:"Page " counter(page) " of " counter(pages);font:9pt -apple-system,"Segoe UI",Arial,sans-serif;color:#5a6b65}}
@media print{html{background:none}body{font-size:10.5pt}.page{max-width:none;margin:0;padding:0;box-shadow:none;border-radius:0}h1{font-size:24pt}h2{margin-top:26px}video{display:none}a{color:inherit;text-decoration:none}.frames{grid-template-columns:repeat(4,1fr)}.summary{grid-template-columns:1.4fr 1fr 1fr}.footer{grid-template-columns:1fr 1fr}tr,figure,.card,.timeline,.statement{break-inside:avoid}thead{display:table-header-group}}
`;
function timelineSvg(
  observations: Observation[],
  durationMs: number,
  frames: Asset[],
) {
  const total = Math.max(
    durationMs,
    ...observations.map((o) => o.endMs),
    ...frames.map((f) => f.offsetMs ?? 0),
    1,
  );
  const W = 800,
    left = 180,
    right = 28,
    lane = 30,
    top = 30,
    span = W - left - right;
  const x = (ms: number) => left + (Math.min(ms, total) / total) * span;
  const H = top + Math.max(observations.length, 1) * lane + 34;
  const ticks = Math.min(10, Math.max(2, Math.round(total / 1000)));
  const tickMarks = Array.from({ length: ticks + 1 }, (_, i) => {
    const ms = (total * i) / ticks;
    return `<line x1="${x(ms)}" y1="${top - 6}" x2="${x(ms)}" y2="${H - 28}" stroke="#e4eae7"/><text x="${x(ms)}" y="${H - 10}" text-anchor="middle" font-size="12" fill="#5a6b65">${escape(timecode(ms))}</text>`;
  }).join("");
  const rows = observations
    .map((o, i) => {
      const y = top + i * lane;
      const x0 = x(o.startMs),
        w = Math.max(6, x(o.endMs) - x0);
      const fill =
        o.verification === "ambiguous"
          ? "url(#hatch)"
          : o.concern
            ? "#c26a1b"
            : "#0c6358";
      return `<text x="${left - 12}" y="${y + 15}" text-anchor="end" font-size="13" fill="#1f332f">${escape(actionLabels[o.label] ?? o.label)}</text><rect x="${left}" y="${y + 4}" width="${span}" height="16" rx="4" fill="#f2f5f4"/><rect x="${x0}" y="${y + 4}" width="${w}" height="16" rx="4" fill="${fill}"${o.verification === "ambiguous" ? ' stroke="#8a9692"' : ""}><title>${escape(`${actionLabels[o.label] ?? o.label}: ${timecode(o.startMs)}–${timecode(o.endMs)}`)}</title></rect>`;
    })
    .join("");
  const frameMarks = frames
    .map(
      (f) =>
        `<path d="M${x(f.offsetMs ?? 0) - 5} ${top - 16} h10 l-5 7 z" fill="#0c6358"><title>${escape(`Key frame ${timecode(f.offsetMs ?? 0)}`)}</title></path>`,
    )
    .join("");
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Clip timeline of reviewed observations"><defs><pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#e3e8e6"/><line x1="0" y1="0" x2="0" y2="6" stroke="#8a9692" stroke-width="2"/></pattern></defs>${frames.length ? `<text x="${left - 12}" y="${top - 9}" text-anchor="end" font-size="11" fill="#5a6b65">Key frames</text>` : ""}${tickMarks}${frameMarks}${rows || `<text x="${left}" y="${top + 15}" font-size="13" fill="#5a6b65">No reviewed observations to place on the timeline.</text>`}<line x1="${left}" y1="${H - 28}" x2="${W - right}" y2="${H - 28}" stroke="#9aa8a3"/></svg>`;
}
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
  const fixture = r.delivery.source === "fixture";
  const observations = r.analysis.observations.filter(
    (o) =>
      o.verification !== "rejected" &&
      r.review.decisions[o.id]?.decision !== "dismissed",
  );
  const previewMeta =
    previewAuthorization && !standalone
      ? `<meta name="packagecare-preview" content="${escape(previewAuthorization)}">`
      : "";
  const observed = new Date(r.delivery.observedAt);
  const validDate = !Number.isNaN(observed.getTime());
  const localTime = validDate
    ? observed.toLocaleString("en-US", {
        dateStyle: "medium",
        timeStyle: "long",
      })
    : r.delivery.observedAt;
  const utcTime = validDate ? observed.toISOString() : r.delivery.observedAt;
  // Key frames: frame evidence cited by observations kept in the report, capped to keep the strip legible.
  // When observations cite only the video, fall back to extracted frames inside their windows (labelled as such).
  const cited = [...new Set(observations.flatMap((o) => o.evidenceIds))]
    .map((id) => r.assets.find((a) => a.id === id))
    .filter((a): a is Asset => a?.kind === "frame");
  const framesCited = cited.length > 0;
  const citedFrames = (
    framesCited
      ? cited
      : r.assets.filter(
          (a) =>
            a.kind === "frame" &&
            a.offsetMs !== undefined &&
            observations.some(
              (o) => a.offsetMs! >= o.startMs && a.offsetMs! <= o.endMs,
            ),
        )
  ).sort((a, b) => (a.offsetMs ?? 0) - (b.offsetMs ?? 0));
  const maxFrames = 8;
  const keyFrames =
    citedFrames.length <= maxFrames
      ? citedFrames
      : Array.from(
          { length: maxFrames },
          (_, i) =>
            citedFrames[
              Math.round((i * (citedFrames.length - 1)) / (maxFrames - 1))
            ],
        );
  // Review state
  const decided = r.analysis.observations.filter(
    (o) => o.verification !== "rejected",
  );
  const counts = { confirmed: 0, corrected: 0, dismissed: 0, unresolved: 0 };
  let unreviewed = 0;
  for (const o of decided) {
    const d = r.review.decisions[o.id]?.decision;
    if (d) counts[d]++;
    else unreviewed++;
  }
  const reviewParts = [
    counts.confirmed && `${counts.confirmed} confirmed`,
    counts.corrected && `${counts.corrected} corrected`,
    counts.dismissed && `${counts.dismissed} dismissed`,
    counts.unresolved && `${counts.unresolved} unresolved`,
    unreviewed && `${unreviewed} not individually reviewed`,
  ].filter(Boolean);
  const concernsDismissed =
    r.analysis.assessment === "possible_rough_handling" &&
    !decided.some(
      (o) =>
        o.concern &&
        o.verification === "supported" &&
        r.review.decisions[o.id]?.decision !== "dismissed",
    );
  const tone = assessmentTone[r.analysis.assessment] ?? "unclear";
  // Provenance: unique provider/model pairs from the analysis runs that completed.
  const seen = new Set<string>();
  const providers = r.runs
    .filter((run) => !run.failure)
    .filter((run) => {
      const k = `${run.provider}|${run.model}`;
      return seen.has(k) ? false : (seen.add(k), true);
    })
    .map(
      (run) =>
        `<li>${escape(providerLabel(run))}${run.provider === "scripted_fixture" ? "" : ` — model <code>${escape(run.model)}</code>`}${run.promptVersion ? ` · ${escape(run.promptVersion)}` : ""}</li>`,
    )
    .join("");
  const videos = r.assets.filter((a) => a.kind === "video");
  const photos = r.assets.filter((a) => a.kind === "damage");
  const pageHeader = cssString(
    `PackageCare report · ${r.delivery.title} · v${r.version}`,
  );
  const rows = observations
    .map((o) => {
      const review = r.review.decisions[o.id];
      const statementLabel =
        review?.decision === "corrected"
          ? "Recipient correction"
          : "Recipient statement";
      return `<tr><td class="time">${timecode(o.startMs)}–${timecode(o.endMs)}</td><td><div class="label">${escape(actionLabels[o.label] ?? o.label)}</div>${o.concern ? '<span class="chip concern">Handling concern</span>' : ""}</td><td><div>${escape(o.description)}</div>${o.limitations.length ? `<div class="lim">Limitations: ${escape(o.limitations.join(" "))}</div>` : ""}</td><td><span class="chip ${escape(o.verification)}">${fixture ? "Scripted evidence" : "Model evidence"}: ${escape(o.verification)}</span><br><span class="chip recipient">Recipient review: ${escape(review ? decisionLabels[review.decision] : "Not individually reviewed")}</span>${review?.statement ? `<div class="voice"><b>${statementLabel}</b>${escape(review.statement)}</div>` : ""}</td><td class="evidence">${o.evidenceIds.map((id) => `<a href="${assetUrl(id)}">${escape(r.assets.find((a) => a.id === id)?.name || id)}</a>`).join("<br>")}</td></tr>`;
    })
    .join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${previewMeta}<title>PackageCare report ${escape(r.delivery.id)}</title><style>${styles(pageHeader)}</style></head><body><main class="page">
<header class="masthead"><div class="brand">${brandMark}<div>PackageCare<span>Delivery handling record</span></div></div><div class="meta-id">Report <code>${escape(r.id)}</code><br>Version ${r.version} · Generated ${escape(r.createdAt)}</div></header>
<div class="eyebrow">Incident report</div><h1>${escape(r.delivery.title)}</h1>
<dl class="facts"><div><dt>Observed (local)</dt><dd>${escape(localTime)}</dd></div><div><dt>Observed (UTC)</dt><dd>${escape(utcTime)} (UTC)</dd></div><div><dt>Source</dt><dd>${escape(sourceLabels[r.delivery.source])}${r.delivery.camera && r.delivery.camera !== sourceLabels[r.delivery.source] ? ` · ${escape(r.delivery.camera)}` : ""}</dd></div><div><dt>Clip length</dt><dd>${escape(timecode(r.delivery.durationMs))}</dd></div><div><dt>Shipment</dt><dd>${escape(r.review.shipment || "Not provided")}</dd></div>${r.delivery.eventId ? `<div><dt>Event ID</dt><dd>${escape(r.delivery.eventId)}</dd></div>` : ""}</dl>
${fixture ? '<p class="banner synthetic"><strong>SYNTHETIC SAMPLE — scripted observations; not a real delivery or model result.</strong></p>' : ""}${r.delivery.capture ? '<p class="banner capture">Browser recording from Ring live view. This file was recorded by the client browser; it is not a native Ring recording download or a provider attestation of the captured bytes. The recorded source file is preserved unchanged.</p>' : ""}
<section class="summary" aria-label="Summary"><div class="card ${tone}"><div class="k">${fixture ? "Scripted" : "Automated"} handling assessment</div><div class="v"><span class="dot"></span>${escape(labels[r.analysis.assessment] ?? r.analysis.assessment)}</div><p>${escape(assessmentDetail[r.analysis.assessment] ?? "")}${concernsDismissed ? " The recipient dismissed the observation(s) behind this assessment." : ""} An observation, not a determination of intent or responsibility.</p></div><div class="card ${damageTone[r.review.damage]}"><div class="k">Damage (recipient-reported)</div><div class="v">${escape(damageLabels[r.review.damage])}</div><p>${photos.length ? `${photos.length} recipient photo${photos.length === 1 ? "" : "s"} attached.` : "No photos supplied."} Recorded separately from footage observations.</p></div><div class="card"><div class="k">Recipient review</div><div class="v">${r.review.complete ? "Review complete" : "Review incomplete"}</div><p>${escape(reviewParts.join(" · ") || "No observations to review.")}${r.review.updatedAt ? `<br>Saved ${escape(r.review.updatedAt)}` : ""}</p></div></section>
<h2>Key frames</h2>${
    keyFrames.length
      ? `<p class="note">${framesCited ? "Frames extracted from the source footage and cited by the reviewed observations below" : "The reviewed observations cite the source video rather than individual frames; these are frames extracted from the source footage within the reviewed observation windows"}${citedFrames.length > keyFrames.length ? ` (${keyFrames.length} of ${citedFrames.length} shown; all are listed in the evidence manifest)` : ""}.</p><div class="frames">${keyFrames.map((f) => `<figure><a href="${assetUrl(f.id)}"><img src="${assetUrl(f.id)}" alt="${escape(`Frame at ${timecode(f.offsetMs ?? 0)}`)}"></a><figcaption><b>${escape(timecode(f.offsetMs ?? 0))}</b><br>${escape(f.name)}</figcaption></figure>`).join("")}</div>`
      : '<p class="note">No frame evidence is cited by the reviewed observations.</p>'
  }
<h2>Timeline</h2><div class="timeline">${timelineSvg(observations, r.delivery.durationMs, keyFrames)}<div class="legend"><span><i style="background:#0c6358"></i>Supported observation</span><span><i style="background:#c26a1b"></i>Supported handling concern</span><span><i style="background:repeating-linear-gradient(45deg,#8a9692 0 2px,#e3e8e6 2px 5px)"></i>Ambiguous</span><span>▼ Key frame</span></div></div>
<h2>Reviewed observations</h2><p class="note">Descriptions are observations from available footage, not determinations of intent or responsibility. Damage is recorded separately by the recipient. Observations the recipient dismissed, and observations rejected by verification, are not shown.</p><table><thead><tr><th>Clip time</th><th>Label</th><th>Observation</th><th>Verification &amp; recipient review</th><th>Evidence</th></tr></thead><tbody>${rows || '<tr><td colspan="5" class="muted">No observations remain after recipient review.</td></tr>'}</tbody></table>
<h2>Shipment &amp; recipient statement</h2><div class="statement"><dl><dt>Shipment</dt><dd>${escape(r.review.shipment || "Not provided")}</dd><dt>Damage</dt><dd>${escape(damageLabels[r.review.damage])}</dd></dl><blockquote><b class="muted" style="display:block;font-size:11px;letter-spacing:.06em;text-transform:uppercase">In the recipient's words</b>${escape(r.review.notes || "No additional recipient statement.")}</blockquote></div>
<h2>Recipient photos</h2>${photos.length ? `<div class="photos">${photos.map((a) => `<figure><img src="${assetUrl(a.id)}" alt="Recipient-provided damage photo"><figcaption>${escape(a.name)} — recipient-provided</figcaption></figure>`).join("")}</div>` : "<p>None supplied.</p>"}
<h2>Source footage</h2>${videos.map((a) => `<p><a href="${assetUrl(a.id)}">${escape(a.name)}</a> <small>· ${a.bytes} bytes</small></p>`).join("") || "<p>None.</p>"}
<h2>Limitations</h2><ul class="limits">${r.analysis.limitations.map((l) => `<li>${escape(l)}</li>`).join("")}</ul>
<h2>Evidence manifest</h2><p class="note">Hashes identify supplied files; they do not establish a legal chain of custody.</p><table class="manifest"><thead><tr><th>File</th><th>Kind</th><th>Bytes</th><th>SHA-256</th></tr></thead><tbody>${r.assets.map((a) => `<tr><td>${escape(a.name)}${a.offsetMs !== undefined ? ` <small>@ ${escape(timecode(a.offsetMs))}</small>` : ""}</td><td>${escape(a.kind)}</td><td>${a.bytes}</td><td><code>SHA-256 ${escape(a.sha256)}</code></td></tr>`).join("")}</tbody></table>
<footer class="footer"><div><h3>What PackageCare is</h3><p>A tool that helps a recipient review doorbell footage of a delivery, check automated observations against the frames, and record their own statement and damage report in one shareable file.</p></div><div><h3>What it is not</h3><ul><li>Not a determination of intent, fault, or responsibility.</li><li>Not an identification of any person.</li><li>Not a carrier claim, and not a legal chain of custody.</li></ul></div><div><h3>Analysis provider</h3>${providers ? `<ul>${providers}</ul>` : "<p>Not recorded.</p>"}</div><div><h3>Report integrity</h3><p>Fingerprint <code style="font-size:11px;overflow-wrap:anywhere">${escape(r.fingerprint)}</code></p></div><p class="sent">Nothing was sent automatically. Prepared for recipient review and sharing. No report has been submitted to a carrier or Amazon.</p></footer>
</main></body></html>`;
}
