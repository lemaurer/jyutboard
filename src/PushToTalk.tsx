import { useEffect, useRef, useState } from "react";
import { Mic } from "lucide-react";
import { MAX_AUDIO } from "./model";
export function PushToTalk({
  onPhrase,
  notify,
}: {
  onPhrase: (text: string, audio: string) => void;
  notify: (text: string) => void;
}) {
  const [state, setState] = useState("idle");
  const [saved, setSaved] = useState("");
  const held = useRef(false),
    recorder = useRef<MediaRecorder | null>(null),
    stream = useRef<MediaStream | null>(null),
    mounted = useRef(true),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      held.current = false;
      clearTimeout(timer.current);
      recorder.current?.state === "recording" && recorder.current.stop();
      stream.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);
  async function transcribe(audio: string) {
    setSaved(audio);
    setState("transcribing");
    try {
      if (!window.desktop)
        throw Error("Open the desktop app for push-to-talk.");
      const { transcript } = await window.desktop.transcribe(audio);
      if (mounted.current) {
        onPhrase(transcript, audio);
        setSaved("");
      }
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e));
    } finally {
      if (mounted.current) setState("idle");
    }
  }
  async function start() {
    if (state !== "idle") return;
    held.current = true;
    setState("starting");
    try {
      if (window.desktop && !(await window.desktop.microphone()))
        throw Error("Allow microphone access in macOS or Windows settings.");
      const media = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      if (!held.current || !mounted.current) {
        media.getTracks().forEach((t) => t.stop());
        if (mounted.current) setState("idle");
        return;
      }
      stream.current = media;
      const mime = ["audio/webm;codecs=opus", "audio/mp4"].find((m) =>
        MediaRecorder.isTypeSupported(m),
      );
      const r = new MediaRecorder(
        media,
        mime ? { mimeType: mime, audioBitsPerSecond: 48000 } : undefined,
      );
      recorder.current = r;
      const chunks: Blob[] = [];
      r.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      r.onstop = () => {
        clearTimeout(timer.current);
        media.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: r.mimeType });
        if (!mounted.current) return;
        if (blob.size < 100 || blob.size > MAX_AUDIO) {
          setState("idle");
          notify("Please record a short phrase (under 2 MB).");
          return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          if (mounted.current) void transcribe(String(reader.result));
        };
        reader.readAsDataURL(blob);
      };
      r.start();
      setState("recording");
      timer.current = setTimeout(stop, 60000);
    } catch (e) {
      held.current = false;
      setState("idle");
      notify(e instanceof Error ? e.message : String(e));
    }
  }
  function stop() {
    held.current = false;
    if (recorder.current?.state === "recording") recorder.current.stop();
  }
  return (
    <div className="push-to-talk">
      <button
        type="button"
        aria-label="Hold to speak Cantonese"
        className={state === "recording" ? "recording-active" : ""}
        disabled={state === "transcribing"}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          void start();
        }}
        onPointerUp={stop}
        onPointerCancel={stop}
        onKeyDown={(e) => {
          if ((e.key === " " || e.key === "Enter") && !e.repeat) {
            e.preventDefault();
            void start();
          }
        }}
        onKeyUp={(e) => {
          if (e.key === " " || e.key === "Enter") {
            e.preventDefault();
            stop();
          }
        }}
      >
        <Mic size={17} />
        {state === "recording"
          ? "Release to create"
          : state === "transcribing"
            ? "Transcribing…"
            : state === "starting"
              ? "Opening mic…"
              : "Hold to speak"}
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
