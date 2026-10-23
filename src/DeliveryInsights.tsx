import React, { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Check,
  Eye,
  Loader2,
  Pause,
  Repeat,
  ChevronRight,
} from "lucide-react";
import {
  type Delivery,
  type Observation,
  type Run,
  timecode,
} from "../shared/domain";

export interface ClassifierRaw {
  classes: string[];
  clip_probs: Record<string, number>;
  windows: { start_ms: number; end_ms: number; probs: Record<string, number> }[];
  duration_ms: number;
  model_id?: string;
}

// Mirrors server/local-analysis.ts THRESHOLDS (display only).
const CLIP_THRESHOLD = 0.6;
const SUPPORTED_THRESHOLD = 0.8;

export function strengthWord(score: number) {
  return score >= SUPPORTED_THRESHOLD
    ? "Strong"
    : score >= CLIP_THRESHOLD
      ? "Moderate"
      : "Weak";
}

/** Latest local-classifier observe run with usable raw windows, if any. */
export function classifierRun(
  d: Delivery,
): { run: Run; raw: ClassifierRaw } | undefined {
  // The latest successful run may be the verify passthrough; its observe run
  // (which carries the raw scores) comes just before it.
  const latest = [...d.runs].reverse().find((r) => r.proposal || r.verification);
  if (latest?.provider !== "local_classifier") return undefined;
  const observe = [...d.runs]
    .reverse()
    .find((r) => r.provider === "local_classifier" && r.raw);
  const raw = observe?.raw as ClassifierRaw | undefined;
  if (
    !observe ||
    !raw ||
    !Array.isArray(raw.windows) ||
    !raw.windows.length ||
    !raw.clip_probs
  )
    return undefined;
  return { run: observe, raw };
}

/** Rewrites older stored descriptions that embedded raw scores. */
export function plainDescription(text: string) {
  return text
    .replace(
      /\s*\(clip score [\d.]+, peak window score ([\d.]+)\)\./,
      (_, peak) =>
        `. ${strengthWord(Number(peak))} signal in the highlighted 2-second window.`,
    )
    .replace(/\s*\(scores: [^)]*\)/, "");
}

const pretty = (label: string) =>
  label.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());

/** The observation the verdict and replay refer to. */
export function keyMoment(d: Delivery): Observation | undefined {
  const obs = d.analysis?.observations.filter(
    (o) => o.verification !== "rejected",
  );
  if (!obs?.length) return undefined;
  const fullClip = (o: Observation) =>
    o.startMs <= 0 && o.endMs >= d.durationMs - 1;
  return (
    obs.find((o) => o.concern) ||
    obs.find((o) => o.label === "controlled_placement") ||
    obs.find((o) => o.verification === "ambiguous" && !fullClip(o)) ||
    obs.find((o) => !fullClip(o) && o.label !== "package_visible")
  );
}

export function VerdictBanner({
  d,
  moment,
  replaying,
  onReplay,
}: {
  d: Delivery;
  moment?: Observation;
  replaying: boolean;
  onReplay: () => void;
}) {
  if (!d.analysis || d.state !== "ready") return null;
  const a = d.analysis.assessment;
  const classifier = classifierRun(d);
  const content = {
    possible_rough_handling: {
      icon: <AlertTriangle size={20} />,
      title: "Possible rough handling",
      line: moment
        ? `${pretty(moment.label)} flagged between ${timecode(moment.startMs)} and ${timecode(moment.endMs)}. Watch it before deciding.`
        : "A handling concern was flagged. Watch the footage before deciding.",
    },
    no_concern_observed: {
      icon: <CheckCircle2 size={20} />,
      title: "No concern observed",
      line: moment
        ? `${pretty(moment.label)} seen between ${timecode(moment.startMs)} and ${timecode(moment.endMs)}.`
        : "No handling concern was flagged in this clip.",
    },
    unable_to_assess: {
      icon: <Eye size={20} />,
      title: "Unable to assess",
      line: moment
        ? `The clearest moment is ${timecode(moment.startMs)}–${timecode(moment.endMs)}, but the evidence is not conclusive. Review it yourself.`
        : "The footage does not clearly show how the package was handled. Review it yourself.",
    },
  }[a];
  return (
    <section
      className={`verdict ${a}`}
      aria-label="Handling assessment"
      aria-live="polite"
    >
      <span className="verdict-icon" aria-hidden="true">
        {content.icon}
      </span>
      <div className="verdict-body">
        <div className="verdict-title">
          <h3>{content.title}</h3>
          {d.source === "fixture" && (
            <span className="verdict-chip">Synthetic sample · scripted</span>
          )}
          {classifier && (
            <span className="verdict-chip">Classifier · synthetic-trained</span>
          )}
        </div>
        <p>{content.line}</p>
        {classifier && <ScoreDetails raw={classifier.raw} moment={moment} />}
      </div>
      {moment && (
        <button
          className={`button verdict-replay ${replaying ? "on" : ""}`}
          aria-pressed={replaying}
          onClick={onReplay}
        >
          {replaying ? <Pause size={15} /> : <Repeat size={15} />}
          {replaying ? "Stop replay" : "Replay moment"}
          <small>{replaying ? "Back to 1×" : "Loop at 0.5×"}</small>
        </button>
      )}
    </section>
  );
}

function ScoreDetails({
  raw,
  moment,
}: {
  raw: ClassifierRaw;
  moment?: Observation;
}) {
  const peakFor = (c: string) =>
    raw.windows.reduce((best, w) =>
      (w.probs[c] ?? 0) > (best.probs[c] ?? 0) ? w : best,
    );
  const shown = ["rough", "placement", "none"].filter((c) =>
    raw.classes.includes(c),
  );
  const name: Record<string, string> = {
    rough: "Toss / drop",
    placement: "Placement",
    none: "Neither",
  };
  return (
    <details className="why">
      <summary>
        Why? <ChevronRight size={13} />
      </summary>
      <p>
        These are raw classifier scores from 0 to 1. They are{" "}
        <strong>not calibrated probabilities</strong> and the model was
        trained only on synthetic clips. A clip is flagged when its clip score
        reaches {CLIP_THRESHOLD.toFixed(2)}; a window scoring{" "}
        {SUPPORTED_THRESHOLD.toFixed(2)} or more counts as a strong signal.
      </p>
      <table>
        <thead>
          <tr>
            <th scope="col">Class</th>
            <th scope="col">Whole clip</th>
            <th scope="col">Peak window</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((c) => {
            const w = peakFor(c);
            return (
              <tr key={c}>
                <th scope="row">{name[c] || c}</th>
                <td>{(raw.clip_probs[c] ?? 0).toFixed(2)}</td>
                <td>
                  {(w.probs[c] ?? 0).toFixed(2)}{" "}
                  <small>
                    at {timecode(w.start_ms)}–{timecode(w.end_ms)}
                  </small>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {moment && (
        <p className="why-foot">
          Highlighted segment: {timecode(moment.startMs)}–
          {timecode(moment.endMs)} ({raw.windows.length} windows scored).
        </p>
      )}
    </details>
  );
}

export function ActivityTrack({
  raw,
  durationMs,
  positionMs,
  observations,
  onSeek,
}: {
  raw: ClassifierRaw;
  durationMs: number;
  positionMs: number;
  observations: Observation[];
  onSeek: (ms: number) => void;
}) {
  const dur = Math.max(1, durationMs || raw.duration_ms);
  const W = 1000,
    H = 100,
    pad = 6;
  const x = (ms: number) => (Math.min(dur, Math.max(0, ms)) / dur) * W;
  const y = (p: number) => pad + (1 - p) * (H - pad * 2);
  const pts = raw.windows.map((w) => ({
    t: (w.start_ms + w.end_ms) / 2,
    rough: w.probs.rough ?? 0,
    placement: w.probs.placement ?? 0,
  }));
  const line = (k: "rough" | "placement") =>
    pts
      .map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p[k]).toFixed(1)}`)
      .join(" ");
  const area = (k: "rough" | "placement") =>
    `${line(k)} L${x(pts.at(-1)!.t).toFixed(1)},${H - pad} L${x(pts[0].t).toFixed(1)},${H - pad} Z`;
  const segments = observations.filter(
    (o) =>
      o.verification !== "rejected" &&
      !(o.startMs <= 0 && o.endMs >= dur - 1),
  );
  // Nearest window to the playhead, described in words.
  const near = pts.reduce((best, p) =>
    Math.abs(p.t - positionMs) < Math.abs(best.t - positionMs) ? p : best,
  );
  const seekFromEvent = (e: React.MouseEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    onSeek(((e.clientX - box.left) / box.width) * dur);
  };
  const ticks = Array.from(
    { length: Math.floor(dur / 1000) + 1 },
    (_, i) => i * 1000,
  ).filter((t, i, all) => all.length <= 9 || i % 2 === 0);
  return (
    <section className="activity" aria-labelledby="activity-title">
      <div className="section-header">
        <h3 id="activity-title">Handling activity (classifier)</h3>
        <span className="activity-legend">
          <span className="key rough">Toss / drop</span>
          <span className="key placement">Placement</span>
          {segments.some((o) => o.concern) && (
            <span className="key flagged">Flagged</span>
          )}
          {segments.some((o) => !o.concern) && (
            <span className="key highlighted">Highlighted</span>
          )}
        </span>
      </div>
      <p className="activity-caption">
        How strongly each 2-second window resembles a toss/drop or a placement.
        Not a probability.
      </p>
      <div className="activity-plot">
        <span className="activity-axis-y" aria-hidden="true">
          <span>High</span>
          <span>Low</span>
        </span>
        <div
          className="activity-chart"
          role="slider"
          tabIndex={0}
          aria-label="Handling activity chart. Use arrow keys or click to move the footage."
          aria-valuemin={0}
          aria-valuemax={Math.round(dur / 100) / 10}
          aria-valuenow={Math.round(positionMs / 100) / 10}
          aria-valuetext={`${timecode(positionMs)}: toss or drop ${strengthWord(near.rough).toLowerCase()}, placement ${strengthWord(near.placement).toLowerCase()}`}
          onClick={seekFromEvent}
          onKeyDown={(e) => {
            const step = e.shiftKey ? 2000 : 500;
            const next =
              e.key === "ArrowRight" || e.key === "ArrowUp"
                ? positionMs + step
                : e.key === "ArrowLeft" || e.key === "ArrowDown"
                  ? positionMs - step
                  : e.key === "Home"
                    ? 0
                    : e.key === "End"
                      ? dur
                      : undefined;
            if (next === undefined) return;
            e.preventDefault();
            onSeek(Math.min(dur, Math.max(0, next)));
          }}
        >
          <svg
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {segments.map((o) => (
              <rect
                key={o.id}
                className={`seg ${o.concern ? "concern" : "calm"}`}
                x={x(o.startMs)}
                y={0}
                width={Math.max(2, x(o.endMs) - x(o.startMs))}
                height={H}
              />
            ))}
            <line
              className="grid"
              x1={0}
              x2={W}
              y1={y(CLIP_THRESHOLD)}
              y2={y(CLIP_THRESHOLD)}
            />
            <line className="base" x1={0} x2={W} y1={H - pad} y2={H - pad} />
            <path className="area placement" d={area("placement")} />
            <path className="line placement" d={line("placement")} />
            <path className="area rough" d={area("rough")} />
            <path className="line rough" d={line("rough")} />
          </svg>
          <span
            className="activity-playhead"
            style={{ left: `${(Math.min(dur, positionMs) / dur) * 100}%` }}
            aria-hidden="true"
          />
        </div>
      </div>
      <div className="activity-axis-x" aria-hidden="true">
        {ticks.map((t) => (
          <span key={t} style={{ left: `${(t / dur) * 100}%` }}>
            {t / 1000}s
          </span>
        ))}
      </div>
      <p className="activity-readout">
        At {timecode(positionMs)}: toss / drop{" "}
        <strong>{strengthWord(near.rough).toLowerCase()}</strong>, placement{" "}
        <strong>{strengthWord(near.placement).toLowerCase()}</strong>
      </p>
    </section>
  );
}

const STEPS = [
  "Preparing footage",
  "Analyzing handling",
  "Checking evidence",
  "Ready",
];

export function ProcessingStepper({ d }: { d: Delivery }) {
  const current =
    d.state === "analyzing" ? 1 : d.state === "verifying" ? 2 : 0;
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const secs = Math.max(
    0,
    Math.round((now - new Date(d.createdAt).getTime()) / 1000),
  );
  const elapsed =
    secs >= 60 ? `${Math.floor(secs / 60)} min ${secs % 60} s` : `${secs} s`;
  return (
    <div className="stepper" role="status" aria-live="polite">
      <div className="stepper-head">
        <strong>Preparing your delivery review</strong>
        <span>Elapsed {elapsed}</span>
      </div>
      <ol>
        {STEPS.map((s, i) => (
          <li
            key={s}
            className={i < current ? "done" : i === current ? "current" : ""}
            aria-current={i === current ? "step" : undefined}
          >
            <span className="stepper-dot" aria-hidden="true">
              {i < current ? (
                <Check size={12} />
              ) : i === current ? (
                <Loader2 size={12} className="spin" />
              ) : (
                i + 1
              )}
            </span>
            <span>
              {s}
              <small>
                {i < current ? "Done" : i === current ? "In progress" : "Waiting"}
              </small>
            </span>
          </li>
        ))}
      </ol>
      <p>Results appear here when processing finishes.</p>
    </div>
  );
}
