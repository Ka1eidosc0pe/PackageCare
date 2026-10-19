import { useEffect, useRef, useState } from "react";
import { Camera, Loader2, Play, Square } from "lucide-react";
import type { Delivery } from "../shared/domain";

type Request = <T = any>(url: string, options?: RequestInit) => Promise<T>;
type Session = { answer: string; ticket: string; viewSeconds: number };
export function RingLiveView({
  deviceId,
  componentId,
  disabled,
  request,
  onSaved,
}: {
  deviceId: string;
  componentId?: string;
  disabled: boolean;
  request: Request;
  onSaved: (d: Delivery) => Promise<void>;
}) {
  const video = useRef<HTMLVideoElement>(null),
    peer = useRef<RTCPeerConnection | null>(null),
    session = useRef<Session | null>(null),
    generation = useRef(0),
    recorder = useRef<MediaRecorder | null>(null),
    discard = useRef(false),
    autoCapture = useRef(false);
  const [phase, setPhase] = useState("idle"),
    [error, setError] = useState(""),
    [remaining, setRemaining] = useState(0),
    [recorded, setRecorded] = useState(0),
    [mediaReady, setMediaReady] = useState(false);
  const close = async () => {
    setRemaining(0);
    setMediaReady(false);
    generation.current++;
    discard.current = true;
    autoCapture.current = false;
    if (recorder.current?.state === "recording") recorder.current.stop();
    recorder.current = null;
    peer.current?.getReceivers().forEach((r) => r.track?.stop());
    peer.current?.close();
    peer.current = null;
    if (video.current) video.current.srcObject = null;
    const old = session.current;
    session.current = null;
    if (old)
      await request("/ring/live/close", {
        method: "POST",
        body: JSON.stringify({ ticket: old.ticket }),
      });
  };
  useEffect(
    () => () => {
      void close().catch(() => {});
    },
    [deviceId, componentId],
  );
  useEffect(() => {
    if (remaining <= 0 || !session.current) return;
    const timer = window.setTimeout(() => setRemaining((s) => s - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [remaining]);
  useEffect(() => {
    if (remaining === 0 && session.current && phase !== "saving") {
      if (recorder.current) {
        if (recorder.current.state === "recording") recorder.current.stop();
        return;
      }
      void close().catch(() =>
        setError(
          "The stream will close automatically at Ring's session limit.",
        ),
      );
      setPhase("idle");
    }
  }, [remaining, phase]);
  const start = async (capture = false) => {
    setError("");
    setMediaReady(false);
    setPhase("connecting");
    await close().catch(() => {});
    autoCapture.current = capture;
    const run = ++generation.current;
    try {
      if (!window.RTCPeerConnection)
        throw new Error("Live view needs a browser with WebRTC support.");
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });
      peer.current = pc;
      pc.ontrack = (event) => {
        if (run !== generation.current || !video.current) return;
        video.current.srcObject =
          event.streams[0] || new MediaStream([event.track]);
        void video.current.play().catch(() => {});
      };
      pc.onconnectionstatechange = () => {
        if (run !== generation.current) return;
        if (pc.connectionState === "failed") {
          // Let MediaRecorder flush already received footage before closing the
          // session. A network interruption is not a recipient cancellation.
          if (recorder.current) {
            setError("The stream ended early. Saving the footage received.");
            if (recorder.current.state === "recording") recorder.current.stop();
            pc.close();
            return;
          }
          setError(
            "Ring's live stream ended. Check your network and start a new live view.",
          );
          void close().catch(() => {});
          setPhase("idle");
        }
      };
      pc.addTransceiver("video", { direction: "recvonly" });
      await pc.setLocalDescription(await pc.createOffer());
      await new Promise<void>((resolve, reject) => {
        if (pc.iceGatheringState === "complete") return resolve();
        const done = () => {
          if (pc.iceGatheringState === "complete") {
            clearTimeout(timeout);
            pc.removeEventListener("icegatheringstatechange", done);
            resolve();
          }
        };
        const timeout = window.setTimeout(() => {
          pc.removeEventListener("icegatheringstatechange", done);
          reject(new Error("Network setup timed out. Start live view again."));
        }, 10000);
        pc.addEventListener("icegatheringstatechange", done);
      });
      if (run !== generation.current) return;
      const result = await request<Session>("/ring/live", {
        method: "POST",
        body: JSON.stringify({
          deviceId,
          componentId,
          offer: pc.localDescription!.sdp,
        }),
      });
      if (run !== generation.current) {
        await request("/ring/live/close", {
          method: "POST",
          body: JSON.stringify({ ticket: result.ticket }),
        });
        return;
      }
      session.current = result;
      setRemaining(result.viewSeconds);
      await pc.setRemoteDescription({ type: "answer", sdp: result.answer });
      if (run !== generation.current) return;
      setPhase(recorder.current ? "recording" : "live");
    } catch (error) {
      if (run === generation.current) {
        setError(
          error instanceof Error ? error.message : "Live view could not start.",
        );
        await close().catch(() => {});
        setPhase("idle");
      }
    }
  };
  const record = () => {
    const stream = video.current?.srcObject as MediaStream | null,
      active = session.current;
    setError("");
    if (!stream || !video.current?.videoWidth || !active) {
      setError("Wait for the video to appear before recording.");
      return;
    }
    const mime = ["video/webm;codecs=vp8", "video/webm", "video/mp4"].find(
      (m) =>
        typeof MediaRecorder !== "undefined" &&
        MediaRecorder.isTypeSupported(m),
    );
    if (!mime) {
      setError("Recording is unavailable in this browser. Try Chrome or Edge.");
      return;
    }
    const run = generation.current,
      chunks: Blob[] = [];
    discard.current = false;
    let captureTimer: number | undefined;
    try {
      const rec = new MediaRecorder(stream, {
        mimeType: mime,
        videoBitsPerSecond: 1_500_000,
      });
      recorder.current = rec;
      let bytes = 0,
        elapsed = 0;
      const timer = (captureTimer = window.setInterval(() => {
        elapsed++;
        setRecorded(elapsed);
        if (elapsed >= 12 && rec.state === "recording") rec.stop();
      }, 1000));
      rec.ondataavailable = (event) => {
        if (event.data.size) {
          chunks.push(event.data);
          bytes += event.data.size;
        }
        if (bytes > 4 * 1024 * 1024 && rec.state === "recording") {
          discard.current = true;
          rec.stop();
          setError(
            "This recording exceeded 4 MB. Try another short live view.",
          );
          setPhase("live");
        }
      };
      rec.onerror = () => {
        discard.current = true;
        window.clearInterval(timer);
        recorder.current = null;
        setPhase("live");
        setError("The browser could not record this stream.");
      };
      rec.onstop = async () => {
        window.clearInterval(timer);
        if (discard.current || run !== generation.current) return;
        setPhase("saving");
        try {
          const body = new FormData();
          body.append("ticket", active.ticket);
          body.append(
            "file",
            new Blob(chunks, { type: mime }),
            mime.includes("webm") ? "ring-live.webm" : "ring-live.mp4",
          );
          const d = await request<Delivery>("/ring/live/capture", {
            method: "POST",
            body,
          });
          if (run !== generation.current) return;
          await close().catch(() => {});
          await onSaved(d);
          setPhase("idle");
        } catch (error) {
          setError(
            error instanceof Error
              ? error.message
              : "The clip could not be saved.",
          );
          await close().catch(() => {});
          setPhase("idle");
        }
      };
      rec.start(500);
      setRecorded(0);
      setPhase("recording");
    } catch {
      window.clearInterval(captureTimer);
      recorder.current = null;
      setPhase("live");
      setError("The browser could not start recording this stream.");
    }
  };
  return (
    <div className="ring-live">
      <div className="live-heading">
        <h3>Live view</h3>
        <span>
          {phase === "recording"
            ? `Recording · ${recorded}/12s`
            : phase === "saving"
              ? "Saving clip…"
              : remaining > 0 && session.current
                ? `${remaining}s remaining`
                : "Ring stream"}
        </span>
      </div>
      <div className="live-screen">
        <video
          ref={video}
          autoPlay
          playsInline
          muted
          onPlaying={() => {
            setMediaReady(true);
            if (phase === "live") setError("");
            if (autoCapture.current) {
              autoCapture.current = false;
              record();
            }
          }}
        />
        {phase === "idle" && (
          <div className="live-placeholder">
            <Camera size={28} />
            <span>Choose a Playground scene, then start live view.</span>
          </div>
        )}
        {phase === "connecting" && (
          <div className="live-placeholder">
            <Loader2 size={24} className="spin" />
            <span>Connecting to Ring…</span>
          </div>
        )}
      </div>
      {error && (
        <p className="live-error" role="alert">
          {error}
        </p>
      )}
      <div className="inline-actions">
        {phase === "idle" ? (
          <>
            <button
              className="button primary"
              disabled={disabled || !deviceId}
              onClick={() => void start()}
            >
              <Play size={15} /> Start live view
            </button>
            <button
              className="button primary"
              disabled={disabled || !deviceId}
              onClick={() => void start(true)}
            >
              <Camera size={15} /> Capture 12-second clip
            </button>
          </>
        ) : (
          <button
            className="button"
            disabled={phase === "saving"}
            onClick={() => {
              void close().catch((e) => setError(e.message));
              setPhase("idle");
              setRemaining(0);
            }}
          >
            <Square size={14} />{" "}
            {phase === "recording" ? "Cancel recording" : "Close live view"}
          </button>
        )}
        {phase === "live" && (
          <button
            className="button primary"
            disabled={remaining < 13 || !mediaReady}
            onClick={record}
          >
            <Camera size={15} /> Save 12-second clip
          </button>
        )}
      </div>
      <p className="subtle-copy">
        Saved clips are browser recordings of Ring live view. Analysis starts
        only when you choose Analyze clip.
      </p>
    </div>
  );
}
