import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { UpdateControls } from "./UpdateControls";
export function Settings({
  close,
  live = false,
  notify,
  online,
  setOnline,
  vocabularyMessage,
  panSpeed,
  zoomSpeed,
  setPanSpeed,
  setZoomSpeed,
  resetNavigation,
}: {
  close: () => void;
  live?: boolean;
  notify: (text: string) => void;
  online: boolean;
  setOnline: (value: boolean) => void;
  vocabularyMessage: string;
  panSpeed: number;
  zoomSpeed: number;
  setPanSpeed: (value: number) => void;
  setZoomSpeed: (value: number) => void;
  resetNavigation: () => void;
}) {
  const [url, setUrl] = useState(
    "https://jyutdeck-live-jul08f.vercel.app/api/v1/requests",
  );
  const [token, setToken] = useState("");
  const [google, setGoogle] = useState("");
  const [hasToken, setHasToken] = useState(false);
  const [hasGoogle, setHasGoogle] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    window.desktop
      ?.getSettings?.()
      .then((s) => {
        setUrl(s.queueUrl);
        setHasToken(s.hasQueueToken);
        setHasGoogle(s.hasGoogleKey);
      })
      .catch((e) => notify(String(e)));
  }, []);
  async function save() {
    if (!window.desktop) {
      notify("Open the desktop app to configure API credentials.");
      return;
    }
    setBusy(true);
    try {
      await window.desktop.saveSettings({
        queueUrl: url,
        queueToken: token,
        googleKey: google,
      });
      notify("Settings saved securely on this device.");
      close();
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="overlay" onClick={close}>
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="section-head">
          <h2>Your teaching desk</h2>
          <button aria-label="Close settings" onClick={close}>
            <X size={18} />
          </button>
        </div>
        <UpdateControls live={live} notify={notify} />
        <hr />
        <fieldset className="navigation-settings">
          <legend>Canvas movement</legend>
          <label>
            Pan speed <output>{panSpeed.toFixed(2).replace(/0$/, "")}×</output>
            <input
              aria-label="Pan speed"
              type="range"
              min="0.5"
              max="3"
              step="0.25"
              value={panSpeed}
              onChange={(event) => setPanSpeed(Number(event.target.value))}
            />
          </label>
          <label>
            Zoom speed{" "}
            <output>{zoomSpeed.toFixed(2).replace(/0$/, "")}×</output>
            <input
              aria-label="Zoom speed"
              type="range"
              min="0.5"
              max="3"
              step="0.25"
              value={zoomSpeed}
              onChange={(event) => setZoomSpeed(Number(event.target.value))}
            />
          </label>
          <small>
            Pan speed adjusts trackpad and mouse-wheel scrolling. Direct
            dragging stays under your finger or pointer. Changes are saved
            immediately on this device.
          </small>
          <button onClick={resetNavigation}>Reset movement speeds</button>
        </fieldset>
        <hr />
        <p>
          Preferences belong to this device. Credentials never enter the shared
          lesson.
        </p>
        <label className="check">
          <input
            type="checkbox"
            checked={online}
            onChange={(e) => setOnline(e.target.checked)}
          />{" "}
          Automatically translate phrases with Google
        </label>
        <small>
          New phrases are sent to Google for English translation. Offline mode
          keeps dictionary meanings and Jyutping. The free translation endpoint
          is best effort; add a Cloud key for the supported service.
        </small>
        <hr />
        <small>
          {vocabularyMessage}. Green: recorded / known in JyutDeck. Amber: in
          queue. Pink: new. Grey: not checked. Status colours use JyutDeck data,
          not local guesses.
        </small>
        <hr />
        {!window.desktop?.web && (
          <>
            <label>
              JyutDeck request endpoint
              <input value={url} onChange={(e) => setUrl(e.target.value)} />
            </label>
            <label>
              JyutDeck request token {hasToken ? "· saved" : ""}
              <input
                autoComplete="off"
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder={
                  hasToken
                    ? "Leave blank to keep saved token"
                    : "NATASHA_REQUEST_API_TOKEN"
                }
              />
            </label>
            <small>
              Use the external request token, not the website login code.
              Phrases enter Natasha’s approval queue. Lesson audio stays here
              because the API does not accept recordings.
            </small>
            <label>
              Google Cloud Translation key (optional){" "}
              {hasGoogle ? "· saved" : ""}
              <input
                autoComplete="off"
                type="password"
                value={google}
                onChange={(e) => setGoogle(e.target.value)}
                placeholder="Leave blank to use free translation"
              />
            </label>
            <div className="row spread">
              <button
                onClick={() => {
                  void window.desktop?.clearSettings().then(() => {
                    setHasToken(false);
                    setHasGoogle(false);
                    notify("Saved credentials removed.");
                  });
                }}
              >
                Clear saved credentials
              </button>
              <button
                className="primary"
                disabled={busy || !window.desktop}
                onClick={() => void save()}
              >
                {busy ? "Saving…" : "Save settings"}
              </button>
            </div>
          </>
        )}
        {window.desktop?.web && (
          <p>
            Connect to your partner’s lesson to use vocabulary, push-to-talk and
            the JyutDeck queue. No API credentials are needed on this device.
          </p>
        )}
      </section>
    </div>
  );
}
