import { useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import { MAX_AUDIO } from "./model";
import { recordingMime, settledRecording } from "./recording";
type Phase = "idle" | "starting" | "recording" | "transcribing";
export function PushToTalk({
  onPhrase,
  notify,
}: {
  onPhrase: (text: string, audio: string) => void;
  notify: (text: string) => void;
}) {
  const [state, setState] = useState<Phase>("idle"),
    [saved, setSaved] = useState("");
  const phase = useRef<Phase>("idle"),
    recorder = useRef<MediaRecorder | null>(null),
    stream = useRef<MediaStream | null>(null),
    mounted = useRef(true),
    pressedAt = useRef(0),
    recordedAt = useRef(0),
    cancelled = useRef(false),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  function update(value: Phase) {
    phase.current = value;
    if (mounted.current) setState(value);
  }
  function stop() {
    if (recorder.current?.state === "recording") {
      update("transcribing");
      recorder.current.stop();
    }
  }
  useEffect(() => {
    mounted.current = true;
    const onHide = () => {
      if (document.visibilityState === "hidden") stop();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      mounted.current = false;
      cancelled.current = true;
      clearTimeout(timer.current);
      if (recorder.current?.state === "recording") recorder.current.stop();
      stream.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);
  async function transcribe(audio: string) {
    setSaved(audio);
    update("transcribing");
    try {
      if (!window.desktop)
        throw Error("Open the desktop app for speech capture.");
      const { transcript } = await window.desktop.transcribe(audio);
      if (!transcript?.trim())
        throw Error(
          "No speech was detected. Try again or keep the recording and type the phrase.",
        );
      if (mounted.current) {
        onPhrase(transcript.trim(), audio);
        setSaved("");
      }
    } catch (e) {
      if (mounted.current) notify(e instanceof Error ? e.message : String(e));
    } finally {
      if (mounted.current) update("idle");
    }
  }
  async function start() {
    if (phase.current !== "idle") return;
    cancelled.current = false;
    update("starting");
    try {
      if (window.desktop && !(await window.desktop.microphone()))
        throw Error(
          "Microphone access is blocked. Allow JyutBoard in your system's microphone settings.",
        );
      const media = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: false,
      });
      if (!mounted.current || cancelled.current) {
        media.getTracks().forEach((t) => t.stop());
        if (mounted.current) update("idle");
        return;
      }
      stream.current = media;
      if (
        !navigator.mediaDevices?.getUserMedia ||
        typeof MediaRecorder === "undefined"
      )
        throw Error("Open JyutBoard in Safari over HTTPS to record a phrase.");
      const mime = recordingMime((m) => MediaRecorder.isTypeSupported(m));
      const r = new MediaRecorder(
        media,
        mime ? { mimeType: mime, audioBitsPerSecond: 64000 } : undefined,
      );
      recorder.current = r;
      const chunks: Blob[] = [];
      let size = 0,
        failed = false;
      r.ondataavailable = (e) => {
        if (e.data.size) {
          chunks.push(e.data);
          size += e.data.size;
          if (size > MAX_AUDIO && r.state === "recording") r.stop();
        }
      };
      r.onerror = () => {
        failed = true;
        clearTimeout(timer.current);
        media.getTracks().forEach((t) => t.stop());
        if (mounted.current) {
          update("idle");
          notify("Recording failed. Check your microphone and try again.");
        }
      };
      r.onstop = async () => {
        clearTimeout(timer.current);
        media.getTracks().forEach((t) => t.stop());
        recorder.current = null;
        if (!mounted.current || failed) return;
        const blob = await settledRecording(chunks, r.mimeType || mime || "");
        if (!mounted.current) return;
        if (blob.size < 100 || blob.size > MAX_AUDIO) {
          update("idle");
          notify(
            blob.size < 100
              ? "No audio was captured. Click the microphone, speak, then click to stop."
              : "Keep phrases under 60 seconds / 2 MB.",
          );
          return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          if (mounted.current) void transcribe(String(reader.result));
        };
        reader.onerror = () => {
          update("idle");
          notify("The recording could not be read. Please retry.");
        };
        reader.readAsDataURL(blob);
      };
      r.start();
      recordedAt.current = Date.now();
      update("recording");
      timer.current = setTimeout(stop, 60000);
    } catch (e) {
      stream.current?.getTracks().forEach((t) => t.stop());
      if (mounted.current) {
        update("idle");
        notify(e instanceof Error ? e.message : String(e));
      }
    }
  }
  function press() {
    pressedAt.current = Date.now();
    if (phase.current === "recording") {
      pressedAt.current = 0;
      stop();
    } else if (phase.current === "idle") void start();
  }
  function release() {
    // A quick click, or release during the permission prompt, keeps recording until the next click.
    if (
      pressedAt.current &&
      phase.current === "recording" &&
      Date.now() - Math.max(pressedAt.current, recordedAt.current) >= 350
    )
      stop();
    pressedAt.current = 0;
  }
  return (
    <div className="push-to-talk">
      <button
        type="button"
        aria-label="Hold to speak Cantonese"
        title="Hold while speaking, or click to start and click again to stop"
        className={state === "recording" ? "recording-active" : ""}
        disabled={state === "transcribing"}
        onPointerDown={(e) => {
          e.preventDefault();
          (document.activeElement as HTMLElement | null)?.blur();
          e.currentTarget.setPointerCapture(e.pointerId);
          press();
        }}
        onPointerUp={release}
        onPointerCancel={() => {
          // Permission sheets can cancel the initiating touch on iPad. Keep the
          // microphone opening; a tap or a held release will stop the recording.
          pressedAt.current = 0;
          if (phase.current === "recording") stop();
        }}
        onKeyDown={(e) => {
          if ((e.key === " " || e.key === "Enter") && !e.repeat) {
            e.preventDefault();
            press();
          }
          if (e.key === "Escape") {
            cancelled.current = true;
            stop();
          }
        }}
        onKeyUp={(e) => {
          if (e.key === " " || e.key === "Enter") {
            e.preventDefault();
            release();
          }
        }}
      >
        {state === "recording" ? <Square size={15} /> : <Mic size={17} />}
        {state === "recording"
          ? "Recording · click to stop"
          : state === "transcribing"
            ? "Transcribing…"
            : state === "starting"
              ? "Opening mic…"
              : "Speak"}
      </button>
      {saved && state === "idle" && (
        <>
          <button type="button" onClick={() => void transcribe(saved)}>
            Retry transcript
          </button>
          <button
            type="button"
            onClick={() => {
              onPhrase("", saved);
              setSaved("");
            }}
          >
            Keep recording & type
          </button>
        </>
      )}
    </div>
  );
}
