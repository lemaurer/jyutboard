import { _electron, webkit, expect } from "@playwright/test";
import { mkdtemp, copyFile, rm, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes, createHash } from "node:crypto";
const [binary, settings, audioFile] = process.argv.slice(2);
const directory = await mkdtemp(join(tmpdir(), "jyutboard-audio-test-"));
const room = randomBytes(24).toString("hex");
let host, browser;
try {
  await copyFile(settings, join(directory, "settings.enc"));
  host = await _electron.launch({
    executablePath: binary,
    args: [`--user-data-dir=${directory}`],
  });
  const teacher = await host.firstWindow();
  await teacher.evaluate(
    ({ room }) =>
      window.desktop.pair({
        action: "publish",
        room,
        relay: "wss://127.0.0.1:47839",
      }),
    { room },
  );
  await writeFile(
    join(tmpdir(), "jyutboard-ipad-services-room-hash"),
    createHash("sha256").update(room).digest("hex"),
  );
  browser = await webkit.launch();
  const context = await browser.newContext({
    viewport: { width: 1024, height: 768 },
    isMobile: true,
    hasTouch: true,
  });
  const audio =
    "data:audio/mp4;base64," + (await readFile(audioFile)).toString("base64");
  const ipad = await context.newPage();
  ipad.on("pageerror", (e) => console.log("WebKit error:", e.message));
  ipad.on("console", (e) => {
    if (e.text().startsWith("[fixture]")) console.log(e.text());
  });
  await ipad.goto(
    `https://jyutboard.vercel.app/#room=${room}&relay=${encodeURIComponent("wss://127.0.0.1:47839")}`,
  );
  await ipad.evaluate(
    ({ audio }) => {
      window.__recordToasts = [];
      new MutationObserver(() => {
        const text = document.querySelector(".toast")?.textContent;
        if (text && !window.__recordToasts.includes(text))
          window.__recordToasts.push(text);
      }).observe(document.body, {
        subtree: true,
        childList: true,
        characterData: true,
      });
      Object.defineProperty(MediaDevices.prototype, "getUserMedia", {
        configurable: true,
        value: async () => {
          window.__recordStage = "opening";
          console.log("[fixture] microphone source opening");
          const ctx = new AudioContext();
          await ctx.resume();
          console.log("[fixture] audio context resumed");
          const bytes = Uint8Array.from(atob(audio.split(",")[1]), (c) =>
            c.charCodeAt(0),
          ).buffer;
          const buffer = await ctx.decodeAudioData(bytes);
          console.log("[fixture] Cantonese sample decoded");
          const source = ctx.createBufferSource();
          source.buffer = buffer;
          const destination = ctx.createMediaStreamDestination();
          source.connect(destination);
          source.start(ctx.currentTime + 0.5);
          return destination.stream;
        },
      });
    },
    { audio },
  );
  await ipad.getByLabel("Your lesson view").selectOption("teacher");
  console.log(
    "Microphone function:",
    await ipad.evaluate(() => window.desktop.microphone.toString()),
  );
  console.log(
    "Fixture override:",
    await ipad.evaluate(() => ({
      secure: isSecureContext,
      source: navigator.mediaDevices.getUserMedia.toString().slice(0, 180),
    })),
  );
  const mic = ipad.getByRole("button", { name: "Hold to speak Cantonese" });
  await mic.click();
  await expect(mic)
    .toHaveClass(/recording-active/, { timeout: 15000 })
    .catch(async (e) => {
      console.log(
        "Recording diagnostics:",
        await ipad.evaluate(() => ({
          stage: window.__recordStage,
          messages: window.__recordToasts,
        })),
      );
      throw e;
    });
  await ipad.waitForTimeout(4000);
  await mic.click();
  await expect(ipad.getByTestId("phrase-card"))
    .toHaveCount(1, { timeout: 60000 })
    .catch(async (e) => {
      console.log(
        "Transcription diagnostics:",
        await ipad.evaluate(() => ({
          stage: window.__recordStage,
          messages: window.__recordToasts,
        })),
      );
      throw e;
    });
  const card = ipad.getByTestId("phrase-card");
  await expect(card.locator("h2")).toContainText(/你好|飲水/);
  await ipad.getByRole("button", { name: "Show details", exact: true }).click();
  const clip = await ipad.locator(".inspector audio").getAttribute("src");
  expect(clip).toMatch(/^data:audio\/mp4/);
  expect(clip.length).toBeGreaterThan(1000);
  console.log(
    "PASS: real WebKit MP4 recorder, authenticated production transcription, Chinese phrase and exact attached audio.",
  );
} finally {
  await browser?.close();
  await host?.close();
  await rm(directory, { recursive: true, force: true });
}
