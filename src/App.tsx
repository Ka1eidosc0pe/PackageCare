import React, { useEffect, useRef, useState } from "react";
import { RingLiveView } from "./RingLiveView";
import {
  ActivityTrack,
  ProcessingStepper,
  VerdictBanner,
  classifierRun,
  keyMoment,
  plainDescription,
} from "./DeliveryInsights";
import {
  APPLICATION_REGION,
  AWS_PROFILE_NAME,
  BEDROCK_MODEL,
} from "../shared/project";
import {
  Package,
  LayoutDashboard,
  FileText,
  Plug,
  ArrowUpRight,
  ArrowLeft,
  ArrowRight,
  ChevronRight,
  Check,
  CheckCircle2,
  Circle,
  Search,
  Play,
  Pause,
  VolumeX,
  Maximize,
  Camera,
  Plus,
  Upload,
  X,
  AlertTriangle,
  Eye,
  Download,
  Clock3,
  MoreHorizontal,
  RotateCcw,
  Loader2,
  ShieldCheck,
  Trash2,
  ImagePlus,
  ExternalLink,
  Settings2,
  LogOut,
} from "lucide-react";
import {
  type Delivery,
  type Review,
  type Report,
  type Observation,
  labels,
  sourceLabels,
  timecode,
} from "../shared/domain";

async function api<T = any>(
  url: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(`/api${url}`, {
    ...options,
    headers: {
      ...(options.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...options.headers,
    },
  });
  if (res.status === 401) {
    window.dispatchEvent(new Event("session-expired"));
  }
  if (!res.ok) {
    const data = await res
      .json()
      .catch(() => ({ error: "Request failed. Try again." }));
    throw new Error(data.error);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}
async function uploadFile(file: File, deliveryId?: string): Promise<Delivery> {
  const max = (deliveryId ? 10 : 80) * 1024 * 1024;
  if (!file.size || file.size > max)
    throw new Error(
      `Choose a ${deliveryId ? "photo under 10" : "video under 80"} MB.`,
    );
  const status = await api("/status");
  if (status.uploadMode !== "direct") {
    const body = new FormData();
    body.append("file", file);
    return api(deliveryId ? `/deliveries/${deliveryId}/photos` : "/uploads", {
      method: "POST",
      body,
    });
  }
  const digest = await crypto.subtle.digest(
    "SHA-256",
    await file.arrayBuffer(),
  );
  const sha256 = Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  const grant = await api<{
    url: string;
    fields: Record<string, string>;
    ticket: string;
  }>("/uploads/authorize", {
    method: "POST",
    body: JSON.stringify({
      purpose: deliveryId ? "photo" : "video",
      name: file.name,
      bytes: file.size,
      mime: file.type,
      sha256,
      deliveryId,
    }),
  });
  const body = new FormData();
  for (const [key, value] of Object.entries(grant.fields))
    body.append(key, value);
  body.append("file", file); // S3 requires the file field last.
  const result = await fetch(grant.url, {
    method: "POST",
    body,
    credentials: "omit",
  });
  if (!result.ok)
    throw new Error(
      "The file could not be uploaded. Check your connection and choose it again.",
    );
  return api("/uploads/complete", {
    method: "POST",
    body: JSON.stringify({ ticket: grant.ticket }),
  });
}
const date = (s: string) =>
  new Date(s).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
const assetUrl = (d: Delivery, id: string) =>
  `/api/deliveries/${d.id}/assets/${id}`;
function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark">
        <Package size={23} strokeWidth={1.7} />
      </span>
      <span>
        PackageCare<span className="brand-dot">.</span>
      </span>
    </div>
  );
}
function Badge({ d }: { d: Delivery }) {
  const text =
    d.state === "ready"
      ? labels[d.analysis!.assessment]
      : {
          awaiting_analysis: "Clip saved",
          received: "Received",
          waiting_for_media: "Waiting for footage",
          analyzing: "Analyzing footage",
          verifying: "Checking evidence",
          failed: "Processing failed",
          media_unavailable: "Footage unavailable",
        }[d.state];
  return (
    <span
      className={`badge ${d.state === "ready" ? d.analysis!.assessment : d.state}`}
    >
      <span />
      {text}
    </span>
  );
}
function matchesFilter(d: Delivery, filter: string) {
  return (
    filter === "all" ||
    (filter === "review" && d.state === "ready" && !d.review.complete) ||
    (filter === "complete" && d.review.complete)
  );
}
export default function App() {
  const [page, setPage] = useState<"deliveries" | "reports" | "connections">(
      "deliveries",
    ),
    [deliveries, setDeliveries] = useState<Delivery[]>([]),
    [selected, setSelected] = useState<string>(),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("all"),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [status, setStatus] = useState<any>(),
    [report, setReport] = useState<{ d: Delivery; r?: Report }>(),
    [login, setLogin] = useState(false),
    [password, setPassword] = useState("");
  const [reviewDirty, setReviewDirty] = useState(false),
    [pendingNavigation, setPendingNavigation] = useState<
      (() => void) | undefined
    >();
  function navigate(action: () => void) {
    if (reviewDirty) setPendingNavigation(() => action);
    else action();
  }
  const upload = useRef<HTMLInputElement>(null);
  const [showSamples, setShowSamples] = useState(
      () => localStorage.getItem("packagecare-show-samples") === "1",
    ),
    showSamplesRef = useRef(showSamples);
  showSamplesRef.current = showSamples;
  // Sample deliveries step aside once real footage exists, unless requested.
  const listed = (list: Delivery[], show = showSamplesRef.current) =>
    !show && list.some((d) => d.source !== "fixture")
      ? list.filter((d) => d.source !== "fixture")
      : list;
  async function refresh() {
    const [list, info] = await Promise.all([
      api<Delivery[]>("/deliveries"),
      api("/status"),
    ]);
    setDeliveries(list);
    setStatus(info);
    setSelected((prev) => {
      const pool = listed(list);
      return pool.some((d) => d.id === prev) ? prev : pool[0]?.id;
    });
    setLoading(false);
  }
  // Each page opens at the top (the entrance fade hides the reset), never at the previous page's scroll.
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [page]);
  useEffect(() => {
    refresh().catch((e) => {
      setError(e.message);
      setLoading(false);
    });
    const listener = () => setLogin(true);
    window.addEventListener("session-expired", listener);
    return () => window.removeEventListener("session-expired", listener);
  }, []);
  useEffect(() => {
    if (
      !deliveries.some(
        (d) =>
          ![
            "awaiting_analysis",
            "ready",
            "failed",
            "media_unavailable",
          ].includes(d.state),
      )
    )
      return;
    const t = setInterval(
      () => refresh().catch((e) => setError(e.message)),
      2000,
    );
    return () => clearInterval(t);
  }, [deliveries]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 4000);
    return () => clearTimeout(t);
  }, [notice]);
  async function act(name: string, fn: () => Promise<void>) {
    if (busy) return;
    setBusy(name);
    setError("");
    try {
      await fn();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  }
  const hasReal = deliveries.some((d) => d.source !== "fixture"),
    hasFixtures = deliveries.some((d) => d.source === "fixture"),
    shown = listed(deliveries, showSamples);
  function toggleSamples() {
    const next = !showSamples;
    setShowSamples(next);
    localStorage.setItem("packagecare-show-samples", next ? "1" : "0");
    const pool = listed(deliveries, next);
    if (!pool.some((d) => d.id === selected))
      setSelected(pool.find((d) => matchesFilter(d, filter))?.id);
  }
  const d = shown.find((d) => d.id === selected),
    pending = shown.filter(
      (d) => d.state === "ready" && !d.review.complete,
    ).length;
  const visible = shown.filter(
    (d) =>
      matchesFilter(d, filter) &&
      `${d.title} ${d.camera} ${d.review.shipment}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const update = (next: Delivery) => {
    setDeliveries((list) => list.map((d) => (d.id === next.id ? next : d)));
  };
  async function sample() {
    await act("samples", async () => {
      await api("/samples", { method: "POST" });
      showSamplesRef.current = true;
      setShowSamples(true);
      localStorage.setItem("packagecare-show-samples", "1");
      await refresh();
      setNotice("Three synthetic scenarios are ready to explore.");
    });
  }
  if (login)
    return (
      <main className="login">
        <Brand />
        <div>
          <span className="eyebrow">PRIVATE WORKSPACE</span>
          <h1>
            Your deliveries.
            <br />
            Your evidence.
          </h1>
          <p>Enter the workspace password to continue.</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              act("login", async () => {
                await api("/session", {
                  method: "POST",
                  body: JSON.stringify({ password }),
                });
                setLogin(false);
                await refresh();
              });
            }}
          >
            <label>
              Workspace password
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
            <button className="button primary" disabled={!!busy}>
              Open workspace <ArrowRight size={16} />
            </button>
            {error && <p role="alert">{error}</p>}
          </form>
        </div>
      </main>
    );
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Brand />
        <div className="workspace-label">
          YOUR WORKSPACE <span>01</span>
        </div>
        <nav aria-label="Main navigation">
          <button
            className={page === "deliveries" ? "active" : ""}
            onClick={() => navigate(() => setPage("deliveries"))}
          >
            <LayoutDashboard size={18} /> Deliveries{" "}
            <span className="nav-count">{pending || "—"}</span>
          </button>
          <button
            className={page === "reports" ? "active" : ""}
            onClick={() => navigate(() => setPage("reports"))}
          >
            <FileText size={18} /> Reports
          </button>
          <button
            className={page === "connections" ? "active" : ""}
            onClick={() => navigate(() => setPage("connections"))}
          >
            <Plug size={18} /> Connections
          </button>
        </nav>
        <div className="sidebar-note">
          <ShieldCheck size={22} />
          <p>
            A clearer record.
            <br />
            <span>You decide what happens next.</span>
          </p>
        </div>
        <button
          className="connection-foot"
          onClick={() => navigate(() => setPage("connections"))}
        >
          <span
            className={`status-light ${status?.ring.connected ? "on" : ""}`}
          />
          <span>
            Ring {status?.ring.connected ? "connected" : "not connected"}
            <small>Manage connection</small>
          </span>
          <ArrowUpRight size={15} />
        </button>
        <div className="user">
          <div className="avatar">H</div>
          <span>
            Home workspace
            <small>
              Private ·{" "}
              {status?.storage === "AWS" ? "AWS storage" : "Local storage"}
            </small>
          </span>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <span>
            {page === "deliveries"
              ? "Deliveries"
              : page === "reports"
                ? "Report library"
                : "Connections"}
          </span>
          <div>
            <span className="private-label">
              <ShieldCheck size={13} /> Private workspace
            </span>
            {status?.sessionRequired && (
              <button
                className="icon-button"
                aria-label="Sign out"
                onClick={() =>
                  act("logout", async () => {
                    await api("/logout", { method: "POST" });
                    setLogin(true);
                    setPassword("");
                  })
                }
              >
                <LogOut size={16} />
              </button>
            )}
            <span className="avatar small">H</span>
          </div>
        </header>
        <main className="main">
          {error && (
            <div className="error-banner" role="alert">
              <AlertTriangle size={17} />
              {error}
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                <X size={15} />
              </button>
            </div>
          )}
          {page === "deliveries" && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">DELIVERY WORKSPACE</span>
                  <h1>Delivery review</h1>
                  <p>
                    Inspect handling observations and prepare a reviewed record.
                  </p>
                </div>
                <div className="heading-actions">
                  <button
                    className="button"
                    onClick={() => navigate(() => upload.current?.click())}
                    disabled={!!busy}
                  >
                    <Upload size={15} /> Import footage
                  </button>
                  <button
                    className="button primary"
                    onClick={() => navigate(() => setPage("connections"))}
                  >
                    <Plus size={16} /> Connect Ring
                  </button>
                </div>
              </div>
              <input
                type="file"
                accept="video/mp4,video/quicktime,video/webm"
                ref={upload}
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file)
                    act("upload", async () => {
                      const result = await uploadFile(file);
                      await refresh();
                      setSelected(result.id);
                      setNotice(
                        status?.analysis?.provider === "local_classifier"
                          ? "Uploaded footage queued for local classifier analysis."
                          : "Uploaded footage queued for Bedrock analysis.",
                      );
                    });
                  e.target.value = "";
                }}
              />
              {(d?.source === "fixture" ||
                (!d &&
                  deliveries.length > 0 &&
                  deliveries.every((item) => item.source === "fixture"))) && (
                <div className="sample-banner">
                  <span className="sample-icon">
                    <Play size={13} />
                  </span>
                  <span>
                    <strong>Sample workspace</strong> Synthetic footage and
                    scripted observations. Connect Ring to review your
                    deliveries.
                  </span>
                  <button
                    onClick={() => navigate(() => setPage("connections"))}
                  >
                    Set up Ring <ArrowRight size={14} />
                  </button>
                </div>
              )}
              <div className="workspace-toolbar">
                <div
                  className="tabs"
                  role="tablist"
                  aria-label="Delivery filter"
                >
                  {[
                    ["all", "All deliveries"],
                    ["review", "To review"],
                    ["complete", "Reviewed"],
                  ].map(([id, name]) => (
                    <button
                      key={id}
                      role="tab"
                      aria-selected={filter === id}
                      className={filter === id ? "chosen" : ""}
                      onClick={() =>
                        navigate(() => {
                          setFilter(id);
                          if (
                            !shown.some(
                              (d) => d.id === selected && matchesFilter(d, id),
                            )
                          )
                            setSelected(
                              shown.find((d) => matchesFilter(d, id))?.id,
                            );
                        })
                      }
                    >
                      {name}
                      <span>
                        {id === "all"
                          ? shown.length
                          : id === "review"
                            ? pending
                            : shown.filter((d) => d.review.complete).length}
                      </span>
                    </button>
                  ))}
                </div>
                <label className="search">
                  <Search size={15} />
                  <input
                    aria-label="Search deliveries"
                    placeholder="Search deliveries…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
              </div>
              {loading ? (
                <div className="empty">
                  <Loader2 className="spin" />
                  <h2>Opening your workspace</h2>
                </div>
              ) : !deliveries.length ? (
                <div className="empty first-run">
                  <div className="empty-art">
                    <Package size={72} strokeWidth={1} />
                    <span>
                      <Check size={20} />
                    </span>
                  </div>
                  <span className="eyebrow">
                    A LITTLE MORE CARE, AT YOUR DOOR.
                  </span>
                  <h2>Your first delivery starts here.</h2>
                  <p>
                    Connect a Ring camera, or explore three clearly labeled
                    sample
                    <br className="desktop" /> deliveries to try the review and
                    report workflow.
                  </p>
                  <div>
                    <button
                      className="button primary"
                      onClick={sample}
                      disabled={!!busy}
                    >
                      {busy === "samples" ? (
                        <Loader2 className="spin" size={16} />
                      ) : (
                        <Play size={15} />
                      )}{" "}
                      Explore sample deliveries
                    </button>
                    <button
                      className="text-button"
                      onClick={() => setPage("connections")}
                    >
                      Connect Ring <ArrowUpRight size={15} />
                    </button>
                  </div>
                  <small>
                    Samples use synthetic animation, not real recordings or AI
                    analysis.
                  </small>
                </div>
              ) : (
                <div className="delivery-layout">
                  <section className="delivery-list" aria-label="Deliveries">
                    <div className="list-caption">
                      RECENT DELIVERIES <span>{visible.length}</span>
                    </div>
                    {!visible.length ? (
                      <p className="list-empty">
                        No deliveries match this filter.
                      </p>
                    ) : (
                      visible.map((item) => {
                        const thumb = item.assets.find(
                          (a) => a.kind === "frame",
                        );
                        return (
                          <button
                            className={`delivery-row ${d?.id === item.id ? "selected" : ""}`}
                            key={item.id}
                            onClick={() => {
                              if (item.id !== selected)
                                navigate(() => setSelected(item.id));
                            }}
                          >
                            {thumb ? (
                              <img
                                className="row-thumb"
                                src={assetUrl(item, thumb.id)}
                                alt=""
                              />
                            ) : (
                              <span className="row-thumb thumb-placeholder">
                                <Package size={20} />
                              </span>
                            )}
                            <span className="row-main">
                              <strong>{item.title}</strong>
                              <span className="row-meta">
                                {item.source === "fixture"
                                  ? "Sample"
                                  : new Date(
                                      item.observedAt,
                                    ).toLocaleDateString(undefined, {
                                      month: "short",
                                      day: "numeric",
                                    })}
                                {" · "}
                                {new Date(item.observedAt).toLocaleTimeString(
                                  undefined,
                                  { hour: "numeric", minute: "2-digit" },
                                )}
                              </span>
                              <Badge d={item} />
                            </span>
                            <span className="row-end">
                              {item.review.complete ? (
                                <CheckCircle2
                                  size={15}
                                  className="teal"
                                  aria-label="Reviewed"
                                />
                              ) : (
                                <ChevronRight size={15} aria-hidden="true" />
                              )}
                            </span>
                          </button>
                        );
                      })
                    )}
                    {hasReal && hasFixtures && (
                      <label className="sample-toggle">
                        <input
                          type="checkbox"
                          checked={showSamples}
                          onChange={() => navigate(toggleSamples)}
                        />
                        Show sample deliveries
                      </label>
                    )}
                    {(!hasReal || !hasFixtures || showSamples) && (
                      <button
                        className="load-samples"
                        disabled={!!busy}
                        onClick={sample}
                      >
                        <Plus size={13} />{" "}
                        {hasFixtures
                          ? "Restore missing samples"
                          : "Explore sample deliveries"}
                      </button>
                    )}
                  </section>
                  {d && (
                    <DeliveryWorkspace
                      key={d.id}
                      d={d}
                      update={update}
                      act={act}
                      busy={busy}
                      onReport={() => setReport({ d })}
                      onNotice={setNotice}
                      onDirty={setReviewDirty}
                      onDelete={() =>
                        act("delete", async () => {
                          await api(`/deliveries/${d.id}`, {
                            method: "DELETE",
                          });
                          await refresh();
                        })
                      }
                    />
                  )}
                </div>
              )}
            </>
          )}
          {page === "reports" && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">YOUR RECORDS</span>
                  <h1>Report library</h1>
                  <p>
                    Reviewed records, preserved exactly as you finalized them.
                  </p>
                </div>
              </div>
              <div className="report-table">
                <div className="report-table-head">
                  <span>DELIVERY</span>
                  <span>FINALIZED</span>
                  <span>VERSION</span>
                  <span />
                </div>
                {deliveries.flatMap((d) =>
                  d.reports.map((r) => (
                    <button
                      className="report-table-row"
                      key={r.id}
                      onClick={() => setReport({ d, r })}
                    >
                      <span>
                        <FileText size={20} />
                        <span>
                          <strong>{d.title}</strong>
                          <small>{sourceLabels[r.delivery.source]}</small>
                        </span>
                      </span>
                      <span>{date(r.createdAt)}</span>
                      <span>v{r.version}</span>
                      <ArrowUpRight size={17} />
                    </button>
                  )),
                )}
                {!deliveries.some((d) => d.reports.length) && (
                  <div className="empty">
                    <FileText size={40} strokeWidth={1} />
                    <h2>A record when you need one.</h2>
                    <p>
                      Complete a delivery review, preview your report, then
                      finalize it here.
                    </p>
                    <button
                      className="button"
                      onClick={() => setPage("deliveries")}
                    >
                      Review deliveries <ArrowRight size={15} />
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
          {page === "connections" && (
            <Connections
              status={status}
              refresh={refresh}
              act={act}
              busy={busy}
              onImport={(id) => {
                setSelected(id);
                setPage("deliveries");
              }}
            />
          )}
        </main>
        <footer className="footer">
          <span>
            <Package size={13} /> PackageCare
          </span>
          <span>Evidence informs. You decide.</span>
          <span>Ring track · AWS Builder</span>
        </footer>
      </div>
      {busy && (
        <div className="working" role="status">
          <Loader2 size={15} className="spin" /> Working…
        </div>
      )}
      {notice && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          {notice}
        </div>
      )}
      {pendingNavigation && (
        <DecisionDialog
          titleId="unsaved-title"
          onCancel={() => setPendingNavigation(undefined)}
        >
          <h2 id="unsaved-title">Keep your review changes?</h2>
          <p>
            Your latest edits have not been saved. Stay here to save them, or
            discard them and continue.
          </p>
          <div>
            <button
              className="button primary"
              onClick={() => setPendingNavigation(undefined)}
            >
              Keep editing
            </button>
            <button
              className="button"
              onClick={() => {
                const go = pendingNavigation;
                setPendingNavigation(undefined);
                setReviewDirty(false);
                go();
              }}
            >
              Discard changes
            </button>
          </div>
        </DecisionDialog>
      )}
      {report && (
        <ReportDrawer
          d={report.d}
          report={report.r}
          onClose={() => setReport(undefined)}
          onFinalize={async (previewAuthorization) => {
            const result = await api<{ delivery: Delivery; report: Report }>(
              `/deliveries/${report.d.id}/reports`,
              {
                method: "POST",
                body: JSON.stringify({
                  revision: report.d.revision,
                  previewAuthorization,
                }),
              },
            );
            update(result.delivery);
            setReport({ d: result.delivery, r: result.report });
          }}
        />
      )}
    </div>
  );
}

function DeliveryWorkspace({
  d,
  update,
  act,
  busy,
  onReport,
  onNotice,
  onDelete,
  onDirty,
}: {
  d: Delivery;
  update: (d: Delivery) => void;
  act: (s: string, f: () => Promise<void>) => Promise<void>;
  busy: string;
  onReport: () => void;
  onNotice: (s: string) => void;
  onDelete: () => void;
  onDirty: (dirty: boolean) => void;
}) {
  const [active, setActive] = useState(""),
    [draft, setDraft] = useState<Review>(structuredClone(d.review)),
    [dirty, setDirty] = useState(false),
    [playing, setPlaying] = useState(false),
    [position, setPosition] = useState(0),
    [replay, setReplay] = useState(false),
    [confirmDelete, setConfirmDelete] = useState(false);
  const video = useRef<HTMLVideoElement>(null),
    photo = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setDraft(structuredClone(d.review));
    setDirty(false);
  }, [d.revision]);
  useEffect(() => {
    onDirty(dirty);
    return () => onDirty(false);
  }, [dirty, onDirty]);
  const media =
    d.assets.find((a) => a.kind === "video" && a.name.startsWith("playback")) ||
    d.assets.find((a) => a.kind === "video");
  const frames = d.assets.filter((a) => a.kind === "frame"),
    concerns =
      d.analysis?.observations.filter(
        (o) => o.concern && o.verification !== "rejected",
      ) || [];
  const selectedObservation =
    d.analysis?.observations.find((o) => o.id === active) ||
    concerns[0] ||
    d.analysis?.observations[0];
  const reviewItems = selectedObservation ? [selectedObservation] : [];
  const moment = keyMoment(d),
    classifier = classifierRun(d),
    markers =
      d.analysis?.observations.filter(
        (o) =>
          o.verification !== "rejected" &&
          !(o.startMs <= 0 && o.endMs >= d.durationMs - 1),
      ) || [];
  const replayRef = useRef<{ start: number; end: number } | undefined>(undefined);
  // Smooth playhead and segment looping while the footage plays.
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const tick = () => {
      const v = video.current;
      if (v) {
        const loop = replayRef.current;
        if (loop && v.currentTime * 1000 >= loop.end) {
          v.currentTime = loop.start / 1000;
        }
        setPosition(v.currentTime * 1000);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);
  function stopReplay() {
    replayRef.current = undefined;
    setReplay(false);
    if (video.current) video.current.playbackRate = 1;
  }
  function toggleReplay() {
    const v = video.current;
    if (!v || !moment) return;
    if (replay) {
      stopReplay();
      return;
    }
    // Keep at least a 1-second loop so very short segments stay watchable.
    const start = moment.startMs,
      end = Math.min(d.durationMs || moment.endMs, Math.max(moment.endMs, start + 1000));
    replayRef.current = { start, end };
    setReplay(true);
    setActive(moment.id);
    // After the replay state re-renders, bring the whole video into view.
    requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        v.scrollIntoView({ behavior: "smooth", block: "center" }),
      ),
    );
    v.currentTime = start / 1000;
    v.playbackRate = 0.5;
    setPosition(start);
    void v.play().catch(() => {
      stopReplay();
      onNotice("Playback unavailable. Download the source footage.");
    });
  }
  function seekTo(ms: number) {
    if (replay) stopReplay();
    if (video.current) video.current.currentTime = ms / 1000;
    setPosition(ms);
  }
  useEffect(() => {
    if (!dirty) return;
    const protect = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, [dirty]);
  function edit(next: Partial<Review>) {
    setDraft((old) => ({ ...old, ...next }));
    setDirty(true);
  }
  function seek(o: Observation) {
    if (replay) stopReplay();
    setActive(o.id);
    if (video.current) {
      video.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
      video.current.currentTime = o.startMs / 1000;
      video.current.pause();
    }
    setPosition(o.startMs);
  }
  async function save() {
    await act("save", async () => {
      update(
        await api(`/deliveries/${d.id}/review`, {
          method: "PUT",
          body: JSON.stringify({ ...draft, revision: d.revision }),
        }),
      );
      onNotice("Review saved.");
    });
  }
  return (
    <section className="delivery-workspace">
      <div className="detail-heading">
        <div>
          <span className="eyebrow">
            {sourceLabels[d.source].toUpperCase()}{" "}
            <span className="dot-separator">/</span>{" "}
            {d.id.slice(0, 8).toUpperCase()}
          </span>
          <h2>{d.title}</h2>
          <span className="muted detail-date">
            <Camera size={13} />
            {d.camera}
            <span>·</span>
            {date(d.observedAt)}
          </span>
        </div>
        <button
          className="icon-button"
          aria-label="Delete delivery"
          onClick={() => setConfirmDelete(true)}
        >
          <Trash2 size={17} />
        </button>
      </div>
      <div className="detail-columns">
        <div className="evidence-column">
          {![
            "awaiting_analysis",
            "ready",
            "failed",
            "media_unavailable",
          ].includes(d.state) && <ProcessingStepper d={d} />}
          {d.state === "awaiting_analysis" && (
            <div className="capture-ready">
              <span className="capture-ready-icon" aria-hidden="true">
                <Camera size={20} />
              </span>
              <div className="capture-ready-text">
                <strong>Clip saved</strong>
                <p>
                  Review the captured footage, then start a handling analysis.
                </p>
              </div>
              <button
                className="button primary"
                disabled={!!busy}
                onClick={() =>
                  act("analyze", async () => {
                    await api(`/deliveries/${d.id}/analyze`, {
                      method: "POST",
                    });
                    update(await api(`/deliveries/${d.id}`));
                  })
                }
              >
                Analyze clip <ArrowRight size={15} />
              </button>
            </div>
          )}
          <VerdictBanner
            d={d}
            moment={moment}
            replaying={replay}
            onReplay={toggleReplay}
          />
          <div className="video-wrap">
            {media ? (
              <>
                <video
                  ref={video}
                  src={assetUrl(d, media.id)}
                  poster={frames[2] ? assetUrl(d, frames[2].id) : undefined}
                  playsInline
                  controls={d.state === "awaiting_analysis"}
                  onTimeUpdate={(e) => {
                    if (!playing)
                      setPosition(e.currentTarget.currentTime * 1000);
                  }}
                  onPlay={() => setPlaying(true)}
                  onPause={() => setPlaying(false)}
                  onEnded={(e) => {
                    const loop = replayRef.current;
                    if (loop) {
                      e.currentTarget.currentTime = loop.start / 1000;
                      void e.currentTarget.play().catch(() => stopReplay());
                    } else setPlaying(false);
                  }}
                  aria-label="Source delivery footage"
                />
                <div className="video-top">
                  <span>
                    <Camera size={12} />
                    {d.camera}
                  </span>
                  <span>
                    {d.source === "fixture"
                      ? "SYNTHETIC SAMPLE"
                      : sourceLabels[d.source].toUpperCase()}
                  </span>
                </div>
                {d.state !== "awaiting_analysis" && (
                  <div className="video-controls">
                    <button
                      aria-label={playing ? "Pause footage" : "Play footage"}
                      onClick={() => {
                        if (video.current)
                          playing
                            ? video.current.pause()
                            : void video.current
                                .play()
                                .catch(() =>
                                  onNotice(
                                    "Playback unavailable. Download the source footage.",
                                  ),
                                );
                      }}
                    >
                      {playing ? <Pause size={17} /> : <Play size={17} />}
                    </button>
                    <span>
                      {timecode(position)} / {timecode(d.durationMs)}
                    </span>
                    <span className="scrub">
                      {markers.map((o) => (
                        <span
                          key={o.id}
                          className={`scrub-mark ${o.concern ? "concern" : ""}`}
                          title={`${o.label.replaceAll("_", " ")} ${timecode(o.startMs)}–${timecode(o.endMs)}`}
                          style={{
                            left: `${(o.startMs / (d.durationMs || 1)) * 100}%`,
                            width: `${Math.max(1, ((o.endMs - o.startMs) / (d.durationMs || 1)) * 100)}%`,
                          }}
                        />
                      ))}
                      <input
                        aria-label="Footage position"
                        type="range"
                        min="0"
                        max={d.durationMs || 1}
                        value={position}
                        onChange={(e) => seekTo(Number(e.target.value))}
                      />
                    </span>
                    {replay && <span className="rate-chip">0.5×</span>}
                    <button
                      aria-label="Full screen footage"
                      onClick={() => video.current?.requestFullscreen()}
                    >
                      <Maximize size={16} />
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="media-wait">
                <Loader2 className="spin" />
                <p>Preparing source footage</p>
              </div>
            )}
          </div>
          <div className="video-caption">
            <span>
              <ShieldCheck size={13} /> Source footage preserved
            </span>
            <span>
              {d.durationMs
                ? `${(d.durationMs / 1000).toFixed(1)} sec`
                : "Not analyzed"}
              {d.source === "fixture" ? " · Animated fixture" : ""}
            </span>
          </div>
          {classifier && d.analysis && (
            <ActivityTrack
              raw={classifier.raw}
              durationMs={d.durationMs}
              positionMs={position}
              observations={d.analysis.observations}
              onSeek={seekTo}
            />
          )}
          {d.capture && (
            <p className="subtle-copy">
              Browser recording from Ring live view. The preserved file is the
              browser capture, not a native Ring recording download.
            </p>
          )}
          {["failed", "media_unavailable"].includes(d.state) && (
            <div className="processing error">
              <AlertTriangle size={22} />
              <div>
                <strong>
                  {d.state === "failed"
                    ? "Analysis could not finish"
                    : "Footage unavailable"}
                </strong>
                <p>{d.error}</p>
                <button
                  className="text-button"
                  disabled={!!busy}
                  onClick={() =>
                    act("retry", async () => {
                      await api(`/deliveries/${d.id}/retry`, {
                        method: "POST",
                      });
                      update(await api(`/deliveries/${d.id}`));
                    })
                  }
                >
                  <RotateCcw size={14} /> Retry processing
                </button>
              </div>
            </div>
          )}
          {d.analysis && (
            <>
              <div className="section-header">
                <h3>Handling timeline</h3>
                <span>{d.analysis.observations.length} observations</span>
              </div>
              <div className="timeline">
                {d.analysis.observations.map((o, i) => (
                  <button
                    className={`timeline-row ${active === o.id ? "active" : ""} ${o.concern ? "concern" : ""}`}
                    key={o.id}
                    onClick={() => seek(o)}
                  >
                    <span className="timeline-node">
                      {o.verification === "ambiguous" ? (
                        <Eye size={12} />
                      ) : o.concern ? (
                        <AlertTriangle size={12} />
                      ) : (
                        <Check size={12} />
                      )}
                    </span>
                    <span className="timeline-time">{timecode(o.startMs)}</span>
                    <span>
                      <strong>
                        {o.label
                          .replaceAll("_", " ")
                          .replace(/^./, (c) => c.toUpperCase())}
                      </strong>
                      <small>{plainDescription(o.description)}</small>
                    </span>
                    <span className="timeline-play">
                      <Play size={13} />
                    </span>
                  </button>
                ))}
              </div>
              <div className="section-header frames-heading">
                <h3>Evidence frames</h3>
                <span>Click to inspect</span>
              </div>
              <div className="frames">
                {frames.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => {
                      if (video.current)
                        video.current.currentTime = (f.offsetMs || 0) / 1000;
                      setPosition(f.offsetMs || 0);
                      window.open(assetUrl(d, f.id), "_blank", "noopener");
                    }}
                  >
                    <img
                      src={assetUrl(d, f.id)}
                      alt={`Source frame at ${timecode(f.offsetMs || 0)}`}
                    />
                    <span>{timecode(f.offsetMs || 0)}</span>
                  </button>
                ))}
              </div>
              <details className="limitations">
                <summary>
                  What this review can tell you <ChevronRight size={14} />
                </summary>
                <ul>
                  {d.analysis.limitations.map((l, i) => (
                    <li key={i}>{l}</li>
                  ))}
                </ul>
                <p>
                  Analysis:{" "}
                  {d.runs.at(-1)?.provider === "scripted_fixture"
                    ? "Scripted sample; no model invoked"
                    : d.runs.at(-1)?.provider === "local_classifier"
                      ? `Local handling classifier (trained on synthetic clips; not validated on real deliveries), ${d.runs.at(-1)?.model}`
                      : d.runs.at(-1)?.model}
                  . Visible handling and recipient-confirmed damage are
                  separate.
                </p>
              </details>
            </>
          )}
        </div>
        <aside className="review-panel">
          <div className="review-heading">
            <span className="eyebrow">RECIPIENT REVIEW</span>
            {d.review.complete ? (
              <CheckCircle2 size={18} />
            ) : (
              <Circle size={16} />
            )}
          </div>
          <Badge d={d} />
          <p className="assessment-summary">
            {(d.analysis && plainDescription(d.analysis.summary)) ||
              "Processing must finish before you can review this delivery."}
          </p>
          <div className="review-divider" />
          <div className="step-label">
            <span>01</span>
            <h3>Review the observation</h3>
          </div>
          {d.analysis && (
            <label className="field">
              Observation
              <select
                value={selectedObservation?.id || ""}
                onChange={(e) => {
                  const o = d.analysis?.observations.find(
                    (o) => o.id === e.target.value,
                  );
                  if (o) seek(o);
                }}
              >
                {d.analysis.observations.map((o) => (
                  <option key={o.id} value={o.id}>
                    {timecode(o.startMs)} · {o.label.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </label>
          )}
          {reviewItems.length ? (
            reviewItems.map((o) => (
              <div className="concern-review" key={o.id}>
                <button className="observation-link" onClick={() => seek(o)}>
                  <Play size={12} /> {timecode(o.startMs)}–{timecode(o.endMs)}{" "}
                  <ArrowUpRight size={13} />
                </button>
                <p>{plainDescription(o.description)}</p>
                <div className="decision-buttons">
                  {[
                    ["confirmed", "Confirm"],
                    ["dismissed", "Dismiss"],
                    ["corrected", "Correct"],
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      aria-pressed={draft.decisions[o.id]?.decision === value}
                      className={
                        draft.decisions[o.id]?.decision === value
                          ? "selected"
                          : ""
                      }
                      onClick={() =>
                        edit({
                          decisions: {
                            ...draft.decisions,
                            [o.id]: {
                              decision: value as any,
                              statement: draft.decisions[o.id]?.statement || "",
                            },
                          },
                          complete: false,
                        })
                      }
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {draft.decisions[o.id]?.decision === "corrected" && (
                  <label className="field">
                    Your correction
                    <textarea
                      value={draft.decisions[o.id].statement}
                      onChange={(e) =>
                        edit({
                          decisions: {
                            ...draft.decisions,
                            [o.id]: {
                              ...draft.decisions[o.id],
                              statement: e.target.value,
                            },
                          },
                        })
                      }
                    />
                  </label>
                )}
              </div>
            ))
          ) : (
            <p className="subtle-copy">
              {d.state !== "ready"
                ? "Observations will be available after analysis finishes."
                : d.analysis?.assessment === "unable_to_assess"
                  ? "The footage is inconclusive. You can still add what you observed."
                  : "No handling concerns to confirm. Add your inspection below."}
            </p>
          )}
          <div className="review-divider" />
          <div className="step-label">
            <span>02</span>
            <h3>Inspect your package</h3>
          </div>
          <label className="field">
            Damage status
            <select
              disabled={d.state !== "ready"}
              value={draft.damage}
              onChange={(e) => edit({ damage: e.target.value as any })}
            >
              <option value="unknown">Not inspected / unknown</option>
              <option value="none_observed">No damage observed</option>
              <option value="observed">Damage observed</option>
            </select>
          </label>
          <label className="field">
            Shipment reference <small>Optional</small>
            <input
              value={draft.shipment}
              placeholder="Order or tracking number"
              disabled={d.state !== "ready"}
              maxLength={300}
              onChange={(e) => edit({ shipment: e.target.value })}
            />
          </label>
          <label className="field">
            Your notes <small>Optional</small>
            <textarea
              rows={3}
              placeholder="What did you observe?"
              disabled={d.state !== "ready"}
              maxLength={4000}
              value={draft.notes}
              onChange={(e) => edit({ notes: e.target.value })}
            />
          </label>
          <input
            hidden
            ref={photo}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file)
                act("photo", async () => {
                  // Save pending review edits first so the photo never races an unsaved draft.
                  if (dirty)
                    update(
                      await api(`/deliveries/${d.id}/review`, {
                        method: "PUT",
                        body: JSON.stringify({ ...draft, revision: d.revision }),
                      }),
                    );
                  update(await uploadFile(file, d.id));
                  onNotice(dirty ? "Review saved and photo added." : "Photo added.");
                });
              e.target.value = "";
            }}
          />
          <button
            className="photo-upload"
            onClick={() => photo.current?.click()}
            disabled={!!busy || d.state !== "ready"}
          >
            <ImagePlus size={16} />
            <span>
              Add damage photos<small>JPG, PNG or WebP · up to 10 MB</small>
            </span>
            <Plus size={14} />
          </button>
          {d.assets.filter((a) => a.kind === "damage").length > 0 && (
            <div className="damage-photos">
              {d.assets
                .filter((a) => a.kind === "damage")
                .map((a) => (
                  <a
                    key={a.id}
                    href={assetUrl(d, a.id)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <img
                      src={assetUrl(d, a.id)}
                      alt="Recipient damage attachment"
                    />
                  </a>
                ))}
            </div>
          )}
          <div className="review-divider" />
          <label className="complete-review">
            <input
              type="checkbox"
              checked={draft.complete}
              disabled={d.state !== "ready"}
              onChange={(e) => edit({ complete: e.target.checked })}
            />
            <span>I've finished reviewing this delivery.</span>
          </label>
          <button
            className="button primary full"
            disabled={!!busy || !dirty || d.state !== "ready"}
            onClick={save}
          >
            <Check size={16} />
            {dirty || !d.review.updatedAt ? "Save review" : "Review saved"}
          </button>
          <button
            className="button full"
            disabled={dirty || !d.review.complete || d.state !== "ready"}
            onClick={onReport}
          >
            <FileText size={16} /> Preview report <ArrowRight size={14} />
          </button>
          <p className="report-hint">
            {dirty
              ? "Save your changes to continue."
              : !d.review.complete
                ? "Finish your review to prepare a report."
                : "You review and approve every report."}{" "}
            Nothing is sent automatically.
          </p>
        </aside>
      </div>
      {confirmDelete && (
        <DecisionDialog
          titleId="delete-title"
          onCancel={() => setConfirmDelete(false)}
        >
          <Trash2 size={26} />
          <h2 id="delete-title">Delete this delivery?</h2>
          <p>
            This removes its footage, reviews, and saved reports from this
            workspace. Download anything you need first.
          </p>
          <div>
            <button className="button" onClick={() => setConfirmDelete(false)}>
              Keep delivery
            </button>
            <button
              className="button danger"
              onClick={() => {
                setConfirmDelete(false);
                onDelete();
              }}
            >
              Delete delivery
            </button>
          </div>
        </DecisionDialog>
      )}
    </section>
  );
}

function DecisionDialog({
  titleId,
  onCancel,
  children,
}: {
  titleId: string;
  onCancel: () => void;
  children: React.ReactNode;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.querySelector<HTMLElement>("button")?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
      if (e.key === "Tab") {
        const items = Array.from(
          dialog.current?.querySelectorAll<HTMLElement>("button") || [],
        );
        if (e.shiftKey && document.activeElement === items[0]) {
          e.preventDefault();
          items.at(-1)?.focus();
        } else if (!e.shiftKey && document.activeElement === items.at(-1)) {
          e.preventDefault();
          items[0]?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);
  return (
    <div className="modal-scrim">
      <div
        ref={dialog}
        className="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        {children}
      </div>
    </div>
  );
}

function ReportDrawer({
  d,
  report,
  onClose,
  onFinalize,
}: {
  d: Delivery;
  report?: Report;
  onClose: () => void;
  onFinalize: (previewAuthorization: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [previewAuthorization, setPreviewAuthorization] = useState(""),
    [error, setError] = useState("");
  const close = useRef<HTMLButtonElement>(null),
    dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setPreviewAuthorization("");
    setError("");
  }, [d.id, d.revision, report?.id]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    close.current?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const els = Array.from(
          dialog.current?.querySelectorAll<HTMLElement>(
            "button:not(:disabled), a[href], iframe",
          ) || [],
        );
        const first = els[0],
          last = els.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
      previous?.focus();
    };
  }, []);
  return (
    <div className="drawer-scrim" onClick={onClose}>
      <div
        className="report-drawer"
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header>
          <div>
            <span className="eyebrow">
              {report
                ? `FINALIZED · VERSION ${report.version}`
                : "REVIEW BEFORE FINALIZING"}
            </span>
            <h2 id="report-title">Your delivery record</h2>
          </div>
          <button
            className="icon-button"
            ref={close}
            onClick={onClose}
            aria-label="Close report"
          >
            <X size={21} />
          </button>
        </header>
        <div className="report-info">
          <ShieldCheck size={18} />
          <span>
            {report
              ? "This snapshot is preserved. Further edits create a new version."
              : "Check the observations and recipient statements before creating a snapshot."}
          </span>
        </div>
        {error && (
          <p className="error-banner" role="alert">
            {error}
          </p>
        )}
        <iframe
          title="Delivery report preview"
          sandbox="allow-same-origin"
          onLoad={(e) => {
            if (report) return;
            const doc = e.currentTarget.contentDocument;
            if (doc?.URL === "about:blank") return;
            const authorization =
              doc
                ?.querySelector('meta[name="packagecare-preview"]')
                ?.getAttribute("content") || "";
            setPreviewAuthorization(authorization);
            setError(
              authorization
                ? ""
                : "The preview could not load. Close it and try again before finalizing.",
            );
          }}
          onError={() => {
            setPreviewAuthorization("");
            setError("The preview could not load. Close it and try again.");
          }}
          src={
            report
              ? `/api/deliveries/${d.id}/reports/${report.id}`
              : `/api/deliveries/${d.id}/preview`
          }
        />
        <footer>
          <p>No report is sent to Amazon or a carrier.</p>
          {report ? (
            <a
              className="button primary"
              href={`/api/deliveries/${d.id}/reports/${report.id}/download`}
              download
            >
              <Download size={16} /> Download evidence bundle
            </a>
          ) : (
            <button
              className="button primary"
              disabled={busy || !previewAuthorization}
              onClick={async () => {
                setBusy(true);
                try {
                  await onFinalize(previewAuthorization);
                } catch (e: any) {
                  setError(e.message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? (
                <Loader2 size={16} className="spin" />
              ) : (
                <CheckCircle2 size={16} />
              )}{" "}
              Finalize report
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}

function Connections({
  status,
  refresh,
  act,
  busy,
  onImport,
}: {
  status: any;
  refresh: () => Promise<void>;
  act: (s: string, f: () => Promise<void>) => Promise<void>;
  busy: string;
  onImport: (id: string) => void;
}) {
  const [token, setToken] = useState(""),
    [devices, setDevices] = useState<any[]>([]),
    [device, setDevice] = useState(""),
    [events, setEvents] = useState<any[]>([]),
    [caps, setCaps] = useState<any>(),
    [timestamp, setTimestamp] = useState(""),
    [selectedEvent, setSelectedEvent] = useState(""),
    [component, setComponent] = useState("");
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">WORKSPACE SETUP</span>
          <h1>Connections</h1>
          <p>
            Keep credentials on the server. Bring your recordings into one
            review workflow.
          </p>
        </div>
      </div>
      <div className="connections-layout">
        <section className="connection-section">
          <div className="connection-title">
            <span className="service-icon">
              <Camera size={26} />
            </span>
            <div>
              <h2>Ring</h2>
              <p>Developer Playground or your own device</p>
            </div>
            <span
              className={`connection-status ${status?.ring.connected ? "connected" : ""}`}
            >
              {status?.ring.connected ? "Token configured" : "Not connected"}
            </span>
          </div>
          <p>
            Generate a temporary access token in the official Ring Developer
            Playground. Your token stays in this server session and is never
            returned to the browser.
          </p>
          <a
            className="text-button"
            href="https://github.com/AmazonAppDev/ring-api-helloworld#step-1-get-your-token"
            target="_blank"
            rel="noreferrer"
          >
            Open Ring setup instructions <ExternalLink size={13} />
          </a>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              act("connect", async () => {
                const result = await api("/ring/connect", {
                  method: "POST",
                  body: JSON.stringify({ token }),
                });
                setDevices(result.devices);
                setToken("");
                await refresh();
              });
            }}
          >
            <label className="field">
              Playground access token
              <input
                type="password"
                autoComplete="off"
                placeholder="Paste a fresh token"
                value={token}
                onChange={(e) => setToken(e.target.value)}
              />
            </label>
            <div className="inline-actions">
              <button className="button primary" disabled={!!busy || !token}>
                Connect Ring <ArrowRight size={15} />
              </button>
              {status?.ring.connected && (
                <>
                  <button
                    type="button"
                    className="button"
                    disabled={!!busy}
                    onClick={() =>
                      act("devices", async () =>
                        setDevices(await api("/ring/devices")),
                      )
                    }
                  >
                    Refresh devices
                  </button>
                  <button
                    className="text-button"
                    type="button"
                    onClick={() =>
                      act("disconnect", async () => {
                        await api("/ring/connect", { method: "DELETE" });
                        setDevices([]);
                        await refresh();
                      })
                    }
                  >
                    Disconnect
                  </button>
                </>
              )}
            </div>
          </form>
          {devices.length > 0 && (
            <div className="device-import">
              <h3>Select a camera</h3>
              <label className="field">
                Camera
                <select
                  value={device}
                  onChange={(e) => {
                    const id = e.target.value;
                    setDevice(id);
                    setCaps(undefined);
                    setComponent("");
                    setEvents([]);
                    setTimestamp("");
                    setSelectedEvent("");
                    if (id)
                      act("events", async () => {
                        const [events, caps] = await Promise.all([
                          api(`/ring/devices/${encodeURIComponent(id)}/events`),
                          api(
                            `/ring/devices/${encodeURIComponent(id)}/capabilities`,
                          ),
                        ]);
                        setEvents(events || []);
                        setCaps(caps);
                      });
                  }}
                >
                  <option value="">Choose a device</option>
                  {devices.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.attributes?.name || d.id}
                    </option>
                  ))}
                </select>
              </label>
              {caps?.attributes?.components?.items?.length > 0 && (
                <label className="field">
                  Camera component
                  <select
                    value={component}
                    onChange={(e) => setComponent(e.target.value)}
                  >
                    <option value="">Select a component</option>
                    {caps.attributes.components.items.map((c: any) => (
                      <option key={c.component_id} value={c.component_id}>
                        {c.component_id}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <RingLiveView
                key={`${device}-${component}`}
                deviceId={device}
                componentId={component || undefined}
                disabled={
                  !!busy ||
                  !device ||
                  (!!caps?.attributes?.components?.items?.length && !component)
                }
                request={api}
                onSaved={async (d) => {
                  await refresh();
                  onImport(d.id);
                }}
              />
              <h3>Import an existing recording</h3>
              <p className="subtle-copy">
                Playground scenarios are live streams. Use Live view above when
                history is empty.
              </p>
              {events.length > 0 && (
                <label className="field">
                  Recent recording
                  <select
                    value={selectedEvent}
                    onChange={(e) => {
                      const event = events.find((x) => x.id === e.target.value);
                      setSelectedEvent(e.target.value);
                      if (event) {
                        const ts = event.attributes?.start;
                        if (Number.isFinite(ts) && ts > 0)
                          setTimestamp(new Date(ts).toISOString().slice(0, -1));
                      }
                    }}
                  >
                    <option value="">Select an event to fill timestamp</option>
                    {events.map((event: any) => (
                      <option key={event.id} value={event.id}>
                        {event.attributes?.start
                          ? `${event.attributes.event_type || "Recording"} · ${new Date(event.attributes.start).toISOString()}`
                          : event.id}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="field">
                Recording start (UTC)
                <input
                  type="datetime-local"
                  step="0.001"
                  value={timestamp}
                  onChange={(e) => {
                    setTimestamp(e.target.value);
                    setSelectedEvent("");
                  }}
                />
              </label>
              <p className="subtle-copy">
                Imports 12 seconds of existing footage. This does not start
                recording. Missing media may take time to become available.
              </p>
              <button
                className="button primary"
                disabled={!!busy || !device || !timestamp}
                onClick={() =>
                  act("import", async () => {
                    const ts = Date.parse(`${timestamp}Z`);
                    const d = await api<Delivery>("/ring/import", {
                      method: "POST",
                      body: JSON.stringify({
                        deviceId: device,
                        timestamp: ts,
                        eventId: selectedEvent || `manual-${device}-${ts}`,
                        componentId: component || undefined,
                      }),
                    });
                    await refresh();
                    onImport(d.id);
                  })
                }
              >
                Import and analyze <ArrowRight size={15} />
              </button>
            </div>
          )}
        </section>
        <section className="connection-section aws-section">
          <div className="connection-title">
            <span className="service-icon aws">aws</span>
            <div>
              <h2>Analysis & storage</h2>
              <p>
                {status?.analysis?.provider === "local_classifier"
                  ? "Local handling classifier"
                  : "Amazon Bedrock"}{" "}
                + local or AWS persistence
              </p>
            </div>
          </div>
          <dl className="connection-facts">
            <div>
              <dt>Analysis provider</dt>
              <dd>
                {status?.analysis?.provider === "local_classifier"
                  ? "Local handling classifier (trained on synthetic clips; no cloud call)"
                  : "Amazon Bedrock"}
              </dd>
            </div>
            <div>
              <dt>Model</dt>
              <dd>{status?.analysis.model || "Not configured"}</dd>
            </div>
            <div>
              <dt>Storage</dt>
              <dd>{status?.storage || "Local"}</dd>
            </div>
            <div>
              <dt>Orchestration</dt>
              <dd>{status?.workflow || "Local worker"}</dd>
            </div>
            <div>
              <dt>Retention</dt>
              <dd>{status?.retentionDays || 30} days per delivery</dd>
            </div>
            <div>
              <dt>Live validation</dt>
              <dd>
                {status?.analysis.verified
                  ? "Real invocation recorded"
                  : "No successful analysis yet"}
              </dd>
            </div>
          </dl>
          {status?.analysis?.provider === "local_classifier" ? (
            <>
              <p>
                Handling analysis runs on this machine: frozen V-JEPA 2 video
                features and a classifier trained on AI-generated doorbell
                clips. The AWS deployment runs the same classifier in a Lambda
                worker in {APPLICATION_REGION}.
              </p>
              <div className="setup-code">
                <code>PACKAGECARE_ANALYZER=local</code>
              </div>
            </>
          ) : (
            <>
              <p>
                Local analysis uses the {AWS_PROFILE_NAME} profile in{" "}
                {APPLICATION_REGION}. AWS deployments use an execution role.
                Check model quotas and obtain spending approval before live
                analysis.
              </p>
              <div className="setup-code">
                <code>
                  AWS_PROFILE={AWS_PROFILE_NAME}
                  <br />
                  AWS_REGION={APPLICATION_REGION}
                  <br />
                  BEDROCK_MODEL_ID={BEDROCK_MODEL}
                </code>
              </div>
            </>
          )}
          <p className="subtle-copy">
            Sample deliveries use scripted observations and never call Bedrock.
            They verify product interactions, not detection accuracy.
          </p>
        </section>
      </div>
    </>
  );
}
