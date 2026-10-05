import { useEffect, useState } from "react";
import type { UpdateState } from "./updateState";
export function UpdateControls({
  compact = false,
  live = false,
  notify,
}: {
  compact?: boolean;
  live?: boolean;
  notify: (text: string) => void;
}) {
  const [state, setState] = useState<UpdateState>();
  const updates = window.desktop?.updates;
  useEffect(() => {
    if (!updates) return;
    const poll = () =>
      void updates
        .get()
        .then(setState)
        .catch(() => {});
    poll();
    const timer = setInterval(poll, 3000);
    return () => clearInterval(timer);
  }, [updates]);
  if (!updates || !state) return null;
  const restart = () =>
    void updates
      .install()
      .catch((e) => notify(e instanceof Error ? e.message : String(e)));
  if (compact)
    return state.phase === "ready" ? (
      <button
        className="update-ready"
        disabled={live}
        title={
          live
            ? "Finish your live lesson before restarting"
            : "Your lessons are kept"
        }
        onClick={restart}
      >
        Restart to update
      </button>
    ) : null;
  return (
    <section className="update-settings">
      <div className="row spread">
        <strong>JyutBoard {state.version}</strong>
        <a
          href="https://github.com/lemaurer/jyutboard/releases/latest"
          target="_blank"
          rel="noreferrer"
        >
          Downloads
        </a>
      </div>
      <label className="check">
        <input
          type="checkbox"
          checked={state.enabled}
          onChange={(e) =>
            void updates
              .enabled(e.target.checked)
              .then(setState)
              .catch((e) => notify(String(e)))
          }
        />
        Download updates automatically
      </label>
      <small>
        {state.phase === "ready"
          ? `Version ${state.available} is ready. It installs when you quit; your lessons and settings stay.`
          : state.phase === "downloading"
            ? `Downloading ${state.available} · ${state.progress || 0}%`
            : state.phase === "checking"
              ? "Checking for updates…"
              : state.phase === "error"
                ? state.error
                : state.phase === "development"
                  ? "Updates are available in the installed desktop app."
                  : "Updates are checked automatically. Your live lesson is never interrupted."}
      </small>
      <div className="row">
        <button
          disabled={[
            "checking",
            "downloading",
            "installing",
            "development",
          ].includes(state.phase)}
          onClick={() => void updates.check().then(setState)}
        >
          Check for updates
        </button>
        {state.phase === "ready" && (
          <button
            className="primary"
            disabled={live}
            title={
              live ? "Finish your live lesson before restarting" : undefined
            }
            onClick={restart}
          >
            Restart to update
          </button>
        )}
      </div>
    </section>
  );
}
