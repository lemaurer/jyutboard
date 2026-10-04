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
}
/** Safari's keyboard changes both the visual viewport size and its origin. */
export function installTabletViewport() {
  if (!window.desktop?.web) return;
  const vv = window.visualViewport;
  let frame = 0;
  const update = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const style = document.documentElement.style;
      style.setProperty("--usable-height", `${vv?.height || innerHeight}px`);
      style.setProperty("--usable-width", `${vv?.width || innerWidth}px`);
      style.setProperty("--viewport-top", `${vv?.offsetTop || 0}px`);
      style.setProperty("--viewport-left", `${vv?.offsetLeft || 0}px`);
      document.documentElement.classList.toggle(
        "keyboard-open",
        (vv?.height || innerHeight) < innerHeight - 120,
      );
      requestAnimationFrame(() => {
        const input = document.activeElement as HTMLElement | null;
        const canvas = document.querySelector<HTMLElement>(".canvas-viewport");
        if (!input?.matches("input,textarea") || !canvas?.contains(input))
          return;
        const box = input.getBoundingClientRect(),
          area = canvas.getBoundingClientRect();
        if (box.bottom > area.bottom - 16)
          canvas.scrollTop += box.bottom - area.bottom + 16;
        else if (box.top < area.top + 16)
          canvas.scrollTop += box.top - area.top - 16;
      });
    });
  };
  vv?.addEventListener("resize", update);
  vv?.addEventListener("scroll", update);
  window.addEventListener("resize", update);
  document.addEventListener("focusin", update);
  document.addEventListener("focusout", update);
  update();
}
