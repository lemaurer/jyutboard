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
  let baseline = Math.max(
    innerHeight,
    document.documentElement.clientHeight,
    vv?.height || 0,
  );
  const settleTimers = new Set<ReturnType<typeof setTimeout>>();
  const update = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const height = vv?.height || innerHeight;
      baseline = Math.max(
        baseline,
        innerHeight,
        document.documentElement.clientHeight,
        height,
      );
      const open = height < baseline - 120;
      const style = document.documentElement.style;
      style.setProperty("--usable-height", `${height}px`);
      style.setProperty("--usable-width", `${vv?.width || innerWidth}px`);
      // Safari can retain an obsolete offset even after the keyboard has closed.
      style.setProperty("--viewport-top", `${open ? vv?.offsetTop || 0 : 0}px`);
      style.setProperty(
        "--viewport-left",
        `${open ? vv?.offsetLeft || 0 : 0}px`,
      );
      document.documentElement.classList.toggle("keyboard-open", open);
      if (!open) {
        if (scrollX || scrollY) window.scrollTo(0, 0);
        if (document.scrollingElement) document.scrollingElement.scrollTop = 0;
        document.body.scrollTop = 0;
      }
      if (!open) return;
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
  const settle = () => {
    for (const timer of settleTimers) clearTimeout(timer);
    settleTimers.clear();
    update();
    for (const delay of [120, 350, 650]) {
      const timer = setTimeout(() => {
        settleTimers.delete(timer);
        update();
      }, delay);
      settleTimers.add(timer);
    }
  };
  const rotate = () => {
    baseline = Math.max(innerHeight, vv?.height || 0);
    settle();
  };
  vv?.addEventListener("resize", update);
  vv?.addEventListener("scroll", update);
  window.addEventListener("resize", update);
  window.addEventListener("scroll", update, { passive: true });
  window.addEventListener("orientationchange", rotate);
  document.addEventListener("focusin", settle);
  document.addEventListener("focusout", settle);
  update();
}
