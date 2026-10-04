export function registerPWA() {
  if (
    (window.desktop && !window.desktop.web) ||
    !("serviceWorker" in navigator) ||
    !import.meta.env.PROD
  )
    return;
  // Updates install in the background and activate after the lesson is closed,
  // never replacing code or reloading a recording in the middle of teaching.
  window.addEventListener("load", () => {
    void navigator.serviceWorker
      .register("./sw.js", { updateViaCache: "none" })
      .then((registration) => {
        const check = () => {
          if (document.visibilityState === "visible")
            void registration.update().catch(() => {});
        };
        document.addEventListener("visibilitychange", check);
        setInterval(check, 15 * 60 * 1000);
      })
      .catch(() => {});
  });
  if (
    matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone
  )
    void navigator.storage?.persist?.().catch(() => {});
  const resize = () =>
    document.documentElement.style.setProperty(
      "--usable-height",
      `${window.visualViewport?.height || window.innerHeight}px`,
    );
  window.visualViewport?.addEventListener("resize", resize);
  resize();
}
